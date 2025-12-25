import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private subscriptions: Subscription[] = [];

  // Login mode
  public password = '';
  public errorMessage = '';
  public isLoading = false;

  // Setup mode
  public isSetupMode = false;
  public newPassword = '';
  public confirmPassword = '';
  public setupError = '';
  public isConfigLoaded = false;

  // Password strength
  public passwordStrength: 'weak' | 'medium' | 'strong' = 'weak';

  ngOnInit(): void {
    // Attendre que la configuration soit chargée
    this.subscriptions.push(
      this.authService.configLoaded$.subscribe((loaded) => {
        this.isConfigLoaded = loaded;
        if (loaded) {
          this.checkSetupMode();
        }
      })
    );

    // Observer les changements de mode setup
    this.subscriptions.push(
      this.authService.requiresSetup$.subscribe((requiresSetup) => {
        this.isSetupMode = requiresSetup;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  private checkSetupMode(): void {
    this.isSetupMode = this.authService.needsSetup();
  }

  // ==================== LOGIN MODE ====================

  public onSubmit(): void {
    if (!this.password) {
      this.errorMessage = 'Veuillez entrer le mot de passe';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    // Simuler un délai pour l'expérience utilisateur
    setTimeout(() => {
      const success = this.authService.login(this.password);

      if (success) {
        // Rediriger vers la page d'accueil (TV)
        this.router.navigate(['/tv']);
      } else {
        this.errorMessage = 'Mot de passe incorrect';
        this.password = '';
      }

      this.isLoading = false;
    }, 300);
  }

  public onPasswordChange(): void {
    // Effacer le message d'erreur quand l'utilisateur tape
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }

  // ==================== SETUP MODE ====================

  public onNewPasswordChange(): void {
    this.setupError = '';
    this.updatePasswordStrength();
  }

  public onConfirmPasswordChange(): void {
    this.setupError = '';
  }

  private updatePasswordStrength(): void {
    const password = this.newPassword;
    if (password.length < 6) {
      this.passwordStrength = 'weak';
    } else if (password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
      this.passwordStrength = 'strong';
    } else if (password.length >= 8 && (/[A-Z]/.test(password) || /[0-9]/.test(password))) {
      this.passwordStrength = 'medium';
    } else {
      this.passwordStrength = 'weak';
    }
  }

  public async onSetupSubmit(): Promise<void> {
    // Validation
    if (!this.newPassword) {
      this.setupError = 'Veuillez entrer un mot de passe';
      return;
    }

    if (this.newPassword.length < 8) {
      this.setupError = 'Le mot de passe doit contenir au moins 8 caractères';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.setupError = 'Les mots de passe ne correspondent pas';
      return;
    }

    this.isLoading = true;
    this.setupError = '';

    try {
      const result = await this.authService.setInitialPassword(this.newPassword);

      if (result.success) {
        // Connexion automatique après setup
        const loginSuccess = this.authService.login(this.newPassword);
        if (loginSuccess) {
          this.router.navigate(['/tv']);
        } else {
          // Fallback: rester sur la page de login
          this.isSetupMode = false;
          this.password = '';
        }
      } else {
        this.setupError = result.error || 'Erreur lors de la configuration';
      }
    } catch (error: any) {
      this.setupError = error.message || 'Erreur inattendue';
    } finally {
      this.isLoading = false;
    }
  }

  public getPasswordStrengthLabel(): string {
    switch (this.passwordStrength) {
      case 'weak':
        return 'Faible';
      case 'medium':
        return 'Moyen';
      case 'strong':
        return 'Fort';
    }
  }

  public getPasswordStrengthClass(): string {
    return `strength-${this.passwordStrength}`;
  }
}
