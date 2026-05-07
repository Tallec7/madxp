import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly socketService = inject(SocketService);

  public async ngOnInit(): Promise<void> {
    // Phase 6 — Fire Stick captive bootstrap router (CAPTIVE-02, CAPTIVE-04)
    // Si l'URL contient déjà ?display=N, on est sur le path Pi natif ou Fire Stick déjà résolu → bypass.
    // Sinon, on interroge /api/captive/whoami pour décider entre /?display=N (assigné) ou /captive/wait?mac=... (en attente).
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const alreadyOnDisplay = pathname.startsWith('/display/') || pathname.startsWith('/captive/');
    if (!alreadyOnDisplay && !params.has('display')) {
      try {
        const response = await fetch('/api/captive/whoami', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.displayIndex === 'number') {
            // Fire Stick assigné → redirect vers TvComponent (location.replace : pas d'historique pollué)
            window.location.replace('/display/' + data.displayIndex);
            return;
          }
          if (data && typeof data.mac === 'string') {
            // Fire Stick non assigné → page d'attente avec MAC affichée
            window.location.replace('/captive/wait?mac=' + encodeURIComponent(data.mac));
            return;
          }
        }
        // 404 mac_not_found ou réponse mal formée → laisser l'app boot normalement (display=0 par défaut)
      } catch (err) {
        // Réseau / proxy KO → laisser l'app boot normalement (résilience offline)
        console.warn('[AppComponent] captive whoami failed, booting normally:', err);
      }
    }

    this.socketService.initialize();
    this.removeBootSplash();
  }

  /** Fade-out et suppression du splash inline affiché dans index.html pendant le bootstrap Angular. */
  private removeBootSplash(): void {
    const splash = document.getElementById('neopro-boot-splash');
    if (splash) {
      splash.style.transition = 'opacity 0.5s ease-out';
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 500);
    }
  }
}
