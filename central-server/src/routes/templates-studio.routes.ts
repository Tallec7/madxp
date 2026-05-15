/**
 * Templates Studio V1 — routes Express.
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md
 *
 * Validation au niveau routes (smoke-dashboard-guards enforced).
 * Toutes les routes derrière `authenticate` + rate limit standard.
 * `site_id` est extrait du JWT côté controller (jamais du body).
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireClubScope, requireRole } from '../middleware/auth';
import {
  validate,
  validateParams,
  validateQuery,
  paramSchemas,
  templatesStudioSchemas,
} from '../middleware/validation';
import { apiRateLimit } from '../middleware/user-rate-limit';
import { requestTimeout } from '../middleware/request-timeout';

// Upload routes timeout (5 min). Sans cette extension, le proxy Railway
// timeout par défaut (~100s) coupe les uploads volumineux : un .webm 80 MB
// sur connexion 5-10 Mbps prend 60-130s → ERR_CONNECTION_RESET côté browser
// (incident 2026-05-15). Pattern aligné sur remotion-templates.routes.ts
// (legacy v2 ADR-054) qui utilise déjà le même UPLOAD_TIMEOUT_MS=300_000.
const UPLOAD_TIMEOUT_MS = 300_000;
import {
  listTemplates,
  createRenderRequest,
  getRenderRequest,
  getBrandKit,
  upsertBrandKit,
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  uploadPlayerPhoto,
  uploadBrandKitLogo,
  distributeRender,
  listGlobalPlayers,
  createGlobalPlayer,
  addPlayerGrant,
  removePlayerGrant,
  listPlayerGrants,
  listStudioAssets,
  getStudioAsset,
  uploadStudioAsset,
  uploadStudioAssetDirectory,
  updateStudioAssetMetadata,
  deleteStudioAsset,
  getTemplateAssetBindings,
  upsertTemplateAssetBinding,
  deleteTemplateAssetBinding,
} from '../controllers/templates-studio.controller';

// Multer en mémoire pour photos brutes — 8 MB max (les photos high-res de
// shooting peuvent dépasser 5 MB). MimeType filter côté controller pour
// retourner un message FR clair (multer rejette en silence sinon).
const uploadPlayerPhotoMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

// Logos club — limite plus basse (2 MB suffit pour PNG/SVG club typiques).
const uploadBrandKitLogoMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

// Studio assets (ADR-125) — 100 MB max. Les fichiers font/* sont petits
// (<500 KB), mais les .webm peuvent monter à 50-80 MB pour des packshots
// 1080p de plusieurs secondes. Limite bumpée de 50→100 MB après échec
// upload PACKSHOT_GENERIC.webm 51.9 MB (incident 2026-05-15).
const uploadStudioAssetMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

// ADR-128 — Studio asset directory (ZIP de séquences PNG frames).
// Limite 200 MB : un ZIP packshot 1080p haute qualité avec 200+ frames PNG
// peut largement dépasser 50 MB (incident 2026-05-15 : packshot-img.zip
// rejected with 413 STORAGE_FILE_TOO_LARGE). Heap Node Railway = 560 MB,
// donc 200 MB ZIP + décompression jszip (~même taille en mémoire) reste
// dans le budget. Si OOM constaté en prod, basculer vers `diskStorage` +
// `unzipper` streaming.
const uploadStudioAssetDirectoryMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

// Helper : extrait `siteId` des params pour `requireClubScope`. Internal roles
// (admin, operator, super_admin) bypassent ; club users voient `siteId === user.site_id`.
const siteIdFromParams = (req: { params: { siteId?: string } }) => req.params.siteId;

const router = Router();

// Catalogue : lecture seule, authenticated suffit (pas de tenant scope).
router.get('/templates', authenticate, apiRateLimit, listTemplates);

// Render requests — création.
//
// Deux variantes :
// - `/render-requests`               : club user (site_id pris du JWT)
// - `/sites/:siteId/render-requests` : internal role (site_id en URL via
//   `requireClubScope` qui bypasse super_admin/admin/operator)
//
// Le controller `createRenderRequest` discrimine via `isInternalRole(role)`.
router.post(
  '/render-requests',
  authenticate,
  apiRateLimit,
  validate(templatesStudioSchemas.createRenderRequest),
  createRenderRequest,
);
router.post(
  '/sites/:siteId/render-requests',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  validate(templatesStudioSchemas.createRenderRequest),
  createRenderRequest,
);

// Render requests — suivi statut (guard tenant dans le controller).
router.get(
  '/render-requests/:id',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.id),
  getRenderRequest,
);

// Distribution multi-sites des renders (push direct vers libs vidéo OU grants
// ADR-082). Tenant guard dans le controller (club user limité à son render).
router.post(
  '/render-requests/:id/distribute',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.id),
  validate(templatesStudioSchemas.distributeRender),
  distributeRender,
);

// Brand kit — lecture / upsert. Tenant guard sur :siteId (club ne voit que son site).
router.get(
  '/sites/:siteId/brand-kit',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  getBrandKit,
);
router.put(
  '/sites/:siteId/brand-kit',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  validate(templatesStudioSchemas.upsertBrandKit),
  upsertBrandKit,
);

// Upload logo multipart (S3.1). FormData avec field `logo` + slot optionnel
// (primary | secondary | monochrome, défaut 'primary'). Met à jour
// logos_json.<slot> via merge JSONB côté controller.
router.post(
  '/sites/:siteId/brand-kit/logo',
  authenticate,
  requestTimeout(UPLOAD_TIMEOUT_MS),
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  uploadBrandKitLogoMiddleware.single('logo'),
  uploadBrandKitLogo,
);

// Roster joueurs (S4-A) — CRUD scopé site, photo upload viendra en S4-B.
router.get(
  '/sites/:siteId/players',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  listPlayers,
);
router.post(
  '/sites/:siteId/players',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteId),
  requireClubScope(siteIdFromParams),
  validate(templatesStudioSchemas.createPlayer),
  createPlayer,
);
router.put(
  '/sites/:siteId/players/:playerId',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteIdAndPlayerId),
  requireClubScope(siteIdFromParams),
  validate(templatesStudioSchemas.updatePlayer),
  updatePlayer,
);
router.delete(
  '/sites/:siteId/players/:playerId',
  authenticate,
  apiRateLimit,
  validateParams(paramSchemas.siteIdAndPlayerId),
  requireClubScope(siteIdFromParams),
  deletePlayer,
);

// Upload photo brute multipart (S4-B). FormData avec field `photo`.
// Met à jour photo_raw_url + cutout_status='pending' (réveille worker rembg S4-C).
router.post(
  '/sites/:siteId/players/:playerId/photo',
  authenticate,
  requestTimeout(UPLOAD_TIMEOUT_MS),
  apiRateLimit,
  validateParams(paramSchemas.siteIdAndPlayerId),
  requireClubScope(siteIdFromParams),
  uploadPlayerPhotoMiddleware.single('photo'),
  uploadPlayerPhoto,
);

// ──────────────────────────────────────────────────────────────────────────
// Joueurs globaux + grants multi-sites (ADR-082 pattern, super_admin/operator)
//
// Route order : /players/global et /players/:playerId/grants doivent être
// mountées AVANT toute route /players/:playerId pour éviter qu'Express ne
// confonde 'global' avec un UUID. Ici elles sont déjà uniques (segment
// `/players/...` à la racine, vs `/sites/:siteId/players/...` plus haut).
// ──────────────────────────────────────────────────────────────────────────
router.get(
  '/players/global',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  listGlobalPlayers,
);
router.post(
  '/players/global',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validate(templatesStudioSchemas.createGlobalPlayer),
  createGlobalPlayer,
);
router.get(
  '/players/:playerId/grants',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.playerId),
  listPlayerGrants,
);
router.post(
  '/players/:playerId/grants',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.playerId),
  validate(templatesStudioSchemas.addPlayerGrant),
  addPlayerGrant,
);
router.delete(
  '/players/:playerId/grants/:siteId',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.playerIdAndSiteId),
  removePlayerGrant,
);

// ──────────────────────────────────────────────────────────────────────────
// ADR-125 — Asset library globale + bindings par template
//
// Toutes les routes restreintes aux rôles internes (super_admin / admin /
// operator). Les users `club` n'ont pas accès — la library est un catalogue
// admin technique partagé sur la flotte.
// ──────────────────────────────────────────────────────────────────────────

router.get(
  '/assets',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateQuery(templatesStudioSchemas.listAssetsQuery),
  listStudioAssets,
);

router.post(
  '/assets',
  authenticate,
  requestTimeout(UPLOAD_TIMEOUT_MS),
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  uploadStudioAssetMiddleware.single('asset'),
  validate(templatesStudioSchemas.uploadAsset),
  uploadStudioAsset,
);

// ADR-128 — POST /assets/directory : upload ZIP de PNG frames (masque alpha).
// Mounted AVANT `/assets/:assetId` pour qu'Express ne capture pas 'directory'
// comme un UUID.
router.post(
  '/assets/directory',
  authenticate,
  requestTimeout(UPLOAD_TIMEOUT_MS),
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  uploadStudioAssetDirectoryMiddleware.single('asset'),
  validate(templatesStudioSchemas.uploadAssetDirectory),
  uploadStudioAssetDirectory,
);

router.get(
  '/assets/:assetId',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.assetId),
  getStudioAsset,
);

router.patch(
  '/assets/:assetId',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.assetId),
  validate(templatesStudioSchemas.updateAssetMetadata),
  updateStudioAssetMetadata,
);

router.delete(
  '/assets/:assetId',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.assetId),
  deleteStudioAsset,
);

router.get(
  '/templates/:slug/asset-bindings',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.templateSlug),
  getTemplateAssetBindings,
);

router.put(
  '/templates/:slug/asset-bindings/:assetKey',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.templateSlugAndAssetKey),
  validate(templatesStudioSchemas.bindAsset),
  upsertTemplateAssetBinding,
);

router.delete(
  '/templates/:slug/asset-bindings/:assetKey',
  authenticate,
  apiRateLimit,
  requireRole('super_admin', 'admin', 'operator'),
  validateParams(paramSchemas.templateSlugAndAssetKey),
  deleteTemplateAssetBinding,
);

export default router;
