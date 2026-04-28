/**
 * RemotePreferencesService — ADR-062 famille UX/Préférences
 * Options per-device stockées en localStorage uniquement.
 * RÈGLE : aucune option sécurité ici, aucun appel serveur.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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

const STORAGE_KEY = 'neopro_remote_prefs';

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

  private load(): RemotePreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<RemotePreferences>) } : { ...DEFAULT_PREFS };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  private save(prefs: RemotePreferences): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }
}
