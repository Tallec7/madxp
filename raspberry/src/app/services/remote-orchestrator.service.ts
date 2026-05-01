/**
 * RemoteOrchestratorService — Orchestration socket / displays / commands /
 * options broadcast / breaking news pour la Remote V2.
 *
 * Extrait de RemoteV2Component (pattern ADR-051 Phase 4, comme
 * RemoteScoreService / RemoteTimerService). Le composant reste responsable de
 * la vue ; ce service centralise :
 *   - les listeners Socket.IO `displays-changed` / `phase-change` /
 *     `player-state` (avec `ngZone.run` obligatoire)
 *   - l'emit `request-state` au boot (snapshot initial du serveur)
 *   - la cible d'écran courante (`targetDisplay`) + reset auto si le display
 *     ciblé disparaît (parité V1)
 *   - les commandes unifiées (commandId UUID v4 + target multi-écrans +
 *     local broadcast + socket emit) — ADR-081
 *   - la propagation des options (`options-update`) au format V1, branchée
 *     sur `localOptionsService.getOptions$()` avec `skip(1)` (pas au boot)
 *   - l'émission breaking news au format V1 (`message`/`duration`/`position`/
 *     `displayMode`/`target`)
 *
 * Provider : scoped via `providers: [RemoteOrchestratorService]` dans le
 * composant V2. `destroy()` est appelé depuis `ngOnDestroy()` pour nettoyer
 * la souscription options.
 */
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { skip } from 'rxjs/operators';
import { SocketService } from './socket.service';
import { LocalBroadcastService } from './local-broadcast.service';
import { LocalOptionsService, LocalOptions } from './local-options.service';

export interface DisplayInfo {
  id: string;
  label: string;
  status: 'online' | 'offline';
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

@Injectable()
export class RemoteOrchestratorService {
  private readonly socketService = inject(SocketService);
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly localOptionsService = inject(LocalOptionsService);
  private readonly ngZone = inject(NgZone);

  /** Liste des écrans connectés — alimentée par `displays-changed` socket. */
  readonly displays$ = new BehaviorSubject<DisplayInfo[]>([]);
  /** Phase à l'antenne pushée par le serveur (sync inter-onglets / multi-remotes). */
  readonly phase$ = new Subject<Phase>();
  /** État player TV (utilisé pour détecter `play_error` côté composant). */
  readonly playerState$ = new Subject<PlayerStateEvent>();

  /** Cible d'écran courante. `'all'` = tous les écrans. */
  private _targetDisplay = 'all';
  get targetDisplay(): string {
    return this._targetDisplay;
  }
  setTargetDisplay(id: string): void {
    this._targetDisplay = id;
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
            id: String(d.index),
            label: `display-${d.index}`,
            status: 'online' as const,
          }));
          this.displays$.next(list);
          // Si la cible courante n'est plus connectée (display disparu), on
          // retombe automatiquement sur "tous". Sinon les commandes suivantes
          // disparaissent dans le vide. Parité V1.
          if (
            this._targetDisplay !== 'all' &&
            !list.some(d => d.id === this._targetDisplay)
          ) {
            this._targetDisplay = 'all';
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
   * `targetDisplay === 'all'` → undefined (la TV diffuse à tous les écrans).
   */
  getCommandTarget(): number[] | undefined {
    if (this._targetDisplay === 'all') return undefined;
    const idx = parseInt(this._targetDisplay, 10);
    return Number.isFinite(idx) ? [idx] : undefined;
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
