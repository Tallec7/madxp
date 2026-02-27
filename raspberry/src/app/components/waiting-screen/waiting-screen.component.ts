import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Splash screen displayed when no HDMI display is connected.
 * Shows Neopro branding + spinner + waiting message.
 *
 * US-23.2.1 — Splash screen d'attente
 */
@Component({
  selector: 'app-waiting-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './waiting-screen.component.html',
  styleUrl: './waiting-screen.component.scss',
})
export class WaitingScreenComponent {
  /** Message displayed below the spinner */
  @Input() message = 'En attente d\u2019\u00e9cran\u2026';

  /** Optional sub-message (e.g. port guidance) */
  @Input() subMessage: string | null = null;
}
