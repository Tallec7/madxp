import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../core/services/api.service';
import { TranslationService } from '../../core/services/translation.service';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';

// Custom validator for password match
function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const passwordConfirm = control.get('password_confirm');

  if (!password || !passwordConfirm) return null;

  return password.value === passwordConfirm.value ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, LanguageSelectorComponent, RouterLink],
  template: `
    <div class="login-container" role="main">
      <div class="language-corner">
        <app-language-selector></app-language-selector>
      </div>
      <div class="login-card" role="region" aria-labelledby="reset-title">
        <div class="login-header">
          <img src="assets/neopro-logo.png" alt="Logo Neopro" class="login-logo" />
          <h1 id="reset-title">{{ 'auth.resetPassword' | translate }}</h1>
        </div>

        @if (verifying) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ 'common.verifying' | translate }}</p>
          </div>
        } @else if (!tokenValid) {
          <div class="error-state">
            <svg class="error-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="error-title">{{ 'auth.invalidToken' | translate }}</p>
            <p class="error-desc">Le lien de reinitialisation est invalide ou a expire.</p>
          </div>
        } @else if (resetSuccess) {
          <div class="success-message" role="status">
            <svg class="success-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="success-title">{{ 'auth.passwordResetSuccess' | translate }}</p>
            <p class="success-desc">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          </div>
        } @else {
          <form [formGroup]="resetForm" (ngSubmit)="onSubmit()" [attr.aria-label]="'auth.resetPassword' | translate">
            <div class="form-group">
              <label for="password">{{ 'auth.newPassword' | translate }}</label>
              <input
                id="password"
                type="password"
                formControlName="password"
                placeholder="••••••••"
                autocomplete="new-password"
                [attr.aria-invalid]="resetForm.get('password')?.invalid && resetForm.get('password')?.touched"
                [class.error]="resetForm.get('password')?.invalid && resetForm.get('password')?.touched"
              />
              <span
                class="error-message"
                role="alert"
                *ngIf="resetForm.get('password')?.hasError('required') && resetForm.get('password')?.touched"
              >
                {{ 'auth.passwordRequired' | translate }}
              </span>
              <span
                class="error-message"
                role="alert"
                *ngIf="resetForm.get('password')?.hasError('minlength') && resetForm.get('password')?.touched"
              >
                {{ 'auth.passwordTooShort' | translate }}
              </span>
            </div>

            <div class="form-group">
              <label for="password_confirm">{{ 'auth.confirmPassword' | translate }}</label>
              <input
                id="password_confirm"
                type="password"
                formControlName="password_confirm"
                placeholder="••••••••"
                autocomplete="new-password"
                [attr.aria-invalid]="resetForm.hasError('passwordMismatch') && resetForm.get('password_confirm')?.touched"
                [class.error]="resetForm.hasError('passwordMismatch') && resetForm.get('password_confirm')?.touched"
              />
              <span
                class="error-message"
                role="alert"
                *ngIf="resetForm.hasError('passwordMismatch') && resetForm.get('password_confirm')?.touched"
              >
                {{ 'auth.passwordMismatch' | translate }}
              </span>
            </div>

            <div class="error-alert" role="alert" aria-live="polite" *ngIf="errorMessage">
              <span>{{ errorMessage }}</span>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-block"
              [disabled]="loading || resetForm.invalid"
              [attr.aria-busy]="loading"
            >
              <span *ngIf="!loading">{{ 'auth.resetPassword' | translate }}</span>
              <span *ngIf="loading" class="spinner-small" aria-hidden="true"></span>
            </button>
          </form>
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
      margin: 0;
    }

    .loading-state {
      text-align: center;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: var(--neo-hockey-dark, #2022E9);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    .loading-state p {
      color: #64748b;
      margin: 0;
    }

    .error-state {
      text-align: center;
      padding: 2rem;
    }

    .error-icon {
      width: 64px;
      height: 64px;
      color: #ef4444;
      margin-bottom: 1rem;
    }

    .error-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #991b1b;
      margin: 0 0 0.5rem 0;
    }

    .error-desc {
      color: #64748b;
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
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translationService = inject(TranslationService);

  resetForm: FormGroup;
  loading = false;
  verifying = true;
  tokenValid = false;
  resetSuccess = false;
  errorMessage = '';
  token = '';

  constructor() {
    this.translationService.initializeLanguage();

    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      password_confirm: ['', Validators.required]
    }, { validators: passwordMatchValidator });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];

      if (!this.token) {
        this.verifying = false;
        this.tokenValid = false;
        return;
      }

      // Verify the token
      this.api.get<{ valid: boolean; email?: string }>('/auth/verify-reset-token', { token: this.token }).subscribe({
        next: (response) => {
          this.verifying = false;
          this.tokenValid = response.valid;
        },
        error: () => {
          this.verifying = false;
          this.tokenValid = false;
        }
      });
    });
  }

  onSubmit(): void {
    if (this.resetForm.invalid) {
      Object.keys(this.resetForm.controls).forEach(key => {
        this.resetForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { password, password_confirm } = this.resetForm.value;

    this.api.post<{ success: boolean; message: string }>('/auth/reset-password', {
      token: this.token,
      password,
      password_confirm
    }).subscribe({
      next: () => {
        this.resetSuccess = true;
        this.loading = false;

        // Redirect to login after 3 seconds
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.error || this.translationService.instant('common.error');
      }
    });
  }
}
