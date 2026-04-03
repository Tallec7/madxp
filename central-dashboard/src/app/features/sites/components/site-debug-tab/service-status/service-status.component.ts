import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { pollCommand, CommandPollResult } from '../command-poller.util';
import { SitesService } from '../../../../../core/services/sites.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import {
  NetworkDiagnostics, BufferStatus, HotspotResult, HotspotInfo,
  WifiBssidStatus, WifiNetwork, WifiScanResult
} from '../debug-tab.models';

@Component({
  selector: 'app-service-status',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <!-- Synth\u00e8se r\u00e9seau -->
    <div class="debug-card">
      <div class="debug-header" (click)="showNetworkInfo = !showNetworkInfo">
        <span class="expand-icon">{{ showNetworkInfo ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83C\uDF10</span>
        <h4>{{ 'debug.networkTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="networkInfo">
          {{ networkInfo.internet?.reachable ? ('\u2705 ' + ('debug.summaryInternetOk' | translate)) : ('\u274C ' + ('debug.summaryNoInternet' | translate)) }}
        </span>
      </div>
      <div class="debug-content" *ngIf="showNetworkInfo">
        <div *ngIf="!isConnected" class="offline-warning">\u26A0\uFE0F {{ 'debug.networkOffline' | translate }}</div>
        <div *ngIf="isConnected && !networkInfo && !loadingNetworkInfo" class="network-actions">
          <button class="btn btn-primary btn-sm" (click)="loadNetworkInfo()">\uD83D\uDD04 {{ 'debug.networkAnalyze' | translate }}</button>
        </div>
        <div *ngIf="loadingNetworkInfo" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.networkAnalyzing' | translate }}</span></div>
        <div *ngIf="networkInfo && !loadingNetworkInfo" class="network-content">
          <div class="network-grid">
            <div class="network-card" [class.status-ok]="networkInfo.internet?.reachable" [class.status-fail]="!networkInfo.internet?.reachable">
              <div class="network-card-header">\uD83C\uDF0D {{ 'debug.networkInternet' | translate }}</div>
              <div class="network-card-value">{{ networkInfo.internet?.reachable ? ('debug.networkConnected' | translate) : ('debug.networkNotReachable' | translate) }}</div>
              <div class="network-card-detail" *ngIf="networkInfo.internet?.latency_ms">{{ 'debug.networkLatency' | translate }}: {{ networkInfo.internet?.latency_ms }}ms</div>
              <div class="network-card-detail" *ngIf="networkInfo.internet?.packet_loss_percent !== null">{{ 'debug.networkPacketLoss' | translate }}: {{ networkInfo.internet?.packet_loss_percent }}%</div>
            </div>
            <div class="network-card" [class.status-ok]="networkInfo.dns?.working" [class.status-fail]="!networkInfo.dns?.working">
              <div class="network-card-header">\uD83D\uDD17 {{ 'debug.networkDns' | translate }}</div>
              <div class="network-card-value">{{ networkInfo.dns?.working ? ('debug.networkDnsWorking' | translate) : ('debug.networkDnsFailed' | translate) }}</div>
              <div class="network-card-detail" *ngIf="networkInfo.dns?.resolution_time_ms">{{ 'debug.networkResolution' | translate }}: {{ networkInfo.dns?.resolution_time_ms }}ms</div>
            </div>
            <div class="network-card" [class.status-ok]="networkInfo.gateway?.reachable" [class.status-fail]="!networkInfo.gateway?.reachable">
              <div class="network-card-header">\uD83D\uDEAA {{ 'debug.networkGateway' | translate }}</div>
              <div class="network-card-value">{{ networkInfo.gateway?.ip || 'N/A' }}</div>
              <div class="network-card-detail">
                <span *ngIf="networkInfo.gateway?.reachable">\u2705 {{ 'debug.gatewayAccessible' | translate }}</span>
                <span *ngIf="!networkInfo.gateway?.reachable">\u274C {{ 'debug.gatewayNotAccessible' | translate }}</span>
              </div>
            </div>
            <div class="network-card" [class.status-ok]="networkInfo.central_server?.reachable" [class.status-fail]="!networkInfo.central_server?.reachable">
              <div class="network-card-header">\u2601\uFE0F {{ 'debug.networkCentral' | translate }}</div>
              <div class="network-card-value">{{ networkInfo.central_server?.reachable ? ('debug.networkConnected' | translate) : ('debug.networkNotReachable' | translate) }}</div>
              <div class="network-card-detail" *ngIf="networkInfo.central_server?.latency_ms">{{ 'debug.networkLatency' | translate }}: {{ networkInfo.central_server?.latency_ms }}ms</div>
            </div>
          </div>
          <div class="wifi-section" *ngIf="networkInfo.wifi">
            <h5>\uD83D\uDCF6 WiFi</h5>
            <div class="wifi-info">
              <span><strong>SSID:</strong> {{ networkInfo.wifi.ssid || 'N/A' }}</span>
              <span><strong>Signal:</strong> {{ networkInfo.wifi.signal_dbm }}dBm ({{ networkInfo.wifi.quality_percent }}%)</span>
              <span *ngIf="networkInfo.wifi.bitrate_mbps"><strong>{{ 'debug.networkBitrate' | translate }}:</strong> {{ networkInfo.wifi.bitrate_mbps }} Mb/s</span>
            </div>
          </div>
          <div class="wifi-section" *ngIf="networkInfo.stability">
            <h5>\uD83D\uDCC8 {{ 'debug.networkStability' | translate }}</h5>
            <div class="wifi-info">
              <span *ngIf="networkInfo.stability.interface_uptime_seconds !== null">
                <strong>{{ 'debug.networkUptimeInterface' | translate }}:</strong> {{ formatUptime(networkInfo.stability.interface_uptime_seconds!) }}
              </span>
              <span *ngIf="networkInfo.stability.reconnections_24h !== null"
                [class.text-danger]="networkInfo.stability.reconnections_24h! > 5"
                [class.text-success]="networkInfo.stability.reconnections_24h === 0">
                <strong>{{ 'debug.networkReconnections24h' | translate }}:</strong> {{ networkInfo.stability.reconnections_24h }}
              </span>
            </div>
          </div>
          <div class="wifi-section" *ngIf="networkInfo.interfaces && networkInfo.interfaces.length > 0">
            <h5>\uD83D\uDD0C {{ 'debug.networkInterfaces' | translate }}</h5>
            <div class="interfaces-list">
              <div class="interface-row header">
                <span>{{ 'debug.networkInterfaceName' | translate }}</span>
                <span>{{ 'debug.networkInterfaceIp' | translate }}</span>
                <span>{{ 'debug.networkInterfaceType' | translate }}</span>
                <span>{{ 'debug.networkInterfaceState' | translate }}</span>
              </div>
              <div class="interface-row" *ngFor="let iface of networkInfo.interfaces"
                [class.interface-up]="iface.operstate === 'up'" [class.interface-down]="iface.operstate !== 'up'">
                <span class="interface-name">{{ iface.name }}</span>
                <span class="interface-ip">{{ iface.ip4 || '-' }}</span>
                <span class="interface-type">{{ iface.type }}</span>
                <span class="interface-state">{{ iface.operstate === 'up' ? '\u2705' : '\u26AA' }} {{ iface.operstate }}</span>
              </div>
            </div>
          </div>
          <div class="wifi-section" *ngIf="networkInfo.central_server">
            <h5>\u2601\uFE0F {{ 'debug.networkCentralDetails' | translate }}</h5>
            <div class="wifi-info">
              <span *ngIf="networkInfo.central_server.http_latency_ms"><strong>{{ 'debug.networkHttpLatency' | translate }}:</strong> {{ networkInfo.central_server.http_latency_ms }}ms</span>
              <span *ngIf="networkInfo.central_server.ssl_valid !== null && networkInfo.central_server.ssl_valid !== undefined"><strong>SSL:</strong> {{ networkInfo.central_server.ssl_valid ? ('\u2705 ' + ('debug.networkSslValid' | translate)) : ('\u274C ' + ('debug.networkSslInvalid' | translate)) }}</span>
              <span *ngIf="networkInfo.central_server.port_443_open !== null && networkInfo.central_server.port_443_open !== undefined"><strong>Port 443:</strong> {{ networkInfo.central_server.port_443_open ? ('\u2705 ' + ('debug.networkPortOpen' | translate)) : ('\u274C ' + ('debug.networkPortClosed' | translate)) }}</span>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm refresh-network-btn" (click)="loadNetworkInfo()" [disabled]="loadingNetworkInfo">\uD83D\uDD04 {{ 'debug.networkRefresh' | translate }}</button>
        </div>
      </div>
    </div>

    <!-- Buffer Analytics -->
    <div class="debug-card">
      <div class="debug-header" (click)="showBufferStatus = !showBufferStatus">
        <span class="expand-icon">{{ showBufferStatus ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCCA</span>
        <h4>{{ 'debug.bufferTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="bufferStatus">{{ bufferStatus.analytics?.event_count || 0 }} {{ 'debug.bufferPending' | translate }}</span>
      </div>
      <div class="debug-content" *ngIf="showBufferStatus">
        <div *ngIf="!isConnected" class="offline-warning">\u26A0\uFE0F {{ 'debug.bufferOffline' | translate }}</div>
        <div *ngIf="isConnected && !bufferStatus && !loadingBufferStatus" class="buffer-actions">
          <button class="btn btn-primary btn-sm" (click)="loadBufferStatus()">\uD83D\uDD04 {{ 'debug.bufferLoad' | translate }}</button>
        </div>
        <div *ngIf="loadingBufferStatus" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.bufferLoading' | translate }}</span></div>
        <div *ngIf="bufferStatus && !loadingBufferStatus" class="buffer-content">
          <div class="buffer-grid">
            <div class="buffer-card" [class.buffer-warning]="(bufferStatus.analytics?.event_count || 0) > 1000">
              <div class="buffer-header">\uD83D\uDCF9 {{ 'debug.bufferVideoPlays' | translate }}</div>
              <div class="buffer-count">{{ bufferStatus.analytics?.event_count || 0 }}</div>
              <div class="buffer-label">{{ 'debug.bufferEvents' | translate }}</div>
              <div class="buffer-details" *ngIf="bufferStatus.analytics?.file_exists">
                <div class="buffer-detail">{{ 'debug.bufferSize' | translate }}: {{ formatBytes(bufferStatus.analytics?.file_size_bytes || 0) }}</div>
                <div class="buffer-detail" *ngIf="bufferStatus.sponsors?.event_count">{{ 'debug.bufferIncludingSponsors' | translate:{ count: bufferStatus.sponsors?.event_count } }}</div>
                <div class="buffer-detail" *ngIf="bufferStatus.analytics?.oldest_event">{{ 'debug.bufferOldest' | translate }}: {{ bufferStatus.analytics?.oldest_event | date:'dd/MM HH:mm' }}</div>
              </div>
            </div>
          </div>
          <div class="buffer-hint" *ngIf="bufferStatus.legacy_sponsor_file">\u26A0\uFE0F <span [innerHTML]="'debug.bufferLegacyWarning' | translate"></span></div>
          <div class="buffer-hint" *ngIf="(bufferStatus.analytics?.event_count || 0) > 1000">\u26A0\uFE0F {{ 'debug.bufferOverflowWarning' | translate }}</div>
          <button class="btn btn-secondary btn-sm" (click)="loadBufferStatus()" [disabled]="loadingBufferStatus">\uD83D\uDD04 {{ 'debug.bufferRefresh' | translate }}</button>
        </div>
      </div>
    </div>

    <!-- Hotspot WiFi -->
    <div class="debug-card">
      <div class="debug-header" (click)="showHotspotFix = !showHotspotFix">
        <span class="expand-icon">{{ showHotspotFix ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCE1</span>
        <h4>{{ 'debug.hotspotTitle' | translate }}</h4>
        <span class="debug-stats" *ngIf="hotspotInfo">
          <span *ngIf="hotspotInfo.isActive" class="status-badge status-online">\u25CF {{ 'debug.hotspotActive' | translate }}</span>
          <span *ngIf="!hotspotInfo.isActive" class="status-badge status-offline">\u25CF {{ 'debug.hotspotInactive' | translate }}</span>
          <span *ngIf="hotspotInfo.clients > 0" class="client-count">\uD83D\uDC65 {{ hotspotInfo.clients }}</span>
        </span>
        <span class="debug-stats" *ngIf="!hotspotInfo && hotspotResult">
          <span *ngIf="hotspotResult.success">\u2705 {{ 'debug.hotspotVerified' | translate }}</span>
          <span *ngIf="!hotspotResult.success">\u274C {{ 'debug.hotspotError' | translate }}</span>
        </span>
      </div>
      <div class="debug-content" *ngIf="showHotspotFix">
        <div *ngIf="hotspotInfo" class="hotspot-live-info">
          <div class="info-grid">
            <div class="info-item"><span class="info-label">SSID</span><span class="info-value">{{ hotspotInfo.ssid || 'N/A' }}</span></div>
            <div class="info-item">
              <span class="info-label">{{ 'debug.hotspotChannel' | translate }}</span>
              <span class="info-value" [class.channel-crowded]="hotspotInfo.channel === 1 || hotspotInfo.channel === 6">
                {{ hotspotInfo.channel || 'N/A' }}
                <span *ngIf="hotspotInfo.channel === 1 || hotspotInfo.channel === 6" class="channel-warning" [title]="'debug.hotspotChannelCrowded' | translate">\u26A0\uFE0F</span>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ 'debug.hotspotState' | translate }}</span>
              <span class="info-value" [class.text-success]="hotspotInfo.isActive" [class.text-danger]="!hotspotInfo.isActive">
                {{ hotspotInfo.isActive ? '\u2705' : '\u274C' }} {{ (hotspotInfo.isActive ? 'sites.status.active' : 'sites.status.inactive') | translate }}
              </span>
            </div>
            <div class="info-item"><span class="info-label">{{ 'debug.hotspotClients' | translate }}</span><span class="info-value">\uD83D\uDC65 {{ hotspotInfo.clients || 0 }}</span></div>
          </div>
        </div>
        <div *ngIf="!isConnected" class="offline-warning">\u26A0\uFE0F {{ 'debug.hotspotOffline' | translate }}</div>
        <div *ngIf="isConnected" class="hotspot-section">
          <p class="hotspot-hint">{{ 'debug.hotspotHint' | translate }}</p>
          <div class="hotspot-actions">
            <button class="btn btn-warning" (click)="fixHotspot(false)" [disabled]="fixingHotspot">{{ fixingHotspot ? ('\u23F3 ' + ('debug.hotspotDiagnosing' | translate)) : ('\uD83D\uDD0D ' + ('debug.hotspotDiagnoseBtn' | translate)) }}</button>
            <button class="btn btn-primary" (click)="fixHotspot(true)" [disabled]="fixingHotspot">{{ fixingHotspot ? ('\u23F3 ' + ('debug.hotspotRepairing' | translate)) : ('\uD83D\uDD27 ' + ('debug.hotspotRepairBtn' | translate)) }}</button>
          </div>
          <div *ngIf="fixingHotspot" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.hotspotWaiting' | translate }}</span></div>

          <!-- Reboot confirm modal -->
          <div *ngIf="showRebootConfirmModal" class="modal-overlay">
            <div class="modal-content reboot-modal">
              <h3>\u26A0\uFE0F {{ 'debug.rebootRequiredTitle' | translate }}</h3>
              <p>{{ 'debug.rebootChannelChanged' | translate }} <strong>{{ hotspotResult?.fix?.oldChannel }}</strong> {{ 'debug.rebootChannelTo' | translate }} <strong>{{ hotspotResult?.fix?.newChannel }}</strong>.</p>
              <p>{{ 'debug.rebootApplyMsg' | translate }}</p>
              <p class="reboot-warning">\u26A0\uFE0F {{ 'debug.rebootTvWarning' | translate }}</p>
              <div class="modal-actions">
                <button class="btn btn-secondary" (click)="cancelReboot()">{{ 'debug.later' | translate }}</button>
                <button class="btn btn-danger" (click)="confirmReboot()" [disabled]="rebooting">{{ rebooting ? ('debug.rebooting' | translate) : ('debug.rebootNow' | translate) }}</button>
              </div>
            </div>
          </div>

          <div *ngIf="hotspotResult && !fixingHotspot && !showRebootConfirmModal" class="hotspot-result">
            <div *ngIf="hotspotResult.diagnostic" class="hotspot-diagnostic">
              <div class="diagnostic-grid">
                <div class="diagnostic-item"><span class="diagnostic-label">{{ 'debug.currentChannel' | translate }}</span><span class="diagnostic-value">{{ hotspotResult.diagnostic.currentChannel }}</span></div>
                <div class="diagnostic-item" *ngIf="hotspotResult.diagnostic.recommendedChannel !== hotspotResult.diagnostic.currentChannel"><span class="diagnostic-label">{{ 'debug.recommendedChannel' | translate }}</span><span class="diagnostic-value recommended">{{ hotspotResult.diagnostic.recommendedChannel }}</span></div>
                <div class="diagnostic-item"><span class="diagnostic-label">SSID</span><span class="diagnostic-value">{{ hotspotResult.diagnostic.ssid }}</span></div>
                <div class="diagnostic-item"><span class="diagnostic-label">hostapd</span><span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.hostapdActive" [class.text-danger]="!hotspotResult.diagnostic.hostapdActive">{{ hotspotResult.diagnostic.hostapdActive ? ('debug.activeStatus' | translate) : ('debug.inactiveStatus' | translate) }}</span></div>
                <div class="diagnostic-item"><span class="diagnostic-label">dnsmasq</span><span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.dnsmasqActive" [class.text-danger]="!hotspotResult.diagnostic.dnsmasqActive">{{ hotspotResult.diagnostic.dnsmasqActive ? ('debug.activeStatus' | translate) : ('debug.inactiveStatus' | translate) }}</span></div>
                <div class="diagnostic-item"><span class="diagnostic-label">{{ 'debug.power' | translate }}</span><span class="diagnostic-value" [class.text-success]="hotspotResult.diagnostic.powerOk" [class.text-danger]="!hotspotResult.diagnostic.powerOk">{{ hotspotResult.diagnostic.powerOk ? ('debug.powerOk' | translate) : ('debug.powerProblem' | translate) }}</span></div>
              </div>
              <div *ngIf="hotspotResult.fix?.channelChanged && hotspotResult.fix?.needsReboot" class="pending-reboot-info">
                <p>\u2705 {{ 'debug.rebootChannelPending' | translate:{ old: hotspotResult.fix?.oldChannel, new: hotspotResult.fix?.newChannel } }}</p>
                <p>\u2139\uFE0F {{ 'debug.rebootApplyNextRestart' | translate }}</p>
              </div>
              <div *ngIf="hotspotResult.message" class="diagnostic-message">{{ hotspotResult.message }}</div>
            </div>
            <div *ngIf="hotspotResult.checks" class="hotspot-checks">
              <div *ngFor="let check of hotspotResult.checks" class="hotspot-check" [class.check-ok]="check.status === 'ok'" [class.check-fail]="check.status === 'fail'" [class.check-warning]="check.status === 'warning'">
                <span class="check-icon">{{ check.status === 'ok' ? '\u2705' : check.status === 'fail' ? '\u274C' : '\u26A0\uFE0F' }}</span>
                <span class="check-name">{{ check.name }}</span>
                <span class="check-value">{{ check.value }}</span>
              </div>
            </div>
            <div *ngIf="hotspotResult.output && !hotspotResult.diagnostic" class="hotspot-output">
              <pre class="output-viewer">{{ hotspotResult.output }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- WiFi Client - Mesh Detection -->
    <div class="debug-card">
      <div class="debug-header" (click)="toggleWifiBssid()">
        <span class="expand-icon">{{ showWifiBssid ? '\u25BC' : '\u25B6' }}</span>
        <span class="debug-icon">\uD83D\uDCF6</span>
        <h4>{{ 'debug.wifiClient' | translate }}</h4>
        <span class="debug-stats" *ngIf="wifiBssidStatus">
          <span *ngIf="wifiBssidStatus.connected" class="status-badge status-online">\u25CF {{ 'debug.wifiConnected' | translate }}</span>
          <span *ngIf="!wifiBssidStatus.connected" class="status-badge status-offline">\u25CF {{ 'debug.wifiDisconnected' | translate }}</span>
          <span *ngIf="wifiBssidStatus.isMeshEnvironment" class="mesh-badge">\uD83D\uDD00 {{ 'debug.meshDetected' | translate }} ({{ wifiBssidStatus.meshApCount }} APs)</span>
          <span *ngIf="wifiBssidStatus.bssidLocked" class="bssid-lock-badge">\uD83D\uDD12 {{ 'debug.bssidLocked' | translate }}</span>
        </span>
        <span class="debug-stats" *ngIf="!wifiBssidStatus && !loadingWifiBssid">{{ 'debug.notLoaded' | translate }}</span>
        <span class="debug-stats" *ngIf="loadingWifiBssid">{{ 'common.loading' | translate }}</span>
      </div>
      <div class="debug-content" *ngIf="showWifiBssid">
        <div *ngIf="!isConnected" class="offline-warning">\u26A0\uFE0F {{ 'debug.wifiOfflineWarning' | translate }}</div>
        <div *ngIf="isConnected && !wifiBssidStatus && !loadingWifiBssid" class="wifi-actions">
          <button class="btn btn-primary btn-sm" (click)="loadWifiBssidStatus()">\uD83D\uDD04 {{ 'debug.loadWifiStatus' | translate }}</button>
        </div>
        <div *ngIf="loadingWifiBssid" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.loadingWifi' | translate }}</span></div>
        <div *ngIf="wifiBssidStatus" class="wifi-bssid-content">
          <div *ngIf="wifiBssidStatus.isMeshEnvironment && wifiBssidStatus.bssidLocked" class="mesh-warning-banner">
            <div class="warning-icon">\u26A0\uFE0F</div>
            <div class="warning-content">
              <strong>{{ 'debug.meshWarningTitle' | translate }}</strong>
              <p>{{ wifiBssidStatus.meshApCount }} {{ 'debug.meshWarningText' | translate }} "{{ wifiBssidStatus.ssid }}". {{ 'debug.meshWarningText2' | translate }}</p>
              <div class="warning-actions">
                <button class="btn btn-warning btn-sm" (click)="removeBssidLock()" [disabled]="removingBssidLock">{{ removingBssidLock ? ('\u23F3 ' + ('debug.removingBssidLock' | translate)) : ('\uD83D\uDD13 ' + ('debug.removeBssidLock' | translate)) }}</button>
                <button class="btn btn-secondary btn-sm" (click)="optimizeForMesh()" [disabled]="optimizingMesh">{{ optimizingMesh ? ('\u23F3 ' + ('debug.optimizingMesh' | translate)) : ('\uD83D\uDD27 ' + ('debug.optimizeForMesh' | translate)) }}</button>
              </div>
            </div>
          </div>
          <div *ngIf="wifiBssidStatus.isMeshEnvironment && !wifiBssidStatus.bssidLocked" class="mesh-info-banner">
            <div class="info-icon">\u2139\uFE0F</div>
            <div class="info-content">
              <strong>{{ 'debug.meshInfoTitle' | translate }}</strong>
              <p>{{ wifiBssidStatus.meshApCount }} {{ 'debug.meshInfoText' | translate }} "{{ wifiBssidStatus.ssid }}". {{ 'debug.roamingActive' | translate }}</p>
            </div>
          </div>
          <div class="wifi-info-grid">
            <div class="info-item"><span class="info-label">SSID</span><span class="info-value">{{ wifiBssidStatus.ssid || ('debug.notAvailable' | translate) }}</span></div>
            <div class="info-item"><span class="info-label">BSSID ({{ 'debug.accessPoint' | translate }})</span><span class="info-value">{{ wifiBssidStatus.bssid || ('debug.notAvailable' | translate) }}</span></div>
            <div class="info-item" *ngIf="wifiBssidStatus.bssidLocked"><span class="info-label">{{ 'debug.lockedBssid' | translate }}</span><span class="info-value bssid-locked">\uD83D\uDD12 {{ wifiBssidStatus.bssidLocked }}</span></div>
            <div class="info-item">
              <span class="info-label">{{ 'debug.signal' | translate }}</span>
              <span class="info-value" [class.signal-good]="wifiBssidStatus.signal && wifiBssidStatus.signal > -60" [class.signal-medium]="wifiBssidStatus.signal && wifiBssidStatus.signal <= -60 && wifiBssidStatus.signal > -75" [class.signal-weak]="wifiBssidStatus.signal && wifiBssidStatus.signal <= -75">
                {{ wifiBssidStatus.signal ? wifiBssidStatus.signal + ' dBm' : ('debug.notAvailable' | translate) }}
                {{ wifiBssidStatus.signal && wifiBssidStatus.signal > -60 ? '\uD83D\uDCF6' : '' }}
                {{ wifiBssidStatus.signal && wifiBssidStatus.signal <= -60 && wifiBssidStatus.signal > -75 ? '\uD83D\uDCF6' : '' }}
                {{ wifiBssidStatus.signal && wifiBssidStatus.signal <= -75 ? '\uD83D\uDCF6' : '' }}
              </span>
            </div>
            <div class="info-item"><span class="info-label">{{ 'debug.ipAddress' | translate }}</span><span class="info-value">{{ wifiBssidStatus.ipAddress || ('debug.notAvailable' | translate) }}</span></div>
            <div class="info-item">
              <span class="info-label">{{ 'debug.environment' | translate }}</span>
              <span class="info-value">{{ wifiBssidStatus.isMeshEnvironment ? ('\uD83D\uDD00 ' + ('debug.meshDetected' | translate) + ' (' + wifiBssidStatus.meshApCount + ' APs)') : ('\uD83D\uDCE1 ' + ('debug.standard' | translate)) }}</span>
            </div>
          </div>
          <div class="wifi-refresh"><button class="btn btn-secondary btn-sm" (click)="loadWifiBssidStatus()" [disabled]="loadingWifiBssid">\uD83D\uDD04 {{ 'debug.refresh' | translate }}</button></div>
        </div>

        <!-- WiFi Client Configuration -->
        <div class="wifi-config-section" *ngIf="isConnected">
          <h5>{{ 'debug.wifiConfig' | translate }}</h5>
          <div class="wifi-scan-actions"><button class="btn btn-primary btn-sm" (click)="scanWifiNetworks()" [disabled]="scanningWifi || connectingWifi">\uD83D\uDCE1 {{ scanningWifi ? ('debug.scanningWifi' | translate) : ('debug.scanNetworks' | translate) }}</button></div>
          <div *ngIf="scanningWifi" class="loading-inline"><div class="spinner-small"></div><span>{{ 'debug.scanningWifi' | translate }}</span></div>
          <div *ngIf="wifiScanResult && !wifiScanResult.success && wifiScanResult.error" class="wifi-scan-error">\u26A0\uFE0F {{ wifiScanResult.error }}</div>
          <div *ngIf="wifiScanResult && wifiScanResult.success && !scanningWifi" class="wifi-networks-list">
            <div class="scan-info">{{ wifiScanResult.networks.length }} {{ 'debug.networksFound' | translate }} <span class="scan-time">{{ wifiScanResult.scannedAt | date:'HH:mm:ss' }}</span></div>
            <div *ngFor="let network of wifiScanResult.networks" class="wifi-network-item" [class.selected]="selectedWifiNetwork?.ssid === network.ssid && selectedWifiNetwork?.bssid === network.bssid" [class.current-network]="wifiScanResult.currentSsid === network.ssid" (click)="selectWifiNetwork(network)">
              <div class="network-info"><span class="network-ssid">{{ network.ssid }}</span><span class="network-details">{{ network.security }} \u00B7 ch.{{ network.channel }}</span></div>
              <div class="network-signal">
                <span [class]="getWifiSignalClass(network.signal)">{{ network.signal }} dBm</span>
                <span *ngIf="wifiScanResult.currentSsid === network.ssid" class="current-badge">\u2713 {{ 'debug.currentNetwork' | translate }}</span>
              </div>
            </div>
            <div *ngIf="selectedWifiNetwork" class="wifi-connect-form">
              <div class="connect-target">{{ 'debug.connectTo' | translate }} <strong>{{ selectedWifiNetwork.ssid }}</strong> ({{ selectedWifiNetwork.security }})</div>
              <div *ngIf="selectedWifiNetwork.security !== 'Open'" class="password-input-group">
                <label>{{ 'debug.wifiPassword' | translate }}</label>
                <input type="password" [(ngModel)]="wifiPassword" [placeholder]="'debug.wifiPasswordPlaceholder' | translate" class="form-control" (keyup.enter)="connectWifiClient()"/>
              </div>
              <div class="connect-actions">
                <button class="btn btn-success btn-sm" (click)="connectWifiClient()" [disabled]="connectingWifi || (selectedWifiNetwork.security !== 'Open' && (!wifiPassword || wifiPassword.length < 8))">{{ connectingWifi ? ('debug.connectingWifi' | translate) : ('debug.connectWifi' | translate) }}</button>
              </div>
              <div *ngIf="wifiConnectResult" class="wifi-connect-result" [class.connect-success]="wifiConnectResult.connected" [class.connect-pending]="!wifiConnectResult.connected">
                <div>{{ wifiConnectResult.message }}</div>
                <div *ngIf="wifiConnectResult.ipAddress">IP: {{ wifiConnectResult.ipAddress }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .debug-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
    .debug-header { display: flex; align-items: center; gap: 0.5rem; padding: 1rem 1.5rem; cursor: pointer; transition: background 0.15s; }
    .debug-header:hover { background: #f8fafc; }
    .debug-header h4 { margin: 0; font-size: 0.9375rem; font-weight: 600; flex: 1; }
    .expand-icon { font-size: 0.75rem; color: #64748b; width: 16px; }
    .debug-icon { font-size: 1.125rem; }
    .debug-stats { font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px; }
    .debug-content { padding: 0 1.5rem 1.5rem 1.5rem; border-top: 1px solid #f1f5f9; }
    .offline-warning { padding: 1rem; background: #fef3c7; border-radius: 6px; color: #92400e; font-size: 0.875rem; margin-top: 1rem; }
    .loading-inline { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; color: #64748b; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; border: none; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #f1f5f9; color: #475569; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover:not(:disabled) { background: #d97706; }
    .btn-danger { background: #dc2626; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-danger:disabled { background: #f87171; cursor: not-allowed; }
    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover:not(:disabled) { background: #15803d; }
    .btn-success:disabled { opacity: 0.5; cursor: not-allowed; }
    .network-actions, .buffer-actions, .wifi-actions { padding-top: 1rem; }
    .network-content { padding-top: 1rem; }
    .network-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .network-card { padding: 1rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .network-card.status-ok { background: #f0fdf4; border-color: #86efac; }
    .network-card.status-fail { background: #fef2f2; border-color: #fca5a5; }
    .network-card-header { font-weight: 600; font-size: 0.8125rem; margin-bottom: 0.5rem; }
    .network-card-value { font-size: 0.9375rem; font-weight: 500; }
    .network-card-detail { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    .wifi-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
    .wifi-section h5 { margin: 0 0 0.5rem 0; font-size: 0.875rem; }
    .wifi-info { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8125rem; }
    .refresh-network-btn { margin-top: 1rem; }
    .interfaces-list { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .interface-row { display: grid; grid-template-columns: 100px 1fr 80px 80px; gap: 0.5rem; padding: 0.375rem 0.75rem; font-size: 0.75rem; border-bottom: 1px solid #f1f5f9; }
    .interface-row:last-child { border-bottom: none; }
    .interface-row.header { background: #f8fafc; font-weight: 600; color: #475569; font-size: 0.6875rem; text-transform: uppercase; }
    .interface-row.interface-up { background: #f0fdf4; }
    .interface-name { font-family: 'SF Mono', Monaco, monospace; font-weight: 500; }
    .interface-ip { font-family: 'SF Mono', Monaco, monospace; }
    .text-success { color: #16a34a; }
    .text-danger { color: #dc2626; }
    .buffer-content { padding-top: 1rem; }
    .buffer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .buffer-card { padding: 1.25rem; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; text-align: center; }
    .buffer-card.buffer-warning { background: #fef3c7; border-color: #fbbf24; }
    .buffer-header { font-weight: 600; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .buffer-count { font-size: 2rem; font-weight: 700; line-height: 1.2; }
    .buffer-label { font-size: 0.75rem; color: #64748b; }
    .buffer-details { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1); }
    .buffer-detail { font-size: 0.6875rem; color: #64748b; }
    .buffer-hint { padding: 0.75rem; background: #fef3c7; border-radius: 6px; font-size: 0.8125rem; margin-bottom: 1rem; }
    .hotspot-section { padding-top: 1rem; }
    .hotspot-hint { font-size: 0.8125rem; color: #64748b; margin: 0 0 1rem 0; }
    .hotspot-actions { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
    .hotspot-result { margin-top: 1rem; }
    .hotspot-checks { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
    .hotspot-check { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; background: #f8fafc; border-radius: 4px; font-size: 0.8125rem; }
    .hotspot-check.check-ok { background: #dcfce7; }
    .hotspot-check.check-fail { background: #fee2e2; }
    .hotspot-check.check-warning { background: #fef3c7; }
    .hotspot-check .check-name { font-weight: 500; min-width: 100px; }
    .hotspot-check .check-value { font-family: 'SF Mono', Monaco, monospace; font-size: 0.75rem; color: #475569; }
    .hotspot-output { margin-top: 1rem; }
    .output-viewer { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 6px; font-size: 0.6875rem; font-family: 'SF Mono', Monaco, monospace; max-height: 300px; overflow: auto; white-space: pre-wrap; }
    .hotspot-live-info { background: #f8fafc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; border: 1px solid #e2e8f0; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .info-item { display: flex; flex-direction: column; gap: 0.25rem; }
    .info-label { font-size: 0.6875rem; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.025em; }
    .info-value { font-size: 0.875rem; color: #1e293b; font-weight: 500; }
    .channel-warning { margin-left: 0.25rem; cursor: help; }
    .client-count { margin-left: 0.5rem; background: #dbeafe; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.75rem; }
    .status-badge { padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
    .status-online { background: #dcfce7; color: #166534; }
    .status-offline { background: #fee2e2; color: #991b1b; }
    .diagnostic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .diagnostic-item { background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; }
    .diagnostic-label { display: block; font-size: 0.6875rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem; }
    .diagnostic-value { font-size: 0.875rem; font-weight: 600; color: #1e293b; }
    .diagnostic-value.recommended { color: #16a34a; }
    .pending-reboot-info { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 0.75rem; margin-top: 1rem; }
    .pending-reboot-info p { margin: 0 0 0.5rem 0; font-size: 0.8125rem; color: #166534; }
    .pending-reboot-info p:last-child { margin-bottom: 0; }
    .diagnostic-message { margin-top: 1rem; padding: 0.75rem; background: #f1f5f9; border-radius: 6px; font-size: 0.8125rem; color: #475569; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; border-radius: 12px; padding: 1.5rem; max-width: 450px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .reboot-modal h3 { margin: 0 0 1rem 0; font-size: 1.125rem; color: #f59e0b; }
    .reboot-modal p { margin: 0 0 0.75rem 0; font-size: 0.875rem; color: #475569; }
    .reboot-warning { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 0.75rem; color: #92400e; font-weight: 500; }
    .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
    .wifi-bssid-content { padding-top: 1rem; }
    .mesh-warning-banner { display: flex; gap: 0.75rem; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .mesh-warning-banner .warning-icon { font-size: 1.5rem; flex-shrink: 0; }
    .mesh-warning-banner .warning-content strong { color: #92400e; display: block; margin-bottom: 0.25rem; }
    .mesh-warning-banner .warning-content p { font-size: 0.8125rem; color: #78350f; margin: 0 0 0.75rem 0; }
    .mesh-warning-banner .warning-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .mesh-info-banner { display: flex; gap: 0.75rem; background: rgba(0,123,255,0.1); border-left: 3px solid #3b82f6; border-radius: 4px; padding: 0.75rem 1rem; margin-bottom: 1rem; }
    .mesh-info-banner .info-icon { font-size: 1.25rem; flex-shrink: 0; }
    .mesh-info-banner .info-content strong { color: #1e40af; display: block; margin-bottom: 0.125rem; }
    .mesh-info-banner .info-content p { font-size: 0.8125rem; color: #3b82f6; margin: 0; }
    .wifi-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .wifi-info-grid .info-item { background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; }
    .wifi-info-grid .info-label { display: block; font-size: 0.6875rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem; }
    .wifi-info-grid .info-value { font-size: 0.875rem; font-weight: 500; color: #1e293b; }
    .wifi-info-grid .info-value.bssid-locked { color: #dc2626; }
    .wifi-info-grid .info-value.signal-good { color: #16a34a; }
    .wifi-info-grid .info-value.signal-medium { color: #ca8a04; }
    .wifi-info-grid .info-value.signal-weak { color: #dc2626; }
    .wifi-refresh { margin-top: 0.75rem; }
    .mesh-badge { background: #dbeafe; color: #1e40af; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; }
    .bssid-lock-badge { background: #fee2e2; color: #991b1b; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; }
    .wifi-config-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; }
    .wifi-config-section h5 { margin: 0 0 0.75rem 0; font-size: 0.875rem; font-weight: 600; color: #334155; }
    .wifi-scan-actions { margin-bottom: 0.75rem; }
    .wifi-scan-error { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem; font-size: 0.813rem; color: #92400e; }
    .wifi-networks-list { margin-top: 0.75rem; }
    .scan-info { font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; }
    .scan-time { margin-left: 0.5rem; font-style: italic; }
    .wifi-network-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 0.25rem; cursor: pointer; transition: background-color 0.15s, border-color 0.15s; font-size: 0.813rem; }
    .wifi-network-item:hover { background-color: #f8fafc; }
    .wifi-network-item.selected { border-color: #3b82f6; background-color: #eff6ff; }
    .wifi-network-item.current-network { border-left: 3px solid #16a34a; }
    .network-info { display: flex; flex-direction: column; gap: 0.125rem; }
    .network-ssid { font-weight: 500; }
    .network-details { font-size: 0.688rem; color: #94a3b8; }
    .network-signal { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; }
    .current-badge { font-size: 0.688rem; color: #16a34a; font-weight: 600; }
    .wifi-connect-form { margin-top: 0.75rem; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .connect-target { margin-bottom: 0.5rem; font-size: 0.813rem; }
    .password-input-group { margin-bottom: 0.5rem; }
    .password-input-group label { display: block; font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem; }
    .password-input-group .form-control { width: 100%; padding: 0.375rem 0.625rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.813rem; }
    .connect-actions { margin-top: 0.5rem; }
    .wifi-connect-result { margin-top: 0.625rem; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.813rem; }
    .wifi-connect-result.connect-success { background-color: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .wifi-connect-result.connect-pending { background-color: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
    .signal-good { color: #16a34a; }
    .signal-medium { color: #ca8a04; }
    .signal-weak { color: #dc2626; }
  `]
})
export class ServiceStatusComponent implements OnDestroy {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;
  @Input() hotspotInfo: HotspotInfo | null = null;
  @Output() networkInfoLoaded = new EventEmitter<NetworkDiagnostics>();
  @Output() bufferStatusLoaded = new EventEmitter<BufferStatus>();

  showNetworkInfo: boolean = false;
  networkInfo: NetworkDiagnostics | null = null;
  loadingNetworkInfo: boolean = false;

  showBufferStatus: boolean = false;
  bufferStatus: BufferStatus | null = null;
  loadingBufferStatus: boolean = false;
  private bufferPollSubscription: Subscription | null = null;

  showHotspotFix: boolean = false;
  hotspotResult: HotspotResult | null = null;
  fixingHotspot: boolean = false;
  showRebootConfirmModal: boolean = false;
  rebooting: boolean = false;

  showWifiBssid: boolean = false;
  wifiBssidStatus: WifiBssidStatus | null = null;
  loadingWifiBssid: boolean = false;
  removingBssidLock: boolean = false;
  optimizingMesh: boolean = false;

  wifiScanResult: WifiScanResult | null = null;
  scanningWifi: boolean = false;
  selectedWifiNetwork: WifiNetwork | null = null;
  wifiPassword: string = '';
  connectingWifi: boolean = false;
  wifiConnectResult: { connected: boolean; ipAddress: string | null; message: string } | null = null;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private translate: TranslateService
  ) {}

  ngOnDestroy(): void {
    this.bufferPollSubscription?.unsubscribe();
  }

  formatUptime(seconds: number): string {
    if (!seconds || seconds <= 0) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  formatBytes(bytes: number): string {
    if (bytes === null || bytes === undefined || bytes <= 0 || !isFinite(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  loadNetworkInfo(): void {
    if (!this.isConnected) { this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline')); return; }
    this.loadingNetworkInfo = true;
    this.sitesService.getNetworkDiagnostics(this.siteId).subscribe({
      next: (result) => {
        this.loadingNetworkInfo = false;
        if (result && result.success !== false) { this.networkInfo = result as NetworkDiagnostics; this.networkInfoLoaded.emit(this.networkInfo); }
        else { this.notificationService.error(this.translate.instant('debug.notifyNetworkFailed')); }
      },
      error: (error) => {
        this.loadingNetworkInfo = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to get network diagnostics', { error: message, siteId: this.siteId });
      }
    });
  }

  loadBufferStatus(): void {
    if (!this.isConnected) { this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline')); return; }
    this.loadingBufferStatus = true;
    this.bufferPollSubscription?.unsubscribe();
    const { result$, cancel } = pollCommand<BufferStatus>({
      siteId: this.siteId, commandName: 'get_analytics_buffer_status', timeoutSeconds: 15,
      sendCommand: (id, cmd, params) => this.sitesService.sendCommand(id, cmd, params),
      getCommandStatus: (id, cmdId) => this.sitesService.getCommandStatus(id, cmdId),
    });
    this.bufferPollSubscription = new Subscription(() => cancel());
    result$.subscribe((pollResult: CommandPollResult<BufferStatus>) => {
      this.loadingBufferStatus = false;
      if (pollResult.success && pollResult.data) { this.bufferStatus = pollResult.data; this.bufferStatusLoaded.emit(this.bufferStatus); }
      else {
        this.notificationService.error(pollResult.error || this.translate.instant('debug.notifyBufferFailed'));
        this.logger.error('Failed to get buffer status', { error: pollResult.error, siteId: this.siteId });
      }
    });
  }

  fixHotspot(autoFix: boolean): void {
    if (!this.isConnected) { this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline')); return; }
    this.fixingHotspot = true;
    this.hotspotResult = null;
    this.showRebootConfirmModal = false;
    this.sitesService.fixHotspot(this.siteId, autoFix).subscribe({
      next: (result) => {
        this.fixingHotspot = false;
        if (result) {
          this.hotspotResult = result as HotspotResult;
          if (autoFix && result.fix?.channelChanged && result.fix?.needsReboot) {
            this.showRebootConfirmModal = true;
            this.notificationService.info(this.translate.instant('debug.notifyHotspotChanged'));
          } else if (result.success) {
            this.notificationService.success(this.translate.instant(autoFix ? 'debug.notifyHotspotFixed' : 'debug.notifyHotspotDiagDone'));
          } else {
            this.notificationService.warning(this.translate.instant('debug.notifyHotspotIssues'));
          }
        }
      },
      error: (error) => {
        this.fixingHotspot = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to fix hotspot', { error: message, siteId: this.siteId });
      }
    });
  }

  cancelReboot(): void {
    this.showRebootConfirmModal = false;
    this.notificationService.info(this.translate.instant('debug.notifyRebootPending'));
  }

  confirmReboot(): void {
    if (!this.isConnected) { this.notificationService.warning(this.translate.instant('debug.notifyDeviceOffline')); return; }
    this.rebooting = true;
    this.sitesService.sendCommand(this.siteId, 'reboot', {}).subscribe({
      next: () => {
        this.rebooting = false;
        this.showRebootConfirmModal = false;
        this.notificationService.success(this.translate.instant('debug.notifyRebootStarted'));
        this.logger.info('Reboot command sent after hotspot fix', { siteId: this.siteId });
      },
      error: (error) => {
        this.rebooting = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyRebootError')}: ${message}`);
        this.logger.error('Failed to reboot after hotspot fix', { error: message, siteId: this.siteId });
      }
    });
  }

  toggleWifiBssid(): void {
    this.showWifiBssid = !this.showWifiBssid;
    if (this.showWifiBssid && !this.wifiBssidStatus && this.isConnected) { this.loadWifiBssidStatus(); }
  }

  loadWifiBssidStatus(): void {
    if (!this.siteId || !this.isConnected) return;
    this.loadingWifiBssid = true;
    this.sitesService.getWifiBssidStatus(this.siteId).subscribe({
      next: (response) => { this.loadingWifiBssid = false; this.wifiBssidStatus = response; },
      error: (error) => {
        this.loadingWifiBssid = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to load WiFi BSSID status', { error: message, siteId: this.siteId });
      }
    });
  }

  removeBssidLock(): void {
    if (!this.siteId || !this.isConnected) return;
    this.removingBssidLock = true;
    this.sitesService.removeBssidLock(this.siteId).subscribe({
      next: (response) => {
        this.removingBssidLock = false;
        if (response.success) { this.notificationService.success(this.translate.instant('debug.notifyBssidRemoved')); this.loadWifiBssidStatus(); }
        else { this.notificationService.warning(response.message || 'Aucune modification n\u00e9cessaire'); }
      },
      error: (error) => {
        this.removingBssidLock = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to remove BSSID lock', { error: message, siteId: this.siteId });
      }
    });
  }

  optimizeForMesh(): void {
    if (!this.siteId || !this.isConnected) return;
    this.optimizingMesh = true;
    this.sitesService.optimizeForMesh(this.siteId).subscribe({
      next: (response) => {
        this.optimizingMesh = false;
        if (response.success) { this.notificationService.success(this.translate.instant('debug.notifyMeshOptimized')); this.loadWifiBssidStatus(); }
        else { this.notificationService.warning(response.message || 'Aucune modification n\u00e9cessaire'); }
      },
      error: (error) => {
        this.optimizingMesh = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyError')}: ${message}`);
        this.logger.error('Failed to optimize for mesh', { error: message, siteId: this.siteId });
      }
    });
  }

  scanWifiNetworks(): void {
    if (!this.siteId || !this.isConnected) return;
    this.scanningWifi = true;
    this.selectedWifiNetwork = null;
    this.wifiPassword = '';
    this.wifiConnectResult = null;
    this.sitesService.scanWifiNetworks(this.siteId).subscribe({
      next: (response) => {
        this.scanningWifi = false;
        this.wifiScanResult = response;
        if (!response.success && response.error) { this.notificationService.warning(response.error); }
      },
      error: (error) => {
        this.scanningWifi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyWifiScanError')}: ${message}`);
        this.logger.error('Failed to scan WiFi networks', { error: message, siteId: this.siteId });
      }
    });
  }

  selectWifiNetwork(network: WifiNetwork): void {
    if (this.selectedWifiNetwork?.ssid === network.ssid && this.selectedWifiNetwork?.bssid === network.bssid) {
      this.selectedWifiNetwork = null; this.wifiPassword = '';
    } else {
      this.selectedWifiNetwork = network; this.wifiPassword = ''; this.wifiConnectResult = null;
    }
  }

  connectWifiClient(): void {
    if (!this.siteId || !this.isConnected || !this.selectedWifiNetwork) return;
    if (this.selectedWifiNetwork.security !== 'Open' && (!this.wifiPassword || this.wifiPassword.length < 8)) {
      this.notificationService.warning(this.translate.instant('debug.notifyWifiPasswordMin'));
      return;
    }
    this.connectingWifi = true;
    this.wifiConnectResult = null;
    this.sitesService.connectWifiClient(this.siteId, this.selectedWifiNetwork.ssid, this.wifiPassword).subscribe({
      next: (response) => {
        this.connectingWifi = false;
        this.wifiConnectResult = { connected: response.connected, ipAddress: response.ipAddress, message: response.message };
        if (response.connected) { this.notificationService.success(response.message); this.wifiPassword = ''; this.loadWifiBssidStatus(); }
        else { this.notificationService.warning(response.message); }
      },
      error: (error) => {
        this.connectingWifi = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`${this.translate.instant('debug.notifyWifiConnectError')}: ${message}`);
        this.logger.error('Failed to connect WiFi client', { error: message, siteId: this.siteId });
      }
    });
  }

  getWifiSignalClass(signal: number | null): string {
    if (!signal) return '';
    if (signal > -60) return 'signal-good';
    if (signal > -75) return 'signal-medium';
    return 'signal-weak';
  }
}
