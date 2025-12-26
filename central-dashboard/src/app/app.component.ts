import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { SocketService } from './core/services/socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly socketService = inject(SocketService);

  ngOnInit(): void {
    const token = this.authService.getSseToken();
    if (token) {
      this.socketService.connect(token);
    }

    this.authService.currentUser$.subscribe(user => {
      if (user && !this.socketService.isConnected()) {
        const token = this.authService.getSseToken();
        if (token) {
          this.socketService.connect(token);
        }
      } else if (!user) {
        this.socketService.disconnect();
      }
    });
  }
}
