import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <img src="neopro-logo.png" alt="Neopro" class="login-logo" />
          <p>Dashboard Central</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="admin@neopro.fr"
              [class.error]="loginForm.get('email')?.invalid && loginForm.get('email')?.touched"
            />
            <span class="error-message" *ngIf="loginForm.get('email')?.invalid && loginForm.get('email')?.touched">
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
              [class.error]="loginForm.get('password')?.invalid && loginForm.get('password')?.touched"
            />
            <span class="error-message" *ngIf="loginForm.get('password')?.invalid && loginForm.get('password')?.touched">
              Mot de passe requis
            </span>
          </div>

          <div class="error-alert" *ngIf="errorMessage">
            <span>⚠️ {{ errorMessage }}</span>
          </div>

          <button type="submit" class="btn btn-primary btn-block" [disabled]="loading || loginForm.invalid">
            <span *ngIf="!loading">Se connecter</span>
            <span *ngIf="loading" class="spinner-small"></span>
          </button>
        </form>

        <div class="login-footer">
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
  `]
})
export class LoginComponent {
  loginForm: FormGroup;
  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
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
