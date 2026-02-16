import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { LocalBroadcastService } from './local-broadcast.service';
import { SocketService } from './socket.service';

export interface RecordingStateEvent {
  isRecording: boolean;
  isManualOverride: boolean;
}

export interface RecordingWarningState {
  active: boolean;
  secondsRemaining: number;
}

/**
 * Service de gestion de l'état d'enregistrement analytics.
 *
 * Comportement hybride :
 * - **Au boot : OFF** — aucune donnée analytics enregistrée
 * - **Auto ON** quand la télécommande change de phase (neutral → before/during/after)
 * - **Auto OFF** après 15 min d'inactivité (toutes phases) + 3 min de countdown warning
 * - **Override manuel** : bouton sur la télécommande pour forcer start/stop (pas d'inactivité timer)
 *
 * L'état est synchronisé entre onglets via BroadcastChannel et entre instances via Socket.IO.
 */
@Injectable({ providedIn: 'root' })
export class RecordingStateService implements OnDestroy {
  private readonly localBroadcast = inject(LocalBroadcastService);
  private readonly socketService = inject(SocketService);

  /** Délai d'inactivité avant affichage du warning (15 minutes) */
  private readonly INACTIVITY_DELAY = 15 * 60 * 1000;
  /** Durée du countdown warning avant auto-stop (3 minutes en secondes) */
  private readonly WARNING_COUNTDOWN = 3 * 60;

  private _isRecording = false;
  private _isManualOverride = false;
  private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private _warningCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private _warningSecondsRemaining = 0;
  private subscriptions: Subscription[] = [];

  // Observable pour le binding UI du recording
  private readonly recordingSubject = new BehaviorSubject<boolean>(false);
  public readonly isRecording$: Observable<boolean> = this.recordingSubject.asObservable();

  // Observable pour le warning d'inactivité
  private readonly warningSubject = new BehaviorSubject<RecordingWarningState>({ active: false, secondsRemaining: 0 });
  public readonly warning$: Observable<RecordingWarningState> = this.warningSubject.asObservable();

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
   * Auto-start si on quitte neutral. Auto-stop au retour en neutral.
   * Le changement de phase est une interaction (reset inactivité).
   */
  public onPhaseChange(phase: 'neutral' | 'before' | 'during' | 'after'): void {
    if (phase !== 'neutral' && !this._isRecording) {
      // Auto-start : on entre dans une phase de match
      this.startRecording(false);
    } else if (phase === 'neutral' && this._isRecording && !this._isManualOverride) {
      // Auto-stop : retour en boucle par défaut → arrêter l'enregistrement
      this.stopRecording(false);
    } else if (this._isRecording && !this._isManualOverride) {
      // Changement de phase (non-neutral → non-neutral) = interaction → reset timer
      this.resetInactivityTimer();
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
    this.cancelWarning();
    this.cancelInactivityTimer();
    this.recordingSubject.next(true);
    this.broadcast();

    // Démarrer le timer d'inactivité pour les enregistrements automatiques
    if (!manual) {
      this.resetInactivityTimer();
    }
  }

  /** Forcer l'arrêt */
  public stopRecording(manual: boolean): void {
    this._isRecording = false;
    this._isManualOverride = manual;
    this.cancelWarning();
    this.cancelInactivityTimer();
    this.recordingSubject.next(false);
    this.broadcast();
  }

  /**
   * Reset le timer d'inactivité. Appelé par la Remote sur toute interaction significative.
   * Si le warning est actif, il est annulé et le cycle complet recommence.
   */
  public resetInactivityTimer(): void {
    if (!this._isRecording || this._isManualOverride) {
      return;
    }

    this.cancelWarning();
    this.cancelInactivityTimer();

    this._inactivityTimer = setTimeout(() => {
      this.startWarningCountdown();
    }, this.INACTIVITY_DELAY);
  }

  /**
   * Prolonger l'enregistrement (bouton "Continuer" dans la popup).
   * Annule le warning et relance le cycle complet d'inactivité.
   */
  public extendRecording(): void {
    this.cancelWarning();
    this.resetInactivityTimer();
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  /** Démarre le countdown de 3 minutes avant auto-stop */
  private startWarningCountdown(): void {
    this._warningSecondsRemaining = this.WARNING_COUNTDOWN;
    this.warningSubject.next({ active: true, secondsRemaining: this._warningSecondsRemaining });

    this._warningCountdownTimer = setInterval(() => {
      this._warningSecondsRemaining--;
      this.warningSubject.next({ active: true, secondsRemaining: this._warningSecondsRemaining });

      if (this._warningSecondsRemaining <= 0) {
        this.cancelWarning();
        this.stopRecording(false);
      }
    }, 1000);
  }

  private cancelWarning(): void {
    if (this._warningCountdownTimer) {
      clearInterval(this._warningCountdownTimer);
      this._warningCountdownTimer = null;
    }
    if (this._warningSecondsRemaining > 0 || this.warningSubject.value.active) {
      this._warningSecondsRemaining = 0;
      this.warningSubject.next({ active: false, secondsRemaining: 0 });
    }
  }

  private cancelInactivityTimer(): void {
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
  }

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
        if (!this._isRecording) {
          this.cancelWarning();
          this.cancelInactivityTimer();
        }
      })
    );

    // Via Socket.IO (autre instance, ex: kiosk ↔ navigateur)
    this.socketService.on<RecordingStateEvent>('recording-state', (state) => {
      this._isRecording = state.isRecording;
      this._isManualOverride = state.isManualOverride;
      this.recordingSubject.next(this._isRecording);
      if (!this._isRecording) {
        this.cancelWarning();
        this.cancelInactivityTimer();
      }
    });
  }

  public ngOnDestroy(): void {
    this.cancelWarning();
    this.cancelInactivityTimer();
    this.subscriptions.forEach(s => s.unsubscribe());
    this.recordingSubject.complete();
    this.warningSubject.complete();
  }
}
