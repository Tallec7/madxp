/**
 * RemoteVersionToggleService — ADR-061
 * Toggle coexistence legacy (v1) / new (v2) télécommande, persisté par siteId.
 * Sunset annoncé : 1er novembre 2026. Après cette date, le toggle est ignoré.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type RemoteVersion = 'v1' | 'v2';

/** Date ISO du sunset legacy — après cette date le toggle est forcé sur v2. */
export const LEGACY_SUNSET_DATE = '2026-11-01';

const STORAGE_PREFIX = 'neopro_remote_version_';

@Injectable({ providedIn: 'root' })
export class RemoteVersionToggleService {
  private readonly versionSubject = new BehaviorSubject<RemoteVersion>('v2');
  readonly version$ = this.versionSubject.asObservable();

  get currentVersion(): RemoteVersion {
    return this.versionSubject.value;
  }

  get isSunset(): boolean {
    return new Date() >= new Date(LEGACY_SUNSET_DATE);
  }

  /** Returns true if the legacy UI is still available (pre-sunset). */
  get legacyAvailable(): boolean {
    return !this.isSunset;
  }

  loadForSite(siteId: string): void {
    if (this.isSunset) {
      this.versionSubject.next('v2');
      return;
    }
    const stored = localStorage.getItem(STORAGE_PREFIX + siteId) as RemoteVersion | null;
    this.versionSubject.next(stored === 'v1' ? 'v1' : 'v2');
  }

  toggleVersion(siteId: string): void {
    if (this.isSunset) return;
    const next: RemoteVersion = this.currentVersion === 'v2' ? 'v1' : 'v2';
    localStorage.setItem(STORAGE_PREFIX + siteId, next);
    this.versionSubject.next(next);
  }

  setVersion(siteId: string, version: RemoteVersion): void {
    if (this.isSunset && version === 'v1') return;
    localStorage.setItem(STORAGE_PREFIX + siteId, version);
    this.versionSubject.next(version);
  }

  clearForSite(siteId: string): void {
    localStorage.removeItem(STORAGE_PREFIX + siteId);
  }
}
