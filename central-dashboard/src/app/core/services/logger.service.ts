import { Injectable, inject, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { catchError, of } from 'rxjs';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Breadcrumb entry for tracking user journey
 */
export interface Breadcrumb {
  timestamp: string;
  type: 'navigation' | 'action' | 'error' | 'http';
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Log entry structure sent to backend
 */
interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  userAgent: string;
  url: string;
  breadcrumbs?: Breadcrumb[];
}

/**
 * Logger Service
 *
 * Provides structured logging for the Angular dashboard.
 * - In development: Colorful console output
 * - In production: Sends logs to backend for centralized logging (Logtail)
 *
 * Also maintains breadcrumbs for tracking user journey before errors.
 *
 * @example
 * // Simple logging
 * this.logger.info('User logged in');
 *
 * // With context
 * this.logger.error('Failed to load site', { siteId: '123', error: err.message });
 *
 * // Track user actions
 * this.logger.addBreadcrumb('action', 'Clicked deploy button', { videoId: '456' });
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private http = inject(HttpClient);
  private breadcrumbs: Breadcrumb[] = [];
  private readonly MAX_BREADCRUMBS = 50;

  // Console colors for dev mode
  private readonly colors = {
    debug: '#9E9E9E',
    info: '#2196F3',
    warn: '#FF9800',
    error: '#F44336',
  };

  // ========== Public Logging Methods ==========

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    // Add error breadcrumb
    this.addBreadcrumb('error', message, context);

    // Log with breadcrumbs included
    this.log(LogLevel.ERROR, message, context, true);
  }

  // ========== Breadcrumb Methods ==========

  /**
   * Add a breadcrumb for tracking user journey
   */
  addBreadcrumb(
    type: Breadcrumb['type'],
    message: string,
    data?: Record<string, unknown>
  ): void {
    this.breadcrumbs.push({
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
    });

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }

  /**
   * Get all breadcrumbs (for error reporting)
   */
  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear breadcrumbs (e.g., after logout)
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  // ========== Private Methods ==========

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    includeBreadcrumbs = false
  ): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Include breadcrumbs for error logs
    if (includeBreadcrumbs) {
      entry.breadcrumbs = this.getBreadcrumbs();
    }

    // Console output (always, with colors in dev)
    this.logToConsole(entry);

    // Send to backend in production (or dev if explicitly enabled)
    if (environment.production || (context?.['sendToBackend'] === true)) {
      this.sendToBackend(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.split('T')[1].split('.')[0];
    const prefix = `[${timestamp}]`;

    if (isDevMode()) {
      // Colorful output in dev
      const color = this.colors[entry.level];
      const levelBadge = `%c${entry.level.toUpperCase()}`;
      const style = `background: ${color}; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;`;

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(prefix, levelBadge, style, entry.message, entry.context || '');
          break;
        case LogLevel.INFO:
          console.info(prefix, levelBadge, style, entry.message, entry.context || '');
          break;
        case LogLevel.WARN:
          console.warn(prefix, levelBadge, style, entry.message, entry.context || '');
          break;
        case LogLevel.ERROR:
          console.error(prefix, levelBadge, style, entry.message, entry.context || '');
          if (entry.breadcrumbs?.length) {
            console.groupCollapsed('%cBreadcrumbs', 'color: #888; font-style: italic;');
            entry.breadcrumbs.forEach((b) => {
              console.log(`${b.timestamp} [${b.type}] ${b.message}`, b.data || '');
            });
            console.groupEnd();
          }
          break;
      }
    } else {
      // Simple output in production console (before sending to backend)
      const message = `${prefix} [${entry.level.toUpperCase()}] ${entry.message}`;
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(message, entry.context);
          break;
        case LogLevel.INFO:
          console.info(message, entry.context);
          break;
        case LogLevel.WARN:
          console.warn(message, entry.context);
          break;
        case LogLevel.ERROR:
          console.error(message, entry.context);
          break;
      }
    }
  }

  private sendToBackend(entry: LogEntry): void {
    // Fire and forget - don't block on logging
    this.http
      .post(`${environment.apiUrl}/logs/frontend`, entry, {
        withCredentials: true,
      })
      .pipe(
        catchError((error) => {
          // Only log to console if backend is unreachable
          // Don't create infinite loop by calling this.error()
          if (isDevMode()) {
            console.warn('[LoggerService] Failed to send log to backend:', error);
          }
          return of(null);
        })
      )
      .subscribe();
  }
}
