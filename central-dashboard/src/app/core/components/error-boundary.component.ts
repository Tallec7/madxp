import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ErrorBoundaryService } from '../services/error-boundary.service';

@Component({
  selector: 'app-error-boundary',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    @if (errorBoundary.hasError()) {
      <div class="error-page">
        <div class="error-content">
          <h1>Oups</h1>
          <h2>Une erreur inattendue est survenue</h2>
          <p>L'application a rencontré un problème. Essayez de rafraîchir la page.</p>
          <div class="error-actions">
            <button class="btn btn-primary" (click)="reload()">Rafraîchir la page</button>
            <a routerLink="/dashboard" class="btn btn-secondary" (click)="dismiss()">Retour au dashboard</a>
          </div>
        </div>
      </div>
    } @else {
      <ng-content></ng-content>
    }
  `,
  styles: [`
    .error-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      background: #f8fafc;
    }

    .error-content {
      text-align: center;
    }

    .error-content h1 {
      font-size: 4rem;
      font-weight: 700;
      color: #ef4444;
      margin: 0;
    }

    .error-content h2 {
      font-size: 1.5rem;
      margin: 1rem 0;
      color: #334155;
    }

    .error-content p {
      color: #64748b;
      margin-bottom: 2rem;
    }

    .error-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 500;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #334155;
    }

    .btn-secondary:hover {
      background: #cbd5e1;
    }
  `]
})
export class ErrorBoundaryComponent {
  readonly errorBoundary = inject(ErrorBoundaryService);

  reload(): void {
    window.location.reload();
  }

  dismiss(): void {
    this.errorBoundary.clear();
  }
}
