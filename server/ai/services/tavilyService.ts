import { tavily } from '@tavily/core';
import { GroundingSource } from '../types';
import { isFreshnessQuery } from '../utils/intentAnalyzer';

export interface TavilyResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilyToolSearchResult {
  query: string;
  answer?: string;
  results: TavilyResultItem[];
  sources: GroundingSource[];
}

// In-memory cache with distinct TTL for ordinary vs. freshness queries
const searchCache = new Map<string, { timestamp: number; data: TavilyToolSearchResult }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for ordinary non-time-sensitive queries
const FRESHNESS_CACHE_TTL_MS = 15 * 1000; // 15 seconds maximum for live/fresh queries

let tavilyToolQuotaExceededUntil = 0;

export function isValidTavilyKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim().toLowerCase();
  return k !== '' && 
         k !== 'undefined' && 
         k !== 'null' && 
         k !== 'placeholder' &&
         k !== 'your_tavily_api_key_here';
}

/**
 * Executes Tavily Web Search using official @tavily/core SDK for Tool Calling.
 * For fresh/time-sensitive queries (e.g. current CM, latest events, live data),
 * old 5-minute caches are bypassed or restricted to a tiny 15-second window.
 */
export async function executeTavilyToolSearch(
  query: string,
  maxResults: number = 5,
  bypassCache: boolean = false
): Promise<{ resultsData: TavilyToolSearchResult; sources: GroundingSource[] } | null> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!isValidTavilyKey(apiKey)) {
    return null;
  }

  if (Date.now() < tavilyToolQuotaExceededUntil) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const isTimeSensitive = isFreshnessQuery(query);
  const effectiveTtl = bypassCache ? 0 : (isTimeSensitive ? FRESHNESS_CACHE_TTL_MS : CACHE_TTL_MS);

  // Check cache only if TTL > 0
  if (effectiveTtl > 0) {
    const cached = searchCache.get(normalizedQuery);
    const now = Date.now();
    if (cached && (now - cached.timestamp < effectiveTtl)) {
      console.log(`[TavilyService Cache Hit] Returning cached search results for: "${query}" (TimeSensitive: ${isTimeSensitive})`);
      return {
        resultsData: cached.data,
        sources: cached.data.sources
      };
    }
  } else {
    console.log(`[TavilyService Live Search] Bypassing cache for fresh query: "${query}"`);
  }

  try {
    const client = tavily({ apiKey });
    const responseData = await client.search(query, {
      searchDepth: 'basic',
      includeAnswer: true,
      maxResults: maxResults || 5,
    });

    if (!responseData || !Array.isArray(responseData.results)) {
      return null;
    }

    const rawResults: TavilyResultItem[] = responseData.results.map((r: any) => ({
      title: r.title || 'Untitled Source',
      url: r.url || '',
      content: r.content || r.snippet || '',
      score: r.score
    })).filter((r: TavilyResultItem) => r.url.length > 0);

    const sources: GroundingSource[] = rawResults.map((r) => ({
      title: r.title,
      url: r.url
    }));

    const answer = responseData.answer ? String(responseData.answer).trim() : undefined;

    const resultsData: TavilyToolSearchResult = {
      query,
      answer,
      results: rawResults,
      sources
    };

    // Cache result with timestamp
    searchCache.set(normalizedQuery, { timestamp: Date.now(), data: resultsData });

    return {
      resultsData,
      sources
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err || '');
    if (
      errMsg.toLowerCase().includes('usage limit') ||
      errMsg.toLowerCase().includes('exceeds your plan') ||
      errMsg.toLowerCase().includes('quota') ||
      errMsg.toLowerCase().includes('429')
    ) {
      tavilyToolQuotaExceededUntil = Date.now() + 60 * 60 * 1000; // 1 hour cooldown
      console.warn('[TavilyService Notice] Tavily search quota limit reached. Pausing tool search for 1 hour.');
    } else {
      console.warn(`[TavilyService Notice] Tavily search notice: ${errMsg}`);
    }
    return null;
  }
}



