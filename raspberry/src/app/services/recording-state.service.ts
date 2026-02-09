import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { LocalBroadcastService } from './local-broadcast.service';
import { SocketService } from './socket.service';

export interface RecordingStateEvent {
  isRecording: boolean;
  isManualOverride: boolean;
}

/**
 * Service de gestion de l'état d'enregistrement analytics.
 *
 * Comportement hybride :
 * - **Au boot : OFF** — aucune donnée analytics enregistrée
 * - **Auto ON** quand la télécommande change de phase (neutral → before/during/after)
 * - **Auto OFF** quand retour en neutral + timeout configurable (15 min)
 * - **Override manuel** : bouton sur la télécommande pour forcer start/stop
 *
 * L'état est synchronisé entre onglets via BroadcastChannel et entre instances via Socket.IO.
 */
@Injectable({ providedIn: 'root' })
export class RecordingStateService implements OnDestroy {
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly socketService = inject(SocketService);

  /** Délai avant auto-stop après retour en phase neutral (15 minutes) */
  private readonly AUTO_STOP_DELAY = 15 * 60 * 1000;

  private _isRecording = false;
  private _isManualOverride = false;
  private _autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions: Subscription[] = [];

  // Observable pour le binding UI
  private readonly recordingSubject = new BehaviorSubject<boolean>(false);
  public readonly isRecording$: Observable<boolean> = this.recordingSubject.asObservable();

  /** Accès synchrone à l'état d'enregistrement (utilisé par les guards analytics) */
  public get isRecording(): boolean {
    return this._isRecording;
  }

  constructor() {
    // Au boot : toujours OFF (pas de persistence localStorage)
    // Évite un état stale après un reboot mid-match
    this._isRecording = false;
    this._isManualOverride = false;
    this.recordingSubject.next(false);

    this.listenForExternalState();
  }

  /**
   * Appelé par la Remote quand la phase change.
   * Auto-start si on quitte neutral, auto-stop (avec timer) si retour neutral.
   */
  public onPhaseChange(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    this.cancelAutoStop();

    if (phase !== 'neutral' && !this._isRecording) {
      // Auto-start : on entre dans une phase de match
      this.startRecording(false);
    } else if (phase === 'neutral' && this._isRecording && !this._isManualOverride) {
      // Auto-stop : retour en neutral, démarrer le timeout
      this._autoStopTimer = setTimeout(() => {
        this.stopRecording(false);
      }, this.AUTO_STOP_DELAY);
    }
  }

  /** Toggle manuel depuis la Remote */
  public toggleRecording(): void {
    if (this._isRecording) {
      this.stopRecording(true);
    } else {
      this.startRecording(true);
    }
  }

  /** Forcer le démarrage (manual = true si l'utilisateur a explicitement activé) */
  public startRecording(manual: boolean): void {
    this._isRecording = true;
    this._isManualOverride = manual;
    this.cancelAutoStop();
    this.recordingSubject.next(true);
    this.broadcast();
  }

  /** Forcer l'arrêt */
  public stopRecording(manual: boolean): void {
    this._isRecording = false;
    this._isManualOverride = manual;
    this.cancelAutoStop();
    this.recordingSubject.next(false);
    this.broadcast();
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  /** Broadcast l'état via BroadcastChannel ET Socket.IO */
  private broadcast(): void {
    const state: RecordingStateEvent = {
      isRecording: this._isRecording,
      isManualOverride: this._isManualOverride
    };
    this.localBroadcast.emitRecordingState(state);
    this.socketService.emit('recording-state', state);
  }

  /** Écouter les changements d'état depuis d'autres sources (autre onglet, socket) */
  private listenForExternalState(): void {
    // Via BroadcastChannel (même navigateur, autre onglet)
    this.subscriptions.push(
      this.localBroadcast.onRecordingState().subscribe((state: RecordingStateEvent) => {
        this._isRecording = state.isRecording;
        this._isManualOverride = state.isManualOverride;
        this.recordingSubject.next(this._isRecording);
      })
    );

    // Via Socket.IO (autre instance, ex: kiosk ↔ navigateur)
    this.socketService.on<RecordingStateEvent>('recording-state', (state) => {
      this._isRecording = state.isRecording;
      this._isManualOverride = state.isManualOverride;
      this.recordingSubject.next(this._isRecording);
    });
  }

  private cancelAutoStop(): void {
    if (this._autoStopTimer) {
      clearTimeout(this._autoStopTimer);
      this._autoStopTimer = null;
    }
  }

  public ngOnDestroy(): void {
    this.cancelAutoStop();
    this.subscriptions.forEach(s => s.unsubscribe());
    this.recordingSubject.complete();
  }
}
