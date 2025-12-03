import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public password = '';
  public errorMessage = '';
  public isLoading = false;

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
}
