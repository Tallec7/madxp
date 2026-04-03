import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Metrics } from '../models';

@Injectable({
  providedIn: 'root'
})
export class SiteMetricsService {
  private readonly api = inject(ApiService);

  getSiteMetrics(id: string, hours: number = 24): Observable<{ site_id: string; period_hours: number; metrics: Metrics[] }> {
    return this.api.get(`/sites/${id}/metrics`, { hours });
  }

  getHealthStatus(id: string): Observable<{
    success: boolean;
    timestamp: string;
    healthScore: number;
    healthStatus: 'healthy' | 'degraded' | 'critical';
    issues: Array<{
      severity: 'critical' | 'warning';
      component: string;
      message: string;
      fix: string;
      lastError?: string | null;
    }>;
    gpu: {
      gpu_mem_mb: number | null;
      gpu_mem_warning: boolean;
      temperature: number | null;
      temperature_warning: boolean;
      throttled: string | null;
      throttled_flags: string[];
      voltage_ok: boolean;
      frequency_capped: boolean;
      throttling_active: boolean;
    };
    services: Array<{
      name: string;
      description: string;
      status: string;
      active: boolean;
      failed: boolean;
      lastError?: string | null;
    }>;
    metrics: {
      cpu: number;
      memory: number;
      disk: number;
      temperature: number;
      uptime: number;
      localIp: string | null;
    } | null;
    system: {
      hostname: string;
      os: string;
      uptime: number;
      localIp: string | null;
    };
    error?: string;
  }> {
    return this.api.get(`/sites/${id}/health-status`);
  }

  getSystemInfo(id: string): Observable<{
    hostname: string;
    os: string;
    kernel: string;
    architecture: string;
    cpu_model: string;
    cpu_cores: number;
    total_memory: number;
    ip_address: string;
    mac_address: string;
  }> {
    return this.api.get(`/sites/${id}/system-info`);
  }

  runDiagnostics(id: string): Observable<{
    success: boolean;
    timestamp: string;
    output: string;
    errors?: string | null;
    scriptPath?: string;
  }> {
    return this.api.get(`/sites/${id}/diagnostics`);
  }

  getNetworkDiagnostics(id: string): Observable<{
    success: boolean;
    timestamp: string;
    internet: {
      reachable: boolean;
      latency_ms: number | null;
      packet_loss_percent: number | null;
      packets_sent: number;
      packets_received: number;
    };
    central_server: {
      reachable: boolean;
      latency_ms: number | null;
      http_latency_ms: number | null;
      http_status: number | null;
      url: string;
      port_443_open: boolean | null;
      ssl_valid: boolean | null;
    };
    dns: {
      working: boolean;
      resolution_time_ms: number | null;
      tested_domain: string | null;
      resolved_ip: string | null;
    };
    gateway: {
      ip: string | null;
      reachable: boolean;
      latency_ms: number | null;
    };
    interfaces: Array<{
      name: string;
      ip4: string | null;
      ip6: string | null;
      mac: string | null;
      type: string;
      operstate: string;
      speed: number | null;
    }>;
    wifi: {
      connected: boolean;
      ssid: string | null;
      quality_percent: number | null;
      signal_dbm: number | null;
      bitrate_mbps: number | null;
    } | null;
    stability: {
      interface_uptime_seconds: number | null;
      reconnections_24h: number | null;
    };
  }> {
    return this.api.get(`/sites/${id}/network-diagnostics`);
  }

  runNetworkDiagnostics(id: string): Observable<{ success: boolean; commandId?: string; message: string }> {
    return this.api.post(`/sites/${id}/command`, { command: 'network_diagnostics', params: {} });
  }

  exportDebugBundle(id: string): Observable<{
    success: boolean;
    bundle: {
      timestamp: string;
      hostname: string;
      sections: {
        configuration: Record<string, unknown>;
        version: string;
        release: Record<string, unknown>;
        health: Record<string, unknown>;
        systemInfo: Record<string, unknown>;
        services: Array<{ name: string; status: string; active: boolean }>;
        logs: Record<string, string>;
        network: Record<string, unknown>;
        diskUsage: string;
        buffers: Record<string, unknown>;
        hotspotConfig: string;
        hotspotDiagnostics: Record<string, unknown>;
        bootConfig: string;
        transitionMetrics: Record<string, unknown>;
        dmesg: string;
        usbDevices: string;
        wifiClient: {
          connected: boolean;
          ssid: string | null;
          bssid: string | null;
          signal: number | null;
          ipAddress: string | null;
          bssidLocked: string | null;
          isMeshEnvironment: boolean;
          meshApCount: number;
        };
        videoFiles: string[];
      };
    };
  }> {
    return this.api.get(`/sites/${id}/debug-bundle`);
  }

  getHotspotConfig(id: string): Observable<{
    success: boolean;
    configured: boolean;
    ssid?: string;
    password?: string;
    channel?: number;
    isActive?: boolean;
    message?: string;
  }> {
    return this.api.get(`/sites/${id}/hotspot-config`);
  }

  getWifiBssidStatus(id: string): Observable<{
    success: boolean;
    connected: boolean;
    ssid: string | null;
    bssid: string | null;
    bssidLocked: string | null;
    isMeshEnvironment: boolean;
    meshApCount: number;
    signal: number | null;
    ipAddress: string | null;
    timestamp: string;
  }> {
    return this.api.get(`/sites/${id}/wifi-bssid-status`);
  }

  removeBssidLock(id: string): Observable<{
    success: boolean;
    message: string;
    modified: boolean;
    configPath?: string;
    timestamp: string;
  }> {
    return this.api.delete(`/sites/${id}/bssid-lock`);
  }

  optimizeForMesh(id: string): Observable<{
    success: boolean;
    message: string;
    modified: boolean;
    configPath?: string;
    timestamp: string;
  }> {
    return this.api.post(`/sites/${id}/optimize-mesh`, {});
  }

  scanWifiNetworks(id: string): Observable<{
    success: boolean;
    networks: Array<{
      ssid: string;
      bssid: string | null;
      signal: number | null;
      quality: number | null;
      channel: number | null;
      security: string;
    }>;
    currentSsid: string | null;
    currentBssid: string | null;
    scannedAt: string;
    error?: string;
  }> {
    return this.api.get(`/sites/${id}/wifi-scan`);
  }

  connectWifiClient(id: string, ssid: string, password: string): Observable<{
    success: boolean;
    connected: boolean;
    ssid: string;
    ipAddress: string | null;
    signal: number | null;
    message: string;
    timestamp: string;
  }> {
    return this.api.post(`/sites/${id}/wifi-connect`, { ssid, password });
  }

  fixHotspot(id: string, autoFix: boolean = false): Observable<{
    success: boolean;
    timestamp: string;
    output?: string;
    errors?: string | null;
    checks?: Array<{
      name: string;
      status: 'ok' | 'fail' | 'warning';
      message: string;
    }>;
    recommendations?: string[];
    diagnostic?: {
      currentChannel: number;
      recommendedChannel: number;
      ssid: string;
      hostapdActive: boolean;
      dnsmasqActive: boolean;
      powerOk: boolean;
      throttledValue: string;
    };
    fix?: {
      channelChanged: boolean;
      needsReboot: boolean;
      oldChannel: string;
      newChannel: string;
    };
    message?: string;
  }> {
    return this.api.post(`/sites/${id}/fix-hotspot`, { autoFix });
  }
}
