import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="error-page">
      <div class="error-content">
        <h1>404</h1>
        <h2>Page introuvable</h2>
        <p>La page que vous recherchez n'existe pas ou a été déplacée.</p>
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
      background: #f8fafc;
    }

    .error-content {
      text-align: center;
    }

    .error-content h1 {
      font-size: 6rem;
      font-weight: 700;
      color: #94a3b8;
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

    .btn-primary {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
    }

    .btn-primary:hover {
      background: #2563eb;
    }
  `]
})
export class NotFoundComponent {}
