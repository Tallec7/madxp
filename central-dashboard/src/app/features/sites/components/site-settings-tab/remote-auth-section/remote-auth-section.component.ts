/**
 * RemoteAuthSectionComponent — ADR-058 Phase 1
 *
 * Card super_admin pour gérer les PIN par profil et les device tokens actifs.
 * Rendue dans `site-settings-tab.component.html` AVANT la card QR Code,
 * gardée par `*ngIf="isSuperAdmin"`.
 */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RemoteAuthService, RemoteDevice } from '../../../../../core/services/remote-auth.service';
import { SitesService } from '../../../../../core/services/sites.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { ConfigProfile } from '../../../../../core/models';

interface ProfileRow {
  profile: ConfigProfile;
  pinInput: string;
  saving: boolean;
  loadingDevices: boolean;
  devices: RemoteDevice[];
  expanded: boolean;
}

@Component({
  selector: 'app-remote-auth-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remote-auth-section.component.html',
  styleUrls: ['./remote-auth-section.component.scss'],
})
export class RemoteAuthSectionComponent implements OnChanges {
  @Input() siteId!: string;

  rows: ProfileRow[] = [];
  loading = false;
  error: string | null = null;

  constructor(
    private remoteAuth: RemoteAuthService,
    private sites: SitesService,
    private notify: NotificationService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && this.siteId) {
      this.loadProfiles();
    }
  }

  async loadProfiles(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(this.sites.getProfiles(this.siteId));
      this.rows = (res.profiles || []).map((p) => ({
        profile: p,
        pinInput: '',
        saving: false,
        loadingDevices: false,
        devices: [],
        expanded: false,
      }));
    } catch (err) {
      this.error = (err as Error).message || 'Impossible de charger les profils';
    } finally {
      this.loading = false;
    }
  }

  async toggleDevices(row: ProfileRow): Promise<void> {
    row.expanded = !row.expanded;
    if (row.expanded && row.devices.length === 0) {
      await this.refreshDevices(row);
    }
  }

  async refreshDevices(row: ProfileRow): Promise<void> {
    row.loadingDevices = true;
    try {
      const res = await firstValueFrom(
        this.remoteAuth.listDevices(this.siteId, row.profile.id)
      );
      row.devices = res.devices || [];
    } catch (err) {
      this.notify.error(
        'Impossible de charger les appareils : ' + ((err as Error).message || '')
      );
    } finally {
      row.loadingDevices = false;
    }
  }

  async setPin(row: ProfileRow): Promise<void> {
    const pin = (row.pinInput || '').trim();
    if (!/^\d{4,6}$/.test(pin)) {
      this.notify.warning('Le PIN doit contenir entre 4 et 6 chiffres');
      return;
    }
    row.saving = true;
    try {
      const res = await firstValueFrom(
        this.remoteAuth.setPin(this.siteId, row.profile.id, pin)
      );
      row.profile.remote_pin_required = true;
      row.pinInput = '';
      if (res.revoked_tokens > 0) {
        this.notify.info(
          `PIN mis à jour. ${res.revoked_tokens} appareil(s) ont été déconnecté(s).`
        );
      } else {
        this.notify.success('PIN mis à jour');
      }
      if (row.expanded) await this.refreshDevices(row);
    } catch (err) {
      this.notify.error('Échec : ' + ((err as Error).message || ''));
    } finally {
      row.saving = false;
    }
  }

  async clearPin(row: ProfileRow): Promise<void> {
    if (
      !confirm(
        `Retirer le PIN du profil "${row.profile.display_name || row.profile.name}" ?\nTous les appareils connectés seront déconnectés.`
      )
    ) {
      return;
    }
    row.saving = true;
    try {
      const res = await firstValueFrom(
        this.remoteAuth.setPin(this.siteId, row.profile.id, null)
      );
      row.profile.remote_pin_required = false;
      this.notify.success(
        res.revoked_tokens > 0
          ? `PIN retiré. ${res.revoked_tokens} appareil(s) déconnecté(s).`
          : 'PIN retiré.'
      );
      if (row.expanded) await this.refreshDevices(row);
    } catch (err) {
      this.notify.error('Échec : ' + ((err as Error).message || ''));
    } finally {
      row.saving = false;
    }
  }

  async revokeDevice(row: ProfileRow, device: RemoteDevice): Promise<void> {
    if (!confirm(`Révoquer "${device.label || device.device_id}" ?`)) return;
    try {
      await firstValueFrom(
        this.remoteAuth.revokeDevice(this.siteId, row.profile.id, device.id)
      );
      this.notify.success('Appareil révoqué');
      await this.refreshDevices(row);
    } catch (err) {
      this.notify.error('Échec : ' + ((err as Error).message || ''));
    }
  }

  async revokeAll(row: ProfileRow): Promise<void> {
    if (!confirm(`Révoquer TOUS les appareils de ce profil ?`)) return;
    try {
      const res = await firstValueFrom(
        this.remoteAuth.revokeAllDevices(this.siteId, row.profile.id, 'manual_all')
      );
      this.notify.success(`${res.revoked} appareil(s) révoqué(s)`);
      await this.refreshDevices(row);
    } catch (err) {
      this.notify.error('Échec : ' + ((err as Error).message || ''));
    }
  }

  trackById(_i: number, row: ProfileRow): string {
    return row.profile.id;
  }

  trackDeviceById(_i: number, d: RemoteDevice): string {
    return d.id;
  }
}
