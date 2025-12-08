import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);

  // Mot de passe par défaut (fallback si configuration.json n'est pas trouvé)
  private readonly DEFAULT_PASSWORD = 'GG_NEO_25k!';
  private readonly STORAGE_KEY = 'neopro_auth_token';
  private readonly DEFAULT_SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 heures en millisecondes

  private password: string = this.DEFAULT_PASSWORD;
  private sessionDuration: number = this.DEFAULT_SESSION_DURATION;
  private configLoaded = false;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.checkAuth());
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor() {
    // Charger la configuration au démarrage
    this.loadConfiguration();

    // Vérifier périodiquement si la session est expirée
    setInterval(() => {
      if (!this.checkAuth()) {
        this.isAuthenticatedSubject.next(false);
      }
    }, 60000); // Vérifier toutes les minutes
  }

  /**
   * Charge la configuration depuis configuration.json
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<Configuration>('/configuration.json')
      );

      if (config.auth) {
        // Utiliser le mot de passe de la configuration si disponible
        if (config.auth.password) {
          this.password = config.auth.password;
          console.log('✓ Mot de passe personnalisé chargé depuis configuration.json');
        }

        // Utiliser la durée de session personnalisée si disponible
        if (config.auth.sessionDuration) {
          this.sessionDuration = config.auth.sessionDuration;
          console.log(`✓ Durée de session configurée: ${this.sessionDuration / 1000 / 60 / 60}h`);
        }

        // Logger le nom du club si disponible
        if (config.auth.clubName) {
          console.log(`✓ Configuration pour le club: ${config.auth.clubName}`);
        }
      } else {
        console.log('ℹ Aucune configuration auth trouvée, utilisation du mot de passe par défaut');
      }

      this.configLoaded = true;
    } catch (error) {
      console.warn('⚠ Impossible de charger configuration.json, utilisation du mot de passe par défaut');
      console.warn('Erreur:', error);
      this.configLoaded = true;
    }
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
    if (password === this.password) {
      const expiresAt = Date.now() + this.sessionDuration;
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
