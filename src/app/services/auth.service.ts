import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly PASSWORD = 'GG_NEO_25k!';
  private readonly STORAGE_KEY = 'neopro_auth_token';
  private readonly SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 heures en millisecondes

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.checkAuth());
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor() {
    // Vérifier périodiquement si la session est expirée
    setInterval(() => {
      if (!this.checkAuth()) {
        this.isAuthenticatedSubject.next(false);
      }
    }, 60000); // Vérifier toutes les minutes
  }

  /**
   * Vérifie si l'utilisateur est authentifié
   */
  private checkAuth(): boolean {
    const token = localStorage.getItem(this.STORAGE_KEY);
    if (!token) {
      return false;
    }

    try {
      const authData = JSON.parse(token);
      const now = Date.now();
      const expiresAt = authData.expiresAt;

      // Vérifier si le token n'est pas expiré
      return now < expiresAt;
    } catch {
      return false;
    }
  }

  /**
   * Tente de se connecter avec le mot de passe
   */
  public login(password: string): boolean {
    if (password === this.PASSWORD) {
      const expiresAt = Date.now() + this.SESSION_DURATION;
      const authData = {
        authenticated: true,
        expiresAt
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
      this.isAuthenticatedSubject.next(true);
      return true;
    }
    return false;
  }

  /**
   * Déconnecte l'utilisateur
   */
  public logout(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.isAuthenticatedSubject.next(false);
  }

  /**
   * Retourne l'état d'authentification actuel
   */
  public isAuthenticated(): boolean {
    return this.checkAuth();
  }

  /**
   * Retourne le temps restant avant expiration (en millisecondes)
   */
  public getTimeRemaining(): number {
    const token = localStorage.getItem(this.STORAGE_KEY);
    if (!token) {
      return 0;
    }

    try {
      const authData = JSON.parse(token);
      return Math.max(0, authData.expiresAt - Date.now());
    } catch {
      return 0;
    }
  }
}
