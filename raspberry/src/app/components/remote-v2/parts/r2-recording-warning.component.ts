import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecordingWarningState } from '../../../services/recording-state.service';
import { formatWarningTime } from '../remote-v2-helpers';

/**
 * Bandeau de warning d'inactivité enregistreur — visible quand `state.active`.
 * Présentationnel pur. Utilise le helper `formatWarningTime` (testé US-V2-06).
 */
@Component({
  selector: 'app-r2-recording-warning',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <div class="r2-rec-warning" *ngIf="state.active">
      <span class="r2-rec-warning-dot"></span>
      <span class="r2-rec-warning-text">
        Inactivité — arrêt dans <strong>{{ formatTime(state.secondsRemaining) }}</strong>
      </span>
      <button class="r2-rec-warning-extend" (click)="extend.emit()">Prolonger</button>
      <button class="r2-rec-warning-stop" (click)="dismiss.emit()" aria-label="Arrêter">✕</button>
    </div>
  `,
})
export class R2RecordingWarningComponent {
  @Input() state: RecordingWarningState = { active: false, secondsRemaining: 0 };
  @Output() extend = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();

  formatTime = formatWarningTime;
}
