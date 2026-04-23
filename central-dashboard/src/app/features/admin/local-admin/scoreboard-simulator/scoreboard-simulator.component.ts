import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '@app/core/services/auth.service';
import { Site, User } from '@app/core/models';
import {
  ScoreboardSimState,
  ScoreboardSimulatorService,
  ScoreboardVendor,
} from './scoreboard-simulator.service';

const PERIOD_MS = 10 * 60 * 1000;
const SHOT_CLOCK_FULL_MS = 24_000;
const SHOT_CLOCK_RESET_MS = 14_000;
const PUSH_DEBOUNCE_MS = 300;
const PUSH_THROTTLE_MS = 500;
const TICK_MS = 100;

@Component({
  selector: 'app-scoreboard-simulator',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sim-root">
      <header class="sim-header">
        <div>
          <p class="eyebrow">Simulateur — Table de marque</p>
          <h2>Saisie manuelle live (push cloud + broadcast dashboard)</h2>
          <p class="subtitle">
            Sélectionne un site, un vendor, puis saisis les événements comme sur un vrai
            scoreboard. Chaque action push un MatchState vers l'overlay live.
          </p>
        </div>
        <div class="status">
          <span class="pill" [class.pushing]="pushing()">{{ pushing() ? 'Push en cours…' : 'Idle' }}</span>
          <span class="pill ok" *ngIf="lastPushedAt() as ts">
            Dernier push : {{ ts | date: 'HH:mm:ss' }}
          </span>
          <span class="pill err" *ngIf="pushError() as err">{{ err }}</span>
        </div>
      </header>

      <section class="row selectors">
        <label class="field">
          <span>Site / profil</span>
          <select
            [value]="siteId()"
            (change)="onSiteChange($any($event.target).value)"
            [disabled]="isClub()"
          >
            <option value="" disabled>Sélectionne un site…</option>
            <option *ngFor="let s of sites()" [value]="s.id">
              {{ s.club_name }} — {{ s.site_name }}
            </option>
          </select>
          <small class="hint" *ngIf="isClub()">
            Rôle club : site verrouillé à {{ siteId() }}.
          </small>
        </label>

        <fieldset class="field vendor">
          <legend>Vendor source</legend>
          <label *ngFor="let v of vendors">
            <input
              type="radio"
              name="vendor"
              [value]="v"
              [checked]="vendor() === v"
              (change)="vendor.set(v)"
            />
            <span>{{ v | uppercase }}</span>
          </label>
        </fieldset>
      </section>

      <section class="row chrono-section">
        <div class="card chrono-card">
          <div class="card-label">Chrono — Période</div>
          <div class="chrono-big">{{ formatChrono(chronoMs()) }}</div>
          <div class="period-row">
            <button class="btn small" (click)="setPeriod(period() - 1)" [disabled]="period() <= 1">−</button>
            <span class="period-value">P{{ period() }}</span>
            <button class="btn small" (click)="setPeriod(period() + 1)" [disabled]="period() >= 8">+</button>
          </div>
          <div class="actions">
            <button class="btn" [class.active]="clockRunning()" (click)="toggleClock()">
              {{ clockRunning() ? '⏸ STOP' : '▶ START' }}
            </button>
            <button class="btn ghost" (click)="resetChrono()">Reset période</button>
          </div>
        </div>

        <div class="card shot-card">
          <div class="card-label">Shot clock</div>
          <div class="shot-big">{{ formatShotClock(shotClockMs()) }}</div>
          <div class="actions">
            <button class="btn" (click)="resetShotClock(24)">24s</button>
            <button class="btn" (click)="resetShotClock(14)">14s</button>
            <button
              class="btn"
              [class.active]="shotClockRunning()"
              (click)="shotClockRunning.set(!shotClockRunning())"
            >
              {{ shotClockRunning() ? '⏸' : '▶' }}
            </button>
          </div>
        </div>
      </section>

      <section class="row scores">
        <div class="team-card home">
          <div class="team-label">HOME</div>
          <div class="team-score">{{ homeScore() }}</div>
          <div class="score-actions">
            <button class="btn" (click)="bumpHome(1)">+1</button>
            <button class="btn" (click)="bumpHome(2)">+2</button>
            <button class="btn" (click)="bumpHome(3)">+3</button>
            <button class="btn ghost" (click)="bumpHome(-1)">−1</button>
          </div>
          <div class="team-sub">
            Fautes équipe :
            <button class="btn small" (click)="setFouls('home', homeTeamFouls() - 1)" [disabled]="homeTeamFouls() <= 0">−</button>
            <span class="fouls-value">{{ homeTeamFouls() }}</span>
            <button class="btn small" (click)="setFouls('home', homeTeamFouls() + 1)">+</button>
          </div>
          <button
            class="btn timeout"
            [class.active]="timeoutActive() === 'home'"
            (click)="startTimeout('home')"
          >
            Timeout HOME
          </button>
        </div>

        <div class="team-card guest">
          <div class="team-label">GUEST</div>
          <div class="team-score">{{ guestScore() }}</div>
          <div class="score-actions">
            <button class="btn" (click)="bumpGuest(1)">+1</button>
            <button class="btn" (click)="bumpGuest(2)">+2</button>
            <button class="btn" (click)="bumpGuest(3)">+3</button>
            <button class="btn ghost" (click)="bumpGuest(-1)">−1</button>
          </div>
          <div class="team-sub">
            Fautes équipe :
            <button class="btn small" (click)="setFouls('guest', guestTeamFouls() - 1)" [disabled]="guestTeamFouls() <= 0">−</button>
            <span class="fouls-value">{{ guestTeamFouls() }}</span>
            <button class="btn small" (click)="setFouls('guest', guestTeamFouls() + 1)">+</button>
          </div>
          <button
            class="btn timeout"
            [class.active]="timeoutActive() === 'guest'"
            (click)="startTimeout('guest')"
          >
            Timeout GUEST
          </button>
        </div>
      </section>

      <section class="row bottom">
        <div class="timeout-banner" *ngIf="timeoutActive() as to">
          Timeout {{ to | uppercase }} — {{ formatChrono(timeoutRemainingMs()) }}
          <button class="btn ghost small" (click)="clearTimeout()">Annuler</button>
        </div>

        <div class="actions global">
          <button class="btn danger" (click)="resetMatch()">RESET MATCH</button>
          <button class="btn" (click)="forcePush()">Push maintenant</button>
          <a
            class="btn ghost"
            [routerLink]="['/scoreboard-live', siteId()]"
            target="_blank"
            rel="noopener"
            *ngIf="siteId()"
          >
            Ouvrir live overlay ↗
          </a>
        </div>

        <details class="preview">
          <summary>Payload courant (debug)</summary>
          <pre>{{ payloadJson() }}</pre>
        </details>
      </section>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .sim-root {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
      }
      .sim-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.7rem;
        color: #64748b;
        margin: 0;
      }
      h2 { margin: 0.3rem 0; font-size: 1.3rem; color: #0f172a; }
      .subtitle { color: #64748b; margin: 0; max-width: 640px; }
      .status { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end; }
      .pill {
        padding: 0.25rem 0.7rem;
        border-radius: 999px;
        background: #f1f5f9;
        color: #64748b;
        font-size: 0.8rem;
      }
      .pill.pushing { background: #fef3c7; color: #92400e; }
      .pill.ok { background: #dcfce7; color: #166534; }
      .pill.err { background: #fee2e2; color: #991b1b; }

      .row {
        display: grid;
        gap: 1rem;
      }
      .selectors { grid-template-columns: 2fr 1fr; }
      .chrono-section { grid-template-columns: 1fr 1fr; }
      .scores { grid-template-columns: 1fr 1fr; }
      .bottom { grid-template-columns: 1fr; }

      .field { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 600; }
      .field select {
        padding: 0.6rem;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
      }
      .hint { color: #94a3b8; font-weight: 400; font-size: 0.8rem; }

      fieldset.vendor {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 0.5rem 0.8rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      fieldset.vendor legend { padding: 0 0.4rem; font-size: 0.8rem; color: #64748b; }
      fieldset.vendor label {
        display: flex; align-items: center; gap: 0.4rem;
        font-weight: 500; cursor: pointer;
      }

      .card {
        background: #0f172a;
        color: #f9fafb;
        border-radius: 12px;
        padding: 1rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .card-label {
        font-size: 0.75rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .chrono-big, .shot-big {
        font-family: 'Menlo', 'Consolas', monospace;
        font-weight: 700;
        font-size: 3.2rem;
        line-height: 1;
      }
      .period-row {
        display: flex; align-items: center; gap: 0.6rem;
        margin: 0.2rem 0;
      }
      .period-value { font-weight: 700; font-size: 1.1rem; }
      .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .actions.global { justify-content: flex-start; }

      .team-card {
        border-radius: 12px;
        padding: 1rem;
        color: #fff;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        text-align: center;
      }
      .team-card.home { background: #1e3a8a; }
      .team-card.guest { background: #7f1d1d; }
      .team-label { letter-spacing: 0.1em; font-size: 0.85rem; opacity: 0.85; }
      .team-score {
        font-family: 'Menlo', monospace;
        font-size: 4rem;
        font-weight: 800;
        line-height: 1;
      }
      .score-actions {
        display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap;
      }
      .team-sub { font-size: 0.9rem; display: flex; justify-content: center; align-items: center; gap: 0.4rem; }
      .fouls-value { min-width: 1.5rem; display: inline-block; font-weight: 700; }

      .btn {
        background: #2022e9;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 0.55rem 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s, opacity 0.2s;
      }
      .btn:hover:not(:disabled) { transform: translateY(-1px); }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn.small { padding: 0.3rem 0.55rem; font-size: 0.85rem; }
      .btn.ghost {
        background: rgba(255,255,255,0.08);
        color: inherit;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .team-card .btn.ghost { color: #fff; }
      .bottom .btn.ghost { background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0; }
      .btn.active { background: #16a34a; }
      .btn.danger { background: #dc2626; }
      .btn.timeout { background: rgba(255,255,255,0.12); }
      .btn.timeout.active { background: #f59e0b; color: #0f172a; }

      .timeout-banner {
        background: #fef3c7; color: #92400e;
        border-radius: 10px;
        padding: 0.8rem 1rem;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 700;
      }
      .preview {
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
      }
      .preview pre {
        margin: 0.4rem 0 0;
        white-space: pre-wrap;
        word-break: break-all;
        font-size: 0.8rem;
        color: #0f172a;
      }
    `,
  ],
})
export class ScoreboardSimulatorComponent implements OnInit, OnDestroy {
  private readonly simApi = inject(ScoreboardSimulatorService);
  private readonly auth = inject(AuthService);

  readonly vendors: ScoreboardVendor[] = ['bodet', 'stramatel', 'manual'];

  readonly sites = signal<Site[]>([]);
  readonly siteId = signal<string>('');
  readonly vendor = signal<ScoreboardVendor>('manual');
  readonly period = signal<number>(1);
  readonly chronoMs = signal<number>(PERIOD_MS);
  readonly clockRunning = signal<boolean>(false);
  readonly shotClockMs = signal<number>(SHOT_CLOCK_FULL_MS);
  readonly shotClockRunning = signal<boolean>(false);
  readonly homeScore = signal<number>(0);
  readonly guestScore = signal<number>(0);
  readonly homeTeamFouls = signal<number>(0);
  readonly guestTeamFouls = signal<number>(0);
  readonly timeoutActive = signal<'home' | 'guest' | null>(null);
  readonly timeoutRemainingMs = signal<number>(0);

  readonly pushing = signal<boolean>(false);
  readonly lastPushedAt = signal<number | null>(null);
  readonly pushError = signal<string | null>(null);

  private readonly currentUser = signal<User | null>(null);
  readonly isClub = computed(() => this.currentUser()?.role === 'club');

  readonly payloadJson = computed(() => {
    const state = this.buildState();
    if (!state) return '(site non sélectionné)';
    return JSON.stringify(state, null, 2);
  });

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPushAt = 0;
  private subs: Subscription[] = [];

  constructor() {
    effect(() => {
      // Track state changes — debounced push.
      this.siteId();
      this.vendor();
      this.period();
      this.chronoMs();
      this.clockRunning();
      this.shotClockMs();
      this.homeScore();
      this.guestScore();
      this.homeTeamFouls();
      this.guestTeamFouls();
      this.timeoutActive();
      this.timeoutRemainingMs();
      this.schedulePush();
    });
  }

  ngOnInit(): void {
    this.currentUser.set(this.auth.getCurrentUser());

    this.subs.push(
      this.simApi.listSites().subscribe({
        next: (res) => {
          const sites = res.data ?? [];
          this.sites.set(sites);
          const user = this.currentUser();
          if (user?.role === 'club' && user.site_id) {
            this.siteId.set(user.site_id);
          } else if (sites.length > 0) {
            this.siteId.set(sites[0].id);
          }
        },
        error: (err) => {
          this.pushError.set(
            (err?.error?.error ?? err?.message ?? 'Impossible de charger les sites') as string
          );
        },
      })
    );

    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  ngOnDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.subs.forEach((s) => s.unsubscribe());
  }

  onSiteChange(id: string): void {
    if (!this.isClub()) this.siteId.set(id);
  }

  setPeriod(p: number): void {
    if (p < 1 || p > 8) return;
    this.period.set(p);
    this.chronoMs.set(PERIOD_MS);
    this.clockRunning.set(false);
  }

  toggleClock(): void {
    this.clockRunning.set(!this.clockRunning());
    if (this.clockRunning()) this.shotClockRunning.set(true);
  }

  resetChrono(): void {
    this.chronoMs.set(PERIOD_MS);
    this.clockRunning.set(false);
  }

  resetShotClock(seconds: 24 | 14): void {
    this.shotClockMs.set(seconds === 24 ? SHOT_CLOCK_FULL_MS : SHOT_CLOCK_RESET_MS);
    if (this.clockRunning()) this.shotClockRunning.set(true);
  }

  bumpHome(delta: number): void {
    this.homeScore.set(Math.max(0, this.homeScore() + delta));
    if (delta > 0) this.resetShotClock(24);
  }

  bumpGuest(delta: number): void {
    this.guestScore.set(Math.max(0, this.guestScore() + delta));
    if (delta > 0) this.resetShotClock(24);
  }

  setFouls(team: 'home' | 'guest', value: number): void {
    const safe = Math.max(0, value);
    if (team === 'home') this.homeTeamFouls.set(safe);
    else this.guestTeamFouls.set(safe);
  }

  startTimeout(team: 'home' | 'guest'): void {
    this.timeoutActive.set(team);
    this.timeoutRemainingMs.set(60_000);
    this.clockRunning.set(false);
    this.shotClockRunning.set(false);
  }

  clearTimeout(): void {
    this.timeoutActive.set(null);
    this.timeoutRemainingMs.set(0);
  }

  resetMatch(): void {
    this.period.set(1);
    this.chronoMs.set(PERIOD_MS);
    this.clockRunning.set(false);
    this.shotClockMs.set(SHOT_CLOCK_FULL_MS);
    this.shotClockRunning.set(false);
    this.homeScore.set(0);
    this.guestScore.set(0);
    this.homeTeamFouls.set(0);
    this.guestTeamFouls.set(0);
    this.clearTimeout();
  }

  forcePush(): void {
    this.doPush();
  }

  formatChrono(ms: number): string {
    const safe = Math.max(0, ms);
    const totalSec = Math.floor(safe / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0 && safe < 60_000) {
      const tenths = Math.floor((safe % 1000) / 100);
      return `${s.toString().padStart(2, '0')}.${tenths}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatShotClock(ms: number): string {
    return Math.ceil(Math.max(0, ms) / 1000).toString();
  }

  private tick(): void {
    if (this.timeoutActive()) {
      const remaining = this.timeoutRemainingMs() - TICK_MS;
      if (remaining <= 0) this.clearTimeout();
      else this.timeoutRemainingMs.set(remaining);
      return;
    }
    if (this.clockRunning()) {
      this.chronoMs.set(Math.max(0, this.chronoMs() - TICK_MS));
      if (this.chronoMs() === 0) this.clockRunning.set(false);
    }
    if (this.shotClockRunning() && this.clockRunning()) {
      this.shotClockMs.set(Math.max(0, this.shotClockMs() - TICK_MS));
      if (this.shotClockMs() === 0) this.shotClockRunning.set(false);
    }
  }

  private buildState(): ScoreboardSimState | null {
    const id = this.siteId();
    if (!id) return null;
    return {
      siteId: id,
      vendor: this.vendor(),
      sport: 'basketball',
      period: this.period(),
      chronoMs: this.chronoMs(),
      clockRunning: this.clockRunning(),
      homeScore: this.homeScore(),
      guestScore: this.guestScore(),
      homeTeamFouls: this.homeTeamFouls(),
      guestTeamFouls: this.guestTeamFouls(),
      shotClockMs: this.shotClockMs(),
      timeoutActive: this.timeoutActive(),
      timeoutRemainingMs: this.timeoutRemainingMs(),
    };
  }

  private schedulePush(): void {
    // Throttle + debounce : pendant que le chrono tourne, chronoMs change
    // toutes les 100ms et reset le debounce → sans throttle, push jamais.
    // On force un push toutes les PUSH_THROTTLE_MS max.
    const now = Date.now();
    const elapsed = now - this.lastPushAt;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (elapsed >= PUSH_THROTTLE_MS) {
      this.doPush();
    } else {
      this.pushTimer = setTimeout(() => this.doPush(), Math.min(PUSH_DEBOUNCE_MS, PUSH_THROTTLE_MS - elapsed));
    }
  }

  private doPush(): void {
    const state = this.buildState();
    if (!state) return;
    this.lastPushAt = Date.now();
    this.pushing.set(true);
    this.pushError.set(null);
    this.simApi.push(state).subscribe({
      next: () => {
        this.pushing.set(false);
        this.lastPushedAt.set(Date.now());
      },
      error: (err) => {
        this.pushing.set(false);
        const msg = err?.error?.error ?? err?.error?.message ?? err?.message;
        this.pushError.set(typeof msg === 'string' ? msg : 'Push failed');
      },
    });
  }
}
