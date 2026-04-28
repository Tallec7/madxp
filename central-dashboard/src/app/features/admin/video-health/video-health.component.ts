/**
 * VideoHealthComponent — Page super_admin "Santé vidéos flotte".
 *
 * Surface UX du chantier "vidéos manquantes" (PR #613/#616/#617/#618) côté
 * super_admin : agrège orphelines FTP + erreurs de lecture 24h sur toute la
 * flotte. Sans ça, les métriques Prometheus existaient mais aucun écran
 * dashboard ne les exposait → admin "vole en aveugle".
 *
 * Source : `GET /api/admin/video-health` (authenticate + super_admin).
 */
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, catchError, of } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';

interface FtpOrphan {
  id: string;
  video_id: string;
  video_filename: string;
  video_category: string | null;
  storage_path: string;
  status: 'missing' | 'unreachable';
  reference_count: number;
  first_detected_at: string;
  last_checked_at: string;
}

interface FleetErrorRow {
  site_id: string;
  site_name: string | null;
  club_name: string | null;
  error_count: number;
}

interface FleetVideoHealthResponse {
  summary: {
    ftpOrphans: { missing: number; unreachable: number };
    videoErrors24h: number;
    sitesWithErrors: number;
    lastFtpAuditAt: string | null;
  };
  topErrorSites: FleetErrorRow[];
  ftpOrphans: FtpOrphan[];
}

@Component({
  selector: 'app-video-health',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="video-health">
      <div class="page-header">
        <div>
          <h1>🎬 Santé vidéos flotte</h1>
          <p class="page-sub">
            Vue agrégée des orphelines FTP et des erreurs de lecture vidéo des 24 dernières
            heures. Mise à jour à la demande — ré-exécute l'audit FTP pour rafraîchir.
          </p>
        </div>
        <button
          type="button"
          class="btn-primary"
          (click)="runAudit()"
          [disabled]="running"
          data-testid="run-ftp-audit-btn"
        >
          {{ running ? '⏳ Audit en cours…' : '🔍 Lancer l\\'audit FTP maintenant' }}
        </button>
      </div>

      <div class="loading" *ngIf="loading && !data">Chargement…</div>
      <div class="error" *ngIf="error">{{ error }}</div>

      <ng-container *ngIf="data">
        <div class="kpi-grid">
          <div class="kpi-card" [class.warn]="kpis.ftpTotal > 0">
            <div class="kpi-label">Orphelines FTP</div>
            <div class="kpi-value">{{ kpis.ftpTotal }}</div>
            <div class="kpi-sub">
              {{ data.summary.ftpOrphans.missing }} manquantes ·
              {{ data.summary.ftpOrphans.unreachable }} injoignables
            </div>
          </div>
          <div class="kpi-card" [class.warn]="data.summary.videoErrors24h > 0">
            <div class="kpi-label">Erreurs lecture 24h</div>
            <div class="kpi-value">{{ data.summary.videoErrors24h }}</div>
            <div class="kpi-sub">{{ data.summary.sitesWithErrors }} site(s) impacté(s)</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Dernier audit FTP</div>
            <div class="kpi-value small">
              {{ data.summary.lastFtpAuditAt ? (data.summary.lastFtpAuditAt | date:'dd/MM HH:mm') : '—' }}
            </div>
            <div class="kpi-sub">CRON nocturne 03:00</div>
          </div>
        </div>

        <section class="block">
          <h2>Top sites avec erreurs de lecture (24h)</h2>
          <p class="empty" *ngIf="!data.topErrorSites.length">
            Aucune erreur de lecture vidéo signalée par la flotte sur les 24 dernières heures.
          </p>
          <table class="data-table" *ngIf="data.topErrorSites.length" data-testid="top-error-sites-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Club</th>
                <th class="num">Erreurs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of data.topErrorSites">
                <td>{{ row.site_name || '(sans nom)' }}</td>
                <td>{{ row.club_name || '—' }}</td>
                <td class="num">
                  <span class="badge" [class.warn]="row.error_count >= 5">{{ row.error_count }}</span>
                </td>
                <td>
                  <a [routerLink]="['/sites', row.site_id]" [queryParams]="{ tab: 'content' }">Voir contenu →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="block">
          <h2>Orphelines FTP actives ({{ kpis.ftpTotal }})</h2>
          <p class="empty" *ngIf="!data.ftpOrphans.length">
            Aucune orpheline FTP détectée par le dernier passage du CRON.
          </p>
          <table class="data-table" *ngIf="data.ftpOrphans.length" data-testid="ftp-orphans-table">
            <thead>
              <tr>
                <th>Vidéo</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th class="num">Sites concernés</th>
                <th>Détecté</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let o of data.ftpOrphans">
                <td>
                  <code>{{ o.video_filename }}</code>
                </td>
                <td>{{ o.video_category || '—' }}</td>
                <td>
                  <span class="badge" [class.ko]="o.status === 'missing'" [class.warn]="o.status === 'unreachable'">
                    {{ o.status === 'missing' ? 'Manquante' : 'Injoignable' }}
                  </span>
                </td>
                <td class="num">
                  <span class="badge" [class.warn]="o.reference_count > 0">{{ o.reference_count }}</span>
                </td>
                <td>{{ o.first_detected_at | date:'dd/MM HH:mm' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .video-health { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
    .page-header {
      display: flex; align-items: flex-start; gap: 1.5rem; margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .page-header > div { flex: 1; min-width: 280px; }
    .page-header h1 { margin: 0 0 0.4rem; color: #1e293b; font-size: 1.65rem; }
    .page-sub { margin: 0; color: #64748b; font-size: 0.9rem; max-width: 70ch; }
    .btn-primary {
      background: #1e293b; color: white; border: none; padding: 0.7rem 1.1rem;
      border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.875rem;
    }
    .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
    .loading, .error { text-align: center; padding: 2rem; color: #64748b; }
    .error { color: #dc2626; }
    .kpi-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem; margin-bottom: 2rem;
    }
    .kpi-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .kpi-card.warn { border-color: #fca5a5; background: #fef2f2; }
    .kpi-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.4rem; }
    .kpi-value { font-size: 2rem; font-weight: 700; color: #1e293b; line-height: 1; }
    .kpi-value.small { font-size: 1.1rem; font-weight: 600; }
    .kpi-sub { margin-top: 0.4rem; font-size: 0.8rem; color: #94a3b8; }
    .block {
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 1.25rem 1.5rem; margin-bottom: 1.25rem;
    }
    .block h2 { margin: 0 0 1rem; font-size: 1.05rem; color: #1e293b; }
    .empty { color: #94a3b8; margin: 0; font-size: 0.9rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th, .data-table td {
      padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid #f1f5f9;
    }
    .data-table th { background: #f8fafc; color: #475569; font-weight: 600; }
    .data-table td.num, .data-table th.num { text-align: right; }
    .data-table code { font-size: 0.8rem; color: #334155; }
    .data-table a { color: #2563eb; text-decoration: none; font-weight: 500; }
    .data-table a:hover { text-decoration: underline; }
    .badge {
      display: inline-block; padding: 0.15rem 0.55rem; border-radius: 99px;
      font-size: 0.78rem; font-weight: 600; background: #f1f5f9; color: #475569;
    }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.ko { background: #fee2e2; color: #991b1b; }
  `],
})
export class VideoHealthComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  data: FleetVideoHealthResponse | null = null;
  loading = true;
  running = false;
  error = '';
  private sub?: Subscription;

  get kpis() {
    const f = this.data?.summary.ftpOrphans;
    return { ftpTotal: f ? f.missing + f.unreachable : 0 };
  }

  ngOnInit(): void {
    this.fetch();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  fetch(): void {
    this.loading = true;
    this.error = '';
    this.sub?.unsubscribe();
    this.sub = this.api.get<FleetVideoHealthResponse>('/admin/video-health')
      .pipe(catchError((err) => {
        this.error = err?.error?.error || 'Erreur de chargement';
        return of(null);
      }))
      .subscribe((res) => {
        if (res) this.data = res;
        this.loading = false;
      });
  }

  runAudit(): void {
    if (this.running) return;
    this.running = true;
    this.api.post<{ ok: boolean }>('/admin/video-ftp-orphans/run', {})
      .pipe(catchError((err) => {
        this.error = err?.error?.error || 'Erreur audit FTP';
        return of(null);
      }))
      .subscribe(() => {
        this.running = false;
        this.fetch();
      });
  }
}
