/**
 * OpenRouter Dynamic Free Model Catalog Service
 * Dynamically fetches, categorizes, and caches all active 100% free models
 * from OpenRouter's official API (https://openrouter.ai/api/v1/models).
 */

export interface OpenRouterModelItem {
  id: string;
  name: string;
  badge?: string;
  description: string;
  brand: 'auto' | 'gemini' | 'claude' | 'deepseek' | 'openai' | 'meta' | 'qwen' | 'mistral' | 'nvidia' | 'google' | 'microsoft';
  category: 'recommended' | 'reasoning' | 'coding' | 'fast' | 'all';
  isFree: boolean;
  contextLength?: number;
}

// In-memory cache for dynamic models
let cachedFreeModels: OpenRouterModelItem[] | null = null;
let cacheExpiryTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

// Comprehensive baseline fallback in case OpenRouter API is unreachable
const STATIC_FREE_MODELS_FALLBACK: OpenRouterModelItem[] = [
  {
    id: 'auto',
    name: 'Auto (Recommended)',
    badge: 'SMART ROUTE',
    description: 'Automatically routes to the fastest, highest quality model with fallback protection.',
    brand: 'auto',
    category: 'recommended',
    isFree: true
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Router',
    badge: 'ROUTER',
    description: 'Dynamic router selecting from all active models on OpenRouter.',
    brand: 'auto',
    category: 'recommended',
    isFree: true
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: 'GOOGLE',
    description: 'High-speed multimodal reasoning engine with 1M context by Google.',
    brand: 'gemini',
    category: 'fast',
    isFree: true
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning',
    badge: 'NVIDIA',
    description: 'High-speed instruction following and reasoning model by NVIDIA.',
    brand: 'nvidia',
    category: 'recommended',
    isFree: true,
    contextLength: 131072
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B',
    badge: 'GEMMA 4',
    description: 'Next-gen open-weights instruction-tuned model by Google.',
    brand: 'google',
    category: 'recommended',
    isFree: true,
    contextLength: 32768
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google Gemma 4 26B',
    badge: 'GEMMA',
    description: 'High-accuracy, efficient open weights model by Google.',
    brand: 'google',
    category: 'fast',
    isFree: true,
    contextLength: 32768
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA Nemotron 3 Ultra 550B',
    badge: 'POWER 550B',
    description: 'Massive parameter enterprise reasoning engine by NVIDIA.',
    brand: 'nvidia',
    category: 'reasoning',
    isFree: true,
    contextLength: 131072
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'Liquid LFM 2.5',
    badge: 'ULTRA FAST',
    description: 'Liquid Neural Network lightweight edge model for rapid responses.',
    brand: 'auto',
    category: 'fast',
    isFree: true,
    contextLength: 32768
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere North Mini Code',
    badge: 'DEV CODE',
    description: 'Specialized code generation, debugging, and software engineering model.',
    brand: 'auto',
    category: 'coding',
    isFree: true,
    contextLength: 32768
  }
];

function detectBrand(modelId: string, modelName: string): OpenRouterModelItem['brand'] {
  const s = (modelId + ' ' + modelName).toLowerCase();
  if (s.includes('deepseek')) return 'deepseek';
  if (s.includes('llama') || s.includes('meta')) return 'meta';
  if (s.includes('qwen') || s.includes('alibaba')) return 'qwen';
  if (s.includes('gemini') || s.includes('gemma') || s.includes('google')) return 'google';
  if (s.includes('mistral') || s.includes('codestral') || s.includes('pixtral')) return 'mistral';
  if (s.includes('nvidia') || s.includes('nemotron')) return 'nvidia';
  if (s.includes('microsoft') || s.includes('phi')) return 'microsoft';
  if (s.includes('claude') || s.includes('anthropic')) return 'claude';
  if (s.includes('openai') || s.includes('gpt')) return 'openai';
  return 'auto';
}

function detectCategory(modelId: string, modelName: string, desc: string): OpenRouterModelItem['category'] {
  const s = (modelId + ' ' + modelName + ' ' + desc).toLowerCase();
  if (s.includes('r1') || s.includes('reason') || s.includes('thinking') || s.includes('thought') || s.includes('math') || s.includes('70b') || s.includes('72b')) {
    return 'reasoning';
  }
  if (s.includes('code') || s.includes('coder') || s.includes('dev') || s.includes('sql') || s.includes('python')) {
    return 'coding';
  }
  if (s.includes('flash') || s.includes('mini') || s.includes('lite') || s.includes('small') || s.includes('1b') || s.includes('3b') || s.includes('8b') || s.includes('fast')) {
    return 'fast';
  }
  return 'recommended';
}

function detectBadge(modelId: string, modelName: string): string {
  const s = (modelId + ' ' + modelName).toLowerCase();
  if (s.includes('deepseek-r1') || s.includes('r1')) return 'REASONING';
  if (s.includes('deepseek-chat') || s.includes('deepseek-v3') || s.includes('v3')) return 'FLAGSHIP';
  if (s.includes('coder') || s.includes('code')) return 'DEV CODE';
  if (s.includes('thinking')) return 'THINKING';
  if (s.includes('flash')) return 'ULTRA FAST';
  if (s.includes('70b') || s.includes('72b')) return 'POWER 70B';
  if (s.includes('llama-3.3')) return 'LLAMA 3.3';
  if (s.includes('llama-3.2')) return 'LLAMA 3.2';
  if (s.includes('gemma')) return 'GEMMA';
  if (s.includes('mistral')) return 'MISTRAL';
  if (s.includes('nvidia')) return 'NVIDIA';
  if (s.includes('phi')) return 'MICROSOFT';
  return 'ACTIVE';
}

/**
 * Fetch and parse all currently available free models from OpenRouter
 */
export async function fetchLiveOpenRouterFreeModels(): Promise<OpenRouterModelItem[]> {
  const now = Date.now();
  if (cachedFreeModels && cacheExpiryTime > now) {
    return cachedFreeModels;
  }

  try {
    console.log('[OpenRouter Catalog] Querying official OpenRouter API (https://openrouter.ai/api/v1/models)...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const apiKey = process.env.OPENROUTER_API_KEY;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gravityverse.app',
      'X-Title': 'Gravityverse'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[OpenRouter Catalog] API responded with HTTP ${res.status}. Falling back to baseline catalog.`);
      return STATIC_FREE_MODELS_FALLBACK;
    }

    const data = await res.json();
    const rawList: any[] = Array.isArray(data?.data) ? data.data : [];

    console.log(`[OpenRouter Catalog] OpenRouter returned ${rawList.length} total models. Filtering for 100% free models...`);

    const openRouterFreeList: OpenRouterModelItem[] = [];

    for (const item of rawList) {
      const id = item.id || '';
      const name = item.name || id;
      const desc = item.description || '';
      const pricing = item.pricing || {};

      const promptPrice = parseFloat(pricing.prompt ?? '1');
      const completionPrice = parseFloat(pricing.completion ?? '1');
      const requestPrice = parseFloat(pricing.request ?? '0');

      const isExplicitFreeTag = id.endsWith(':free') || id === 'openrouter/free';
      const isZeroPrice = promptPrice === 0 && completionPrice === 0 && requestPrice === 0;

      if (isExplicitFreeTag || isZeroPrice) {
        const brand = detectBrand(id, name);
        const category = detectCategory(id, name, desc);
        const badge = detectBadge(id, name);

        const cleanName = name
          .replace(/:\s*free\b/gi, '')
          .replace(/\s*\(\s*free\s*\)/gi, '')
          .replace(/\bfree\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        openRouterFreeList.push({
          id,
          name: cleanName || id,
          badge,
          description: desc || `High quality AI model hosted via OpenRouter.`,
          brand,
          category,
          isFree: true,
          contextLength: item.context_length || item.top_provider?.context_length || 32768
        });
      }
    }

    console.log(`[OpenRouter Catalog] Discovered ${openRouterFreeList.length} free OpenRouter models dynamically.`);

    // Prepend Auto and Gemini native models
    const mergedList: OpenRouterModelItem[] = [
      {
        id: 'auto',
        name: 'Auto (Recommended)',
        badge: 'SMART ROUTE',
        description: 'Automatically routes to the fastest, highest quality model with fallback protection.',
        brand: 'auto',
        category: 'recommended',
        isFree: true
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        badge: 'GOOGLE',
        description: 'High-speed multimodal reasoning engine with 1M context by Google.',
        brand: 'gemini',
        category: 'fast',
        isFree: true
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        badge: 'ULTRA FAST',
        description: 'Ultra-low latency Google model with strong multimodal comprehension.',
        brand: 'gemini',
        category: 'fast',
        isFree: true
      },
      ...openRouterFreeList
    ];

    // Deduplicate by ID
    const seen = new Set<string>();
    const uniqueList: OpenRouterModelItem[] = [];
    for (const m of mergedList) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        uniqueList.push(m);
      }
    }

    cachedFreeModels = uniqueList;
    cacheExpiryTime = now + CACHE_TTL_MS;

    return uniqueList;

  } catch (err: any) {
    console.warn('[OpenRouter Catalog] Failed to fetch live OpenRouter models:', err.message || err);
    if (cachedFreeModels) {
      return cachedFreeModels;
    }
    return STATIC_FREE_MODELS_FALLBACK;
  }
}

/**
 * Synchronous or cached getter
 */
export function getCachedFreeModels(): OpenRouterModelItem[] {
  return cachedFreeModels || STATIC_FREE_MODELS_FALLBACK;
}
