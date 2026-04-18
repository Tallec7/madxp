import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { RemotePinService } from '../services/remote-pin.service';

/**
 * ADR-058 — Attache automatiquement le header `x-remote-token` sur les requêtes
 * vers `/api/saas/:siteId/*`. Le token est géré par RemotePinService
 * (localStorage par siteId). Si aucun token n'est stocké, la requête passe
 * sans header et le serveur répondra 401 + { pinRequired: true } si le profil
 * protège la config par un PIN.
 */
const SAAS_URL_REGEX = /\/api\/saas\/([a-zA-Z0-9-]+)\//;

export const remotePinInterceptor: HttpInterceptorFn = (req, next) => {
  const match = SAAS_URL_REGEX.exec(req.url);
  if (!match) {
    return next(req);
  }

  const siteId = match[1];
  const pinService = inject(RemotePinService);
  const token = pinService.getToken(siteId);

  if (!token) {
    return next(req);
  }

  const cloned = req.clone({
    setHeaders: { 'x-remote-token': token },
  });
  return next(cloned);
};
