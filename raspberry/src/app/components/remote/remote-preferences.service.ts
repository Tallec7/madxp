/**
 * RemotePreferencesService — ADR-102 (étend ADR-062).
 *
 * Persistance des préférences UX télécommande. Source de vérité = DB en mode
 * SaaS (table `remote_preferences` scoped (site, profile)), localStorage en
 * mode Pi natif (`siteId` vide).
 *
 * Flow SaaS :
 *   1. Init  → GET /api/saas/:siteId/profiles/:profileId/preferences
 *      → si DB renvoie un objet vide ET localStorage non vide → backfill PUT
 *        (one-shot, rétro-compat avec PR #688 qui scopait en localStorage).
 *   2. update() → maj optimiste (BehaviorSubject + cache localStorage) + PUT
 *      debouncé 500ms. Échec réseau → on garde le localStorage (retry au
 *      prochain reload).
 *   3. reloadFromStorage() → re-fetch DB après switch de profil.
 *
 * Flow Pi natif : localStorage-only (1 Pi = 1 device).
 *
 * Defaults appliqués côté client : la DB renvoie partial → on merge avec les
 * defaults. Cela permet d'évoluer le schéma sans migration DB de masse.
 *
 * Version Pi — identique à central-dashboard/src/app/features/remote/services/remote-preferences.service.ts
 * Duplication volontaire : les deux projets Angular ne partagent pas de lib.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject } from 'rxjs';
import { catchError, debounceTime, of, switchMap } from 'rxjs';
import { SaasConfigService } from '../../services/saas-config.service';
import { environment } from '../../../environments/environment';

export type LayoutMobile = 'classic' | 'grid' | 'compact';
export type LayoutDesktop = 'centered' | 'sidebar' | 'pro';

export interface RemotePreferences {
  haptics: boolean;
  highContrast: boolean;
  lockRotation: boolean;
  fontSize: 'normal' | 'large';
  layoutMobile: LayoutMobile;
  layoutDesktop: LayoutDesktop;
}

export interface WidgetsEnabled {
  score: boolean;
  chrono: boolean;
  breaking: boolean;
}

interface PreferencesApiResponse {
  prefs: Partial<RemotePreferences>;
  widgets: Partial<WidgetsEnabled>;
  updatedAt: string | null;
}

const PREFS_STORAGE_KEY_BASE = 'neopro_remote_prefs';
const WIDGETS_STORAGE_KEY_BASE = 'neopro_remote_v2_widgets';
const SYNC_DEBOUNCE_MS = 500;

const DEFAULT_PREFS: RemotePreferences = {
  haptics: true,
  highContrast: false,
  lockRotation: false,
  fontSize: 'normal',
  layoutMobile: 'classic',
  layoutDesktop: 'sidebar',
};

const DEFAULT_WIDGETS: WidgetsEnabled = {
  score: true,
  chrono: true,
  breaking: false,
};

interface SyncPayload {
  prefs?: RemotePreferences;
  widgets?: WidgetsEnabled;
}

@Injectable({ providedIn: 'root' })
export class RemotePreferencesService {
  private readonly saasConfig = inject(SaasConfigService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (environment as { apiUrl?: string }).apiUrl || '';

  private readonly prefsSubject = new BehaviorSubject<RemotePreferences>(this.loadPrefsLocal());
  readonly prefs$ = this.prefsSubject.asObservable();

  private readonly widgetsSubject = new BehaviorSubject<WidgetsEnabled>(this.loadWidgetsLocal());
  readonly widgets$ = this.widgetsSubject.asObservable();

  private readonly syncSubject = new Subject<SyncPayload>();

  constructor() {
    // Pipeline de sync DB debouncé. En mode Pi natif, le siteId vide → pas
    // d'URL → on no-op silencieusement.
    this.syncSubject
      .pipe(
        debounceTime(SYNC_DEBOUNCE_MS),
        switchMap((payload) => this.pushToDb(payload).pipe(
          catchError((err: HttpErrorResponse) => {
            // Échec silencieux : le localStorage reste source de vérité jusqu'au
            // prochain reload (où on retentera un fetch).
            console.warn('RemotePreferences sync failed (local cache preserved)', err.status);
            return of(null);
          }),
        )),
      )
      .subscribe();

    // Charge depuis la DB en mode SaaS (asynchrone, n'attend pas pour le boot).
    this.bootstrapFromDb();

    // ADR-102 — Re-fetch DB à chaque switch de profil pour éviter de garder
    // les prefs de l'ancien profil en mémoire.
    this.saasConfig.profileChanged$.subscribe(() => {
      this.reloadFromStorage();
    });
  }

  get prefs(): RemotePreferences {
    return this.prefsSubject.value;
  }

  get widgets(): WidgetsEnabled {
    return this.widgetsSubject.value;
  }

  update<K extends keyof RemotePreferences>(key: K, value: RemotePreferences[K]): void {
    const next = { ...this.prefs, [key]: value };
    this.savePrefsLocal(next);
    this.prefsSubject.next(next);
    this.scheduleSync({ prefs: next });
  }

  updateWidget<K extends keyof WidgetsEnabled>(key: K, value: WidgetsEnabled[K]): void {
    const next = { ...this.widgets, [key]: value };
    this.saveWidgetsLocal(next);
    this.widgetsSubject.next(next);
    this.scheduleSync({ widgets: next });
  }

  reset(): void {
    this.savePrefsLocal(DEFAULT_PREFS);
    this.prefsSubject.next({ ...DEFAULT_PREFS });
    this.scheduleSync({ prefs: DEFAULT_PREFS });
  }

  /**
   * Recharge les prefs après changement de site ou de profil. En SaaS, refetch
   * la DB pour le nouveau (site, profil). En Pi, lit le localStorage scopé.
   */
  reloadFromStorage(): void {
    this.prefsSubject.next(this.loadPrefsLocal());
    this.widgetsSubject.next(this.loadWidgetsLocal());
    this.bootstrapFromDb();
  }

  // -------------------------------------------------------------------------
  // localStorage I/O (cache + Pi natif)
  // -------------------------------------------------------------------------

  private prefsStorageKey(): string {
    return this.saasConfig.getScopedStorageKey(PREFS_STORAGE_KEY_BASE);
  }

  private widgetsStorageKey(): string {
    return this.saasConfig.getScopedStorageKey(WIDGETS_STORAGE_KEY_BASE);
  }

  private loadPrefsLocal(): RemotePreferences {
    try {
      const raw = localStorage.getItem(this.prefsStorageKey());
      return raw
        ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<RemotePreferences>) }
        : { ...DEFAULT_PREFS };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  private loadWidgetsLocal(): WidgetsEnabled {
    try {
      const raw = localStorage.getItem(this.widgetsStorageKey());
      return raw
        ? { ...DEFAULT_WIDGETS, ...(JSON.parse(raw) as Partial<WidgetsEnabled>) }
        : { ...DEFAULT_WIDGETS };
    } catch {
      return { ...DEFAULT_WIDGETS };
    }
  }

  private savePrefsLocal(prefs: RemotePreferences): void {
    try {
      localStorage.setItem(this.prefsStorageKey(), JSON.stringify(prefs));
    } catch {
      /* mode privé / quota — silent */
    }
  }

  private saveWidgetsLocal(widgets: WidgetsEnabled): void {
    try {
      localStorage.setItem(this.widgetsStorageKey(), JSON.stringify(widgets));
    } catch {
      /* mode privé / quota — silent */
    }
  }

  // -------------------------------------------------------------------------
  // Sync DB (SaaS uniquement)
  // -------------------------------------------------------------------------

  private currentEndpoint(): string | null {
    const siteId = this.saasConfig.getSiteId();
    const profileId = this.saasConfig.getSelectedProfileId();
    if (!siteId || !profileId) return null;
    return `${this.apiUrl}/saas/${siteId}/profiles/${profileId}/preferences`;
  }

  /**
   * Au boot ou après reloadFromStorage : tente un GET DB. Si la DB renvoie
   * du contenu, il prime sur le cache localStorage. Si la DB est vide ET le
   * cache localStorage non vide → backfill PUT one-shot.
   */
  private bootstrapFromDb(): void {
    const endpoint = this.currentEndpoint();
    if (!endpoint) return;

    this.http.get<PreferencesApiResponse>(endpoint).pipe(
      catchError((err: HttpErrorResponse) => {
        // 401/403 PIN → laisse le localStorage prendre le relais. 404 → idem.
        // 5xx / réseau → silencieux, on retentera.
        console.warn('RemotePreferences fetch failed (offline mode)', err.status);
        return of(null);
      }),
    ).subscribe((response) => {
      if (!response) return;

      const dbPrefs = response.prefs ?? {};
      const dbWidgets = response.widgets ?? {};
      const dbHasPrefs = Object.keys(dbPrefs).length > 0;
      const dbHasWidgets = Object.keys(dbWidgets).length > 0;

      if (dbHasPrefs) {
        const merged: RemotePreferences = { ...DEFAULT_PREFS, ...dbPrefs };
        this.savePrefsLocal(merged);
        this.prefsSubject.next(merged);
      } else {
        // Backfill : si rien en DB mais on a un cache local non-default → push.
        const local = this.loadPrefsLocal();
        if (this.isPrefsCustomized(local)) {
          this.scheduleSync({ prefs: local });
        }
      }

      if (dbHasWidgets) {
        const merged: WidgetsEnabled = { ...DEFAULT_WIDGETS, ...dbWidgets };
        this.saveWidgetsLocal(merged);
        this.widgetsSubject.next(merged);
      } else {
        const local = this.loadWidgetsLocal();
        if (this.isWidgetsCustomized(local)) {
          this.scheduleSync({ widgets: local });
        }
      }
    });
  }

  private scheduleSync(payload: SyncPayload): void {
    if (!this.currentEndpoint()) return;
    this.syncSubject.next(payload);
  }

  private pushToDb(payload: SyncPayload) {
    const endpoint = this.currentEndpoint();
    if (!endpoint) return of(null);
    return this.http.put<PreferencesApiResponse>(endpoint, payload);
  }

  private isPrefsCustomized(p: RemotePreferences): boolean {
    return (Object.keys(DEFAULT_PREFS) as Array<keyof RemotePreferences>).some(
      (k) => p[k] !== DEFAULT_PREFS[k],
    );
  }

  private isWidgetsCustomized(w: WidgetsEnabled): boolean {
    return (Object.keys(DEFAULT_WIDGETS) as Array<keyof WidgetsEnabled>).some(
      (k) => w[k] !== DEFAULT_WIDGETS[k],
    );
  }
}
