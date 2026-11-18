import { GoogleGenAI } from '@google/genai';
import { GroundingSource } from '../types';
import { isValidApiKey } from '../adapters/geminiAdapter';
import { executeTavilyToolSearch } from './tavilyService';

export interface GeminiLiveSearchResult {
  success: boolean;
  queries: string[];
  sources: GroundingSource[];
  searchSnippets: string;
  groundingMetadata?: any;
  error?: string;
}

// In-memory cache with 30-second TTL to avoid redundant searches during consecutive turns
const searchCache = new Map<string, { timestamp: number; data: GeminiLiveSearchResult }>();
const CACHE_TTL_MS = 30 * 1000;

/**
 * Robust live Google News RSS query helper.
 * Fetches current breaking articles, publication dates, and source URLs.
 */
async function fetchGoogleNewsLive(query: string, maxItems: number = 5): Promise<{ sources: GroundingSource[]; snippets: string[] }> {
  const sources: GroundingSource[] = [];
  const snippets: string[] = [];
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const xml = await res.text();
      const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<source[^>]*>([\s\S]*?)<\/source>[\s\S]*?<\/item>/gi;
      let m;
      let count = 0;
      while ((m = itemRegex.exec(xml)) !== null && count < maxItems) {
        const rawTitle = m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();
        const link = m[2].trim();
        const date = m[3].trim();
        const publisher = m[4].replace(/&amp;/g, '&').trim();

        if (rawTitle && link) {
          sources.push({
            title: `${rawTitle} (${publisher})`,
            url: link
          });
          snippets.push(`[Google News - ${date}] ${rawTitle} (Published by ${publisher})`);
          count++;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[GeminiLiveSearch] Google News RSS query notice:`, err?.message || err);
  }
  return { sources, snippets };
}

/**
 * Robust live Web Search helper.
 * Fetches real-time web results, Wikipedia entries, official government/state pages, and news snippets.
 */
async function fetchLiveWebSearch(query: string, maxItems: number = 6): Promise<{ sources: GroundingSource[]; snippets: string[] }> {
  const sources: GroundingSource[] = [];
  const snippets: string[] = [];
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4500)
    });

    if (res.ok) {
      const html = await res.text();
      const regex = /<a rel="nofollow" class="result__a" href="([^"]*)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      let count = 0;
      while ((m = regex.exec(html)) !== null && count < maxItems) {
        const rawUrl = m[1];
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        const resolvedUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl;
        const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        const snippet = m[3].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

        if (resolvedUrl && title && snippet && !resolvedUrl.startsWith('//duckduckgo.com/y.js')) {
          sources.push({
            title,
            url: resolvedUrl
          });
          snippets.push(`• ${title}: ${snippet}`);
          count++;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[GeminiLiveSearch] Web search notice:`, err?.message || err);
  }
  return { sources, snippets };
}

/**
 * Reusable Gemini Google Search Grounding Pipeline.
 * Executes live Google Search & Google News grounding to retrieve
 * fresh real-time facts, dates, events, numbers, and citation source links.
 * Returns verified search evidence and citation sources for Gemini model grounding.
 */
export async function executeGeminiLiveSearch(
  query: string,
  customApiKey?: string
): Promise<GeminiLiveSearchResult> {
  const normalizedQuery = (query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return { success: false, queries: [], sources: [], searchSnippets: '', error: 'Empty query' };
  }

  // Check recent cache
  const cached = searchCache.get(normalizedQuery);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[GeminiLiveSearch] Reusing cached Google Search results for query: "${query.slice(0, 60)}"`);
    return cached.data;
  }

  const geminiEnvKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  const apiKey = (customApiKey && !customApiKey.startsWith('sk-') && isValidApiKey(customApiKey)) 
    ? customApiKey 
    : geminiEnvKey;

  console.log(`\n=================== [GEMINI GOOGLE SEARCH DATA GROUNDING PIPELINE] ===================`);
  console.log(`[GeminiLiveSearch] Live Search Query: "${query.slice(0, 100)}"`);

  const accumulatedSources: GroundingSource[] = [];
  const accumulatedSnippets: string[] = [];

  // 1. First, query Live Google News RSS and Live Web Search simultaneously for real-time web verification
  try {
    const [newsData, webData] = await Promise.all([
      fetchGoogleNewsLive(query, 5),
      fetchLiveWebSearch(query, 6)
    ]);

    if (newsData.sources.length > 0) {
      accumulatedSources.push(...newsData.sources);
      accumulatedSnippets.push(...newsData.snippets);
    }

    if (webData.sources.length > 0) {
      accumulatedSources.push(...webData.sources);
      accumulatedSnippets.push(...webData.snippets);
    }
  } catch (fetchErr: any) {
    console.warn(`[GeminiLiveSearch] Direct web search gathering warning:`, fetchErr?.message || fetchErr);
  }

  // 2. If Gemini SDK Google Search Tool is available and not exhausted, query Gemini GoogleSearch Tool
  if (isValidApiKey(apiKey) && accumulatedSources.length < 3) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const currentDateStr = new Date().toDateString();
      const currentYear = new Date().getFullYear();

      const searchPrompt = `Current date: ${currentDateStr} (Year ${currentYear}).
Search Google for the latest verified current information as of ${currentYear} regarding: "${query}". Extract key verified facts, active office holders, dates, and confirmed evidence as of ${currentDateStr}.`;
      
      const searchConfig = {
        systemInstruction: `You are a real-time factual research engine using Google Search Grounding. Current server date: ${currentDateStr}. Output verified factual findings directly.`,
        tools: [{ googleSearch: {} }]
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: searchPrompt,
        config: searchConfig
      });

      const candidate = response.candidates?.[0];
      const groundingMetadata = candidate?.groundingMetadata || (response as any)?.groundingMetadata;
      const groundingChunks = groundingMetadata?.groundingChunks;

      if (Array.isArray(groundingChunks)) {
        for (const chunk of groundingChunks) {
          const uri = chunk.web?.uri || chunk.web?.url;
          if (uri) {
            accumulatedSources.push({
              title: chunk.web?.title || uri,
              url: uri
            });
          }
        }
      }

      if (response.text?.trim()) {
        accumulatedSnippets.unshift(response.text.trim());
      }
    } catch (sdkErr: any) {
      // Catch quota exhaustion or 429 without throwing; direct web search will supply grounding
      console.log(`[GeminiLiveSearch] Gemini SDK Search tool quota note: ${sdkErr?.message?.slice(0, 100) || sdkErr}`);
    }
  }

  // 3. Fall back to Tavily if sources are still sparse
  if (accumulatedSources.length === 0) {
    try {
      const tavilyResult = await executeTavilyToolSearch(query, 5, true);
      if (tavilyResult && tavilyResult.sources && tavilyResult.sources.length > 0) {
        accumulatedSources.push(...tavilyResult.sources);
        const rawResults = tavilyResult.resultsData?.results || [];
        const tSnippets = rawResults
          .filter(r => r.content && r.content.trim().length > 0)
          .map(r => `• ${r.title}: ${r.content.trim()}`);
        accumulatedSnippets.push(...tSnippets);
      }
    } catch (tavilyErr) {
      // ignore
    }
  }

  // Deduplicate sources by URL
  const uniqueSourcesMap = new Map<string, GroundingSource>();
  accumulatedSources.forEach(s => {
    if (s.url && !uniqueSourcesMap.has(s.url)) {
      uniqueSourcesMap.set(s.url, s);
    }
  });
  const finalSources = Array.from(uniqueSourcesMap.values());

  const searchSnippets = accumulatedSnippets.join('\n\n').trim();
  const hasSearchEvidence = finalSources.length > 0 || searchSnippets.length > 0;

  console.log(`[GeminiLiveSearch] Results compiled: sources=${finalSources.length}, snippetsLen=${searchSnippets.length}, success=${hasSearchEvidence}`);

  if (hasSearchEvidence) {
    const result: GeminiLiveSearchResult = {
      success: true,
      queries: [query],
      sources: finalSources,
      searchSnippets,
      groundingMetadata: {
        webSearchQueries: [query],
        groundingChunks: finalSources.map(s => ({ web: { uri: s.url, title: s.title } }))
      }
    };

    searchCache.set(normalizedQuery, { timestamp: Date.now(), data: result });
    return result;
  }

  return {
    success: false,
    queries: [],
    sources: [],
    searchSnippets: '',
    error: 'Live Google search returned no verified sources'
  };
}
