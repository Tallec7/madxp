import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  SponsorPortalService,
  SponsorDashboard,
  SponsorSite,
  SponsorVideo,
  PortalCampaign,
  PortalCampaignDetail
} from '../../core/services/sponsor-portal.service';

@Component({
  selector: 'app-sponsor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <!-- Loading -->
      <div class="loading-container" *ngIf="loading && !dashboard && !hasError">
        <div class="spinner"></div>
        <p>Chargement de votre tableau de bord...</p>
      </div>

      <!-- Error state -->
      <div class="error-banner" *ngIf="hasError && !dashboard">
        <div class="error-icon">⚠️</div>
        <h2>Impossible de charger vos statistiques</h2>
        <p>Vérifiez votre connexion internet et réessayez.</p>
        <button class="btn btn-primary" (click)="retryAll()">🔄 Réessayer</button>
      </div>

      <div class="header">
        <div class="sponsor-info" *ngIf="dashboard?.advertiser">
          <img *ngIf="dashboard?.advertiser?.logo_url"
               [src]="dashboard?.advertiser?.logo_url"
               [alt]="dashboard?.advertiser?.name"
               class="sponsor-logo">
          <div>
            <h1>{{ dashboard?.advertiser?.name }}</h1>
            <span class="badge" [class]="'badge-' + dashboard?.advertiser?.status">
              {{ dashboard?.advertiser?.status }}
            </span>
          </div>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="tabs">
        <button class="tab-btn"
                [class.active]="activeTab === 'dashboard'"
                (click)="switchTab('dashboard')">
          Tableau de bord
        </button>
        <button class="tab-btn"
                [class.active]="activeTab === 'campaigns' || activeTab === 'campaign-detail'"
                (click)="switchTab('campaigns')">
          Campagnes
        </button>
      </div>

      <!-- ==================== DASHBOARD TAB ==================== -->
      <ng-container *ngIf="activeTab === 'dashboard'">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-header">
              <h3>Vidéos</h3>
              <span class="stat-icon">📹</span>
            </div>
            <div class="stat-value">{{ dashboard?.stats?.total_videos || 0 }}</div>
            <div class="stat-footer">Vidéos actives</div>
          </div>

          <div class="stat-card stat-primary">
            <div class="stat-header">
              <h3>Sites</h3>
              <span class="stat-icon">🖥️</span>
            </div>
            <div class="stat-value">{{ dashboard?.stats?.total_sites || 0 }}</div>
            <div class="stat-footer">Sites de diffusion</div>
          </div>

          <div class="stat-card stat-success">
            <div class="stat-header">
              <h3>Impressions</h3>
              <span class="stat-icon">👁️</span>
            </div>
            <div class="stat-value">{{ formatNumber(dashboard?.stats?.total_impressions_30d) }}</div>
            <div class="stat-footer">30 derniers jours</div>
          </div>

          <div class="stat-card stat-info">
            <div class="stat-header">
              <h3>Temps d'écran</h3>
              <span class="stat-icon">⏱️</span>
            </div>
            <div class="stat-value">{{ formatDuration(dashboard?.stats?.total_screen_time_30d) }}</div>
            <div class="stat-footer">30 derniers jours</div>
          </div>
        </div>

        <!-- Nouvelles métriques Reach -->
        <div class="reach-section" *ngIf="hasReachData()">
          <h2 class="section-title">📊 Portée & Audience</h2>
          <div class="reach-grid">
            <div class="reach-card">
              <div class="reach-icon">👥</div>
              <div class="reach-content">
                <div class="reach-value">{{ formatNumber(dashboard?.stats?.total_reach_30d) }}</div>
                <div class="reach-label">Spectateurs exposés</div>
                <div class="reach-hint">Audience totale des matchs où vos vidéos ont été diffusées</div>
              </div>
            </div>
            <div class="reach-card">
              <div class="reach-icon">🏟️</div>
              <div class="reach-content">
                <div class="reach-value">{{ dashboard?.stats?.matches_with_ads_30d || 0 }}</div>
                <div class="reach-label">Matchs avec diffusion</div>
                <div class="reach-hint">Nombre de matchs où vos publicités ont été vues</div>
              </div>
            </div>
            <div class="reach-card">
              <div class="reach-icon">📈</div>
              <div class="reach-content">
                <div class="reach-value">{{ dashboard?.stats?.avg_audience_per_match || 0 }}</div>
                <div class="reach-label">Audience moyenne / match</div>
                <div class="reach-hint">Nombre moyen de spectateurs par match</div>
              </div>
            </div>
            <div class="reach-card highlight">
              <div class="reach-icon">💰</div>
              <div class="reach-content">
                <div class="reach-value">{{ calculateCPM() }}</div>
                <div class="reach-label">CPM estimé</div>
                <div class="reach-hint">Coût pour 1000 impressions (contactez-nous pour plus de détails)</div>
              </div>
            </div>
          </div>
        </div>

        <div class="content-grid">
          <div class="card">
            <div class="card-header">
              <h2>📍 Sites de diffusion</h2>
            </div>
            <div class="sites-list">
              <div *ngFor="let site of sites" class="site-item">
                <span class="site-status" [class]="'status-' + site.status">●</span>
                <div class="site-info">
                  <div class="site-name">{{ site.club_name }}</div>
                  <div class="site-meta">{{ site.site_name }}</div>
                </div>
                <div class="site-stats">
                  <div class="stat-mini">
                    <span class="stat-label">Impressions</span>
                    <span class="stat-num">{{ site.impressions_30d }}</span>
                  </div>
                </div>
              </div>
              <div *ngIf="sites.length === 0" class="empty-state">
                <p>Aucun site de diffusion configuré</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2>🎬 Vos vidéos</h2>
            </div>
            <div class="videos-list">
              <div *ngFor="let video of videos" class="video-item">
                <div class="video-thumb">
                  <img *ngIf="video.thumbnail_url" [src]="video.thumbnail_url" alt="">
                  <div *ngIf="!video.thumbnail_url" class="video-placeholder">📹</div>
                </div>
                <div class="video-info">
                  <div class="video-name">{{ video.filename }}</div>
                  <div class="video-meta">
                    <span>{{ video.impressions_30d }} impressions</span>
                    <span class="separator">•</span>
                    <span>{{ video.completion_rate }}% complet</span>
                  </div>
                </div>
              </div>
              <div *ngIf="videos.length === 0" class="empty-state">
                <p>Aucune vidéo associée</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card trends-card">
          <h2>📊 Tendances (7 derniers jours)</h2>
          <div class="trends-chart">
            <div *ngFor="let trend of dashboard?.trends" class="trend-bar-container">
              <div class="trend-bar"
                   [style.height.%]="getTrendHeight(trend.impressions)">
              </div>
              <div class="trend-label">{{ formatDate(trend.date) }}</div>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- ==================== CAMPAIGNS LIST TAB ==================== -->
      <ng-container *ngIf="activeTab === 'campaigns'">
        <div class="campaigns-toolbar">
          <h2 class="section-title">Campagnes</h2>
          <div class="campaigns-filter">
            <select [(ngModel)]="campaignStatusFilter" (ngModelChange)="loadCampaigns()">
              <option value="">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="active">Active</option>
              <option value="paused">En pause</option>
              <option value="completed">Terminée</option>
              <option value="failed">Échouée</option>
            </select>
          </div>
        </div>

        <div class="loading-container" *ngIf="campaignsLoading">
          <div class="spinner"></div>
          <p>Chargement des campagnes...</p>
        </div>

        <div class="campaigns-grid" *ngIf="!campaignsLoading">
          <div *ngFor="let campaign of campaigns"
               class="campaign-card"
               (click)="openCampaignDetail(campaign.id)">
            <div class="campaign-card-header">
              <div class="campaign-name">{{ campaign.name }}</div>
              <span class="campaign-badge" [ngClass]="getCampaignStatusBadgeClass(campaign.status)">
                {{ campaign.status }}
              </span>
            </div>
            <div class="campaign-type">{{ campaign.campaign_type }}</div>
            <div class="campaign-dates" *ngIf="campaign.start_date || campaign.end_date">
              <span *ngIf="campaign.start_date">{{ formatCampaignDate(campaign.start_date) }}</span>
              <span *ngIf="campaign.start_date && campaign.end_date"> → </span>
              <span *ngIf="campaign.end_date">{{ formatCampaignDate(campaign.end_date) }}</span>
            </div>
            <div class="campaign-metrics">
              <div class="campaign-metric">
                <span class="campaign-metric-value">{{ campaign.videos_count }}</span>
                <span class="campaign-metric-label">Vidéos</span>
              </div>
              <div class="campaign-metric">
                <span class="campaign-metric-value">{{ campaign.sites_count }}</span>
                <span class="campaign-metric-label">Sites</span>
              </div>
              <div class="campaign-metric">
                <span class="campaign-metric-value">{{ formatNumber(campaign.total_impressions) }}</span>
                <span class="campaign-metric-label">Impressions</span>
              </div>
              <div class="campaign-metric">
                <span class="campaign-metric-value">{{ campaign.avg_completion_rate }}%</span>
                <span class="campaign-metric-label">Complétion</span>
              </div>
            </div>
            <div class="campaign-progress" *ngIf="campaign.progress_percent !== null">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill"
                     [style.width.%]="getCampaignProgressWidth(campaign)">
                </div>
              </div>
              <span class="progress-text">{{ campaign.progress_percent }}%</span>
            </div>
          </div>

          <div *ngIf="campaigns.length === 0" class="empty-state card">
            <p>Aucune campagne trouvée</p>
          </div>
        </div>
      </ng-container>

      <!-- ==================== CAMPAIGN DETAIL TAB ==================== -->
      <ng-container *ngIf="activeTab === 'campaign-detail' && selectedCampaign">
        <div class="campaign-detail-header">
          <button class="back-btn" (click)="backToCampaigns()">← Retour aux campagnes</button>
          <div class="campaign-detail-title">
            <h2>{{ selectedCampaign.campaign.name }}</h2>
            <span class="campaign-badge" [ngClass]="getCampaignStatusBadgeClass(selectedCampaign.campaign.status)">
              {{ selectedCampaign.campaign.status }}
            </span>
          </div>
          <div class="campaign-detail-meta">
            <span class="campaign-type">{{ selectedCampaign.campaign.campaign_type }}</span>
            <span *ngIf="selectedCampaign.campaign.start_date || selectedCampaign.campaign.end_date" class="campaign-dates">
              <span *ngIf="selectedCampaign.campaign.start_date">{{ formatCampaignDate(selectedCampaign.campaign.start_date) }}</span>
              <span *ngIf="selectedCampaign.campaign.start_date && selectedCampaign.campaign.end_date"> → </span>
              <span *ngIf="selectedCampaign.campaign.end_date">{{ formatCampaignDate(selectedCampaign.campaign.end_date) }}</span>
            </span>
          </div>
        </div>

        <!-- Campaign KPI cards -->
        <div class="stats-grid" *ngIf="selectedCampaign.stats">
          <div class="stat-card stat-success">
            <div class="stat-header">
              <h3>Impressions</h3>
              <span class="stat-icon">👁️</span>
            </div>
            <div class="stat-value">{{ formatNumber(selectedCampaign.stats.total_impressions) }}</div>
            <div class="stat-footer">Total campagne</div>
          </div>

          <div class="stat-card stat-info">
            <div class="stat-header">
              <h3>Temps d'écran</h3>
              <span class="stat-icon">⏱️</span>
            </div>
            <div class="stat-value">{{ formatDuration(selectedCampaign.stats.total_screen_time_seconds) }}</div>
            <div class="stat-footer">Total campagne</div>
          </div>

          <div class="stat-card stat-primary">
            <div class="stat-header">
              <h3>Complétion</h3>
              <span class="stat-icon">✅</span>
            </div>
            <div class="stat-value">{{ selectedCampaign.stats.avg_completion_rate }}%</div>
            <div class="stat-footer">Taux moyen</div>
          </div>

          <div class="stat-card" *ngIf="selectedCampaign.stats.effective_cpm_cents !== null">
            <div class="stat-header">
              <h3>CPM effectif</h3>
              <span class="stat-icon">💰</span>
            </div>
            <div class="stat-value">{{ (selectedCampaign.stats.effective_cpm_cents / 100).toFixed(2) }}€</div>
            <div class="stat-footer">Coût pour 1000 impressions</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="card campaign-progress-card" *ngIf="selectedCampaign.stats?.progress_percent !== null && selectedCampaign.stats?.progress_percent !== undefined">
          <h3>Progression de la campagne</h3>
          <div class="campaign-progress-large">
            <div class="progress-bar-bg large">
              <div class="progress-bar-fill"
                   [style.width.%]="Math.min(selectedCampaign.stats!.progress_percent!, 100)">
              </div>
            </div>
            <span class="progress-text-large">{{ selectedCampaign.stats!.progress_percent }}%</span>
          </div>
          <div class="progress-detail" *ngIf="selectedCampaign.campaign.target_impressions">
            {{ formatNumber(selectedCampaign.stats!.total_impressions) }}
            / {{ formatNumber(selectedCampaign.campaign.target_impressions) }} impressions cibles
          </div>
        </div>

        <!-- Daily impressions chart -->
        <div class="card trends-card" *ngIf="selectedCampaign.daily_impressions.length > 0">
          <h2>📊 Impressions quotidiennes</h2>
          <div class="trends-chart">
            <div *ngFor="let day of selectedCampaign.daily_impressions" class="trend-bar-container">
              <div class="trend-bar campaign-trend-bar"
                   [style.height.%]="getCampaignTrendHeight(day.impressions)">
              </div>
              <div class="trend-label">{{ formatDate(day.date) }}</div>
            </div>
          </div>
        </div>

        <!-- Videos table -->
        <div class="card" *ngIf="selectedCampaign.videos.length > 0">
          <div class="card-header">
            <h2>🎬 Vidéos de la campagne</h2>
          </div>
          <div class="campaign-table-container">
            <table class="campaign-table">
              <thead>
                <tr>
                  <th>Fichier</th>
                  <th>Poids</th>
                  <th>Durée</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let video of selectedCampaign.videos">
                  <td class="video-filename">{{ video.original_name || video.filename }}</td>
                  <td>{{ video.weight }}x</td>
                  <td>{{ video.duration ? (video.duration + 's') : '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sites table -->
        <div class="card" *ngIf="selectedCampaign.sites.length > 0">
          <div class="card-header">
            <h2>📍 Sites ciblés</h2>
          </div>
          <div class="campaign-table-container">
            <table class="campaign-table">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Site</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let site of selectedCampaign.sites">
                  <td class="site-club-name">{{ site.club_name }}</td>
                  <td>{{ site.site_name }}</td>
                  <td>
                    <span class="deployment-badge" [ngClass]="'deploy-' + site.deployment_status">
                      {{ site.deployment_status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>

      <!-- Campaign detail loading -->
      <div class="loading-container" *ngIf="activeTab === 'campaign-detail' && !selectedCampaign">
        <div class="spinner"></div>
        <p>Chargement de la campagne...</p>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-banner {
      text-align: center;
      padding: 3rem 2rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 12px;
      margin-bottom: 2rem;
    }

    .error-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .error-banner h2 {
      color: #991b1b;
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
    }

    .error-banner p {
      color: #b91c1c;
      margin: 0 0 1.5rem 0;
    }

    .error-banner .btn-primary {
      background: #2563eb;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
    }

    .error-banner .btn-primary:hover {
      background: #1d4ed8;
    }

    .header {
      margin-bottom: 1.5rem;
    }

    .sponsor-info {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .sponsor-logo {
      width: 80px;
      height: 80px;
      object-fit: contain;
      border-radius: 12px;
      background: white;
      padding: 0.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    /* ===== Tabs ===== */
    .tabs {
      display: flex;
      gap: 0;
      margin-bottom: 2rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .tab-btn {
      padding: 0.75rem 1.5rem;
      border: none;
      background: none;
      font-size: 0.95rem;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: color 0.2s, border-color 0.2s;
    }

    .tab-btn:hover {
      color: #334155;
    }

    .tab-btn.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #64748b;
    }

    .stat-card.stat-primary { border-left-color: #2563eb; }
    .stat-card.stat-success { border-left-color: #10b981; }
    .stat-card.stat-info { border-left-color: #0ea5e9; }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .stat-header h3 {
      margin: 0;
      font-size: 0.875rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }

    .stat-icon { font-size: 1.5rem; }
    .stat-value {
      font-size: 2.25rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-footer {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.5rem;
    }

    .content-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1024px) {
      .content-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-bottom: 1.5rem;
    }

    .card-header {
      margin-bottom: 1.5rem;
    }

    .card h2 {
      font-size: 1.25rem;
      margin: 0;
      color: #0f172a;
    }

    .sites-list, .videos-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .site-item, .video-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .site-status {
      font-size: 0.75rem;
    }

    .status-online { color: #10b981; }
    .status-offline { color: #64748b; }
    .status-error { color: #ef4444; }

    .site-info, .video-info {
      flex: 1;
    }

    .site-name, .video-name {
      font-weight: 600;
      color: #0f172a;
    }

    .site-meta, .video-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .separator { margin: 0 0.5rem; }

    .stat-mini {
      text-align: right;
    }

    .stat-label {
      display: block;
      font-size: 0.65rem;
      color: #94a3b8;
      text-transform: uppercase;
    }

    .stat-num {
      font-weight: 700;
      color: #0f172a;
    }

    .video-thumb {
      width: 60px;
      height: 45px;
      border-radius: 6px;
      overflow: hidden;
      background: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .video-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-placeholder {
      font-size: 1.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }

    .trends-card h2 {
      margin-bottom: 1.5rem;
    }

    .trends-chart {
      display: flex;
      justify-content: space-around;
      align-items: flex-end;
      height: 200px;
      gap: 1rem;
      padding: 1rem 0;
    }

    .trend-bar-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
    }

    .trend-bar {
      width: 100%;
      max-width: 40px;
      background: linear-gradient(to top, #2563eb, #3b82f6);
      border-radius: 4px 4px 0 0;
      min-height: 4px;
      margin-top: auto;
    }

    .campaign-trend-bar {
      background: linear-gradient(to top, #10b981, #34d399);
    }

    .trend-label {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 0.5rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-active { background: #dcfce7; color: #166534; }
    .badge-inactive { background: #f1f5f9; color: #475569; }
    .badge-paused { background: #fef3c7; color: #92400e; }

    /* Section Reach */
    .reach-section {
      margin-bottom: 2rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 1rem;
    }

    .reach-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
    }

    .reach-card {
      display: flex;
      gap: 1rem;
      padding: 1.5rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }

    .reach-card.highlight {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-color: #0ea5e9;
    }

    .reach-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border-radius: 12px;
    }

    .reach-card.highlight .reach-icon {
      background: white;
    }

    .reach-content {
      flex: 1;
    }

    .reach-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
    }

    .reach-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #475569;
      margin-top: 0.25rem;
    }

    .reach-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-top: 0.375rem;
      line-height: 1.4;
    }

    /* ===== Campaigns List ===== */
    .campaigns-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .campaigns-toolbar .section-title {
      margin-bottom: 0;
    }

    .campaigns-filter select {
      padding: 0.5rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      color: #334155;
      background: white;
      cursor: pointer;
    }

    .campaigns-filter select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .campaigns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.5rem;
    }

    .campaign-card {
      background: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      transition: box-shadow 0.2s, transform 0.2s;
      border: 1px solid #e2e8f0;
    }

    .campaign-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
      transform: translateY(-2px);
    }

    .campaign-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }

    .campaign-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
    }

    .campaign-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.025em;
      white-space: nowrap;
    }

    .campaign-badge-draft { background: #f1f5f9; color: #475569; }
    .campaign-badge-active { background: #dcfce7; color: #166534; }
    .campaign-badge-paused { background: #fef3c7; color: #92400e; }
    .campaign-badge-completed { background: #dbeafe; color: #1e40af; }
    .campaign-badge-failed { background: #fef2f2; color: #991b1b; }

    .campaign-type {
      font-size: 0.8rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .campaign-dates {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 1rem;
    }

    .campaign-metrics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
    }

    .campaign-metric {
      text-align: center;
    }

    .campaign-metric-value {
      display: block;
      font-size: 1.1rem;
      font-weight: 700;
      color: #0f172a;
    }

    .campaign-metric-label {
      display: block;
      font-size: 0.65rem;
      color: #94a3b8;
      text-transform: uppercase;
      margin-top: 0.125rem;
    }

    .campaign-progress {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .progress-bar-bg {
      flex: 1;
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-bg.large {
      height: 10px;
      border-radius: 5px;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(to right, #2563eb, #3b82f6);
      border-radius: inherit;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
      white-space: nowrap;
    }

    /* ===== Campaign Detail ===== */
    .campaign-detail-header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #2563eb;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      margin-bottom: 1rem;
    }

    .back-btn:hover {
      color: #1d4ed8;
      text-decoration: underline;
    }

    .campaign-detail-title {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .campaign-detail-title h2 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
    }

    .campaign-detail-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: #64748b;
      font-size: 0.875rem;
    }

    .campaign-progress-card h3 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      color: #0f172a;
    }

    .campaign-progress-large {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .progress-text-large {
      font-size: 1.25rem;
      font-weight: 700;
      color: #2563eb;
      white-space: nowrap;
    }

    .progress-detail {
      font-size: 0.8rem;
      color: #94a3b8;
    }

    /* Campaign tables */
    .campaign-table-container {
      overflow-x: auto;
    }

    .campaign-table {
      width: 100%;
      border-collapse: collapse;
    }

    .campaign-table th {
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      border-bottom: 2px solid #e2e8f0;
    }

    .campaign-table td {
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      color: #334155;
      border-bottom: 1px solid #f1f5f9;
    }

    .campaign-table tr:last-child td {
      border-bottom: none;
    }

    .video-filename {
      font-weight: 500;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .site-club-name {
      font-weight: 600;
    }

    .deployment-badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .deploy-deployed { background: #dcfce7; color: #166534; }
    .deploy-pending { background: #fef3c7; color: #92400e; }
    .deploy-deploying { background: #dbeafe; color: #1e40af; }
    .deploy-failed { background: #fef2f2; color: #991b1b; }

    @media (max-width: 768px) {
      .campaigns-toolbar {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }

      .campaigns-grid {
        grid-template-columns: 1fr;
      }

      .campaign-metrics {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class SponsorDashboardComponent implements OnInit {
  private readonly sponsorService = inject(SponsorPortalService);

  // Expose Math to the template
  Math = Math;

  // Dashboard data
  dashboard: SponsorDashboard | null = null;
  sites: SponsorSite[] = [];
  videos: SponsorVideo[] = [];
  maxImpressions = 1;
  loading = true;
  hasError = false;
  private errorCount = 0;

  // Tabs
  activeTab: 'dashboard' | 'campaigns' | 'campaign-detail' = 'dashboard';

  // Campaigns
  campaigns: PortalCampaign[] = [];
  campaignsLoading = false;
  selectedCampaign: PortalCampaignDetail | null = null;
  campaignStatusFilter = '';
  maxCampaignImpressions = 1;

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.loading = true;
    this.hasError = false;
    this.errorCount = 0;
    this.loadDashboard();
    this.loadSites();
    this.loadVideos();
  }

  retryAll(): void {
    this.loadAll();
  }

  private onApiError(): void {
    this.errorCount++;
    // Si les 3 API échouent, afficher l'erreur globale
    if (this.errorCount >= 3) {
      this.hasError = true;
      this.loading = false;
    }
  }

  loadDashboard(): void {
    this.sponsorService.getDashboard().subscribe({
      next: (response) => {
        this.dashboard = response.data;
        this.maxImpressions = Math.max(...(response.data.trends?.map(t => t.impressions) || [1]));
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  loadSites(): void {
    this.sponsorService.getSites().subscribe({
      next: (response) => {
        this.sites = response.data.sites;
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  loadVideos(): void {
    this.sponsorService.getVideos().subscribe({
      next: (response) => {
        this.videos = response.data.videos;
        this.loading = false;
      },
      error: () => this.onApiError()
    });
  }

  // ===== Tab navigation =====

  switchTab(tab: 'dashboard' | 'campaigns'): void {
    this.activeTab = tab;
    if (tab === 'campaigns' && this.campaigns.length === 0) {
      this.loadCampaigns();
    }
  }

  // ===== Campaigns =====

  loadCampaigns(): void {
    this.campaignsLoading = true;
    const status = this.campaignStatusFilter || undefined;
    this.sponsorService.getCampaigns(status).subscribe({
      next: (response) => {
        this.campaigns = response.data.campaigns;
        this.campaignsLoading = false;
      },
      error: () => {
        this.campaignsLoading = false;
      }
    });
  }

  openCampaignDetail(campaignId: string): void {
    this.activeTab = 'campaign-detail';
    this.selectedCampaign = null;
    this.sponsorService.getCampaignDetail(campaignId).subscribe({
      next: (response) => {
        this.selectedCampaign = response.data;
        this.maxCampaignImpressions = Math.max(
          ...(response.data.daily_impressions?.map(d => d.impressions) || [1])
        );
      },
      error: () => {
        this.activeTab = 'campaigns';
      }
    });
  }

  backToCampaigns(): void {
    this.activeTab = 'campaigns';
    this.selectedCampaign = null;
  }

  getCampaignStatusBadgeClass(status: string): string {
    const classMap: Record<string, string> = {
      draft: 'campaign-badge-draft',
      active: 'campaign-badge-active',
      paused: 'campaign-badge-paused',
      completed: 'campaign-badge-completed',
      failed: 'campaign-badge-failed'
    };
    return classMap[status] || 'campaign-badge-draft';
  }

  getCampaignProgressWidth(campaign: PortalCampaign): number {
    return Math.min(campaign.progress_percent ?? 0, 100);
  }

  formatCampaignDate(dateStr: string | null): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getCampaignTrendHeight(impressions: number): number {
    return (impressions / this.maxCampaignImpressions) * 100;
  }

  // ===== Existing methods =====

  formatNumber(value: number | undefined | null): string {
    if (!value) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  }

  formatDuration(seconds: number | undefined): string {
    if (!seconds) return '0h';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { weekday: 'short' });
  }

  getTrendHeight(impressions: number): number {
    return (impressions / this.maxImpressions) * 100;
  }

  calculateCPM(): string {
    const impressions = this.dashboard?.stats?.total_impressions_30d || 0;

    if (impressions === 0) {
      return 'N/A';
    }

    return 'Contactez-nous';
  }

  hasReachData(): boolean {
    return (this.dashboard?.stats?.total_reach_30d ?? 0) > 0;
  }
}
