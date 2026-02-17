import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { AssetService, WatermarkConfig, OverlayPosition as WmOverlayPosition, WatermarkAnimation, WatermarkScheduleRule } from '../../../../core/services/asset.service';
import { ReportsService, GeneratedReport } from '../../../../core/services/reports.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { Site, OverlayTheme, ScoreOverlayPosition } from '../../../../core/models';
import { QrCodeGeneratorComponent } from '../../../../shared/components/qr-code-generator/qr-code-generator.component';

@Component({
  selector: 'app-site-settings-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, QrCodeGeneratorComponent],
  template: `
    <div class="settings-tab">
      <!-- Authentification Club -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">🔐</span>
          <h4>Authentification Club</h4>
        </div>
        <div class="settings-grid">
          <div class="form-group">
            <label>Nom du club</label>
            <input type="text" [(ngModel)]="clubName" placeholder="Mon Club" class="form-input"/>
          </div>
          <div class="form-group">
            <label>Mot de passe télécommande</label>
            <input type="text" [(ngModel)]="remotePassword" placeholder="Mot de passe" class="form-input"/>
          </div>
        </div>
        <button
          class="btn btn-primary"
          (click)="saveClubAuth()"
          [disabled]="savingClubAuth || (!clubName && !remotePassword)"
        >
          {{ savingClubAuth ? ('common.deploying' | translate) : (isConnected ? ('common.deploy' | translate) : ('common.deployQueued' | translate)) }}
        </button>
      </div>

      <!-- Spectateurs moyens -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">👥</span>
          <h4>Audience</h4>
        </div>
        <p class="settings-desc">
          Nombre moyen de spectateurs par match. Utilisé pour calculer le reach des sponsors dans les rapports PDF.
        </p>
        <div class="settings-grid">
          <div class="form-group">
            <label>Spectateurs moyens par match</label>
            <input
              type="number"
              [(ngModel)]="avgSpectators"
              placeholder="Ex: 200"
              min="0"
              max="100000"
              class="form-input"
            />
            <small class="form-hint">Estimation moyenne. Sera mentionnée dans les rapports sponsors.</small>
          </div>
        </div>
        <button
          class="btn btn-primary"
          (click)="saveAvgSpectators()"
          [disabled]="savingAvgSpectators || avgSpectators === null || avgSpectators === undefined"
        >
          {{ savingAvgSpectators ? ('common.saving' | translate) : ('common.save' | translate) }}
        </button>
      </div>

      <!-- Branding Club (P5) -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">🎨</span>
          <h4>Branding Club</h4>
        </div>
        <p class="settings-desc">
          Logo et couleurs du club. Utilisés pour personnaliser les rapports PDF sponsors.
        </p>
        <div class="settings-grid">
          <div class="form-group">
            <label>URL du logo</label>
            <input
              type="url"
              [(ngModel)]="logoUrl"
              placeholder="https://example.com/logo.png"
              class="form-input"
            />
            <small class="form-hint">Image PNG, JPEG ou SVG. S'affiche dans l'en-tête du rapport PDF.</small>
            <div *ngIf="logoUrl" class="logo-preview" style="margin-top: 8px;">
              <img [src]="logoUrl" alt="Logo preview" style="max-height: 48px; max-width: 200px; border-radius: 4px; background: #f3f4f6; padding: 4px;" (error)="logoUrl && onLogoError()"/>
            </div>
          </div>
          <div class="form-group">
            <label>Couleur primaire</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input
                type="color"
                [(ngModel)]="colorPrimary"
                style="width: 40px; height: 32px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; padding: 2px;"
              />
              <input
                type="text"
                [(ngModel)]="colorPrimary"
                placeholder="#1e3a8a"
                maxlength="7"
                class="form-input"
                style="width: 120px;"
              />
            </div>
          </div>
          <div class="form-group">
            <label>Couleur secondaire</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input
                type="color"
                [(ngModel)]="colorSecondary"
                style="width: 40px; height: 32px; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; padding: 2px;"
              />
              <input
                type="text"
                [(ngModel)]="colorSecondary"
                placeholder="#3b82f6"
                maxlength="7"
                class="form-input"
                style="width: 120px;"
              />
            </div>
          </div>
        </div>
        <div *ngIf="colorPrimary || colorSecondary" class="branding-preview" style="margin: 12px 0; padding: 12px; border-radius: 8px; background: linear-gradient(135deg, {{colorPrimary || '#1e3a8a'}} 0%, {{colorSecondary || '#3b82f6'}} 100%); color: white; font-size: 0.85rem; text-align: center;">
          Aperçu bandeau rapport
        </div>
        <button
          class="btn btn-primary"
          (click)="saveBranding()"
          [disabled]="brandingSaving"
        >
          {{ brandingSaving ? ('common.saving' | translate) : ('siteSettings.saveBranding' | translate) }}
        </button>
      </div>

      <!-- PIN Télécommande Cloud -->
      <div class="settings-card">
        <div class="settings-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" style="vertical-align: text-bottom; margin-right: 6px;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h4>{{ 'remotePin.title' | translate }}</h4>
        </div>
        <p class="settings-desc">
          {{ 'remotePin.description' | translate }}
        </p>

        <ng-container *ngIf="remotePinEnabled; else noPinActive">
          <div class="pin-status-badge active">
            <span class="pin-badge-icon">&#128274;</span>
            <span>{{ 'remotePin.pinActive' | translate }}</span>
          </div>
          <button
            class="btn btn-danger btn-sm"
            (click)="clearRemotePin()"
            [disabled]="clearingRemotePin"
          >
            {{ clearingRemotePin ? ('remotePin.clearingPin' | translate) : ('remotePin.clearPin' | translate) }}
          </button>
        </ng-container>
        <ng-template #noPinActive>
          <div class="pin-status-badge inactive">
            <span class="pin-badge-icon">&#128275;</span>
            <span>{{ 'remotePin.pinInactive' | translate }}</span>
          </div>
          <div class="form-group">
            <label>{{ 'remotePin.newPinLabel' | translate }}</label>
            <input
              type="text"
              [(ngModel)]="remotePin"
              placeholder="1234"
              maxlength="6"
              pattern="[0-9]*"
              inputmode="numeric"
              class="form-input pin-input"
            />
          </div>
          <button
            class="btn btn-primary btn-sm"
            (click)="saveRemotePin()"
            [disabled]="savingRemotePin || !remotePin || remotePin.length < 4"
          >
            {{ savingRemotePin ? ('remotePin.settingPin' | translate) : ('remotePin.setPin' | translate) }}
          </button>
        </ng-template>
      </div>

      <!-- QR Code Telecommande -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">📱</span>
          <h4>QR Code Telecommande</h4>
        </div>
        <p class="settings-desc">
          Generez un QR code a imprimer et afficher pres de la TV. Les utilisateurs pourront scanner pour acceder directement a la telecommande.
        </p>
        <div class="qr-modes-info">
          <div class="qr-mode-card">
            <div class="mode-header">
              <span class="mode-icon">📶</span>
              <span class="mode-title">Mode Local (Hotspot)</span>
            </div>
            <p class="mode-desc">Necessite d'etre connecte au WiFi du boitier</p>
            <div class="qr-detail">
              <span class="qr-label">WiFi :</span>
              <code>{{ getWifiSsid() }}</code>
              <span class="ssid-source" *ngIf="realSsid">(reel)</span>
              <span class="ssid-source ssid-generated" *ngIf="!realSsid">(genere)</span>
            </div>
          </div>
          <div class="qr-mode-card cloud-mode">
            <div class="mode-header">
              <span class="mode-icon">☁️</span>
              <span class="mode-title">Mode Cloud</span>
              <span class="mode-badge">Nouveau</span>
            </div>
            <p class="mode-desc">Fonctionne depuis n'importe quel reseau avec Internet. Ideal pour les reseaux avec isolation client (mesh WiFi).</p>
            <a class="cloud-remote-link" [href]="'/remote/' + siteId" target="_blank" rel="noopener">
              ↗️ Ouvrir la telecommande cloud
            </a>
          </div>
        </div>
        <button class="btn btn-primary" (click)="openQrCode()" [disabled]="fetchingSsid">
          {{ fetchingSsid ? 'Chargement...' : 'Generer le QR Code' }}
        </button>
      </div>

      <!-- Configuration Hotspot WiFi -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">📶</span>
          <h4>Hotspot WiFi</h4>
          <button
            class="btn-icon-sm refresh-btn"
            (click)="fetchHotspotConfig()"
            [disabled]="fetchingHotspotConfig || !isConnected"
            title="Actualiser depuis le boîtier"
          >
            {{ fetchingHotspotConfig ? '⏳' : '🔄' }}
          </button>
        </div>
        <p class="settings-desc">Configuration du réseau WiFi du boîtier</p>

        <!-- Affichage des valeurs actuelles -->
        <div class="current-hotspot-info" *ngIf="currentHotspotSsid">
          <div class="info-row">
            <span class="info-label">SSID actuel :</span>
            <code class="info-value">{{ currentHotspotSsid }}</code>
            <span class="info-badge" [class.online]="currentHotspotActive" [class.offline]="!currentHotspotActive">
              {{ currentHotspotActive ? ('✓ ' + ('status.active' | translate)) : ('○ ' + ('status.inactive' | translate)) }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Mot de passe :</span>
            <ng-container *ngIf="currentHotspotPassword; else noPassword">
              <code class="info-value password-value">{{ showCurrentPassword ? currentHotspotPassword : '••••••••' }}</code>
              <button class="btn-icon" (click)="toggleShowPassword()" type="button" [title]="showCurrentPassword ? 'Masquer' : 'Afficher'">
                {{ showCurrentPassword ? '🙈' : '👁️' }}
              </button>
            </ng-container>
            <ng-template #noPassword>
              <span class="info-value info-muted">Cliquez 🔄 pour charger</span>
            </ng-template>
          </div>
          <div class="info-row" *ngIf="currentHotspotChannel">
            <span class="info-label">Canal :</span>
            <span class="info-value">{{ currentHotspotChannel }}</span>
          </div>
          <div class="info-row" *ngIf="currentHotspotClients !== null">
            <span class="info-label">Clients connectés :</span>
            <span class="info-value">{{ currentHotspotClients }}</span>
          </div>
        </div>
        <div class="no-hotspot-info" *ngIf="!currentHotspotSsid && isConnected && !fetchingHotspotConfig">
          <button class="btn btn-secondary btn-sm" (click)="fetchHotspotConfig()" [disabled]="fetchingHotspotConfig">
            🔄 Charger les informations
          </button>
        </div>
        <div class="no-hotspot-info" *ngIf="!currentHotspotSsid && fetchingHotspotConfig">
          <span class="loading-hint">⏳ Chargement des informations hotspot...</span>
        </div>
        <div class="no-hotspot-info" *ngIf="!currentHotspotSsid && !isConnected">
          <span class="offline-hint">Site hors ligne - informations hotspot non disponibles</span>
        </div>

        <hr class="settings-divider" *ngIf="currentHotspotSsid" />
        <h5 class="subsection-title" *ngIf="currentHotspotSsid">Modifier la configuration</h5>

        <div class="settings-grid">
          <div class="form-group">
            <label>SSID (nom du réseau)</label>
            <input type="text" [(ngModel)]="hotspotSsid" [placeholder]="currentHotspotSsid || 'NEOPRO-MonClub'" maxlength="32" class="form-input"/>
            <small class="form-hint">Max 32 caractères. Laissez vide pour conserver l'actuel.</small>
          </div>
          <div class="form-group">
            <label>Mot de passe WiFi</label>
            <input type="password" [(ngModel)]="hotspotPassword" placeholder="••••••••" minlength="8" maxlength="63" class="form-input"/>
            <small class="form-hint">8-63 caractères (WPA2). Laissez vide pour conserver l'actuel.</small>
          </div>
        </div>
        <button
          class="btn btn-primary"
          (click)="updateHotspot()"
          [disabled]="updatingHotspot || (!hotspotSsid && !hotspotPassword)"
        >
          {{ updatingHotspot ? ('common.updating' | translate) : (isConnected ? ('common.apply' | translate) : ('common.applyQueued' | translate)) }}
        </button>
        <p class="warning-text" *ngIf="hotspotSsid || hotspotPassword">
          ⚠️ Après modification, vous devrez vous reconnecter au nouveau réseau WiFi.
        </p>
      </div>

      <!-- Options Premium -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">⭐</span>
          <h4>Options Premium</h4>
        </div>
        <div class="premium-toggle">
          <label class="toggle-container">
            <input
              type="checkbox"
              [checked]="site?.live_score_enabled"
              (change)="toggleLiveScore($event)"
              [disabled]="savingLiveScore"
            />
            <span class="toggle-slider"></span>
            <span class="toggle-label">Option Premium activée</span>
          </label>
          <p class="premium-desc">
            Active le score en live, le chronomètre, les options d'overlay et les annonces sur la télécommande.
          </p>
        </div>

        <!-- Score Overlay Config -->
        <div class="overlay-config" *ngIf="site?.live_score_enabled">
          <button class="btn btn-secondary btn-sm" (click)="showOverlayConfig = !showOverlayConfig">
            {{ showOverlayConfig ? 'Fermer' : 'Personnaliser l'overlay' }}
          </button>

          <div class="overlay-form" *ngIf="showOverlayConfig">
            <h5>Thème</h5>
            <div class="overlay-grid">
              <button class="theme-card" [class.active]="overlayConfig.theme === 'broadcast'" (click)="overlayConfig.theme = 'broadcast'">
                <div class="theme-preview broadcast">
                  <span class="tp-team">DOM</span>
                  <span class="tp-score">2 - 1</span>
                  <span class="tp-team">EXT</span>
                </div>
                <span class="theme-label">Broadcast</span>
              </button>
              <button class="theme-card" [class.active]="overlayConfig.theme === 'minimal'" (click)="overlayConfig.theme = 'minimal'">
                <div class="theme-preview minimal">
                  <span class="tp-score">2 - 1</span>
                </div>
                <span class="theme-label">Minimal</span>
              </button>
            </div>

            <h5>Position</h5>
            <div class="overlay-grid">
              <div class="form-group">
                <select [(ngModel)]="overlayConfig.position" class="form-input">
                  <option value="top-left">Haut gauche</option>
                  <option value="top-center">Haut centre</option>
                  <option value="top-right">Haut droite</option>
                  <option value="bottom-left">Bas gauche</option>
                  <option value="bottom-center">Bas centre</option>
                  <option value="bottom-right">Bas droite</option>
                </select>
              </div>
            </div>

            <!-- Preview -->
            <div class="overlay-preview">
              <div class="preview-label">Aperçu</div>
              <div class="preview-container" [style.justify-content]="getJustify()" [style.align-items]="getAlign()">
                <div class="preview-overlay" *ngIf="overlayConfig.theme === 'broadcast'">
                  <span class="preview-team">DOM</span>
                  <span class="preview-score">2 - 1</span>
                  <span class="preview-team">EXT</span>
                </div>
                <div class="preview-overlay minimal" *ngIf="overlayConfig.theme === 'minimal'">
                  <span class="preview-score">2 - 1</span>
                </div>
              </div>
            </div>

            <div class="overlay-actions">
              <button class="btn btn-primary" (click)="saveOverlayConfig()" [disabled]="savingOverlay">
                {{ savingOverlay ? ('common.deploying' | translate) : ('common.deploy' | translate) }}
              </button>
              <button class="btn btn-secondary" (click)="showOverlayConfig = false">{{ 'common.cancel' | translate }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Watermark / Logo en surimpression -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">🖼️</span>
          <h4>Logo en surimpression (Watermark)</h4>
        </div>
        <p class="settings-desc">
          Ajoutez un logo ou une image qui s'affichera en permanence sur la TV (ex: logo du club, sponsor principal).
        </p>

        <!-- Upload zone -->
        <div class="watermark-upload" *ngIf="!watermarkConfig.imagePath">
          <label class="upload-zone" [class.dragging]="isDraggingWatermark">
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              (change)="onWatermarkFileSelected($event)"
              hidden
            />
            <span class="upload-icon">📤</span>
            <span class="upload-text">Cliquez ou glissez une image ici</span>
            <span class="upload-hint">PNG, JPEG, GIF, WebP ou SVG (max 5 MB)</span>
          </label>
        </div>

        <!-- Current watermark preview -->
        <div class="watermark-current" *ngIf="watermarkConfig.imagePath">
          <div class="watermark-preview-box">
            <img [src]="getWatermarkPreviewUrl()" alt="Watermark" class="watermark-img" (error)="onWatermarkImageError($event)"/>
          </div>
          <div class="watermark-info">
            <span class="watermark-path">{{ getWatermarkFilename() }}</span>
            <div class="watermark-actions">
              <label class="btn btn-secondary btn-sm">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  (change)="onWatermarkFileSelected($event)"
                  hidden
                />
                Changer l'image
              </label>
              <button class="btn btn-danger btn-sm" (click)="removeWatermark()">
                Supprimer
              </button>
            </div>
          </div>
        </div>

        <!-- Watermark config form -->
        <div class="watermark-config" *ngIf="watermarkConfig.imagePath">
          <div class="config-row">
            <label class="toggle-container">
              <input type="checkbox" [(ngModel)]="watermarkConfig.enabled"/>
              <span class="toggle-slider"></span>
              <span class="toggle-label">Activer le watermark</span>
            </label>
          </div>

          <div class="config-row" *ngIf="watermarkConfig.enabled">
            <label class="toggle-container">
              <input type="checkbox" [(ngModel)]="watermarkConfig.fullscreen"/>
              <span class="toggle-slider"></span>
              <span class="toggle-label">Plein ecran (couvre toute la TV)</span>
            </label>
          </div>

          <div class="settings-grid" *ngIf="watermarkConfig.enabled">
            <!-- Options de position (masquees en mode fullscreen) -->
            <div class="form-group" *ngIf="!watermarkConfig.fullscreen">
              <label>Position</label>
              <select [(ngModel)]="watermarkConfig.position" class="form-input">
                <option *ngFor="let pos of positionOptions" [value]="pos.value">{{ pos.label }}</option>
              </select>
            </div>
            <div class="form-group" *ngIf="!watermarkConfig.fullscreen">
              <label>Decalage X (px)</label>
              <input type="number" [(ngModel)]="watermarkConfig.offsetX" min="0" max="500" class="form-input"/>
            </div>
            <div class="form-group" *ngIf="!watermarkConfig.fullscreen">
              <label>Decalage Y (px)</label>
              <input type="number" [(ngModel)]="watermarkConfig.offsetY" min="0" max="500" class="form-input"/>
            </div>
            <div class="form-group" *ngIf="!watermarkConfig.fullscreen">
              <label>Largeur (px)</label>
              <input type="number" [(ngModel)]="watermarkConfig.width" min="20" max="800" class="form-input"/>
            </div>
            <!-- Opacite toujours visible -->
            <div class="form-group">
              <label>Opacite (%)</label>
              <input type="range" [(ngModel)]="watermarkConfig.opacity" min="10" max="100" class="form-range"/>
              <span class="range-value">{{ watermarkConfig.opacity }}%</span>
            </div>
            <div class="form-group" *ngIf="!watermarkConfig.fullscreen">
              <label>Arrondi (px)</label>
              <input type="number" [(ngModel)]="watermarkConfig.borderRadius" min="0" max="50" class="form-input"/>
            </div>
            <!-- Animation toujours visible -->
            <div class="form-group">
              <label>Animation</label>
              <select [(ngModel)]="watermarkConfig.animation" class="form-input">
                <option *ngFor="let anim of animationOptions" [value]="anim.value">{{ anim.label }}</option>
              </select>
            </div>
          </div>

          <!-- Scheduling -->
          <div class="watermark-scheduling" *ngIf="watermarkConfig.enabled">
            <div class="scheduling-header">
              <label class="toggle-container">
                <input type="checkbox" [(ngModel)]="watermarkConfig.schedule!.enabled"/>
                <span class="toggle-slider"></span>
                <span class="toggle-label">Programmation horaire</span>
              </label>
            </div>

            <div class="scheduling-rules" *ngIf="watermarkConfig.schedule?.enabled">
              <div class="rule-item" *ngFor="let rule of watermarkConfig.schedule!.rules; let i = index">
                <div class="rule-row">
                  <div class="form-group">
                    <label>Debut</label>
                    <input type="time" [(ngModel)]="rule.startTime" class="form-input"/>
                  </div>
                  <div class="form-group">
                    <label>Fin</label>
                    <input type="time" [(ngModel)]="rule.endTime" class="form-input"/>
                  </div>
                  <button class="btn btn-danger btn-sm btn-icon" (click)="removeScheduleRule(i)">✕</button>
                </div>
                <div class="rule-days">
                  <label *ngFor="let day of daysOfWeekOptions" class="day-checkbox">
                    <input
                      type="checkbox"
                      [checked]="rule.daysOfWeek.includes(day.value)"
                      (change)="toggleRuleDay(rule, day.value)"
                    />
                    <span>{{ day.shortLabel }}</span>
                  </label>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" (click)="addScheduleRule()">
                + Ajouter une plage horaire
              </button>
            </div>
          </div>

          <div class="watermark-save">
            <button
              class="btn btn-primary"
              (click)="saveWatermarkConfig()"
              [disabled]="savingWatermark"
            >
              {{ savingWatermark ? 'Deploiement...' : (isConnected ? 'Deployer le watermark' : 'Deployer (en file)') }}
            </button>
          </div>
        </div>

        <!-- Upload progress -->
        <div class="upload-progress" *ngIf="uploadingWatermark">
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="uploadProgress"></div>
          </div>
          <span class="progress-text">{{ uploadProgressText }}</span>
        </div>
      </div>

      <!-- Rapports PDF -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">📊</span>
          <h4>Rapports mensuels</h4>
        </div>
        <p class="settings-desc">
          Téléchargez les rapports d'activité générés automatiquement chaque mois.
        </p>

        <div class="reports-list" *ngIf="clubReports.length > 0">
          <div class="report-item" *ngFor="let report of clubReports">
            <div class="report-info">
              <span class="report-period">{{ report.period_label }}</span>
              <span class="report-meta">{{ formatReportDate(report.completed_at) }} • {{ formatFileSize(report.file_size_bytes) }}</span>
            </div>
            <a [href]="report.storage_url" target="_blank" class="btn btn-sm btn-secondary" *ngIf="report.storage_url">
              📥 Télécharger
            </a>
          </div>
        </div>

        <div class="reports-empty" *ngIf="clubReports.length === 0 && !loadingReports">
          <span class="empty-icon">📋</span>
          <p>Aucun rapport disponible pour l'instant.</p>
          <p class="empty-hint">Les rapports sont générés automatiquement le 1er de chaque mois.</p>
        </div>

        <div class="reports-loading" *ngIf="loadingReports">
          <span class="loading-spinner"></span>
          Chargement des rapports...
        </div>

        <div class="reports-actions" *ngIf="!loadingReports">
          <button class="btn btn-secondary btn-sm" (click)="loadClubReports()" [disabled]="loadingReports">
            🔄 Actualiser
          </button>
          <button class="btn btn-primary btn-sm" (click)="generateReport()" [disabled]="generatingReport">
            {{ generatingReport ? 'Génération...' : '➕ Générer un rapport' }}
          </button>
        </div>
      </div>

    </div>

    <!-- QR Code Modal -->
    <app-qr-code-generator
      *ngIf="showQrCode"
      [clubName]="site?.club_name || site?.site_name || 'Club'"
      [wifiSsid]="getWifiSsid()"
      [siteId]="site?.id || ''"
      [visible]="showQrCode"
      [defaultMode]="getQrCodeDefaultMode()"
      (visibleChange)="showQrCode = $event"
    ></app-qr-code-generator>
  `,
  styles: [`
    .settings-tab {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .settings-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .settings-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .settings-header h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .settings-icon {
      font-size: 1.25rem;
    }

    .settings-header .btn-icon-sm {
      margin-left: auto;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      opacity: 0.7;
      transition: all 0.2s;
    }

    .settings-header .btn-icon-sm:hover:not(:disabled) {
      opacity: 1;
      background: #f1f5f9;
    }

    .settings-header .btn-icon-sm:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .settings-desc {
      margin: 0 0 1rem 0;
      font-size: 0.875rem;
      color: #64748b;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .form-group label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
    }

    .form-input {
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .form-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-hint {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .warning-text {
      margin: 1rem 0 0 0;
      font-size: 0.8125rem;
      color: #f59e0b;
      background: #fef3c7;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
    }

    /* Current hotspot info display */
    .current-hotspot-info {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .current-hotspot-info .info-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .current-hotspot-info .info-row:last-child {
      margin-bottom: 0;
    }

    .current-hotspot-info .info-label {
      font-size: 0.8125rem;
      color: #64748b;
      min-width: 120px;
    }

    .current-hotspot-info .info-value {
      font-size: 0.875rem;
      color: #1e293b;
      font-weight: 500;
    }

    .current-hotspot-info code.info-value {
      background: #e2e8f0;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-family: monospace;
    }

    .current-hotspot-info .info-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
    }

    .current-hotspot-info .info-badge.online {
      background: #dcfce7;
      color: #16a34a;
    }

    .current-hotspot-info .info-badge.offline {
      background: #fee2e2;
      color: #dc2626;
    }

    .current-hotspot-info .password-value {
      font-family: monospace;
      letter-spacing: 1px;
    }

    .current-hotspot-info .info-muted {
      color: #94a3b8;
      font-style: italic;
      font-size: 0.8125rem;
    }

    .current-hotspot-info .btn-icon {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      padding: 0.25rem;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .current-hotspot-info .btn-icon:hover {
      opacity: 1;
    }

    .no-hotspot-info {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .no-hotspot-info .loading-hint {
      color: #64748b;
      font-size: 0.875rem;
    }

    .no-hotspot-info .offline-hint {
      color: #94a3b8;
      font-size: 0.875rem;
      font-style: italic;
    }

    .settings-divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 1rem 0;
    }

    .subsection-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #475569;
      margin: 0 0 1rem 0;
    }

    /* Premium toggle */
    .premium-toggle {
      margin-bottom: 1rem;
    }

    .toggle-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
    }

    .toggle-container input {
      display: none;
    }

    .toggle-slider {
      width: 48px;
      height: 24px;
      background: #e2e8f0;
      border-radius: 12px;
      position: relative;
      transition: all 0.2s;
    }

    .toggle-slider::after {
      content: '';
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 2px;
      left: 2px;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .toggle-container input:checked + .toggle-slider {
      background: #2563eb;
    }

    .toggle-container input:checked + .toggle-slider::after {
      left: 26px;
    }

    .toggle-label {
      font-weight: 500;
    }

    .premium-desc {
      margin: 0.5rem 0 0 0;
      font-size: 0.8125rem;
      color: #64748b;
      padding-left: 60px;
    }

    /* Overlay config */
    .overlay-config {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .overlay-form {
      margin-top: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .overlay-form h5 {
      margin: 0 0 1rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .overlay-grid {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .theme-card {
      flex: 1;
      padding: 0.75rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      text-align: center;
      transition: border-color 0.2s;
    }

    .theme-card.active {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .theme-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      padding: 0.5rem;
      background: rgba(0, 0, 0, 0.85);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }

    .tp-team {
      font-size: 0.625rem;
      color: #fff;
      font-weight: 500;
    }

    .tp-score {
      font-size: 0.75rem;
      color: #4caf50;
      font-weight: 700;
    }

    .theme-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #334155;
    }

    .theme-preview.minimal {
      background: rgba(0, 0, 0, 0.55);
      padding: 0.25rem 0.5rem;
    }

    .theme-preview.minimal .tp-score {
      color: #fff;
    }

    /* Preview */
    .overlay-preview {
      margin: 1rem 0;
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
    }

    .preview-label {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 0.5rem;
    }

    .preview-container {
      display: flex;
      min-height: 80px;
      padding: 0.5rem;
    }

    .preview-overlay {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(15, 15, 20, 0.92);
      border-radius: 6px;
    }

    .preview-overlay.minimal {
      background: rgba(0, 0, 0, 0.55);
      padding: 0.35rem 0.75rem;
      border-radius: 4px;
    }

    .preview-team {
      font-weight: 500;
    }

    .preview-score {
      font-weight: 700;
    }

    .overlay-actions {
      display: flex;
      gap: 0.5rem;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    /* QR Code card */
    .qr-preview-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .qr-info {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .qr-detail {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .qr-label {
      color: #64748b;
      font-weight: 500;
    }

    .qr-detail code {
      background: #f1f5f9;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.8125rem;
      color: #1e293b;
    }

    .ssid-source {
      font-size: 0.6875rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      background: #dcfce7;
      color: #166534;
      font-weight: 500;
    }

    .ssid-source.ssid-generated {
      background: #fef3c7;
      color: #92400e;
    }

    /* QR modes info */
    .qr-modes-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .qr-mode-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
    }

    .qr-mode-card.cloud-mode {
      background: linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%);
      border-color: #c7d2fe;
    }

    .mode-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .mode-icon {
      font-size: 1.125rem;
    }

    .mode-title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: #1e293b;
    }

    .mode-badge {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .mode-desc {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 0.75rem 0;
      line-height: 1.4;
    }

    .cloud-remote-link {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #6366f1;
      text-decoration: none;
      transition: color 0.15s;
    }

    .cloud-remote-link:hover {
      color: #4f46e5;
      text-decoration: underline;
    }

    .qr-mode-card .qr-detail {
      margin-top: 0.5rem;
    }

    /* Watermark styles */
    .watermark-upload {
      margin-bottom: 1rem;
    }

    .upload-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      border: 2px dashed #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .upload-zone:hover,
    .upload-zone.dragging {
      border-color: #2563eb;
      background: #f0f9ff;
    }

    .upload-icon {
      font-size: 2rem;
    }

    .upload-text {
      font-weight: 500;
      color: #475569;
    }

    .upload-hint {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .watermark-current {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 1rem;
    }

    .watermark-preview-box {
      width: 80px;
      height: 80px;
      background: #1e293b;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .watermark-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .watermark-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .watermark-path {
      font-size: 0.875rem;
      color: #475569;
      font-family: monospace;
    }

    .watermark-actions {
      display: flex;
      gap: 0.5rem;
    }

    .watermark-config {
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .config-row {
      margin-bottom: 1rem;
    }

    .form-range {
      width: 100%;
      cursor: pointer;
    }

    .range-value {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 500;
    }

    .watermark-scheduling {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .scheduling-header {
      margin-bottom: 1rem;
    }

    .scheduling-rules {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .rule-item {
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .rule-row {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .rule-row .form-group {
      flex: 1;
    }

    .rule-days {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .day-checkbox {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
    }

    .day-checkbox input:checked + span {
      color: #2563eb;
      font-weight: 600;
    }

    .watermark-save {
      margin-top: 1.5rem;
    }

    .upload-progress {
      margin-top: 1rem;
    }

    .progress-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #2563eb;
      transition: width 0.3s;
    }

    .progress-text {
      display: block;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #64748b;
      text-align: center;
    }

    .btn-danger {
      background: #fef2f2;
      color: #dc2626;
    }

    .btn-danger:hover {
      background: #fee2e2;
    }

    .btn-icon {
      padding: 0.25rem 0.5rem;
      line-height: 1;
    }

    /* PIN status badge */
    .pin-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 1rem;
    }

    .pin-status-badge.active {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    .pin-status-badge.inactive {
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #e2e8f0;
    }

    .pin-badge-icon {
      font-size: 1rem;
    }

    .pin-input {
      max-width: 150px;
      font-family: monospace;
      font-size: 1.25rem;
      letter-spacing: 4px;
      text-align: center;
    }

    /* Rapports PDF */
    .reports-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .report-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .report-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .report-period {
      font-weight: 500;
      color: #1e293b;
    }

    .report-meta {
      font-size: 0.75rem;
      color: #64748b;
    }

    .reports-empty {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .reports-empty .empty-icon {
      font-size: 2rem;
      display: block;
      margin-bottom: 0.5rem;
    }

    .reports-empty .empty-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.25rem;
    }

    .reports-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: #64748b;
    }

    .loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .reports-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
    }
  `]
})
export class SiteSettingsTabComponent implements OnInit, OnChanges {
  @Input() siteId!: string;
  @Input() site!: Site | null;
  @Input() isConnected: boolean = false;
  @Output() siteUpdated = new EventEmitter<Site>();

  // Auth
  clubName: string = '';
  remotePassword: string = '';
  savingClubAuth: boolean = false;

  // Audience
  avgSpectators: number | null = null;
  savingAvgSpectators: boolean = false;

  // Branding (P5)
  logoUrl: string = '';
  colorPrimary: string = '';
  colorSecondary: string = '';
  brandingSaving: boolean = false;
  logoError: boolean = false;

  // Remote PIN
  remotePin: string = '';
  remotePinEnabled: boolean = false;
  savingRemotePin: boolean = false;
  clearingRemotePin: boolean = false;

  // Hotspot
  hotspotSsid: string = '';
  hotspotPassword: string = '';
  updatingHotspot: boolean = false;
  // Current hotspot info from Pi (read-only display)
  currentHotspotSsid: string | null = null;
  currentHotspotPassword: string | null = null;
  currentHotspotChannel: number | null = null;
  currentHotspotClients: number | null = null;
  currentHotspotActive: boolean = false;
  showCurrentPassword: boolean = false;
  fetchingHotspotConfig: boolean = false;

  // Premium
  savingLiveScore: boolean = false;
  showOverlayConfig: boolean = false;
  savingOverlay: boolean = false;
  overlayConfig: { theme: OverlayTheme; position: ScoreOverlayPosition } = {
    theme: 'broadcast',
    position: 'top-right',
  };


  // QR Code
  showQrCode: boolean = false;
  fetchingSsid: boolean = false;
  realSsid: string | null = null;

  // Watermark
  watermarkConfig: WatermarkConfig = {
    enabled: false,
    imagePath: '',
    fullscreen: true,
    position: 'bottom-right' as WmOverlayPosition,
    offsetX: 20,
    offsetY: 20,
    opacity: 100,
    width: 150,
    height: 0,
    borderRadius: 0,
    animation: 'fade' as WatermarkAnimation,
    animationDuration: 500,
    schedule: { enabled: false, rules: [] }
  };
  watermarkPreviewUrl: string | null = null;
  selectedWatermarkFile: File | null = null;
  isDraggingWatermark: boolean = false;
  uploadingWatermark: boolean = false;
  uploadProgress: number = 0;
  uploadProgressText: string = '';
  savingWatermark: boolean = false;

  // Options pour les selects
  positionOptions: { value: WmOverlayPosition; label: string }[] = [];
  animationOptions: { value: WatermarkAnimation; label: string }[] = [];
  daysOfWeekOptions: { value: number; label: string; shortLabel: string }[] = [];

  // Rapports
  clubReports: GeneratedReport[] = [];
  loadingReports: boolean = false;
  generatingReport: boolean = false;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private assetService: AssetService,
    private reportsService: ReportsService
  ) {}

  ngOnInit(): void {
    // Initialiser les options pour les selects
    this.positionOptions = this.assetService.getPositionOptions();
    this.animationOptions = this.assetService.getAnimationOptions();
    this.daysOfWeekOptions = this.assetService.getDaysOfWeekOptions();

    if (this.site) {
      this.clubName = this.site.club_name || '';
      this.avgSpectators = this.site.avg_spectators ?? null;
      // P5: Branding
      this.logoUrl = this.site.logo_url || '';
      this.colorPrimary = this.site.color_primary || '';
      this.colorSecondary = this.site.color_secondary || '';

      // Charger les infos hotspot depuis local_config_mirror (synchronisé par le Pi)
      this.loadHotspotInfo(this.site);

      // Charger la config scoreOverlay depuis local_config_mirror (synchronisé par le Pi)
      const mirrorScoreOverlay = this.site.local_config_mirror?.['scoreOverlay'] as Record<string, unknown> | undefined;
      if (mirrorScoreOverlay) {
        if (mirrorScoreOverlay['theme'] === 'broadcast' || mirrorScoreOverlay['theme'] === 'minimal') {
          this.overlayConfig.theme = mirrorScoreOverlay['theme'];
        }
        const pos = mirrorScoreOverlay['position'] as string | undefined;
        if (pos && ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(pos)) {
          this.overlayConfig.position = pos as ScoreOverlayPosition;
        }
      }

      // Charger la config watermark existante depuis local_config_mirror (synchronisé par le Pi)
      // Note: La config est stockée dans local_config_mirror.watermark après déploiement via update_config
      const mirrorWatermark = this.site.local_config_mirror?.['watermark'] as WatermarkConfig | undefined;
      if (mirrorWatermark) {
        this.watermarkConfig = {
          ...this.watermarkConfig,
          ...mirrorWatermark
        };
        this.logger.info('Watermark config loaded from local_config_mirror', {
          enabled: mirrorWatermark.enabled,
          imagePath: mirrorWatermark.imagePath
        });
      }

      // Charger les rapports du club
      this.loadClubReports();

      // Charger le statut du PIN télécommande cloud
      this.loadRemotePinStatus();
    }
  }

  private loadRemotePinStatus(): void {
    this.sitesService.getRemotePinStatus(this.siteId).subscribe({
      next: (response) => {
        this.remotePinEnabled = response.pinEnabled;
      },
      error: () => {
        // Silencieux - le statut PIN n'est pas critique
        this.remotePinEnabled = false;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Recharger les données quand le site est mis à jour (ex: après sync_local_state)
    if (changes['site'] && changes['site'].currentValue && !changes['site'].firstChange) {
      const site = changes['site'].currentValue as Site;

      // Réinitialiser le cache SSID pour forcer la relecture depuis les nouvelles données
      this.realSsid = null;

      // Recharger les infos hotspot
      this.loadHotspotInfo(site);

      // Recharger scoreOverlay
      const mirrorScoreOverlay = site.local_config_mirror?.['scoreOverlay'] as Record<string, unknown> | undefined;
      if (mirrorScoreOverlay) {
        if (mirrorScoreOverlay['theme'] === 'broadcast' || mirrorScoreOverlay['theme'] === 'minimal') {
          this.overlayConfig.theme = mirrorScoreOverlay['theme'];
        }
        const pos = mirrorScoreOverlay['position'] as string | undefined;
        if (pos && ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(pos)) {
          this.overlayConfig.position = pos as ScoreOverlayPosition;
        }
      }

      // Recharger watermark config
      const mirrorWatermark = site.local_config_mirror?.['watermark'] as WatermarkConfig | undefined;
      if (mirrorWatermark) {
        // Ne pas écraser si on est en train d'éditer (fichier sélectionné mais pas encore déployé)
        if (!this.selectedWatermarkFile) {
          this.watermarkConfig = {
            ...this.watermarkConfig,
            ...mirrorWatermark
          };
          this.logger.info('Watermark config reloaded from site update', {
            enabled: mirrorWatermark.enabled,
            imagePath: mirrorWatermark.imagePath
          });
        }
      }
    }
  }

  /**
   * Load hotspot info from local_config_mirror (synced from Pi)
   */
  private loadHotspotInfo(site: Site): void {
    // Try _hotspotInfo first (complete info)
    const hotspotInfo = site.local_config_mirror?._hotspotInfo;
    if (hotspotInfo) {
      this.currentHotspotSsid = hotspotInfo.ssid || null;
      this.currentHotspotPassword = hotspotInfo.password || null;
      this.currentHotspotChannel = hotspotInfo.channel || null;
      this.currentHotspotClients = hotspotInfo.clients ?? null;
      this.currentHotspotActive = hotspotInfo.isActive || false;
      return;
    }

    // Fallback to _hotspotSsid (backward compatibility)
    const ssid = site.local_config_mirror?._hotspotSsid;
    if (ssid) {
      this.currentHotspotSsid = ssid;
      this.currentHotspotPassword = null;
      this.currentHotspotChannel = null;
      this.currentHotspotClients = null;
      this.currentHotspotActive = true; // Assume active if we have SSID
    }
  }

  toggleShowPassword(): void {
    this.showCurrentPassword = !this.showCurrentPassword;
  }

  /**
   * Fetch hotspot config from Pi via API (includes password)
   */
  fetchHotspotConfig(): void {
    if (!this.siteId || !this.isConnected) return;

    this.fetchingHotspotConfig = true;
    this.sitesService.getHotspotConfig(this.siteId).subscribe({
      next: (response) => {
        this.fetchingHotspotConfig = false;
        if (response.configured) {
          this.currentHotspotSsid = response.ssid || null;
          this.currentHotspotPassword = response.password || null;
          this.currentHotspotChannel = response.channel || null;
          this.currentHotspotActive = response.isActive || false;
          this.logger.info('Hotspot config fetched from Pi', {
            ssid: this.currentHotspotSsid,
            hasPassword: !!this.currentHotspotPassword
          });
        }
      },
      error: (error) => {
        this.fetchingHotspotConfig = false;
        this.logger.warn('Failed to fetch hotspot config', { error });
        this.notificationService.error('Impossible de récupérer la configuration hotspot');
      }
    });
  }

  saveClubAuth(): void {
    if (!this.clubName && !this.remotePassword) {
      this.notificationService.error('Veuillez renseigner au moins un champ');
      return;
    }

    this.savingClubAuth = true;

    // Build neoProContent with only non-empty fields
    const neoProContent: { clubName?: string; remotePassword?: string } = {};
    if (this.clubName) neoProContent.clubName = this.clubName;
    if (this.remotePassword) neoProContent.remotePassword = this.remotePassword;

    // Also update the site in the database if clubName changed
    const updateDbAndDeploy = () => {
      if (this.clubName) {
        this.sitesService.updateSite(this.siteId, { club_name: this.clubName }).subscribe({
          next: (updatedSite) => {
            this.deployClubAuth(neoProContent);
            this.siteUpdated.emit(updatedSite);
          },
          error: (error) => {
            this.savingClubAuth = false;
            const message = ErrorExtractor.getMessage(error);
            this.notificationService.error(`Erreur: ${message}`);
          }
        });
      } else {
        this.deployClubAuth(neoProContent);
      }
    };

    updateDbAndDeploy();
  }

  private deployClubAuth(neoProContent: { clubName?: string; remotePassword?: string }): void {
    this.sitesService.sendCommand(this.siteId, 'update_config', {
      neoProContent,
      mode: 'merge'
    }).subscribe({
      next: (response: { queued?: boolean }) => {
        this.savingClubAuth = false;
        this.notificationService.success(
          response.queued
            ? '📥 Configuration mise en file d\'attente'
            : 'Configuration déployée avec succès !'
        );
      },
      error: (error) => {
        this.savingClubAuth = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur déploiement: ${message}`);
      }
    });
  }

  saveAvgSpectators(): void {
    if (this.avgSpectators === null || this.avgSpectators === undefined) return;

    this.savingAvgSpectators = true;
    this.sitesService.updateSite(this.siteId, { avg_spectators: this.avgSpectators }).subscribe({
      next: (updatedSite) => {
        this.savingAvgSpectators = false;
        this.notificationService.success('Spectateurs moyens mis à jour');
        this.siteUpdated.emit(updatedSite);
      },
      error: (error) => {
        this.savingAvgSpectators = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // P5: Branding
  saveBranding(): void {
    this.brandingSaving = true;
    const data: Record<string, string | null> = {
      logo_url: this.logoUrl || null,
      color_primary: this.colorPrimary || null,
      color_secondary: this.colorSecondary || null,
    };
    this.sitesService.updateSite(this.siteId, data).subscribe({
      next: (updatedSite) => {
        this.brandingSaving = false;
        this.notificationService.success('Branding du club mis à jour');
        this.siteUpdated.emit(updatedSite);
      },
      error: (error) => {
        this.brandingSaving = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  onLogoError(): void {
    this.logoError = true;
  }

  saveRemotePin(): void {
    if (!this.remotePin || this.remotePin.length < 4) {
      this.notificationService.error('Le PIN doit contenir entre 4 et 6 chiffres');
      return;
    }

    this.savingRemotePin = true;
    this.sitesService.setRemotePin(this.siteId, this.remotePin).subscribe({
      next: () => {
        this.remotePinEnabled = true;
        this.remotePin = '';
        this.savingRemotePin = false;
        this.notificationService.success('PIN de télécommande cloud défini avec succès');
      },
      error: (error: { error?: { error?: string } }) => {
        this.savingRemotePin = false;
        this.notificationService.error(error.error?.error || 'Erreur lors de la définition du PIN');
      }
    });
  }

  clearRemotePin(): void {
    this.clearingRemotePin = true;
    this.sitesService.clearRemotePin(this.siteId).subscribe({
      next: () => {
        this.remotePinEnabled = false;
        this.clearingRemotePin = false;
        this.notificationService.success('PIN de télécommande cloud supprimé');
      },
      error: (error: { error?: { error?: string } }) => {
        this.clearingRemotePin = false;
        this.notificationService.error(error.error?.error || 'Erreur lors de la suppression du PIN');
      }
    });
  }

  updateHotspot(): void {
    if (!this.hotspotSsid && !this.hotspotPassword) {
      this.notificationService.error('Veuillez renseigner au moins un champ');
      return;
    }

    if (this.hotspotPassword && (this.hotspotPassword.length < 8 || this.hotspotPassword.length > 63)) {
      this.notificationService.error('Le mot de passe doit contenir entre 8 et 63 caractères');
      return;
    }

    if (!confirm('Modifier la configuration du hotspot WiFi ?')) return;

    this.updatingHotspot = true;
    this.sitesService.updateHotspot(
      this.siteId,
      this.hotspotSsid || undefined,
      this.hotspotPassword || undefined
    ).subscribe({
      next: (response: any) => {
        this.updatingHotspot = false;
        this.notificationService.success(
          response.queued
            ? '📥 Configuration mise en file d\'attente'
            : 'Configuration du hotspot mise à jour !'
        );
        this.hotspotSsid = '';
        this.hotspotPassword = '';
      },
      error: (error) => {
        this.updatingHotspot = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  toggleLiveScore(event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;

    this.savingLiveScore = true;
    this.sitesService.updateSite(this.siteId, { live_score_enabled: newValue }).subscribe({
      next: (updatedSite) => {
        this.sitesService.sendCommand(this.siteId, 'update_config', {
          neoProContent: { liveScoreEnabled: newValue },
          mode: 'merge'
        }).subscribe({
          next: () => {
            this.savingLiveScore = false;
            this.notificationService.success(
              newValue ? 'Option Premium activée !' : 'Option Premium désactivée !'
            );
            this.siteUpdated.emit(updatedSite);
          },
          error: () => {
            this.savingLiveScore = false;
            this.notificationService.warning('Option sauvegardée mais erreur lors du déploiement');
          }
        });
      },
      error: (error) => {
        this.savingLiveScore = false;
        checkbox.checked = !newValue;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  getJustify(): string {
    const pos = this.overlayConfig.position;
    if (pos.includes('right')) return 'flex-end';
    if (pos.includes('left')) return 'flex-start';
    return 'center';
  }

  getAlign(): string {
    const pos = this.overlayConfig.position;
    if (pos.includes('top')) return 'flex-start';
    if (pos.includes('bottom')) return 'flex-end';
    return 'center';
  }

  saveOverlayConfig(): void {
    this.savingOverlay = true;
    this.sitesService.sendCommand(this.siteId, 'update_config', {
      neoProContent: { scoreOverlay: this.overlayConfig },
      mode: 'merge'
    }).subscribe({
      next: () => {
        this.savingOverlay = false;
        this.notificationService.success('Configuration de l\'overlay déployée !');
        this.showOverlayConfig = false;
      },
      error: (error) => {
        this.savingOverlay = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  getWifiSsid(): string {
    // Utiliser le vrai SSID si déjà récupéré via fetch
    if (this.realSsid) {
      return this.realSsid;
    }

    // Utiliser currentHotspotSsid (depuis _hotspotInfo, nouveau format)
    if (this.currentHotspotSsid) {
      this.realSsid = this.currentHotspotSsid;
      return this.currentHotspotSsid;
    }

    // Fallback: utiliser _hotspotSsid depuis local_config_mirror (ancien format)
    const mirrorSsid = this.site?.local_config_mirror?._hotspotSsid;
    if (mirrorSsid) {
      this.realSsid = mirrorSsid;
      return mirrorSsid;
    }

    // Fallback: utiliser _hotspotInfo.ssid directement (si pas encore chargé dans currentHotspotSsid)
    const hotspotInfoSsid = this.site?.local_config_mirror?._hotspotInfo?.ssid;
    if (hotspotInfoSsid) {
      this.realSsid = hotspotInfoSsid;
      return hotspotInfoSsid;
    }

    // Dernier fallback: générer un SSID depuis le nom du club
    const name = this.site?.club_name || this.site?.site_name || 'CLUB';
    const sanitized = name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 20);
    return `NEOPRO-${sanitized}`;
  }

  openQrCode(): void {
    // Si on a déjà le SSID réel ou si le site est offline, ouvrir directement
    if (this.realSsid || !this.isConnected) {
      this.showQrCode = true;
      return;
    }

    // Sinon, récupérer le SSID réel via l'endpoint dédié
    this.fetchingSsid = true;
    this.sitesService.getHotspotConfig(this.siteId).subscribe({
      next: (response) => {
        this.fetchingSsid = false;
        if (response.ssid) {
          this.realSsid = response.ssid;
          this.logger.info('SSID réel récupéré', { ssid: this.realSsid });
        }
        this.showQrCode = true;
      },
      error: (error) => {
        this.fetchingSsid = false;
        this.logger.warn('Impossible de récupérer le SSID réel, utilisation du SSID généré', { error });
        // Ouvrir quand même le QR code avec le SSID généré
        this.showQrCode = true;
      }
    });
  }

  /**
   * Determine QR code default mode based on network profile
   * Returns 'cloud' for mesh_isolated sites, 'local' otherwise
   */
  getQrCodeDefaultMode(): 'local' | 'cloud' {
    const networkProfile = this.site?.network_profile;
    if (networkProfile?.type === 'mesh_isolated') {
      return 'cloud';
    }
    return 'local';
  }

  // ============================================================================
  // Watermark methods
  // ============================================================================

  onWatermarkFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Valider le fichier
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.error('Format non supporté. Utilisez PNG, JPEG, GIF, WebP ou SVG.');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      this.notificationService.error('Fichier trop volumineux (max 5 MB)');
      return;
    }

    this.selectedWatermarkFile = file;

    // Créer un aperçu local
    const reader = new FileReader();
    reader.onload = () => {
      this.watermarkPreviewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Uploader le fichier
    this.uploadWatermarkFile(file);
  }

  private uploadWatermarkFile(file: File): void {
    this.uploadingWatermark = true;
    this.uploadProgress = 0;
    this.uploadProgressText = 'Uploading...';

    this.assetService.uploadWatermark(this.siteId, file).subscribe({
      next: (response) => {
        this.uploadingWatermark = false;
        this.uploadProgress = 100;
        this.uploadProgressText = 'Upload completed!';

        // Appliquer la config suggérée
        this.watermarkConfig = {
          ...this.watermarkConfig,
          ...response.suggestedConfig,
          imagePath: response.localPath
        };

        this.notificationService.success(
          response.deployment.sent
            ? 'Image uploadée et déployée!'
            : 'Image uploadée, en attente de connexion du site'
        );

        this.logger.info('Watermark uploaded', {
          siteId: this.siteId,
          localPath: response.localPath,
          checksum: response.checksum
        });

        // Auto-déployer la config watermark vers le Pi
        // L'image a été déployée via deploy_asset, mais configuration.json
        // doit aussi être mis à jour pour que le watermark s'affiche
        this.saveWatermarkConfig();
      },
      error: (error) => {
        this.uploadingWatermark = false;
        this.uploadProgress = 0;
        this.uploadProgressText = '';
        this.watermarkPreviewUrl = null;
        this.selectedWatermarkFile = null;

        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur upload: ${message}`);
      }
    });
  }

  removeWatermark(): void {
    if (!confirm('Supprimer le watermark?')) return;

    this.watermarkConfig = {
      ...this.watermarkConfig,
      enabled: false,
      imagePath: ''
    };
    this.watermarkPreviewUrl = null;
    this.selectedWatermarkFile = null;

    // Déployer la config sans watermark
    this.saveWatermarkConfig();
  }

  getWatermarkFilename(): string {
    if (!this.watermarkConfig.imagePath) return '';
    const parts = this.watermarkConfig.imagePath.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * Returns the URL to use for watermark preview in the dashboard.
   * Priority:
   * 1. watermarkPreviewUrl - Base64 preview during upload
   * 2. watermarkConfig.cloudUrl - Cloud URL (FTP or Supabase)
   * 3. Fallback to a placeholder image if only local path exists
   *
   * We NEVER use imagePath directly as it's a local Pi path that doesn't exist on the dashboard.
   */
  getWatermarkPreviewUrl(): string {
    // Priority 1: Local preview during upload
    if (this.watermarkPreviewUrl) {
      return this.watermarkPreviewUrl;
    }

    // Priority 2: Cloud URL (from FTP or Supabase)
    if (this.watermarkConfig.cloudUrl) {
      return this.watermarkConfig.cloudUrl;
    }

    // Priority 3: No cloud URL available - show placeholder
    // This happens for watermarks uploaded before cloudUrl was added
    // The image exists on the Pi but we can't preview it in the dashboard
    return 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect fill="#1e293b" width="80" height="80"/>
        <text x="40" y="35" text-anchor="middle" fill="#64748b" font-size="24">🖼️</text>
        <text x="40" y="55" text-anchor="middle" fill="#64748b" font-size="8">Aperçu non disponible</text>
      </svg>`
    );
  }

  /**
   * Handle image load errors (e.g., if cloudUrl is expired or invalid)
   */
  onWatermarkImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    // Replace with placeholder on error
    img.src = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
        <rect fill="#1e293b" width="80" height="80"/>
        <text x="40" y="35" text-anchor="middle" fill="#ef4444" font-size="20">⚠️</text>
        <text x="40" y="55" text-anchor="middle" fill="#64748b" font-size="8">Erreur de chargement</text>
      </svg>`
    );
  }

  saveWatermarkConfig(): void {
    this.savingWatermark = true;

    this.sitesService.sendCommand(this.siteId, 'update_config', {
      neoProContent: { watermark: this.watermarkConfig },
      mode: 'merge'
    }).subscribe({
      next: (response: { queued?: boolean }) => {
        this.savingWatermark = false;
        this.notificationService.success(
          response.queued
            ? 'Configuration mise en file d\'attente'
            : 'Configuration du watermark déployée!'
        );
      },
      error: (error) => {
        this.savingWatermark = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  // Scheduling methods
  addScheduleRule(): void {
    if (!this.watermarkConfig.schedule) {
      this.watermarkConfig.schedule = { enabled: true, rules: [] };
    }
    this.watermarkConfig.schedule.rules.push(this.assetService.createDefaultScheduleRule());
  }

  removeScheduleRule(index: number): void {
    if (this.watermarkConfig.schedule?.rules) {
      this.watermarkConfig.schedule.rules.splice(index, 1);
    }
  }

  toggleRuleDay(rule: WatermarkScheduleRule, day: number): void {
    const idx = rule.daysOfWeek.indexOf(day);
    if (idx >= 0) {
      rule.daysOfWeek.splice(idx, 1);
    } else {
      rule.daysOfWeek.push(day);
      rule.daysOfWeek.sort((a, b) => a - b);
    }
  }

  // ========== Rapports PDF ==========

  loadClubReports(): void {
    if (!this.siteId) return;

    this.loadingReports = true;
    this.reportsService.getClubReports(this.siteId, 12).subscribe({
      next: (reports) => {
        this.clubReports = reports;
        this.loadingReports = false;
      },
      error: (error) => {
        this.loadingReports = false;
        // Ne pas afficher d'erreur si simplement pas de rapports
        if (error.status !== 404) {
          this.logger.warn('Erreur chargement rapports', { error: ErrorExtractor.getMessage(error) });
        }
      }
    });
  }

  generateReport(): void {
    if (!this.siteId) return;

    // Calculer la période du mois précédent
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const periodStart = firstDayLastMonth.toISOString().split('T')[0];
    const periodEnd = lastDayLastMonth.toISOString().split('T')[0];

    this.generatingReport = true;
    this.reportsService.generateReport({
      type: 'club',
      entityId: this.siteId,
      periodStart,
      periodEnd
    }).subscribe({
      next: (result) => {
        this.generatingReport = false;
        this.notificationService.success('Rapport généré avec succès!');
        // Recharger la liste des rapports
        this.loadClubReports();
      },
      error: (error) => {
        this.generatingReport = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur génération: ${message}`);
      }
    });
  }

  formatReportDate(dateString: string | null): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatFileSize(bytes: number | null): string {
    return this.reportsService.formatFileSize(bytes);
  }
}
