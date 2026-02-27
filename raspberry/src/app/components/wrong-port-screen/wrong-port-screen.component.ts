import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Help screen displayed when the TV is plugged into the wrong HDMI port.
 * Shows an instruction message + countdown before the watchdog auto-swaps.
 *
 * E-23 US-23.5.3 — Message aide mauvaise prise
 */
@Component({
  selector: 'app-wrong-port-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wrong-port-screen.component.html',
  styleUrl: './wrong-port-screen.component.scss',
})
export class WrongPortScreenComponent implements OnInit, OnDestroy {
  /** Countdown duration in seconds before auto-swap */
  @Input() countdownSeconds = 10;

  /** Emitted when the countdown reaches zero */
  @Output() countdownComplete = new EventEmitter<void>();

  remaining = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.remaining = this.countdownSeconds;
    this.intervalId = setInterval(() => {
      this.remaining--;
      if (this.remaining <= 0) {
        this.clearTimer();
        this.countdownComplete.emit();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  /** SVG circle stroke-dashoffset for the countdown ring (264 = full circumference) */
  getProgressOffset(): number {
    const circumference = 264; // 2 * PI * 42
    const progress = this.remaining / this.countdownSeconds;
    return circumference * (1 - progress);
  }

  private clearTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
