import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SitesService } from '../../core/services/sites.service';

const INTERNAL_ROLES = new Set(['super_admin', 'admin', 'operator']);
const STORAGE_KEY = 'templates-studio:active-site-id';

export interface SiteOption {
  id: string;
  label: string;
}

/**
 * Contexte partagé entre les 3 pages Templates Studio (Brand Kit, Players,
 * Studio).
 *
 * Deux modes :
 *
 * 1. **Club user** (rôle `club`) — `user.site_id` est forcé, pas de picker.
 *    `activeSiteId()` = `user.site_id`, `availableSites()` = `[]`,
 *    `showPicker()` = `false`.
 *
 * 2. **Internal role** (`super_admin` / `admin` / `operator`) — pas de
 *    `site_id` sur le JWT. Le service charge `/api/sites?limit=200`, expose
 *    le picker, et persiste la sélection dans `localStorage` pour l'UX
 *    (`activeSiteId` reste constant entre navigation Brand Kit / Players /
 *    Studio + survit au refresh).
 *
 * Tous les composants appellent `init()` au `ngOnInit` (idempotent — le
 * service garde un flag interne pour ne pas re-déclencher la requête sites).
 *
 * Côté backend : la route variante `/sites/:siteId/render-requests` accepte
 * les internal roles via `requireClubScope`. Brand Kit et Players sont déjà
 * câblés sur `:siteId` en URL.
 */
@Injectable({ providedIn: 'root' })
export class TemplatesStudioContextService {
  private auth = inject(AuthService);
  private sites = inject(SitesService);

  private _isInternalRole = signal(false);
  private _availableSites = signal<SiteOption[]>([]);
  private _activeSiteId = signal<string | null>(null);
  private _loading = signal(false);
  private _error = signal<string | null>(null);
  private initialized = false;

  readonly isInternalRole = this._isInternalRole.asReadonly();
  readonly availableSites = this._availableSites.asReadonly();
  readonly activeSiteId = this._activeSiteId.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Pour gating UI : on affiche le picker dès qu'on est internal role. */
  readonly showPicker = computed(() => this._isInternalRole() && this._availableSites().length > 0);

  /**
   * À appeler depuis chaque page studio au `ngOnInit`. Idempotent — la 2e
   * fois rien ne se passe, on reste sur l'état actuel (notamment
   * `activeSiteId` ne reset pas si l'utilisateur navigue entre pages).
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.auth.currentUser$.subscribe((user) => {
      if (!user) {
        this.reset();
        return;
      }
      const isInternal = INTERNAL_ROLES.has(user.role);
      this._isInternalRole.set(isInternal);
      if (!isInternal) {
        // Club user — on lock sur user.site_id, pas de picker.
        this._activeSiteId.set(user.site_id ?? null);
        return;
      }
      // Internal role — on charge la liste des sites (1x), restaure la
      // sélection persistée si valide, sinon prend le 1er site dispo.
      if (this._availableSites().length === 0) {
        this.loadSites();
      }
    });
  }

  setActiveSiteId(siteId: string | null): void {
    this._activeSiteId.set(siteId);
    if (siteId) {
      try {
        localStorage.setItem(STORAGE_KEY, siteId);
      } catch {
        // localStorage indisponible (mode privé Safari, quota) — silent OK,
        // l'utilisateur perd juste la persistance entre refresh.
      }
    }
  }

  private loadSites(): void {
    this._loading.set(true);
    this._error.set(null);
    this.sites.loadSites({ limit: 200 }).subscribe({
      next: (res) => {
        const opts = (res.sites ?? []).map((s) => ({
          id: s.id,
          label: s.site_name || s.club_name || s.id,
        }));
        opts.sort((a, b) => a.label.localeCompare(b.label));
        this._availableSites.set(opts);
        this._loading.set(false);
        // Restore active site from storage if still valid, sinon premier de la liste.
        let next: string | null = null;
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored && opts.some((o) => o.id === stored)) {
            next = stored;
          }
        } catch {
          // localStorage indisponible — ignore.
        }
        if (!next && opts.length > 0) next = opts[0].id;
        this._activeSiteId.set(next);
      },
      error: (err) => {
        this._loading.set(false);
        this._error.set(err?.error?.error ?? 'Erreur de chargement des sites');
      },
    });
  }

  private reset(): void {
    this._isInternalRole.set(false);
    this._availableSites.set([]);
    this._activeSiteId.set(null);
    this._loading.set(false);
    this._error.set(null);
  }
}
