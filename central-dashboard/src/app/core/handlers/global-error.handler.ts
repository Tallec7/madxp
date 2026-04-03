import { ErrorHandler, Injectable, inject, isDevMode } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LoggerService } from '../services/logger.service';
import { NotificationService } from '../services/notification.service';
import { ErrorBoundaryService } from '../services/error-boundary.service';
import { ErrorExtractor } from '../utils/error-extractor';

/**
 * Global Error Handler
 *
 * Catches all unhandled errors in the Angular application:
 * - Component errors
 * - Async errors (Promise rejections)
 * - Template errors
 *
 * This handler:
 * 1. Logs errors to the backend via LoggerService (with breadcrumbs)
 * 2. Shows user notification for non-HTTP errors
 * 3. Re-throws in dev mode for easier debugging
 *
 * Note: HTTP errors are primarily handled by errorInterceptor,
 * so this handler focuses on non-HTTP errors.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Use inject() for compatibility with standalone components
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);
  private errorBoundary = inject(ErrorBoundaryService);

  handleError(error: Error | HttpErrorResponse | unknown): void {
    // Extract error details
    const message = ErrorExtractor.getMessage(error);
    const correlationId = ErrorExtractor.getCorrelationId(error);
    const errorCode = ErrorExtractor.getErrorCode(error);

    // Build error context
    const errorContext: Record<string, unknown> = {
      message,
      correlationId,
      errorCode,
    };

    // Add stack trace for Error objects
    if (error instanceof Error) {
      errorContext['name'] = error.name;
      errorContext['stack'] = error.stack;
    }

    // Add status for HTTP errors
    if (error instanceof HttpErrorResponse) {
      errorContext['status'] = error.status;
      errorContext['url'] = error.url;
    }

    // Log error to backend with breadcrumbs
    this.logger.error('Unhandled error', errorContext);

    // Show user notification only for non-HTTP errors
    // HTTP errors are handled by the interceptor to avoid double notifications
    if (!(error instanceof HttpErrorResponse)) {
      // Show error boundary for critical rendering errors, toast for others
      this.errorBoundary.triggerError();
    }

    // In development mode, also log to console with stack trace
    // Angular's default ErrorHandler normally does this, so we maintain that behavior
    if (isDevMode()) {
      console.error('GlobalErrorHandler caught:', error);
    }
  }
}
