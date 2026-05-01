/**
 * RemoteOrchestratorService — Orchestration socket / displays / commands /
 * options broadcast / breaking news / score-update / scoreboard-state pour
 * les Remotes V1 et V2.
 *
 * Source de vérité pour la couche orchestration (pattern ADR-051 Phase 4,
 * comme RemoteScoreService / RemoteTimerService). Avant l'extraction, V1
 * portait la logique inline et V2 dupliquait — ce service consolide pour
 * que V1 et V2 partagent le même comportement éprouvé.
 *
 * Capacités centralisées :
 *   - listeners Socket.IO `displays-changed` / `phase-change` /
 *     `player-state` / `score-update` / `scoreboard-state` (ADR-090)
 *     — tous wrappés `ngZone.run`
 *   - emit `request-state` au boot (snapshot initial du serveur)
 *   - cible d'écran (`displayTarget: 'all' | number`) + reset auto si le
 *     display ciblé disparaît (parité V1)
 *   - commandes unifiées (commandId UUID v4 + target multi-écrans +
 *     local broadcast + socket emit) — ADR-081
 *   - propagation des options (`options-update`) au format V1, branchée
 *     sur `localOptionsService.getOptions$()` avec `skip(1)` (pas au boot)
 *   - émission breaking news au format V1 (`message`/`duration`/`position`/
 *     `displayMode`/`target`)
 *   - bridge ADR-090 scoreboard-state : applique sur scoreService +
 *     timerService + period derivation (basket), avec guard anti-flash
 *
 * Provider : scoped via `providers: [RemoteOrchestratorService]` dans le
 * composant V1 ou V2. Injection des services scoped peers (`RemoteScoreService`,
 * `RemoteTimerService`) résolue via le même injector tree.
 *
 * `destroy()` est appelé depuis `ngOnDestroy()` pour nettoyer la souscription
 * options.
 */
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { skip } from 'rxjs/operators';
import { SocketService } from './socket.service';
import { LocalBroadcastService } from './local-broadcast.service';
import { LocalOptionsService, LocalOptions } from './local-options.service';
import { RemoteScoreService, ScoreState } from '../components/remote/remote-score.service';
import { RemoteTimerService } from '../components/remote/remote-timer.service';

export interface DisplayInfo {
  index: number;
  type: string;
}

export type Phase = 'before' | 'during' | 'after';

export type CommandType =
  | 'video'
  | 'sponsors'
  | 'web-page'
  | 'livestream'
  | 'stop-manual'
  | 'reload-config';

export interface CommandPayload {
  type: CommandType;
  data?: unknown;
}

export interface PlayerStateEvent {
  lastError?: string | null;
  isManualMode?: boolean;
}

/** ADR-090 — État unifié scoreboard partagé Pi/Cloud. */
export interface ScoreboardStateV1 {
  vendor: 'bodet' | 'stramatel' | 'manual' | 'remote';
  sport: 'basketball' | 'football';
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
  homeTeamName?: string;
  guestTeamName?: string;
}

@Injectable()
export class RemoteOrchestratorService {
  private readonly socketService = inject(SocketService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly scoreService = inject(RemoteScoreService);
  private readonly timerService = inject(RemoteTimerService);
  private readonly ngZone = inject(NgZone);

  /** Liste brute des écrans connectés (format V1 : `{index, type}`). */
  readonly displays$ = new BehaviorSubject<DisplayInfo[]>([]);
  /** Phase à l'antenne pushée par le serveur (sync inter-onglets / multi-remotes). */
  readonly phase$ = new Subject<Phase>();
  /** État player TV (utilisé pour détecter `play_error` côté composant). */
  readonly playerState$ = new Subject<PlayerStateEvent>();
  /** Score reçu du cloud (post-mutation scoreService — pour CD V1 si besoin). */
  readonly scoreUpdated$ = new Subject<ScoreState>();
  /** ADR-090 — scoreboard-state appliqué (post-mutation services). */
  readonly scoreboardApplied$ = new Subject<ScoreboardStateV1>();

  /** Cible d'écran courante. `'all'` = tous les écrans, sinon index display. */
  private _displayTarget: 'all' | number = 'all';
  get displayTarget(): 'all' | number {
    return this._displayTarget;
  }
  setDisplayTarget(target: 'all' | number): void {
    this._displayTarget = target;
  }

  /**
   * Helper rétro-compat V2 : accepte une string ('all' ou index stringifié).
   * V2 component template manipule des strings ; V1 manipule des numbers.
   */
  setDisplayTargetFromString(id: string): void {
    if (id === 'all') {
      this._displayTarget = 'all';
      return;
    }
    const idx = parseInt(id, 10);
    this._displayTarget = Number.isFinite(idx) ? idx : 'all';
  }

  private optionsSub: Subscription | null = null;
  private initialized = false;

  /**
   * Setup des listeners socket + emit `request-state` initial + souscription
   * options-update. Idempotent : un second appel est ignoré.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.socketService.on<{ displays: Array<{ index: number; type: string }> }>(
      'displays-changed',
      data => {
        // ngZone.run obligatoire : Socket.IO callbacks s'exécutent hors zone
        // Angular → sans ça, les *ngIf liés à `displays$` ne se réévaluent jamais.
        this.ngZone.run(() => {
          const list: DisplayInfo[] = (data.displays || []).map(d => ({
            index: d.index,
            type: d.type,
          }));
          this.displays$.next(list);
          // Si la cible courante n'est plus connectée (display disparu), on
          // retombe automatiquement sur "tous". Sinon les commandes suivantes
          // disparaissent dans le vide. Parité V1.
          if (
            typeof this._displayTarget === 'number' &&
            !list.some(d => d.index === this._displayTarget)
          ) {
            this._displayTarget = 'all';
          }
        });
      },
    );

    this.socketService.on<{ phase: Phase | 'neutral' }>('phase-change', data => {
      this.ngZone.run(() => {
        if (data.phase === 'before' || data.phase === 'during' || data.phase === 'after') {
          this.phase$.next(data.phase);
        }
      });
    });

    this.socketService.on<PlayerStateEvent>('player-state', data => {
      this.ngZone.run(() => this.playerState$.next(data));
    });

    // Score push depuis cloud / Pi (parité V1) — sync l'état local du
    // scoreService sans rebroadcast (évite les boucles).
    this.socketService.on<{
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
    }>('score-update', scoreData => {
      this.ngZone.run(() => {
        const cur = this.scoreService.currentScore;
        const next: ScoreState = {
          homeTeam: scoreData.homeTeam || cur.homeTeam,
          awayTeam: scoreData.awayTeam || cur.awayTeam,
          homeScore: scoreData.homeScore ?? cur.homeScore,
          awayScore: scoreData.awayScore ?? cur.awayScore,
        };
        this.scoreService.currentScore = next;
        this.scoreUpdated$.next(next);
      });
    });

    // ADR-090 — scoreboard-state entrant (simulateur dashboard, table de marque
    // Bodet/Stramatel relayée par le Pi). Bridge unifié vers scoreService +
    // timerService + period derivation.
    this.socketService.on<ScoreboardStateV1 | null>('scoreboard-state', state => {
      if (!state) return;
      this.ngZone.run(() => this.applyIncomingScoreboardState(state));
    });

    // Parité V1 : on demande au serveur Pi/Cloud de pousser immédiatement le
    // snapshot d'état (score, phase, options, displays connectés…). Sans ça,
    // la sheet "Cible vidéo" reste vide jusqu'à ce qu'une TV se (dé)connecte.
    this.socketService.emit('request-state', {} as never);

    // Options observable + broadcast TV (parité V1 `broadcastOptions()`).
    // `skip(1)` ignore l'émission initiale du BehaviorSubject (boot, pas de
    // changement utilisateur). Toute mise à jour suivante est propagée à la
    // TV via socket + BroadcastChannel.
    this.optionsSub = this.localOptionsService
      .getOptions$()
      .pipe(skip(1))
      .subscribe(opts => this.broadcastOptions(opts));
  }

  destroy(): void {
    this.optionsSub?.unsubscribe();
    this.optionsSub = null;
    this.initialized = false;
  }

  /**
   * ADR-090 — applique un scoreboard-state cloud entrant, avec guard
   * anti-flash si l'état local matche déjà (à la seconde près pour le chrono).
   * Évite les re-render Remote+Display sur les pushes répétés du simulateur
   * (throttle 500ms) qui ne changent rien.
   */
  private applyIncomingScoreboardState(state: ScoreboardStateV1): void {
    const cur = this.scoreService.currentScore;
    const alreadySynced =
      state.homeScore === cur.homeScore &&
      state.guestScore === cur.awayScore &&
      Math.abs(Math.floor(state.chronoMs / 1000) - this.timerService.currentTime) < 2 &&
      state.clockRunning === this.timerService.isRunning;
    if (alreadySynced) return;

    this.scoreService.applyCloudState(state);
    const opts = this.localOptionsService.getOptions();
    this.timerService.applyCloudState(state, opts.timer);

    // Synchroniser la période si dérivable (basket uniquement pour l'instant).
    if (
      state.sport === 'basketball' &&
      state.period > 0 &&
      state.period <= this.localOptionsService.getAvailablePeriods().length
    ) {
      this.localOptionsService.setPeriod(state.period - 1);
    }

    this.scoreboardApplied$.next(state);
  }

  /**
   * ADR-081 Phase 0 — UUID v4 généré côté remote pour chaque commande
   * (audit + idempotence cloud). Utilise `crypto.randomUUID()` si dispo,
   * fallback Math.random sinon.
   */
  newCommandId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = (Math.random() * 16) | 0;
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Cible d'écran active sous forme `target: number[]` (parité V1 / ADR-081).
   * `displayTarget === 'all'` → undefined (la TV diffuse à tous les écrans).
   */
  getCommandTarget(): number[] | undefined {
    return typeof this._displayTarget === 'number' ? [this._displayTarget] : undefined;
  }

  /**
   * Émission unifiée d'une commande (parité V1) :
   *  - ajoute `commandId` UUID v4 (ADR-081)
   *  - propage la cible multi-écrans (`target: number[]`)
   *  - broadcast local (BroadcastChannel) pour les TV co-localisées
   *  - relais socket pour le master Pi
   */
  emitCommand(payload: CommandPayload): void {
    const target = this.getCommandTarget();
    const commandId = this.newCommandId();
    const enriched = { ...payload, commandId, ...(target ? { target } : {}) };
    this.localBroadcast.emitCommand(enriched);
    this.socketService.emit('command', enriched as never);
  }

  /**
   * Propagation des options à la TV (parité V1 `broadcastOptions()`).
   * Émet sur socket + BroadcastChannel.
   */
  broadcastOptions(opts: LocalOptions): void {
    this.localBroadcast.broadcast('options-update', opts);
    this.socketService.emit('options-update', opts as never);
  }

  /**
   * Émission breaking news vers la TV (parité V1 `sendBreakingNews()`).
   * Lit la config breakingNews depuis LocalOptionsService et émet le payload
   * complet `{message, duration, position, displayMode, target}` sur socket
   * + BroadcastChannel.
   */
  sendBreakingNews(message: string): void {
    const opts = this.localOptionsService.getOptions();
    const bn = opts.breakingNews;
    if (!bn) return;
    const target = this.getCommandTarget();
    const news = {
      message,
      duration: bn.defaultDuration,
      position: bn.position,
      displayMode: bn.displayMode,
      ...(target ? { target } : {}),
    };
    this.localBroadcast.emitBreakingNews(news);
    this.socketService.emit('breaking-news', news as never);
  }
}
