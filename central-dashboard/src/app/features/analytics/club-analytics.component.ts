import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription, interval, forkJoin } from 'rxjs';
import {
  AnalyticsService,
  ClubHealthData,
  UsageStats,
  ContentStats,
  AvailabilityData,
  AlertData
} from '../../core/services/analytics.service';
import { SitesService } from '../../core/services/sites.service';
import { Site } from '../../core/models';

type TabType = 'overview' | 'usage' | 'content' | 'health';

@Component({
  selector: 'app-club-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container" *ngIf="site; else loading">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <button class="btn btn-secondary" routerLink="/sites">← Sites</button>
          <button class="btn btn-secondary" [routerLink]="['/sites', siteId]">← Détails site</button>
        </div>
        <h1>Analytics - {{ site.club_name }}</h1>
        <div class="header-actions">
          <select [(ngModel)]="selectedPeriod" (change)="onPeriodChange()" class="period-select">
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
          <button class="btn btn-primary" (click)="exportData()" [disabled]="exporting">
            {{ exporting ? 'Export...' : 'Exporter CSV' }}
          </button>
          <button class="btn btn-success" (click)="downloadPdf()" [disabled]="exportingPdf">
            {{ exportingPdf ? 'Génération...' : '📥 Télécharger PDF' }}
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab"
          [class.active]="activeTab === 'overview'"
          (click)="activeTab = 'overview'"
        >
          Vue d'ensemble
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'usage'"
          (click)="activeTab = 'usage'"
        >
          Utilisation
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'content'"
          (click)="activeTab = 'content'"
        >
          Contenu
        </button>
        <button
          class="tab"
          [class.active]="activeTab === 'health'"
          (click)="activeTab = 'health'"
        >
          Santé Système
        </button>
      </div>

      <!-- Overview Tab -->
      <div class="tab-content" *ngIf="activeTab === 'overview'">
        <!-- KPIs -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon status-icon" [class.online]="health?.status === 'online'">
              {{ health?.status === 'online' ? '🟢' : '🔴' }}
            </div>
            <div class="kpi-content">
              <div class="kpi-value">{{ health?.status || 'N/A' }}</div>
              <div class="kpi-label">Statut actuel</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon">📊</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ usage?.total_plays || 0 }}</div>
              <div class="kpi-label">Vidéos jouées ({{ selectedPeriod }}j)</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon">⏱️</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ formatDuration(usage?.total_duration || 0) }}</div>
              <div class="kpi-label">Temps de diffusion</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon">✅</div>
            <div class="kpi-content">
              <div class="kpi-value">{{ health?.availability_24h?.toFixed(1) || 0 }}%</div>
              <div class="kpi-label">Disponibilité 24h</div>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <!-- Daily Plays Chart -->
          <div class="card chart-card">
            <h3>Lectures par jour</h3>
            <div class="simple-chart" *ngIf="usage?.daily_breakdown?.length">
              <div class="chart-bars">
                <div
                  *ngFor="let day of usage?.daily_breakdown"
                  class="chart-bar-container"
                  [title]="day.date + ': ' + day.plays + ' lectures'"
                >
                  <div
                    class="chart-bar"
                    [style.height.%]="getBarHeight(day.plays, getMaxPlays())"
                  ></div>
                  <div class="chart-label">{{ formatChartDate(day.date) }}</div>
                </div>
              </div>
            </div>
            <p class="no-data" *ngIf="!usage?.daily_breakdown?.length">Pas de données</p>
          </div>

          <!-- Categories Breakdown -->
          <div class="card chart-card">
            <h3>Répartition par catégorie</h3>
            <div class="categories-list" *ngIf="content?.categories_breakdown?.length">
              <div
                *ngFor="let cat of content?.categories_breakdown?.slice(0, 5)"
                class="category-item"
              >
                <div class="category-info">
                  <span class="category-name">{{ cat.category || 'Non catégorisé' }}</span>
                  <span class="category-count">{{ cat.play_count }} lectures</span>
                </div>
                <div class="category-bar">
                  <div
                    class="category-fill"
                    [style.width.%]="getCategoryPercent(cat.play_count)"
                  ></div>
                </div>
              </div>
            </div>
            <p class="no-data" *ngIf="!content?.categories_breakdown?.length">Pas de données</p>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card">
          <h3>Activité récente</h3>
          <div class="activity-list" *ngIf="recentAlerts?.length">
            <div
              *ngFor="let alert of recentAlerts.slice(0, 5)"
              class="activity-item"
              [class.resolved]="alert.resolved"
            >
              <div class="activity-icon" [class]="'severity-' + alert.severity">
                {{ getSeverityIcon(alert.severity) }}
              </div>
              <div class="activity-content">
                <div class="activity-message">{{ alert.message }}</div>
                <div class="activity-time">{{ formatDate(alert.created_at) }}</div>
              </div>
              <div class="activity-status">
                <span class="status-badge" [class.resolved]="alert.resolved">
                  {{ alert.resolved ? 'Résolu' : 'Actif' }}
                </span>
              </div>
            </div>
          </div>
          <p class="no-data" *ngIf="!recentAlerts?.length">Aucune alerte récente</p>
        </div>
      </div>

      <!-- Usage Tab -->
      <div class="tab-content" *ngIf="activeTab === 'usage'">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">▶️</div>
            <div class="stat-value">{{ usage?.total_plays || 0 }}</div>
            <div class="stat-label">Lectures totales</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🎬</div>
            <div class="stat-value">{{ usage?.unique_videos || 0 }}</div>
            <div class="stat-label">Vidéos uniques</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🎯</div>
            <div class="stat-value">{{ usage?.manual_triggers || 0 }}</div>
            <div class="stat-label">Déclenchements manuels</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🔄</div>
            <div class="stat-value">{{ usage?.auto_plays || 0 }}</div>
            <div class="stat-label">Lectures auto</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📈</div>
            <div class="stat-value">{{ (usage?.avg_completion_rate || 0).toFixed(0) }}%</div>
            <div class="stat-label">Taux de complétion moyen</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⏱️</div>
            <div class="stat-value">{{ formatDuration(usage?.total_duration || 0) }}</div>
            <div class="stat-label">Durée totale</div>
          </div>
        </div>

        <!-- Daily Breakdown Table -->
        <div class="card">
          <h3>Détail par jour</h3>
          <table class="data-table" *ngIf="usage?.daily_breakdown?.length">
            <thead>
              <tr>
                <th>Date</th>
                <th>Lectures</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let day of usage?.daily_breakdown">
                <td>{{ formatTableDate(day.date) }}</td>
                <td>{{ day.plays }}</td>
                <td>{{ formatDuration(day.duration) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="no-data" *ngIf="!usage?.daily_breakdown?.length">Pas de données</p>
        </div>
      </div>

      <!-- Content Tab -->
      <div class="tab-content" *ngIf="activeTab === 'content'">
        <!-- Top Videos -->
        <div class="card">
          <h3>Top Vidéos</h3>
          <table class="data-table" *ngIf="content?.top_videos?.length">
            <thead>
              <tr>
                <th>Vidéo</th>
                <th>Catégorie</th>
                <th>Lectures</th>
                <th>Durée totale</th>
                <th>Complétion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let video of content?.top_videos">
                <td class="video-name">{{ getVideoName(video.filename) }}</td>
                <td>{{ video.category || '-' }}</td>
                <td>{{ video.play_count }}</td>
                <td>{{ formatDuration(video.total_duration) }}</td>
                <td>
                  <div class="completion-bar">
                    <div class="completion-fill" [style.width.%]="video.avg_completion || 0"></div>
                    <span class="completion-text">{{ (video.avg_completion || 0).toFixed(0) }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="no-data" *ngIf="!content?.top_videos?.length">Pas de données</p>
        </div>

        <!-- Categories -->
        <div class="card">
          <h3>Par Catégorie</h3>
          <table class="data-table" *ngIf="content?.categories_breakdown?.length">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Lectures</th>
                <th>Durée totale</th>
                <th>Part</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let cat of content?.categories_breakdown">
                <td>{{ cat.category || 'Non catégorisé' }}</td>
                <td>{{ cat.play_count }}</td>
                <td>{{ formatDuration(cat.total_duration) }}</td>
                <td>{{ getCategoryPercent(cat.play_count).toFixed(1) }}%</td>
              </tr>
            </tbody>
          </table>
          <p class="no-data" *ngIf="!content?.categories_breakdown?.length">Pas de données</p>
        </div>
      </div>

      <!-- Health Tab -->
      <div class="tab-content" *ngIf="activeTab === 'health'">
        <!-- Current Metrics -->
        <div class="card" *ngIf="health?.current_metrics as metrics">
          <h3>Métriques actuelles</h3>
          <div class="metrics-grid">
              <div class="metric" [class.warning]="(metrics.cpu_usage || 0) > 80">
                <div class="metric-icon">💻</div>
                <div class="metric-info">
                  <div class="metric-label">CPU</div>
                  <div class="metric-value">{{ (metrics.cpu_usage || 0).toFixed(1) }}%</div>
                </div>
                <div class="metric-bar">
                  <div class="metric-fill" [style.width.%]="metrics.cpu_usage || 0"></div>
                </div>
              </div>

              <div class="metric" [class.warning]="(metrics.memory_usage || 0) > 80">
                <div class="metric-icon">🧠</div>
                <div class="metric-info">
                  <div class="metric-label">RAM</div>
                  <div class="metric-value">{{ (metrics.memory_usage || 0).toFixed(1) }}%</div>
                </div>
                <div class="metric-bar">
                  <div class="metric-fill" [style.width.%]="metrics.memory_usage || 0"></div>
                </div>
              </div>

              <div class="metric" [class.warning]="(metrics.temperature || 0) > 70">
                <div class="metric-icon">🌡️</div>
                <div class="metric-info">
                  <div class="metric-label">Température</div>
                  <div class="metric-value">{{ (metrics.temperature || 0).toFixed(1) }}°C</div>
                </div>
                <div class="metric-bar">
                  <div class="metric-fill" [style.width.%]="Math.min(metrics.temperature || 0, 100)"></div>
                </div>
              </div>

              <div class="metric" [class.warning]="(metrics.disk_usage || 0) > 80">
                <div class="metric-icon">💾</div>
                <div class="metric-info">
                  <div class="metric-label">Disque</div>
                  <div class="metric-value">{{ (metrics.disk_usage || 0).toFixed(1) }}%</div>
                </div>
                <div class="metric-bar">
                  <div class="metric-fill" [style.width.%]="metrics.disk_usage || 0"></div>
                </div>
              </div>
          </div>
        </div>

        <!-- Availability History -->
        <div class="card">
          <h3>Historique Disponibilité</h3>
          <table class="data-table" *ngIf="availability?.length">
            <thead>
              <tr>
                <th>Date</th>
                <th>Temps en ligne</th>
                <th>Disponibilité</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let day of availability">
                <td>{{ formatTableDate(day.date) }}</td>
                <td>{{ formatMinutes(day.online_minutes) }} / {{ formatMinutes(day.total_minutes) }}</td>
                <td>
                  <div class="availability-bar">
                    <div class="availability-fill" [style.width.%]="day.availability_percent || 0"></div>
                    <span class="availability-text">{{ (day.availability_percent || 0).toFixed(1) }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="no-data" *ngIf="!availability?.length">Pas de données</p>
        </div>

        <!-- Alerts History -->
        <div class="card">
          <h3>Historique Alertes</h3>
          <div class="alerts-list" *ngIf="recentAlerts?.length">
            <div
              *ngFor="let alert of recentAlerts"
              class="alert-item"
              [class]="'severity-' + alert.severity"
              [class.resolved]="alert.resolved"
            >
              <div class="alert-icon">{{ getSeverityIcon(alert.severity) }}</div>
              <div class="alert-content">
                <div class="alert-type">{{ alert.type }}</div>
                <div class="alert-message">{{ alert.message }}</div>
                <div class="alert-time">{{ formatDate(alert.created_at) }}</div>
              </div>
              <div class="alert-status">
                {{ alert.resolved ? 'Résolu' : 'Actif' }}
              </div>
            </div>
          </div>
          <p class="no-data" *ngIf="!recentAlerts?.length">Aucune alerte</p>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Chargement des analytics...</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      gap: 0.5rem;
    }

    .page-header h1 {
      flex: 1;
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .header-actions {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .period-select {
      padding: 0.5rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 0;
    }

    .tab {
      padding: 0.75rem 1.5rem;
      border: none;
      background: none;
      font-size: 0.875rem;
      font-weight: 500;
      color: #64748b;
      cursor: pointer;
      border-bottom: 3px solid transparent;
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

    /* KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .kpi-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .kpi-icon {
      font-size: 2rem;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      border-radius: 12px;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .kpi-label {
      font-size: 0.875rem;
      color: #64748b;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      padding: 1.25rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      text-align: center;
    }

    .stat-icon {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
    }

    /* Charts */
    .charts-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .chart-card {
      min-height: 300px;
    }

    .simple-chart {
      height: 200px;
      display: flex;
      align-items: flex-end;
    }

    .chart-bars {
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      width: 100%;
      height: 100%;
      padding: 0 0.5rem;
    }

    .chart-bar-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      max-width: 50px;
    }

    .chart-bar {
      width: 60%;
      background: linear-gradient(180deg, #2563eb, #3b82f6);
      border-radius: 4px 4px 0 0;
      min-height: 4px;
      transition: height 0.3s ease;
    }

    .chart-label {
      font-size: 0.625rem;
      color: #64748b;
      margin-top: 0.5rem;
      text-align: center;
    }

    /* Categories List */
    .categories-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .category-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .category-info {
      display: flex;
      justify-content: space-between;
    }

    .category-name {
      font-weight: 500;
      color: #0f172a;
    }

    .category-count {
      font-size: 0.875rem;
      color: #64748b;
    }

    .category-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .category-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      transition: width 0.3s ease;
    }

    /* Activity List */
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #2563eb;
    }

    .activity-item.resolved {
      opacity: 0.7;
    }

    .activity-icon {
      font-size: 1.5rem;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border-radius: 8px;
    }

    .activity-icon.severity-critical { background: #fef2f2; }
    .activity-icon.severity-warning { background: #fffbeb; }
    .activity-icon.severity-info { background: #eff6ff; }

    .activity-content {
      flex: 1;
    }

    .activity-message {
      font-weight: 500;
      color: #0f172a;
    }

    .activity-time {
      font-size: 0.75rem;
      color: #64748b;
    }

    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #fef2f2;
      color: #b91c1c;
    }

    .status-badge.resolved {
      background: #ecfdf5;
      color: #065f46;
    }

    /* Cards */
    .card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-bottom: 1.5rem;
    }

    .card h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.125rem;
      color: #0f172a;
      padding-bottom: 0.75rem;
      border-bottom: 2px solid #e2e8f0;
    }

    /* Data Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }

    .data-table th,
    .data-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }

    .data-table th {
      font-weight: 600;
      color: #64748b;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #f8fafc;
    }

    .data-table td {
      color: #0f172a;
    }

    .data-table tbody tr:hover {
      background: #f8fafc;
    }

    .video-name {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Completion Bar */
    .completion-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
    }

    .completion-fill {
      height: 8px;
      background: linear-gradient(90deg, #10b981, #34d399);
      border-radius: 4px;
      flex: 1;
      max-width: 100px;
    }

    .completion-text {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 35px;
    }

    /* Availability Bar */
    .availability-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .availability-fill {
      height: 8px;
      background: linear-gradient(90deg, #10b981, #34d399);
      border-radius: 4px;
      width: 100px;
    }

    .availability-text {
      font-size: 0.875rem;
      font-weight: 500;
    }

    /* Metrics */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      border-left: 3px solid #2563eb;
    }

    .metric.warning {
      border-left-color: #f59e0b;
      background: #fffbeb;
    }

    .metric-icon {
      font-size: 1.5rem;
    }

    .metric-info {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .metric-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }

    .metric-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
    }

    .metric-bar {
      height: 6px;
      background: #e2e8f0;
      border-radius: 3px;
      overflow: hidden;
    }

    .metric-fill {
      height: 100%;
      background: linear-gradient(90deg, #2563eb, #3b82f6);
      transition: width 0.3s ease;
    }

    .metric.warning .metric-fill {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }

    /* Alerts */
    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .alert-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      background: #f8fafc;
    }

    .alert-item.severity-critical {
      background: #fef2f2;
      border-left: 3px solid #ef4444;
    }

    .alert-item.severity-warning {
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
    }

    .alert-item.severity-info {
      background: #eff6ff;
      border-left: 3px solid #3b82f6;
    }

    .alert-item.resolved {
      opacity: 0.6;
    }

    .alert-icon {
      font-size: 1.25rem;
    }

    .alert-content {
      flex: 1;
    }

    .alert-type {
      font-weight: 600;
      color: #0f172a;
      font-size: 0.875rem;
    }

    .alert-message {
      color: #475569;
      font-size: 0.875rem;
    }

    .alert-time {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .alert-status {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      background: #f1f5f9;
      color: #64748b;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      font-size: 0.875rem;
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

    .btn-secondary:hover {
      background: #cbd5e1;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      gap: 1rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-data {
      text-align: center;
      padding: 2rem;
      color: #94a3b8;
    }

    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
        flex-direction: column;
      }

      .tabs {
        overflow-x: auto;
      }

      .charts-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ClubAnalyticsComponent implements OnInit, OnDestroy {
  siteId!: string;
  site: Site | null = null;
  activeTab: TabType = 'overview';
  selectedPeriod = '30';
  exporting = false;
  exportingPdf = false;
  Math = Math;

  // Data
  health: ClubHealthData | null = null;
  usage: UsageStats | null = null;
  content: ContentStats | null = null;
  availability: AvailabilityData[] = [];
  recentAlerts: AlertData[] = [];

  private readonly route = inject(ActivatedRoute);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly sitesService = inject(SitesService);
  private refreshSubscription?: Subscription;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadData();

    // Auto-refresh toutes les 60 secondes
    this.refreshSubscription = interval(60000).subscribe(() => {
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  loadData(): void {
    const days = parseInt(this.selectedPeriod, 10);

    // Charger site
    this.sitesService.getSite(this.siteId).subscribe({
      next: (site) => this.site = site,
      error: (err) => console.error('Error loading site:', err)
    });

    // Charger toutes les analytics en parallèle
    forkJoin({
      health: this.analyticsService.getClubHealth(this.siteId),
      usage: this.analyticsService.getClubUsage(this.siteId, days),
      content: this.analyticsService.getClubContent(this.siteId, days),
      availability: this.analyticsService.getClubAvailability(this.siteId, days),
      alerts: this.analyticsService.getClubAlerts(this.siteId, days)
    }).subscribe({
      next: (data) => {
        this.health = data.health;
        this.usage = data.usage;
        this.content = data.content;
        this.availability = data.availability.availability;
        this.recentAlerts = data.alerts.alerts;
      },
      error: (err) => console.error('Error loading analytics:', err)
    });
  }

  onPeriodChange(): void {
    this.loadData();
  }

  exportData(): void {
    this.exporting = true;
    const days = parseInt(this.selectedPeriod, 10);

    this.analyticsService.exportClubData(this.siteId, 'csv', days).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${this.site?.club_name || this.siteId}-${days}j.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.exporting = false;
      },
      error: (err) => {
        console.error('Export error:', err);
        alert('Erreur lors de l\'export');
        this.exporting = false;
      }
    });
  }

  downloadPdf(): void {
    this.exportingPdf = true;
    const days = parseInt(this.selectedPeriod, 10);

    // Calculer les dates from et to
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    this.analyticsService.getClubPdfReport(this.siteId, fromStr, toStr).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport-club-${this.site?.club_name || this.siteId}-${fromStr}-${toStr}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.exportingPdf = false;
      },
      error: (err) => {
        console.error('PDF generation error:', err);
        alert('Erreur lors de la génération du PDF');
        this.exportingPdf = false;
      }
    });
  }

  // Helpers
  formatDuration(seconds: number): string {
    if (!seconds) return '0min';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h${minutes}m`;
    return `${minutes}min`;
  }

  formatMinutes(minutes: number): string {
    if (!minutes) return '0min';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}min`;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatTableDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
  }

  formatChartDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  getVideoName(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  }

  getMaxPlays(): number {
    if (!this.usage?.daily_breakdown?.length) return 1;
    return Math.max(...this.usage.daily_breakdown.map(d => d.plays), 1);
  }

  getBarHeight(value: number, max: number): number {
    return (value / max) * 100;
  }

  getCategoryPercent(playCount: number): number {
    if (!this.content?.categories_breakdown?.length) return 0;
    const total = this.content.categories_breakdown.reduce((sum, c) => sum + c.play_count, 0);
    return total > 0 ? (playCount / total) * 100 : 0;
  }

  getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      critical: '🔴',
      warning: '🟠',
      info: '🔵'
    };
    return icons[severity] || '⚪';
  }
}
