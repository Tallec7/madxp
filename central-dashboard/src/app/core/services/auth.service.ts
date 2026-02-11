import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, of, map, interval, Subscription, shareReplay, finalize } from 'rxjs';
import { ApiService } from './api.service';
import { LoggerService } from './logger.service';
import { ErrorExtractor } from '../utils/error-extractor';
import { AuthResponse, User } from '../models';

/**
 * Service d'authentification utilisant les cookies HttpOnly.
 *
 * SECURITE: Le token JWT est stocke dans un cookie HttpOnly gere par le serveur.
 * - Plus de stockage dans localStorage (protection XSS)
 * - Le cookie est envoye automatiquement avec chaque requete
 * - La verification d'authentification se fait via l'API /auth/me
 *
 * Note: Un token est garde en memoire (pas localStorage) uniquement pour les
 * EventSource SSE qui ne supportent pas les cookies cross-origin.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private authChecked = false;

  // Observable partagé pour éviter les requêtes multiples simultanées
  // Utilise shareReplay pour que tous les guards partagent la même requête en cours
  private authCheckRequest$: Observable<boolean> | null = null;

  // Token en memoire UNIQUEMENT pour les SSE (EventSource)
  // Ne pas utiliser pour l'authentification principale (utiliser les cookies)
  private sseToken: string | null = null;

  // Vérification périodique de l'authentification (toutes les 5 minutes)
  private authCheckInterval$?: Subscription;

  /**
   * Verifie l'etat d'authentification au demarrage via l'API
   */
  checkAuthStatus(): void {
    // Utilise checkAuthentication() pour bénéficier de la déduplication
    this.checkAuthentication().subscribe();
  }

  /**
   * Démarre une vérification périodique de l'authentification
   * Vérifie toutes les 5 minutes si le token est toujours valide
   */
  private startPeriodicAuthCheck(): void {
    // Ne démarrer qu'une seule fois
    if (this.authCheckInterval$) {
      return;
    }

    // Vérifier toutes les 5 minutes (300000 ms)
    this.authCheckInterval$ = interval(300000).subscribe(() => {
      // Vérifier silencieusement sans bloquer l'UI
      this.logger.debug('Periodic auth check');

      // Utiliser checkAuthentication() pour bénéficier de la déduplication
      // et de la gestion correcte des erreurs 429
      this.checkAuthentication().subscribe({
        next: (isAuthenticated) => {
          if (!isAuthenticated) {
            // Session expirée - géré par checkAuthentication()
            // Mais on peut aussi avoir un rate limit 429, dans ce cas
            // checkAuthentication retourne false sans déconnecter
            // On vérifie si on a toujours un user en mémoire
            if (!this.currentUserSubject.value) {
              this.logger.warn('Periodic check: session expired');
              this.handleSessionExpired();
            }
          }
        }
      });
    });
  }

  /**
   * Arrête la vérification périodique
   */
  private stopPeriodicAuthCheck(): void {
    if (this.authCheckInterval$) {
      this.authCheckInterval$.unsubscribe();
      this.authCheckInterval$ = undefined;
    }
  }

  /**
   * Gère l'expiration de la session
   */
  private handleSessionExpired(): void {
    this.currentUserSubject.next(null);
    this.sseToken = null;
    this.stopPeriodicAuthCheck();
    // Disable backend logging when session expires
    this.logger.setAuthenticated(false);

    // Rediriger vers login seulement si pas déjà sur la page login
    const currentUrl = this.router.url;
    if (currentUrl !== '/login') {
      this.router.navigate(['/login'], {
        queryParams: { expired: 'true' }
      });
    }
  }

  /**
   * Connexion - le serveur definit le cookie HttpOnly
   */
  login(email: string, password: string, mfaCode?: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/login', { email, password, mfaCode }).pipe(
      tap(response => {
        if (response.user) {
          this.currentUserSubject.next(response.user);
          // Marquer comme vérifié pour éviter une re-vérification inutile
          this.authChecked = true;
          // Enable backend logging now that user is authenticated
          this.logger.setAuthenticated(true);
          // Démarrer la vérification périodique après login réussi
          this.startPeriodicAuthCheck();
        }
        // Stocker le token en memoire pour l'envoyer via header Authorization
        // Ceci est nécessaire pour Safari mobile qui bloque les cookies cross-origin
        if (response.token) {
          this.sseToken = response.token;
        }
      })
    );
  }

  /**
   * Retourne le token pour les connexions SSE/EventSource uniquement.
   * NE PAS utiliser pour l'authentification HTTP standard (utiliser les cookies).
   */
  getSseToken(): string | null {
    return this.sseToken;
  }

  /**
   * Deconnexion - le serveur supprime le cookie
   */
  logout(): void {
    // Arrêter la vérification périodique
    this.stopPeriodicAuthCheck();
    // Disable backend logging before logout
    this.logger.setAuthenticated(false);
    // Clear breadcrumbs on logout
    this.logger.clearBreadcrumbs();

    this.api.post('/auth/logout', {}).subscribe({
      next: () => {
        this.currentUserSubject.next(null);
        this.sseToken = null;
        this.router.navigate(['/login']);
      },
      error: () => {
        // Meme en cas d'erreur, on deconnecte localement
        this.currentUserSubject.next(null);
        this.sseToken = null;
        this.router.navigate(['/login']);
      }
    });
  }

  /**
   * Verifie si l'utilisateur est authentifie
   * Retourne true si on a un utilisateur charge, false sinon
   */
  isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Verifie l'authentification de maniere asynchrone (utile pour les guards)
   *
   * IMPORTANT: Cette méthode utilise shareReplay pour dédupliquer les requêtes.
   * Si plusieurs guards appellent cette méthode simultanément (ex: authGuard + roleGuard),
   * une seule requête HTTP sera effectuée et le résultat sera partagé.
   */
  checkAuthentication(): Observable<boolean> {
    // Si on a déjà un utilisateur en mémoire, retourner true immédiatement
    // Ceci est crucial après le login pour éviter une race condition
    if (this.currentUserSubject.value) {
      this.authChecked = true;
      return of(true);
    }

    // Si déjà vérifié et pas de requête en cours, retourner false
    if (this.authChecked && !this.authCheckRequest$) {
      return of(false);
    }

    // Si une requête est déjà en cours, retourner le même Observable partagé
    // Tous les guards recevront le même résultat
    if (this.authCheckRequest$) {
      this.logger.debug('checkAuthentication: sharing in-flight request');
      return this.authCheckRequest$;
    }

    this.logger.debug('checkAuthentication: initiating new request');

    // Créer une nouvelle requête partagée via shareReplay(1)
    // - shareReplay(1) garantit que tous les souscripteurs reçoivent la même valeur
    // - finalize() nettoie la référence quand tous les souscripteurs sont terminés
    this.authCheckRequest$ = this.api.get<User & { token?: string }>('/auth/me').pipe(
      map(response => {
        this.logger.debug('checkAuthentication: user authenticated', { email: response.email });
        // Stocker le token AVANT d'émettre l'utilisateur
        // pour que LayoutComponent puisse établir la connexion Socket.IO
        if (response.token) {
          this.sseToken = response.token;
        }
        this.currentUserSubject.next(response);
        this.authChecked = true;
        // Enable backend logging now that user is authenticated
        this.logger.setAuthenticated(true);
        // Démarrer la vérification périodique après refresh réussi
        this.startPeriodicAuthCheck();
        return true;
      }),
      catchError((err) => {
        const errorMessage = ErrorExtractor.getMessage(err);
        // Ne pas logger comme un échec si c'est un rate limit (429)
        // L'utilisateur est peut-être toujours authentifié
        if (errorMessage.includes('429') || errorMessage.includes('Trop de requêtes')) {
          this.logger.warn('checkAuthentication: rate limited, will retry later', { error: errorMessage });
          // Ne pas marquer comme vérifié pour permettre un retry
          // Ne pas effacer l'utilisateur actuel
          return of(false);
        }

        this.logger.warn('checkAuthentication: failed, redirecting to login', { error: errorMessage });
        this.currentUserSubject.next(null);
        this.sseToken = null;
        this.authChecked = true;
        // Disable backend logging when not authenticated
        this.logger.setAuthenticated(false);
        this.stopPeriodicAuthCheck();
        return of(false);
      }),
      // shareReplay(1) permet de partager le résultat avec tous les souscripteurs
      shareReplay(1),
      // finalize() nettoie la référence quand l'Observable se termine
      finalize(() => {
        this.authCheckRequest$ = null;
      })
    );

    return this.authCheckRequest$;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if the current user has one of the specified roles.
   * `super_admin` bypasses all role checks (mirrors backend `requireRole()` behavior).
   */
  hasRole(...roles: string[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    // Super admin bypasses all role checks (mirrors backend behavior)
    if (user.role === 'super_admin') return true;
    return roles.includes(user.role);
  }

  /**
   * Rafraichit les informations de l'utilisateur courant
   */
  refreshCurrentUser(): Observable<User | null> {
    return this.api.get<User>('/auth/me').pipe(
      tap(user => this.currentUserSubject.next(user)),
      catchError(() => {
        this.currentUserSubject.next(null);
        return of(null);
      })
    );
  }
}
