import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { ApiService } from './api.service';
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

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private authChecked = false;
  private authCheckInProgress = false;

  // Token en memoire UNIQUEMENT pour les SSE (EventSource)
  // Ne pas utiliser pour l'authentification principale (utiliser les cookies)
  private sseToken: string | null = null;

  /**
   * Verifie l'etat d'authentification au demarrage via l'API
   */
  checkAuthStatus(): void {
    if (this.authCheckInProgress) return;
    this.authCheckInProgress = true;

    this.api.get<User>('/auth/me').subscribe({
      next: (user) => {
        this.currentUserSubject.next(user);
        this.authChecked = true;
        this.authCheckInProgress = false;
      },
      error: () => {
        this.currentUserSubject.next(null);
        this.authChecked = true;
        this.authCheckInProgress = false;
      }
    });
  }

  /**
   * Connexion - le serveur definit le cookie HttpOnly
   */
  login(email: string, password: string, mfaCode?: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/login', { email, password, mfaCode }).pipe(
      tap(response => {
        if (response.user) {
          this.currentUserSubject.next(response.user);
        }
        // Stocker le token en memoire UNIQUEMENT pour les SSE
        // Il n'est pas accessible via localStorage donc plus sur contre XSS
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
   */
  checkAuthentication(): Observable<boolean> {
    // Si deja verifie et on a un utilisateur, retourner true
    if (this.authChecked && this.currentUserSubject.value) {
      return of(true);
    }

    // Sinon, verifier via l'API
    return this.api.get<User>('/auth/me').pipe(
      map(user => {
        this.currentUserSubject.next(user);
        return true;
      }),
      catchError(() => {
        this.currentUserSubject.next(null);
        return of(false);
      })
    );
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  hasRole(...roles: string[]): boolean {
    const user = this.getCurrentUser();
    return user ? roles.includes(user.role) : false;
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
