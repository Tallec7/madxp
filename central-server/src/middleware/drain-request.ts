import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

/**
 * Garde-fou « réponse d'erreur lisible sur upload rejeté » — incident 2026-08-04.
 *
 * Problème : sur une route multipart (`/api/image-to-video`, `/api/videos`, …)
 * tous les gardes (authenticate, requireRole, requireClubPermission,
 * uploadRateLimit) répondent AVANT que multer ne consomme le corps de la
 * requête. L'origine émet donc sa réponse alors que le client est encore en
 * train d'uploader. L'edge Railway, qui parle HTTP/2 au navigateur, relaie la
 * réponse puis annule la stream cliente devenue inutile (RST_STREAM CANCEL) →
 * Chrome jette la réponse déjà reçue et remonte `ERR_HTTP2_PROTOCOL_ERROR`
 * avec `status: 0`. Le vrai 401/403/429/400 n'atteint jamais l'appli : le
 * dashboard affiche un message générique et l'utilisateur ne sait pas quoi
 * corriger.
 *
 * Mesuré en prod (2026-08-04) : réponse 401 reçue après 196 Ko envoyés sur
 * 5 Mo, puis `CANCEL (err 8)`. Note : le symptôme est propre au chemin HTTP/2
 * via l'edge — en HTTP/1.1 direct sur l'origine, Node draine lui-même la
 * requête non lue (`req._dump()`) et la réponse arrive intacte. Ne pas
 * conclure d'un test local en HTTP/1.1 que le problème est résolu.
 *
 * Fix : sur les requêtes multipart, on draine le corps restant AVANT de
 * flusher la réponse. L'origine ne répond donc qu'une fois l'upload terminé :
 * l'edge n'a plus de raison d'annuler, et le code HTTP réel arrive intact au
 * navigateur.
 *
 * Le drain est plafonné (`maxDrainBytes`) : refuser un upload de 500 Mo ne doit
 * pas obliger le serveur à en avaler l'intégralité. Au-delà du plafond on
 * retombe sur l'ancien comportement (socket fermée) — le client verra une
 * erreur réseau, mais on ne transforme pas un rejet précoce en éponge à
 * bande passante.
 */

/** 64 Mo : couvre tous les uploads image (50 Mo max) et les petites vidéos. */
export const MAX_DRAIN_BYTES = 64 * 1024 * 1024;

type EndArgs = Parameters<Response['end']>;

export const drainOnEarlyResponse = (maxDrainBytes: number = MAX_DRAIN_BYTES) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
      return next();
    }

    const originalEnd = res.end.bind(res) as (...args: EndArgs) => Response;
    let draining = false;

    res.end = function patchedEnd(...args: EndArgs): Response {
      // Corps déjà lu (cas nominal : multer a fait son travail) → rien à faire.
      if (draining || req.complete || req.readableEnded) {
        return originalEnd(...args);
      }

      draining = true;
      let drained = 0;
      let settled = false;

      const flush = (aborted: boolean): void => {
        if (settled) return;
        settled = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.removeListener('close', onError);
        if (aborted) {
          logger.warn('Upload rejected: body too large to drain, response may not reach the client', {
            path: req.path,
            statusCode: res.statusCode,
            drained,
            maxDrainBytes,
          });
        }
        originalEnd(...args);
      };

      const onData = (chunk: Buffer): void => {
        drained += chunk.length;
        if (drained > maxDrainBytes) {
          flush(true);
        }
      };
      const onEnd = (): void => flush(false);
      // 'close' sans 'end' = client parti en cours d'upload : ne jamais laisser
      // la réponse en attente d'un corps qui n'arrivera plus.
      const onError = (): void => flush(false);

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
      req.on('close', onError);
      req.resume();

      return res;
    } as Response['end'];

    next();
  };
};

export default drainOnEarlyResponse;
