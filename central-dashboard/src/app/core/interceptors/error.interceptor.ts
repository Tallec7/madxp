import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, retry, timer, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';
import { LoggerService } from '../services/logger.service';
import { ErrorExtractor } from '../utils/error-extractor';
import { ErrorCode } from '../models/api-error.model';

/**
 * HTTP Error Interceptor
 *
 * Centralized error handling for all HTTP requests:
 * - Adds correlation ID to requests for tracing
 * - Retries failed GET requests (network errors, 5xx)
 * - Logs errors to backend via LoggerService
 * - Handles authentication errors (redirect to login)
 * - Shows notifications for specific error types
 *
 * Note: This interceptor should be registered AFTER authInterceptor
 * in app.config.ts to ensure auth headers are already set.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  const logger = inject(LoggerService);

  // Generate correlation ID for request tracing
  const correlationId = crypto.randomUUID();

  // Clone request with correlation ID header
  const reqWithCorrelation = req.clone({
    setHeaders: {
      'X-Correlation-ID': correlationId,
    },
  });

  // Add HTTP breadcrumb for tracking
  logger.addBreadcrumb('http', `${req.method} ${req.url}`, {
    correlationId,
  });

  return next(reqWithCorrelation).pipe(
    // Retry logic for idempotent GET requests
    retry({
      count: 2,
      delay: (error: HttpErrorResponse, retryCount: number) => {
        // Only retry GET requests (idempotent)
        if (req.method !== 'GET') {
          return throwError(() => error);
        }

        // Only retry on network errors or 5xx server errors
        if (!ErrorExtractor.isRetryable(error)) {
          return throwError(() => error);
        }

        // Exponential backoff: 1s, 2s
        const delayMs = Math.pow(2, retryCount) * 1000;

        logger.info(`Retrying request (attempt ${retryCount + 1})`, {
          url: req.url,
          correlationId,
          delayMs,
          status: error.status,
        });

        return timer(delayMs);
      },
    }),

    // Error handling
    catchError((error: HttpErrorResponse) => {
      const extractedCorrelationId =
        ErrorExtractor.getCorrelationId(error) || correlationId;
      const errorCode = ErrorExtractor.getErrorCode(error);
      const message = ErrorExtractor.getMessage(error);

      // Skip logging for log endpoint errors to prevent infinite loop:
      // Log failure → 429 → intercept → log failure → 429 → ...
      const isLogEndpoint = req.url.includes('/logs/frontend');

      // Skip logging for expected 404s on draft endpoints (no draft = normal state)
      const isDraftEndpoint404 = req.url.includes('/draft') && error.status === 404;

      // Log error to backend (but not for logging endpoint itself or expected draft 404s)
      if (!isLogEndpoint && !isDraftEndpoint404) {
        logger.error('HTTP request failed', {
          url: req.url,
          method: req.method,
          status: error.status,
          correlationId: extractedCorrelationId,
          errorCode,
          message,
        });
      }

      // Handle specific error types
      // Skip auth error handling for log endpoint - it's expected to fail when not authenticated
      if (ErrorExtractor.isAuthError(error) && !isLogEndpoint) {
        handleAuthError(error, errorCode, router, notificationService);
        return throwError(() => error);
      }

      if (ErrorExtractor.isRateLimitError(error)) {
        // Don't show notification for logging endpoint rate limits (silent fail)
        if (!isLogEndpoint) {
          notificationService.error('Trop de requêtes - Veuillez patienter quelques instants');
        }
        return throwError(() => error);
      }

      if (ErrorExtractor.isNetworkError(error)) {
        notificationService.error('Impossible de contacter le serveur - Vérifiez votre connexion');
        return throwError(() => error);
      }

      // For other errors, let the component handle the notification
      // This avoids double notifications when components also show errors
      return throwError(() => error);
    })
  );
};

/**
 * Handle authentication errors
 */
function handleAuthError(
  error: HttpErrorResponse,
  errorCode: string | ErrorCode | undefined,
  router: Router,
  notificationService: NotificationService
): void {
  // Don't redirect if already on login page or auth endpoints
  const currentUrl = router.url;
  if (currentUrl === '/login' || currentUrl.startsWith('/auth/')) {
    return;
  }

  // Token expired - redirect to login
  if (error.status === 401 || errorCode === ErrorCode.AUTH_TOKEN_EXPIRED) {
    notificationService.warning('Session expirée - Veuillez vous reconnecter');
    router.navigate(['/login'], {
      queryParams: { returnUrl: currentUrl },
    });
    return;
  }

  // Insufficient permissions - show error but stay on page
  if (error.status === 403 || errorCode === ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS) {
    notificationService.error('Vous n\'avez pas les permissions nécessaires pour cette action');
    return;
  }

  // MFA required
  if (errorCode === ErrorCode.AUTH_MFA_REQUIRED) {
    router.navigate(['/mfa-verify'], {
      queryParams: { returnUrl: currentUrl },
    });
    return;
  }
}
