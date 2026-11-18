import { GoogleGenAI } from '@google/genai';
import { BaseProviderAdapter } from './baseAdapter';
import { AdapterRequest, AdapterResponse, ProviderConfig, GroundingSource, StreamingChunk } from '../types';
import { PROVIDER_REGISTRY } from '../config/providerRegistry';
import { analyzeUserIntent } from '../utils/intentAnalyzer';
import { buildAttachmentContext } from '../services/attachmentContextService';
import { logSearchDiagnostics, getLatestSearchDiagnostic } from '../services/searchDiagnosticService';

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

    // Enable Native Google Search Grounding: active for ordinary factual/informational queries
    // Enable Native Google Search Grounding: active for all factual and informational queries
    // Active by default to guarantee grounded accuracy unless explicitly disabled
    const isExplicitlyDisabled = metadata?.webSearch === false && metadata?.forceWebSearch !== true;
    const shouldEnableGoogleSearch = !isExplicitlyDisabled;

    // Resilient Model Selection:
    // Prioritize gemini-2.5-flash as the primary high-throughput grounded model,
    // backed by gemini-3.8-flash, gemini-flash-latest, and gemini-3.1-flash-lite in the failover chain.
    const isAutoMode = !request.modelId || request.modelId === 'auto';
    const rawRequestedModel = providerModelId && providerModelId !== 'auto' ? providerModelId : "gemini-2.5-flash";
    const requestedModel = rawRequestedModel.replace(/^models\//, '');
    
    // Standard chain prioritizes gemini-2.5-flash (active with googleSearch tool and quota)
    const standardChain = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let modelsToTry: string[];
    if (isAutoMode || requestedModel === 'auto' || requestedModel === 'gemini-flash' || requestedModel === 'gemini-2.5-flash' || requestedModel === 'gemini-3.5-flash' || requestedModel === 'gemini-3.8-flash') {
      modelsToTry = standardChain;
    } else {
      // Put requestedModel first, then standardChain without duplicates
      modelsToTry = Array.from(new Set([requestedModel, ...standardChain]));
    }

    const currentDateStr = new Date().toDateString();
    const currentYear = new Date().getFullYear();

    const defaultSystemInstruction = `You are GravityVerse Assistant, an advanced, highly intelligent AI companion.
Your goal is to provide accurate, helpful, well-reasoned, and grounded responses.
Today is ${currentDateStr} (Year: ${currentYear}).

Key Directives:
- REQUIRED RESPONSE FORMAT:
  1. Detailed Answer: Provide a clear, well-structured, informative answer with thorough explanations, relevant details, and examples wherever useful.
  2. Grounding in Real-World Data: Always rely on live information retrieved via the googleSearch tool for facts, figures, current events, institutions, and people.
  * The frontend displays verified interactive source cards with links and website names below your answer using the grounding metadata provided by the Google Search tool. Do not fabricate or invent fake URLs or sources.

- LIVE GOOGLE SEARCH GROUNDING:
  * You have live Google Search grounding enabled via the googleSearch tool.
  * ALWAYS use Google Search via the googleSearch tool to retrieve and ground your answers in live web facts for every factual, informational, or current inquiry.
  * For all questions regarding current office holders (e.g. Chief Minister, Prime Minister, President, CEO), breaking news, recent events, live scores, campus updates (e.g. SRMIST, SRM University), or fast-changing facts, you MUST ground your answer strictly in Google Search results.
  * Never rely on outdated static training data.

- Explanations & Style:
  * Provide thorough explanations, structured markdown headings, bullet points, and examples where appropriate.
  * Objective, professional, articulate tone.`;

    const finalSysInst = systemInstruction || defaultSystemInstruction;

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
    const webSearchPerformed = false;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });

          console.log(`[Trace] Gemini Request: Sending generateContent to model "${modelName}" (attempt ${attempt + 1})...`);

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
          const actuallyWebSearched = finalGroundingSources.length > 0 || (Array.isArray(webSearchQueries) && webSearchQueries.length > 0);
          const searchProviderUsed = actuallyWebSearched ? 'googleSearch' : 'none';

          // Record live server diagnostics without logging API keys or sensitive user data
          console.log(`[GeminiAdapter Grounding Check] Model: "${modelName}", SearchToolConfigured: ${hasGoogleSearchTool}`);
          console.log(`[GeminiAdapter Grounding Check] WebSearchQueries: ${JSON.stringify(webSearchQueries || [])}`);
          console.log(`[GeminiAdapter Grounding Check] GroundingSourcesExtracted: ${finalGroundingSources.length}`);
          console.log(`[GeminiAdapter Grounding Check] ActuallyWebSearched: ${actuallyWebSearched}, MandatorySearch: ${intent.freshSearchRequired}`);

          // If fresh search was required and live search failed or was not executed by model, reject unverified answer
          if (intent.freshSearchRequired && !actuallyWebSearched) {
            console.warn(`[GeminiAdapter Grounding Check] Verification FAILED for model "${modelName}": Mandatory search query produced no Google Search grounding.`);
            const isLastModel = modelsToTry.indexOf(modelName) === modelsToTry.length - 1;
            if (!isLastModel) {
              console.log(`[GeminiAdapter Grounding Check] Trying next model in chain to obtain Google Search grounding...`);
              break; // break attempt loop to try next model
            }

            console.warn(`[GeminiAdapter Grounding Check] All models failed grounding verification. Rejecting unverified answer.`);
            return {
              content: "I couldn't verify this answer using Google Search right now. Please try again.",
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

          console.log(`[GeminiAdapter Grounding Check] Verification PASSED for model "${modelName}": Grounded with ${finalGroundingSources.length} sources.`);

          // Extract text content safely: try response.text first, fall back to aggregating parts
          let extractedContent = typeof response.text === 'string' ? response.text : '';
          if (!extractedContent && candidate?.content?.parts) {
            extractedContent = candidate.content.parts
              .filter((p: any) => typeof p.text === 'string')
              .map((p: any) => p.text)
              .join('');
          }

          let diagEntry: any = null;
          if (actuallyWebSearched || intent.freshSearchRequired) {
            try {
              const rawItems = finalGroundingSources.map(s => ({
                title: s.title || s.url,
                url: s.url,
                snippet: s.title || s.url,
              }));
              const latestTavily = getLatestSearchDiagnostic(prompt);

              diagEntry = logSearchDiagnostics({
                query: prompt,
                provider: searchProviderUsed,
                status: actuallyWebSearched ? 'success' : 'failed',
                executionTimeMs: 0,
                tavilyApiResponse: latestTavily?.tavilyApiResponse || null,
                geminiGroundingInput: {
                  model: modelName,
                  systemInstruction: config.systemInstruction,
                  groundingPrompt: prompt,
                  injectedSnippets: rawItems.map(i => `${i.title}: ${i.snippet}`),
                  rawSnippetsText: rawItems.map(i => `${i.title}: ${i.snippet}`).join('\n'),
                  toolsConfigured: config.tools,
                  searchQueriesExecuted: webSearchQueries || [prompt],
                  candidateChunksCount: groundingChunks?.length || finalGroundingSources.length,
                  contextLengthChars: (extractedContent || '').length
                },
                rawMetadata: {
                  titles: finalGroundingSources.map(s => s.title || s.url),
                  snippets: rawItems.map(i => i.snippet),
                  urls: finalGroundingSources.map(s => s.url),
                  items: rawItems
                },
                aiResponseText: extractedContent || ''
              });
            } catch (e) {
              console.warn('[GeminiAdapter] Diagnostic log warning:', e);
            }
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
            searchDiagnostics: diagEntry,
            rawResponse: {
              model: modelName,
              isFallback: modelName !== modelsToTry[0],
              groundingMetadata
            }
          };

        } catch (error: any) {
          lastError = error;
          const isTransient = error?.status === 503 || String(error?.message || '').includes('503') || String(error?.message || '').includes('high demand');
          if (isTransient && attempt === 0) {
            console.log(`[GeminiAdapter] Model [${modelName}] temporary 503 high demand spike. Retrying in 1.2s...`);
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }
          const errorText = JSON.stringify(error?.response?.data || error?.message || error);
          console.warn(`[GeminiAdapter] Node [${modelName}] failed (${errorText.slice(0, 120)}...). Trying next model in fallback chain.`);
          break;
        }
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
    const webSearchPerformed = false;
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });

          console.log(`[Trace Stream] Gemini Request: Sending generateContentStream to model "${modelName}" (attempt ${attempt + 1})...`);

          const responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config
          });

          let fullContent = "";
          let lastCandidate: any = null;
          let lastGroundingMetadata: any = null;
          const chunkId = `chunk-${Date.now()}`;
          const bufferedDeltas: string[] = [];
          const isMandatorySearch = intent.freshSearchRequired;

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
              if (isMandatorySearch) {
                // Buffer response until grounding verification is complete for mandatory search requests
                bufferedDeltas.push(text);
              } else {
                // Non-mandatory search queries can stream directly
                onChunk({
                  id: chunkId,
                  delta: text,
                  done: false,
                  modelId: modelName,
                  providerId: 'gemini',
                  groundingSources: accumulatedSources.length > 0 ? accumulatedSources : undefined
                } as any);
              }
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
          const actuallyWebSearched = finalGroundingSources.length > 0 || (Array.isArray(webSearchQueries) && webSearchQueries.length > 0);
          const searchProviderUsed = actuallyWebSearched ? 'googleSearch' : 'none';

          // Check the live server logs - record diagnostics without logging API keys or sensitive user data
          console.log(`[GeminiAdapter Stream Grounding Check] Model: "${modelName}", SearchToolConfigured: ${hasGoogleSearchTool}`);
          console.log(`[GeminiAdapter Stream Grounding Check] WebSearchQueries: ${JSON.stringify(webSearchQueries || [])}`);
          console.log(`[GeminiAdapter Stream Grounding Check] GroundingSourcesExtracted: ${finalGroundingSources.length}`);
          console.log(`[GeminiAdapter Stream Grounding Check] ActuallyWebSearched: ${actuallyWebSearched}, MandatorySearch: ${isMandatorySearch}`);

          // Strict Grounding Validation: If search was required and Google Search returned no grounding, reject unverified outdated answer
          if (isMandatorySearch && !actuallyWebSearched) {
            console.warn(`[GeminiAdapter Stream Grounding Check] Verification FAILED for model "${modelName}": Mandatory search query produced no Google Search grounding.`);
            const isLastModel = modelsToTry.indexOf(modelName) === modelsToTry.length - 1;
            if (!isLastModel) {
              console.log(`[GeminiAdapter Stream Grounding Check] Trying next model in chain to obtain Google Search grounding...`);
              break; // break attempt loop to try next model
            }

            console.warn(`[GeminiAdapter Stream Grounding Check] All models failed grounding verification. Rejecting unverified answer.`);
            const notice = "I couldn't verify this answer using Google Search right now. Please try again.";
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

          console.log(`[GeminiAdapter Stream Grounding Check] Verification PASSED for model "${modelName}": Grounded with ${finalGroundingSources.length} sources.`);

          // If mandatory search was buffered, flush the verified chunks now along with the verified sources
          if (isMandatorySearch && bufferedDeltas.length > 0) {
            for (const delta of bufferedDeltas) {
              onChunk({
                id: chunkId,
                delta,
                done: false,
                modelId: modelName,
                providerId: 'gemini',
                groundingSources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined
              } as any);
            }
          }

          let streamDiagEntry: any = null;
          if (actuallyWebSearched || intent.freshSearchRequired) {
            try {
              const rawItems = finalGroundingSources.map(s => ({
                title: s.title || s.url,
                url: s.url,
                snippet: s.title || s.url,
              }));
              const latestTavily = getLatestSearchDiagnostic(prompt);

              streamDiagEntry = logSearchDiagnostics({
                query: prompt,
                provider: searchProviderUsed,
                status: actuallyWebSearched ? 'success' : 'failed',
                executionTimeMs: 0,
                tavilyApiResponse: latestTavily?.tavilyApiResponse || null,
                geminiGroundingInput: {
                  model: modelName,
                  systemInstruction: config.systemInstruction,
                  groundingPrompt: prompt,
                  injectedSnippets: rawItems.map(i => `${i.title}: ${i.snippet}`),
                  rawSnippetsText: rawItems.map(i => `${i.title}: ${i.snippet}`).join('\n'),
                  toolsConfigured: config.tools,
                  searchQueriesExecuted: webSearchQueries || [prompt],
                  candidateChunksCount: lastGroundingMetadata?.groundingChunks?.length || finalGroundingSources.length,
                  contextLengthChars: fullContent.length
                },
                rawMetadata: {
                  titles: finalGroundingSources.map(s => s.title || s.url),
                  snippets: rawItems.map(i => i.snippet),
                  urls: finalGroundingSources.map(s => s.url),
                  items: rawItems
                },
                aiResponseText: fullContent
              });
            } catch (e) {
              console.warn('[GeminiAdapter Stream] Diagnostic log warning:', e);
            }
          }

          onChunk({
            id: chunkId,
            delta: "",
            done: true,
            modelId: modelName,
            providerId: 'gemini',
            groundingSources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
            sources: finalGroundingSources.length > 0 ? finalGroundingSources : undefined,
            webSearchPerformed: actuallyWebSearched,
            searchDiagnostics: streamDiagEntry
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
            searchDiagnostics: streamDiagEntry,
            rawResponse: {
              model: modelName,
              isFallback: modelName !== modelsToTry[0],
              groundingMetadata: lastGroundingMetadata
            }
          };

        } catch (error: any) {
          lastError = error;
          const isTransient = error?.status === 503 || String(error?.message || '').includes('503') || String(error?.message || '').includes('high demand');
          if (isTransient && attempt === 0) {
            console.log(`[GeminiAdapter Stream] Model [${modelName}] temporary 503 high demand spike. Retrying in 1.2s...`);
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }
          const errorText = JSON.stringify(error?.response?.data || error?.message || error);
          console.warn(`[GeminiAdapter Stream] Node [${modelName}] failed (${errorText.slice(0, 120)}...). Trying next model.`);
          break;
        }
      }
    }

    throw lastError || new Error("Gemini streaming execution failed on all nodes.");
  }
}



