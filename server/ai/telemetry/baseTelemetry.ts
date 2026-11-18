import { TelemetryLogEvent } from '../types';

export interface ITelemetryLogger {
  logEvent(event: TelemetryLogEvent): void;
  logFallback(requestId: string, modelId: string, failedProviderId: string, nextProviderId: string, errorMsg: string): void;
}

export class BaseTelemetryLogger implements ITelemetryLogger {
  logEvent(event: TelemetryLogEvent): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AI Telemetry] Req:${event.requestId} Model:${event.modelId} Provider:${event.selectedProviderId} Attempts:${event.attemptCount} Latency:${event.latencyMs}ms Success:${event.success}`);
    }
  }

  logFallback(requestId: string, modelId: string, failedProviderId: string, nextProviderId: string, errorMsg: string): void {
    console.warn(`[AI Telemetry Fallback] Req:${requestId} Model:${modelId} FailedProvider:${failedProviderId} -> Falling back to:${nextProviderId}. Cause: ${errorMsg}`);
  }
}
