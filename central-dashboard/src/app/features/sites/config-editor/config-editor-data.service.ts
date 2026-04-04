import { Injectable, inject } from '@angular/core';
import { Observable, Subject, Subscription, interval, map, switchMap, takeUntil } from 'rxjs';
import { SitesService } from '../../../core/services/sites.service';
import { SiteCommandService } from '../../../core/services/site-command.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import {
  SiteConfiguration,
  ConfigHistory,
  ConfigDiff,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
  CategoryConfig,
  SubcategoryConfig,
  AnalyticsCategory,
  LocalVideo,
} from '../../../core/models';

/** Result of loading a config from the Pi or local mirror */
export interface ConfigLoadResult {
  config: SiteConfiguration | null;
  localVideos: LocalVideo[];
  source: 'pi' | 'local-mirror' | 'empty';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigEditorDataService {
  private readonly sitesService = inject(SitesService);
  private readonly commandService = inject(SiteCommandService);
  private readonly notificationService = inject(NotificationService);
  private readonly analyticsService = inject(AnalyticsService);

  // ============================================================================
  // Config Loading
  // ============================================================================

  /**
   * Load config from the Pi (if connected) or from local mirror.
   * Returns an Observable that emits a single ConfigLoadResult then completes.
   */
  loadConfigFromPi(siteId: string, isConnected: boolean): Observable<ConfigLoadResult> {
    if (!isConnected) {
      return this.loadFromLocalContent(siteId);
    }

    return new Observable<ConfigLoadResult>(subscriber => {
      const cancel$ = new Subject<void>();
      let configCommandId: string | null = null;
      let pollSubscription: Subscription | undefined;

      // Global timeout: if no commandId within 10s, fallback
      const timeoutId = setTimeout(() => {
        if (!configCommandId) {
          cancel$.next();
          this.loadFromLocalContent(siteId).subscribe({
            next: result => subscriber.next(result),
            error: err => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        }
      }, 10000);

      this.commandService.getConfiguration(siteId).pipe(
        takeUntil(cancel$),
      ).subscribe({
        next: (response) => {
          clearTimeout(timeoutId);
          if (response.commandId) {
            configCommandId = response.commandId;
            // Start polling for result
            pollSubscription = this.pollConfigResult(siteId, configCommandId).subscribe({
              next: result => {
                subscriber.next(result);
                subscriber.complete();
              },
              error: () => {
                this.loadFromLocalContent(siteId).subscribe({
                  next: result => subscriber.next(result),
                  error: err => subscriber.error(err),
                  complete: () => subscriber.complete(),
                });
              },
            });
          } else {
            this.loadFromLocalContent(siteId).subscribe({
              next: result => subscriber.next(result),
              error: err => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
          }
        },
        error: () => {
          clearTimeout(timeoutId);
          this.loadFromLocalContent(siteId).subscribe({
            next: result => subscriber.next(result),
            error: err => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      });

      // Teardown
      return () => {
        clearTimeout(timeoutId);
        cancel$.next();
        cancel$.complete();
        pollSubscription?.unsubscribe();
      };
    });
  }

  /**
   * Load configuration from the local mirror (last known config).
   */
  private loadFromLocalContent(siteId: string): Observable<ConfigLoadResult> {
    return new Observable<ConfigLoadResult>(subscriber => {
      this.sitesService.getLocalContent(siteId).subscribe({
        next: (response) => {
          const localVideos = response.localVideos || [];
          if (response.configuration) {
            const lastSyncInfo = response.lastSync
              ? ` (derniere sync: ${new Date(response.lastSync).toLocaleString()})`
              : '';
            this.notificationService.info(`Configuration chargee depuis le miroir local${lastSyncInfo}`);
            subscriber.next({
              config: response.configuration,
              localVideos,
              source: 'local-mirror',
              message: `Configuration chargee depuis le miroir local${lastSyncInfo}`,
            });
          } else {
            this.notificationService.info('Aucune configuration connue. Vous pouvez en creer une nouvelle.');
            subscriber.next({
              config: null,
              localVideos,
              source: 'empty',
              message: 'Aucune configuration connue',
            });
          }
          subscriber.complete();
        },
        error: () => {
          this.notificationService.warning('Impossible de charger la configuration. Vous pouvez en creer une nouvelle.');
          subscriber.next({
            config: null,
            localVideos: [],
            source: 'empty',
            message: 'Erreur de chargement',
          });
          subscriber.complete();
        },
      });
    });
  }

  /**
   * Poll for command result until completed, failed, or timeout.
   */
  private pollConfigResult(siteId: string, commandId: string): Observable<ConfigLoadResult> {
    return new Observable<ConfigLoadResult>(subscriber => {
      const POLL_TIMEOUT_SECONDS = 30;
      let pollCount = 0;
      let isPolling = false;

      const sub = interval(1000).subscribe(() => {
        pollCount++;

        if (pollCount > POLL_TIMEOUT_SECONDS) {
          sub.unsubscribe();
          this.notificationService.warning('Le site ne repond pas. Vous pouvez creer une nouvelle configuration.');
          subscriber.next({
            config: null,
            localVideos: [],
            source: 'empty',
            message: 'Poll timeout',
          });
          subscriber.complete();
          return;
        }

        if (isPolling) {
          return;
        }
        isPolling = true;

        this.commandService.getCommandStatus(siteId, commandId).subscribe({
          next: (status) => {
            isPolling = false;
            if (status.status === 'completed') {
              sub.unsubscribe();
              if (status.result?.configuration) {
                this.notificationService.success('Configuration chargee');
                subscriber.next({
                  config: status.result.configuration,
                  localVideos: [],
                  source: 'pi',
                  message: 'Configuration chargee depuis le Pi',
                });
              } else if (status.result?.message === 'No configuration file found') {
                this.notificationService.info('Aucune configuration sur le site. Creez-en une nouvelle.');
                subscriber.next({
                  config: null,
                  localVideos: [],
                  source: 'empty',
                  message: 'No configuration file found',
                });
              } else {
                this.notificationService.info('Configuration vide. Vous pouvez en creer une nouvelle.');
                subscriber.next({
                  config: null,
                  localVideos: [],
                  source: 'empty',
                  message: 'Configuration empty',
                });
              }
              subscriber.complete();
            } else if (status.status === 'failed') {
              sub.unsubscribe();
              this.notificationService.warning('Echec de recuperation. Vous pouvez creer une nouvelle configuration.');
              subscriber.next({
                config: null,
                localVideos: [],
                source: 'empty',
                message: 'Command failed',
              });
              subscriber.complete();
            }
          },
          error: () => {
            isPolling = false;
          },
        });
      });

      return () => {
        sub.unsubscribe();
      };
    });
  }

  // ============================================================================
  // Config Normalization
  // ============================================================================

  /**
   * Returns an empty default configuration.
   */
  getEmptyConfig(): SiteConfiguration {
    return {
      version: '1.0',
      remote: { title: '' },
      auth: { password: '', clubName: '', sessionDuration: 28800000 },
      sync: { enabled: true, serverUrl: 'https://neopro-central-production.up.railway.app', siteName: '', clubName: '' },
      sponsors: [],
      categories: [],
      timeCategories: [
        { id: 'before', name: 'Avant-match', icon: '\u{1F3C1}', color: 'from-blue-500 to-blue-600', description: 'Echauffement & presentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '\u25B6\uFE0F', color: 'from-green-500 to-green-600', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Apres-match', icon: '\u{1F3C6}', color: 'from-purple-500 to-purple-600', description: 'Resultats & remerciements', categoryIds: [] },
      ],
      categoryMappings: {},
    };
  }

  /**
   * Normalize a raw config into a fully structured SiteConfiguration,
   * filling in missing fields with defaults.
   */
  normalizeConfig(configuration: SiteConfiguration): SiteConfiguration {
    const emptyConfig = this.getEmptyConfig();

    // Normalize categories to ensure videos and subCategories arrays exist
    const normalizedCategories = (configuration.categories || []).map(cat => ({
      ...cat,
      videos: cat.videos || [],
      subCategories: (cat.subCategories || []).map(subcat => ({
        ...subcat,
        videos: subcat.videos || [],
      })),
    }));

    // Normalize timeCategories - use config values or defaults
    const defaultTimeCategories = emptyConfig.timeCategories!;
    const normalizedTimeCategories = configuration.timeCategories?.length
      ? configuration.timeCategories.map(tc => ({
          ...tc,
          categoryIds: tc.categoryIds || [],
        }))
      : defaultTimeCategories;

    return {
      ...emptyConfig,
      ...configuration,
      remote: { ...emptyConfig.remote, ...configuration.remote },
      auth: { ...emptyConfig.auth, ...configuration.auth },
      sync: { ...emptyConfig.sync, ...configuration.sync },
      sponsors: configuration.sponsors || [],
      categories: normalizedCategories,
      timeCategories: normalizedTimeCategories,
    };
  }

  /**
   * Normalize a raw config from JSON input (same logic, used by onJsonChange).
   */
  normalizeConfigFromJson(parsed: Record<string, unknown>): SiteConfiguration {
    const emptyConfig = this.getEmptyConfig();

    const rawCategories = (parsed['categories'] as CategoryConfig[] | undefined) || [];
    const normalizedCategories = rawCategories.map((cat: CategoryConfig) => ({
      ...cat,
      videos: cat.videos || [],
      subCategories: (cat.subCategories || []).map((subcat: SubcategoryConfig) => ({
        ...subcat,
        videos: subcat.videos || [],
      })),
    }));

    return {
      ...emptyConfig,
      ...(parsed as SiteConfiguration),
      remote: { ...emptyConfig.remote, ...(parsed['remote'] as Record<string, unknown> || {}) },
      auth: { ...emptyConfig.auth, ...(parsed['auth'] as Record<string, unknown> || {}) },
      sync: { ...emptyConfig.sync, ...(parsed['sync'] as Record<string, unknown> || {}) },
      sponsors: (parsed['sponsors'] as SiteConfiguration['sponsors']) || [],
      categories: normalizedCategories,
    };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  /**
   * Validate a configuration and return structured validation result.
   */
  validateConfig(config: SiteConfiguration): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];

    // Validation des champs requis
    if (!config.auth?.clubName?.trim()) {
      errors.push({ field: 'auth.clubName', message: 'Le nom du club est requis' });
    }

    // Validation URL serveur si sync active
    if (config.sync?.enabled && config.sync.serverUrl) {
      try {
        new URL(config.sync.serverUrl);
      } catch {
        errors.push({ field: 'sync.serverUrl', message: 'URL du serveur invalide' });
      }
    }

    // Warnings pour les etapes de boucle sans video (cause ecran noir sur le Pi)
    const warnings: ConfigValidationWarning[] = [];

    const emptySponsors = config.sponsors?.filter(s => !s.path?.trim()) || [];
    if (emptySponsors.length > 0) {
      warnings.push({
        field: 'sponsors',
        message: `${emptySponsors.length} video(s) de la boucle par defaut sans chemin — causera un ecran noir sur le Pi`,
        suggestion: 'Selectionnez une video ou supprimez les etapes vides',
      });
    }

    if (config.timeCategories) {
      for (const tc of config.timeCategories) {
        if (tc.loopVideos?.length) {
          const emptyPhaseVideos = tc.loopVideos.filter(v => !v.path?.trim());
          if (emptyPhaseVideos.length > 0) {
            warnings.push({
              field: `timeCategory.${tc.id}`,
              message: `Phase "${tc.name}" : ${emptyPhaseVideos.length} video(s) sans chemin — causera un ecran noir`,
              suggestion: 'Selectionnez une video ou supprimez les etapes vides',
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // History
  // ============================================================================

  /**
   * Load history count for a site.
   */
  loadHistoryCount(siteId: string): Observable<number> {
    return this.sitesService.getConfigHistory(siteId, 1, 0).pipe(
      map(response => response.total),
    );
  }

  /**
   * Load full history for a site.
   */
  loadHistory(siteId: string): Observable<{ history: ConfigHistory[]; total: number }> {
    return this.sitesService.getConfigHistory(siteId, 20, 0).pipe(
      map(response => ({ history: response.history, total: response.total })),
    );
  }

  // ============================================================================
  // Deploy
  // ============================================================================

  /**
   * Preview the diff between the current site config and the proposed config.
   */
  previewDiff(siteId: string, config: SiteConfiguration): Observable<ConfigDiff[]> {
    return this.sitesService.previewConfigDiff(siteId, config).pipe(
      map(response => response.diff),
    );
  }

  /**
   * Deploy a config: save to history then send update_config command.
   * Returns an Observable that completes on success.
   */
  deployConfig(siteId: string, config: SiteConfiguration, mode: 'replace' | 'merge'): Observable<void> {
    return this.sitesService.saveConfigVersion(siteId, config, 'Deploiement depuis le dashboard').pipe(
      switchMap(() => this.commandService.sendCommand(siteId, 'update_config', {
        configuration: config,
        mode,
      })),
      map(() => undefined),
    );
  }

  // ============================================================================
  // Analytics Categories
  // ============================================================================

  /**
   * Load available analytics categories.
   */
  loadAnalyticsCategories(): Observable<AnalyticsCategory[]> {
    return this.analyticsService.getAnalyticsCategories();
  }

  // ============================================================================
  // JSON / Diff Helpers
  // ============================================================================

  /**
   * Pretty-print a value for diff display.
   */
  formatJson(value: unknown): string {
    try {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        return JSON.stringify(parsed, null, 2);
      }
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    } catch (_e) {
      return String(value);
    }
  }

  /**
   * Format a diff value for display.
   */
  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Determine ownership label from a diff value.
   */
  ownershipLabel(value: unknown): 'neopro' | 'club' | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as { owner?: string; locked?: boolean };
    if (v.owner === 'neopro' || v.locked === true) return 'neopro';
    if (v.owner === 'club') return 'club';
    return null;
  }
}
