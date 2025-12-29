import { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';

/**
 * Intercepteur HTTP pour:
 * 1. Ajouter withCredentials à toutes les requêtes API (pour Safari)
 * 2. Gérer les erreurs d'authentification
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  // Ajouter withCredentials pour les requêtes vers l'API
  // Ceci est crucial pour Safari qui peut ignorer withCredentials dans certains cas
  const isApiRequest = req.url.includes('/api/') || req.url.includes('railway.app');
  const modifiedReq = isApiRequest
    ? req.clone({ withCredentials: true })
    : req;

  return next(modifiedReq).pipe(
    catchError(error => {
      // Seulement rediriger vers login si:
      // 1. C'est une vraie 401 (pas une erreur réseau status 0)
      // 2. Ce n'est pas déjà une requête sur /auth/login ou /auth/me
      const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/me');
      const isRealUnauthorized = error.status === 401 && !isAuthEndpoint;

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
};
