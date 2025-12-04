import { Component, OnInit } from '@angular/core';
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
  constructor(
    private authService: AuthService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    const token = this.authService.getToken();
    if (token) {
      this.socketService.connect(token);
    }

    this.authService.currentUser$.subscribe(user => {
      if (user && !this.socketService.isConnected()) {
        const token = this.authService.getToken();
        if (token) {
          this.socketService.connect(token);
        }
      } else if (!user) {
        this.socketService.disconnect();
      }
    });
  }
}
