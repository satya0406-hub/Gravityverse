import { BaseProviderAdapter } from './baseAdapter';
import { AdapterRequest, AdapterResponse, ProviderConfig, GroundingSource, StreamingChunk } from '../types';
import { PROVIDER_REGISTRY } from '../config/providerRegistry';
import { analyzeUserIntent } from '../utils/intentAnalyzer';
import { executeGeminiLiveSearch } from '../services/geminiLiveSearchService';
import { buildAttachmentContext } from '../services/attachmentContextService';

export const TAVILY_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'tavily_search',
    description: 'Search the web for current information, news, live scores, weather, politics, real-time data, and recent facts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on the web'
        },
        max_results: {
          type: 'integer',
          description: 'Maximum number of search results to return (default 5)',
          default: 5
        }
      },
      required: ['query']
    }
  }
};

export function isValidOpenRouterKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim().toLowerCase();
  return k !== '' && 
         k !== 'undefined' && 
         k !== 'null' && 
         k !== 'placeholder' &&
         k !== 'your_openrouter_api_key_here';
}

export class OpenRouterAdapter extends BaseProviderAdapter {
  readonly providerId = 'openrouter';

  constructor(config?: ProviderConfig) {
    super(config || PROVIDER_REGISTRY.openrouter);
  }

  isConfigured(customKey?: string): boolean {
    const key = customKey || process.env.OPENROUTER_API_KEY;
    return isValidOpenRouterKey(key);
  }

  private prepareMessages(adapterReq: AdapterRequest) {
    const { request, providerModelId } = adapterReq;
    const { messages, attachments, systemInstruction, metadata, temperature, maxTokens } = request;

    const endpoint = `${this.config.apiEndpoint || 'https://openrouter.ai/api/v1'}/chat/completions`;
    const modelToUse = providerModelId || 'openrouter/free';

    let promptText = "";
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (typeof lastMsg.content === 'string') promptText = lastMsg.content;
      else if (Array.isArray(lastMsg.content)) promptText = lastMsg.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
    } else if (request.prompt) {
      promptText = request.prompt;
    }

    const isSearchEnabled = metadata?.webSearch === true || metadata?.webSearch === 'true';
    const isForceSearch = metadata?.forceWebSearch === true || metadata?.forceWebSearch === 'true';
    
    // Analyze user intent: time-sensitive / current-information questions always trigger freshness verification
    const intent = analyzeUserIntent(promptText, !!(attachments && attachments.length > 0), isForceSearch || isSearchEnabled);

    const isAutoMode = !request.modelId || request.modelId === 'auto';
    const conversationId = request.chatId || metadata?.chatId || metadata?.conversationId;
    const conversationAttachments = request.conversationAttachments || metadata?.conversationAttachments;

    const attachmentContext = buildAttachmentContext(attachments, {
      modelId: modelToUse,
      providerId: 'openrouter',
      userPrompt: promptText,
      isAutoMode,
      conversationId,
      chatId: conversationId,
      userId: request.userId,
      conversationAttachments
    });

    const formattedMessages: any[] = [];
    const baseSystemInstruction = systemInstruction || `You are GravityVerse Assistant, an advanced, highly intelligent AI companion.
Your goal is to provide accurate, helpful, well-reasoned, and natural responses.

Key Guidelines:
- Directly answer the user's question with appropriate detail:
  * For simple factual questions or document queries (e.g. "Who issued this?", "What is the date?"), provide a direct, concise 1-4 sentence answer.
  * For lists or steps, use clean, readable markdown bullet points.
  * For complex questions or comprehensive study requests, provide structured explanations with clear headings.
- When analyzing documents or attachments, reference the document content directly without repeating the whole document or generating unrequested boilerplate templates.
- Maintain an objective, articulate, and helpful tone.`;

    formattedMessages.push({
      role: 'system',
      content: baseSystemInstruction,
    });

    // Previous history messages
    if (messages && messages.length > 1) {
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const role = msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
        const textContent = typeof msg.content === 'string' 
          ? msg.content 
          : Array.isArray(msg.content)
          ? msg.content.filter(p => p.type === 'text').map(p => p.text).join('\n')
          : '';

        if (textContent.trim()) {
          formattedMessages.push({
            role,
            content: textContent.trim()
          });
        }
      }
    }

    // Final user turn with canonical augmented context
    if (attachmentContext.hasVisionImages && attachmentContext.supportsVision) {
      const contentParts: any[] = [
        { type: 'text', text: attachmentContext.augmentedPrompt }
      ];
      attachmentContext.visionImages.forEach(img => {
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: img.dataUrl
          }
        });
      });

      formattedMessages.push({
        role: 'user',
        content: contentParts
      });
    } else {
      formattedMessages.push({
        role: 'user',
        content: attachmentContext.augmentedPrompt
      });
    }

    return {
      endpoint,
      modelToUse,
      promptText: attachmentContext.augmentedPrompt,
      intent,
      formattedMessages,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens || 800
    };
  }

  async execute(adapterReq: AdapterRequest): Promise<AdapterResponse> {
    const { request } = adapterReq;
    const { metadata } = request;

    const customKey = metadata?.customApiKey || metadata?.custom_api_key || metadata?.openrouterApiKey;
    const apiKey = customKey || process.env.OPENROUTER_API_KEY;

    if (!isValidOpenRouterKey(apiKey)) {
      console.error(`[OpenRouterAdapter Security Error] Missing or invalid OPENROUTER_API_KEY environment variable.`);
      throw new Error('[OpenRouterAdapter] Missing or invalid OpenRouter API Key. Please set OPENROUTER_API_KEY.');
    }

    const {
      endpoint,
      modelToUse,
      promptText,
      intent,
      formattedMessages,
      temperature,
      maxTokens
    } = this.prepareMessages(adapterReq);

    const isToolEnabled = intent.needsWebSearch;
    const accumulatedSources: GroundingSource[] = [];
    let webSearchPerformed = false;

    console.log(`\n=================== [OPENROUTER ADAPTER TRACE LOG] ===================`);
    console.log(`[OpenRouter Execute] User Prompt: "${promptText.slice(0, 100)}${promptText.length > 100 ? '...' : ''}"`);
    console.log(`[OpenRouter Execute] Intent: "${intent.intentCategory}", freshSearchRequired=${intent.freshSearchRequired}`);
    console.log(`[OpenRouter Execute] Model Selected: "${modelToUse}"`);

    // 1. For queries requiring fresh information / web search, reuse the existing Gemini live-search pipeline
    if (isToolEnabled) {
      console.log(`[OpenRouter Live-Search Grounding] Executing Gemini live-search pipeline for: "${promptText}"`);
      try {
        const searchResult = await executeGeminiLiveSearch(promptText, metadata?.customApiKey);
        if (searchResult.success && searchResult.searchSnippets) {
          accumulatedSources.push(...searchResult.sources);
          webSearchPerformed = true;

          const sourcesList = searchResult.sources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})`).join('\n');
          const searchGroundingContext = `[Real-Time Live Google Search Grounding Context]\n\nThe following verified real-time Google Search findings were retrieved for the user's inquiry:\n${searchResult.searchSnippets}\n\nVerified Sources:\n${sourcesList}\n\nCRITICAL INSTRUCTIONS:\n- You MUST answer strictly using the verified current facts above.\n- State current office holders and real-world facts accurately as confirmed by these live Google Search results.\n- DO NOT recite outdated pre-training knowledge.\n- Provide an articulate, direct, and factual answer in your conversational style.`;
          
          formattedMessages.push({
            role: 'system',
            content: searchGroundingContext
          });

          // Also enrich the last user message to ensure open-source models adhere directly to search findings
          if (formattedMessages.length > 0) {
            for (let idx = formattedMessages.length - 1; idx >= 0; idx--) {
              if (formattedMessages[idx].role === 'user') {
                formattedMessages[idx].content = `${searchGroundingContext}\n\nUser Question:\n${formattedMessages[idx].content}`;
                break;
              }
            }
          }
          console.log(`[OpenRouter Live-Search Grounding] Retrieved ${searchResult.sources.length} Google Search sources. Context injected.`);
        } else if (intent.freshSearchRequired) {
          // Strict fallback prevention: Never answer time-sensitive query from old model knowledge if search failed
          console.warn(`[OpenRouter Live-Search Grounding] Live Google search failed to return results for time-sensitive query.`);
          return {
            content: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelToUse, unverifiedNotice: true }
          };
        }
      } catch (searchErr) {
        console.warn(`[OpenRouter Live-Search Grounding] Search error:`, searchErr);
        if (intent.freshSearchRequired) {
          return {
            content: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelToUse, unverifiedNotice: true }
          };
        }
      }
    }

    const payload: Record<string, any> = {
      model: modelToUse,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
    };

    const timeoutMs = this.config.timeoutMs || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://gravityverse.app',
          'X-Title': 'Gravityverse',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`[OpenRouter] HTTP ${res.status} Error:`, errorBody);
        const err: any = new Error(`[OpenRouter] Request failed with HTTP ${res.status}: ${errorBody.slice(0, 300)}`);
        err.status = res.status;
        err.statusCode = res.status;
        throw err;
      }

      const jsonRes = await res.json();
      const choice = jsonRes.choices?.[0];
      const content = choice?.message?.content || '';

      const uniqueSourcesMap = new Map<string, GroundingSource>();
      accumulatedSources.forEach(s => {
        if (s.url && !uniqueSourcesMap.has(s.url)) {
          uniqueSourcesMap.set(s.url, s);
        }
      });
      const finalSources = Array.from(uniqueSourcesMap.values());

      return {
        content,
        usage: {
          promptTokens: jsonRes.usage?.prompt_tokens || 0,
          completionTokens: jsonRes.usage?.completion_tokens || 0,
          totalTokens: jsonRes.usage?.total_tokens || 0,
        },
        finishReason: choice?.finish_reason || 'stop',
        groundingSources: finalSources.length > 0 ? finalSources : undefined,
        webSearchPerformed,
        freshSearchRequired: intent.freshSearchRequired,
        searchProvider: webSearchPerformed ? 'googleSearch' : 'none',
        intentCategory: intent.intentCategory,
        rawResponse: jsonRes
      };

    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`[OpenRouterAdapter] Timeout after ${timeoutMs}ms while querying ${modelToUse}.`);
      }
      throw error;
    }
  }

  async executeStream(
    adapterReq: AdapterRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<AdapterResponse> {
    const { request } = adapterReq;
    const { metadata } = request;

    const customKey = metadata?.customApiKey || metadata?.custom_api_key || metadata?.openrouterApiKey;
    const apiKey = customKey || process.env.OPENROUTER_API_KEY;

    if (!isValidOpenRouterKey(apiKey)) {
      console.error(`[OpenRouterAdapter Security Error] Missing or invalid OPENROUTER_API_KEY.`);
      throw new Error('[OpenRouterAdapter] Missing or invalid OpenRouter API Key.');
    }

    const {
      endpoint,
      modelToUse,
      promptText,
      intent,
      formattedMessages,
      temperature,
      maxTokens
    } = this.prepareMessages(adapterReq);

    const isToolEnabled = intent.needsWebSearch;
    const accumulatedSources: GroundingSource[] = [];
    let webSearchPerformed = false;

    // If web search / grounding is required, reuse the existing Gemini live-search pipeline, inject fresh search results, then stream the response
    if (isToolEnabled) {
      console.log(`\n=================== [OPENROUTER STREAM GROUNDING TRACE] ===================`);
      console.log(`[Stream Grounding] Intent Category: "${intent.intentCategory}" (Reason: "${intent.searchReason}")`);
      console.log(`[Stream Grounding] Model: "${modelToUse}", Query: "${promptText}"`);

      try {
        const searchResult = await executeGeminiLiveSearch(promptText, metadata?.customApiKey);
        if (searchResult.success && searchResult.searchSnippets) {
          accumulatedSources.push(...searchResult.sources);
          webSearchPerformed = true;

          const sourcesList = searchResult.sources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})`).join('\n');
          const searchGroundingContext = `[Real-Time Live Google Search Grounding Context]\n\nThe following verified real-time Google Search findings were retrieved for the user's inquiry:\n${searchResult.searchSnippets}\n\nVerified Sources:\n${sourcesList}\n\nCRITICAL INSTRUCTIONS:\n- You MUST answer strictly using the verified current facts above.\n- State current office holders and real-world facts accurately as confirmed by these live Google Search results.\n- DO NOT recite outdated pre-training knowledge.\n- Provide an articulate, direct, and factual answer in your conversational style.`;
          
          formattedMessages.push({
            role: 'system',
            content: searchGroundingContext
          });

          // Also enrich the last user message to ensure open-source streaming models adhere directly to search findings
          if (formattedMessages.length > 0) {
            for (let idx = formattedMessages.length - 1; idx >= 0; idx--) {
              if (formattedMessages[idx].role === 'user') {
                formattedMessages[idx].content = `${searchGroundingContext}\n\nUser Question:\n${formattedMessages[idx].content}`;
                break;
              }
            }
          }
          console.log(`[Stream Grounding] Gemini live-search retrieved ${searchResult.sources.length} Google Search source(s). Context injected.`);
        } else if (intent.freshSearchRequired) {
          // Strict fallback prevention for streaming: If live search fails, do not answer using outdated model knowledge
          const notice = "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.";
          onChunk({
            id: `chunk-${Date.now()}`,
            delta: notice,
            done: false,
            modelId: modelToUse,
            providerId: 'openrouter'
          });
          onChunk({
            id: `chunk-${Date.now()}`,
            delta: '',
            done: true,
            modelId: modelToUse,
            providerId: 'openrouter'
          });
          return {
            content: notice,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelToUse, unverifiedNotice: true }
          };
        }
      } catch (searchErr) {
        console.warn(`[Stream Grounding] Gemini live-search pre-fetch error:`, searchErr);
        if (intent.freshSearchRequired) {
          const notice = "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.";
          onChunk({
            id: `chunk-${Date.now()}`,
            delta: notice,
            done: false,
            modelId: modelToUse,
            providerId: 'openrouter'
          });
          onChunk({
            id: `chunk-${Date.now()}`,
            delta: '',
            done: true,
            modelId: modelToUse,
            providerId: 'openrouter'
          });
          return {
            content: notice,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelToUse, unverifiedNotice: true }
          };
        }
      }
    }

    // Direct streaming via Server-Sent Events (SSE)
    const streamPayload = {
      model: modelToUse,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    };

    const timeoutMs = this.config.timeoutMs || 45000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[OpenRouter Native Stream] Initiating SSE stream for model "${modelToUse}"...`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://gravityverse.app',
          'X-Title': 'Gravityverse',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        const err: any = new Error(`[OpenRouter Stream] Request failed with HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
        err.status = response.status;
        err.statusCode = response.status;
        throw err;
      }

      if (!response.body) {
        throw new Error("[OpenRouter Stream] Response body is empty.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullContent = "";
      let buffer = "";
      const chunkId = `chunk-${Date.now()}`;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content || "";
              if (delta) {
                fullContent += delta;
                onChunk({
                  id: chunkId,
                  delta,
                  done: false,
                  modelId: modelToUse,
                  providerId: 'openrouter'
                });
              }
            } catch {
              // Ignore incomplete JSON stream lines
            }
          }
        }
      }

      const uniqueSourcesMap = new Map<string, GroundingSource>();
      accumulatedSources.forEach(s => {
        if (s.url && !uniqueSourcesMap.has(s.url)) {
          uniqueSourcesMap.set(s.url, s);
        }
      });
      const finalSources = Array.from(uniqueSourcesMap.values());

      onChunk({
        id: chunkId,
        delta: "",
        done: true,
        modelId: modelToUse,
        providerId: 'openrouter',
        groundingSources: finalSources.length > 0 ? finalSources : undefined,
        sources: finalSources.length > 0 ? finalSources : undefined,
        webSearchPerformed
      } as any);

      return {
        content: fullContent,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop',
        groundingSources: finalSources.length > 0 ? finalSources : undefined,
        webSearchPerformed,
        freshSearchRequired: intent.freshSearchRequired,
        searchProvider: webSearchPerformed ? 'googleSearch' : 'none',
        intentCategory: intent.intentCategory,
        rawResponse: { model: modelToUse }
      };

    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}




