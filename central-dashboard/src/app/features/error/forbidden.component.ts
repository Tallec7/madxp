import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="error-page">
      <div class="error-content">
        <h1>403</h1>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        <a routerLink="/dashboard" class="btn btn-primary">Retour au dashboard</a>
      </div>
    </div>
  `,
  styles: [`
    .error-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .error-content {
      text-align: center;
    }

    .error-content h1 {
      font-size: 6rem;
      font-weight: 700;
      color: #ef4444;
      margin: 0;
    }

    .error-content h2 {
      font-size: 2rem;
      margin: 1rem 0;
      color: #334155;
    }

    .error-content p {
      color: #64748b;
      margin-bottom: 2rem;
    }
  `]
})
export class ForbiddenComponent {}
