import { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';

/**
 * Intercepteur HTTP pour gerer les erreurs d'authentification.
 *
 * Note: Avec les cookies HttpOnly, le token n'est plus stocke en localStorage.
 * Le serveur gere le cookie, donc on redirige simplement vers login en cas de 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  return next(req).pipe(
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
