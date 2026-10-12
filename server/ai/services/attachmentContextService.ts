import { AttachmentPayload, ModelConfig } from '../types';
import { getModelConfig } from '../config/modelRegistry';
import { getDb, FieldValue } from '../../firebaseAdmin';

export interface VisionImagePayload {
  name: string;
  mimeType: string;
  base64Data: string;
  dataUrl: string;
}

export interface AttachmentContextResult {
  /**
   * The canonical formatted string representing all text/document attachments.
   */
  canonicalDocumentContext: string;

  /**
   * The user query augmented with the canonical attachment context.
   */
  augmentedPrompt: string;

  /**
   * Validated vision images (populated only when the target model supports vision).
   */
  visionImages: VisionImagePayload[];

  /**
   * Explanatory notices for attached images when using a text-only model.
   */
  unsupportedVisionNotices: string[];

  /**
   * Whether the target model supports vision/image inputs.
   */
  supportsVision: boolean;

  /**
   * True if one or more text documents with extracted text are present.
   */
  hasTextDocuments: boolean;

  /**
   * True if one or more vision images were accepted.
   */
  hasVisionImages: boolean;

  /**
   * Number of attachments processed and included.
   */
  totalAttachmentsProcessed: number;

  /**
   * Number of active persistent documents in this conversation.
   */
  activeDocumentCount: number;

  /**
   * Number of documents retrieved and injected into prompt context.
   */
  retrievedDocumentCount: number;

  /**
   * Total length of extracted text across all included documents.
   */
  extractedTextLength: number;

  /**
   * List of attachment IDs or identifiers included in the context.
   */
  attachmentIds: string[];

  /**
   * Origin source of the attachment context (firestore, hybrid, etc.)
   */
  retrievalSource: string;
}

export interface AttachmentContextOptions {
  modelId: string;
  providerId?: string;
  userPrompt?: string;
  isAutoMode?: boolean;
  conversationId?: string;
  chatId?: string;
  userId?: string;
  authenticatedUid?: string;
  conversationAttachments?: Array<AttachmentPayload | any>;
  retrievalSource?: string;
}

/**
 * Authoritative Firestore Attachment Resolver.
 * Retrieves all persistent attachments for an authenticated user's conversation directly from Firestore.
 * This guarantees context recovery across server restarts, cold starts, reconnects, and conversation re-openings.
 */
export async function fetchFirestoreConversationAttachments(
  authenticatedUid: string,
  chatId: string
): Promise<AttachmentPayload[]> {
  if (!authenticatedUid || !chatId) return [];

  const db = getDb();
  if (!db) {
    console.warn(`[Attachment Persistence] Firestore database instance is unavailable.`);
    return [];
  }

  try {
    const attachmentsRef = db.collection("users").doc(authenticatedUid).collection("chats").doc(chatId).collection("attachments");
    const snapshot = await attachmentsRef.get();

    if (snapshot.empty) {
      return [];
    }

    const results: AttachmentPayload[] = [];
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const rawText = data.extractedText || data.textContents || '';
      results.push({
        id: docSnap.id,
        attachmentId: data.attachmentId || docSnap.id,
        name: data.name || 'document',
        type: data.type || 'application/octet-stream',
        size: data.size || 0,
        pageCount: data.pageCount || 1,
        textContents: rawText,
        extractedText: rawText,
        data: data.data || '',
        extractionStatus: data.extractionStatus || (rawText ? 'success' : 'empty'),
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().getTime() : Date.now()) : Date.now()
      });
    });

    console.log(`[Attachment Persistence] Loaded ${results.length} persistent attachment(s) from Firestore for chat "${chatId}" (User: ${authenticatedUid}).`);
    return results;
  } catch (err: any) {
    if (err.code === 7 || (typeof err.message === 'string' && err.message.includes('PERMISSION_DENIED'))) {
      // In this environment, client-side Firebase SDK manages conversation attachments directly
      return [];
    }
    console.warn(`[Attachment Persistence Notice] Notice: Could not fetch attachments for chat "${chatId}":`, err.message || err);
    return [];
  }
}

/**
 * Persists newly uploaded attachments directly into the authenticated user's Firestore conversation.
 */
export async function persistAttachmentsToFirestore(
  authenticatedUid: string,
  chatId: string,
  attachments: AttachmentPayload[]
): Promise<void> {
  if (!authenticatedUid || !chatId || !Array.isArray(attachments) || attachments.length === 0) return;

  const db = getDb();
  if (!db) return;

  try {
    const batch = db.batch();
    const attachmentsColl = db.collection("users").doc(authenticatedUid).collection("chats").doc(chatId).collection("attachments");

    for (const att of attachments) {
      if (!att) continue;
      const cleanName = (att.name || 'document').replace(/[^\w.-]/g, '_');
      const docId = String(att.attachmentId || att.id || `${cleanName}-${Date.now()}`);
      const docRef = attachmentsColl.doc(docId);
      
      const rawText = att.textContents || att.extractedText || '';
      batch.set(docRef, {
        attachmentId: docId,
        name: att.name || 'document',
        type: att.type || 'application/octet-stream',
        size: att.size || 0,
        pageCount: att.pageCount || 1,
        extractionStatus: att.extractionStatus || (rawText ? 'success' : 'empty'),
        extractedText: rawText,
        textContents: rawText,
        // Only save image base64 if small; omit heavy data
        data: (att.type?.startsWith('image/') && att.data && att.data.length < 500000) ? att.data : '',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    await batch.commit();
    console.log(`[Attachment Persistence] Successfully persisted ${attachments.length} attachment(s) to Firestore for chat "${chatId}".`);
  } catch (err: any) {
    if (err.code === 7 || (typeof err.message === 'string' && err.message.includes('PERMISSION_DENIED'))) {
      return;
    }
    console.warn(`[Attachment Persistence Notice] Notice: Could not persist attachments to Firestore:`, err.message || err);
  }
}

/**
 * Determines whether a given model supports multimodal vision/image inputs.
 */
export function isVisionSupported(modelId: string, providerId?: string): boolean {
  const normalizedModelId = (modelId || '').toLowerCase().trim();
  const normalizedProviderId = (providerId || '').toLowerCase().trim();

  // All Google Gemini models support multimodal vision
  if (normalizedProviderId === 'gemini' || normalizedModelId.startsWith('gemini') || normalizedModelId.includes('/gemini')) {
    return true;
  }

  // Check explicit configuration in MODEL_REGISTRY
  const modelConfig = getModelConfig(modelId);
  if (modelConfig && typeof modelConfig.capabilities?.vision === 'boolean') {
    return modelConfig.capabilities.vision;
  }

  // OpenRouter and dynamic models heuristic check
  if (
    normalizedModelId.includes('vision') ||
    normalizedModelId.includes('multimodal') ||
    normalizedModelId.includes('pixtral') ||
    normalizedModelId.includes('vl') ||
    normalizedModelId.includes('claude-3') ||
    normalizedModelId.includes('gpt-4o') ||
    normalizedModelId.includes('phi-3.5-vision') ||
    normalizedModelId.includes('llama-3.2-11b-vision') ||
    normalizedModelId.includes('llama-3.2-90b-vision')
  ) {
    return true;
  }

  // Default to false for text-only models (e.g. DeepSeek R1/V3, Llama 3.3 70B, Qwen 2.5 72B, Mistral)
  return false;
}

/**
 * Builds the canonical, persistent attachment context shared across all providers (Gemini, OpenRouter, Auto mode).
 * Emits server-side diagnostic metadata logs (strictly metadata, never user content).
 */
export function buildAttachmentContext(
  attachments: Array<AttachmentPayload | any> | undefined,
  options: AttachmentContextOptions
): AttachmentContextResult {
  const modelId = (options.modelId || 'auto').trim();
  const providerId = (options.providerId || '').trim();
  const rawPrompt = (options.userPrompt || '').trim();
  const conversationId = (options.conversationId || options.chatId || '').trim();
  const supportsVision = isVisionSupported(modelId, providerId);

  // 1. Gather all documents from incoming turn attachments and persistent conversation attachments
  const directAttachments: AttachmentPayload[] = Array.isArray(attachments) ? attachments : [];
  const convParamAttachments: AttachmentPayload[] = Array.isArray(options.conversationAttachments) ? options.conversationAttachments : [];

  // Merge and de-duplicate all available documents for this conversation
  const combinedMap = new Map<string, AttachmentPayload>();

  // Order of inclusion: persistent conversation documents -> direct turn attachments
  const allCandidates = [...convParamAttachments, ...directAttachments];

  for (const doc of allCandidates) {
    if (!doc) continue;
    const docKey = String(doc.attachmentId || doc.id || doc.name || '').trim().toLowerCase();
    if (!docKey) continue;

    const existing = combinedMap.get(docKey);
    const textVal = doc.textContents || doc.extractedText || existing?.textContents || existing?.extractedText || '';
    
    combinedMap.set(docKey, {
      attachmentId: doc.attachmentId || doc.id || existing?.attachmentId || docKey,
      name: doc.name || existing?.name || 'Document',
      type: doc.type || existing?.type || 'application/octet-stream',
      size: doc.size || existing?.size || 0,
      pageCount: doc.pageCount || existing?.pageCount || 1,
      textContents: textVal,
      extractedText: textVal,
      data: doc.data || existing?.data || '',
      extractionStatus: (doc.extractionStatus as any) || (textVal ? 'success' : 'empty'),
      createdAt: doc.createdAt || existing?.createdAt || Date.now()
    });
  }

  const activeDocuments = Array.from(combinedMap.values());
  const activeDocumentCount = activeDocuments.length;

  const documentSections: string[] = [];
  const visionImages: VisionImagePayload[] = [];
  const unsupportedVisionNotices: string[] = [];
  const attachmentIds: string[] = [];
  let totalExtractedLength = 0;
  let retrievedDocumentCount = 0;

  // Maximum characters allowed per individual document and overall context limit to preserve model context
  // Modern Gemini models support 1M+ tokens (up to 250k chars comfortably), OpenRouter text models ~80k-128k tokens
  const isGemini = providerId === 'gemini' || modelId.toLowerCase().startsWith('gemini');
  const MAX_CHARS_PER_DOCUMENT = isGemini ? 120000 : 75000;
  const MAX_TOTAL_DOCUMENT_CHARS = isGemini ? 250000 : 120000;

  for (const doc of activeDocuments) {
    const docId = doc.attachmentId || doc.id || doc.name;
    if (docId) attachmentIds.push(docId);

    const fileName = String(doc.name || 'document').trim();
    const mimeType = String(doc.type || 'application/octet-stream').trim();
    const rawText = String(doc.textContents || doc.extractedText || '').trim();
    const pageCount = doc.pageCount || 1;
    let rawData = typeof doc.data === 'string' ? doc.data.trim() : '';
    if (rawData.includes('base64,')) {
      rawData = rawData.split('base64,')[1].trim();
    }

    const isImage = mimeType.startsWith('image/') ||
      fileName.toLowerCase().endsWith('.png') ||
      fileName.toLowerCase().endsWith('.jpg') ||
      fileName.toLowerCase().endsWith('.jpeg') ||
      fileName.toLowerCase().endsWith('.webp') ||
      fileName.toLowerCase().endsWith('.gif');

    // 1. Text-extractable document processing (PDF, DOCX, TXT, CSV, XLSX, PPTX, Source Code, etc.)
    if (rawText.length > 0) {
      if (totalExtractedLength < MAX_TOTAL_DOCUMENT_CHARS) {
        let textToInclude = rawText;
        let isTruncated = false;

        if (textToInclude.length > MAX_CHARS_PER_DOCUMENT) {
          textToInclude = textToInclude.slice(0, MAX_CHARS_PER_DOCUMENT) + '\n... [Document Content Truncated to fit Context Window] ...';
          isTruncated = true;
        }

        const remainingQuota = MAX_TOTAL_DOCUMENT_CHARS - totalExtractedLength;
        if (textToInclude.length > remainingQuota) {
          textToInclude = textToInclude.slice(0, remainingQuota) + '\n... [Context Quota Reached] ...';
          isTruncated = true;
        }

        totalExtractedLength += textToInclude.length;
        retrievedDocumentCount++;

        documentSections.push(
          `[ATTACHED DOCUMENT: "${fileName}" | Format: ${mimeType} | Pages: ${pageCount}${isTruncated ? ' | Truncated: Yes' : ''}]\n` +
          `==================== BEGIN ATTACHED DOCUMENT: ${fileName} ====================\n` +
          `${textToInclude}\n` +
          `==================== END ATTACHED DOCUMENT: ${fileName} ====================`
        );
      }
    }

    // 2. Multimodal Image processing
    if (isImage && rawData.length > 0) {
      if (supportsVision) {
        let resolvedMime = mimeType;
        if (fileName.toLowerCase().endsWith('.png')) resolvedMime = 'image/png';
        else if (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) resolvedMime = 'image/jpeg';
        else if (fileName.toLowerCase().endsWith('.webp')) resolvedMime = 'image/webp';
        else if (fileName.toLowerCase().endsWith('.gif')) resolvedMime = 'image/gif';

        visionImages.push({
          name: fileName,
          mimeType: resolvedMime,
          base64Data: rawData,
          dataUrl: `data:${resolvedMime};base64,${rawData}`
        });
        retrievedDocumentCount++;
      } else {
        const notice = `[ATTACHED IMAGE: "${fileName}" (Notice: Image analysis is not supported by the selected text-only model "${modelId}". Vision inputs are disabled for this model.)]`;
        unsupportedVisionNotices.push(notice);
        documentSections.push(notice);
      }
    }
  }

  // Determine retrieval source
  let retrievalSource = options.retrievalSource || 'firestore_persistent';
  if (directAttachments.length > 0 && convParamAttachments.length > 0) {
    retrievalSource = 'hybrid_turn_and_firestore';
  } else if (directAttachments.length > 0) {
    retrievalSource = 'direct_turn_payload';
  } else if (convParamAttachments.length > 0) {
    retrievalSource = 'firestore_persistent';
  }

  // Diagnostic Structured Metadata Logging (STRICT: ONLY metadata, NEVER logs document contents, keys, or passwords)
  console.log(
    `[Document Context] chatId=${conversationId || 'none'} attachmentCount=${directAttachments.length} attachmentIds=${attachmentIds.join(',') || 'none'} activeDocumentCount=${activeDocumentCount} retrievedDocumentCount=${retrievedDocumentCount} extractedTextLength=${totalExtractedLength} retrievalSource=${retrievalSource} selectedModel=${modelId}`
  );

  const canonicalDocumentContext = documentSections.join('\n\n');
  const hasTextDocuments = documentSections.length > 0;
  const hasVisionImages = visionImages.length > 0;

  // Build the complete augmented prompt
  let augmentedPrompt = rawPrompt;
  if (canonicalDocumentContext.length > 0) {
    const defaultQuery = "Please analyze the attached document(s) and provide answers to the user's questions.";
    const userQueryText = rawPrompt || defaultQuery;
    augmentedPrompt = `${canonicalDocumentContext}\n\n==================== USER QUESTION & INSTRUCTIONS ====================\n${userQueryText}`;
  } else if (!augmentedPrompt) {
    augmentedPrompt = "Hello!";
  }

  return {
    canonicalDocumentContext,
    augmentedPrompt,
    visionImages,
    unsupportedVisionNotices,
    supportsVision,
    hasTextDocuments,
    hasVisionImages,
    totalAttachmentsProcessed: directAttachments.length,
    activeDocumentCount,
    retrievedDocumentCount,
    extractedTextLength: totalExtractedLength,
    attachmentIds,
    retrievalSource
  };
}
