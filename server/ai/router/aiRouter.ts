import { IAIRouter, RouteResolution } from './baseRouter';
import { AIRequest, AIResponse, StreamingChunk, AdapterResponse } from '../types';
import { getModelConfig } from '../config/modelRegistry';
import { getProviderConfig } from '../config/providerRegistry';
import { BaseProviderAdapter } from '../adapters/baseAdapter';
import { GeminiAdapter } from '../adapters/geminiAdapter';
import { OpenRouterAdapter } from '../adapters/openrouterAdapter';
import { BaseResponseNormalizer } from '../normalizers/baseNormalizer';
import { BaseTelemetryLogger } from '../telemetry/baseTelemetry';

/**
 * Determines whether an execution error on a provider is transient/retryable,
 * allowing failover to the next registered candidate provider.
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.statusCode || error.response?.status;
  if (status) {
    const numStatus = Number(status);
    if ([429, 408, 404, 500, 502, 503, 504].includes(numStatus)) {
      return true;
    }
    if ([400, 401, 403].includes(numStatus)) {
      return false;
    }
  }

  const errStr = String(error.message || error.stack || error || '').toLowerCase();

  return (
    errStr.includes('429') ||
    errStr.includes('408') ||
    errStr.includes('404') ||
    errStr.includes('500') ||
    errStr.includes('502') ||
    errStr.includes('503') ||
    errStr.includes('504') ||
    errStr.includes('quota') ||
    errStr.includes('resource_exhausted') ||
    errStr.includes('overloaded') ||
    errStr.includes('rate limit') ||
    errStr.includes('rate_limit') ||
    errStr.includes('too many requests') ||
    errStr.includes('intermittent') ||
    errStr.includes('high demand') ||
    errStr.includes('timeout') ||
    errStr.includes('abort') ||
    errStr.includes('econnreset') ||
    errStr.includes('etimedout') ||
    errStr.includes('fetch failed') ||
    errStr.includes('network') ||
    errStr.includes('unavailable') ||
    errStr.includes('throttled') ||
    errStr.includes('not found') ||
    errStr.includes('unsupported')
  );
}

export class AIRouter implements IAIRouter {
  private adapters: Map<string, BaseProviderAdapter>;
  private normalizer: BaseResponseNormalizer;
  private telemetry: BaseTelemetryLogger;

  constructor() {
    this.adapters = new Map<string, BaseProviderAdapter>([
      ['gemini', new GeminiAdapter()]
    ]);
    this.normalizer = new BaseResponseNormalizer();
    this.telemetry = new BaseTelemetryLogger();
  }

  /**
   * Resolves the request exclusively to Google Gemini with native Google Search grounding.
   * OpenRouter and other alternative providers are permanently disabled.
   */
  resolveRoute(request: AIRequest): RouteResolution {
    const rawRequestedModel = (request.modelId || 'gemini-2.5-flash').trim();
    let providerModelId = 'gemini-2.5-flash';

    if (rawRequestedModel.startsWith('gemini') || rawRequestedModel.startsWith('models/gemini')) {
      const clean = rawRequestedModel.replace(/^models\//, '');
      if (clean === 'gemini-3.8-flash') {
        providerModelId = 'gemini-3.8-flash';
      } else if (clean === 'gemini-flash-latest' || clean === 'gemini-flash') {
        providerModelId = 'gemini-flash-latest';
      } else {
        providerModelId = 'gemini-2.5-flash';
      }
    } else {
      providerModelId = 'gemini-2.5-flash';
    }

    return {
      modelId: rawRequestedModel === 'auto' ? 'auto' : providerModelId,
      primaryProviderId: 'gemini',
      primaryProviderModelId: providerModelId,
      fallbackProviders: [] // Strictly no OpenRouter or external provider failover
    };
  }

  /**
   * Execute AI Request with sequential failover across resolved candidate providers.
   */
  async executeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const route = this.resolveRoute(request);

    // Build ordered list of provider candidates to attempt
    const candidateChain = [
      { providerId: route.primaryProviderId, providerModelId: route.primaryProviderModelId },
      ...route.fallbackProviders
    ];

    const failedProviders: string[] = [];
    let lastError: any = null;
    let attemptCount = 0;

    for (let i = 0; i < candidateChain.length; i++) {
      const candidate = candidateChain[i];
      attemptCount++;

      const adapter = this.adapters.get(candidate.providerId);
      if (!adapter) {
        const err = new Error(`No adapter registered for provider "${candidate.providerId}".`);
        failedProviders.push(candidate.providerId);
        lastError = err;
        continue;
      }

      try {
        console.log(`[AIRouter] Attempt ${attemptCount}/${candidateChain.length}: Executing via provider "${candidate.providerId}" (Model: "${candidate.providerModelId}").`);

        const adapterResponse = await adapter.execute({
          providerModelId: candidate.providerModelId,
          request
        });

        const latencyMs = Date.now() - startTime;
        const providerModelUsed = adapterResponse.rawResponse?.model || candidate.providerModelId;
        const isFallback = attemptCount > 1 || (adapterResponse.rawResponse?.isFallback ?? false);

        const normalizedResponse = this.normalizer.normalizeResponse(
          adapterResponse,
          route.modelId,
          candidate.providerId,
          providerModelUsed,
          latencyMs,
          attemptCount,
          isFallback
        );

        this.telemetry.logEvent({
          requestId: normalizedResponse.id,
          timestamp: Date.now(),
          modelId: route.modelId,
          selectedProviderId: candidate.providerId,
          attemptCount,
          fallbackOccurred: isFallback,
          failedProviders,
          latencyMs,
          tokenUsage: normalizedResponse.usage,
          success: true
        });

        return normalizedResponse;

      } catch (error: any) {
        lastError = error;
        failedProviders.push(candidate.providerId);
        const errorMsg = error?.message || String(error);

        console.warn(`[AIRouter] Provider "${candidate.providerId}" execution failed: ${errorMsg}`);

        const retryable = isRetryableError(error);
        const hasNextProvider = i < candidateChain.length - 1;

        if (retryable && hasNextProvider) {
          const nextCandidate = candidateChain[i + 1];
          this.telemetry.logFallback(
            `req-${Date.now()}`,
            route.modelId,
            candidate.providerId,
            nextCandidate.providerId,
            errorMsg
          );
          console.log(`[AIRouter] Failover engaged -> Moving from "${candidate.providerId}" to "${nextCandidate.providerId}".`);
          continue;
        } else {
          // Non-retryable error or exhausted all candidate providers
          break;
        }
      }
    }

    // All attempts failed or encountered non-retryable error
    const latencyMs = Date.now() - startTime;
    this.telemetry.logEvent({
      requestId: `err-${Date.now()}`,
      timestamp: Date.now(),
      modelId: route.modelId,
      selectedProviderId: candidateChain[attemptCount - 1]?.providerId || 'unknown',
      attemptCount,
      fallbackOccurred: attemptCount > 1,
      failedProviders,
      latencyMs,
      success: false,
      errorMessage: lastError?.message || String(lastError)
    });

    const primaryFailedProvider = candidateChain[0]?.providerId || 'gemini';
    if (route.modelId !== 'auto') {
      const err = new Error("Selected model is currently unavailable. Please choose another model.");
      (err as any).statusCode = 503;
      (err as any).originalError = lastError;
      throw err;
    }
    throw this.normalizer.normalizeError(lastError, primaryFailedProvider);
  }

  /**
   * Execute an AI request with native real-time token streaming and dynamic fallback
   */
  async executeStreamRequest(
    request: AIRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const route = this.resolveRoute(request);

    const candidateChain = [
      { providerId: route.primaryProviderId, providerModelId: route.primaryProviderModelId },
      ...route.fallbackProviders
    ];

    const failedProviders: string[] = [];
    let lastError: any = null;
    let attemptCount = 0;
    let chunkEmitted = false;

    const trackingOnChunk = (chunk: StreamingChunk) => {
      if (chunk.delta) {
        chunkEmitted = true;
      }
      onChunk(chunk);
    };

    for (let i = 0; i < candidateChain.length; i++) {
      const candidate = candidateChain[i];
      attemptCount++;

      const adapter = this.adapters.get(candidate.providerId);
      if (!adapter) {
        const err = new Error(`No adapter registered for provider "${candidate.providerId}".`);
        failedProviders.push(candidate.providerId);
        lastError = err;
        continue;
      }

      try {
        console.log(`[AIRouter Stream] Attempt ${attemptCount}/${candidateChain.length}: Streaming via provider "${candidate.providerId}" (Model: "${candidate.providerModelId}").`);

        let adapterResponse: AdapterResponse;

        if (typeof adapter.executeStream === 'function') {
          adapterResponse = await adapter.executeStream({
            providerModelId: candidate.providerModelId,
            request
          }, trackingOnChunk);
        } else {
          adapterResponse = await adapter.execute({
            providerModelId: candidate.providerModelId,
            request
          });
          if (adapterResponse.content) {
            trackingOnChunk({
              id: `chunk-${Date.now()}`,
              delta: adapterResponse.content,
              done: false,
              modelId: candidate.providerModelId,
              providerId: candidate.providerId
            });
          }
          trackingOnChunk({
            id: `chunk-${Date.now()}`,
            delta: '',
            done: true,
            modelId: candidate.providerModelId,
            providerId: candidate.providerId
          });
        }

        const latencyMs = Date.now() - startTime;
        const providerModelUsed = adapterResponse.rawResponse?.model || candidate.providerModelId;
        const isFallback = attemptCount > 1 || (adapterResponse.rawResponse?.isFallback ?? false);

        const normalizedResponse = this.normalizer.normalizeResponse(
          adapterResponse,
          route.modelId,
          candidate.providerId,
          providerModelUsed,
          latencyMs,
          attemptCount,
          isFallback
        );

        this.telemetry.logEvent({
          requestId: normalizedResponse.id,
          timestamp: Date.now(),
          modelId: route.modelId,
          selectedProviderId: candidate.providerId,
          attemptCount,
          fallbackOccurred: isFallback,
          failedProviders,
          latencyMs,
          tokenUsage: normalizedResponse.usage,
          success: true
        });

        return normalizedResponse;

      } catch (error: any) {
        lastError = error;
        failedProviders.push(candidate.providerId);
        const errorMsg = error?.message || String(error);

        console.warn(`[AIRouter Stream] Provider "${candidate.providerId}" streaming failed: ${errorMsg}`);

        // If chunks were already emitted to client, do not attempt to start a new stream over the same connection
        if (chunkEmitted) {
          break;
        }

        const retryable = isRetryableError(error);
        const hasNextProvider = i < candidateChain.length - 1;

        if (retryable && hasNextProvider) {
          const nextCandidate = candidateChain[i + 1];
          this.telemetry.logFallback(
            `req-${Date.now()}`,
            route.modelId,
            candidate.providerId,
            nextCandidate.providerId,
            errorMsg
          );
          console.log(`[AIRouter Stream] Failover engaged -> Moving from "${candidate.providerId}" to "${nextCandidate.providerId}".`);
          continue;
        } else {
          break;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    this.telemetry.logEvent({
      requestId: `err-${Date.now()}`,
      timestamp: Date.now(),
      modelId: route.modelId,
      selectedProviderId: candidateChain[attemptCount - 1]?.providerId || 'unknown',
      attemptCount,
      fallbackOccurred: attemptCount > 1,
      failedProviders,
      latencyMs,
      success: false,
      errorMessage: lastError?.message || String(lastError)
    });

    const primaryFailedProvider = candidateChain[0]?.providerId || 'gemini';
    if (route.modelId !== 'auto') {
      const err = new Error("Selected model is currently unavailable. Please choose another model.");
      (err as any).statusCode = 503;
      (err as any).originalError = lastError;
      throw err;
    }
    throw this.normalizer.normalizeError(lastError, primaryFailedProvider);
  }
}


