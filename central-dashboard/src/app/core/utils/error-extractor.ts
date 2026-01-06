import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorResponse, ErrorCode, isApiErrorResponse } from '../models/api-error.model';

/**
 * Error Extractor Utility
 *
 * Centralizes error handling logic to replace the 60+ inconsistent
 * error extraction patterns across the codebase.
 *
 * @example
 * // Instead of:
 * error.error?.error || error.message
 *
 * // Use:
 * ErrorExtractor.getMessage(error)
 */
export class ErrorExtractor {
  /**
   * Extract user-facing error message from any error type
   *
   * Handles:
   * - New standardized ApiErrorResponse format
   * - Legacy { error: string } format
   * - HttpErrorResponse with various body formats
   * - Generic Error objects
   * - String errors
   * - Unknown error types
   */
  static getMessage(error: unknown): string {
    // HttpErrorResponse from Angular HTTP client
    if (error instanceof HttpErrorResponse) {
      return this.extractHttpErrorMessage(error);
    }

    // Generic Error objects
    if (error instanceof Error) {
      return error.message;
    }

    // String errors
    if (typeof error === 'string') {
      return error;
    }

    // Unknown error type
    return 'Une erreur inattendue est survenue';
  }

  /**
   * Extract correlation ID for error tracking
   *
   * Returns the correlation ID from:
   * 1. Response header X-Correlation-ID
   * 2. Response body (standardized format)
   */
  static getCorrelationId(error: unknown): string | undefined {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    // Try header first (always present if backend uses correlation middleware)
    const headerCorrelationId = error.headers?.get('X-Correlation-ID');
    if (headerCorrelationId) {
      return headerCorrelationId;
    }

    // Fallback to body (standardized format)
    if (isApiErrorResponse(error.error)) {
      return error.error.error.correlationId;
    }

    return undefined;
  }

  /**
   * Get error code for programmatic handling
   *
   * Returns the error code from standardized API response,
   * or undefined for legacy/unknown error formats.
   */
  static getErrorCode(error: unknown): ErrorCode | string | undefined {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    if (isApiErrorResponse(error.error)) {
      return error.error.error.code as ErrorCode;
    }

    return undefined;
  }

  /**
   * Get HTTP status code
   */
  static getStatusCode(error: unknown): number | undefined {
    if (error instanceof HttpErrorResponse) {
      return error.status;
    }
    return undefined;
  }

  /**
   * Get additional error details
   */
  static getDetails(error: unknown): Record<string, unknown> | undefined {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    if (isApiErrorResponse(error.error)) {
      return error.error.error.details;
    }

    return undefined;
  }

  /**
   * Check if error is retryable
   *
   * Returns true for:
   * - Network errors (status 0)
   * - Server errors (5xx)
   * - Timeout errors (408, 504)
   */
  static isRetryable(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    // Network errors (no response received)
    if (error.status === 0) {
      return true;
    }

    // Server errors (5xx)
    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    // Timeout errors
    if (error.status === 408 || error.status === 504) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is authentication-related
   *
   * Returns true for:
   * - 401 Unauthorized
   * - 403 Forbidden
   * - AUTH_* error codes
   */
  static isAuthError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    // Status code check
    if (error.status === 401 || error.status === 403) {
      return true;
    }

    // Error code check
    const code = this.getErrorCode(error);
    if (typeof code === 'string' && code.startsWith('AUTH_')) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is a network/connectivity error
   */
  static isNetworkError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    return error.status === 0;
  }

  /**
   * Check if error is a rate limit error
   */
  static isRateLimitError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    if (error.status === 429) {
      return true;
    }

    const code = this.getErrorCode(error);
    return code === ErrorCode.RATE_LIMIT_EXCEEDED;
  }

  /**
   * Check if error is a validation error
   */
  static isValidationError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    if (error.status === 400) {
      return true;
    }

    const code = this.getErrorCode(error);
    return (
      code === ErrorCode.VALIDATION_FAILED ||
      code === ErrorCode.VALIDATION_MISSING_FIELD ||
      code === ErrorCode.VALIDATION_INVALID_FORMAT
    );
  }

  /**
   * Get validation field errors (if available)
   */
  static getValidationErrors(
    error: unknown
  ): Array<{ field: string; message: string }> | undefined {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    const details = this.getDetails(error);
    if (details?.['fields'] && Array.isArray(details['fields'])) {
      return details['fields'] as Array<{ field: string; message: string }>;
    }

    return undefined;
  }

  // ========== Private Helpers ==========

  /**
   * Extract message from HttpErrorResponse
   */
  private static extractHttpErrorMessage(error: HttpErrorResponse): string {
    // New standardized API error format
    if (isApiErrorResponse(error.error)) {
      return error.error.error.message;
    }

    // Legacy format: { error: string }
    const body = error.error as Record<string, unknown> | null;
    if (body && typeof body['error'] === 'string') {
      return body['error'];
    }

    // Legacy format: { message: string }
    if (body && typeof body['message'] === 'string') {
      return body['message'];
    }

    // Fallback to status-based message
    return this.getDefaultMessageForStatus(error.status);
  }

  /**
   * Get default French message based on HTTP status code
   */
  private static getDefaultMessageForStatus(status: number): string {
    // Network error (no response)
    if (status === 0) {
      return 'Erreur réseau - Vérifiez votre connexion internet';
    }

    // Client errors (4xx)
    if (status === 400) {
      return 'Données invalides';
    }

    if (status === 401) {
      return 'Session expirée - Veuillez vous reconnecter';
    }

    if (status === 403) {
      return 'Accès refusé - Permissions insuffisantes';
    }

    if (status === 404) {
      return 'Ressource introuvable';
    }

    if (status === 408) {
      return 'La requête a expiré - Veuillez réessayer';
    }

    if (status === 409) {
      return 'Conflit - Cette ressource a été modifiée';
    }

    if (status === 413) {
      return 'Fichier trop volumineux';
    }

    if (status === 429) {
      return 'Trop de requêtes - Veuillez patienter';
    }

    // Server errors (5xx)
    if (status >= 500 && status < 600) {
      return 'Erreur serveur - Veuillez réessayer ultérieurement';
    }

    // Unknown status
    return 'Une erreur est survenue';
  }
}
