import { tavily } from '@tavily/core';
import { GroundingSource } from '../types';
import { isValidTavilyKey } from './tavilyService';

export interface RawSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  raw?: any;
}

export interface TavilyApiResponseCapture {
  query?: string;
  answer?: string;
  responseTimeMs?: number;
  resultsCount?: number;
  results: RawSearchResultItem[];
  rawPayload?: any;
}

export interface GeminiGroundingInputCapture {
  model?: string;
  systemInstruction?: string;
  groundingPrompt?: string;
  injectedSnippets?: string[];
  rawSnippetsText?: string;
  toolsConfigured?: any[];
  searchQueriesExecuted?: string[];
  candidateChunksCount?: number;
  contextLengthChars?: number;
}

export interface SearchDiagnosticEntry {
  id: string;
  timestamp: number;
  isoDate: string;
  query: string;
  provider: 'tavily' | 'googleSearch' | 'hybrid' | 'webRss' | string;
  status: 'success' | 'partial' | 'failed' | 'simulated';
  executionTimeMs?: number;
  tavilyApiResponse: TavilyApiResponseCapture | null;
  geminiGroundingInput: GeminiGroundingInputCapture | null;
  rawMetadata: {
    titles: string[];
    snippets: string[];
    urls: string[];
    items: RawSearchResultItem[];
  };
  aiResponseText?: string;
  statusMessage?: string;
}

// In-memory circular buffer for diagnostic logs (keeps the latest 50 queries)
const MAX_LOG_ENTRIES = 50;
const diagnosticLogs: SearchDiagnosticEntry[] = [];

/**
 * Diagnostic log function in the backend search service.
 * Captures the full Tavily API response, raw search metadata,
 * and the subsequent Gemini grounding input.
 */
export function logSearchDiagnostics(params: {
  id?: string;
  query: string;
  provider?: string;
  status?: 'success' | 'partial' | 'failed' | 'simulated';
  executionTimeMs?: number;
  tavilyApiResponse?: TavilyApiResponseCapture | null;
  geminiGroundingInput?: GeminiGroundingInputCapture | null;
  rawMetadata?: {
    titles?: string[];
    snippets?: string[];
    urls?: string[];
    items?: RawSearchResultItem[];
  };
  aiResponseText?: string;
  statusMessage?: string;
}): SearchDiagnosticEntry {
  const id = params.id || `diag-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = Date.now();
  const isoDate = new Date(timestamp).toISOString();

  // Normalize raw items
  const items: RawSearchResultItem[] = params.rawMetadata?.items || 
    (params.tavilyApiResponse?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet || (r as any).content || '',
      score: r.score,
      raw: r.raw || r
    }));

  const titles = params.rawMetadata?.titles || items.map(i => i.title);
  const snippets = params.rawMetadata?.snippets || items.map(i => i.snippet);
  const urls = params.rawMetadata?.urls || items.map(i => i.url);

  const entry: SearchDiagnosticEntry = {
    id,
    timestamp,
    isoDate,
    query: params.query || '',
    provider: params.provider || (params.tavilyApiResponse ? 'tavily' : 'googleSearch'),
    status: params.status || (items.length > 0 ? 'success' : 'failed'),
    executionTimeMs: params.executionTimeMs ?? params.tavilyApiResponse?.responseTimeMs ?? 0,
    tavilyApiResponse: params.tavilyApiResponse || null,
    geminiGroundingInput: params.geminiGroundingInput || null,
    rawMetadata: {
      titles,
      snippets,
      urls,
      items
    },
    aiResponseText: params.aiResponseText,
    statusMessage: params.statusMessage
  };

  // Add to head of log array, capping at MAX_LOG_ENTRIES
  diagnosticLogs.unshift(entry);
  if (diagnosticLogs.length > MAX_LOG_ENTRIES) {
    diagnosticLogs.pop();
  }

  console.log(`\n=================== [SEARCH SERVICE DIAGNOSTIC LOG CAPTURED] ===================`);
  console.log(`[Diagnostic] ID: ${entry.id} | Timestamp: ${entry.isoDate}`);
  console.log(`[Diagnostic] Query: "${entry.query.slice(0, 100)}"`);
  console.log(`[Diagnostic] Provider: ${entry.provider} | Status: ${entry.status} | ExecutionTime: ${entry.executionTimeMs}ms`);
  console.log(`[Diagnostic] Raw Results Count: ${entry.rawMetadata.items.length}`);
  if (entry.tavilyApiResponse) {
    console.log(`[Diagnostic] Tavily Results Captured: ${entry.tavilyApiResponse.results.length}`);
  }
  if (entry.geminiGroundingInput) {
    console.log(`[Diagnostic] Subsequent Gemini Grounding Model: ${entry.geminiGroundingInput.model}`);
    console.log(`[Diagnostic] Gemini Injected Snippets: ${entry.geminiGroundingInput.injectedSnippets?.length || 0}`);
  }
  console.log(`=================================================================================\n`);

  return entry;
}

/**
 * Updates an existing diagnostic entry (e.g. to attach subsequent Gemini grounding input or AI response text)
 */
export function updateSearchDiagnostics(
  id: string,
  updates: Partial<SearchDiagnosticEntry>
): SearchDiagnosticEntry | null {
  const existing = diagnosticLogs.find(e => e.id === id);
  if (!existing) return null;

  if (updates.geminiGroundingInput) {
    existing.geminiGroundingInput = {
      ...(existing.geminiGroundingInput || {}),
      ...updates.geminiGroundingInput
    };
  }

  if (updates.aiResponseText !== undefined) {
    existing.aiResponseText = updates.aiResponseText;
  }

  if (updates.status !== undefined) {
    existing.status = updates.status;
  }

  if (updates.statusMessage !== undefined) {
    existing.statusMessage = updates.statusMessage;
  }

  if (updates.rawMetadata) {
    existing.rawMetadata = {
      ...existing.rawMetadata,
      ...updates.rawMetadata
    };
  }

  if (updates.tavilyApiResponse) {
    existing.tavilyApiResponse = updates.tavilyApiResponse;
  }

  return existing;
}

/**
 * Retrieves the latest search diagnostic, optionally matching a query substring
 */
export function getLatestSearchDiagnostic(queryFilter?: string): SearchDiagnosticEntry | null {
  if (!queryFilter) {
    return diagnosticLogs[0] || null;
  }
  const clean = queryFilter.trim().toLowerCase();
  return diagnosticLogs.find(e => e.query.toLowerCase().includes(clean)) || diagnosticLogs[0] || null;
}

/**
 * Retrieves all stored search diagnostic entries
 */
export function getAllSearchDiagnostics(limit: number = 20): SearchDiagnosticEntry[] {
  return diagnosticLogs.slice(0, limit);
}

/**
 * Retrieves a single diagnostic entry by its unique ID
 */
export function getSearchDiagnosticById(id: string): SearchDiagnosticEntry | null {
  return diagnosticLogs.find(e => e.id === id) || null;
}

/**
 * Clears the diagnostic log
 */
export function clearSearchDiagnostics(): void {
  diagnosticLogs.length = 0;
}

/**
 * Executes a full live Tavily search and records the diagnostic log capturing:
 * 1. The full raw Tavily API response
 * 2. The subsequent Gemini grounding input formulated from the search results
 */
export async function executeTavilyDiagnosticRun(
  query: string,
  options?: {
    customApiKey?: string;
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
    geminiModel?: string;
  }
): Promise<SearchDiagnosticEntry> {
  const startTime = Date.now();
  const apiKey = options?.customApiKey || process.env.TAVILY_API_KEY;
  const maxResults = options?.maxResults || 5;
  const geminiModel = options?.geminiModel || 'gemini-2.5-flash';

  if (!isValidTavilyKey(apiKey)) {
    // Generate notice diagnostic if key is unconfigured
    const entry = logSearchDiagnostics({
      query,
      provider: 'tavily',
      status: 'failed',
      executionTimeMs: Date.now() - startTime,
      statusMessage: 'TAVILY_API_KEY is not configured in server environment or request.',
      tavilyApiResponse: null,
      geminiGroundingInput: {
        model: geminiModel,
        systemInstruction: 'Live search grounding fallback. Native Google Search grounding will be utilized.',
        injectedSnippets: [],
        toolsConfigured: [{ googleSearch: {} }]
      },
      rawMetadata: {
        titles: [],
        snippets: [],
        urls: [],
        items: []
      }
    });
    return entry;
  }

  try {
    const client = tavily({ apiKey: apiKey! });
    const responseData = await client.search(query, {
      searchDepth: options?.searchDepth || 'basic',
      includeAnswer: options?.includeAnswer ?? true,
      maxResults
    });

    const elapsed = Date.now() - startTime;
    const rawResults = Array.isArray(responseData?.results) ? responseData.results : [];

    const items: RawSearchResultItem[] = rawResults.map((r: any) => ({
      title: r.title || 'Untitled Source',
      url: r.url || '',
      snippet: r.content || r.snippet || '',
      score: r.score,
      raw: r
    })).filter(r => Boolean(r.url && r.url.length > 0));

    // Formulate the subsequent Gemini grounding input from Tavily's live response
    const injectedSnippets = items.map((item, idx) => 
      `[Source ${idx + 1}] Title: ${item.title}\nURL: ${item.url}\nExcerpt: ${item.snippet}`
    );
    const rawSnippetsText = injectedSnippets.join('\n\n');

    const geminiGroundingInput: GeminiGroundingInputCapture = {
      model: geminiModel,
      systemInstruction: `You are GravityVerse Assistant. Current date: ${new Date().toDateString()}.
Use the verified live search evidence below to construct a comprehensive, factual response.`,
      groundingPrompt: `Live Search Grounding Evidence for "${query}":\n\n${rawSnippetsText}`,
      injectedSnippets,
      rawSnippetsText,
      toolsConfigured: [{ tavily_search: { query } }],
      searchQueriesExecuted: [query],
      candidateChunksCount: items.length,
      contextLengthChars: rawSnippetsText.length
    };

    const tavilyApiResponse: TavilyApiResponseCapture = {
      query: responseData.query || query,
      answer: responseData.answer ? String(responseData.answer) : undefined,
      responseTimeMs: elapsed,
      resultsCount: items.length,
      results: items,
      rawPayload: responseData
    };

    const entry = logSearchDiagnostics({
      query,
      provider: 'tavily',
      status: items.length > 0 ? 'success' : 'partial',
      executionTimeMs: elapsed,
      tavilyApiResponse,
      geminiGroundingInput,
      rawMetadata: {
        titles: items.map(i => i.title),
        snippets: items.map(i => i.snippet),
        urls: items.map(i => i.url),
        items
      }
    });

    return entry;
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    const errMsg = err?.message || String(err);
    return logSearchDiagnostics({
      query,
      provider: 'tavily',
      status: 'failed',
      executionTimeMs: elapsed,
      statusMessage: `Tavily API search error: ${errMsg}`,
      tavilyApiResponse: null,
      geminiGroundingInput: {
        model: geminiModel,
        injectedSnippets: [],
        toolsConfigured: [{ googleSearch: {} }]
      },
      rawMetadata: { titles: [], snippets: [], urls: [], items: [] }
    });
  }
}
