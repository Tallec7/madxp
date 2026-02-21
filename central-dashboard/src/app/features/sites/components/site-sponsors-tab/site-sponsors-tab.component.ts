import {
  Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogService } from '../../../../core/services/confirm-dialog.service';
import { Site, SiteSponsor, SiteSponsorVideo, SiteSponsorStatsResponse, SiteSponsorDailyTrend, GeneratedReport, SiteSponsorBenchmarkResponse, CloudVideo, SiteConfiguration } from '../../../../core/models';

Chart.register(...registerables);

@Component({
  selector: 'app-site-sponsors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Loading Skeleton -->
    <div class="sponsors-tab" *ngIf="loading">
      <div class="tab-header">
        <h3>
          <span class="section-icon">💼</span>
          Sponsors du club
        </h3>
      </div>
      <table class="data-table skeleton-table">
        <thead>
          <tr>
            <th>Sponsor</th>
            <th>Source</th>
            <th>Vidéos</th>
            <th>Impressions</th>
            <th>Config</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let i of [1,2,3,4]">
            <td class="sponsor-name-cell">
              <div class="skeleton-shimmer skeleton-text" style="width: 70%; height: 14px;"></div>
              <div class="skeleton-shimmer skeleton-text" style="width: 50%; height: 11px; margin-top: 4px;"></div>
            </td>
            <td>
              <div class="skeleton-shimmer skeleton-text" style="width: 65px; height: 22px; border-radius: 4px;"></div>
            </td>
            <td>
              <div class="skeleton-shimmer skeleton-text" style="width: 20px; height: 14px;"></div>
            </td>
            <td>
              <div class="skeleton-shimmer skeleton-text" style="width: 35px; height: 14px;"></div>
            </td>
            <td>
              <div class="skeleton-shimmer skeleton-text" style="width: 75px; height: 22px; border-radius: 4px;"></div>
            </td>
            <td>
              <div class="skeleton-shimmer skeleton-text" style="width: 50px; height: 14px;"></div>
            </td>
            <td class="actions-cell">
              <div class="skeleton-shimmer" style="width: 28px; height: 28px; border-radius: 6px;"></div>
              <div class="skeleton-shimmer" style="width: 28px; height: 28px; border-radius: 6px;"></div>
              <div class="skeleton-shimmer" style="width: 28px; height: 28px; border-radius: 6px;"></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Error -->
    <div class="error-banner" *ngIf="error">
      <span>{{ error }}</span>
      <button class="btn btn-sm" (click)="loadSponsors()">Réessayer</button>
    </div>

    <!-- Content -->
    <div class="sponsors-tab fade-in" *ngIf="!loading">
      <!-- Header -->
      <div class="tab-header">
        <h3>
          <span class="section-icon">💼</span>
          Sponsors du club
          <span class="count-badge" *ngIf="sponsors.length">{{ sponsors.length }}</span>
        </h3>
        <div class="header-actions">
          <span class="sync-badge" [ngClass]="syncStatusClass" [title]="syncTooltip">
            {{ syncStatusIcon }} {{ syncStatusLabel }}
          </span>
          <button class="btn btn-primary" (click)="openCreateModal()">+ Ajouter sponsor</button>
        </div>
      </div>

      <!-- Empty state -->
      <div class="empty-state" *ngIf="!sponsors.length && !loading">
        <div class="empty-icon">💼</div>
        <p>Aucun sponsor pour ce club</p>
        <p class="empty-hint">Les sponsors locaux créés depuis le Pi apparaîtront ici automatiquement.</p>
        <button class="btn btn-primary" (click)="openCreateModal()">Créer un sponsor</button>
      </div>

      <!-- Sponsors table -->
      <table class="data-table" *ngIf="sponsors.length">
        <thead>
          <tr>
            <th>Sponsor</th>
            <th>Source</th>
            <th>Vidéos</th>
            <th>Impressions</th>
            <th>Config</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let sponsor of sponsors">
            <tr [class.expanded]="expandedSponsorId === sponsor.id"
                [class.neopro-row]="sponsor.source === 'neopro'">
              <td class="sponsor-name-cell">
                <strong>{{ sponsor.name }}</strong>
                <span class="contact-sub" *ngIf="sponsor.contact_email">{{ sponsor.contact_email }}</span>
              </td>
              <td>
                <span class="source-badge" [ngClass]="'source-' + sponsor.source">
                  {{ sponsor.source === 'neopro' ? '📡 NEOPRO' : '🏠 Club' }}
                </span>
              </td>
              <td>
                {{ sponsor.video_count || 0 }}
                <span class="loop-warning-badge"
                      *ngIf="hasVideosNotInLoop(sponsor)"
                      [title]="('siteSponsors.videosNotInLoopTooltip' | translate) + ' (' + getVideosNotInLoopCount(sponsor) + ')'">
                  {{ 'siteSponsors.videosNotInLoop' | translate }}
                </span>
              </td>
              <td>{{ sponsor.total_impressions || 0 }}</td>
              <td>
                <span class="config-badge" [ngClass]="isConfigComplete(sponsor) ? 'config-complete' : 'config-incomplete'"
                      [title]="getConfigTooltip(sponsor)">
                  {{ isConfigComplete(sponsor) ? '🟢 Complet' : '🔴 Incomplet' }}
                </span>
                <button class="btn-config-cta" *ngIf="!isConfigComplete(sponsor) && sponsor.source !== 'neopro'"
                        (click)="toggleDetail(sponsor)"
                        [title]="getConfigCta(sponsor)">
                  {{ getConfigCta(sponsor) }}
                </button>
              </td>
              <td>
                <span class="status-badge" [ngClass]="'status-' + sponsor.status">
                  {{ sponsor.status === 'active' ? ('siteSponsors.statusActive' | translate) : sponsor.status === 'paused' ? ('siteSponsors.statusPaused' | translate) : ('siteSponsors.statusExpired' | translate) }}
                </span>
              </td>
              <td class="actions-cell">
                <button class="btn-icon" title="Détail & Stats" (click)="toggleDetail(sponsor)">
                  📊
                </button>
                <button class="btn-icon" title="Générer rapport" (click)="generateReport(sponsor)"
                        [disabled]="generatingReportId === sponsor.id">
                  {{ generatingReportId === sponsor.id ? '⏳' : '📥' }}
                </button>
                <button class="btn-icon" title="Modifier" (click)="openEditModal(sponsor)"
                        *ngIf="sponsor.source !== 'neopro'">
                  ✏️
                </button>
                <button class="btn-icon btn-icon-danger" title="Supprimer" (click)="confirmDelete(sponsor)"
                        *ngIf="sponsor.source !== 'neopro'">
                  🗑️
                </button>
              </td>
            </tr>

            <!-- Detail expand row -->
            <tr class="detail-row" *ngIf="expandedSponsorId === sponsor.id">
              <td colspan="7">
                <div class="detail-panel" *ngIf="detailLoading">
                  <div class="spinner"></div>
                  <p>Chargement des statistiques...</p>
                </div>

                <div class="detail-panel" *ngIf="!detailLoading && detailStats">
                  <!-- KPI Cards -->
                  <div class="kpi-grid-5">
                    <div class="kpi-card accent-blue">
                      <div class="kpi-value">{{ detailStats.summary.total_impressions | number }}</div>
                      <div class="kpi-label">Passages</div>
                      <div class="kpi-sub">{{ detailStats.period.from | date:'dd/MM' }} - {{ detailStats.period.to | date:'dd/MM' }}</div>
                    </div>
                    <div class="kpi-card accent-green">
                      <div class="kpi-value">{{ detailStats.summary.estimated_reach | number }}</div>
                      <div class="kpi-label">Spectateurs (estimé)</div>
                    </div>
                    <div class="kpi-card accent-purple">
                      <div class="kpi-value">{{ detailStats.summary.active_days | number }}</div>
                      <div class="kpi-label">Jours actifs</div>
                    </div>
                    <div class="kpi-card accent-orange">
                      <div class="kpi-value">{{ formatScreenTime(detailStats.summary.total_screen_time_seconds) }}</div>
                      <div class="kpi-label">Temps d'écran</div>
                    </div>
                    <div class="kpi-card accent-teal" *ngIf="detailStats.cpi !== null && detailStats.cpi !== undefined">
                      <div class="kpi-value">{{ detailStats.cpi | number:'1.2-2' }} &euro;</div>
                      <div class="kpi-label">CPI</div>
                      <div class="kpi-sub">Cout par impression</div>
                    </div>
                  </div>

                  <!-- Chart -->
                  <div class="chart-section" *ngIf="detailStats.daily_trends?.length">
                    <h4>Tendance des passages (30 jours)</h4>
                    <canvas #trendsChart></canvas>
                  </div>

                  <div class="chart-empty" *ngIf="!detailStats.daily_trends?.length">
                    <p>Aucune donnée de tendance pour cette période</p>
                  </div>

                  <!-- Videos -->
                  <div class="videos-section">
                    <h4>Vidéos associées ({{ detailStats.videos?.length || 0 }})</h4>
                    <div class="video-chips" *ngIf="detailStats.videos?.length">
                      <span class="video-chip" *ngFor="let v of detailStats.videos"
                            [class.chip-not-in-loop]="isVideoNotInLoop(v.video_filename)">
                        🎬 {{ v.video_filename }}
                        <span class="chip-primary" *ngIf="v.is_primary">Principal</span>
                        <span class="chip-warning"
                              *ngIf="isVideoNotInLoop(v.video_filename)"
                              [title]="'siteSponsors.videosNotInLoopTooltip' | translate">
                          {{ 'siteSponsors.videosNotInLoop' | translate }}
                        </span>
                        <button class="chip-remove" title="Retirer cette vidéo" (click)="removeVideo(v.video_filename)"
                                [disabled]="removingVideoFilename === v.video_filename">
                          {{ removingVideoFilename === v.video_filename ? '⏳' : '✕' }}
                        </button>
                      </span>
                    </div>
                    <div class="video-empty" *ngIf="!detailStats.videos?.length">
                      <p>Aucune vidéo associée</p>
                    </div>
                    <!-- Add video -->
                    <div class="video-add-row">
                      <select class="video-select" [(ngModel)]="selectedVideoFilename" name="videoSelect"
                              [disabled]="addingVideo || availableVideosLoading">
                        <option value="">{{ availableVideosLoading ? 'Chargement...' : 'Sélectionner une vidéo...' }}</option>
                        <option *ngFor="let v of availableVideos" [value]="v.filename">{{ v.title !== v.filename ? v.title + ' (' + v.filename + ')' : v.filename }}</option>
                      </select>
                      <button class="btn btn-sm btn-primary" (click)="addVideo()"
                              [disabled]="!selectedVideoFilename || addingVideo">
                        {{ addingVideo ? '⏳' : '+ Associer' }}
                      </button>
                    </div>
                  </div>

                  <!-- Access Link (P5) -->
                  <div class="access-link-section" style="margin-bottom: 16px;">
                    <h4>🔗 Lien d'accès sponsor</h4>
                    <p style="font-size: 0.8rem; color: #6b7280; margin: 4px 0 8px;">
                      Envoyez un lien magique au sponsor pour qu'il consulte ses stats en autonomie.
                    </p>
                    <button
                      class="btn btn-sm btn-outline"
                      (click)="createAccessLink(expandedSponsor!)"
                      [disabled]="creatingAccessLink"
                      *ngIf="expandedSponsor"
                    >
                      {{ creatingAccessLink ? '⏳ Création...' : (expandedSponsor?.contact_email ? '📧 Envoyer par email' : '🔗 Générer le lien') }}
                    </button>
                    <div *ngIf="accessLinkUrl" class="access-link-result" style="margin-top: 8px;">
                      <input type="text" [value]="accessLinkUrl" readonly class="form-input"
                             style="font-size: 0.75rem; width: 100%;"
                             (click)="copyAccessLink()"/>
                      <small style="color: #22c55e;">{{ accessLinkCopied ? '✓ Copié !' : 'Cliquez pour copier' }}</small>
                    </div>
                  </div>

                  <!-- Reports -->
                  <div class="reports-section">
                    <h4>Rapports générés</h4>
                    <div class="reports-loading" *ngIf="reportsLoading">Chargement...</div>
                    <div class="reports-empty" *ngIf="!reportsLoading && !reports?.length">
                      Aucun rapport — cliquez sur 📥 pour en générer un.
                    </div>
                    <div class="reports-list" *ngIf="reports?.length">
                      <div class="report-item" *ngFor="let r of reports">
                        <span class="report-period">{{ r.period_label || (r.period_start | date:'MMM yyyy') }}</span>
                        <span class="report-status" [ngClass]="'report-' + r.status">{{ r.status }}</span>
                        <a class="report-download" *ngIf="r.storage_url && r.status === 'completed'"
                           [href]="r.storage_url" target="_blank" rel="noopener">
                          📥 Télécharger
                        </a>
                      </div>
                    </div>
                  </div>

                  <!-- Benchmark intra-club (P6.2) -->
                  <div class="benchmark-section" *ngIf="benchmarkData">
                    <h4>Benchmark intra-club</h4>
                    <p class="benchmark-subtitle">Classement des {{ benchmarkData.total_sponsors }} sponsors actifs du club</p>
                    <table class="benchmark-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Sponsor</th>
                          <th>Passages</th>
                          <th>Temps ecran</th>
                          <th>Completion</th>
                          <th>Jours actifs</th>
                          <th *ngIf="benchmarkHasCpi">CPI</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let entry of benchmarkData.sponsors"
                            [class.benchmark-highlight]="entry.site_sponsor_id === expandedSponsorId"
                            [class.benchmark-above-avg]="entry.impressions > benchmarkData!.averages.impressions">
                          <td class="rank-cell">{{ entry.rank }}</td>
                          <td>
                            {{ entry.sponsor_name }}
                            <span class="you-badge" *ngIf="entry.site_sponsor_id === expandedSponsorId">VOUS</span>
                          </td>
                          <td>{{ entry.impressions | number }}</td>
                          <td>{{ formatScreenTime(entry.screen_time_seconds) }}</td>
                          <td>{{ entry.completion_rate | number:'1.0-0' }}%</td>
                          <td>{{ entry.active_days }}</td>
                          <td *ngIf="benchmarkHasCpi">{{ entry.cpi !== null ? (entry.cpi | number:'1.2-2') + ' EUR' : '---' }}</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr class="benchmark-avg-row">
                          <td></td>
                          <td><em>Moyenne</em></td>
                          <td>{{ benchmarkData.averages.impressions | number:'1.0-0' }}</td>
                          <td>{{ formatScreenTime(benchmarkData.averages.screen_time_seconds) }}</td>
                          <td>{{ benchmarkData.averages.completion_rate | number:'1.0-0' }}%</td>
                          <td>{{ benchmarkData.averages.active_days | number:'1.0-0' }}</td>
                          <td *ngIf="benchmarkHasCpi">{{ benchmarkData.averages.cpi !== null ? (benchmarkData.averages.cpi | number:'1.2-2') + ' EUR' : '---' }}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div class="benchmark-loading" *ngIf="benchmarkLoading">
                    <div class="spinner"></div>
                    <p>Chargement du benchmark...</p>
                  </div>
                </div>
              </td>
            </tr>
          </ng-container>
        </tbody>
      </table>
    </div>

    <!-- Edit Modal (single-page) -->
    <div class="modal-overlay" *ngIf="showModal && isEditing" (click)="closeModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Modifier sponsor</h3>
          <button class="close-btn" (click)="closeModal()">&times;</button>
        </div>
        <form (submit)="saveSponsor($event)" class="modal-body">
          <div class="form-group">
            <label>Nom du sponsor *</label>
            <input type="text" [(ngModel)]="formData.name" name="name" required placeholder="Ex: Boulangerie Dupont" />
          </div>
          <div class="form-group">
            <label>Contact (nom)</label>
            <input type="text" [(ngModel)]="formData.contact_name" name="contact_name" placeholder="Ex: Jean Dupont" />
          </div>
          <div class="form-group">
            <label>Email de contact</label>
            <input type="email" [(ngModel)]="formData.contact_email" name="contact_email" placeholder="Ex: contact@dupont.fr" />
          </div>
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" [(ngModel)]="formData.contact_phone" name="contact_phone" placeholder="Ex: 06 12 34 56 78" />
          </div>
          <div class="form-group">
            <label>Statut</label>
            <select [(ngModel)]="formData.status" name="status">
              <option value="active">Actif</option>
              <option value="paused">En pause</option>
              <option value="expired">Expiré</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeModal()">Annuler</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving">
              {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Create Wizard (3-step) -->
    <div class="modal-overlay" *ngIf="showModal && !isEditing" (click)="closeModal()">
      <div class="modal-content wizard-modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>✨ Nouveau sponsor</h3>
          <button class="close-btn" (click)="closeModal()">&times;</button>
        </div>

        <!-- Step indicator -->
        <div class="wizard-steps">
          <div class="wizard-step-item" [class.active]="wizardStep >= 1" [class.done]="wizardStep > 1">
            <div class="wizard-dot">{{ wizardStep > 1 ? '✓' : '1' }}</div>
            <span>Infos</span>
          </div>
          <div class="wizard-line" [class.active]="wizardStep > 1"></div>
          <div class="wizard-step-item" [class.active]="wizardStep >= 2" [class.done]="wizardStep > 2">
            <div class="wizard-dot">{{ wizardStep > 2 ? '✓' : '2' }}</div>
            <span>Vidéo</span>
          </div>
          <div class="wizard-line" [class.active]="wizardStep > 2"></div>
          <div class="wizard-step-item" [class.active]="wizardStep >= 3" [class.done]="wizardStep > 3">
            <div class="wizard-dot">{{ wizardStep > 3 ? '✓' : '3' }}</div>
            <span>Boucle</span>
          </div>
        </div>

        <!-- Step 1: Sponsor Info -->
        <div class="wizard-panel" *ngIf="wizardStep === 1">
          <h4>Informations du sponsor</h4>
          <div class="form-group">
            <label>Nom du sponsor *</label>
            <input type="text" [(ngModel)]="formData.name" name="wname" placeholder="Ex: Boulangerie Dupont" />
          </div>
          <div class="form-group">
            <label>Contact (nom)</label>
            <input type="text" [(ngModel)]="formData.contact_name" name="wcontact" placeholder="Ex: Jean Dupont" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" [(ngModel)]="formData.contact_email" name="wemail" placeholder="Ex: contact@dupont.fr" />
          </div>
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" [(ngModel)]="formData.contact_phone" name="wphone" placeholder="Ex: 06 12 34 56 78" />
          </div>

          <div class="wizard-nav">
            <button class="btn btn-secondary" (click)="closeModal()">Annuler</button>
            <button class="btn btn-primary" (click)="wizardNext()" [disabled]="!formData.name.trim()">
              Suivant →
            </button>
          </div>
        </div>

        <!-- Step 2: Video Selection -->
        <div class="wizard-panel" *ngIf="wizardStep === 2">
          <h4>Associer une vidéo <span class="optional-label">(optionnel)</span></h4>
          <p class="wizard-hint">Sélectionnez une vidéo à diffuser pour ce sponsor. Vous pourrez en ajouter d'autres plus tard.</p>

          <div *ngIf="wizardVideosLoading" class="loading-inline">
            <div class="spinner-sm"></div>
            <span>Chargement des vidéos...</span>
          </div>

          <div *ngIf="!wizardVideosLoading" class="wizard-video-list">
            <div class="wizard-video-search">
              <input type="text" [(ngModel)]="wizardVideoSearch" (input)="filterWizardVideos()" name="wvsearch"
                     [placeholder]="'sponsors.searchVideo' | translate" />
            </div>
            <div class="wizard-videos-scroll">
              <div *ngFor="let v of wizardFilteredVideos"
                   class="wizard-video-item"
                   [class.selected]="wizardSelectedVideo === v.filename"
                   (click)="wizardSelectedVideo = v.filename">
                <span class="wv-radio">{{ wizardSelectedVideo === v.filename ? '◉' : '○' }}</span>
                <div class="wv-info">
                  <strong>{{ v.title || v.filename }}</strong>
                  <span class="wv-meta" *ngIf="v.title && v.title !== v.filename">{{ v.filename }}</span>
                </div>
              </div>
              <div *ngIf="wizardFilteredVideos.length === 0" class="wizard-video-empty">
                Aucune vidéo disponible
              </div>
            </div>
            <div class="wizard-video-selected" *ngIf="wizardSelectedVideo">
              🎬 Sélectionnée: <strong>{{ wizardSelectedVideo }}</strong>
              <button class="btn-link" (click)="wizardSelectedVideo = ''">✕ Retirer</button>
            </div>
          </div>

          <div class="wizard-nav">
            <button class="btn btn-secondary" (click)="wizardBack()">← Précédent</button>
            <button class="btn btn-primary" (click)="wizardNext()">
              {{ wizardSelectedVideo ? ('sponsors.wizardNext' | translate) : ('sponsors.wizardSkip' | translate) }}
            </button>
          </div>
        </div>

        <!-- Step 3: Loop Config + Confirmation -->
        <div class="wizard-panel" *ngIf="wizardStep === 3">
          <h4>Configuration de la boucle</h4>

          <div class="wizard-summary-card">
            <div class="ws-row">
              <span class="ws-label">Sponsor:</span>
              <strong>{{ formData.name }}</strong>
            </div>
            <div class="ws-row" *ngIf="formData.contact_email">
              <span class="ws-label">Email:</span>
              <span>{{ formData.contact_email }}</span>
            </div>
            <div class="ws-row">
              <span class="ws-label">Vidéo:</span>
              <span>{{ wizardSelectedVideo || ('sponsors.wizardNoVideo' | translate) }}</span>
            </div>
          </div>

          <div class="form-group wizard-loop-option">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="wizardAddToLoop" name="wloop" />
              Ajouter automatiquement à la boucle de diffusion
            </label>
            <p class="form-hint">La vidéo du sponsor sera intégrée dans la boucle de diffusion du club</p>
          </div>

          <div class="wizard-nav">
            <button class="btn btn-secondary" (click)="wizardBack()">← Précédent</button>
            <button class="btn btn-primary" (click)="wizardCreate()" [disabled]="saving">
              {{ saving ? 'Création...' : '✓ Créer le sponsor' }}
            </button>
          </div>
        </div>

        <!-- Success -->
        <div class="wizard-panel wizard-success" *ngIf="wizardStep === 4">
          <div class="success-icon">✅</div>
          <h4>Sponsor créé avec succès !</h4>
          <p *ngIf="wizardSelectedVideo">La vidéo sera diffusée dans la boucle du club.</p>
          <p *ngIf="!wizardSelectedVideo">Pensez à associer une vidéo pour commencer la diffusion.</p>
          <button class="btn btn-primary" (click)="closeModal()">Fermer</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Layout */
    .sponsors-tab { padding: 0; }
    .tab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .tab-header h3 {
      margin: 0;
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .section-icon { font-size: 1.2rem; }

    /* Sync Status Badge (F-AUD-23) */
    .sync-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      cursor: help;
    }
    .sync-ok {
      background: #dcfce7;
      color: #166534;
    }
    .sync-pending {
      background: #fef3c7;
      color: #92400e;
      animation: syncPulse 2s ease-in-out infinite;
    }
    .sync-unknown {
      background: #f1f5f9;
      color: #64748b;
    }
    .sync-stale {
      background: #fef2f2;
      color: #991b1b;
    }
    @keyframes syncPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .count-badge {
      background: #e2e8f0;
      color: #475569;
      padding: 0.15rem 0.5rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    /* Loading & Error */
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem;
      color: #64748b;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-banner {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      border-radius: 8px;
      padding: 1rem;
      color: #991b1b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    /* Skeleton Shimmer */
    .skeleton-shimmer {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .skeleton-text { height: 14px; margin-bottom: 0; }
    .skeleton-table tbody tr:hover { background: transparent; }

    /* Fade in transition */
    .fade-in {
      animation: skeletonFadeIn 0.3s ease-in;
    }
    @keyframes skeletonFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
    }
    .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty-hint { font-size: 0.875rem; color: #94a3b8; margin: 0.5rem 0 1.5rem; }

    /* Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .data-table th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .data-table tbody tr:hover { background: #f8fafc; }
    .data-table tbody tr.expanded { background: #eff6ff; }
    .data-table tbody tr.neopro-row { background: #fafbff; }

    .sponsor-name-cell {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .contact-sub {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* Badges */
    .source-badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .source-local { background: #dcfce7; color: #166534; }
    .source-neopro { background: #dbeafe; color: #1e40af; }

    .status-badge {
      font-size: 0.8rem;
    }

    /* Config complete/incomplete badge */
    .config-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      cursor: help;
    }
    .config-complete { background: #dcfce7; color: #166534; }
    .config-incomplete { background: #fef2f2; color: #991b1b; }
    .btn-config-cta {
      display: block;
      margin-top: 0.3rem;
      background: none;
      border: none;
      color: #3b82f6;
      font-size: 0.7rem;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }
    .btn-config-cta:hover { color: #1d4ed8; }

    /* Loop warning badge (video not in any loop/category) */
    .loop-warning-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 500;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: #fef3c7;
      color: #92400e;
      margin-left: 0.35rem;
      cursor: help;
      white-space: nowrap;
    }

    /* Actions */
    .actions-cell {
      display: flex;
      gap: 0.25rem;
    }
    .btn-icon {
      background: none;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      padding: 0.3rem 0.5rem;
      font-size: 1rem;
      transition: all 0.15s;
    }
    .btn-icon:hover { background: #f1f5f9; border-color: #e2e8f0; }
    .btn-icon:disabled { opacity: 0.5; cursor: default; }
    .btn-icon-danger:hover { background: #fef2f2; border-color: #fca5a5; }

    /* Detail expand */
    .detail-row td {
      padding: 0 !important;
      border-bottom: 2px solid #3b82f6;
    }
    .detail-panel {
      padding: 1.5rem;
      background: #f8fafc;
    }

    /* KPI Grid */
    .kpi-grid-4, .kpi-grid-5 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .kpi-card {
      padding: 1rem;
      background: white;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      border-left: 4px solid #e2e8f0;
    }
    .kpi-card.accent-blue { border-left-color: #3b82f6; }
    .kpi-card.accent-green { border-left-color: #22c55e; }
    .kpi-card.accent-purple { border-left-color: #8b5cf6; }
    .kpi-card.accent-orange { border-left-color: #f59e0b; }
    .kpi-card.accent-teal { border-left-color: #14b8a6; }
    .kpi-value {
      font-size: 1.5rem;
      font-weight: 800;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 0.15rem;
    }
    .kpi-sub {
      font-size: 0.7rem;
      color: #94a3b8;
      margin-top: 0.1rem;
    }

    /* Chart */
    .chart-section {
      background: white;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }
    .chart-section h4 { margin: 0 0 0.75rem; font-size: 0.9rem; color: #334155; }
    .chart-section canvas { max-height: 220px; }
    .chart-empty {
      text-align: center;
      color: #94a3b8;
      padding: 1rem;
      font-size: 0.875rem;
    }

    /* Videos */
    .videos-section { margin-bottom: 1.5rem; }
    .videos-section h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: #334155; }
    .video-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .video-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.35rem 0.65rem;
      font-size: 0.8rem;
      color: #334155;
    }
    .chip-primary {
      background: #dbeafe;
      color: #1e40af;
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 600;
    }
    .chip-not-in-loop {
      border-color: #fbbf24;
      background: #fffbeb;
    }
    .chip-warning {
      background: #fef3c7;
      color: #92400e;
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      font-weight: 600;
      cursor: help;
    }
    .chip-remove {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.75rem;
      padding: 0 0.15rem;
      line-height: 1;
      border-radius: 3px;
      transition: all 0.15s;
    }
    .chip-remove:hover:not(:disabled) { color: #ef4444; background: #fef2f2; }
    .chip-remove:disabled { opacity: 0.5; cursor: default; }
    .video-empty {
      font-size: 0.8rem;
      color: #94a3b8;
      padding: 0.25rem 0;
    }
    .video-empty p { margin: 0; }
    .video-add-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.75rem;
    }
    .video-select {
      flex: 1;
      max-width: 360px;
      padding: 0.4rem 0.65rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.8rem;
      background: white;
      color: #334155;
    }
    .video-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
    .video-select:disabled { background: #f1f5f9; color: #94a3b8; }

    /* Reports */
    .reports-section h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: #334155; }
    .reports-empty, .reports-loading {
      font-size: 0.8rem;
      color: #94a3b8;
      padding: 0.5rem 0;
    }
    .reports-list { display: flex; flex-direction: column; gap: 0.35rem; }
    .report-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.4rem 0.65rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.8rem;
    }
    .report-period { font-weight: 500; color: #334155; }
    .report-completed { color: #22c55e; }
    .report-generating { color: #f59e0b; }
    .report-failed { color: #ef4444; }
    .report-download {
      margin-left: auto;
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
    }
    .report-download:hover { text-decoration: underline; }

    /* Benchmark */
    .benchmark-section { margin-top: 1.5rem; background: white; padding: 1rem; border-radius: 8px; }
    .benchmark-section h4 { margin: 0 0 0.25rem; font-size: 0.9rem; color: #334155; }
    .benchmark-subtitle { font-size: 0.8rem; color: #94a3b8; margin: 0 0 0.75rem; }
    .benchmark-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .benchmark-table th { padding: 0.5rem 0.65rem; text-align: left; font-weight: 600; color: #64748b; font-size: 0.7rem; text-transform: uppercase; background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
    .benchmark-table td { padding: 0.45rem 0.65rem; border-bottom: 1px solid #f1f5f9; }
    .benchmark-table tbody tr:hover { background: #f8fafc; }
    .benchmark-highlight { background: #eff6ff !important; font-weight: 600; }
    .benchmark-above-avg td { color: #166534; }
    .rank-cell { font-weight: 700; color: #64748b; width: 2rem; text-align: center; }
    .you-badge { display: inline-block; background: #3b82f6; color: white; font-size: 0.6rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 3px; margin-left: 0.35rem; vertical-align: middle; }
    .benchmark-avg-row { background: #f8fafc; border-top: 2px solid #e2e8f0; }
    .benchmark-avg-row td { font-style: italic; color: #64748b; font-weight: 500; }
    .benchmark-loading { display: flex; flex-direction: column; align-items: center; padding: 1rem; color: #64748b; font-size: 0.8rem; }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: white;
      border-radius: 12px;
      width: 480px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }
    .modal-header h3 { margin: 0; font-size: 1.1rem; }
    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #94a3b8;
      padding: 0;
      line-height: 1;
    }
    .close-btn:hover { color: #334155; }
    .modal-body { padding: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: #475569;
      margin-bottom: 0.35rem;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.9rem;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }
    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding-top: 1rem;
      margin-top: 0.5rem;
      border-top: 1px solid #f1f5f9;
    }

    /* Buttons (shared) */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      border: 1px solid transparent;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-secondary { background: #f1f5f9; color: #475569; border-color: #d1d5db; }
    .btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
    .btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
    .btn-link {
      background: none;
      border: none;
      color: #ef4444;
      font-size: 0.8rem;
      cursor: pointer;
      padding: 0;
      margin-left: 0.5rem;
    }
    .btn-link:hover { text-decoration: underline; }
    .btn-outline {
      background: white;
      border: 1px solid #d1d5db;
      color: #475569;
    }
    .btn-outline:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }

    /* Wizard Modal */
    .wizard-modal { width: 560px; }

    .wizard-steps {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem 1.5rem 0.5rem;
      gap: 0;
    }
    .wizard-step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      opacity: 0.4;
      transition: opacity 0.2s;
    }
    .wizard-step-item.active { opacity: 1; }
    .wizard-step-item.done { opacity: 0.8; }
    .wizard-dot {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .wizard-step-item.active .wizard-dot {
      background: #3b82f6;
      color: white;
    }
    .wizard-step-item.done .wizard-dot {
      background: #22c55e;
      color: white;
    }
    .wizard-step-item span {
      font-size: 0.7rem;
      font-weight: 500;
      color: #64748b;
    }
    .wizard-step-item.active span { color: #1e40af; }

    .wizard-line {
      width: 60px;
      height: 2px;
      background: #e2e8f0;
      margin: 0 0.5rem;
      margin-bottom: 1.2rem;
      transition: background 0.2s;
    }
    .wizard-line.active { background: #3b82f6; }

    .wizard-panel {
      padding: 1.5rem;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .wizard-panel h4 {
      margin: 0 0 1rem;
      font-size: 1rem;
      color: #0f172a;
    }
    .optional-label {
      font-weight: 400;
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .wizard-hint {
      font-size: 0.85rem;
      color: #64748b;
      margin: -0.5rem 0 1rem;
    }

    .wizard-nav {
      display: flex;
      justify-content: space-between;
      padding-top: 1rem;
      margin-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    /* Wizard Video List */
    .wizard-video-list { margin-bottom: 0.5rem; }
    .wizard-video-search { margin-bottom: 0.75rem; }
    .wizard-video-search input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.85rem;
      box-sizing: border-box;
    }
    .wizard-video-search input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .wizard-videos-scroll {
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .wizard-video-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      cursor: pointer;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    .wizard-video-item:last-child { border-bottom: none; }
    .wizard-video-item:hover { background: #f8fafc; }
    .wizard-video-item.selected { background: #eff6ff; }
    .wv-radio { font-size: 1.1rem; color: #94a3b8; }
    .wizard-video-item.selected .wv-radio { color: #3b82f6; }
    .wv-info { display: flex; flex-direction: column; gap: 0.1rem; }
    .wv-info strong { font-size: 0.85rem; color: #0f172a; }
    .wv-meta { font-size: 0.75rem; color: #94a3b8; }
    .wizard-video-empty {
      padding: 2rem;
      text-align: center;
      color: #94a3b8;
      font-size: 0.85rem;
    }
    .wizard-video-selected {
      margin-top: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      font-size: 0.85rem;
      color: #1e40af;
    }

    /* Wizard Summary */
    .wizard-summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .ws-row {
      display: flex;
      gap: 0.75rem;
      padding: 0.4rem 0;
      font-size: 0.85rem;
    }
    .ws-label {
      color: #64748b;
      min-width: 70px;
    }

    /* Wizard Loop */
    .wizard-loop-option { margin-bottom: 0; }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      cursor: pointer;
      font-weight: 500;
    }
    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    .form-hint {
      font-size: 0.8rem;
      color: #94a3b8;
      margin: 0.35rem 0 0 1.75rem;
    }

    /* Wizard Success */
    .wizard-success {
      text-align: center;
      padding: 2.5rem 1.5rem;
    }
    .success-icon { font-size: 3rem; margin-bottom: 1rem; }
    .wizard-success h4 {
      font-size: 1.15rem;
      margin-bottom: 0.5rem;
    }
    .wizard-success p {
      color: #64748b;
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }

    /* Loading inline */
    .loading-inline {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      justify-content: center;
      color: #64748b;
      font-size: 0.85rem;
    }
    .spinner-sm {
      width: 18px;
      height: 18px;
      border: 2px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  `],
})
export class SiteSponsorsTabComponent implements OnInit, OnDestroy {
  @Input() siteId = '';
  @Input() site: Site | null = null;

  @ViewChild('trendsChart') trendsChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly sitesService = inject(SitesService);
  private readonly notification = inject(NotificationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly cdr = inject(ChangeDetectorRef);

  // List
  sponsors: SiteSponsor[] = [];
  loading = true;
  error = '';

  // Detail expand
  expandedSponsorId: string | null = null;
  detailLoading = false;
  detailStats: SiteSponsorStatsResponse | null = null;
  reports: GeneratedReport[] = [];
  reportsLoading = false;
  private trendsChart: Chart | null = null;

  // Modal
  showModal = false;
  isEditing = false;
  editingSponsorId = '';
  saving = false;
  formData: {
    name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    status: string;
  } = { name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'active' };

  // Wizard (create flow)
  wizardStep = 1;
  wizardVideos: CloudVideo[] = [];
  wizardFilteredVideos: CloudVideo[] = [];
  wizardVideosLoading = false;
  wizardVideoSearch = '';
  wizardSelectedVideo = '';
  wizardAddToLoop = true;

  // Benchmark (P6.2)
  benchmarkData: SiteSponsorBenchmarkResponse | null = null;
  benchmarkLoading = false;
  benchmarkHasCpi = false;

  // Report generation
  generatingReportId: string | null = null;

  // Video association
  availableVideos: CloudVideo[] = [];
  availableVideosLoading = false;
  selectedVideoFilename = '';
  addingVideo = false;
  removingVideoFilename: string | null = null;

  // Access link (P5)
  expandedSponsor: SiteSponsor | null = null;
  creatingAccessLink = false;
  accessLinkUrl: string | null = null;
  accessLinkCopied = false;

  // Loop presence detection (video-not-in-loop warning)
  private videosInLoops: Set<string> = new Set();
  configLoaded = false;

  // Cached site content to avoid multiple identical API calls
  private cachedConfiguration: SiteConfiguration | null = null;

  ngOnInit(): void {
    this.loadSponsors();
    this.loadSiteContentOnce();
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  loadSponsors(): void {
    this.loading = true;
    this.error = '';
    this.sitesService.listSiteSponsors(this.siteId, true).subscribe({
      next: (res) => {
        this.sponsors = res?.sponsors ?? [];
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = 'Impossible de charger les sponsors';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Detail expand
  // =========================================================================

  toggleDetail(sponsor: SiteSponsor): void {
    if (this.expandedSponsorId === sponsor.id) {
      this.expandedSponsorId = null;
      this.expandedSponsor = null;
      this.detailStats = null;
      this.reports = [];
      this.benchmarkData = null;
      this.benchmarkHasCpi = false;
      this.accessLinkUrl = null;
      this.accessLinkCopied = false;
      this.availableVideos = [];
      this.selectedVideoFilename = '';
      this.destroyChart();
      this.cdr.markForCheck();
      return;
    }

    this.expandedSponsorId = sponsor.id;
    this.expandedSponsor = sponsor;
    this.detailLoading = true;
    this.detailStats = null;
    this.reports = [];
    this.benchmarkData = null;
    this.benchmarkHasCpi = false;
    this.accessLinkUrl = null;
    this.accessLinkCopied = false;
    this.selectedVideoFilename = '';
    this.cdr.markForCheck();

    // Load stats + reports + benchmark in parallel
    this.sitesService.getSiteSponsorStats(this.siteId, sponsor.id).subscribe({
      next: (stats) => {
        this.detailStats = stats;
        this.detailLoading = false;
        this.cdr.markForCheck();
        // Render chart after next tick
        setTimeout(() => this.renderTrendsChart(), 50);
        // Load available videos after stats (to filter already-associated ones)
        this.loadAvailableVideos();
      },
      error: () => {
        this.detailLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.reportsLoading = true;
    this.sitesService.getSponsorReports(sponsor.id).subscribe({
      next: (reports) => {
        this.reports = reports;
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
    });

    this.benchmarkLoading = true;
    this.sitesService.getSiteSponsorBenchmark(this.siteId).subscribe({
      next: (benchmark) => {
        this.benchmarkData = benchmark;
        this.benchmarkHasCpi = benchmark?.sponsors?.some(s => s.cpi !== null) ?? false;
        this.benchmarkLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.benchmarkLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Chart
  // =========================================================================

  private renderTrendsChart(): void {
    if (!this.trendsChartRef || !this.detailStats?.daily_trends?.length) return;
    this.destroyChart();

    const trends = this.detailStats.daily_trends;
    const labels = trends.map(t => {
      const d = new Date(t.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const data = trends.map(t => Number(t.impressions));

    const ctx = this.trendsChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Passages',
          data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
      },
    };

    this.trendsChart = new Chart(ctx, config);
    this.cdr.markForCheck();
  }

  private destroyChart(): void {
    if (this.trendsChart) {
      this.trendsChart.destroy();
      this.trendsChart = null;
    }
  }

  // =========================================================================
  // Modal CRUD
  // =========================================================================

  openCreateModal(): void {
    this.isEditing = false;
    this.editingSponsorId = '';
    this.formData = { name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'active' };
    this.wizardStep = 1;
    this.wizardSelectedVideo = '';
    this.wizardVideoSearch = '';
    this.wizardAddToLoop = true;
    this.wizardVideos = [];
    this.wizardFilteredVideos = [];
    this.showModal = true;
    this.cdr.markForCheck();
  }

  openEditModal(sponsor: SiteSponsor): void {
    this.isEditing = true;
    this.editingSponsorId = sponsor.id;
    this.formData = {
      name: sponsor.name,
      contact_name: sponsor.contact_name || '',
      contact_email: sponsor.contact_email || '',
      contact_phone: sponsor.contact_phone || '',
      status: sponsor.status,
    };
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.cdr.markForCheck();
  }

  saveSponsor(event: Event): void {
    event.preventDefault();
    if (!this.formData.name.trim()) return;

    this.saving = true;
    const payload: Partial<SiteSponsor> = {
      name: this.formData.name.trim(),
      contact_name: this.formData.contact_name.trim() || null,
      contact_email: this.formData.contact_email.trim() || null,
      contact_phone: this.formData.contact_phone.trim() || null,
      status: this.formData.status as SiteSponsor['status'],
    };

    const obs = this.isEditing
      ? this.sitesService.updateSiteSponsor(this.siteId, this.editingSponsorId, payload)
      : this.sitesService.createSiteSponsor(this.siteId, payload);

    obs.subscribe({
      next: () => {
        this.notification.success(this.isEditing ? 'Sponsor mis à jour' : 'Sponsor créé');
        this.saving = false;
        this.showModal = false;
        this.loadSponsors();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'enregistrement');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Wizard (3-step create flow)
  // =========================================================================

  wizardNext(): void {
    if (this.wizardStep === 1) {
      if (!this.formData.name.trim()) return;
      this.wizardStep = 2;
      // Load available videos for step 2
      if (this.wizardVideos.length === 0) {
        this.loadWizardVideos();
      }
    } else if (this.wizardStep === 2) {
      this.wizardStep = 3;
    }
    this.cdr.markForCheck();
  }

  wizardBack(): void {
    if (this.wizardStep > 1) {
      this.wizardStep--;
      this.cdr.markForCheck();
    }
  }

  loadWizardVideos(): void {
    // Use cached config (deployed videos only) instead of all cloud videos
    this.wizardVideos = this.extractDeployedVideos(this.cachedConfiguration);
    this.filterWizardVideos();
    this.cdr.markForCheck();
  }

  filterWizardVideos(): void {
    const term = this.wizardVideoSearch.toLowerCase();
    this.wizardFilteredVideos = this.wizardVideos.filter(v =>
      v.filename.toLowerCase().includes(term) ||
      (v.title || '').toLowerCase().includes(term)
    );
  }

  wizardCreate(): void {
    if (!this.formData.name.trim()) return;

    this.saving = true;
    this.cdr.markForCheck();

    const payload: Partial<SiteSponsor> = {
      name: this.formData.name.trim(),
      contact_name: this.formData.contact_name.trim() || null,
      contact_email: this.formData.contact_email.trim() || null,
      contact_phone: this.formData.contact_phone.trim() || null,
      status: 'active' as SiteSponsor['status'],
    };

    this.sitesService.createSiteSponsor(this.siteId, payload).subscribe({
      next: (created) => {
        // If video selected, associate it
        if (this.wizardSelectedVideo && created?.id) {
          this.sitesService.addVideoToSiteSponsor(this.siteId, created.id, this.wizardSelectedVideo).subscribe({
            next: () => {
              this.saving = false;
              this.wizardStep = 4; // success screen
              this.loadSponsors();
              this.cdr.markForCheck();
            },
            error: () => {
              // Sponsor created but video association failed
              this.notification.warning('Sponsor créé mais erreur lors de l\'association de la vidéo');
              this.saving = false;
              this.wizardStep = 4;
              this.loadSponsors();
              this.cdr.markForCheck();
            },
          });
        } else {
          this.saving = false;
          this.wizardStep = 4; // success screen
          this.loadSponsors();
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.notification.error('Erreur lors de la création du sponsor');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  async confirmDelete(sponsor: SiteSponsor): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      `Supprimer le sponsor "${sponsor.name}" ? Cette action est irréversible.`,
      { title: 'Suppression', confirmLabel: 'Supprimer' },
    );
    if (!ok) return;

    this.sitesService.deleteSiteSponsor(this.siteId, sponsor.id).subscribe({
      next: () => {
        this.notification.success('Sponsor supprimé');
        if (this.expandedSponsorId === sponsor.id) {
          this.expandedSponsorId = null;
          this.destroyChart();
        }
        this.loadSponsors();
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
      },
    });
  }

  // =========================================================================
  // Report generation
  // =========================================================================

  generateReport(sponsor: SiteSponsor): void {
    this.generatingReportId = sponsor.id;
    this.cdr.markForCheck();

    // Generate report for last month
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 1, 1); // 1st of prev month

    this.sitesService.generateSponsorReport(
      this.siteId,
      sponsor.id,
      periodStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0],
    ).subscribe({
      next: (result) => {
        const emailNote = sponsor.contact_email ? ` Un email a été envoyé à ${sponsor.contact_email}.` : '';
        this.notification.success(`Rapport généré avec succès.${emailNote}`);
        this.generatingReportId = null;
        // Refresh reports if this sponsor is expanded
        if (this.expandedSponsorId === sponsor.id) {
          this.loadReports(sponsor.id);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de la génération du rapport');
        this.generatingReportId = null;
        this.cdr.markForCheck();
      },
    });
  }

  private loadReports(sponsorId: string): void {
    this.reportsLoading = true;
    this.sitesService.getSponsorReports(sponsorId).subscribe({
      next: (reports) => {
        this.reports = reports;
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.reportsLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  // =========================================================================
  // Access Link (P5)
  // =========================================================================

  createAccessLink(sponsor: SiteSponsor): void {
    this.creatingAccessLink = true;
    this.accessLinkUrl = null;
    this.accessLinkCopied = false;
    this.cdr.markForCheck();

    this.sitesService.createSponsorAccessLink(this.siteId, sponsor.id).subscribe({
      next: (result: { accessUrl: string; expiresAt: string; emailSent: boolean; sentTo: string | null }) => {
        this.creatingAccessLink = false;
        this.accessLinkUrl = result.accessUrl;
        if (result.emailSent && result.sentTo) {
          this.notification.success(`Lien envoyé à ${result.sentTo}`);
        } else {
          this.notification.success('Lien d\'accès généré — copiez-le ci-dessous');
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.creatingAccessLink = false;
        this.notification.error('Erreur lors de la création du lien d\'accès');
        this.cdr.markForCheck();
      },
    });
  }

  copyAccessLink(): void {
    if (!this.accessLinkUrl) return;
    navigator.clipboard.writeText(this.accessLinkUrl).then(() => {
      this.accessLinkCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.accessLinkCopied = false;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  // =========================================================================
  // Video association
  // =========================================================================

  private loadAvailableVideos(): void {
    // Use cached config (deployed videos only) instead of all cloud videos
    const associatedFilenames = new Set(
      (this.detailStats?.videos ?? []).map(v => v.video_filename)
    );
    this.availableVideos = this.extractDeployedVideos(this.cachedConfiguration)
      .filter(v => !associatedFilenames.has(v.filename));
    this.availableVideosLoading = false;
    this.cdr.markForCheck();
  }

  addVideo(): void {
    if (!this.selectedVideoFilename || !this.expandedSponsorId) return;

    this.addingVideo = true;
    this.cdr.markForCheck();

    this.sitesService.addVideoToSiteSponsor(
      this.siteId, this.expandedSponsorId, this.selectedVideoFilename
    ).subscribe({
      next: () => {
        this.notification.success('Vidéo associée au sponsor');
        this.addingVideo = false;
        this.selectedVideoFilename = '';
        // Refresh stats (includes videos) + available videos
        this.refreshSponsorDetail();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de l\'association de la vidéo');
        this.addingVideo = false;
        this.cdr.markForCheck();
      },
    });
  }

  async removeVideo(filename: string): Promise<void> {
    if (!this.expandedSponsorId) return;
    const ok = await this.confirmDialog.confirm(`Retirer la vidéo "${filename}" de ce sponsor ?`);
    if (!ok) return;

    this.removingVideoFilename = filename;
    this.cdr.markForCheck();

    this.sitesService.removeVideoFromSiteSponsor(
      this.siteId, this.expandedSponsorId, filename
    ).subscribe({
      next: () => {
        this.notification.success('Vidéo retirée du sponsor');
        this.removingVideoFilename = null;
        // Refresh stats (includes videos) + available videos
        this.refreshSponsorDetail();
        this.cdr.markForCheck();
      },
      error: () => {
        this.notification.error('Erreur lors de la suppression');
        this.removingVideoFilename = null;
        this.cdr.markForCheck();
      },
    });
  }

  private refreshSponsorDetail(): void {
    if (!this.expandedSponsorId) return;
    const sponsorId = this.expandedSponsorId;

    this.sitesService.getSiteSponsorStats(this.siteId, sponsorId).subscribe({
      next: (stats) => {
        this.detailStats = stats;
        this.cdr.markForCheck();
        // Refresh available videos with updated association list
        this.loadAvailableVideos();
        // Also refresh the sponsor list (video_count in table)
        this.loadSponsors();
      },
    });
  }

  // =========================================================================
  // Loop presence detection (video-not-in-loop warning)
  // =========================================================================

  /**
   * Single API call that loads the site config and caches it for reuse by
   * loadWizardVideos(), loadAvailableVideos(), and loop detection.
   */
  private loadSiteContentOnce(): void {
    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (content) => {
        this.cachedConfiguration = content.configuration ?? null;
        this.buildVideosInLoopsSet(this.cachedConfiguration);
        this.configLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cachedConfiguration = null;
        this.configLoaded = false;
      },
    });
  }

  /**
   * Extracts all unique video filenames deployed in the site config
   * and returns them as CloudVideo-compatible objects for the dropdown.
   */
  private extractDeployedVideos(config: SiteConfiguration | null): CloudVideo[] {
    if (!config) return [];
    // Map: bare filename → display name (from config "name" field)
    const seen = new Map<string, string>();

    const addVideo = (path: string, displayName?: string): void => {
      if (!path) return;
      const parts = path.split('/');
      const filename = parts[parts.length - 1];
      if (filename && !seen.has(filename)) {
        seen.set(filename, displayName || '');
      }
    };

    // Global loop
    for (const v of config.sponsors ?? []) {
      addVideo(v.path, v.name);
    }
    // Phase loops
    for (const tc of config.timeCategories ?? []) {
      for (const v of tc.loopVideos ?? []) {
        addVideo(v.path, v.name);
      }
    }
    // Categories + subcategories
    for (const cat of config.categories ?? []) {
      for (const v of cat.videos ?? []) {
        addVideo(v.path, v.name);
      }
      for (const sub of cat.subCategories ?? []) {
        for (const v of sub.videos ?? []) {
          addVideo(v.path, v.name);
        }
      }
    }

    // One entry per video: filename as key, display name as readable title
    return Array.from(seen.entries()).map(([filename, displayName]) => ({
      id: '',
      filename,
      originalName: filename,
      title: displayName || filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      category: null,
      subcategory: null,
      size: 0,
      duration: null,
      checksum: null,
      url: '',
      uploadedForSiteId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Extracts all video filenames present in the site configuration loops and categories.
   * Covers: config.sponsors[], config.timeCategories[].loopVideos[],
   * config.categories[].videos[], config.categories[].subCategories[].videos[]
   */
  private buildVideosInLoopsSet(config: SiteConfiguration | null): void {
    this.videosInLoops = new Set();
    if (!config) return;

    // Helper to extract bare filename from a path like "videos/BOUCLE/video.mp4"
    const extractFilename = (path: string): string => {
      const parts = path.split('/');
      return parts[parts.length - 1];
    };

    // 1. Global loop (config.sponsors[] — legacy name for loop videos)
    for (const loopVideo of config.sponsors ?? []) {
      if (loopVideo.path) {
        this.videosInLoops.add(extractFilename(loopVideo.path));
      }
      if (loopVideo.name) {
        this.videosInLoops.add(loopVideo.name);
      }
    }

    // 2. Time categories loop videos
    for (const tc of config.timeCategories ?? []) {
      for (const loopVideo of tc.loopVideos ?? []) {
        if (loopVideo.path) {
          this.videosInLoops.add(extractFilename(loopVideo.path));
        }
        if (loopVideo.name) {
          this.videosInLoops.add(loopVideo.name);
        }
      }
    }

    // 3. Category videos and subcategory videos
    for (const cat of config.categories ?? []) {
      for (const video of cat.videos ?? []) {
        if (video.path) {
          this.videosInLoops.add(extractFilename(video.path));
        }
        if (video.name) {
          this.videosInLoops.add(video.name);
        }
      }
      for (const subCat of cat.subCategories ?? []) {
        for (const video of subCat.videos ?? []) {
          if (video.path) {
            this.videosInLoops.add(extractFilename(video.path));
          }
          if (video.name) {
            this.videosInLoops.add(video.name);
          }
        }
      }
    }
  }

  /**
   * Returns true if the sponsor has videos that are NOT found in any loop or category.
   */
  hasVideosNotInLoop(sponsor: SiteSponsor): boolean {
    if (!this.configLoaded) return false;
    const filenames = sponsor.video_filenames ?? [];
    if (filenames.length === 0) return false;
    return filenames.some(f => !this.videosInLoops.has(f));
  }

  /**
   * Returns true if a specific video filename is NOT in any loop or category.
   */
  isVideoNotInLoop(filename: string): boolean {
    if (!this.configLoaded) return false;
    return !this.videosInLoops.has(filename);
  }

  /**
   * Returns the count of sponsor videos missing from loops/categories.
   */
  getVideosNotInLoopCount(sponsor: SiteSponsor): number {
    if (!this.configLoaded) return 0;
    const filenames = sponsor.video_filenames ?? [];
    return filenames.filter(f => !this.videosInLoops.has(f)).length;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  // =========================================================================
  // Config complete/incomplete indicator (F-AUD-24)
  // =========================================================================

  isConfigComplete(sponsor: SiteSponsor): boolean {
    return (sponsor.video_count ?? 0) >= 1;
  }

  getConfigTooltip(sponsor: SiteSponsor): string {
    if (this.isConfigComplete(sponsor)) {
      return 'Ce sponsor est correctement configuré et diffusé';
    }
    if ((sponsor.video_count ?? 0) === 0) {
      return 'Aucune vidéo associée — ce sponsor ne sera pas diffusé';
    }
    return 'Configuration incomplète';
  }

  getConfigCta(sponsor: SiteSponsor): string {
    if ((sponsor.video_count ?? 0) === 0) {
      return '+ Ajouter une vidéo';
    }
    return 'Configurer';
  }

  formatScreenTime(seconds: number): string {
    if (!seconds) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  }

  // =========================================================================
  // Sync status badge (F-AUD-23)
  // =========================================================================

  get syncStatusClass(): string {
    if (!this.site) return 'sync-unknown';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) {
      return 'sync-pending';
    }

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'sync-unknown';

    const ageMs = Date.now() - new Date(lastSync).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours < 24) return 'sync-ok';
    if (ageHours < 72) return 'sync-unknown';
    return 'sync-stale';
  }

  get syncStatusIcon(): string {
    if (!this.site) return '⚪';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) return '🟡';

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return '⚪';

    const ageHours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) return '🟢';
    if (ageHours < 72) return '⚪';
    return '🔴';
  }

  get syncStatusLabel(): string {
    if (!this.site) return 'Sync inconnue';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) return 'Sync en cours…';

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'Jamais synchronisé';

    return `Sync ${this.formatRelativeTime(lastSync)}`;
  }

  get syncTooltip(): string {
    if (!this.site) return 'État de synchronisation inconnu';

    const pendingUntil = this.site.config_update_pending_until;
    if (pendingUntil && new Date(pendingUntil) > new Date()) {
      return 'Un déploiement de configuration est en cours vers le Pi';
    }

    const lastSync = this.site.last_config_sync;
    if (!lastSync) return 'Le Pi n\'a jamais synchronisé sa configuration';

    const ageHours = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    const formatted = new Date(lastSync).toLocaleString('fr-FR');

    if (ageHours < 24) {
      return `Configuration synchronisée avec le Pi le ${formatted}`;
    }
    if (ageHours < 72) {
      return `Dernière sync le ${formatted} — le Pi ne s'est pas reconnecté récemment`;
    }
    return `Sync obsolète (${formatted}) — vérifier la connexion du Pi`;
  }

  private formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'à l\'instant';
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  }
}
