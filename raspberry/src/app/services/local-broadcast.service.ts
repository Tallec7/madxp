import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * Service de communication locale entre onglets/fenêtres du même navigateur.
 * Utilise l'API BroadcastChannel pour permettre à /remote et /tv de communiquer
 * directement sans passer par un serveur externe.
 *
 * Parfait pour le Raspberry Pi où Remote et TV tournent sur le même appareil.
 */
@Injectable({ providedIn: 'root' })
export class LocalBroadcastService implements OnDestroy {
  private readonly CHANNEL_NAME = 'neopro-local';
  private channel: BroadcastChannel | null = null;

  // Subjects pour les différents types d'événements
  private scoreUpdate$ = new Subject<ScoreUpdateEvent>();
  private phaseChange$ = new Subject<PhaseChangeEvent>();
  private command$ = new Subject<CommandEvent>();
  private optionsUpdate$ = new Subject<OptionsUpdateEvent>();
  private breakingNews$ = new Subject<BreakingNewsEvent>();
  private timerUpdate$ = new Subject<TimerUpdateEvent>();
  private recordingState$ = new Subject<RecordingStateEvent>();

  constructor() {
    this.initChannel();
  }

  private initChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        this.handleMessage(event.data);
      };
      console.log('[LocalBroadcast] Channel initialized:', this.CHANNEL_NAME);
    } else {
      console.warn('[LocalBroadcast] BroadcastChannel API not supported');
    }
  }

  private handleMessage(message: BroadcastMessage): void {
    console.log('[LocalBroadcast] Message received:', message);

    switch (message.type) {
      case 'score-update':
        this.scoreUpdate$.next(message.payload as ScoreUpdateEvent);
        break;
      case 'score-reset':
        this.scoreUpdate$.next({ homeTeam: '', awayTeam: '', homeScore: 0, awayScore: 0, reset: true });
        break;
      case 'phase-change':
        this.phaseChange$.next(message.payload as PhaseChangeEvent);
        break;
      case 'command':
        this.command$.next(message.payload as CommandEvent);
        break;
      case 'options-update':
        this.optionsUpdate$.next(message.payload as OptionsUpdateEvent);
        break;
      case 'breaking-news':
        this.breakingNews$.next(message.payload as BreakingNewsEvent);
        break;
      case 'timer-update':
        this.timerUpdate$.next(message.payload as TimerUpdateEvent);
        break;
      case 'recording-state':
        this.recordingState$.next(message.payload as RecordingStateEvent);
        break;
    }
  }

  /**
   * Envoie un message à tous les autres onglets/fenêtres
   */
  public broadcast(type: BroadcastMessageType, payload: unknown): void {
    if (this.channel) {
      const message: BroadcastMessage = { type, payload, timestamp: Date.now() };
      this.channel.postMessage(message);
      console.log('[LocalBroadcast] Message sent:', message);
    }
  }

  /**
   * Émet une mise à jour du score
   */
  public emitScoreUpdate(score: ScoreUpdateEvent): void {
    this.broadcast('score-update', score);
  }

  /**
   * Émet un reset du score
   */
  public emitScoreReset(): void {
    this.broadcast('score-reset', null);
  }

  /**
   * Émet un changement de phase
   */
  public emitPhaseChange(phase: PhaseChangeEvent): void {
    this.broadcast('phase-change', phase);
  }

  /**
   * Émet une commande (video, sponsors, etc.)
   */
  public emitCommand(command: CommandEvent): void {
    this.broadcast('command', command);
  }

  /**
   * Observable des mises à jour de score
   */
  public onScoreUpdate(): Observable<ScoreUpdateEvent> {
    return this.scoreUpdate$.asObservable();
  }

  /**
   * Observable des changements de phase
   */
  public onPhaseChange(): Observable<PhaseChangeEvent> {
    return this.phaseChange$.asObservable();
  }

  /**
   * Observable des commandes
   */
  public onCommand(): Observable<CommandEvent> {
    return this.command$.asObservable();
  }

  /**
   * Observable des mises à jour d'options
   */
  public onOptionsUpdate(): Observable<OptionsUpdateEvent> {
    return this.optionsUpdate$.asObservable();
  }

  /**
   * Émet une breaking news
   */
  public emitBreakingNews(news: BreakingNewsEvent): void {
    this.broadcast('breaking-news', news);
  }

  /**
   * Observable des breaking news
   */
  public onBreakingNews(): Observable<BreakingNewsEvent> {
    return this.breakingNews$.asObservable();
  }

  /**
   * Émet une mise à jour du timer
   */
  public emitTimerUpdate(update: TimerUpdateEvent): void {
    this.broadcast('timer-update', update);
  }

  /**
   * Observable des mises à jour du timer
   */
  public onTimerUpdate(): Observable<TimerUpdateEvent> {
    return this.timerUpdate$.asObservable();
  }

  /**
   * Émet un changement d'état d'enregistrement analytics
   */
  public emitRecordingState(state: RecordingStateEvent): void {
    this.broadcast('recording-state', state);
  }

  /**
   * Observable des changements d'état d'enregistrement analytics
   */
  public onRecordingState(): Observable<RecordingStateEvent> {
    return this.recordingState$.asObservable();
  }

  public ngOnDestroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.scoreUpdate$.complete();
    this.phaseChange$.complete();
    this.command$.complete();
    this.optionsUpdate$.complete();
    this.breakingNews$.complete();
    this.timerUpdate$.complete();
    this.recordingState$.complete();
  }
}

// Types
export type BroadcastMessageType = 'score-update' | 'score-reset' | 'phase-change' | 'command' | 'options-update' | 'breaking-news' | 'timer-update' | 'recording-state';

export interface BroadcastMessage {
  type: BroadcastMessageType;
  payload: unknown;
  timestamp: number;
}

export interface ScoreUpdateEvent {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  reset?: boolean;
}

export interface PhaseChangeEvent {
  phase: 'neutral' | 'before' | 'during' | 'after';
}

export interface CommandEvent {
  type: string;
  data?: unknown;
}

export interface OptionsUpdateEvent {
  overlay: {
    scoreEnabled: boolean;
    position?: string;
  };
  timer: {
    enabled: boolean;
    periodDuration: number;
    countDown: boolean;
    integratedWithScore: boolean;
  };
  breakingNews: {
    enabled: boolean;
    position: 'top' | 'bottom';
    defaultDuration: number;
    displayMode: 'scroll';
    quickMessages: string[];
  };
  template: 'broadcast' | 'minimal';
  sport?: string;
  goalAnimation?: {
    enabled: boolean;
    style: 'popup' | 'fullscreen' | 'slide';
    duration: number;
    soundEnabled: boolean;
    soundUrl?: string;
  };
}

export interface BreakingNewsEvent {
  message: string;
  duration: number; // en secondes
  position: 'top' | 'bottom';
  displayMode: 'scroll';
}

export interface TimerUpdateEvent {
  action: 'start' | 'pause' | 'reset' | 'sync';
  currentTime?: number; // temps actuel en secondes
  isRunning?: boolean;
  halfDuration?: number; // durée mi-temps en minutes
  countDown?: boolean;
}

export interface RecordingStateEvent {
  isRecording: boolean;
  isManualOverride: boolean;
}
