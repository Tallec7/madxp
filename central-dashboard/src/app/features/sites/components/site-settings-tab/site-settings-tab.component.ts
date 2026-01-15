import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { AssetService, WatermarkConfig, OverlayPosition as WmOverlayPosition, WatermarkAnimation, WatermarkScheduleRule } from '../../../../core/services/asset.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { Site, OverlayPosition } from '../../../../core/models';
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

      <!-- QR Code Telecommande -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">📱</span>
          <h4>QR Code Telecommande</h4>
        </div>
        <p class="settings-desc">
          Generez un QR code a imprimer et afficher pres de la TV. Les utilisateurs pourront scanner pour acceder directement a la telecommande.
        </p>
        <div class="qr-preview-row">
          <div class="qr-info">
            <div class="qr-detail">
              <span class="qr-label">URL :</span>
              <code>http://neopro.local/remote</code>
            </div>
            <div class="qr-detail">
              <span class="qr-label">WiFi :</span>
              <code>{{ getWifiSsid() }}</code>
              <span class="ssid-source" *ngIf="realSsid">(reel)</span>
              <span class="ssid-source ssid-generated" *ngIf="!realSsid">(genere)</span>
            </div>
          </div>
          <button class="btn btn-primary" (click)="openQrCode()" [disabled]="fetchingSsid">
            {{ fetchingSsid ? 'Chargement...' : 'Generer le QR Code' }}
          </button>
        </div>
      </div>

      <!-- Configuration Hotspot WiFi -->
      <div class="settings-card">
        <div class="settings-header">
          <span class="settings-icon">📶</span>
          <h4>Hotspot WiFi</h4>
        </div>
        <p class="settings-desc">Configuration du réseau WiFi du boîtier</p>
        <div class="settings-grid">
          <div class="form-group">
            <label>SSID (nom du réseau)</label>
            <input type="text" [(ngModel)]="hotspotSsid" placeholder="NEOPRO-MonClub" maxlength="32" class="form-input"/>
            <small class="form-hint">Max 32 caractères</small>
          </div>
          <div class="form-group">
            <label>Mot de passe WiFi</label>
            <input type="text" [(ngModel)]="hotspotPassword" placeholder="••••••••" minlength="8" maxlength="63" class="form-input"/>
            <small class="form-hint">8-63 caractères (WPA2)</small>
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
            <h5>Apparence de l'overlay</h5>
            <div class="overlay-grid">
              <div class="form-group">
                <label>Position</label>
                <select [(ngModel)]="overlayConfig.position" class="form-input">
                  <option value="top-left">Haut gauche</option>
                  <option value="top-center">Haut centre</option>
                  <option value="top-right">Haut droite</option>
                  <option value="bottom-left">Bas gauche</option>
                  <option value="bottom-center">Bas centre</option>
                  <option value="bottom-right">Bas droite</option>
                </select>
              </div>
              <div class="form-group">
                <label>Décalage X (px)</label>
                <input type="number" [(ngModel)]="overlayConfig.offsetX" min="0" max="200" class="form-input"/>
              </div>
              <div class="form-group">
                <label>Décalage Y (px)</label>
                <input type="number" [(ngModel)]="overlayConfig.offsetY" min="0" max="200" class="form-input"/>
              </div>
              <div class="form-group">
                <label>Arrondi (px)</label>
                <input type="number" [(ngModel)]="overlayConfig.borderRadius" min="0" max="50" class="form-input"/>
              </div>
              <div class="form-group">
                <label>Couleur score</label>
                <div class="color-input">
                  <input type="color" [(ngModel)]="overlayConfig.scoreColor"/>
                  <span>{{ overlayConfig.scoreColor }}</span>
                </div>
              </div>
              <div class="form-group">
                <label>Taille score (px)</label>
                <input type="number" [(ngModel)]="overlayConfig.scoreSize" min="16" max="72" class="form-input"/>
              </div>
              <div class="form-group">
                <label>Couleur équipes</label>
                <div class="color-input">
                  <input type="color" [(ngModel)]="overlayConfig.teamNameColor"/>
                  <span>{{ overlayConfig.teamNameColor }}</span>
                </div>
              </div>
              <div class="form-group">
                <label>Taille équipes (px)</label>
                <input type="number" [(ngModel)]="overlayConfig.teamNameSize" min="10" max="36" class="form-input"/>
              </div>
            </div>

            <!-- Preview -->
            <div class="overlay-preview">
              <div class="preview-label">Aperçu</div>
              <div class="preview-container" [style.justify-content]="getJustify()" [style.align-items]="getAlign()">
                <div class="preview-overlay"
                  [style.border-radius.px]="overlayConfig.borderRadius"
                  [style.margin]="overlayConfig.offsetY + 'px ' + overlayConfig.offsetX + 'px'"
                >
                  <span class="preview-team" [style.color]="overlayConfig.teamNameColor" [style.font-size.px]="overlayConfig.teamNameSize * 0.8">DOM</span>
                  <span class="preview-score" [style.color]="overlayConfig.scoreColor" [style.font-size.px]="overlayConfig.scoreSize * 0.8">2 - 1</span>
                  <span class="preview-team" [style.color]="overlayConfig.teamNameColor" [style.font-size.px]="overlayConfig.teamNameSize * 0.8">EXT</span>
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
            <img [src]="watermarkPreviewUrl || watermarkConfig.imagePath" alt="Watermark" class="watermark-img"/>
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

    </div>

    <!-- QR Code Modal -->
    <app-qr-code-generator
      *ngIf="showQrCode"
      [clubName]="site?.club_name || site?.site_name || 'Club'"
      [wifiSsid]="getWifiSsid()"
      [visible]="showQrCode"
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
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .color-input {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .color-input input[type="color"] {
      width: 40px;
      height: 32px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 0;
      cursor: pointer;
    }

    .color-input span {
      font-size: 0.75rem;
      color: #64748b;
      font-family: monospace;
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
      background: rgba(0, 0, 0, 0.85);
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
  `]
})
export class SiteSettingsTabComponent implements OnInit {
  @Input() siteId!: string;
  @Input() site!: Site | null;
  @Input() isConnected: boolean = false;
  @Output() siteUpdated = new EventEmitter<Site>();

  // Auth
  clubName: string = '';
  remotePassword: string = '';
  savingClubAuth: boolean = false;

  // Hotspot
  hotspotSsid: string = '';
  hotspotPassword: string = '';
  updatingHotspot: boolean = false;

  // Premium
  savingLiveScore: boolean = false;
  showOverlayConfig: boolean = false;
  savingOverlay: boolean = false;
  overlayConfig = {
    position: 'top-right' as OverlayPosition,
    offsetX: 20,
    offsetY: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    scoreColor: '#4caf50',
    scoreSize: 28,
    teamNameColor: '#ffffff',
    teamNameSize: 16
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

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private assetService: AssetService
  ) {}

  ngOnInit(): void {
    // Initialiser les options pour les selects
    this.positionOptions = this.assetService.getPositionOptions();
    this.animationOptions = this.assetService.getAnimationOptions();
    this.daysOfWeekOptions = this.assetService.getDaysOfWeekOptions();

    if (this.site) {
      this.clubName = this.site.club_name || '';
      if (this.site.neoProContent?.scoreOverlay) {
        this.overlayConfig = { ...this.overlayConfig, ...this.site.neoProContent.scoreOverlay };
      }
      // Charger la config watermark existante
      if (this.site.neoProContent?.['watermark']) {
        this.watermarkConfig = {
          ...this.watermarkConfig,
          ...(this.site.neoProContent['watermark'] as WatermarkConfig)
        };
      }
    }
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
      next: (response: any) => {
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
    // Utiliser le vrai SSID si déjà récupéré
    if (this.realSsid) {
      return this.realSsid;
    }

    // Utiliser le vrai SSID depuis local_config_mirror si disponible
    const mirrorSsid = this.site?.local_config_mirror?._hotspotSsid;
    if (mirrorSsid) {
      this.realSsid = mirrorSsid;
      return mirrorSsid;
    }

    // Fallback: générer un SSID depuis le nom du club
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
}
