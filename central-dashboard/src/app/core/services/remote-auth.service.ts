/**
 * Remote Auth Service — ADR-058 Phase 1
 *
 * Client Angular pour la gestion super_admin des PIN par profil et des
 * device tokens (`profile_device_tokens`).
 *
 * Endpoints:
 *   PUT    /api/sites/:siteId/profiles/:profileId/remote-pin
 *   GET    /api/sites/:siteId/profiles/:profileId/remote-devices
 *   POST   /api/sites/:siteId/profiles/:profileId/remote-devices/:tokenId/revoke
 *   POST   /api/sites/:siteId/profiles/:profileId/remote-devices/revoke-all
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RemoteDevice {
  id: string;
  device_id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
}

export interface ListDevicesResponse {
  devices: RemoteDevice[];
}

export interface SetPinResponse {
  success: true;
  pin_required: boolean;
  revoked_tokens: number;
}

@Injectable({ providedIn: 'root' })
export class RemoteAuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private base(siteId: string, profileId: string): string {
    return `${this.apiUrl}/sites/${siteId}/profiles/${profileId}`;
  }

  /** PIN = null → clear. PIN = "1234" → bcrypt set. */
  setPin(siteId: string, profileId: string, pin: string | null): Observable<SetPinResponse> {
    return this.http.put<SetPinResponse>(`${this.base(siteId, profileId)}/remote-pin`, { pin });
  }

  listDevices(siteId: string, profileId: string): Observable<ListDevicesResponse> {
    return this.http.get<ListDevicesResponse>(`${this.base(siteId, profileId)}/remote-devices`);
  }

  revokeDevice(
    siteId: string,
    profileId: string,
    tokenId: string
  ): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(
      `${this.base(siteId, profileId)}/remote-devices/${tokenId}/revoke`,
      {}
    );
  }

  revokeAllDevices(
    siteId: string,
    profileId: string,
    reason?: string
  ): Observable<{ success: true; revoked: number }> {
    return this.http.post<{ success: true; revoked: number }>(
      `${this.base(siteId, profileId)}/remote-devices/revoke-all`,
      { reason: reason || null }
    );
  }
}
