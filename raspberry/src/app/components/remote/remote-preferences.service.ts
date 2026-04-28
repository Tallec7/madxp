/**
 * RemotePreferencesService — ADR-062 famille UX/Préférences (Pi)
 * Options per-device stockées en localStorage uniquement.
 * RÈGLE : aucune option sécurité ici, aucun appel serveur.
 *
 * Version Pi — identique à central-dashboard/src/app/features/remote/services/remote-preferences.service.ts
 * Duplication volontaire : les deux projets Angular ne partagent pas de lib.
 */
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SaasConfigService } from '../../services/saas-config.service';

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

const STORAGE_KEY_BASE = 'neopro_remote_prefs';

const DEFAULT_PREFS: RemotePreferences = {
  haptics: true,
  highContrast: false,
  lockRotation: false,
  fontSize: 'normal',
  layoutMobile: 'classic',
  layoutDesktop: 'sidebar',
};

@Injectable({ providedIn: 'root' })
export class RemotePreferencesService {
  private readonly saasConfig = inject(SaasConfigService);
  private readonly prefsSubject = new BehaviorSubject<RemotePreferences>(this.load());
  readonly prefs$ = this.prefsSubject.asObservable();

  get prefs(): RemotePreferences {
    return this.prefsSubject.value;
  }

  update<K extends keyof RemotePreferences>(key: K, value: RemotePreferences[K]): void {
    const next = { ...this.prefs, [key]: value };
    this.save(next);
    this.prefsSubject.next(next);
  }

  reset(): void {
    this.save(DEFAULT_PREFS);
    this.prefsSubject.next({ ...DEFAULT_PREFS });
  }

  /**
   * Recharge les prefs depuis localStorage avec la clé scopée courante.
   * À appeler après un changement de site ou de profil pour éviter de
   * conserver les prefs de l'ancien contexte en mémoire.
   */
  reloadFromStorage(): void {
    this.prefsSubject.next(this.load());
  }

  private storageKey(): string {
    return this.saasConfig.getScopedStorageKey(STORAGE_KEY_BASE);
  }

  private load(): RemotePreferences {
    try {
      const raw = localStorage.getItem(this.storageKey());
      return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<RemotePreferences>) } : { ...DEFAULT_PREFS };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  private save(prefs: RemotePreferences): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(prefs));
    } catch {
      /* localStorage indisponible — silent */
    }
  }
}
