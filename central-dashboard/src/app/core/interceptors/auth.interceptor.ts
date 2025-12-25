import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';

/**
 * Intercepteur HTTP pour gerer les erreurs d'authentification.
 *
 * Note: Avec les cookies HttpOnly, le token n'est plus stocke en localStorage.
 * Le serveur gere le cookie, donc on redirige simplement vers login en cas de 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError(error => {
      if (error.status === 401) {
        // Ne pas supprimer de localStorage car le token est dans un cookie HttpOnly
        // Simplement rediriger vers la page de login
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
