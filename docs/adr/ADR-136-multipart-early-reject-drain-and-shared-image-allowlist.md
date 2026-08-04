# ADR-136: Rejet précoce sur route multipart — drain du corps + allowlist image partagée

**Date** : 2026-08-04
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Sur toute route d'upload (`POST /api/image-to-video`, `/api/videos`, variantes, sides…), les gardes (`authenticate`, `requireRole`, `requireClubPermission`, `uploadRateLimit`) et le `fileFilter` multer répondent **pendant** que le client envoie encore le corps multipart. L'edge Railway relaie la réponse puis annule la stream HTTP/2 du client devenue inutile (`RST_STREAM CANCEL`) : Chrome jette la réponse déjà reçue et Angular voit `status: 0` / `ERR_HTTP2_PROTOCOL_ERROR`. Le vrai 400/401/403/429 n'atteint jamais l'UI.

Mesuré en prod le 2026-08-04 : réponse 401 reçue après 196 Ko envoyés sur 5 Mo, puis `CANCEL (err 8)`. Le symptôme est **spécifique au chemin HTTP/2 via l'edge** — en HTTP/1.1 direct sur l'origine, Node draine lui-même la requête non lue (`req._dump()`) et la réponse arrive intacte. Un test local en HTTP/1.1 ne reproduit donc pas le bug et ne prouve pas sa résolution.

Conséquence opérationnelle : n'importe quel rejet d'upload était indébuggable côté utilisateur. Le déclencheur observé était l'absence de `image/gif` dans l'allowlist multer — le fichier partait, se faisait rejeter en vol, et l'erreur explicative était perdue.

## Décision

**1. Drain avant réponse.** Un middleware global `drainOnEarlyResponse` ([`central-server/src/middleware/drain-request.ts`](../../central-server/src/middleware/drain-request.ts)) patche `res.end` pour les seules requêtes `multipart/form-data` : si le corps n'a pas été consommé, il est drainé avant que la réponse ne soit flushée. L'origine ne répond donc qu'une fois l'upload terminé et l'edge n'a plus de raison d'annuler. Le drain est **plafonné à 64 Mo** (`MAX_DRAIN_BYTES`) : au-delà on retombe sur l'ancien comportement, pour ne pas transformer un rejet précoce en éponge à bande passante sur un upload vidéo de 500 Mo.

**2. Allowlist image partagée + validation client.** Les formats acceptés deviennent une constante exportée des deux côtés (`ALLOWED_IMAGE_MIMES` serveur, `ALLOWED_IMAGE_MIME_TYPES` dashboard), `image/gif` inclus. Le dashboard filtre **avant** l'envoi : un format non supporté produit un message immédiat et exact, sans aller-retour réseau. Un smoke test compare les deux listes et échoue si elles divergent.

**3. GIF converti en préservant l'animation.** `buildFfmpegArgs()` distingue deux régimes d'entrée : `-loop 1 -framerate 1` pour une image fixe, `-ignore_loop 0` pour un GIF (rejoué en boucle jusqu'à la durée demandée). Le mime-type source est transmis par le controller pour forcer l'extension `.gif` du fichier temporaire quand le nom d'origine n'en porte pas.

## Alternatives rejetées

- **Déplacer multer avant les gardes** : rejeté car le serveur accepterait alors des uploads de 500 Mo d'utilisateurs non authentifiés ou hors quota — surface DoS/disque inacceptable.
- **Drainer sans plafond** : rejeté car refuser un upload vidéo de 500 Mo obligerait le serveur à l'avaler intégralement.
- **Middleware monté route par route** : rejeté au profit d'un montage global — le middleware est inerte hors multipart, et un montage par route laisserait mécaniquement des routes d'upload futures non couvertes.
- **Corriger uniquement le client (message « erreur réseau » plus clair)** : rejeté car cela masque le problème sans jamais restituer le code HTTP réel — l'utilisateur ne saurait toujours pas s'il s'agit d'un quota, d'une session expirée ou d'un format.
- **Extraire la 1re frame d'un GIF** : rejeté — la demande produit est explicitement « un GIF se comporte comme une vidéo ».

## Conséquences

- Tout rejet d'upload (400/401/403/429) affiche désormais son message réel dans le dashboard, sur toutes les routes multipart — pas seulement `image-to-video`.
- Les GIF animés sont utilisables comme contenu de boucle, bouclés sur la durée choisie.
- **Coût assumé** : sur un rejet, le client termine son upload avant de recevoir l'erreur (jusqu'à 64 Mo de bande passante entrante consommée pour rien). Compromis retenu face à une erreur illisible. Au-delà du plafond, un `logger.warn` trace l'abandon.
- **Vérification incomplète** : le comportement de l'edge n'est pas reproductible en local. La disparition du `ERR_HTTP2_PROTOCOL_ERROR` doit être reconfirmée après déploiement (re-probe curl HTTP/2 avec un corps de 5 Mo : attendu `http=401 up=5000000` sans `curl: (92)`).

## Fichiers impactés

- `central-server/src/middleware/drain-request.ts` — **nouveau**, `drainOnEarlyResponse` + `MAX_DRAIN_BYTES`
- `central-server/src/server.ts` — montage global, avant les routes `/api`
- `central-server/src/middleware/upload.ts` — `ALLOWED_IMAGE_MIMES` exporté, `image/gif` ajouté
- `central-server/src/services/image-to-video.service.ts` — `buildFfmpegArgs()` / `isAnimatedSource()` extraits, régime GIF
- `central-server/src/controllers/content-deployment.controller.ts` — transmet `sourceMimeType`
- `central-dashboard/src/app/core/constants/media-upload.constants.ts` — **nouveau**, allowlist partagée
- `central-dashboard/src/app/features/content/video-upload.service.ts` — allowlist partagée
- `central-dashboard/src/app/shared/components/video-upload-zone/video-upload-zone.component.ts` — filtrage pré-envoi + `describeUploadError`
- `central-dashboard/src/app/features/content/content-management.component.{ts,html}` — `accept` depuis la constante
- Tests : `smoke-content-upload-incident-2026-08-04.test.ts`, `middleware/__tests__/drain-request.test.ts`, `services/__tests__/image-to-video.service.test.ts`
- `docs/runbooks/INCIDENT-LOG.md` — entrée P2 2026-08-04
