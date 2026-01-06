import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Notification action button
 */
export interface NotificationAction {
  /** Button label */
  label: string;
  /** Click handler */
  handler: () => void;
}

/**
 * Options for customizing notifications
 */
export interface NotificationOptions {
  /** Custom duration in ms (overrides default) */
  duration?: number;
  /** Action button (e.g., "Retry", "View Details") */
  action?: NotificationAction;
  /** Correlation ID for error tracking/support */
  correlationId?: string;
  /** Whether notification can be dismissed by clicking */
  dismissible?: boolean;
}

/**
 * Notification data structure
 */
export interface Notification {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  /** Action button configuration */
  action?: NotificationAction;
  /** Correlation ID for support reference */
  correlationId?: string;
  /** Duration in ms before auto-dismiss */
  duration: number;
  /** Whether notification can be dismissed by clicking */
  dismissible: boolean;
}

/**
 * Notification Service
 *
 * Provides toast notifications with support for:
 * - Different types (success, error, warning, info)
 * - Custom duration per notification type
 * - Action buttons (e.g., "Retry", "View Details")
 * - Correlation ID display for error tracking
 * - Manual dismissal
 *
 * @example
 * // Simple notification
 * this.notificationService.success('Site créé avec succès');
 *
 * // Error with retry action
 * this.notificationService.error('Échec du déploiement', {
 *   action: { label: 'Réessayer', handler: () => this.retry() },
 *   correlationId: 'abc-123'
 * });
 *
 * // Long-duration notification
 * this.notificationService.warning('Attention: données non sauvegardées', {
 *   duration: 10000
 * });
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new Subject<Notification>();
  notification$ = this.notificationSubject.asObservable();

  private notificationId = 0;

  // Default durations per type
  private readonly durations = {
    success: 3000,
    error: 6000,    // Errors stay longer
    warning: 5000,
    info: 4000
  };

  /**
   * Show success notification
   */
  success(message: string, options?: NotificationOptions): void {
    this.show('success', message, options);
  }

  /**
   * Show error notification
   */
  error(message: string, options?: NotificationOptions): void {
    this.show('error', message, options);
  }

  /**
   * Show warning notification
   */
  warning(message: string, options?: NotificationOptions): void {
    this.show('warning', message, options);
  }

  /**
   * Show info notification
   */
  info(message: string, options?: NotificationOptions): void {
    this.show('info', message, options);
  }

  private show(
    type: Notification['type'],
    message: string,
    options?: NotificationOptions
  ): void {
    const notification: Notification = {
      id: this.notificationId++,
      type,
      message,
      action: options?.action,
      correlationId: options?.correlationId,
      duration: options?.duration ?? this.durations[type],
      dismissible: options?.dismissible ?? true
    };

    this.notificationSubject.next(notification);
  }
}
