import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_KEY_PREFIX = 'neopro_remote_token_';
const DEVICE_ID_KEY = 'neopro_remote_device_id';

export interface VerifyPinResponse {
  success: boolean;
  token: string;
  tokenId: string;
  expiresIn: number;
}

/**
 * ADR-058 — Gère le JWT device token (30j) par siteId pour la remote SaaS.
 *
 * Le token est obtenu via POST /api/remote/:siteId/profiles/:profileId/verify-pin
 * et rattaché aux requêtes vers /api/saas/:siteId/* via remotePinInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class RemotePinService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = (environment as { apiUrl?: string }).apiUrl || '';

  public getToken(siteId: string): string | null {
    if (!siteId) return null;
    try {
      return localStorage.getItem(TOKEN_KEY_PREFIX + siteId);
    } catch {
      return null;
    }
  }

  public setToken(siteId: string, token: string): void {
    if (!siteId) return;
    try {
      localStorage.setItem(TOKEN_KEY_PREFIX + siteId, token);
    } catch {
      // localStorage indisponible — le client devra ressaisir le PIN à chaque visite
    }
  }

  public clearToken(siteId: string): void {
    if (!siteId) return;
    try {
      localStorage.removeItem(TOKEN_KEY_PREFIX + siteId);
    } catch {
      // ignore
    }
  }

  /**
   * UUID v4 stable côté device (persisté en localStorage). Sert à identifier
   * l'appareil dans `profile_device_tokens` (le super_admin peut le révoquer).
   */
  public getDeviceId(): string {
    try {
      const existing = localStorage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
    } catch {
      // fallback below
    }
    const generated = this.generateUuid();
    try {
      localStorage.setItem(DEVICE_ID_KEY, generated);
    } catch {
      // ignore
    }
    return generated;
  }

  public verifyProfilePin(
    siteId: string,
    profileId: string,
    pin: string
  ): Observable<VerifyPinResponse> {
    const deviceId = this.getDeviceId();
    const label = typeof navigator !== 'undefined' && navigator.userAgent
      ? navigator.userAgent.slice(0, 80)
      : 'unknown';
    const body = { pin, deviceId, label };
    return this.http
      .post<VerifyPinResponse>(`${this.apiUrl}/remote/${siteId}/profiles/${profileId}/verify-pin`, body)
      .pipe(
        tap((res) => {
          if (res && res.token) {
            this.setToken(siteId, res.token);
          }
        })
      );
  }

  private generateUuid(): string {
    const cryptoObj = (typeof crypto !== 'undefined' ? crypto : undefined) as Crypto | undefined;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return cryptoObj.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
