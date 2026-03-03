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

  public ngOnInit() {
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
