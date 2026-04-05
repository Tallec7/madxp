import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { LoggerService } from '../../core/services/logger.service';
import { ErrorExtractor } from '../../core/utils/error-extractor';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, LanguageSelectorComponent, RouterLink],
  template: `
    <div class="login-container" role="main">
      <div class="language-corner">
        <app-language-selector></app-language-selector>
      </div>
      <div class="login-card" role="region" aria-labelledby="login-title">
        <div class="login-header">
          <img src="assets/neopro-logo.png" alt="Logo Neopro" class="login-logo" />
          <h1 id="login-title" class="visually-hidden">{{ 'auth.centralDashboard' | translate }}</h1>
          <p>{{ 'auth.centralDashboard' | translate }}</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" [attr.aria-label]="'auth.login' | translate">
          <div class="form-group">
            <label for="email">{{ 'auth.email' | translate }}</label>
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
              {{ 'auth.emailRequired' | translate }}
            </span>
          </div>

          <div class="form-group">
            <label for="password">{{ 'auth.password' | translate }}</label>
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
              <ng-container *ngIf="loginForm.get('password')?.errors?.['required']">
                {{ 'auth.passwordRequired' | translate }}
              </ng-container>
              <ng-container *ngIf="loginForm.get('password')?.errors?.['minlength']">
                Le mot de passe doit contenir au moins 6 caractères
              </ng-container>
            </span>
          </div>

          <div class="info-alert" role="status" aria-live="polite" *ngIf="sessionExpired">
            <span>{{ 'auth.sessionExpired' | translate }}</span>
          </div>

          <div class="error-alert" role="alert" aria-live="polite" *ngIf="errorMessage">
            <span>{{ errorMessage }}</span>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-block"
            [disabled]="loading || loginForm.invalid"
            [attr.aria-busy]="loading"
            [attr.aria-label]="'auth.signIn' | translate"
          >
            <span *ngIf="!loading">{{ 'auth.signIn' | translate }}</span>
            <span *ngIf="loading" class="spinner-small" aria-hidden="true"></span>
            <span *ngIf="loading" class="visually-hidden">{{ 'auth.signingIn' | translate }}</span>
          </button>

          <div class="forgot-password-link">
            <a [routerLink]="['/forgot-password']">{{ 'auth.forgotPassword' | translate }}</a>
          </div>
        </form>

        <div class="login-footer">
          <div class="legal-links">
            <a [routerLink]="['/legal/privacy']">{{ 'legal.privacyPolicy' | translate }}</a>
            <span class="separator">|</span>
            <a [routerLink]="['/legal/terms']">{{ 'legal.termsOfService' | translate }}</a>
            <span class="separator">|</span>
            <a [routerLink]="['/legal/mentions']">{{ 'legal.legalMentions' | translate }}</a>
          </div>
          <p>{{ 'common.version' | translate }} 1.0.0</p>
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
      position: relative;
    }

    .language-corner {
      position: absolute;
      top: 1rem;
      right: 1rem;
      z-index: 1000;
      overflow: visible;
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

    .info-alert {
      background: #dbeafe;
      color: #1e40af;
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

    .legal-links {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

    .legal-links a {
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
      font-size: 0.8rem;
    }

    .legal-links a:hover {
      text-decoration: underline;
    }

    .legal-links .separator {
      color: #cbd5e1;
      font-size: 0.8rem;
    }

    .forgot-password-link {
      text-align: center;
      margin-top: 1rem;
    }

    .forgot-password-link a {
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
      font-size: 0.875rem;
    }

    .forgot-password-link a:hover {
      text-decoration: underline;
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
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly translationService = inject(TranslationService);
  private readonly logger = inject(LoggerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loginForm: FormGroup;
  loading = false;
  errorMessage = '';
  sessionExpired = false;

  constructor() {
    // Initialiser les traductions ici au lieu de AppComponent
    this.translationService.initializeLanguage();

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    // Vérifier si on arrive ici suite à une expiration de session
    this.route.queryParams.subscribe(params => {
      if (params['expired'] === 'true') {
        this.sessionExpired = true;
      }
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
        const user = this.authService.getCurrentUser();
        // Role-based redirect after login
        if (user?.role === 'club') {
          this.router.navigate(['/club']);
        } else if (user?.role === 'advertiser' || user?.role === 'sponsor') {
          this.router.navigate(['/advertiser-portal']);
        } else if (user?.role === 'agency') {
          this.router.navigate(['/agency-portal']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (error) => {
        this.loading = false;

        // Check for validation errors with details
        if (ErrorExtractor.isValidationError(error)) {
          const details = error.error?.details;
          if (Array.isArray(details) && details.length > 0) {
            // Build user-friendly message from validation details
            const fieldMessages = details.map((d: { field: string; message: string }) => {
              if (d.field === 'password' && d.message.includes('at least 6')) {
                return 'Le mot de passe doit contenir au moins 6 caractères';
              }
              if (d.field === 'email') {
                return 'Adresse email invalide';
              }
              return d.message;
            });
            this.errorMessage = fieldMessages.join('. ');
            this.logger.warn('Login validation failed', { email, details });
            return;
          }
        }

        const message = ErrorExtractor.getMessage(error);
        this.logger.warn('Login failed', { email, error: message });
        this.errorMessage = message || this.translationService.instant('auth.loginError');
      }
    });
  }
}
