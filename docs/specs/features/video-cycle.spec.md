# SPEC : Vidéo (cycle complet)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-04-29
> **ADR liés** : ADR-022 (restructuration UX de l'onglet Contenu — site-content-tab), ADR-100 (alias `storage_path AS url` dans `findVideoById`)
> **Smoke tests** : `smoke-wiring.test.ts` (upload-verification exports), `smoke-saas.test.ts` (replace path via `.url`)
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
- **ADR** : ADR-100
- **Smoke tests** : `smoke-wiring.test.ts`, `smoke-saas.test.ts`

## Règles métier (ce qui DOIT marcher)

- **Upload** : fichier multipart → FTP Hostinger → `storage_path` enregistré → `upload_status = 'verifying'` → `upload-verification.service` vérifie la présence du fichier FTP → `upload_status = 'ready'` si OK, `'failed'` sinon.
- **Alias `findVideoById` (ADR-100)** : `videoRepository.findVideoById()` retourne `url` (alias de `storage_path`), PAS `storage_path`. Tout consumer de ce repo doit lire `.url`, jamais `.storage_path` (valeur runtime = `undefined` → bug zombie).
- **Replace** : `POST /api/content/videos/:id/replace` — lit `existing.url` (ADR-100), upload le nouveau fichier sur le même chemin FTP, re-verify.
- **Catégories** : les vidéos peuvent appartenir à 0..N catégories (table junction). Filtres dashboard par catégorie.
- **Cascade DELETE** : `DELETE /api/content/videos/:id` supprime la vidéo + ses variantes + ses déploiements + son fichier FTP. La table `video_plays` conserve l'historique (analytics, FK nullable).
- **Audit FTP** : le CRON `video-ftp-audit.task` vérifie périodiquement que chaque `storage_path` existe sur le FTP Hostinger. Les vidéos introuvables sont marquées `❌ Introuvable FTP` — elles restent dans la boucle config jusqu'à action admin (Replace ou Unlink).
- **Club grants** : un club peut accéder aux vidéos qui lui ont été explicitement accordées via `video_club_grants` (table dédiée — pas d'accès universel aux vidéos Neopro).
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
- **Vidéo orpheline FTP** (storage_path introuvable côté Hostinger) : détectée par `video-ftp-audit.service`, marquée `❌ Introuvable FTP`. Elle reste dans la boucle config tant que l'admin ne fait pas Replace ou Unlink (pas de suppression automatique — risque de fausse alarme pendant un déplacement FTP).
- **Replace en cours de diffusion** : la TV Pi continue à lire le fichier en cache local jusqu'au prochain déploiement. Pas de coupure immédiate.
- **Upload bulk partiel** (1 fichier KO sur 20) : les fichiers OK passent à `ready`, le fichier KO reste `failed`. Pas de rollback transactionnel global.
- **`checksum` collision** : `findByChecksum` détecte un upload dupliqué → retourne la vidéo existante sans ré-uploader (dédoublonnage silencieux).

## Contraintes / NE PAS FAIRE

- Ne jamais lire `existing.storage_path` après `findVideoById` (ADR-100). Utiliser `existing.url`.
- Ne jamais appeler `storage.service.ts` directement depuis un controller — passer par `content.controller.ts` ou `upload-verification.service.ts`.
- Ne pas supprimer un fichier FTP sans d'abord supprimer la row DB (risque de vidéo "ready" sans fichier).
- Ne pas modifier `video_plays` lors d'une suppression (rétention analytics : les plays historiques restent, FK nullable sur `video_id`).

## Ce qui n'est PAS dans ce domaine

- **Déploiement Pi (push config)** → SPEC Déploiement & OTA (à créer)
- **Templates vidéo Remotion** → SPEC [Templates Studio](templates-studio.spec.md)
- **Rotation pondérée des vidéos sponsors** → SPEC [Sponsors & Pubs](sponsors.spec.md)
- **Compression / transcodage** → `video-compression.service.ts` (interne, pas de règle métier exposée)

## Évolutions possibles

- [ ] Smoke test vérifiant que `replaceVideo` lit `.url` et pas `.storage_path` (guard ADR-100)
- [ ] Retry automatique des uploads `failed` (actuellement manuel depuis le dashboard)
- [ ] Alerte Grafana si `video_ftp_orphans_total` > seuil sur 24h
- [ ] Suppression automatique des vidéos orphelines FTP après N jours de validation admin
