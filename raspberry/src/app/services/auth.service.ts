import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Configuration } from '../interfaces/configuration.interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly STORAGE_KEY = 'neopro_auth_token';
  private readonly DEFAULT_SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 heures en millisecondes
  private readonly LOCAL_SERVER_URL = 'http://localhost:3000';

  private password: string | null = null;
  private sessionDuration: number = this.DEFAULT_SESSION_DURATION;
  private configLoaded = false;

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.checkAuth());
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  private requiresSetupSubject = new BehaviorSubject<boolean>(false);
  public requiresSetup$: Observable<boolean> = this.requiresSetupSubject.asObservable();

  private configLoadedSubject = new BehaviorSubject<boolean>(false);
  public configLoaded$: Observable<boolean> = this.configLoadedSubject.asObservable();

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
          this.requiresSetupSubject.next(false);
          console.log('✓ Mot de passe personnalisé chargé depuis configuration.json');
        } else {
          // Pas de mot de passe configuré -> setup requis
          this.password = null;
          this.requiresSetupSubject.next(true);
          console.log('⚠ Aucun mot de passe configuré, configuration initiale requise');
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
        // Pas de section auth -> setup requis
        this.password = null;
        this.requiresSetupSubject.next(true);
        console.log('⚠ Aucune configuration auth trouvée, configuration initiale requise');
      }

      this.configLoaded = true;
      this.configLoadedSubject.next(true);
    } catch (error) {
      // Fichier configuration.json non trouvé -> setup requis
      this.password = null;
      this.requiresSetupSubject.next(true);
      console.warn('⚠ Impossible de charger configuration.json, configuration initiale requise');
      console.warn('Erreur:', error);
      this.configLoaded = true;
      this.configLoadedSubject.next(true);
    }
  }

  /**
   * Vérifie si le système nécessite une configuration initiale
   */
  public needsSetup(): boolean {
    return this.requiresSetupSubject.getValue();
  }

  /**
   * Définit le mot de passe initial lors du premier démarrage
   * Sauvegarde dans configuration.json via le serveur local
   */
  public async setInitialPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Appeler le serveur local pour sauvegarder le mot de passe
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; error?: string }>(
          `${this.LOCAL_SERVER_URL}/api/auth/setup`,
          { password: newPassword }
        )
      );

      if (response.success) {
        this.password = newPassword;
        this.requiresSetupSubject.next(false);
        console.log('✓ Mot de passe initial configuré avec succès');
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Erreur inconnue' };
      }
    } catch (error: any) {
      console.error('Erreur lors de la configuration du mot de passe:', error);
      return {
        success: false,
        error: error.message || 'Impossible de contacter le serveur local'
      };
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
    // Si aucun mot de passe configuré, refuser la connexion
    if (this.password === null) {
      console.warn('Tentative de connexion sans mot de passe configuré');
      return false;
    }

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
