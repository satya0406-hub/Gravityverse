import { auth } from './firebase';
import { trackError } from './analytics';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType | string, path: string | null = null) {
  const op = (typeof operationType === 'string' ? operationType.toLowerCase() : operationType) as OperationType;
  const errMessage = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType: op || OperationType.GET,
    path
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));

  try {
    trackError('Firestore Error', `${op} failed on path: ${path || 'unknown'}. Message: ${errMessage}`, false, error instanceof Error ? error.stack : undefined);
  } catch (e) {
    console.warn('Analytics trackError failed:', e);
  }

  throw new Error(JSON.stringify(errInfo));
}

