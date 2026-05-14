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
import { authenticate, requireClubScope } from '../middleware/auth';
import {
  validate,
  validateParams,
  paramSchemas,
  templatesStudioSchemas,
} from '../middleware/validation';
import { apiRateLimit } from '../middleware/user-rate-limit';
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
} from '../controllers/templates-studio.controller';

// Multer en mémoire pour photos brutes — 8 MB max (les photos high-res de
// shooting peuvent dépasser 5 MB). MimeType filter côté controller pour
// retourner un message FR clair (multer rejette en silence sinon).
const uploadPlayerPhotoMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
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
  apiRateLimit,
  validateParams(paramSchemas.siteIdAndPlayerId),
  requireClubScope(siteIdFromParams),
  uploadPlayerPhotoMiddleware.single('photo'),
  uploadPlayerPhoto,
);

export default router;
