import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { SitesService } from '../../../core/services/sites.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  SiteConfiguration,
  ConfigHistory,
  ConfigDiff,
  ConfigValidationResult,
  ConfigValidationError,
  SponsorConfig,
  CategoryConfig,
  DEFAULT_CONFIG,
} from '../../../core/models';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="config-editor-container">
      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'form'"
          (click)="activeTab = 'form'"
        >
          Formulaire
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'json'"
          (click)="activeTab = 'json'"
        >
          JSON
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'history'"
          (click)="activeTab = 'history'; loadHistory()"
        >
          Historique ({{ historyCount }})
        </button>
      </div>

      <!-- Loading state -->
      <div *ngIf="loading" class="loading-container">
        <div class="spinner"></div>
        <span>Chargement de la configuration...</span>
      </div>

      <!-- Form Tab -->
      <div *ngIf="!loading && activeTab === 'form'" class="tab-content">
        <div class="form-sections">
          <!-- Section Authentification -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🔐</span>
              Authentification
            </h4>
            <div class="form-grid">
              <div class="form-group">
                <label for="clubName">Nom du club *</label>
                <input
                  type="text"
                  id="clubName"
                  [(ngModel)]="config.auth.clubName"
                  (ngModelChange)="onConfigChange()"
                  placeholder="Mon Club"
                  [class.error]="hasError('auth.clubName')"
                />
                <span class="field-error" *ngIf="hasError('auth.clubName')">
                  {{ getError('auth.clubName') }}
                </span>
              </div>
              <div class="form-group">
                <label for="password">Mot de passe WiFi</label>
                <input
                  type="text"
                  id="password"
                  [(ngModel)]="config.auth.password"
                  (ngModelChange)="onConfigChange()"
                  placeholder="MotDePasse123"
                />
              </div>
              <div class="form-group">
                <label for="sessionDuration">Durée de session</label>
                <select
                  id="sessionDuration"
                  [(ngModel)]="config.auth.sessionDuration"
                  (ngModelChange)="onConfigChange()"
                >
                  <option [value]="3600000">1 heure</option>
                  <option [value]="7200000">2 heures</option>
                  <option [value]="14400000">4 heures</option>
                  <option [value]="28800000">8 heures</option>
                  <option [value]="86400000">24 heures</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Section Remote -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📱</span>
              Télécommande
            </h4>
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="remoteTitle">Titre de la télécommande</label>
                <input
                  type="text"
                  id="remoteTitle"
                  [(ngModel)]="config.remote.title"
                  (ngModelChange)="onConfigChange()"
                  placeholder="Telecommande Neopro - Mon Club"
                />
              </div>
            </div>
          </div>

          <!-- Section Synchronisation -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🔄</span>
              Synchronisation
            </h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="config.sync.enabled"
                    (ngModelChange)="onConfigChange()"
                  />
                  Synchronisation activée
                </label>
              </div>
              <div class="form-group full-width" *ngIf="config.sync.enabled">
                <label for="serverUrl">URL du serveur</label>
                <input
                  type="url"
                  id="serverUrl"
                  [(ngModel)]="config.sync.serverUrl"
                  (ngModelChange)="onConfigChange()"
                  placeholder="https://neopro-central-server.onrender.com"
                />
              </div>
              <div class="form-group" *ngIf="config.sync.enabled">
                <label for="syncSiteName">ID du site</label>
                <input
                  type="text"
                  id="syncSiteName"
                  [(ngModel)]="config.sync.siteName"
                  (ngModelChange)="onConfigChange()"
                  [placeholder]="siteId"
                />
              </div>
              <div class="form-group" *ngIf="config.sync.enabled">
                <label for="syncClubName">Nom du club (sync)</label>
                <input
                  type="text"
                  id="syncClubName"
                  [(ngModel)]="config.sync.clubName"
                  (ngModelChange)="onConfigChange()"
                />
              </div>
            </div>
          </div>

          <!-- Section Sponsors -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">🏆</span>
              Sponsors
              <button class="btn-add" (click)="addSponsor()">+ Ajouter</button>
            </h4>
            <div class="items-list" *ngIf="config.sponsors.length > 0">
              <div class="item-card" *ngFor="let sponsor of config.sponsors; let i = index">
                <div class="item-header">
                  <span class="item-name">{{ sponsor.name || 'Nouveau sponsor' }}</span>
                  <button class="btn-remove" (click)="removeSponsor(i)">×</button>
                </div>
                <div class="item-form">
                  <input
                    type="text"
                    [(ngModel)]="sponsor.name"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Nom du sponsor"
                  />
                  <input
                    type="url"
                    [(ngModel)]="sponsor.logoUrl"
                    (ngModelChange)="onConfigChange()"
                    placeholder="URL du logo"
                  />
                  <input
                    type="url"
                    [(ngModel)]="sponsor.websiteUrl"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Site web"
                  />
                </div>
              </div>
            </div>
            <p class="empty-message" *ngIf="config.sponsors.length === 0">
              Aucun sponsor configuré
            </p>
          </div>

          <!-- Section Catégories -->
          <div class="form-section">
            <h4 class="section-title">
              <span class="section-icon">📁</span>
              Catégories
              <button class="btn-add" (click)="addCategory()">+ Ajouter</button>
            </h4>
            <div class="items-list" *ngIf="config.categories.length > 0">
              <div class="item-card" *ngFor="let category of config.categories; let i = index">
                <div class="item-header">
                  <span class="item-name">{{ category.name || 'Nouvelle catégorie' }}</span>
                  <button class="btn-remove" (click)="removeCategory(i)">×</button>
                </div>
                <div class="item-form">
                  <input
                    type="text"
                    [(ngModel)]="category.name"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Nom de la catégorie"
                  />
                  <input
                    type="text"
                    [(ngModel)]="category.icon"
                    (ngModelChange)="onConfigChange()"
                    placeholder="Icône (emoji)"
                  />
                </div>
              </div>
            </div>
            <p class="empty-message" *ngIf="config.categories.length === 0">
              Aucune catégorie configurée
            </p>
          </div>
        </div>
      </div>

      <!-- JSON Tab -->
      <div *ngIf="!loading && activeTab === 'json'" class="tab-content">
        <div class="json-editor">
          <div class="json-toolbar">
            <button class="btn btn-secondary btn-sm" (click)="formatJson()">Formater</button>
            <button class="btn btn-secondary btn-sm" (click)="validateJson()">Valider</button>
          </div>
          <textarea
            class="json-textarea"
            [(ngModel)]="jsonString"
            (ngModelChange)="onJsonChange()"
            [placeholder]="jsonPlaceholder"
            rows="25"
          ></textarea>
          <div *ngIf="jsonError" class="json-error">{{ jsonError }}</div>
        </div>
      </div>

      <!-- History Tab -->
      <div *ngIf="!loading && activeTab === 'history'" class="tab-content">
        <div class="history-container">
          <div *ngIf="loadingHistory" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Chargement de l'historique...</span>
          </div>
          <div *ngIf="!loadingHistory && history.length === 0" class="empty-history">
            <p>Aucun historique disponible</p>
            <p class="hint">L'historique sera créé lors du premier déploiement</p>
          </div>
          <div *ngIf="!loadingHistory && history.length > 0" class="history-list">
            <div
              class="history-item"
              *ngFor="let item of history"
              [class.selected]="selectedHistoryId === item.id"
            >
              <div class="history-item-header">
                <span class="history-date">{{ item.deployed_at | date:'dd/MM/yyyy HH:mm' }}</span>
                <span class="history-user">{{ item.deployed_by_email || 'Système' }}</span>
              </div>
              <div class="history-item-comment" *ngIf="item.comment">
                {{ item.comment }}
              </div>
              <div class="history-item-changes" *ngIf="item.changes_summary?.length">
                {{ item.changes_summary!.length }} modification(s)
              </div>
              <div class="history-item-actions">
                <button class="btn btn-secondary btn-sm" (click)="viewHistoryVersion(item)">
                  Voir
                </button>
                <button class="btn btn-primary btn-sm" (click)="restoreVersion(item)">
                  Restaurer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Diff Preview Modal -->
      <div class="modal" *ngIf="showDiffModal" (click)="showDiffModal = false">
        <div class="modal-content modal-large" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Aperçu des changements</h2>
            <button class="modal-close" (click)="showDiffModal = false">×</button>
          </div>
          <div class="modal-body">
            <div *ngIf="diffLoading" class="loading-inline">
              <div class="spinner-small"></div>
              <span>Calcul des différences...</span>
            </div>
            <div *ngIf="!diffLoading && diffItems.length === 0" class="no-changes">
              Aucun changement détecté
            </div>
            <div *ngIf="!diffLoading && diffItems.length > 0" class="diff-list">
              <div class="diff-summary">
                {{ diffItems.length }} changement(s) détecté(s)
              </div>
              <div class="diff-item" *ngFor="let diff of diffItems" [class]="'diff-' + diff.type">
                <div class="diff-field">{{ diff.path }}</div>
                <div class="diff-type">
                  <span *ngIf="diff.type === 'added'" class="badge badge-success">Ajouté</span>
                  <span *ngIf="diff.type === 'removed'" class="badge badge-danger">Supprimé</span>
                  <span *ngIf="diff.type === 'changed'" class="badge badge-warning">Modifié</span>
                </div>
                <div class="diff-values" *ngIf="diff.type === 'changed'">
                  <div class="diff-old">
                    <span class="diff-label">Avant:</span>
                    <code>{{ formatDiffValue(diff.oldValue) }}</code>
                  </div>
                  <div class="diff-new">
                    <span class="diff-label">Après:</span>
                    <code>{{ formatDiffValue(diff.newValue) }}</code>
                  </div>
                </div>
                <div class="diff-values" *ngIf="diff.type === 'added'">
                  <div class="diff-new">
                    <span class="diff-label">Valeur:</span>
                    <code>{{ formatDiffValue(diff.newValue) }}</code>
                  </div>
                </div>
                <div class="diff-values" *ngIf="diff.type === 'removed'">
                  <div class="diff-old">
                    <span class="diff-label">Valeur:</span>
                    <code>{{ formatDiffValue(diff.oldValue) }}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showDiffModal = false">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="confirmDeploy()"
              [disabled]="deploying"
            >
              {{ deploying ? 'Déploiement...' : 'Confirmer le déploiement' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="editor-footer" *ngIf="!loading">
        <div class="footer-left">
          <button class="btn btn-secondary" (click)="reloadConfig()" [disabled]="loading">
            Recharger depuis le site
          </button>
        </div>
        <div class="footer-right">
          <span class="status-indicator" *ngIf="hasChanges">
            <span class="status-dot warning"></span>
            Modifications non déployées
          </span>
          <span class="status-indicator" *ngIf="!hasChanges && !(validationResult?.errors?.length)">
            <span class="status-dot success"></span>
            Configuration synchronisée
          </span>
          <button
            class="btn btn-primary"
            (click)="previewAndDeploy()"
            [disabled]="!isValid || deploying"
          >
            {{ deploying ? 'Déploiement...' : 'Déployer la configuration' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .config-editor-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 2px solid #e2e8f0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }

    .tab:hover {
      color: #2563eb;
    }

    .tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .tab-content {
      padding: 1rem 0;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      gap: 1rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .spinner-small {
      width: 20px;
      height: 20px;
      border: 2px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .form-sections {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .form-section {
      background: #f8fafc;
      border-radius: 8px;
      padding: 1.25rem;
      border: 1px solid #e2e8f0;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #0f172a;
    }

    .section-icon {
      font-size: 1.25rem;
    }

    .btn-add {
      margin-left: auto;
      padding: 0.25rem 0.75rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .btn-add:hover {
      background: #1d4ed8;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .form-group.full-width {
      grid-column: 1 / -1;
    }

    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
    }

    .form-group input,
    .form-group select {
      padding: 0.625rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      transition: border-color 0.2s;
    }

    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group input.error {
      border-color: #ef4444;
    }

    .field-error {
      font-size: 0.75rem;
      color: #ef4444;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .item-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.75rem;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .item-name {
      font-weight: 500;
      color: #0f172a;
    }

    .btn-remove {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fee2e2;
      color: #ef4444;
      border: none;
      border-radius: 4px;
      font-size: 1.25rem;
      cursor: pointer;
    }

    .btn-remove:hover {
      background: #fecaca;
    }

    .item-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .item-form input {
      padding: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .empty-message {
      color: #94a3b8;
      text-align: center;
      padding: 1rem;
      font-style: italic;
    }

    /* JSON Editor */
    .json-editor {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .json-toolbar {
      display: flex;
      gap: 0.5rem;
    }

    .json-textarea {
      width: 100%;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      resize: vertical;
      min-height: 400px;
    }

    .json-textarea:focus {
      outline: none;
      border-color: #2563eb;
      background: white;
    }

    .json-error {
      padding: 0.75rem;
      background: #fef2f2;
      border: 1px solid #ef4444;
      border-radius: 6px;
      color: #b91c1c;
      font-size: 0.875rem;
    }

    /* History */
    .history-container {
      min-height: 300px;
    }

    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: #64748b;
    }

    .empty-history {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .empty-history .hint {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-top: 0.5rem;
    }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .history-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      transition: all 0.2s;
    }

    .history-item:hover {
      border-color: #2563eb;
    }

    .history-item.selected {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .history-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .history-date {
      font-weight: 600;
      color: #0f172a;
    }

    .history-user {
      font-size: 0.875rem;
      color: #64748b;
    }

    .history-item-comment {
      font-size: 0.875rem;
      color: #475569;
      margin-bottom: 0.5rem;
      font-style: italic;
    }

    .history-item-changes {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.75rem;
    }

    .history-item-actions {
      display: flex;
      gap: 0.5rem;
    }

    /* Diff Modal */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-content.modal-large {
      max-width: 800px;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f1f5f9;
      color: #64748b;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .no-changes {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .diff-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .diff-summary {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .diff-item {
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .diff-added {
      background: #ecfdf5;
      border-color: #10b981;
    }

    .diff-removed {
      background: #fef2f2;
      border-color: #ef4444;
    }

    .diff-changed {
      background: #fffbeb;
      border-color: #f59e0b;
    }

    .diff-field {
      font-family: monospace;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .diff-type {
      margin-bottom: 0.5rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-success {
      background: #dcfce7;
      color: #166534;
    }

    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }

    .diff-values {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .diff-old, .diff-new {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .diff-label {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 50px;
    }

    .diff-values code {
      padding: 0.25rem 0.5rem;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      font-size: 0.875rem;
      word-break: break-all;
    }

    /* Footer */
    .editor-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      margin-top: 1rem;
    }

    .footer-left, .footer-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-dot.success {
      background: #10b981;
    }

    .status-dot.warning {
      background: #f59e0b;
    }

    /* Buttons */
    .btn {
      padding: 0.625rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      font-size: 0.875rem;
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
      background: #93c5fd;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #cbd5e1;
    }
  `]
})
export class ConfigEditorComponent implements OnInit, OnDestroy {
  @Input() siteId!: string;
  @Input() siteName!: string;
  @Output() configDeployed = new EventEmitter<void>();

  activeTab: 'form' | 'json' | 'history' = 'form';
  loading = false;
  deploying = false;
  hasChanges = false;
  isValid = true;

  config: SiteConfiguration = this.getEmptyConfig();
  originalConfig: SiteConfiguration | null = null;
  jsonString = '';
  jsonError = '';
  jsonPlaceholder = JSON.stringify(DEFAULT_CONFIG, null, 2);

  // Validation
  validationResult: ConfigValidationResult | null = null;
  validationErrors: Map<string, string> = new Map();

  // History
  history: ConfigHistory[] = [];
  historyCount = 0;
  loadingHistory = false;
  selectedHistoryId: string | null = null;

  // Diff
  showDiffModal = false;
  diffLoading = false;
  diffItems: ConfigDiff[] = [];

  // Polling
  private configCommandId: string | null = null;
  private configPollSubscription?: Subscription;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.reloadConfig();
    this.loadHistoryCount();
  }

  ngOnDestroy(): void {
    this.configPollSubscription?.unsubscribe();
  }

  private getEmptyConfig(): SiteConfiguration {
    return {
      version: '1.0',
      remote: { title: '' },
      auth: { password: '', clubName: '', sessionDuration: 28800000 },
      sync: { enabled: true, serverUrl: 'https://neopro-central-server.onrender.com', siteName: '', clubName: '' },
      sponsors: [],
      categories: [],
    };
  }

  reloadConfig(): void {
    this.loading = true;
    this.configPollSubscription?.unsubscribe();

    this.sitesService.getConfiguration(this.siteId).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.configCommandId = response.commandId;
          this.pollConfigResult();
        } else {
          this.loading = false;
          this.notificationService.error('Erreur: pas de commandId reçu');
        }
      },
      error: (error) => {
        this.loading = false;
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
      }
    });
  }

  private pollConfigResult(): void {
    if (!this.configCommandId) return;

    this.configPollSubscription = interval(1000).subscribe(() => {
      this.sitesService.getCommandStatus(this.siteId, this.configCommandId!).subscribe({
        next: (status) => {
          if (status.status === 'completed') {
            this.configPollSubscription?.unsubscribe();
            this.loading = false;

            if (status.result?.configuration) {
              this.setConfig(status.result.configuration);
              this.notificationService.success('Configuration chargée');
            } else if (status.result?.message === 'No configuration file found') {
              this.config = this.getEmptyConfig();
              this.originalConfig = null;
              this.syncJsonFromConfig();
              this.notificationService.info('Aucune configuration sur le site. Créez-en une nouvelle.');
            }
          } else if (status.status === 'failed') {
            this.configPollSubscription?.unsubscribe();
            this.loading = false;
            this.notificationService.error('Erreur: ' + (status.error_message || 'Échec de la récupération'));
          }
        },
        error: (error) => {
          this.configPollSubscription?.unsubscribe();
          this.loading = false;
          this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
        }
      });
    });
  }

  private setConfig(configuration: SiteConfiguration): void {
    this.config = {
      ...this.getEmptyConfig(),
      ...configuration,
      remote: { ...this.getEmptyConfig().remote, ...configuration.remote },
      auth: { ...this.getEmptyConfig().auth, ...configuration.auth },
      sync: { ...this.getEmptyConfig().sync, ...configuration.sync },
      sponsors: configuration.sponsors || [],
      categories: configuration.categories || [],
    };
    this.originalConfig = JSON.parse(JSON.stringify(this.config));
    this.syncJsonFromConfig();
    this.hasChanges = false;
    this.validate();
  }

  private syncJsonFromConfig(): void {
    this.jsonString = JSON.stringify(this.config, null, 2);
    this.jsonError = '';
  }

  onConfigChange(): void {
    this.syncJsonFromConfig();
    this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
    this.validate();
  }

  onJsonChange(): void {
    try {
      const parsed = JSON.parse(this.jsonString);
      this.config = {
        ...this.getEmptyConfig(),
        ...parsed,
        remote: { ...this.getEmptyConfig().remote, ...parsed.remote },
        auth: { ...this.getEmptyConfig().auth, ...parsed.auth },
        sync: { ...this.getEmptyConfig().sync, ...parsed.sync },
        sponsors: parsed.sponsors || [],
        categories: parsed.categories || [],
      };
      this.jsonError = '';
      this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
      this.validate();
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
      this.isValid = false;
    }
  }

  formatJson(): void {
    try {
      const parsed = JSON.parse(this.jsonString);
      this.jsonString = JSON.stringify(parsed, null, 2);
      this.jsonError = '';
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
    }
  }

  validateJson(): void {
    try {
      JSON.parse(this.jsonString);
      this.validate();
      if (this.isValid) {
        this.notificationService.success('Configuration valide');
      }
    } catch (e: any) {
      this.jsonError = `Erreur de syntaxe JSON: ${e.message}`;
      this.notificationService.error('JSON invalide');
    }
  }

  private validate(): void {
    this.validationErrors.clear();
    const errors: ConfigValidationError[] = [];

    // Validation des champs requis
    if (!this.config.auth?.clubName?.trim()) {
      errors.push({ field: 'auth.clubName', message: 'Le nom du club est requis' });
      this.validationErrors.set('auth.clubName', 'Le nom du club est requis');
    }

    // Validation URL serveur si sync activé
    if (this.config.sync?.enabled && this.config.sync.serverUrl) {
      try {
        new URL(this.config.sync.serverUrl);
      } catch {
        errors.push({ field: 'sync.serverUrl', message: 'URL du serveur invalide' });
        this.validationErrors.set('sync.serverUrl', 'URL invalide');
      }
    }

    this.validationResult = {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };

    this.isValid = errors.length === 0;
  }

  hasError(field: string): boolean {
    return this.validationErrors.has(field);
  }

  getError(field: string): string {
    return this.validationErrors.get(field) || '';
  }

  // Sponsors
  addSponsor(): void {
    this.config.sponsors.push({ name: '', logoUrl: '', websiteUrl: '' });
    this.onConfigChange();
  }

  removeSponsor(index: number): void {
    this.config.sponsors.splice(index, 1);
    this.onConfigChange();
  }

  // Categories
  addCategory(): void {
    this.config.categories.push({ name: '', icon: '' });
    this.onConfigChange();
  }

  removeCategory(index: number): void {
    this.config.categories.splice(index, 1);
    this.onConfigChange();
  }

  // History
  loadHistoryCount(): void {
    this.sitesService.getConfigHistory(this.siteId, 1, 0).subscribe({
      next: (response) => {
        this.historyCount = response.total;
      },
      error: () => {
        this.historyCount = 0;
      }
    });
  }

  loadHistory(): void {
    this.loadingHistory = true;
    this.sitesService.getConfigHistory(this.siteId, 20, 0).subscribe({
      next: (response) => {
        this.history = response.history;
        this.historyCount = response.total;
        this.loadingHistory = false;
      },
      error: (error) => {
        this.loadingHistory = false;
        this.notificationService.error('Erreur lors du chargement de l\'historique');
      }
    });
  }

  viewHistoryVersion(item: ConfigHistory): void {
    this.selectedHistoryId = item.id;
    this.setConfig(item.configuration);
    this.activeTab = 'form';
    this.hasChanges = true; // Car différent de la config actuelle du site
  }

  restoreVersion(item: ConfigHistory): void {
    if (confirm(`Restaurer la configuration du ${new Date(item.deployed_at).toLocaleString()} ?`)) {
      this.setConfig(item.configuration);
      this.hasChanges = true;
      this.activeTab = 'form';
      this.notificationService.info('Configuration restaurée. Cliquez sur "Déployer" pour appliquer.');
    }
  }

  // Deploy
  previewAndDeploy(): void {
    if (!this.isValid) {
      this.notificationService.error('Veuillez corriger les erreurs de validation');
      return;
    }

    this.showDiffModal = true;
    this.diffLoading = true;

    this.sitesService.previewConfigDiff(this.siteId, this.config).subscribe({
      next: (response) => {
        this.diffItems = response.diff;
        this.diffLoading = false;
      },
      error: (error) => {
        this.diffLoading = false;
        // Si pas d'historique, on peut quand même déployer
        this.diffItems = [];
      }
    });
  }

  confirmDeploy(): void {
    this.deploying = true;

    // D'abord sauvegarder dans l'historique
    this.sitesService.saveConfigVersion(this.siteId, this.config, 'Déploiement depuis le dashboard').subscribe({
      next: () => {
        // Puis déployer sur le site
        this.sitesService.sendCommand(this.siteId, 'update_config', { configuration: this.config }).subscribe({
          next: () => {
            this.deploying = false;
            this.showDiffModal = false;
            this.originalConfig = JSON.parse(JSON.stringify(this.config));
            this.hasChanges = false;
            this.loadHistoryCount();
            this.notificationService.success('Configuration déployée avec succès');
            this.configDeployed.emit();
          },
          error: (error) => {
            this.deploying = false;
            this.notificationService.error('Erreur lors du déploiement: ' + (error.error?.error || error.message));
          }
        });
      },
      error: (error) => {
        this.deploying = false;
        this.notificationService.error('Erreur lors de la sauvegarde: ' + (error.error?.error || error.message));
      }
    });
  }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
