import { AIRequest, AIResponse, StreamingChunk } from '../types';

export interface RouteResolution {
  modelId: string;
  primaryProviderId: string;
  primaryProviderModelId: string;
  fallbackProviders: Array<{
    providerId: string;
    providerModelId: string;
    priority: number;
  }>;
}

export interface IAIRouter {
  resolveRoute(request: AIRequest): RouteResolution;
  executeRequest(request: AIRequest): Promise<AIResponse>;
  executeStream?(request: AIRequest, onChunk: (chunk: StreamingChunk) => void): Promise<AIResponse>;
}

export class BaseAIRouter implements IAIRouter {
  resolveRoute(request: AIRequest): RouteResolution {
    // Placeholder resolution mapping for Phase 1
    return {
      modelId: request.modelId || 'auto',
      primaryProviderId: 'gemini',
      primaryProviderModelId: 'gemini-3.8-flash',
      fallbackProviders: [
        { providerId: 'openrouter', providerModelId: 'google/gemini-2.0-flash-exp:free', priority: 2 },
        { providerId: 'the-old-llm', providerModelId: 'auto-default', priority: 3 }
      ]
    };
  }

  async executeRequest(request: AIRequest): Promise<AIResponse> {
    throw new Error('AIRouter execution not yet active in Phase 1. Existing endpoints continue using primary handler.');
  }
}
