import { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Intercepteur HTTP pour:
 * 1. Ajouter withCredentials à toutes les requêtes API (cookies)
 * 2. Ajouter Authorization header en fallback (pour Safari mobile qui bloque les cookies)
 * 3. Gérer les erreurs d'authentification
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  // Déterminer si c'est une requête API
  const isApiRequest = req.url.includes('/api/') || req.url.includes('railway.app');

  if (isApiRequest) {
    // Récupérer le token (stocké en mémoire après login)
    // Ce token sert de fallback quand les cookies sont bloqués (Safari mobile)
    const authService = injector.get(AuthService);
    const token = authService.getSseToken();

    let headers = req.headers;
    if (token) {
      // Ajouter le header Authorization en plus du cookie
      // Le serveur accepte les deux méthodes
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    const modifiedReq = req.clone({
      withCredentials: true,
      headers
    });

    return next(modifiedReq).pipe(
      catchError(error => {
        // Seulement rediriger vers login si:
        // 1. C'est une vraie 401 (pas une erreur réseau status 0)
        // 2. Ce n'est pas déjà une requête sur /auth/login ou /auth/me
        // 3. Ce n'est pas l'endpoint de logs (401 attendu si non authentifié)
        // 4. Ce n'est pas l'endpoint remote (public, pas d'auth requise)
        const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/me');
        const isLogEndpoint = req.url.includes('/logs/frontend');
        const isRemoteEndpoint = req.url.includes('/api/remote/');
        const isRealUnauthorized = error.status === 401 && !isAuthEndpoint && !isLogEndpoint && !isRemoteEndpoint;

        if (isRealUnauthorized) {
          const router = injector.get(Router);
          // Éviter les redirections multiples
          const currentUrl = router.url;
          if (currentUrl !== '/login') {
            router.navigate(['/login']);
          }
        }
        return throwError(() => error);
      })
    );
  }

  return next(req);
};
