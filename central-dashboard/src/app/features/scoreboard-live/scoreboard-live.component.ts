import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '@app/core/services/api.service';
import { SocketService } from '@app/core/services/socket.service';

export interface ScoreboardMatchState {
  siteId: string;
  vendor: 'bodet' | 'stramatel' | 'manual';
  sport: 'basketball';
  period: number;
  chronoMs: number;
  clockRunning: boolean;
  homeScore: number;
  guestScore: number;
  homeTeamFouls: number;
  guestTeamFouls: number;
  shotClockMs: number;
  timeoutActive: 'home' | 'guest' | null;
  timeoutRemainingMs: number;
  updatedAt?: number;
}

@Component({
  selector: 'app-scoreboard-live',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="scoreboard-live">
      <header class="sb-header">
        <a routerLink="/sites/{{ siteId }}" class="back-link">← Site</a>
        <h1>Scoreboard live</h1>
        <span class="vendor-pill" *ngIf="state" [class]="'vendor-' + state.vendor">
          {{ state.vendor }}
        </span>
        <span class="status" [class.live]="isLive()">{{ isLive() ? '● LIVE' : 'Aucun flux' }}</span>
      </header>

      <ng-container *ngIf="state; else waiting">
        <div class="sb-grid">
          <div class="sb-card sb-chrono">
            <div class="label">Chrono — Période {{ state.period }}</div>
            <div class="value big">{{ formatChrono(state.chronoMs) }}</div>
            <div class="sub" [class.running]="state.clockRunning">
              {{ state.clockRunning ? 'EN COURS' : 'STOP' }}
            </div>
          </div>

          <div class="sb-card sb-score sb-home">
            <div class="label">HOME</div>
            <div class="value huge">{{ state.homeScore }}</div>
            <div class="sub">Fautes équipe : {{ state.homeTeamFouls }}</div>
          </div>

          <div class="sb-card sb-score sb-guest">
            <div class="label">GUEST</div>
            <div class="value huge">{{ state.guestScore }}</div>
            <div class="sub">Fautes équipe : {{ state.guestTeamFouls }}</div>
          </div>

          <div class="sb-card sb-shot">
            <div class="label">Shot clock</div>
            <div class="value big">{{ formatShotClock(state.shotClockMs) }}</div>
          </div>

          <div class="sb-card sb-timeout" *ngIf="state.timeoutActive">
            <div class="label">Timeout {{ state.timeoutActive }}</div>
            <div class="value big">{{ formatChrono(state.timeoutRemainingMs) }}</div>
          </div>
        </div>

        <footer class="sb-footer">
          <small>
            Dernière MàJ :
            {{ lastUpdateAt ? (lastUpdateAt | date: 'HH:mm:ss') : '—' }}
            · site {{ siteId }}
          </small>
        </footer>
      </ng-container>

      <ng-template #waiting>
        <div class="sb-waiting">
          <p *ngIf="loading">Chargement…</p>
          <p *ngIf="!loading && error">{{ error }}</p>
          <p *ngIf="!loading && !error">
            Aucun état scoreboard reçu. Lancer un simulateur ou un connecteur avec
            <code>--push-url</code> vers ce central.
          </p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 1.5rem;
      }
      .scoreboard-live {
        max-width: 1100px;
        margin: 0 auto;
      }
      .sb-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .sb-header h1 {
        margin: 0;
        flex: 1;
        font-size: 1.5rem;
      }
      .back-link {
        color: #6b7280;
        text-decoration: none;
      }
      .back-link:hover {
        color: #111827;
      }
      .vendor-pill {
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        background: #e5e7eb;
        color: #374151;
      }
      .vendor-bodet {
        background: #dbeafe;
        color: #1e3a8a;
      }
      .vendor-stramatel {
        background: #fef3c7;
        color: #92400e;
      }
      .vendor-manual {
        background: #ede9fe;
        color: #5b21b6;
      }
      .status {
        color: #9ca3af;
        font-size: 0.85rem;
      }
      .status.live {
        color: #16a34a;
        font-weight: 600;
      }
      .sb-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }
      .sb-card {
        background: #111827;
        color: #f9fafb;
        border-radius: 12px;
        padding: 1.25rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .sb-chrono,
      .sb-shot,
      .sb-timeout {
        grid-column: span 2;
      }
      .sb-score {
        align-items: center;
        text-align: center;
      }
      .sb-home {
        background: #1e3a8a;
      }
      .sb-guest {
        background: #7f1d1d;
      }
      .sb-timeout {
        background: #854d0e;
      }
      .label {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ca3af;
      }
      .sb-home .label,
      .sb-guest .label,
      .sb-timeout .label {
        color: rgba(255, 255, 255, 0.7);
      }
      .value {
        font-family: 'Menlo', 'Consolas', monospace;
        font-weight: 700;
      }
      .value.big {
        font-size: 3rem;
      }
      .value.huge {
        font-size: 5rem;
        line-height: 1;
      }
      .sub {
        font-size: 0.85rem;
        color: #9ca3af;
      }
      .sub.running {
        color: #4ade80;
        font-weight: 600;
      }
      .sb-footer {
        margin-top: 1rem;
        color: #6b7280;
      }
      .sb-waiting {
        background: #f9fafb;
        border: 1px dashed #d1d5db;
        border-radius: 12px;
        padding: 2rem;
        text-align: center;
        color: #6b7280;
      }
      code {
        background: #e5e7eb;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
      }
    `,
  ],
})
export class ScoreboardLiveComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly socket = inject(SocketService);
  private readonly destroy$ = new Subject<void>();

  siteId = '';
  state: ScoreboardMatchState | null = null;
  loading = true;
  error: string | null = null;
  lastUpdateAt: number | null = null;

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
    if (!this.siteId) {
      this.error = 'siteId manquant dans l\'URL';
      this.loading = false;
      return;
    }

    this.socket.subscribeSite(this.siteId);

    this.api
      .get<ScoreboardMatchState | null>(`/scoreboard/${this.siteId}/state`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.state = res ?? null;
          this.lastUpdateAt = this.state?.updatedAt ?? null;
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          if (err?.status === 404) {
            this.error = null;
          } else {
            const msg = err?.error?.error ?? err?.error?.message ?? err?.message;
            this.error = typeof msg === 'string' ? msg : 'Impossible de charger l\'état';
          }
        },
      });

    this.socket
      .on<ScoreboardMatchState>('scoreboard-state')
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        if (!payload || payload.siteId !== this.siteId) return;
        this.state = payload;
        this.lastUpdateAt = Date.now();
        this.error = null;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.siteId) this.socket.unsubscribeSite(this.siteId);
  }

  isLive(): boolean {
    if (!this.lastUpdateAt) return false;
    return Date.now() - this.lastUpdateAt < 5_000;
  }

  formatChrono(ms: number): string {
    if (ms == null || ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0 && ms < 60_000) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${s.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatShotClock(ms: number): string {
    if (ms == null || ms < 0) ms = 0;
    return Math.ceil(ms / 1000).toString();
  }
}
