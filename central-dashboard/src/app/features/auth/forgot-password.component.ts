import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { TranslationService } from '../../core/services/translation.service';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, LanguageSelectorComponent, RouterLink],
  template: `
    <div class="login-container" role="main">
      <div class="language-corner">
        <app-language-selector></app-language-selector>
      </div>
      <div class="login-card" role="region" aria-labelledby="forgot-title">
        <div class="login-header">
          <img src="assets/neopro-logo.png" alt="Logo Neopro" class="login-logo" />
          <h1 id="forgot-title">{{ 'auth.forgotPassword' | translate }}</h1>
          <p>{{ 'auth.forgotPasswordDesc' | translate }}</p>
        </div>

        @if (!emailSent) {
          <form [formGroup]="forgotForm" (ngSubmit)="onSubmit()" [attr.aria-label]="'auth.forgotPassword' | translate">
            <div class="form-group">
              <label for="email">{{ 'auth.email' | translate }}</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                placeholder="votre@email.fr"
                autocomplete="email"
                [attr.aria-invalid]="forgotForm.get('email')?.invalid && forgotForm.get('email')?.touched"
                [class.error]="forgotForm.get('email')?.invalid && forgotForm.get('email')?.touched"
              />
              <span
                class="error-message"
                role="alert"
                *ngIf="forgotForm.get('email')?.invalid && forgotForm.get('email')?.touched"
              >
                {{ 'auth.emailRequired' | translate }}
              </span>
            </div>

            <div class="error-alert" role="alert" aria-live="polite" *ngIf="errorMessage">
              <span>{{ errorMessage }}</span>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-block"
              [disabled]="loading || forgotForm.invalid"
              [attr.aria-busy]="loading"
            >
              <span *ngIf="!loading">{{ 'auth.sendResetLink' | translate }}</span>
              <span *ngIf="loading" class="spinner-small" aria-hidden="true"></span>
            </button>
          </form>
        } @else {
          <div class="success-message" role="status">
            <svg class="success-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="success-title">{{ 'auth.resetLinkSent' | translate }}</p>
            <p class="success-desc">{{ 'auth.checkEmail' | translate }}</p>
          </div>
        }

        <div class="login-footer">
          <p>
            <a [routerLink]="['/login']" class="back-link">
              ← {{ 'auth.backToLogin' | translate }}
            </a>
          </p>
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

    .login-header h1 {
      color: #1e293b;
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
    }

    .login-header p {
      color: #64748b;
      font-size: 0.9rem;
      margin: 0;
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

    .success-message {
      text-align: center;
      padding: 2rem;
    }

    .success-icon {
      width: 64px;
      height: 64px;
      color: #22c55e;
      margin-bottom: 1rem;
    }

    .success-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #166534;
      margin: 0 0 0.5rem 0;
    }

    .success-desc {
      color: #64748b;
      margin: 0;
    }

    .login-footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #e2e8f0;
    }

    .back-link {
      color: var(--neo-hockey-dark, #2022E9);
      text-decoration: none;
      font-weight: 500;
    }

    .back-link:hover {
      text-decoration: underline;
    }
  `]
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly translationService = inject(TranslationService);

  forgotForm: FormGroup;
  loading = false;
  errorMessage = '';
  emailSent = false;

  constructor() {
    this.translationService.initializeLanguage();

    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.get('email')?.markAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { email } = this.forgotForm.value;

    this.api.post<{ success: boolean; message: string }>('/auth/forgot-password', { email }).subscribe({
      next: () => {
        this.emailSent = true;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.error || this.translationService.instant('common.error');
      }
    });
  }
}
