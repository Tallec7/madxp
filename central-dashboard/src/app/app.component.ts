import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { OfflineBannerComponent } from './core/components/offline-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, OfflineBannerComponent],
  template: `
    <app-offline-banner />
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent {
  // Pas d'initialisation ici pour éviter les dépendances circulaires
  // Les services s'initialiseront quand ils seront nécessaires
}
