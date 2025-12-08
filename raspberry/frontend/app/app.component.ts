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
  }
}
