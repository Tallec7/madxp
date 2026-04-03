import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { OfflineBannerComponent } from './core/components/offline-banner.component';
import { ErrorBoundaryComponent } from './core/components/error-boundary.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, OfflineBannerComponent, ErrorBoundaryComponent],
  template: `
    <app-offline-banner />
    <app-error-boundary>
      <router-outlet></router-outlet>
    </app-error-boundary>
  `,
  styles: []
})
export class AppComponent {
  // Pas d'initialisation ici pour éviter les dépendances circulaires
  // Les services s'initialiseront quand ils seront nécessaires
}
