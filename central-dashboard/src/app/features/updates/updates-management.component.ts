import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SitesService } from '../../core/services/sites.service';
import { GroupsService } from '../../core/services/groups.service';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { Site, Group } from '../../core/models';
import { Subscription } from 'rxjs';

interface SoftwareUpdate {
  id: string;
  version: string;
  description: string;
  release_notes: string;
  file_size: number;
  created_at: Date;
  is_critical: boolean;
}

interface UpdateDeployment {
  id: string;
  update_id: string;
  update_version?: string;
  target_type: 'site' | 'group';
  target_id: string;
  target_name?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  deployed_count: number;
  total_count: number;
  created_at: Date;
  completed_at?: Date;
}

@Component({
  selector: 'app-updates-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h1>Gestion des mises à jour</h1>

      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'updates'"
          (click)="activeTab = 'updates'"
        >
          🔄 Mises à jour ({{ updates.length }})
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'deploy'"
          (click)="activeTab = 'deploy'"
        >
          🚀 Déployer
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'history'"
          (click)="activeTab = 'history'"
        >
          📊 Historique ({{ deployments.length }})
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'versions'"
          (click)="activeTab = 'versions'"
        >
          📋 Versions installées
        </button>
      </div>

      <!-- Updates Tab -->
      <div class="tab-content" *ngIf="activeTab === 'updates'">
        <div class="content-header">
          <h2>Versions disponibles</h2>
          <button class="btn btn-primary" (click)="showCreateModal = true">
            + Nouvelle version
          </button>
        </div>

        <div class="updates-list" *ngIf="updates.length > 0 else noUpdates">
          <div class="update-card card" *ngFor="let update of updates">
            <div class="update-header">
              <div class="update-title">
                <h3>Version {{ update.version }}</h3>
                <span class="badge badge-primary" *ngIf="update.is_critical">🔴 Critique</span>
              </div>
              <div class="update-meta">
                {{ formatFileSize(update.file_size) }} • {{ formatDate(update.created_at) }}
              </div>
            </div>

            <p class="update-description">{{ update.description }}</p>

            <div class="update-notes" *ngIf="update.release_notes">
              <div class="notes-header" (click)="toggleNotes(update.id)">
                <strong>Notes de version</strong>
                <span class="toggle-icon">{{ isNotesExpanded(update.id) ? '▼' : '▶' }}</span>
              </div>
              <div class="notes-content" *ngIf="isNotesExpanded(update.id)">
                {{ update.release_notes }}
              </div>
            </div>

            <div class="update-actions">
              <button class="btn btn-sm btn-primary" (click)="deployUpdate(update)">
                🚀 Déployer
              </button>
              <button class="btn-icon btn-danger" (click)="deleteUpdate(update)" title="Supprimer">
                🗑️
              </button>
            </div>
          </div>
        </div>

        <ng-template #noUpdates>
          <div class="empty-state card">
            <div class="empty-icon">🔄</div>
            <h3>Aucune mise à jour</h3>
            <p>Commencez par créer une nouvelle version pour déployer des mises à jour.</p>
            <button class="btn btn-primary" (click)="showCreateModal = true">
              + Nouvelle version
            </button>
          </div>
        </ng-template>
      </div>

      <!-- Deploy Tab -->
      <div class="tab-content" *ngIf="activeTab === 'deploy'">
        <div class="deploy-wizard card">
          <h2>Déployer une mise à jour</h2>

          <div class="wizard-step">
            <div class="step-header">
              <span class="step-number">1</span>
              <h3>Sélectionner une version</h3>
            </div>
            <select [(ngModel)]="deployForm.updateId" class="form-select">
              <option value="">-- Choisir une version --</option>
              <option *ngFor="let update of updates" [value]="update.id">
                v{{ update.version }} - {{ update.description }}
                <span *ngIf="update.is_critical">(Critique)</span>
              </option>
            </select>
            <div class="warning-message" *ngIf="selectedUpdate()?.is_critical">
              ⚠️ Cette mise à jour est marquée comme critique et devrait être déployée rapidement.
            </div>
          </div>

          <div class="wizard-step">
            <div class="step-header">
              <span class="step-number">2</span>
              <h3>Choisir la cible</h3>
            </div>
            <div class="target-type-selector">
              <label class="radio-card">
                <input
                  type="radio"
                  name="targetType"
                  value="site"
                  [(ngModel)]="deployForm.targetType"
                />
                <div class="radio-content">
                  <span class="radio-icon">🖥️</span>
                  <div>
                    <div class="radio-title">Site individuel</div>
                    <div class="radio-desc">Mettre à jour un site spécifique</div>
                  </div>
                </div>
              </label>
              <label class="radio-card">
                <input
                  type="radio"
                  name="targetType"
                  value="group"
                  [(ngModel)]="deployForm.targetType"
                />
                <div class="radio-content">
                  <span class="radio-icon">👥</span>
                  <div>
                    <div class="radio-title">Groupe de sites</div>
                    <div class="radio-desc">Mettre à jour plusieurs sites</div>
                  </div>
                </div>
              </label>
            </div>

            <select
              *ngIf="deployForm.targetType === 'site'"
              [(ngModel)]="deployForm.targetId"
              class="form-select"
            >
              <option value="">-- Choisir un site --</option>
              <option *ngFor="let site of sites" [value]="site.id">
                {{ site.club_name }} - {{ site.site_name }} (v{{ site.software_version }})
              </option>
            </select>

            <select
              *ngIf="deployForm.targetType === 'group'"
              [(ngModel)]="deployForm.targetId"
              class="form-select"
            >
              <option value="">-- Choisir un groupe --</option>
              <option *ngFor="let group of groups" [value]="group.id">
                {{ group.name }} ({{ group.site_count }} sites)
              </option>
            </select>
          </div>

          <div class="wizard-step">
            <div class="step-header">
              <span class="step-number">3</span>
              <h3>Options de déploiement</h3>
            </div>
            <label class="checkbox-option">
              <input type="checkbox" [(ngModel)]="deployForm.autoRollback" />
              <div class="option-content">
                <div class="option-title">Rollback automatique</div>
                <div class="option-desc">Restaurer la version précédente en cas d'échec</div>
              </div>
            </label>
            <label class="checkbox-option">
              <input type="checkbox" [(ngModel)]="deployForm.scheduleReboot" />
              <div class="option-content">
                <div class="option-title">Redémarrage après installation</div>
                <div class="option-desc">Redémarrer automatiquement les systèmes après la mise à jour</div>
              </div>
            </label>
          </div>

          <div class="wizard-actions">
            <button
              class="btn btn-primary btn-lg"
              (click)="startDeployment()"
              [disabled]="!canDeploy()"
            >
              🚀 Lancer le déploiement
            </button>
          </div>
        </div>
      </div>

      <!-- History Tab -->
      <div class="tab-content" *ngIf="activeTab === 'history'">
        <div class="deployments-list" *ngIf="deployments.length > 0 else noDeployments">
          <div class="deployment-card card" *ngFor="let deployment of deployments">
            <div class="deployment-header">
              <div class="deployment-title">
                <h3>Version {{ deployment.update_version || 'inconnue' }}</h3>
                <span class="badge" [class]="'badge-' + getDeploymentStatusBadge(deployment.status)">
                  {{ getDeploymentStatusLabel(deployment.status) }}
                </span>
              </div>
              <div class="deployment-meta">
                {{ deployment.target_type === 'site' ? '🖥️' : '👥' }}
                {{ deployment.target_name }}
              </div>
            </div>

            <div class="deployment-progress">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  [class]="'progress-' + deployment.status"
                  [style.width.%]="deployment.progress"
                ></div>
              </div>
              <div class="progress-label">
                <span>{{ deployment.deployed_count }} / {{ deployment.total_count }} sites</span>
                <span>{{ deployment.progress }}%</span>
              </div>
            </div>

            <div class="deployment-footer">
              <span class="deployment-date">Démarré: {{ formatDate(deployment.created_at) }}</span>
              <span *ngIf="deployment.completed_at" class="deployment-completed">
                Terminé: {{ formatDate(deployment.completed_at) }}
              </span>
            </div>
          </div>
        </div>

        <ng-template #noDeployments>
          <div class="empty-state card">
            <div class="empty-icon">📊</div>
            <h3>Aucun déploiement</h3>
            <p>L'historique de vos déploiements de mises à jour apparaîtra ici.</p>
          </div>
        </ng-template>
      </div>

      <!-- Versions Tab -->
      <div class="tab-content" *ngIf="activeTab === 'versions'">
        <div class="versions-summary card">
          <h2>Distribution des versions</h2>
          <div class="versions-chart">
            <div class="version-bar" *ngFor="let version of getVersionDistribution()">
              <div class="version-info">
                <span class="version-label">v{{ version.version }}</span>
                <span class="version-count">{{ version.count }} sites</span>
              </div>
              <div class="bar-container">
                <div class="bar-fill" [style.width.%]="version.percentage"></div>
              </div>
            </div>
            <div *ngIf="getVersionDistribution().length === 0" class="empty-versions">
              Aucun site enregistré
            </div>
          </div>
        </div>
      </div>

      <!-- Create Update Modal -->
      <div class="modal" *ngIf="showCreateModal" (click)="showCreateModal = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Nouvelle version</h2>
            <button class="modal-close" (click)="showCreateModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Numéro de version *</label>
              <input type="text" [(ngModel)]="createForm.version" placeholder="Ex: 2.1.0">
            </div>
            <div class="form-group">
              <label>Description courte *</label>
              <input type="text" [(ngModel)]="createForm.description" placeholder="Ex: Correction de bugs et améliorations">
            </div>
            <div class="form-group">
              <label>Notes de version</label>
              <textarea [(ngModel)]="createForm.release_notes" rows="5" placeholder="Détails des changements..."></textarea>
            </div>
            <div class="form-group">
              <label>Package de mise à jour *</label>
              <input type="file" accept=".tar.gz,.zip" (change)="onUpdateFileSelected($event)">
              <div class="file-info" *ngIf="createForm.file">
                {{ createForm.file.name }} ({{ formatFileSize(createForm.file.size) }})
              </div>
            </div>
            <label class="checkbox-option">
              <input type="checkbox" [(ngModel)]="createForm.is_critical" />
              <div class="option-content">
                <div class="option-title">Mise à jour critique</div>
                <div class="option-desc">Marquer cette version comme prioritaire</div>
              </div>
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCreateModal = false">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="createUpdate()"
              [disabled]="!canCreate()"
            >
              Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 2rem;
      color: #0f172a;
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #64748b;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: -2px;
    }

    .tab:hover {
      color: #334155;
      background: #f8fafc;
    }

    .tab.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .tab-content {
      animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .content-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .content-header h2 {
      font-size: 1.5rem;
      margin: 0;
      color: #0f172a;
    }

    .updates-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .update-card {
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .update-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .update-header {
      margin-bottom: 1rem;
    }

    .update-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .update-title h3 {
      margin: 0;
      font-size: 1.25rem;
      color: #0f172a;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .update-meta {
      font-size: 0.875rem;
      color: #64748b;
    }

    .update-description {
      color: #475569;
      margin: 0 0 1rem 0;
      line-height: 1.5;
    }

    .update-notes {
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .notes-header {
      padding: 0.75rem 1rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .notes-header:hover {
      background: #f1f5f9;
    }

    .toggle-icon {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .notes-content {
      padding: 1rem;
      border-top: 1px solid #e2e8f0;
      white-space: pre-wrap;
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.6;
    }

    .update-actions {
      display: flex;
      gap: 0.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn-lg {
      padding: 0.875rem 2rem;
      font-size: 1rem;
    }

    .btn-icon {
      background: none;
      border: none;
      padding: 0.5rem;
      cursor: pointer;
      font-size: 1.25rem;
      opacity: 0.7;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .btn-icon:hover {
      opacity: 1;
      background: #f1f5f9;
    }

    .btn-icon.btn-danger:hover {
      background: #fee2e2;
      color: #ef4444;
    }

    .deploy-wizard {
      max-width: 800px;
      margin: 0 auto;
    }

    .deploy-wizard h2 {
      margin: 0 0 2rem 0;
      font-size: 1.5rem;
      color: #0f172a;
    }

    .wizard-step {
      margin-bottom: 2rem;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .step-number {
      width: 36px;
      height: 36px;
      background: #2563eb;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      flex-shrink: 0;
    }

    .step-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .form-select {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      background: white;
    }

    .form-select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .warning-message {
      margin-top: 0.75rem;
      padding: 0.75rem 1rem;
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      color: #92400e;
      font-size: 0.875rem;
    }

    .target-type-selector {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .radio-card {
      position: relative;
      cursor: pointer;
    }

    .radio-card input[type="radio"] {
      position: absolute;
      opacity: 0;
    }

    .radio-content {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .radio-card input[type="radio"]:checked + .radio-content {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .radio-card:hover .radio-content {
      border-color: #cbd5e1;
    }

    .radio-icon {
      font-size: 2rem;
    }

    .radio-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .radio-desc {
      font-size: 0.75rem;
      color: #64748b;
    }

    .checkbox-option {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 1rem;
      transition: background 0.2s;
    }

    .checkbox-option:hover {
      background: #f8fafc;
    }

    .checkbox-option input[type="checkbox"] {
      margin-top: 0.25rem;
      cursor: pointer;
    }

    .option-content {
      flex: 1;
    }

    .option-title {
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .option-desc {
      font-size: 0.875rem;
      color: #64748b;
    }

    .wizard-actions {
      display: flex;
      justify-content: center;
      margin-top: 3rem;
    }

    .deployments-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .deployment-card {
      transition: transform 0.2s;
    }

    .deployment-card:hover {
      transform: translateY(-2px);
    }

    .deployment-header {
      margin-bottom: 1rem;
    }

    .deployment-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .deployment-title h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .deployment-meta {
      font-size: 0.875rem;
      color: #64748b;
    }

    .deployment-progress {
      margin-bottom: 1rem;
    }

    .progress-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }

    .progress-fill {
      height: 100%;
      transition: width 0.3s ease;
      border-radius: 4px;
    }

    .progress-fill.progress-pending { background: #94a3b8; }
    .progress-fill.progress-in_progress { background: #2563eb; }
    .progress-fill.progress-completed { background: #10b981; }
    .progress-fill.progress-failed { background: #ef4444; }

    .progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
    }

    .deployment-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #94a3b8;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .versions-chart {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .version-bar {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .version-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .version-label {
      font-weight: 600;
      color: #0f172a;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .version-count {
      color: #64748b;
    }

    .bar-container {
      height: 32px;
      background: #f1f5f9;
      border-radius: 8px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #1d4ed8);
      border-radius: 8px;
      transition: width 0.3s ease;
    }

    .empty-versions {
      text-align: center;
      padding: 3rem;
      color: #94a3b8;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .empty-state p {
      color: #64748b;
      margin-bottom: 2rem;
    }

    /* Modal */
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

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #334155;
    }

    .form-group input[type="text"],
    .form-group input[type="file"],
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group textarea {
      resize: vertical;
      min-height: 100px;
    }

    .file-info {
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f8fafc;
      border-radius: 6px;
      font-size: 0.875rem;
      color: #64748b;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    @media (max-width: 768px) {
      .target-type-selector {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class UpdatesManagementComponent implements OnInit, OnDestroy {
  activeTab: 'updates' | 'deploy' | 'history' | 'versions' = 'updates';

  updates: SoftwareUpdate[] = [];
  deployments: UpdateDeployment[] = [];
  sites: Site[] = [];
  groups: Group[] = [];

  showCreateModal = false;
  expandedNotes = new Set<string>();

  createForm = {
    version: '',
    description: '',
    release_notes: '',
    file: null as File | null,
    is_critical: false
  };

  deployForm = {
    updateId: '',
    targetType: 'site' as 'site' | 'group',
    targetId: '',
    autoRollback: true,
    scheduleReboot: false
  };

  private subscriptions = new Subscription();

  constructor(
    private apiService: ApiService,
    private sitesService: SitesService,
    private groupsService: GroupsService,
    private socketService: SocketService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadUpdates();
    this.loadDeployments();
    this.loadSites();
    this.loadGroups();
    this.subscribeToDeploymentProgress();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadUpdates(): void {
    this.apiService.get<SoftwareUpdate[]>('/updates').subscribe({
      next: (updates) => {
        this.updates = updates;
      },
      error: (error) => {
        console.error('Error loading updates:', error);
      }
    });
  }

  loadDeployments(): void {
    this.apiService.get<UpdateDeployment[]>('/update-deployments').subscribe({
      next: (deployments) => {
        this.deployments = deployments;
      },
      error: (error) => {
        console.error('Error loading deployments:', error);
      }
    });
  }

  loadSites(): void {
    this.sitesService.loadSites().subscribe({
      next: (response) => {
        this.sites = response.sites;
      }
    });
  }

  loadGroups(): void {
    this.groupsService.loadGroups().subscribe({
      next: (response) => {
        this.groups = response.groups;
      }
    });
  }

  subscribeToDeploymentProgress(): void {
    const sub = this.socketService.on('update_progress').subscribe(event => {
      const data = event as {
        deploymentId: string;
        progress: number;
        deployedCount: number;
        status: UpdateDeployment['status'];
      };
      const deployment = this.deployments.find(d => d.id === data.deploymentId);
      if (deployment) {
        deployment.progress = data.progress;
        deployment.deployed_count = data.deployedCount;
        deployment.status = data.status;
      }
    });
    this.subscriptions.add(sub);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggleNotes(updateId: string): void {
    if (this.expandedNotes.has(updateId)) {
      this.expandedNotes.delete(updateId);
    } else {
      this.expandedNotes.add(updateId);
    }
  }

  isNotesExpanded(updateId: string): boolean {
    return this.expandedNotes.has(updateId);
  }

  onUpdateFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.createForm.file = file;
    }
  }

  canCreate(): boolean {
    return !!(this.createForm.version && this.createForm.description && this.createForm.file);
  }

  createUpdate(): void {
    if (!this.canCreate()) return;

    const formData = new FormData();
    formData.append('version', this.createForm.version);
    formData.append('description', this.createForm.description);
    formData.append('release_notes', this.createForm.release_notes);
    formData.append('is_critical', String(this.createForm.is_critical));
    formData.append('package', this.createForm.file!);

    this.apiService.post<SoftwareUpdate>('/updates', formData).subscribe({
      next: (update) => {
        this.updates.unshift(update);
        this.showCreateModal = false;
        this.createForm = { version: '', description: '', release_notes: '', file: null, is_critical: false };
      },
      error: (error) => {
        this.notificationService.error('Erreur lors de la création: ' + (error.error?.error || error.message));
      }
    });
  }

  deleteUpdate(update: SoftwareUpdate): void {
    if (confirm(`Supprimer la version ${update.version} ?`)) {
      this.apiService.delete(`/updates/${update.id}`).subscribe({
        next: () => {
          this.updates = this.updates.filter(u => u.id !== update.id);
        },
        error: (error) => {
          this.notificationService.error('Erreur lors de la suppression: ' + (error.error?.error || error.message));
        }
      });
    }
  }

  deployUpdate(update: SoftwareUpdate): void {
    this.deployForm.updateId = update.id;
    this.activeTab = 'deploy';
  }

  selectedUpdate(): SoftwareUpdate | undefined {
    return this.updates.find(u => u.id === this.deployForm.updateId);
  }

  canDeploy(): boolean {
    return !!(this.deployForm.updateId && this.deployForm.targetType && this.deployForm.targetId);
  }

  startDeployment(): void {
    if (!this.canDeploy()) return;

    const data = {
      update_id: this.deployForm.updateId,
      target_type: this.deployForm.targetType,
      target_id: this.deployForm.targetId,
      auto_rollback: this.deployForm.autoRollback,
      schedule_reboot: this.deployForm.scheduleReboot
    };

    this.apiService.post<UpdateDeployment>('/update-deployments', data).subscribe({
      next: (deployment) => {
        this.deployments.unshift(deployment);
        this.activeTab = 'history';
        this.deployForm = {
          updateId: '',
          targetType: 'site',
          targetId: '',
          autoRollback: true,
          scheduleReboot: false
        };
        this.notificationService.success('Déploiement lancé avec succès !');
      },
      error: (error) => {
        this.notificationService.error('Erreur lors du déploiement: ' + (error.error?.error || error.message));
      }
    });
  }

  getDeploymentStatusBadge(status: string): string {
    const badges: Record<string, string> = {
      pending: 'secondary',
      in_progress: 'primary',
      completed: 'success',
      failed: 'danger'
    };
    return badges[status] || 'secondary';
  }

  getDeploymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'En attente',
      in_progress: 'En cours',
      completed: 'Terminé',
      failed: 'Échoué'
    };
    return labels[status] || status;
  }

  getVersionDistribution(): { version: string; count: number; percentage: number }[] {
    const versionMap = new Map<string, number>();
    this.sites.forEach(site => {
      const version = site.software_version || 'unknown';
      versionMap.set(version, (versionMap.get(version) || 0) + 1);
    });

    const total = this.sites.length;
    return Array.from(versionMap.entries())
      .map(([version, count]) => ({
        version,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }
}
