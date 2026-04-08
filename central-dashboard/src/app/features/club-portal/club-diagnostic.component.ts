import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval, startWith, switchMap, forkJoin, of, catchError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { AnalyticsService, ClubHealthData } from '../../core/services/analytics.service';
import { FeatureGateService } from '../../core/services/feature-gate.service';

interface SiteInfo {
  id: string;
  site_name: string;
  club_name: string;
  status?: string;
  site_type?: string;
  subscription_plan?: string | null;
  last_seen_at?: string | null;
  software_version?: string | null;
}

@Component({
  selector: 'app-club-diagnostic',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="club-diagnostic">
      <div class="page-header">
        <div class="header-text">
          <h1>Diagnostic</h1>
          <span class="site-name" *ngIf="site">{{ site.club_name }}</span>
        </div>
      </div>

      <div class="lock-card" *ngIf="site && !canUseDiagnostic">
        <div class="lock-icon">🔒</div>
        <h2>Diagnostic Premium</h2>
        <p>
          Le diagnostic en lecture seule (CPU, mémoire, température, disque, connexion)
          est réservé aux abonnements <strong>Premium</strong>.
        </p>
        <p class="hint">Contactez Neopro pour passer à l'offre Premium.</p>
      </div>

      <ng-container *ngIf="canUseDiagnostic">
        <div class="loading" *ngIf="loading && !health">Chargement…</div>

        <div class="grid" *ngIf="health || site">
          <div class="card">
            <div class="card-label">Connexion</div>
            <div class="card-value" [class.ok]="isConnected" [class.ko]="!isConnected">
              {{ isConnected ? 'En ligne' : 'Hors ligne' }}
            </div>
            <div class="card-sub" *ngIf="site?.last_seen_at">
              Dernière connexion : {{ site?.last_seen_at | date:'dd/MM/yyyy HH:mm' }}
            </div>
          </div>

          <div class="card">
            <div class="card-label">Version logicielle</div>
            <div class="card-value">{{ site?.software_version || '—' }}</div>
          </div>

          <div class="card">
            <div class="card-label">Disponibilité 24h</div>
            <div class="card-value">{{ health?.availability_24h ?? '—' }}<span class="unit" *ngIf="health">%</span></div>
            <div class="card-sub" *ngIf="health">Alertes 24h : {{ health.alerts_24h }}</div>
          </div>

          <div class="card" *ngIf="health?.current_metrics as m">
            <div class="card-label">CPU</div>
            <div class="card-value">{{ m.cpu_usage | number:'1.0-1' }}<span class="unit">%</span></div>
            <div class="bar"><div class="bar-fill" [style.width.%]="m.cpu_usage"></div></div>
          </div>

          <div class="card" *ngIf="health?.current_metrics as m">
            <div class="card-label">Mémoire</div>
            <div class="card-value">{{ m.memory_usage | number:'1.0-1' }}<span class="unit">%</span></div>
            <div class="bar"><div class="bar-fill" [style.width.%]="m.memory_usage"></div></div>
          </div>

          <div class="card" *ngIf="health?.current_metrics as m">
            <div class="card-label">Température</div>
            <div class="card-value" [class.warn]="m.temperature >= 70" [class.ko]="m.temperature >= 80">
              {{ m.temperature | number:'1.0-1' }}<span class="unit">°C</span>
            </div>
          </div>

          <div class="card" *ngIf="health?.current_metrics as m">
            <div class="card-label">Disque</div>
            <div class="card-value">{{ m.disk_usage | number:'1.0-1' }}<span class="unit">%</span></div>
            <div class="bar"><div class="bar-fill" [style.width.%]="m.disk_usage"></div></div>
          </div>

          <div class="card" *ngIf="health?.current_metrics as m">
            <div class="card-label">Uptime</div>
            <div class="card-value">{{ formatUptime(m.uptime) }}</div>
          </div>
        </div>

        <p class="readonly-note" *ngIf="health">
          Vue en lecture seule — mise à jour toutes les 30 secondes.
        </p>
      </ng-container>
    </div>
  `,
  styles: [`
    .club-diagnostic { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.75rem; color: #1e293b; }
    .site-name { color: #64748b; font-size: 0.95rem; }
    .lock-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 3rem 2rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .lock-icon { font-size: 3rem; margin-bottom: 1rem; }
    .lock-card h2 { margin: 0 0 1rem; color: #1e293b; }
    .lock-card p { color: #64748b; margin: 0.5rem 0; }
    .lock-card .hint { font-size: 0.9rem; color: #94a3b8; }
    .loading { text-align: center; padding: 2rem; color: #64748b; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1rem;
    }
    .card {
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 1.25rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .card-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.5rem; }
    .card-value { font-size: 1.5rem; font-weight: 600; color: #1e293b; }
    .card-value.ok { color: #16a34a; }
    .card-value.ko { color: #dc2626; }
    .card-value.warn { color: #f59e0b; }
    .card-value .unit { font-size: 0.9rem; color: #94a3b8; margin-left: 0.15rem; }
    .card-sub { margin-top: 0.4rem; font-size: 0.8rem; color: #94a3b8; }
    .bar { margin-top: 0.75rem; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); transition: width 0.3s; }
    .readonly-note { margin-top: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.85rem; }
  `]
})
export class ClubDiagnosticComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gate = inject(FeatureGateService);

  site: SiteInfo | null = null;
  health: ClubHealthData | null = null;
  loading = true;
  private sub?: Subscription;

  get siteId(): string | null {
    return this.authService.getCurrentUser()?.site_id ?? null;
  }

  get canUseDiagnostic(): boolean {
    return this.gate.canAccess('remote_diagnostic', this.site?.subscription_plan ?? null);
  }

  get isConnected(): boolean {
    if (!this.site?.last_seen_at) return false;
    const last = new Date(this.site.last_seen_at).getTime();
    return Date.now() - last < 2 * 60 * 1000;
  }

  ngOnInit(): void {
    const id = this.siteId;
    if (!id) { this.loading = false; return; }

    this.sub = interval(30000).pipe(
      startWith(0),
      switchMap(() => forkJoin({
        site: this.api.get<SiteInfo>(`/sites/${id}`).pipe(catchError(() => of(null))),
        health: this.analyticsService.getClubHealth(id).pipe(catchError(() => of(null)))
      }))
    ).subscribe(({ site, health }) => {
      if (site) this.site = site;
      if (health) this.health = health;
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}j ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
