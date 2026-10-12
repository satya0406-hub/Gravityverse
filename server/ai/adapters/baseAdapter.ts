import { AdapterRequest, AdapterResponse, StreamingChunk, ProviderConfig } from '../types';

export abstract class BaseProviderAdapter {
  abstract readonly providerId: string;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Check if credentials or required client SDKs are initialized
   */
  abstract isConfigured(customKey?: string): boolean;

  /**
   * Execute a unary completion request
   */
  abstract execute(adapterReq: AdapterRequest): Promise<AdapterResponse>;

  /**
   * Execute a streaming completion request (optional override)
   */
  async executeStream?(
    adapterReq: AdapterRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<AdapterResponse>;

  public getConfig(): ProviderConfig {
    return this.config;
  }
}
