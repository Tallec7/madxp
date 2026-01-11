import { Injectable, inject, isDevMode, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { catchError, of, Subject, bufferTime, filter, takeUntil } from 'rxjs';

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
 * Features:
 * - **Throttling**: Logs are batched and sent every 2 seconds (max 20 logs/batch)
 * - **Rate limit handling**: 429 errors are silently ignored (no console spam)
 * - **Production console**: Only errors are logged to console in production
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
export class LoggerService implements OnDestroy {
  // Optional injection - allows service to work without HttpClient in tests
  private http: HttpClient | null = null;
  private breadcrumbs: Breadcrumb[] = [];

  // Throttling configuration
  private readonly BATCH_INTERVAL_MS = 2000; // Send logs every 2 seconds
  private readonly MAX_BATCH_SIZE = 20; // Max logs per batch
  private readonly logQueue$ = new Subject<LogEntry>();
  private readonly destroy$ = new Subject<void>();

  constructor() {
    try {
      this.http = inject(HttpClient);
    } catch {
      // HttpClient not provided (e.g., in tests without HttpClientTestingModule)
      // Logger will still work for console output, just won't send to backend
    }

    // Setup log batching pipeline
    this.setupLogBatching();
  }
  private readonly MAX_BREADCRUMBS = 50;

  // Track if user is authenticated to avoid sending logs before login
  private isAuthenticated = false;

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

  /**
   * Set authentication state - called by AuthService
   * When authenticated, logs will be sent to backend in production
   */
  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
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
    // Only send if user is authenticated to avoid 401 errors on login page
    if ((environment.production || context?.['sendToBackend'] === true) && this.isAuthenticated) {
      // Queue for batched sending (throttling to avoid rate limits)
      this.queueForBackend(entry);
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

      // Build args array, only include context if it exists and has properties
      const hasContext = entry.context && Object.keys(entry.context).length > 0;
      const baseArgs = [prefix, levelBadge, style, entry.message];
      const args = hasContext ? [...baseArgs, entry.context] : baseArgs;

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(...args);
          break;
        case LogLevel.INFO:
          console.info(...args);
          break;
        case LogLevel.WARN:
          console.warn(...args);
          break;
        case LogLevel.ERROR:
          console.error(...args);
          if (entry.breadcrumbs?.length) {
            console.groupCollapsed('%cBreadcrumbs', 'color: #888; font-style: italic;');
            entry.breadcrumbs.forEach((b) => {
              const hasBreadcrumbData = b.data && Object.keys(b.data).length > 0;
              if (hasBreadcrumbData) {
                console.log(`${b.timestamp} [${b.type}] ${b.message}`, b.data);
              } else {
                console.log(`${b.timestamp} [${b.type}] ${b.message}`);
              }
            });
            console.groupEnd();
          }
          break;
      }
    } else {
      // In production, only log errors and warnings to console
      // INFO/DEBUG are sent to backend only (Logtail) - no need to pollute console
      if (entry.level === LogLevel.ERROR || entry.level === LogLevel.WARN) {
        const message = `${prefix} [${entry.level.toUpperCase()}] ${entry.message}`;
        if (entry.level === LogLevel.ERROR) {
          console.error(message, entry.context);
        } else {
          console.warn(message, entry.context);
        }
      }
      // DEBUG and INFO are silent in production console (still sent to backend)
    }
  }

  /**
   * Setup the log batching pipeline using RxJS
   * Logs are accumulated and sent in batches every BATCH_INTERVAL_MS
   */
  private setupLogBatching(): void {
    this.logQueue$
      .pipe(
        takeUntil(this.destroy$),
        // Buffer logs for BATCH_INTERVAL_MS or until MAX_BATCH_SIZE is reached
        bufferTime(this.BATCH_INTERVAL_MS, null, this.MAX_BATCH_SIZE),
        // Only process non-empty batches
        filter((batch) => batch.length > 0)
      )
      .subscribe((batch) => {
        this.sendBatchToBackend(batch);
      });
  }

  /**
   * Queue a log entry for batched sending to backend
   */
  private queueForBackend(entry: LogEntry): void {
    this.logQueue$.next(entry);
  }

  /**
   * Send a batch of logs to the backend
   * Silently handles rate limit (429) errors without console spam
   */
  private sendBatchToBackend(entries: LogEntry[]): void {
    // Skip if HttpClient is not available (e.g., in tests)
    if (!this.http || entries.length === 0) {
      return;
    }

    // Send each log entry individually (backend expects single entries)
    // We batch on the client side to reduce request frequency
    for (const entry of entries) {
      this.http
        .post(`${environment.apiUrl}/logs/frontend`, entry, {
          withCredentials: true,
        })
        .pipe(
          catchError((error) => {
            // Silently ignore rate limit errors (429) - expected behavior
            // Also ignore other errors to prevent console spam in production
            // Only log in dev mode for debugging purposes
            if (isDevMode() && error?.status !== 429) {
              console.warn('[LoggerService] Failed to send log to backend:', error);
            }
            return of(null);
          })
        )
        .subscribe();
    }
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.logQueue$.complete();
  }
}
