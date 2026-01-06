/**
 * Standardized API Error Response Format
 *
 * All API errors should follow this format for consistent
 * frontend handling and production debugging.
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
 * Error Codes
 *
 * Convention: DOMAIN_SUBJECT_REASON
 * Used for programmatic error handling on frontend
 */
export enum ErrorCode {
  // ========== Authentication ==========
  AUTH_CREDENTIALS_INVALID = 'AUTH_CREDENTIALS_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_MFA_REQUIRED = 'AUTH_MFA_REQUIRED',
  AUTH_MFA_INVALID = 'AUTH_MFA_INVALID',
  AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',
  AUTH_PASSWORD_WEAK = 'AUTH_PASSWORD_WEAK',

  // ========== Resources ==========
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',

  // ========== Validation ==========
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',

  // ========== Sites ==========
  SITE_NOT_FOUND = 'SITE_NOT_FOUND',
  SITE_OFFLINE = 'SITE_OFFLINE',
  SITE_APIKEY_INVALID = 'SITE_APIKEY_INVALID',
  SITE_COMMAND_FAILED = 'SITE_COMMAND_FAILED',
  SITE_COMMAND_TIMEOUT = 'SITE_COMMAND_TIMEOUT',

  // ========== Deployment ==========
  DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
  DEPLOYMENT_TIMEOUT = 'DEPLOYMENT_TIMEOUT',
  DEPLOYMENT_CHECKSUM_MISMATCH = 'DEPLOYMENT_CHECKSUM_MISMATCH',
  DEPLOYMENT_SITE_OFFLINE = 'DEPLOYMENT_SITE_OFFLINE',
  DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',

  // ========== Content/Storage ==========
  STORAGE_UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  STORAGE_DOWNLOAD_FAILED = 'STORAGE_DOWNLOAD_FAILED',
  STORAGE_FTP_UNAVAILABLE = 'STORAGE_FTP_UNAVAILABLE',
  STORAGE_FILE_TOO_LARGE = 'STORAGE_FILE_TOO_LARGE',
  STORAGE_INVALID_FORMAT = 'STORAGE_INVALID_FORMAT',

  // ========== Users ==========
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_EMAIL_IN_USE = 'USER_EMAIL_IN_USE',

  // ========== Groups ==========
  GROUP_NOT_FOUND = 'GROUP_NOT_FOUND',
  GROUP_ALREADY_EXISTS = 'GROUP_ALREADY_EXISTS',

  // ========== Advertisers ==========
  ADVERTISER_NOT_FOUND = 'ADVERTISER_NOT_FOUND',

  // ========== Rate Limiting ==========
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // ========== Database ==========
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONSTRAINT_VIOLATION = 'DATABASE_CONSTRAINT_VIOLATION',

  // ========== Generic ==========
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * User-facing error messages (French)
 *
 * These messages are safe to display to end users.
 * Technical details should go in the 'details' field.
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication
  [ErrorCode.AUTH_CREDENTIALS_INVALID]: 'Identifiants incorrects',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Session expirée, veuillez vous reconnecter',
  [ErrorCode.AUTH_TOKEN_MISSING]: 'Authentification requise',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Token invalide',
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 'Permissions insuffisantes pour cette action',
  [ErrorCode.AUTH_MFA_REQUIRED]: 'Authentification à deux facteurs requise',
  [ErrorCode.AUTH_MFA_INVALID]: 'Code de vérification invalide',
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: 'Compte temporairement verrouillé',
  [ErrorCode.AUTH_PASSWORD_WEAK]: 'Le mot de passe ne respecte pas les critères de sécurité',

  // Resources
  [ErrorCode.RESOURCE_NOT_FOUND]: 'Ressource introuvable',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'Cette ressource existe déjà',
  [ErrorCode.RESOURCE_CONFLICT]: 'Conflit avec une ressource existante',

  // Validation
  [ErrorCode.VALIDATION_FAILED]: 'Données invalides',
  [ErrorCode.VALIDATION_MISSING_FIELD]: 'Champ obligatoire manquant',
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 'Format de données invalide',

  // Sites
  [ErrorCode.SITE_NOT_FOUND]: 'Site introuvable',
  [ErrorCode.SITE_OFFLINE]: 'Le site est actuellement hors ligne',
  [ErrorCode.SITE_APIKEY_INVALID]: 'Clé API invalide',
  [ErrorCode.SITE_COMMAND_FAILED]: 'Échec de l\'exécution de la commande',
  [ErrorCode.SITE_COMMAND_TIMEOUT]: 'La commande n\'a pas répondu dans le délai imparti',

  // Deployment
  [ErrorCode.DEPLOYMENT_FAILED]: 'Échec du déploiement',
  [ErrorCode.DEPLOYMENT_TIMEOUT]: 'Le déploiement a expiré',
  [ErrorCode.DEPLOYMENT_CHECKSUM_MISMATCH]: 'Erreur de vérification du fichier',
  [ErrorCode.DEPLOYMENT_SITE_OFFLINE]: 'Impossible de déployer : le site est hors ligne',
  [ErrorCode.DEPLOYMENT_IN_PROGRESS]: 'Un déploiement est déjà en cours',

  // Storage
  [ErrorCode.STORAGE_UPLOAD_FAILED]: 'Échec de l\'envoi du fichier',
  [ErrorCode.STORAGE_DOWNLOAD_FAILED]: 'Échec du téléchargement',
  [ErrorCode.STORAGE_FTP_UNAVAILABLE]: 'Serveur de stockage temporairement indisponible',
  [ErrorCode.STORAGE_FILE_TOO_LARGE]: 'Le fichier dépasse la taille maximale autorisée',
  [ErrorCode.STORAGE_INVALID_FORMAT]: 'Format de fichier non supporté',

  // Users
  [ErrorCode.USER_NOT_FOUND]: 'Utilisateur introuvable',
  [ErrorCode.USER_ALREADY_EXISTS]: 'Cet utilisateur existe déjà',
  [ErrorCode.USER_EMAIL_IN_USE]: 'Cette adresse email est déjà utilisée',

  // Groups
  [ErrorCode.GROUP_NOT_FOUND]: 'Groupe introuvable',
  [ErrorCode.GROUP_ALREADY_EXISTS]: 'Ce groupe existe déjà',

  // Advertisers
  [ErrorCode.ADVERTISER_NOT_FOUND]: 'Annonceur introuvable',

  // Rate Limiting
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Trop de requêtes, veuillez patienter',

  // Database
  [ErrorCode.DATABASE_ERROR]: 'Erreur de base de données',
  [ErrorCode.DATABASE_CONSTRAINT_VIOLATION]: 'Violation de contrainte de données',

  // Generic
  [ErrorCode.INTERNAL_ERROR]: 'Erreur interne du serveur',
  [ErrorCode.NETWORK_ERROR]: 'Erreur réseau',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporairement indisponible',
  [ErrorCode.NOT_IMPLEMENTED]: 'Fonctionnalité non disponible',
};

/**
 * HTTP status codes for each error code
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  // Authentication - 401/403
  [ErrorCode.AUTH_CREDENTIALS_INVALID]: 401,
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
  [ErrorCode.AUTH_TOKEN_MISSING]: 401,
  [ErrorCode.AUTH_TOKEN_INVALID]: 401,
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.AUTH_MFA_REQUIRED]: 403,
  [ErrorCode.AUTH_MFA_INVALID]: 401,
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: 403,
  [ErrorCode.AUTH_PASSWORD_WEAK]: 400,

  // Resources - 404/409
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 409,
  [ErrorCode.RESOURCE_CONFLICT]: 409,

  // Validation - 400
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.VALIDATION_MISSING_FIELD]: 400,
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 400,

  // Sites - 404/503
  [ErrorCode.SITE_NOT_FOUND]: 404,
  [ErrorCode.SITE_OFFLINE]: 503,
  [ErrorCode.SITE_APIKEY_INVALID]: 401,
  [ErrorCode.SITE_COMMAND_FAILED]: 500,
  [ErrorCode.SITE_COMMAND_TIMEOUT]: 504,

  // Deployment - 500/503
  [ErrorCode.DEPLOYMENT_FAILED]: 500,
  [ErrorCode.DEPLOYMENT_TIMEOUT]: 504,
  [ErrorCode.DEPLOYMENT_CHECKSUM_MISMATCH]: 422,
  [ErrorCode.DEPLOYMENT_SITE_OFFLINE]: 503,
  [ErrorCode.DEPLOYMENT_IN_PROGRESS]: 409,

  // Storage - 500/413
  [ErrorCode.STORAGE_UPLOAD_FAILED]: 500,
  [ErrorCode.STORAGE_DOWNLOAD_FAILED]: 500,
  [ErrorCode.STORAGE_FTP_UNAVAILABLE]: 503,
  [ErrorCode.STORAGE_FILE_TOO_LARGE]: 413,
  [ErrorCode.STORAGE_INVALID_FORMAT]: 415,

  // Users - 404/409
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.USER_ALREADY_EXISTS]: 409,
  [ErrorCode.USER_EMAIL_IN_USE]: 409,

  // Groups - 404/409
  [ErrorCode.GROUP_NOT_FOUND]: 404,
  [ErrorCode.GROUP_ALREADY_EXISTS]: 409,

  // Advertisers - 404
  [ErrorCode.ADVERTISER_NOT_FOUND]: 404,

  // Rate Limiting - 429
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,

  // Database - 500
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.DATABASE_CONSTRAINT_VIOLATION]: 409,

  // Generic - 500/503
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
};

/**
 * Application Error Class
 *
 * Use this class to throw standardized errors throughout the application.
 * The global error handler will catch and format these correctly.
 *
 * @example
 * throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, { resourceType: 'site', resourceId: id });
 *
 * @example
 * throw new AppError(ErrorCode.VALIDATION_FAILED, { fields: ['email', 'password'] });
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    details?: Record<string, unknown>,
    statusCode?: number
  ) {
    super(ErrorMessages[code]);

    this.code = code;
    this.statusCode = statusCode ?? ErrorStatusCodes[code];
    this.details = details;
    this.isOperational = true; // Distinguishes from programming errors

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Create error response object
   */
  toResponse(correlationId: string, path: string): ApiErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: new Date().toISOString(),
        correlationId,
        path,
      },
    };
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Helper to create AppError from common scenarios
 */
export const Errors = {
  notFound: (resourceType: string, resourceId?: string) =>
    new AppError(ErrorCode.RESOURCE_NOT_FOUND, { resourceType, resourceId }),

  unauthorized: (reason?: string) =>
    new AppError(ErrorCode.AUTH_TOKEN_INVALID, reason ? { reason } : undefined),

  forbidden: (action?: string) =>
    new AppError(ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS, action ? { action } : undefined),

  validation: (fields: Array<{ field: string; message: string }>) =>
    new AppError(ErrorCode.VALIDATION_FAILED, { fields }),

  conflict: (reason: string) =>
    new AppError(ErrorCode.RESOURCE_CONFLICT, { reason }),

  internal: (error?: Error) =>
    new AppError(ErrorCode.INTERNAL_ERROR, error ? { originalError: error.message } : undefined),

  siteOffline: (siteId: string, siteName?: string) =>
    new AppError(ErrorCode.SITE_OFFLINE, { siteId, siteName }),

  deploymentFailed: (deploymentId: string, reason: string) =>
    new AppError(ErrorCode.DEPLOYMENT_FAILED, { deploymentId, reason }),

  uploadFailed: (filename: string, reason: string) =>
    new AppError(ErrorCode.STORAGE_UPLOAD_FAILED, { filename, reason }),

  rateLimitExceeded: (retryAfter?: number) =>
    new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, retryAfter ? { retryAfter } : undefined),
};
