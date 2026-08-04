# SPEC : Vidéo (cycle complet)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-29
> **last_verified** : 2026-05-10
> **verified_against_commit** : 1890d43
> **ADR liés** : ADR-022 (restructuration UX de l'onglet Contenu — site-content-tab), ADR-100 (alias `storage_path AS url` dans `findVideoById`), ADR-136 (drain multipart avant rejet précoce + allowlist image partagée + GIF animé)
> **Smoke tests** : `smoke-wiring.test.ts` (upload-verification exports), `smoke-saas.test.ts` (replace path via `.url`), `smoke-content-upload-incident-2026-08-04.test.ts` (drain multipart + allowlist image + régime ffmpeg GIF)
> **`.claude/rules/` lié** : aucun dédié — invariants à formaliser si régression

## En une phrase

Une vidéo suit un cycle upload → vérification FTP → catégorisation → déploiement → diffusion → suppression, avec cascade DELETE sur les enfants (variantes, déploiements, plays) et un audit FTP périodique pour détecter les zombies.

## Acteurs impliqués

- **Super admin / Operator** : upload, remplacement, suppression, déploiement
- **Club** : upload de ses propres vidéos (quota tier), suppression de ses vidéos
- **Pi / TV SaaS** : diffuse les vidéos déployées
- **CRON video-ftp-audit** : détecte les vidéos avec storage_path introuvable sur FTP

## Périmètre (ce que ce domaine couvre)

- **Services backend** :
  - `central-server/src/services/upload-verification.service.ts` (verify FTP post-upload, `upload_status`)
  - `central-server/src/services/storage.service.ts` (abstraction FTP Hostinger)
  - `central-server/src/services/video-ftp-audit.service.ts` (audit FTP flotte, détection zombies)
  - `central-server/src/services/video-category.service.ts` (CRUD catégories)
  - `central-server/src/services/asset.service.ts` (upload images + vidéos image-to-video)
- **Controllers** :
  - `central-server/src/controllers/content.controller.ts` (createVideo, replaceVideo, deleteVideo, createVideos bulk)
  - `central-server/src/controllers/video-category.controller.ts`
  - `central-server/src/cron-tasks/video-ftp-audit.task.ts` (audit périodique)
- **Composants UI** :
  - `central-dashboard/src/app/features/content/content-management.component.ts` (upload, bibliothèque, replace)
  - `central-dashboard/src/app/features/sites/components/site-content-tab/` (boucle vidéo par site)
- **Routes API** :
  - `POST /api/content/videos` (single upload)
  - `POST /api/content/videos/bulk` (bulk upload, max 20)
  - `POST /api/content/videos/:id/replace` (replace avec verify FTP)
  - `DELETE /api/content/videos/:id` (cascade DELETE)
  - `DELETE /api/content/videos/:id/sites/:siteId` (unlink)
- **Tables DB** : `videos`, `video_categories`, `video_variants`, `video_plays` (FK cascade), `deployments`
- **ADR** : ADR-100, ADR-117, ADR-136
- **Smoke tests** : `smoke-wiring.test.ts`, `smoke-saas.test.ts`, `smoke-deploy-ota.test.ts`

## Règles métier (ce qui DOIT marcher)

- **Upload** : fichier multipart → FTP Hostinger → `storage_path` enregistré → `upload_status = 'verifying'` → `upload-verification.service` vérifie la présence du fichier FTP → `upload_status = 'ready'` si OK, `'failed'` sinon.
- **Rejet d'upload lisible (ADR-136)** : sur une route multipart, un rejet (401/403/429/400 `fileFilter`) part pendant que le client envoie encore le corps ; l'edge Railway annule alors la stream HTTP/2 et le navigateur ne voit que `status: 0`. Le middleware global `drainOnEarlyResponse` draine le corps (plafond 64 Mo) avant de flusher la réponse, pour que le vrai code HTTP atteigne le dashboard. Toute nouvelle route d'upload en hérite automatiquement — ne pas la monter hors de la chaîne `app.use` du serveur.
- **Formats image → vidéo (ADR-136)** : `POST /api/image-to-video` accepte JPG, PNG, WEBP et **GIF**. L'allowlist `ALLOWED_IMAGE_MIMES` (serveur) doit rester identique à `ALLOWED_IMAGE_MIME_TYPES` (dashboard) — le dashboard filtre avant l'envoi pour donner un message immédiat. Un GIF est converti en préservant son animation (`-ignore_loop 0`, bouclé jusqu'à la durée demandée), jamais figé sur sa 1ʳᵉ frame.
- **Alias `findVideoById` (ADR-100)** : `videoRepository.findVideoById()` retourne `url` (alias de `storage_path`), PAS `storage_path`. Tout consumer de ce repo doit lire `.url`, jamais `.storage_path` (valeur runtime = `undefined` → bug zombie).
- **Replace** : `POST /api/content/videos/:id/replace` — lit `existing.url` (ADR-100), upload le nouveau fichier sur le même chemin FTP, re-verify. **Auto-résout la warning FTP** : si une row `video_ftp_audit_warnings` existe pour cette vidéo, elle est supprimée (DELETE) après upload réussi — pas de status `'resolved'` persisté, la row disparaît. Cette résolution n'est pas comptabilisée dans la métrique Prometheus `resolved` du CRON (angle mort — ADR-098).
- **Catégories** : les vidéos peuvent appartenir à 0..N catégories (table junction). Filtres dashboard par catégorie.
- **Cascade DELETE** : `DELETE /api/content/videos/:id` supprime la vidéo + ses variantes + ses déploiements + son fichier FTP. La table `video_plays` conserve l'historique (analytics, FK nullable).
- **Audit FTP** : le CRON `video-ftp-audit.task` vérifie périodiquement que chaque `storage_path` existe sur le FTP Hostinger. Les vidéos introuvables sont marquées `❌ Introuvable FTP` — elles restent dans la boucle config jusqu'à action admin (Replace ou Unlink).
- **Auto-déploiement sur sauvegarde profil Pi (ADR-117)** : quand un admin sauvegarde un profil de config Pi (`updateProfileConfiguration`) ou déploie un profil (`deployProfile`), le serveur calcule le diff des paths vidéo new/old et déclenche automatiquement un `content_deployments` pour chaque vidéo nouvelle non encore déployée. Pré-conditions : `site_type = 'pi'`, vidéo `upload_status = 'ready'`, fichier accessible sur FTP (HEAD check parallèle 5s), pas de déploiement `pending/in_progress/completed` existant. Paths synthétiques (`web_page:`, `livestream:`) ignorés. La réponse API inclut `pendingDeployments: number`.
- **Throttle anti-storm (ADR-117 hardening, incident NLF 2026-05-13)** : 3 garde-fous superposés pour éviter qu'une cascade de déploiements écrase le Pi :
  - `MAX_AUTO_DEPLOY = 5` (cap candidats par appel — anciennement 10)
  - `MAX_IN_FLIGHT_PER_SITE = 8` (cap global, lu via `deploymentRepository.countActivePerSite(siteId)`) — si déjà N actifs ≥ 8 sur le site, l'appel est refusé, métrique `neopro_auto_deploy_throttled_total{reason='in_flight_cap'}` incrémentée
  - `INTER_DEPLOY_DELAY_MS = 1500` (sérialisation : pause 1.5s entre chaque INSERT pour ne pas saturer le CPU Pi)
  - Re-check mid-loop : si la cap est atteinte en cours de batch, `break` avec `reason='in_flight_cap_midloop'`
- **Club grants** : un club peut accéder aux vidéos qui lui ont été explicitement accordées via `video_club_grants` (table dédiée — pas d'accès universel aux vidéos MadXP).
- **Quota tier** : le nombre de vidéos uploadables par un club est limité par son tier d'abonnement (tier Play = 25 max). Checked à l'upload.

## Comportements observables

| Règle           | Comment on vérifie                                                                  |
| --------------- | ----------------------------------------------------------------------------------- |
| Upload ready    | Dashboard bibliothèque : badge `✅ Prête` dans les minutes suivant l'upload         |
| Upload failed   | Dashboard : badge `❌ Erreur vérification` + bouton Retry                           |
| Replace correct | Vidéo replacée joue le nouveau fichier (pas de 404 FTP)                             |
| Cascade DELETE  | Après suppression : 0 variante, 0 déploiement actif, fichier FTP absent             |
| Audit FTP       | Grafana/log CRON `video-ftp-audit.task` : compteur `neopro_video_ftp_orphans_total` |
| Club quota      | Upload au-delà du quota → 403 avec message "Quota atteint pour votre abonnement"    |

## Cas d'edge connus

- **Bug FTP upload path mismatch (ADR-100, incident 2026-04-27)** : `replaceVideo` lisait `existing.storage_path` (valeur `undefined` via alias DB) au lieu de `existing.url`, uploadait vers `<chroot>/undefined`. La verify FTP retournait success (fichier qu'on venait d'écrire), DB marquait `ready`, mais le vrai fichier ne recevait jamais d'écriture → 12 vidéos zombies en prod avec HTTP 404. **Fix** : lire `existing.url` (PR #666). Ne JAMAIS utiliser `existing.storage_path` après `findVideoById` — voir ADR-100.
- **Vidéo orpheline FTP** (storage_path introuvable côté Hostinger) : détectée par `video-ftp-audit.service`, marquée `❌ Introuvable FTP`. Elle reste dans la boucle config tant que l'admin ne fait pas Replace ou Unlink (pas de suppression automatique — risque de fausse alarme pendant un déplacement FTP). La résolution se fait par DELETE de la row `video_ftp_audit_warnings`, soit automatiquement par le CRON si le fichier FTP revient, soit par le Replace endpoint (PR #647) — dans les deux cas aucune row `status='resolved'` n'est persistée.
- **Replace en cours de diffusion** : la TV Pi continue à lire le fichier en cache local jusqu'au prochain déploiement. Pas de coupure immédiate.
- **Upload bulk partiel** (1 fichier KO sur 20) : les fichiers OK passent à `ready`, le fichier KO reste `failed`. Pas de rollback transactionnel global.
- **`checksum` collision** : `findByChecksum` détecte un upload dupliqué → retourne la vidéo existante sans ré-uploader (dédoublonnage silencieux).

## Contraintes / NE PAS FAIRE

- Ne jamais lire `existing.storage_path` après `findVideoById` (ADR-100). Utiliser `existing.url`.
- Ne jamais placer multer avant les gardes d'auth/quota pour « régler » un rejet illisible (ADR-136) : le serveur accepterait des uploads de 500 Mo non authentifiés. Le drain est la réponse.
- Ne jamais dupliquer la liste des mime-types image côté dashboard (ADR-136) : importer `media-upload.constants.ts`. Le smoke compare les deux listes.
- Ne jamais appeler `storage.service.ts` directement depuis un controller — passer par `content.controller.ts` ou `upload-verification.service.ts`.
- Ne pas supprimer un fichier FTP sans d'abord supprimer la row DB (risque de vidéo "ready" sans fichier).
- Ne pas modifier `video_plays` lors d'une suppression (rétention analytics : les plays historiques restent, FK nullable sur `video_id`).

## Ce qui n'est PAS dans ce domaine

- **Déploiement Pi (push config)** → SPEC Déploiement & OTA (à créer)
- **Templates vidéo Remotion** → Templates Studio V1 code-driven (ADR-123/124/125/127/128). V2 legacy supprimé en ADR-129.
- **Rotation pondérée des vidéos sponsors** → SPEC [Sponsors & Pubs](sponsors.spec.md)
- **Compression / transcodage** → `video-compression.service.ts` (interne, pas de règle métier exposée)

## Évolutions possibles

- [ ] Smoke test vérifiant que `replaceVideo` lit `.url` et pas `.storage_path` (guard ADR-100)
- [ ] Retry automatique des uploads `failed` (actuellement manuel depuis le dashboard)
- [ ] Alerte Grafana si `video_ftp_orphans_total` > seuil sur 24h
- [ ] Suppression automatique des vidéos orphelines FTP après N jours de validation admin
