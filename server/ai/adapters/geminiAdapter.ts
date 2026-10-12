import { GoogleGenAI } from '@google/genai';
import { BaseProviderAdapter } from './baseAdapter';
import { AdapterRequest, AdapterResponse, ProviderConfig, GroundingSource, StreamingChunk } from '../types';
import { PROVIDER_REGISTRY } from '../config/providerRegistry';
import { analyzeUserIntent } from '../utils/intentAnalyzer';
import { buildAttachmentContext } from '../services/attachmentContextService';
import { executeGeminiLiveSearch } from '../services/geminiLiveSearchService';

export function isValidApiKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim();
  const lower = k.toLowerCase();
  return lower !== "" && 
         lower !== "my_gemini_api_key" && 
         lower !== "your_gemini_api_key_here" && 
         lower !== "undefined" && 
         lower !== "null" &&
         lower !== "placeholder";
}

export class GeminiAdapter extends BaseProviderAdapter {
  readonly providerId = 'gemini';

  constructor(config?: ProviderConfig) {
    super(config || PROVIDER_REGISTRY.gemini);
  }

  isConfigured(customKey?: string): boolean {
    const key = customKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    return isValidApiKey(key);
  }

  private preparePayload(adapterReq: AdapterRequest) {
    const { request, providerModelId } = adapterReq;
    const { messages, attachments, systemInstruction, metadata } = request;

    // Extract prompt text from last user message or request
    let prompt = "";
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (typeof lastMsg.content === 'string') {
        prompt = lastMsg.content;
      } else if (Array.isArray(lastMsg.content)) {
        prompt = lastMsg.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
      }
    } else if (request.prompt) {
      prompt = request.prompt;
    }

    // 1. Analyze User Intent for conditional web search grounding
    const hasAttachments = !!(attachments && attachments.length > 0);
    const forceSearch = metadata?.webSearch === true || metadata?.webSearch === 'true' || metadata?.forceWebSearch === true || metadata?.forceWebSearch === 'true';
    const intent = analyzeUserIntent(prompt, hasAttachments, forceSearch);

    // Enable Google Search Grounding: active whenever search is needed or requested
    // Default to enabled for live accuracy unless user explicitly turned it off
    const isExplicitlyDisabled = metadata?.webSearch === false && metadata?.forceWebSearch !== true;
    const shouldEnableGoogleSearch = !isExplicitlyDisabled && (
      intent.needsWebSearch || 
      intent.freshSearchRequired ||
      forceSearch || 
      metadata?.webSearch === true || 
      metadata?.forceWebSearch === true
    );

    // Strict Model Selection vs Auto Routing:
    // We prioritize gemini-3.8-flash as the primary text model per official guidelines,
    // with gemini-flash-latest and gemini-3.1-flash-lite in the resilient fallback chain.
    const isAutoMode = !request.modelId || request.modelId === 'auto';
    const rawRequestedModel = providerModelId && providerModelId !== 'auto' ? providerModelId : "gemini-3.8-flash";
    const requestedModel = rawRequestedModel.replace(/^models\//, '');
    
    const standardChain = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let modelsToTry: string[];
    if (requestedModel === 'gemini-flash' || requestedModel === 'gemini-2.5-flash' || requestedModel === 'gemini-3.5-flash' || requestedModel === 'gemini-3.8-flash' || isAutoMode) {
      modelsToTry = standardChain;
    } else {
      modelsToTry = Array.from(new Set([requestedModel, ...standardChain]));
    }

    const defaultSystemInstruction = `You are GravityVerse Assistant, an advanced, highly intelligent AI companion.
Your goal is to provide accurate, helpful, well-reasoned, and natural responses.

Key Guidelines:
- Directly answer the user's question with appropriate detail:
  * For simple factual questions or document queries (e.g. "Who issued this?", "What is the date?"), provide a direct, concise 1-4 sentence answer.
  * For lists or steps, use clean, readable markdown bullet points.
  * For complex questions or comprehensive study requests, provide structured explanations with clear headings.
- When analyzing documents or attachments, reference the document content directly without repeating the whole document or generating unrequested boilerplate templates.
- Maintain an objective, articulate, and helpful tone. Current Server Time: ${new Date().toString()}.
- GOOGLE SEARCH DATA GROUNDING & REAL-TIME ACCURACY:
  * Live Google Search grounding is actively enabled with googleSearch tool. When inquiries touch on real-world facts, current news, university events (e.g. SRM University, SRMIST, campus fests, hackathons, academic schedules), leadership, office holders, market figures, or temporal information, incorporate Google Search data.
  * Integrate live verified facts, dates, figures, and direct answers directly into your response.
  * For questions concerning current office holders (such as Chief Minister, Prime Minister, President, CEO, Ministers), breaking news, recent events, live scores, or dynamic market data:
    - You MUST verify against fresh Google Search results and ground your answer strictly in current verified reality.
    - NEVER rely on outdated training memory for dynamic facts; always reflect the latest confirmed holder and factual reality grounded in real-time verified search results.
    - If live search returns no verified evidence or search is unavailable, state clearly that you could not verify the current information right now rather than answering from outdated memory.`;

    const googleSearchDirective = `
GOOGLE SEARCH DATA GROUNDING & REAL-TIME ACCURACY:
- Live Google Search grounding is actively enabled with googleSearch tool.
- When user inquiries touch on real-world knowledge, recent news, university events (e.g. SRM University, SRMIST, campus fests, hackathons, academic schedules), leadership, office holders, market figures, or temporal information, you MUST consult and incorporate Google Search data.
- Integrate live verified facts, dates, figures, and direct answers directly into your response.
- For questions concerning current office holders (such as Chief Minister, Prime Minister, President, CEO, Ministers), breaking news, recent events, live scores, or dynamic market data:
  * You MUST verify against fresh Google Search results and ground your answer strictly in current verified reality.
  * NEVER rely on outdated training memory for dynamic facts; always reflect the latest confirmed holder and factual reality grounded in real-time verified search results.
  * If live search returns no verified evidence or search is unavailable, state clearly that you could not verify the current information right now rather than answering from outdated memory.`;

    let finalSysInst = systemInstruction || defaultSystemInstruction;
    if (shouldEnableGoogleSearch && !finalSysInst.includes('GOOGLE SEARCH DATA GROUNDING')) {
      finalSysInst = `${finalSysInst}\n\n${googleSearchDirective}`;
    }
    // Strictly cap systemInstruction to <= 1950 characters
    if (finalSysInst.length > 1950) {
      finalSysInst = finalSysInst.slice(0, 1950);
    }

    const config: any = {
      systemInstruction: finalSysInst,
    };

    if (shouldEnableGoogleSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    // Build standard alternating Gemini contents array
    const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

    // Process previous history messages
    if (messages && messages.length > 1) {
      for (let i = 0; i < messages.length - 1; i++) {
        const m = messages[i];
        const role = (m.role === 'assistant' || (m.role as any) === 'model') ? 'model' : 'user';
        const text = typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
          ? m.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          : '';

        if (text.trim()) {
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            // Consolidate consecutive turns with identical role
            contents[contents.length - 1].parts[0].text += `\n\n${text.trim()}`;
          } else {
            contents.push({
              role,
              parts: [{ text: text.trim() }]
            });
          }
        }
      }
    }

    // 2. Build canonical multimodal attachment context using the shared pipeline
    const conversationId = request.chatId || metadata?.chatId || metadata?.conversationId;
    const conversationAttachments = request.conversationAttachments || metadata?.conversationAttachments;

    const attachmentContext = buildAttachmentContext(attachments, {
      modelId: requestedModel,
      providerId: 'gemini',
      userPrompt: prompt,
      isAutoMode,
      conversationId,
      chatId: conversationId,
      userId: request.userId,
      conversationAttachments
    });

    // Build the final User Turn parts
    const finalUserParts: any[] = [];

    // Include multimodal vision images if present
    if (attachmentContext.visionImages.length > 0) {
      attachmentContext.visionImages.forEach(img => {
        finalUserParts.push({
          inlineData: { mimeType: img.mimeType, data: img.base64Data }
        });
      });
    }

    // Add canonical augmented prompt (contains extracted document text + user question)
    finalUserParts.push({ text: attachmentContext.augmentedPrompt });

    // 3. Ensure Gemini conversation starts with 'user'
    while (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    // 4. Append final user turn
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts = [...finalUserParts, ...contents[contents.length - 1].parts];
    } else {
      contents.push({
        role: 'user',
        parts: finalUserParts
      });
    }

    return {
      prompt: attachmentContext.augmentedPrompt,
      intent,
      modelsToTry,
      config,
      contents
    };
  }

  async execute(adapterReq: AdapterRequest): Promise<AdapterResponse> {
    const { request } = adapterReq;
    const { metadata } = request;
    
    // Determine API Key strictly from request custom key or environment variables
    const customKey = metadata?.customApiKey || metadata?.custom_api_key;
    const apiKey = customKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;

    if (!isValidApiKey(apiKey)) {
      console.error(`[GeminiAdapter Security Error] No valid GEMINI_API_KEY environment variable provided.`);
      throw new Error("Missing or invalid GEMINI_API_KEY environment variable.");
    }

    const { prompt, intent, modelsToTry, config, contents } = this.preparePayload(adapterReq);

    console.log(`\n=================== [GEMINI ADAPTER TRACE LOG] ===================`);
    console.log(`[Trace] User Prompt: "${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}"`);
    console.log(`[Trace] Requested Model: "${adapterReq.providerModelId || 'auto'}"`);
    console.log(`[Trace] Intent Result: Category="${intent.intentCategory}", needsWebSearch=${intent.needsWebSearch}`);
    console.log(`[Trace] Search Reason: "${intent.searchReason}"`);
    console.log(`[Trace] Search Tool Active: GoogleSearchTool=${!!config.tools}`);

    const accumulatedSources: GroundingSource[] = [];
    let webSearchPerformed = false;

    // Reuse existing Gemini live-search pipeline for current/live information
    if (config.tools && config.tools.length > 0) {
      console.log(`[GeminiAdapter Live-Search Grounding] Executing Gemini live-search pipeline for: "${prompt}"`);
      try {
        const searchResult = await executeGeminiLiveSearch(prompt, customKey);
        if (searchResult.success && searchResult.searchSnippets) {
          accumulatedSources.push(...searchResult.sources);
          webSearchPerformed = true;

          const sourcesList = searchResult.sources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})`).join('\n');
          const todayDateStr = new Date().toDateString();
          const currentYear = new Date().getFullYear();
          const searchGroundingContext = `[Real-Time Live Google Search Grounding Context - As of ${todayDateStr} (Year ${currentYear})]\n\nThe following verified real-time Google Search findings were retrieved for the user's inquiry:\n${searchResult.searchSnippets}\n\nVerified Sources:\n${sourcesList}\n\nCRITICAL INSTRUCTIONS:\n- The current year is ${currentYear} (Today is ${todayDateStr}).\n- You MUST answer strictly using the verified current facts above as of ${currentYear}.\n- State current office holders and real-world facts accurately as confirmed by these live Google Search results.\n- DO NOT recite outdated pre-training knowledge.\n- Provide an articulate, direct, and factual answer in your conversational style.`;
          
          config.systemInstruction = `${config.systemInstruction || ''}\n\n${searchGroundingContext}`;
          
          // Inject directly into the user's turn in contents array to guarantee grounding across all models
          if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            const userTurn = contents[contents.length - 1];
            userTurn.parts = [
              { text: `${searchGroundingContext}\n\nUser Question:\n` },
              ...userTurn.parts
            ];
          }

          // Clean up config.tools since verified search results have already been retrieved and injected
          delete config.tools;
          console.log(`[GeminiAdapter Live-Search Grounding] Injected ${searchResult.sources.length} sources into context.`);
        } else if (intent.freshSearchRequired) {
          console.warn(`[GeminiAdapter Live-Search Grounding] Live Google search failed to return results for time-sensitive query.`);
          return {
            content: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: adapterReq.providerModelId || 'gemini-3.8-flash', unverifiedNotice: true }
          };
        }
      } catch (searchErr) {
        console.warn(`[GeminiAdapter Live-Search Grounding] Search error:`, searchErr);
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
            rawResponse: { model: adapterReq.providerModelId || 'gemini-3.8-flash', unverifiedNotice: true }
          };
        }
      }
    }

    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        console.log(`[Trace] Gemini Request: Sending generateContent to model "${modelName}"...`);

        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config
        });

        console.log(`[Trace] Gemini Response Received successfully from model "${modelName}".`);

        // Extract and validate Grounding Metadata
        const candidate = response.candidates?.[0];
        const groundingMetadata = (candidate as any)?.groundingMetadata || (response as any)?.groundingMetadata;
        const groundingChunks = groundingMetadata?.groundingChunks;
        const webSearchQueries = groundingMetadata?.webSearchQueries;

        console.log(`[Trace] Grounding Metadata Present: ${!!groundingMetadata}`);
        console.log(`[Trace] Web Search Queries: ${JSON.stringify(webSearchQueries || [])}`);
        console.log(`[Trace] Grounding Chunks Count: ${groundingChunks?.length || 0}`);

        // Parse citation sources
        const groundingSources: GroundingSource[] = [];
        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            const uri = chunk.web?.uri || chunk.web?.url;
            if (uri) {
              groundingSources.push({
                title: chunk.web?.title || uri,
                url: uri
              });
            }
          }
        }

        // De-duplicate sources by URL
        const combinedSources = [...accumulatedSources, ...groundingSources];
        const uniqueSourcesMap = new Map<string, GroundingSource>();
        combinedSources.forEach(s => {
          if (s.url && !uniqueSourcesMap.has(s.url)) {
            uniqueSourcesMap.set(s.url, s);
          }
        });
        const finalGroundingSources = Array.from(uniqueSourcesMap.values());

        console.log(`[Trace] Total Citations Extracted: ${finalGroundingSources.length}`);

        // Strict Grounding Validation: Confirm if search was performed and produced sources or queries
        const hasGoogleSearchTool = Boolean(config.tools && config.tools.length > 0);
        let actuallyWebSearched = finalGroundingSources.length > 0 || webSearchPerformed || (Array.isArray(webSearchQueries) && webSearchQueries.length > 0);
        let searchProviderUsed = actuallyWebSearched ? 'googleSearch' : 'none';

        if (actuallyWebSearched) {
          console.log(`[Trace Final Answer Source]: Live Search Grounded Response (${finalGroundingSources.length} sources, Provider: ${searchProviderUsed})`);
        } else {
          console.log(`[Trace Final Answer Source]: Model Parametric Knowledge`);
        }
        console.log(`==================================================================\n`);

        // If this was a time-sensitive query and live search failed completely, do not output unverified outdated answer
        if (intent.freshSearchRequired && !actuallyWebSearched) {
          return {
            content: "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'none',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelName, unverifiedNotice: true }
          };
        }

        // Extract text content safely: try response.text first, fall back to aggregating parts
        let extractedContent = typeof response.text === 'string' ? response.text : '';
        if (!extractedContent && candidate?.content?.parts) {
          extractedContent = candidate.content.parts
            .filter((p: any) => typeof p.text === 'string')
            .map((p: any) => p.text)
            .join('');
        }

        return {
          content: extractedContent || '',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          finishReason: 'stop',
          groundingSources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
          webSearchPerformed: actuallyWebSearched,
          freshSearchRequired: intent.freshSearchRequired,
          searchProvider: searchProviderUsed,
          intentCategory: intent.intentCategory,
          rawResponse: {
            model: modelName,
            isFallback: modelName !== modelsToTry[0],
            groundingMetadata
          }
        };

      } catch (error: any) {
        lastError = error;
        const errorText = JSON.stringify(error?.response?.data || error?.message || error);
        console.warn(`[GeminiAdapter] Node [${modelName}] failed (${errorText.slice(0, 120)}...). Trying next model in fallback chain.`);
      }
    }

    throw lastError || new Error("Gemini execution failed on all nodes.");
  }

  async executeStream(
    adapterReq: AdapterRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<AdapterResponse> {
    const { request } = adapterReq;
    const { metadata } = request;
    
    const customKey = metadata?.customApiKey || metadata?.custom_api_key;
    const apiKey = customKey || process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;

    if (!isValidApiKey(apiKey)) {
      console.error(`[GeminiAdapter Security Error] No valid GEMINI_API_KEY environment variable provided.`);
      throw new Error("Missing or invalid GEMINI_API_KEY environment variable.");
    }

    const { prompt, intent, modelsToTry, config, contents } = this.preparePayload(adapterReq);

    console.log(`\n=================== [GEMINI ADAPTER STREAM TRACE] ===================`);
    console.log(`[Trace Stream] User Prompt: "${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}"`);
    console.log(`[Trace Stream] Requested Model: "${adapterReq.providerModelId || 'auto'}"`);
    console.log(`[Trace Stream] Search Active: GoogleSearchTool=${!!config.tools}`);

    const accumulatedSources: GroundingSource[] = [];
    let webSearchPerformed = false;

    // Reuse existing Gemini live-search pipeline for current/live information
    if (config.tools && config.tools.length > 0) {
      console.log(`[GeminiAdapter Stream Grounding] Executing Gemini live-search pipeline for: "${prompt}"`);
      try {
        const searchResult = await executeGeminiLiveSearch(prompt, customKey);
        if (searchResult.success && searchResult.searchSnippets) {
          accumulatedSources.push(...searchResult.sources);
          webSearchPerformed = true;

          const sourcesList = searchResult.sources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})`).join('\n');
          const todayDateStr = new Date().toDateString();
          const currentYear = new Date().getFullYear();
          const searchGroundingContext = `[Real-Time Live Google Search Grounding Context - As of ${todayDateStr} (Year ${currentYear})]\n\nThe following verified real-time Google Search findings were retrieved for the user's inquiry:\n${searchResult.searchSnippets}\n\nVerified Sources:\n${sourcesList}\n\nCRITICAL INSTRUCTIONS:\n- The current year is ${currentYear} (Today is ${todayDateStr}).\n- You MUST answer strictly using the verified current facts above as of ${currentYear}.\n- State current office holders and real-world facts accurately as confirmed by these live Google Search results.\n- DO NOT recite outdated pre-training knowledge.\n- Provide an articulate, direct, and factual answer in your conversational style.`;
          
          config.systemInstruction = `${config.systemInstruction || ''}\n\n${searchGroundingContext}`;
          
          // Inject directly into the user's turn in contents array to guarantee grounding across all models
          if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            const userTurn = contents[contents.length - 1];
            userTurn.parts = [
              { text: `${searchGroundingContext}\n\nUser Question:\n` },
              ...userTurn.parts
            ];
          }

          // Clean up config.tools since verified search results have already been retrieved and injected
          delete config.tools;
          console.log(`[GeminiAdapter Stream Grounding] Injected ${searchResult.sources.length} sources into context.`);
        } else if (intent.freshSearchRequired) {
          const notice = "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.";
          const noticeChunkId = `chunk-${Date.now()}`;
          onChunk({
            id: noticeChunkId,
            delta: notice,
            done: false,
            modelId: adapterReq.providerModelId || 'gemini-3.8-flash',
            providerId: 'gemini'
          });
          onChunk({
            id: noticeChunkId,
            delta: "",
            done: true,
            modelId: adapterReq.providerModelId || 'gemini-3.8-flash',
            providerId: 'gemini',
            webSearchPerformed: false
          } as any);

          return {
            content: notice,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: adapterReq.providerModelId || 'gemini-3.8-flash', unverifiedNotice: true }
          };
        }
      } catch (searchErr) {
        if (intent.freshSearchRequired) {
          const notice = "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.";
          const noticeChunkId = `chunk-${Date.now()}`;
          onChunk({
            id: noticeChunkId,
            delta: notice,
            done: false,
            modelId: adapterReq.providerModelId || 'gemini-3.8-flash',
            providerId: 'gemini'
          });
          onChunk({
            id: noticeChunkId,
            delta: "",
            done: true,
            modelId: adapterReq.providerModelId || 'gemini-3.8-flash',
            providerId: 'gemini',
            webSearchPerformed: false
          } as any);

          return {
            content: notice,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'googleSearch',
            intentCategory: intent.intentCategory,
            rawResponse: { model: adapterReq.providerModelId || 'gemini-3.8-flash', unverifiedNotice: true }
          };
        }
      }
    }

    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        console.log(`[Trace Stream] Gemini Request: Sending generateContentStream to model "${modelName}"...`);

        const responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config
        });

        let fullContent = "";
        let lastCandidate: any = null;
        let lastGroundingMetadata: any = null;
        const chunkId = `chunk-${Date.now()}`;

        for await (const chunk of responseStream) {
          let text = typeof chunk.text === 'string' ? chunk.text : '';
          if (!text && chunk.candidates?.[0]?.content?.parts) {
            text = chunk.candidates[0].content.parts
              .filter((p: any) => typeof p.text === 'string')
              .map((p: any) => p.text)
              .join('');
          }
          if (text) {
            fullContent += text;
            onChunk({
              id: chunkId,
              delta: text,
              done: false,
              modelId: modelName,
              providerId: 'gemini',
              groundingSources: accumulatedSources.length > 0 ? accumulatedSources : undefined
            } as any);
          }

          const cand = chunk.candidates?.[0];
          const gm = cand?.groundingMetadata || (chunk as any)?.groundingMetadata;
          if (gm) {
            if (!lastGroundingMetadata) {
              lastGroundingMetadata = gm;
            } else {
              lastGroundingMetadata = {
                ...lastGroundingMetadata,
                ...gm,
                groundingChunks: gm.groundingChunks || lastGroundingMetadata.groundingChunks,
                webSearchQueries: gm.webSearchQueries || lastGroundingMetadata.webSearchQueries
              };
            }
          }
        }

        console.log(`[Trace Stream] Gemini Stream complete from model "${modelName}". Total chars: ${fullContent.length}`);

        // Parse citation sources from groundingMetadata
        const groundingSources: GroundingSource[] = [];
        const groundingChunks = lastGroundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks)) {
          for (const chunk of groundingChunks) {
            const uri = chunk.web?.uri || chunk.web?.url;
            if (uri) {
              groundingSources.push({
                title: chunk.web?.title || uri,
                url: uri
              });
            }
          }
        }

        const combinedSources = [...accumulatedSources, ...groundingSources];
        const uniqueSourcesMap = new Map<string, GroundingSource>();
        combinedSources.forEach(s => {
          if (s.url && !uniqueSourcesMap.has(s.url)) {
            uniqueSourcesMap.set(s.url, s);
          }
        });
        const finalGroundingSources = Array.from(uniqueSourcesMap.values());
        const webSearchQueries = lastGroundingMetadata?.webSearchQueries;
        const hasGoogleSearchTool = Boolean(config.tools && config.tools.length > 0);
        let actuallyWebSearched = finalGroundingSources.length > 0 || webSearchPerformed || (Array.isArray(webSearchQueries) && webSearchQueries.length > 0);
        let searchProviderUsed = actuallyWebSearched ? 'googleSearch' : 'none';

        // Strict Grounding Validation: If this was a time-sensitive query and live Google Search returned no grounding, do not output unverified outdated answer
        if (intent.freshSearchRequired && !actuallyWebSearched) {
          const notice = "I couldn't verify the current information because live web search is unavailable right now. Please try again in a moment.";
          onChunk({
            id: chunkId,
            delta: notice,
            done: false,
            modelId: modelName,
            providerId: 'gemini'
          });
          onChunk({
            id: chunkId,
            delta: "",
            done: true,
            modelId: modelName,
            providerId: 'gemini',
            webSearchPerformed: false
          } as any);

          return {
            content: notice,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
            groundingSources: undefined,
            webSearchPerformed: false,
            freshSearchRequired: true,
            searchProvider: 'none',
            intentCategory: intent.intentCategory,
            rawResponse: { model: modelName, unverifiedNotice: true }
          };
        }

        console.log(`[Trace Stream Grounding Result]: Sources=${finalGroundingSources.length}, Provider=${searchProviderUsed}, WebSearched=${actuallyWebSearched}`);

        onChunk({
          id: chunkId,
          delta: "",
          done: true,
          modelId: modelName,
          providerId: 'gemini',
          groundingSources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
          sources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
          webSearchPerformed: actuallyWebSearched
        } as any);

        return {
          content: fullContent,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          finishReason: 'stop',
          groundingSources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
          webSearchPerformed: actuallyWebSearched,
          freshSearchRequired: intent.freshSearchRequired,
          searchProvider: searchProviderUsed,
          intentCategory: intent.intentCategory,
          rawResponse: {
            model: modelName,
            isFallback: modelName !== modelsToTry[0],
            groundingMetadata: lastGroundingMetadata
          }
        };

      } catch (error: any) {
        lastError = error;
        const errorText = JSON.stringify(error?.response?.data || error?.message || error);
        console.warn(`[GeminiAdapter Stream] Node [${modelName}] failed (${errorText.slice(0, 120)}...). Trying next model.`);
      }
    }

    throw lastError || new Error("Gemini streaming execution failed on all nodes.");
  }
}



