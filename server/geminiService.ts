import { GoogleGenAI } from '@google/genai';

export interface GroundingSource {
  title: string;
  url: string;
}

export interface GeminiChatMessage {
  role: 'user' | 'assistant' | 'model';
  content?: string;
  text?: string;
}

export interface GeminiAttachment {
  name?: string;
  type?: string;
  size?: number;
  data?: string;
  textContents?: string;
}

export interface GeminiChatParams {
  prompt: string;
  messages?: GeminiChatMessage[];
  attachments?: GeminiAttachment[];
  model?: string;
  webSearch?: boolean;
  systemInstruction?: string;
}

export interface GeminiChatResult {
  success: boolean;
  text: string;
  answer: string;
  model: string;
  sources: GroundingSource[];
  groundingSources: GroundingSource[];
  webSearchQueries: string[];
  webSearchPerformed: boolean;
}

/**
 * Validates and retrieves the Gemini API client.
 * Strictly server-side only; never exposes keys to browser.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();

  if (
    !apiKey ||
    apiKey === 'undefined' ||
    apiKey === 'null' ||
    apiKey === 'your_key_here' ||
    apiKey === 'my_gemini_api_key'
  ) {
    throw new Error(
      'Gemini API key is not configured on the server. Please ensure GEMINI_API_KEY is defined in environment variables.'
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

/**
 * Normalizes user-specified or default Gemini model names.
 * Ensures models are currently supported Gemini models.
 */
export function resolveGeminiModel(requestedModel?: string): string {
  if (!requestedModel || requestedModel === 'auto' || requestedModel === 'gemini-flash') {
    return 'gemini-3.8-flash';
  }

  const clean = requestedModel.replace(/^models\//, '').trim();

  if (clean === 'gemini-2.5-flash' || clean === 'gemini-2-5-flash') {
    return 'gemini-2.5-flash';
  }
  if (clean === 'gemini-3.1-flash-lite' || clean === 'gemini-3-1-flash-lite') {
    return 'gemini-3.1-flash-lite';
  }
  if (clean === 'gemini-3.1-pro-preview' || clean === 'gemini-pro') {
    return 'gemini-3.1-pro-preview';
  }
  if (clean === 'gemini-3.8-flash' || clean === 'gemini-3-8-flash') {
    return 'gemini-3.8-flash';
  }

  // Fallback to recommended gemini-3.8-flash
  return 'gemini-3.8-flash';
}

/**
 * Builds alternating user/model contents payload from conversation history,
 * current prompt, and attachments.
 */
export function buildGeminiContents(
  prompt: string,
  history: GeminiChatMessage[] = [],
  attachments: GeminiAttachment[] = []
): Array<{ role: 'user' | 'model'; parts: any[] }> {
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  // 1. Process prior conversation turns
  if (history && history.length > 0) {
    for (const msg of history) {
      const role: 'user' | 'model' =
        msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
      const text = typeof msg.content === 'string' ? msg.content : (msg.text || '');

      if (text && text.trim()) {
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
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

  // 2. Prepare user parts for the current turn (attachments + prompt)
  const currentTurnParts: any[] = [];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      // Check for image attachment
      if (att.type?.startsWith('image/') && att.data) {
        const cleanBase64 = att.data.includes('base64,')
          ? att.data.split('base64,')[1]
          : att.data;
        if (cleanBase64.trim()) {
          currentTurnParts.push({
            inlineData: {
              mimeType: att.type,
              data: cleanBase64.trim()
            }
          });
        }
      } else if (att.textContents && att.textContents.trim()) {
        currentTurnParts.push({
          text: `[Attached Document: ${att.name || 'document'}]\n${att.textContents.trim()}`
        });
      }
    }
  }

  const promptText = (prompt || '').trim();
  if (promptText) {
    currentTurnParts.push({ text: promptText });
  } else if (currentTurnParts.length === 0) {
    currentTurnParts.push({ text: 'Hello!' });
  }

  // Ensure alternating roles with the current turn as user
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    contents[contents.length - 1].parts.push(...currentTurnParts);
  } else {
    contents.push({
      role: 'user',
      parts: currentTurnParts
    });
  }

  return contents;
}

/**
 * Extracts verified sources and search queries from Gemini GroundingMetadata.
 * Strictly adheres to Google Grounding with Google Search specs.
 */
export function extractGroundingSources(groundingMetadata: any): {
  sources: GroundingSource[];
  queries: string[];
} {
  const sources: GroundingSource[] = [];
  const queries: string[] = Array.isArray(groundingMetadata?.webSearchQueries)
    ? groundingMetadata.webSearchQueries
    : [];

  const chunks = groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const uri = chunk.web?.uri || chunk.web?.url;
      if (uri && typeof uri === 'string') {
        sources.push({
          title: chunk.web?.title || uri,
          url: uri
        });
      }
    }
  }

  // Deduplicate sources by URL
  const seenUrls = new Set<string>();
  const uniqueSources: GroundingSource[] = [];
  for (const item of sources) {
    if (item.url && !seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueSources.push(item);
    }
  }

  return { sources: uniqueSources, queries };
}

const DEFAULT_SYSTEM_INSTRUCTION = `You are Gravityverse AI, a professional, highly intelligent multimodal academic assistant for university students and developers.
Directives:
1. Explain clearly with intuitive breakdowns, step-by-step logic, and structured Markdown headers.
2. Provide clean code blocks with syntax highlighting and clear comments when assisting with programming.
3. Multimodal Analysis: When analyzing attached documents, code, spreadsheets, or images, reference specific details directly and provide actionable insights.
4. Google Search Grounding: You have access to Google Search grounding tool. When inquiries touch on real-world facts, recent events, people, leadership, campus news, or temporal information, use Google Search data to provide up-to-date, grounded answers.
5. Tone: Precise, academic, supportive, and natural.`;

/**
 * Executes a non-streaming Gemini chat request with native Google Search Grounding.
 */
export async function generateGeminiChat(
  params: GeminiChatParams
): Promise<GeminiChatResult> {
  const ai = getGeminiClient();
  const model = resolveGeminiModel(params.model);
  const contents = buildGeminiContents(params.prompt, params.messages, params.attachments);

  const enableSearch = params.webSearch !== false;
  const config: any = {
    systemInstruction: params.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  };

  if (enableSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  console.log(`[GeminiService] Executing generateContent on model "${model}" (Search Grounding: ${enableSearch})`);

  const response = await ai.models.generateContent({
    model,
    contents,
    config
  });

  const text = response.text || '';
  const candidate = response.candidates?.[0];
  const groundingMetadata =
    (candidate as any)?.groundingMetadata || (response as any)?.groundingMetadata;

  const { sources, queries } = extractGroundingSources(groundingMetadata);
  const webSearchPerformed = sources.length > 0 || queries.length > 0;

  console.log(
    `[GeminiService] Response received. Length: ${text.length}, Grounding Sources: ${sources.length}, Queries: ${queries.length}`
  );

  return {
    success: true,
    text,
    answer: text,
    model,
    sources,
    groundingSources: sources,
    webSearchQueries: queries,
    webSearchPerformed
  };
}

/**
 * Executes a streaming Gemini chat request with native Google Search Grounding.
 * Invokes onChunk callback as text deltas arrive.
 */
export async function generateGeminiChatStream(
  params: GeminiChatParams,
  onChunk: (delta: string, model: string) => void
): Promise<GeminiChatResult> {
  const ai = getGeminiClient();
  const model = resolveGeminiModel(params.model);
  const contents = buildGeminiContents(params.prompt, params.messages, params.attachments);

  const enableSearch = params.webSearch !== false;
  const config: any = {
    systemInstruction: params.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  };

  if (enableSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  console.log(`[GeminiService Stream] Executing generateContentStream on model "${model}" (Search Grounding: ${enableSearch})`);

  const responseStream = await ai.models.generateContentStream({
    model,
    contents,
    config
  });

  let fullText = '';
  let lastGroundingMetadata: any = null;

  for await (const chunk of responseStream) {
    const delta = chunk.text || '';
    if (delta) {
      fullText += delta;
      onChunk(delta, model);
    }

    const cand = chunk.candidates?.[0];
    const gm = (cand as any)?.groundingMetadata || (chunk as any)?.groundingMetadata;
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

  const { sources, queries } = extractGroundingSources(lastGroundingMetadata);
  const webSearchPerformed = sources.length > 0 || queries.length > 0;

  console.log(
    `[GeminiService Stream] Stream completed. Total length: ${fullText.length}, Sources: ${sources.length}, Queries: ${queries.length}`
  );

  return {
    success: true,
    text: fullText,
    answer: fullText,
    model,
    sources,
    groundingSources: sources,
    webSearchQueries: queries,
    webSearchPerformed
  };
}

/**
 * Maps raw Gemini errors to user-friendly error messages.
 */
export function normalizeGeminiError(error: any): { message: string; status: number } {
  if (!error) {
    return { message: 'An unknown error occurred while contacting AI Assistant.', status: 500 };
  }

  const msg = String(error.message || error);
  const status = error.status || error.statusCode || 500;

  if (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('RESOURCE_EXHAUSTED')
  ) {
    return {
      message: 'Gemini API rate limit or quota exceeded. Please wait a moment and try again.',
      status: 429
    };
  }

  if (
    msg.includes('API_KEY_INVALID') ||
    msg.includes('API key not valid') ||
    msg.includes('Gemini API key is not configured')
  ) {
    return {
      message: 'Gemini API key is not valid or not configured on the server.',
      status: 401
    };
  }

  if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('ECONNREFUSED')) {
    return {
      message: 'Network error connecting to Gemini API. Please check your internet connection.',
      status: 503
    };
  }

  return {
    message: msg.slice(0, 200) || 'AI Assistant encountered an unexpected error. Please try again.',
    status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500
  };
}
