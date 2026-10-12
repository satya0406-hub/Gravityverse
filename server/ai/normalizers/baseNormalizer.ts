import { AdapterResponse, AIResponse } from '../types';

export interface IResponseNormalizer {
  normalizeResponse(
    adapterRes: AdapterResponse,
    modelId: string,
    providerId: string,
    providerModelId: string,
    latencyMs: number,
    attempts: number,
    isFallback: boolean
  ): AIResponse;

  normalizeError(error: any, providerId: string): Error;
}

export class BaseResponseNormalizer implements IResponseNormalizer {
  normalizeResponse(
    adapterRes: AdapterResponse,
    modelId: string,
    providerId: string,
    providerModelId: string,
    latencyMs: number,
    attempts: number,
    isFallback: boolean
  ): AIResponse {
    return {
      id: `res-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      modelId,
      providerId,
      providerModelId,
      content: adapterRes.content || '',
      usage: adapterRes.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      finishReason: adapterRes.finishReason || 'stop',
      isFallback,
      attempts,
      latencyMs,
      created: Date.now(),
      groundingSources: adapterRes.groundingSources,
      webSearchPerformed: adapterRes.webSearchPerformed,
      freshSearchRequired: adapterRes.freshSearchRequired,
      searchProvider: adapterRes.searchProvider,
      intentCategory: adapterRes.intentCategory
    };
  }

  normalizeError(error: any, providerId: string): Error {
    const message = error?.message || (typeof error === 'string' ? error : 'Unknown provider error');
    return new Error(`[Provider ${providerId}] ${message}`);
  }
}
