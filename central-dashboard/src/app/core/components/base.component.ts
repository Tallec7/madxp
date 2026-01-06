import { inject, Directive } from '@angular/core';
import { LoggerService } from '../services/logger.service';
import { NotificationService, NotificationOptions } from '../services/notification.service';
import { ErrorExtractor } from '../utils/error-extractor';

/**
 * Base Component
 *
 * Abstract base class for components that need standardized error handling.
 * Provides common methods for:
 * - Error handling with logging and notifications
 * - Retry actions for failed operations
 * - User action tracking (breadcrumbs)
 *
 * @example
 * @Component({ ... })
 * export class SiteDetailComponent extends BaseComponent {
 *   loadSite(): void {
 *     this.trackAction('Loading site', { siteId: this.siteId });
 *
 *     this.siteService.getSite(this.siteId).subscribe({
 *       next: (site) => this.site = site,
 *       error: (error) => this.handleErrorWithRetry(
 *         error,
 *         'Failed to load site',
 *         () => this.loadSite()
 *       )
 *     });
 *   }
 *
 *   deleteSite(): void {
 *     this.trackAction('Deleting site', { siteId: this.siteId });
 *
 *     this.siteService.delete(this.siteId).subscribe({
 *       next: () => {
 *         this.notificationService.success('Site supprimé');
 *         this.router.navigate(['/sites']);
 *       },
 *       error: (error) => this.handleError(error, 'Failed to delete site')
 *     });
 *   }
 * }
 */
@Directive()
export abstract class BaseComponent {
  protected logger = inject(LoggerService);
  protected notificationService = inject(NotificationService);

  /**
   * Handle error with logging and notification
   *
   * @param error - The error to handle
   * @param context - Context description for logging (e.g., 'Failed to load site')
   * @param options - Additional notification options
   */
  protected handleError(
    error: unknown,
    context: string,
    options?: NotificationOptions
  ): void {
    const message = ErrorExtractor.getMessage(error);
    const correlationId = ErrorExtractor.getCorrelationId(error);
    const errorCode = ErrorExtractor.getErrorCode(error);

    // Log error with full context
    this.logger.error(context, {
      message,
      correlationId,
      errorCode,
      component: this.constructor.name,
      details: ErrorExtractor.getDetails(error),
      status: ErrorExtractor.getStatusCode(error),
    });

    // Show notification to user
    this.notificationService.error(message, {
      correlationId,
      ...options,
    });
  }

  /**
   * Handle error with retry action button
   *
   * @param error - The error to handle
   * @param context - Context description for logging
   * @param retryFn - Function to call when user clicks "Retry"
   */
  protected handleErrorWithRetry(
    error: unknown,
    context: string,
    retryFn: () => void
  ): void {
    // Only show retry for retryable errors
    if (ErrorExtractor.isRetryable(error)) {
      this.handleError(error, context, {
        action: {
          label: 'Réessayer',
          handler: retryFn,
        },
      });
    } else {
      this.handleError(error, context);
    }
  }

  /**
   * Handle validation error with field-level details
   *
   * @param error - The error to handle
   * @param context - Context description for logging
   */
  protected handleValidationError(error: unknown, context: string): void {
    const validationErrors = ErrorExtractor.getValidationErrors(error);

    if (validationErrors?.length) {
      // Log with field details
      this.logger.warn(context, {
        component: this.constructor.name,
        validationErrors,
      });

      // Show first error message
      const firstError = validationErrors[0];
      this.notificationService.error(
        `${firstError.field}: ${firstError.message}`
      );
    } else {
      // Fallback to generic error handling
      this.handleError(error, context);
    }
  }

  /**
   * Track user action for breadcrumbs
   *
   * Use this to track significant user actions that help debug errors.
   *
   * @param message - Description of the action
   * @param data - Additional context data
   */
  protected trackAction(message: string, data?: Record<string, unknown>): void {
    this.logger.addBreadcrumb('action', message, {
      component: this.constructor.name,
      ...data,
    });
  }

  /**
   * Log info message with component context
   */
  protected logInfo(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, {
      component: this.constructor.name,
      ...data,
    });
  }

  /**
   * Log warning message with component context
   */
  protected logWarn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, {
      component: this.constructor.name,
      ...data,
    });
  }
}
