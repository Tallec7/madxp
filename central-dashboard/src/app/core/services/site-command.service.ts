import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { SiteConfiguration } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SiteCommandService {
  private readonly api = inject(ApiService);

  sendCommand(id: string, command: string, params?: Record<string, unknown>): Observable<{
    success: boolean;
    sent?: boolean;
    queued?: boolean;
    commandId?: string;
    message: string;
  }> {
    return this.api.post(`/sites/${id}/command`, { command, params });
  }

  restartService(id: string, service: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'restart_service', { service });
  }

  rebootSite(id: string): Observable<{ success: boolean; message: string }> {
    return this.sendCommand(id, 'reboot', {});
  }

  getLogs(id: string, lines: number = 100, service: string = 'neopro-app'): Observable<{ logs: string[] }> {
    return this.api.get(`/sites/${id}/logs`, { lines, service });
  }

  getCommandStatus(siteId: string, commandId: string): Observable<{ status: string; result?: { configuration?: SiteConfiguration; message?: string }; error_message?: string }> {
    return this.api.get(`/sites/${siteId}/command/${commandId}`);
  }

  getConfiguration(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'get_config', {});
  }

  updateHotspot(id: string, ssid?: string, password?: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    const params: Record<string, string> = {};
    if (ssid) params['ssid'] = ssid;
    if (password) params['password'] = password;
    return this.sendCommand(id, 'update_hotspot', params);
  }

  updateSiteSettings(id: string, settings: { language?: 'fr' | 'en' | 'es'; timezone?: string }): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.sendCommand(id, 'update_settings', settings);
  }

  getPendingCommands(id: string): Observable<{
    siteId: string;
    siteName: string;
    clubName: string;
    pendingCount: number;
    commands: Array<{
      id: string;
      site_id: string;
      command_type: string;
      command_data: Record<string, unknown>;
      priority: number;
      created_at: Date;
      expires_at: Date | null;
      attempts: number;
      description: string | null;
    }>;
  }> {
    return this.api.get(`/sites/${id}/pending-commands`);
  }

  cancelPendingCommand(siteId: string, commandId: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/sites/${siteId}/pending-commands/${commandId}`);
  }

  clearPendingCommands(siteId: string): Observable<{ success: boolean; message: string; count: number }> {
    return this.api.delete(`/sites/${siteId}/pending-commands`);
  }

  getQueueSummary(): Observable<{
    totalPending: number;
    sitesWithPendingCommands: number;
    sites: Array<{
      site_id: string;
      club_name: string;
      site_status: string;
      pending_count: number;
      highest_priority: number;
      oldest_command: Date | null;
      newest_command: Date | null;
      command_types: string[];
    }>;
  }> {
    return this.api.get('/sites/queue/summary');
  }
}
