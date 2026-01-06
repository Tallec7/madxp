/**
 * Standardized API Error Response Format
 *
 * Matches the backend ApiErrorResponse structure from central-server.
 * All API errors follow this format for consistent handling.
 */
export interface ApiErrorResponse {
  error: {
    /** Machine-readable error code (e.g., AUTH_TOKEN_EXPIRED) */
    code: string;
    /** User-facing message in French */
    message: string;
    /** Additional context for debugging */
    details?: Record<string, unknown>;
    /** ISO timestamp of error occurrence */
    timestamp: string;
    /** Correlation ID for tracing frontend → backend */
    correlationId: string;
    /** Request path that caused the error */
    path: string;
  };
}

/**
 * Error codes matching backend ErrorCode enum
 *
 * Used for programmatic error handling on frontend.
 * Convention: DOMAIN_SUBJECT_REASON
 */
export enum ErrorCode {
  // Authentication
  AUTH_CREDENTIALS_INVALID = 'AUTH_CREDENTIALS_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_MFA_REQUIRED = 'AUTH_MFA_REQUIRED',
  AUTH_MFA_INVALID = 'AUTH_MFA_INVALID',
  AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',
  AUTH_PASSWORD_WEAK = 'AUTH_PASSWORD_WEAK',

  // Resources
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',

  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',

  // Sites
  SITE_NOT_FOUND = 'SITE_NOT_FOUND',
  SITE_OFFLINE = 'SITE_OFFLINE',
  SITE_APIKEY_INVALID = 'SITE_APIKEY_INVALID',
  SITE_COMMAND_FAILED = 'SITE_COMMAND_FAILED',
  SITE_COMMAND_TIMEOUT = 'SITE_COMMAND_TIMEOUT',

  // Deployment
  DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
  DEPLOYMENT_TIMEOUT = 'DEPLOYMENT_TIMEOUT',
  DEPLOYMENT_CHECKSUM_MISMATCH = 'DEPLOYMENT_CHECKSUM_MISMATCH',
  DEPLOYMENT_SITE_OFFLINE = 'DEPLOYMENT_SITE_OFFLINE',
  DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',

  // Storage
  STORAGE_UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  STORAGE_DOWNLOAD_FAILED = 'STORAGE_DOWNLOAD_FAILED',
  STORAGE_FTP_UNAVAILABLE = 'STORAGE_FTP_UNAVAILABLE',
  STORAGE_FILE_TOO_LARGE = 'STORAGE_FILE_TOO_LARGE',
  STORAGE_INVALID_FORMAT = 'STORAGE_INVALID_FORMAT',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Generic
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Type guard to check if an object is an ApiErrorResponse
 */
export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  if (!obj || typeof obj !== 'object') return false;

  const response = obj as Record<string, unknown>;
  if (!response['error'] || typeof response['error'] !== 'object') return false;

  const error = response['error'] as Record<string, unknown>;
  return (
    typeof error['code'] === 'string' &&
    typeof error['message'] === 'string' &&
    typeof error['correlationId'] === 'string'
  );
}
