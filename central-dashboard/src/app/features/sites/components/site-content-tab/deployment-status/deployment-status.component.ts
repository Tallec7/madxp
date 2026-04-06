import { Component, Input, Output, EventEmitter, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, filter, take } from 'rxjs';
import { SitesService, PendingDeployment } from '../../../../../core/services/sites.service';
import { SiteCommandService } from '../../../../../core/services/site-command.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { LoggerService } from '../../../../../core/services/logger.service';
import { SocketService } from '../../../../../core/services/socket.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import { SiteConfiguration, ConfigDiff, ConfigProfile } from '../../../../../core/models';
import { OrchestratedDeploymentProgress } from '../../../../../core/services/draft.service';
import { HumanReadableDiff } from '../content-tab.models';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-deployment-status',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Orchestrated Deployment Progress -->
    <div class="orchestrated-deployment" *ngIf="siteType !== 'saas' && orchestratedDeployment">
      <div class="deployment-header">
        <span class="deployment-icon">🚀</span>
        <span class="deployment-title">Déploiement en cours</span>
        <span class="deployment-status" [class]="'status-' + orchestratedDeployment.status">
          {{ getDeploymentStatusText(orchestratedDeployment.status) }}
        </span>
      </div>
      <div class="deployment-progress">
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="orchestratedDeployment.overallProgress"></div>
        </div>
        <span class="progress-text">{{ orchestratedDeployment.overallProgress }}%</span>
      </div>
      <div class="deployment-details">
        <span *ngIf="orchestratedDeployment.totalVideos > 0">
          Vidéos: {{ orchestratedDeployment.videosCompleted }}/{{ orchestratedDeployment.totalVideos }}
          <span *ngIf="orchestratedDeployment.videosFailed > 0" class="failed-count">
            ({{ orchestratedDeployment.videosFailed }} échoué(s))
          </span>
        </span>
        <span *ngIf="orchestratedDeployment.configDeployed">✅ Configuration appliquée</span>
      </div>
      <div class="deployment-error" *ngIf="orchestratedDeployment.errorMessage">
        {{ orchestratedDeployment.errorMessage }}
      </div>
    </div>

    <!-- Pending Deployments (Pi only) -->
    <div class="pending-deployments" *ngIf="siteType !== 'saas' && pendingDeployments.length > 0">
      <div class="pending-header">
        <span class="pending-icon">⏳</span>
        <span class="pending-title">{{ 'content.pendingDeployments' | translate }} ({{ pendingDeployments.length }})</span>
        <button class="btn btn-sm btn-outline" (click)="onRefreshPendingDeployments()" [disabled]="loadingPendingDeployments">
          {{ loadingPendingDeployments ? '⏳' : '🔄' }}
        </button>
      </div>
      <div class="pending-list">
        <div class="pending-item" *ngFor="let deployment of pendingDeployments">
          <span class="pending-video">{{ deployment.video_title || deployment.filename }}</span>
          <span class="secondary-variant-badge" *ngIf="deployment.has_secondary_variant" title="Inclut la variante écran secondaire">📺 2nd</span>
          <span class="pending-status" [class]="'status-' + deployment.status">
            {{ deployment.status === 'pending' ? ('⏳ ' + ('content.statusPending' | translate)) : ('🚀 ' + ('content.statusInProgress' | translate)) }}
          </span>
          <span class="pending-progress" *ngIf="deployment.status === 'in_progress'">
            {{ deployment.progress }}%
          </span>
          <span class="pending-date">{{ deployment.created_at | date:'short' }}</span>
          <button
            class="btn btn-sm btn-danger-outline"
            (click)="onCancelPendingDeployment(deployment)"
            [disabled]="cancellingDeploymentId === deployment.id"
            [title]="'content.cancelDeployment' | translate"
          >
            {{ cancellingDeploymentId === deployment.id ? '⏳' : '✕' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Deploy Status Banner -->
    <div class="deploy-status-banner" *ngIf="deployStatus !== 'idle'" [class]="'status-' + deployStatus">
      <div class="status-icon">
        <span *ngIf="deployStatus === 'sending'">📤</span>
        <span *ngIf="deployStatus === 'pending'">⏳</span>
        <span *ngIf="deployStatus === 'success'">✅</span>
        <span *ngIf="deployStatus === 'error'">❌</span>
        <span *ngIf="deployStatus === 'timeout'">⏱️</span>
      </div>
      <div class="status-content">
        <span class="status-text" *ngIf="deployStatus === 'sending'">{{ siteType === 'saas' ? 'Enregistrement de la configuration...' : 'Envoi de la configuration...' }}</span>
        <span class="status-text" *ngIf="deployStatus === 'pending'">{{ siteType === 'saas' ? 'Enregistrement en cours...' : 'En attente de confirmation du Pi...' }}</span>
        <span class="status-text" *ngIf="deployStatus === 'success'">{{ siteType === 'saas' ? 'Configuration enregistrée avec succès !' : 'Configuration appliquée avec succès !' }}</span>
        <span class="status-text" *ngIf="deployStatus === 'error'">Erreur : {{ deployError }}</span>
        <span class="status-text" *ngIf="deployStatus === 'timeout'">{{ deployError }}</span>
      </div>
      <button class="status-close" *ngIf="deployStatus !== 'sending' && deployStatus !== 'pending'" (click)="resetDeployStatus()">×</button>
    </div>

    <!-- Validation Warnings -->
    <div class="validation-warnings" *ngIf="isDirty && validationWarnings.length > 0">
      <div class="validation-warning" *ngFor="let w of validationWarnings">
        <span>⚠️</span> {{ w }}
      </div>
    </div>

    <!-- Actions Bar -->
    <div class="actions-bar" *ngIf="isDirty" [class.has-errors]="validationErrors.length > 0">
      <div class="actions-status">
        <span class="dirty-indicator">⚠️ Modifications non enregistrées</span>
        <span class="error-count" *ngIf="validationErrors.length > 0">
          ❌ {{ validationErrors.length }} erreur(s) de validation
        </span>
      </div>
      <div class="actions-buttons">
        <button class="btn btn-secondary" (click)="resetRequested.emit()">{{ 'common.cancel' | translate }}</button>
        <button class="btn btn-primary" (click)="onPreviewDeploy()" [disabled]="deploying || validationErrors.length > 0">
          {{ deploying ? (siteType === 'saas' ? ('common.saving' | translate) : ('common.deploying' | translate)) : (siteType === 'saas' ? ('common.save' | translate) : (isConnected ? ('common.deploy' | translate) : ('common.deployQueued' | translate))) }}
        </button>
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
          <div class="mode-selector" *ngIf="siteType !== 'saas'">
            <div class="mode-title">Mode de déploiement</div>
            <div class="mode-options">
              <label class="mode-option" [class.active]="deployMode === 'merge'">
                <input type="radio" name="deployMode" value="merge" [(ngModel)]="deployMode" />
                <div class="mode-option-content">
                  <span class="mode-option-title">🔀 Fusionner (recommandé)</span>
                  <span class="mode-option-desc">Préserve les paramètres locaux du Pi (langue, timezone, etc.)</span>
                </div>
              </label>
              <label class="mode-option" [class.active]="deployMode === 'replace'">
                <input type="radio" name="deployMode" value="replace" [(ngModel)]="deployMode" />
                <div class="mode-option-content">
                  <span class="mode-option-title">🔄 Remplacer</span>
                  <span class="mode-option-desc">Écrase tout - utilisez si les modifications ne s'appliquent pas</span>
                </div>
              </label>
            </div>
            <div class="mode-help" *ngIf="deployMode === 'merge'">
              <span class="mode-help-icon">💡</span>
              <span class="mode-help-text">
                Si vos modifications ne s'appliquent pas après le déploiement, essayez le mode <strong>Remplacer</strong>
                ou mettez à jour le sync-agent depuis l'onglet <strong>Paramètres</strong>.
              </span>
            </div>
            <div class="mode-warning" *ngIf="deployMode === 'replace'">
              <span class="mode-warning-icon">⚠️</span>
              <span class="mode-warning-text">
                Ce mode écrase les paramètres locaux du Pi. Les vidéos ajoutées localement par le club seront perdues.
              </span>
            </div>
          </div>

          <div *ngIf="diffLoading" class="loading-inline">
            <div class="spinner-small"></div>
            <span>Calcul des différences...</span>
          </div>
          <div *ngIf="!diffLoading && humanReadableDiff.length === 0" class="no-changes">
            Aucun changement détecté par rapport à la configuration actuelle
          </div>
          <div *ngIf="!diffLoading && humanReadableDiff.length > 0" class="diff-list">
            <div class="diff-summary">
              <div class="diff-total">{{ humanReadableDiff.length }} changement(s)</div>
              <div class="diff-pill added" *ngIf="diffCounts.added > 0">+ {{ diffCounts.added }} ajout(s)</div>
              <div class="diff-pill changed" *ngIf="diffCounts.changed > 0">~ {{ diffCounts.changed }} modif(s)</div>
              <div class="diff-pill removed" *ngIf="diffCounts.removed > 0">- {{ diffCounts.removed }} suppression(s)</div>
            </div>

            <div class="diff-section" *ngFor="let group of groupedDiff">
              <div class="diff-section-header">
                <span class="diff-section-icon">{{ group.icon }}</span>
                <span class="diff-section-title">{{ group.section }}</span>
                <span class="diff-section-count">{{ group.items.length }}</span>
              </div>
              <div class="diff-section-items">
                <div class="diff-item-compact" *ngFor="let diff of group.items; let i = index" [class]="'diff-' + diff.type">
                  <div class="diff-badge-icon">
                    <span *ngIf="diff.type === 'added'" class="badge-icon added">+</span>
                    <span *ngIf="diff.type === 'removed'" class="badge-icon removed">−</span>
                    <span *ngIf="diff.type === 'changed'" class="badge-icon changed">~</span>
                  </div>
                  <div class="diff-item-content">
                    <div class="diff-item-header">
                      <div class="diff-item-label">{{ diff.label }}</div>
                      <button
                        class="diff-toggle-btn"
                        *ngIf="diff.oldValue || diff.newValue"
                        (click)="toggleDiffDetail(group.section + '-' + i)"
                      >
                        {{ expandedDiffItems[group.section + '-' + i] ? '▼' : '▶' }} Détails
                      </button>
                    </div>
                    <div class="diff-item-summary">{{ diff.summary }}</div>

                    <div class="diff-detail" *ngIf="expandedDiffItems[group.section + '-' + i]">
                      <div class="diff-detail-row" *ngIf="diff.type === 'changed' || diff.type === 'removed'">
                        <span class="diff-detail-label">Avant:</span>
                        <pre class="diff-detail-value old">{{ formatDiffValue(diff.oldValue) }}</pre>
                      </div>
                      <div class="diff-detail-row" *ngIf="diff.type === 'changed' || diff.type === 'added'">
                        <span class="diff-detail-label">Après:</span>
                        <pre class="diff-detail-value new">{{ formatDiffValue(diff.newValue) }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showDiffModal = false">{{ 'common.cancel' | translate }}</button>
          <button
            class="btn btn-primary"
            (click)="onConfirmDeploy()"
            [disabled]="deploying"
          >
            {{ deploying ? (siteType === 'saas' ? ('common.saving' | translate) : ('common.deploying' | translate)) : (siteType === 'saas' ? ('common.confirmSave' | translate) : ('common.confirmDeploy' | translate)) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .deploy-status-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .deploy-status-banner.status-sending, .deploy-status-banner.status-pending {
      background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
    }
    .deploy-status-banner.status-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .deploy-status-banner.status-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .deploy-status-banner.status-timeout { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }

    .status-icon { font-size: 1.25rem; flex-shrink: 0; }
    .status-content { flex: 1; }
    .status-text { font-weight: 500; }

    .status-close {
      background: none; border: none; font-size: 1.25rem; cursor: pointer; opacity: 0.6; padding: 0; line-height: 1;
    }
    .status-close:hover { opacity: 1; }

    .status-pending .status-icon { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .orchestrated-deployment {
      padding: 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 1rem;
    }
    .deployment-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .deployment-icon { font-size: 1.25rem; }
    .deployment-title { font-weight: 600; flex: 1; }
    .deployment-status { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 500; }
    .deployment-status.status-pending, .deployment-status.status-deploying_videos { background: #fef3c7; color: #92400e; }
    .deployment-status.status-deploying_config { background: #dbeafe; color: #1e40af; }
    .deployment-status.status-completed { background: #dcfce7; color: #166534; }
    .deployment-status.status-partial_failure { background: #fef3c7; color: #92400e; }
    .deployment-status.status-failed { background: #fee2e2; color: #991b1b; }

    .deployment-progress { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
    .deployment-progress .progress-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .deployment-progress .progress-fill { height: 100%; background: #22c55e; transition: width 0.3s ease; }
    .deployment-progress .progress-text { font-size: 0.875rem; font-weight: 600; color: #166534; min-width: 40px; text-align: right; }

    .deployment-details { display: flex; gap: 1rem; font-size: 0.8125rem; color: #475569; }
    .deployment-details .failed-count { color: #dc2626; }
    .deployment-error { margin-top: 0.5rem; padding: 0.5rem; background: #fee2e2; border-radius: 4px; font-size: 0.8125rem; color: #991b1b; }

    .pending-deployments { padding: 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-bottom: 1rem; }
    .pending-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .pending-icon { font-size: 1.25rem; }
    .pending-title { font-weight: 600; flex: 1; color: #92400e; }
    .pending-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .pending-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: white; border-radius: 6px; border: 1px solid #fde68a; }
    .pending-video { flex: 1; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pending-status { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 500; }
    .pending-status.status-pending { background: #fef3c7; color: #92400e; }
    .pending-status.status-in_progress { background: #dbeafe; color: #1e40af; }
    .pending-progress { font-size: 0.75rem; font-weight: 600; color: #1e40af; min-width: 35px; text-align: right; }
    .pending-date { font-size: 0.75rem; color: #64748b; min-width: 90px; }

    .secondary-variant-badge {
      display: inline-block; font-size: 0.7rem; color: #1e40af; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 4px; padding: 0.1rem 0.35rem; font-weight: 600;
    }

    .btn-danger-outline {
      padding: 0.25rem 0.5rem; background: transparent; border: 1px solid #fecaca; color: #dc2626; border-radius: 4px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s ease;
    }
    .btn-danger-outline:hover:not(:disabled) { background: #fee2e2; border-color: #dc2626; }
    .btn-danger-outline:disabled { opacity: 0.5; cursor: not-allowed; }

    .validation-warnings { margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.375rem; }
    .validation-warning { display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.75rem; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; font-size: 0.8125rem; color: #92400e; }

    .actions-bar {
      display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background: #fef3c7; border-radius: 8px; border: 1px solid #fde047; position: sticky; bottom: 1rem;
    }
    .actions-bar.has-errors { background: #fef2f2; border-color: #fecaca; }
    .actions-status { display: flex; flex-direction: column; gap: 0.25rem; }
    .dirty-indicator { font-size: 0.875rem; font-weight: 500; color: #92400e; }
    .has-errors .dirty-indicator { color: #dc2626; }
    .error-count { font-size: 0.8125rem; color: #dc2626; }
    .actions-buttons { display: flex; gap: 0.5rem; }

    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 2rem; }
    .modal-content { background: white; border-radius: 12px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .modal-content.modal-large { max-width: 800px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid #e2e8f0; }
    .modal-header h2 { margin: 0; font-size: 1.25rem; }
    .modal-close { background: none; border: none; font-size: 2rem; color: #94a3b8; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
    .modal-close:hover { background: #f1f5f9; color: #64748b; }
    .modal-body { padding: 1.5rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 1rem; padding: 1.5rem; border-top: 1px solid #e2e8f0; }

    .mode-selector { margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0; }
    .mode-title { font-weight: 600; font-size: 0.875rem; color: #374151; margin-bottom: 0.75rem; }
    .mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .mode-option { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.75rem; border: 2px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
    .mode-option:hover { border-color: #cbd5e1; }
    .mode-option.active { border-color: #2563eb; background: #eff6ff; }
    .mode-option input[type="radio"] { margin-top: 2px; }
    .mode-option-content { display: flex; flex-direction: column; gap: 0.25rem; }
    .mode-option-title { font-weight: 600; font-size: 0.875rem; color: #1e293b; }
    .mode-option-desc { font-size: 0.75rem; color: #64748b; line-height: 1.4; }

    .mode-help, .mode-warning { display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 0.75rem; padding: 0.75rem; border-radius: 6px; font-size: 0.8125rem; line-height: 1.4; }
    .mode-help { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
    .mode-warning { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; }
    .mode-help-icon, .mode-warning-icon { flex-shrink: 0; font-size: 1rem; }
    .mode-help-text, .mode-warning-text { flex: 1; }
    .mode-help-text strong, .mode-warning-text strong { font-weight: 600; }

    .loading-inline { display: flex; align-items: center; gap: 0.75rem; padding: 2rem; justify-content: center; color: #64748b; }
    .spinner-small { width: 20px; height: 20px; border: 2px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .no-changes { text-align: center; padding: 2rem; color: #64748b; background: #f8fafc; border-radius: 8px; }

    .diff-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .diff-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1rem; margin-bottom: 0.5rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .diff-total { font-weight: 600; color: #0f172a; }
    .diff-pill { padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; }
    .diff-pill.added { background: #ecfdf3; color: #166534; border-color: #bbf7d0; }
    .diff-pill.changed { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
    .diff-pill.removed { background: #fef2f2; color: #b91c1c; border-color: #fecdd3; }

    .diff-section { margin-bottom: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .diff-section:last-child { margin-bottom: 0; }
    .diff-section-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .diff-section-icon { font-size: 1rem; }
    .diff-section-title { font-weight: 600; font-size: 0.875rem; color: #1e293b; flex: 1; }
    .diff-section-count { background: #e2e8f0; color: #475569; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .diff-section-items { padding: 0.5rem; }

    .diff-item-compact { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 6px; margin-bottom: 0.25rem; }
    .diff-item-compact:last-child { margin-bottom: 0; }
    .diff-item-compact.diff-added { background: #f0fdf4; }
    .diff-item-compact.diff-removed { background: #fef2f2; }
    .diff-item-compact.diff-changed { background: #fffbeb; }

    .diff-badge-icon { flex-shrink: 0; margin-top: 2px; }
    .badge-icon { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; font-size: 0.875rem; font-weight: 700; }
    .badge-icon.added { background: #dcfce7; color: #166534; }
    .badge-icon.removed { background: #fee2e2; color: #991b1b; }
    .badge-icon.changed { background: #fef3c7; color: #92400e; }

    .diff-item-content { flex: 1; min-width: 0; }
    .diff-item-label { font-size: 0.8125rem; color: #1e293b; font-weight: 500; line-height: 1.4; }
    .diff-item-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .diff-item-summary { font-size: 0.75rem; color: #64748b; margin-top: 0.125rem; }

    .diff-toggle-btn { background: none; border: none; padding: 0.125rem 0.375rem; font-size: 0.6875rem; color: #64748b; cursor: pointer; border-radius: 4px; white-space: nowrap; }
    .diff-toggle-btn:hover { background: rgba(0,0,0,0.05); color: #475569; }

    .diff-detail { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #e2e8f0; }
    .diff-detail-row { margin-bottom: 0.5rem; }
    .diff-detail-row:last-child { margin-bottom: 0; }
    .diff-detail-label { font-size: 0.6875rem; color: #94a3b8; font-weight: 500; display: block; margin-bottom: 0.25rem; }
    .diff-detail-value { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.75rem; padding: 0.5rem; border-radius: 4px; margin: 0; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; }
    .diff-detail-value.old { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .diff-detail-value.new { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

    .btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
    .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
    .btn-primary { background: #2563eb; color: white; border: none; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: white; color: #475569; border: 1px solid #e2e8f0; }
    .btn-secondary:hover { background: #f8fafc; }
    .btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
    .btn-outline:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; }
    .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class DeploymentStatusComponent implements OnDestroy {
  @Input() siteId!: string;
  @Input() siteType: string = '';
  @Input() isConnected = false;
  @Input() config!: SiteConfiguration;
  @Input() isDirty = false;
  @Input() validationErrors: string[] = [];
  @Input() validationWarnings: string[] = [];
  @Input() contentProfiles: ConfigProfile[] = [];
  @Input() selectedProfileId = '';
  @Input() pendingDeployments: PendingDeployment[] = [];
  @Input() loadingPendingDeployments = false;
  @Input() orchestratedDeployment: OrchestratedDeploymentProgress | null = null;

  @Output() deployed = new EventEmitter<void>();
  @Output() deployStarted = new EventEmitter<void>();
  @Output() resetRequested = new EventEmitter<void>();
  @Output() pendingDeploymentsRefresh = new EventEmitter<void>();
  @Output() pendingDeploymentCancel = new EventEmitter<PendingDeployment>();
  @Output() configSynced = new EventEmitter<string>();

  deploying = false;
  deployStatus: 'idle' | 'sending' | 'pending' | 'success' | 'error' | 'timeout' = 'idle';
  deployError: string | null = null;
  deployMode: 'merge' | 'replace' = 'merge';

  showDiffModal = false;
  diffLoading = false;
  rawDiffItems: ConfigDiff[] = [];
  expandedDiffItems: Record<string, boolean> = {};

  cancellingDeploymentId: string | null = null;

  private deploySubscription: Subscription | null = null;
  private deployTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private deployCommandId: string | null = null;

  private readonly INTERNAL_PROPERTIES = ['owner', 'locked', 'type'];

  get humanReadableDiff(): HumanReadableDiff[] {
    return this.rawDiffItems
      .map(item => this.transformDiffItem(item))
      .filter(item => !item.isInternal);
  }

  get diffCounts() {
    return this.humanReadableDiff.reduce(
      (acc, item) => { acc[item.type]++; return acc; },
      { added: 0, changed: 0, removed: 0 }
    );
  }

  get groupedDiff(): { section: string; icon: string; items: HumanReadableDiff[] }[] {
    const groups: Map<string, { icon: string; items: HumanReadableDiff[] }> = new Map();
    for (const item of this.humanReadableDiff) {
      const section = this.getSectionFromLabel(item.label);
      if (!groups.has(section.name)) groups.set(section.name, { icon: section.icon, items: [] });
      groups.get(section.name)!.items.push(item);
    }
    return Array.from(groups.entries()).map(([section, data]) => ({ section, icon: data.icon, items: data.items }));
  }

  constructor(
    private sitesService: SitesService,
    private commandService: SiteCommandService,
    private notificationService: NotificationService,
    private logger: LoggerService,
    private socketService: SocketService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.deploySubscription?.unsubscribe();
    if (this.deployTimeoutId) clearTimeout(this.deployTimeoutId);
  }

  getDeploymentStatusText(status: string): string {
    const statusTexts: Record<string, string> = {
      'pending': 'En attente', 'deploying_videos': 'Déploiement vidéos', 'deploying_config': 'Application config',
      'completed': 'Terminé', 'partial_failure': 'Partiellement échoué', 'failed': 'Échec'
    };
    return statusTexts[status] || status;
  }

  resetDeployStatus(): void {
    this.deployStatus = 'idle';
    this.deployError = null;
    this.deployCommandId = null;
  }

  onRefreshPendingDeployments(): void {
    this.pendingDeploymentsRefresh.emit();
  }

  onCancelPendingDeployment(deployment: PendingDeployment): void {
    if (this.cancellingDeploymentId) return;
    this.cancellingDeploymentId = deployment.id;
    this.cdr.markForCheck();

    this.sitesService.cancelDeployment(deployment.id).subscribe({
      next: () => {
        this.cancellingDeploymentId = null;
        this.notificationService.success(`Déploiement de "${deployment.video_title || deployment.filename}" annulé`);
        this.pendingDeploymentCancel.emit(deployment);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cancellingDeploymentId = null;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  onPreviewDeploy(): void {
    this.showDiffModal = true;
    this.diffLoading = true;
    this.rawDiffItems = [];
    this.expandedDiffItems = {};
    this.cdr.markForCheck();

    this.sitesService.previewConfigDiff(this.siteId, this.config).subscribe({
      next: (response) => {
        this.rawDiffItems = response.diff || [];
        this.diffLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.rawDiffItems = [];
        this.diffLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onConfirmDeploy(): void {
    this.deploying = true;
    this.deployStatus = 'sending';
    this.deployError = null;
    this.cdr.markForCheck();
    this.deployStarted.emit();

    if (this.selectedProfileId && this.contentProfiles.length > 0) {
      this.confirmDeployProfile();
      return;
    }

    // SaaS sans profils : sauvegarde directe en DB
    if (this.siteType === 'saas') {
      this.confirmSaveSaas();
      return;
    }

    this.confirmDeployLegacy();
  }

  private confirmDeployProfile(): void {
    const configToSave: SiteConfiguration = {
      ...this.config,
      sponsors: this.config.sponsors,
      categories: this.config.categories,
      timeCategories: this.config.timeCategories,
      categoryMappings: this.config.categoryMappings,
    };

    this.sitesService.updateProfileConfiguration(this.siteId, this.selectedProfileId, configToSave).subscribe({
      next: (updatedProfile) => {
        this.configSynced.emit(updatedProfile.id);

        // SaaS : pas de Pi à synchroniser, la sauvegarde DB suffit
        if (this.siteType === 'saas') {
          this.deploying = false;
          this.deployStatus = 'success';
          this.showDiffModal = false;
          this.notificationService.success('Configuration enregistree !');
          this.deployed.emit();
          this.cdr.markForCheck();
          return;
        }

        this.sitesService.syncProfiles(this.siteId).subscribe({
          next: () => {
            this.deploying = false;
            this.deployStatus = 'success';
            this.showDiffModal = false;
            this.notificationService.success('Configuration sauvegardee et profils synchronises !');
            this.deployed.emit();
            this.cdr.markForCheck();
          },
          error: (syncError) => {
            this.deploying = false;
            this.deployStatus = 'error';
            const message = ErrorExtractor.getMessage(syncError);
            this.deployError = message;
            this.notificationService.warning('Configuration sauvegardee, mais la synchronisation vers le Pi a echoue.');
            this.deployed.emit();
            this.cdr.markForCheck();
          }
        });
      },
      error: (error) => {
        this.deploying = false;
        this.deployStatus = 'error';
        const message = ErrorExtractor.getMessage(error);
        this.deployError = message;
        this.logger.error('Failed to save profile configuration', { error: message, siteId: this.siteId, profileId: this.selectedProfileId });
        this.notificationService.error(`Erreur de sauvegarde: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  private confirmDeployLegacy(): void {
    const configToSend: Partial<SiteConfiguration> = {
      sponsors: this.config.sponsors,
      categories: this.config.categories,
      timeCategories: this.config.timeCategories,
      categoryMappings: this.config.categoryMappings
    };

    this.commandService.sendCommand(this.siteId, 'update_config', {
      neoProContent: configToSend,
      mode: this.deployMode
    }).subscribe({
      next: (response) => {
        if (response.commandId) {
          this.deployCommandId = response.commandId;
          if (response.queued && !response.sent) {
            this.deployStatus = 'pending';
            this.deploying = false;
            this.showDiffModal = false;
            this.notificationService.info('Configuration en file d\'attente. Elle sera appliquée à la reconnexion du Pi.');
            this.deployed.emit();
            this.cdr.markForCheck();
          } else {
            this.deployStatus = 'pending';
            this.waitForDeployResult(response.commandId);
            this.cdr.markForCheck();
          }
        } else {
          this.deploying = false;
          this.deployStatus = 'success';
          this.showDiffModal = false;
          this.notificationService.success('Configuration envoyée !');
          this.deployed.emit();
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        this.deploying = false;
        this.deployStatus = 'error';
        const message = ErrorExtractor.getMessage(error);
        this.deployError = message;
        this.logger.error('Failed to deploy config', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur d'envoi: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  private confirmSaveSaas(): void {
    const configToSave = {
      sponsors: this.config.sponsors,
      categories: this.config.categories,
      timeCategories: this.config.timeCategories,
      categoryMappings: this.config.categoryMappings,
    };

    this.sitesService.saveConfigDirect(this.siteId, configToSave as unknown as Record<string, unknown>).subscribe({
      next: () => {
        this.deploying = false;
        this.deployStatus = 'success';
        this.showDiffModal = false;
        this.notificationService.success('Configuration enregistree !');
        this.deployed.emit();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.deploying = false;
        this.deployStatus = 'error';
        const message = ErrorExtractor.getMessage(error);
        this.deployError = message;
        this.logger.error('Failed to save SaaS config', { error: message, siteId: this.siteId });
        this.notificationService.error(`Erreur de sauvegarde: ${message}`);
        this.cdr.markForCheck();
      }
    });
  }

  private waitForDeployResult(commandId: string): void {
    const DEPLOY_TIMEOUT = 45000;
    this.deploySubscription?.unsubscribe();
    if (this.deployTimeoutId) clearTimeout(this.deployTimeoutId);

    this.deployTimeoutId = setTimeout(() => {
      if (this.deployStatus === 'pending') {
        this.deploySubscription?.unsubscribe();
        this.deploying = false;
        this.deployStatus = 'timeout';
        this.deployError = 'Timeout: le Pi n\'a pas répondu dans les temps';
        this.notificationService.warning('Timeout: le Pi n\'a pas confirmé l\'application de la configuration');
        this.cdr.markForCheck();
      }
    }, DEPLOY_TIMEOUT);

    this.deploySubscription = this.socketService.on<{ siteId: string; commandId: string; status: string }>('command_completed')
      .pipe(filter(event => event.commandId === commandId), take(1))
      .subscribe(event => {
        if (this.deployTimeoutId) clearTimeout(this.deployTimeoutId);
        this.deploying = false;
        if (event.status === 'success' || event.status === 'completed') {
          this.deployStatus = 'success';
          this.showDiffModal = false;
          this.notificationService.success('Configuration appliquée avec succès sur le Pi !');
          this.deployed.emit();
        } else {
          this.deployStatus = 'error';
          this.deployError = 'Le Pi a signalé une erreur lors de l\'application';
          this.notificationService.error('Erreur: le Pi n\'a pas pu appliquer la configuration');
        }
        this.cdr.markForCheck();
      });

    const timeoutSub = this.socketService.on<{ siteId: string; commandId: string }>('command_timeout')
      .pipe(filter(event => event.commandId === commandId), take(1))
      .subscribe(() => {
        if (this.deployTimeoutId) clearTimeout(this.deployTimeoutId);
        this.deploySubscription?.unsubscribe();
        this.deploying = false;
        this.deployStatus = 'timeout';
        this.deployError = 'Le Pi n\'a pas répondu dans les temps';
        this.notificationService.warning('Timeout: le Pi ne répond pas');
        this.cdr.markForCheck();
      });

    this.deploySubscription.add(timeoutSub);
  }

  toggleDiffDetail(key: string): void {
    this.expandedDiffItems[key] = !this.expandedDiffItems[key];
  }

  formatDiffValue(value: unknown): string {
    if (value === null || value === undefined) return '(vide)';
    if (Array.isArray(value)) {
      return value.map((item, idx) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          if ('name' in obj || 'path' in obj) {
            const name = obj['name'] || '(sans nom)';
            const file = this.extractFilename(obj['path'] as string);
            return `  ${idx + 1}. ${name} → ${file}`;
          }
        }
        return `  ${idx + 1}. ${JSON.stringify(item)}`;
      }).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if ('name' in obj || 'path' in obj) {
        const name = obj['name'] || '(sans nom)';
        const file = this.extractFilename(obj['path'] as string);
        return `${name} → ${file}`;
      }
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  private transformDiffItem(item: ConfigDiff): HumanReadableDiff {
    const path = item.path;
    const lastSegment = path.split('.').pop() || '';
    if (this.INTERNAL_PROPERTIES.includes(lastSegment)) {
      return { label: '', type: item.type, summary: '', isInternal: true };
    }
    return {
      label: this.pathToHumanLabel(path),
      type: item.type,
      summary: this.generateSummary(item),
      oldValue: item.oldValue,
      newValue: item.newValue,
      isInternal: false
    };
  }

  private pathToHumanLabel(path: string): string {
    const parts = path.split('.');
    const labels: string[] = [];
    for (const part of parts) {
      if (part === 'sponsors' || part.startsWith('sponsors[')) {
        const match = part.match(/sponsors\[(\d+)\]/);
        if (match) {
          const idx = parseInt(match[1]);
          const sponsor = this.config.sponsors?.[idx];
          labels.push(`Boucle par défaut > ${sponsor?.name || `Vidéo ${idx + 1}`}`);
        } else { labels.push('Boucle par défaut'); }
        continue;
      }
      if (part.startsWith('categories[')) {
        const idMatch = part.match(/categories\[([^\]]+)\]/);
        if (idMatch) {
          const cat = this.config.categories?.find(c => c.id === idMatch[1]);
          labels.push(`Catégorie "${cat?.name || 'Sans nom'}"`);
        }
        continue;
      }
      if (part.startsWith('subCategories[')) {
        const idMatch = part.match(/subCategories\[([^\]]+)\]/);
        if (idMatch) {
          for (const cat of this.config.categories || []) {
            const sub = cat.subCategories?.find(s => s.id === idMatch[1]);
            if (sub) { labels.push(`Sous-catégorie "${sub.name || 'Sans nom'}"`); break; }
          }
        }
        continue;
      }
      if (part.startsWith('timeCategories[')) {
        const idMatch = part.match(/timeCategories\[([^\]]+)\]/);
        if (idMatch) { labels.push(`Phase "${idMatch[1]}"`); }
        continue;
      }
      if (part === 'categoryMappings') { labels.push('Mapping Analytics'); continue; }
      if (part === 'videos' || part === 'loopVideos') { labels.push('Vidéos'); continue; }
      if (part.startsWith('videos[') || part.startsWith('loopVideos[')) {
        const match = part.match(/\[(\d+)\]/);
        if (match) labels.push(`Vidéo ${parseInt(match[1]) + 1}`);
        continue;
      }
      if (part === 'name') { labels.push('Nom'); continue; }
      if (part === 'path') { labels.push('Fichier'); continue; }
      if (part === 'categoryIds') { labels.push('Catégories assignées'); continue; }
      labels.push(part);
    }
    return labels.join(' > ');
  }

  private generateSummary(item: ConfigDiff): string {
    const lastSegment = item.path.split('.').pop() || '';
    if (item.type === 'added') {
      if (typeof item.newValue === 'object' && item.newValue !== null) {
        const obj = item.newValue as Record<string, unknown>;
        if ('name' in obj && 'path' in obj) return `Ajouté: ${obj['name'] || this.extractFilename(obj['path'] as string)}`;
        if ('name' in obj) return `Ajouté: "${obj['name']}"`;
      }
      return 'Ajouté';
    }
    if (item.type === 'removed') {
      if (typeof item.oldValue === 'object' && item.oldValue !== null) {
        const obj = item.oldValue as Record<string, unknown>;
        if ('name' in obj && 'path' in obj) return `Supprimé: ${obj['name'] || this.extractFilename(obj['path'] as string)}`;
        if ('name' in obj) return `Supprimé: "${obj['name']}"`;
      }
      return 'Supprimé';
    }
    if (lastSegment === 'path') return `Fichier: ${this.extractFilename(item.oldValue as string)} → ${this.extractFilename(item.newValue as string)}`;
    if (lastSegment === 'name') return `Nom: "${item.oldValue}" → "${item.newValue}"`;
    if (Array.isArray(item.oldValue) && Array.isArray(item.newValue)) {
      const added = (item.newValue as string[]).filter(id => !(item.oldValue as string[]).includes(id));
      const removed = (item.oldValue as string[]).filter(id => !(item.newValue as string[]).includes(id));
      const parts: string[] = [];
      if (added.length) parts.push(`+${added.length}`);
      if (removed.length) parts.push(`-${removed.length}`);
      return parts.length ? parts.join(', ') : 'Modifié';
    }
    return 'Modifié';
  }

  private extractFilename(path: string): string {
    if (!path) return '(vide)';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  }

  private getSectionFromLabel(label: string): { name: string; icon: string } {
    if (label.startsWith('Boucle par défaut')) return { name: 'Boucle par défaut', icon: '🔄' };
    if (label.startsWith('Catégorie') || label.startsWith('Sous-catégorie')) return { name: 'Catégories', icon: '📁' };
    if (label.startsWith('Phase')) return { name: 'Phases de match', icon: '🎬' };
    if (label.startsWith('Mapping')) return { name: 'Analytics', icon: '📊' };
    return { name: 'Autre', icon: '📝' };
  }
}
