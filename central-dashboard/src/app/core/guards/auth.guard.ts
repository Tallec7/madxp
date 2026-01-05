import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Guard d'authentification asynchrone.
 * Vérifie via l'API /auth/me si l'utilisateur est connecté.
 * Supporte Safari et les navigateurs avec restrictions ITP.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Si déjà authentifié en mémoire, autoriser immédiatement
  if (authService.isAuthenticated()) {
    console.log('[GUARD] User already authenticated in memory');
    return true;
  }

  console.log('[GUARD] Checking authentication via API...');
  // Sinon, vérifier via l'API (pour les cas où le cookie existe mais le state est vide)
  return authService.checkAuthentication().pipe(
    map(isAuthenticated => {
      console.log('[GUARD] checkAuthentication result:', isAuthenticated);
      if (isAuthenticated) {
        return true;
      }
      console.log('[GUARD] Not authenticated, redirecting to login');
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return false;
    }),
    catchError((err) => {
      console.error('[GUARD] checkAuthentication error:', err);
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return of(false);
    })
  );
};

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles = route.data['roles'] as string[];

  // Vérification async pour supporter Safari
  return authService.checkAuthentication().pipe(
    map(isAuthenticated => {
      if (!isAuthenticated) {
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }

      if (!requiredRoles || authService.hasRole(...requiredRoles)) {
        return true;
      }

      router.navigate(['/forbidden']);
      return false;
    }),
    catchError(() => {
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return of(false);
    })
  );
};
