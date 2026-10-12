export type Capability = 
  | 'text'
  | 'vision'
  | 'image-generation'
  | 'video-generation'
  | 'audio'
  | 'reasoning'
  | 'coding'
  | 'function-calling'
  | 'long-context'
  | 'streaming'
  | 'json-mode';

export interface ProviderCapabilities {
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  audio: boolean;
  reasoning: boolean;
  coding: boolean;
  functionCalling: boolean;
  longContext: boolean;
  streaming: boolean;
  jsonMode: boolean;
}

export interface ModelCapabilities {
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  audio: boolean;
  reasoning: boolean;
  coding: boolean;
  functionCalling: boolean;
  longContext: boolean;
  streaming: boolean;
  jsonMode: boolean;
}

export type AuthenticationType = 'api-key' | 'oauth2' | 'bearer-token' | 'none';

export type ProviderStatus = 'online' | 'degraded' | 'offline' | 'maintenance';

export interface ProviderRetryPolicy {
  maxRetries: number;
  backoffFactorMs: number;
}

export interface ProviderRateLimitInfo {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface ProviderConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  authType: AuthenticationType;
  apiEndpoint?: string;
  capabilities: ProviderCapabilities;
  status: ProviderStatus;
  priority: number;
  timeoutMs: number;
  retryPolicy: ProviderRetryPolicy;
  rateLimitInfo: ProviderRateLimitInfo;
  isFree: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsReasoning: boolean;
}

export type ModelCategory = 'general' | 'reasoning' | 'coding' | 'creative' | 'multimodal' | 'fast' | 'heavy';

export interface ProviderMapping {
  providerId: string;
  providerModelId: string;
  priority: number; // 1 = Primary, 2 = Fallback, etc.
  isFree: boolean;
  notes?: string;
}

export interface ModelConfig {
  id: string;
  displayName: string;
  description: string;
  badge?: string;
  category: ModelCategory;
  capabilities: ModelCapabilities;
  isFree: boolean;
  recommended: boolean;
  hidden: boolean;
  deprecated: boolean;
  contextWindow: number;
  providerMappings: ProviderMapping[];
}

export interface ChatMessageContentPart {
  type: 'text' | 'image_url' | 'input_audio' | 'file';
  text?: string;
  imageUrl?: { url: string; detail?: string };
  fileData?: { mimeType: string; data: string; name?: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatMessageContentPart[];
  name?: string;
}

export interface AttachmentPayload {
  id?: string;
  attachmentId?: string;
  name: string;
  type: string;
  size: number;
  data?: string;
  textContents?: string;
  extractedText?: string;
  pageCount?: number;
  extractionStatus?: 'success' | 'partial' | 'empty' | 'unsupported' | 'error';
  createdAt?: string | number | Date;
}

export interface AIRequest {
  modelId: string;
  prompt?: string;
  messages: ChatMessage[];
  attachments?: AttachmentPayload[];
  conversationAttachments?: AttachmentPayload[];
  chatId?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface UsageInformation {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface GroundingSource {
  title?: string;
  url: string;
}

export interface AIResponse {
  id: string;
  modelId: string;
  providerId: string;
  providerModelId: string;
  content: string;
  usage?: UsageInformation;
  finishReason?: string;
  isFallback: boolean;
  attempts: number;
  latencyMs: number;
  created: number;
  groundingSources?: GroundingSource[];
  webSearchPerformed?: boolean;
  freshSearchRequired?: boolean;
  searchProvider?: string;
  intentCategory?: string;
}

export interface StreamingChunk {
  id: string;
  delta: string;
  done: boolean;
  modelId?: string;
  providerId?: string;
}

export interface AdapterRequest {
  providerModelId: string;
  request: AIRequest;
}

export interface AdapterResponse {
  content: string;
  usage?: UsageInformation;
  finishReason?: string;
  rawResponse?: any;
  groundingSources?: GroundingSource[];
  webSearchPerformed?: boolean;
  freshSearchRequired?: boolean;
  searchProvider?: string;
  intentCategory?: string;
}

export interface TelemetryLogEvent {
  requestId: string;
  timestamp: number;
  modelId: string;
  selectedProviderId: string;
  attemptCount: number;
  fallbackOccurred: boolean;
  failedProviders: string[];
  latencyMs: number;
  tokenUsage?: UsageInformation;
  success: boolean;
  errorMessage?: string;
}
