import {
  Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Site, SiteSponsor, SiteSponsorVideo, SiteSponsorStatsResponse, SiteSponsorDailyTrend, GeneratedReport, SiteSponsorBenchmarkResponse } from '../../../../core/models';

Chart.register(...registerables);

@Component({
  selector: 'app-site-sponsors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Loading -->
    <div class="loading" *ngIf="loading">
      <div class="spinner"></div>
      <p>Chargement des sponsors...</p>
    </div>

    <!-- Error -->
    <div class="error-banner" *ngIf="error">
      <span>{{ error }}</span>
      <button class="btn btn-sm" (click)="loadSponsors()">Réessayer</button>
    </div>

    <!-- Content -->
    <div class="sponsors-tab" *ngIf="!loading">
      <!-- Header -->
      <div class="tab-header">
        <h3>
          <span class="section-icon">💼</span>
          Sponsors du club
          <span class="count-badge" *ngIf="sponsors.length">{{ sponsors.length }}</span>
        </h3>
        <button class="btn btn-primary" (click)="openCreateModal()">+ Ajouter sponsor</button>
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
              <td>{{ sponsor.video_count || 0 }}</td>
              <td>{{ sponsor.total_impressions || 0 }}</td>
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
              <td colspan="6">
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
                  <div class="videos-section" *ngIf="detailStats.videos?.length">
                    <h4>Vidéos associées ({{ detailStats.videos.length }})</h4>
                    <div class="video-chips">
                      <span class="video-chip" *ngFor="let v of detailStats.videos">
                        🎬 {{ v.video_filename }}
                        <span class="chip-primary" *ngIf="v.is_primary">Principal</span>
                      </span>
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

    <!-- Create/Edit Modal -->
    <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>{{ isEditing ? 'Modifier' : 'Nouveau' }} sponsor</h3>
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
          <div class="form-group" *ngIf="isEditing">
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
              {{ saving ? 'Enregistrement...' : (isEditing ? 'Enregistrer' : 'Créer') }}
            </button>
          </div>
        </form>
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
    .section-icon { font-size: 1.2rem; }
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
  `],
})
export class SiteSponsorsTabComponent implements OnInit, OnDestroy {
  @Input() siteId = '';
  @Input() site: Site | null = null;

  @ViewChild('trendsChart') trendsChartRef!: ElementRef<HTMLCanvasElement>;

  private readonly sitesService = inject(SitesService);
  private readonly notification = inject(NotificationService);
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

  // Benchmark (P6.2)
  benchmarkData: SiteSponsorBenchmarkResponse | null = null;
  benchmarkLoading = false;
  benchmarkHasCpi = false;

  // Report generation
  generatingReportId: string | null = null;

  // Access link (P5)
  expandedSponsor: SiteSponsor | null = null;
  creatingAccessLink = false;
  accessLinkUrl: string | null = null;
  accessLinkCopied = false;

  ngOnInit(): void {
    this.loadSponsors();
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
    this.cdr.markForCheck();

    // Load stats + reports + benchmark in parallel
    this.sitesService.getSiteSponsorStats(this.siteId, sponsor.id).subscribe({
      next: (stats) => {
        this.detailStats = stats;
        this.detailLoading = false;
        this.cdr.markForCheck();
        // Render chart after next tick
        setTimeout(() => this.renderTrendsChart(), 50);
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

  confirmDelete(sponsor: SiteSponsor): void {
    if (!confirm(`Supprimer le sponsor "${sponsor.name}" ? Cette action est irréversible.`)) return;

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
  // Helpers
  // =========================================================================

  formatScreenTime(seconds: number): string {
    if (!seconds) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  }
}
