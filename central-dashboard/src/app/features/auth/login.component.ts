import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="login-container" role="main">
      <div class="login-card" role="region" aria-labelledby="login-title">
        <div class="login-header">
          <img src="assets/neopro-logo.png" alt="Logo Neopro" class="login-logo" />
          <h1 id="login-title" class="visually-hidden">Connexion au Dashboard Central</h1>
          <p>Dashboard Central</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" aria-label="Formulaire de connexion">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="admin@neopro.fr"
              autocomplete="email"
              [attr.aria-invalid]="loginForm.get('email')?.invalid && loginForm.get('email')?.touched"
              [attr.aria-describedby]="loginForm.get('email')?.invalid && loginForm.get('email')?.touched ? 'email-error' : null"
              [class.error]="loginForm.get('email')?.invalid && loginForm.get('email')?.touched"
            />
            <span
              id="email-error"
              class="error-message"
              role="alert"
              *ngIf="loginForm.get('email')?.invalid && loginForm.get('email')?.touched"
            >
              Email requis
            </span>
          </div>

          <div class="form-group">
            <label for="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
              [attr.aria-invalid]="loginForm.get('password')?.invalid && loginForm.get('password')?.touched"
              [attr.aria-describedby]="loginForm.get('password')?.invalid && loginForm.get('password')?.touched ? 'password-error' : null"
              [class.error]="loginForm.get('password')?.invalid && loginForm.get('password')?.touched"
            />
            <span
              id="password-error"
              class="error-message"
              role="alert"
              *ngIf="loginForm.get('password')?.invalid && loginForm.get('password')?.touched"
            >
              Mot de passe requis
            </span>
          </div>

          <div class="error-alert" role="alert" aria-live="polite" *ngIf="errorMessage">
            <span>⚠️ {{ errorMessage }}</span>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-block"
            [disabled]="loading || loginForm.invalid"
            [attr.aria-busy]="loading"
            aria-label="Se connecter au dashboard"
          >
            <span *ngIf="!loading">Se connecter</span>
            <span *ngIf="loading" class="spinner-small" aria-hidden="true"></span>
            <span *ngIf="loading" class="visually-hidden">Connexion en cours...</span>
          </button>
        </form>

        <div class="login-footer" aria-label="Informations de version">
          <p>Version 1.0.0</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--neo-hockey-dark, #2022E9) 0%, var(--neo-purple-dark, #3A0686) 100%);
      padding: 2rem;
    }

    .login-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 420px;
      padding: 3rem;
    }

    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .login-logo {
      max-width: 200px;
      height: auto;
      margin-bottom: 1rem;
    }

    .login-header p {
      color: #64748b;
      font-size: 1rem;
      margin: 0;
      font-family: var(--neo-font-body);
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #334155;
    }

    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.2s;
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--neo-hockey-dark, #2022E9);
      box-shadow: 0 0 0 3px rgba(32, 34, 233, 0.1);
    }

    .form-group input.error {
      border-color: #ef4444;
    }

    .error-message {
      display: block;
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .error-alert {
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }

    .btn-block {
      width: 100%;
      padding: 0.875rem;
      font-size: 1rem;
      font-weight: 600;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .spinner-small {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .login-footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #e2e8f0;
    }

    .login-footer p {
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0;
    }

    /* WCAG AA Accessibility */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Focus visible pour navigation clavier */
    .form-group input:focus-visible {
      outline: 3px solid var(--neo-hockey-dark, #2022E9);
      outline-offset: 2px;
    }

    .btn:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 2px;
      box-shadow: 0 0 0 6px var(--neo-hockey-dark, #2022E9);
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .form-group input {
        border-width: 3px;
      }
      .btn {
        border: 2px solid currentColor;
      }
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .spinner-small {
        animation: none;
      }
    }
  `]
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  loginForm: FormGroup;
  loading = false;
  errorMessage = '';

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.error || 'Erreur de connexion. Veuillez réessayer.';
      }
    });
  }
}
