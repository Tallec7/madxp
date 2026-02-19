import express from 'express';
import {
  verifySponsorToken,
  getSponsorPortalStats,
  getSponsorPortalReport,
} from '../controllers/sponsor-portal.controller';

const router = express.Router();

// =============================================================================
// SPONSOR PORTAL ROUTES (PUBLIC — pas d'auth JWT, token-based)
// Montées sur /api/sponsor-portal
// =============================================================================

/**
 * GET /api/sponsor-portal/verify?token=xxx
 * Vérifie un magic link et retourne les infos sponsor.
 */
router.get('/verify', verifySponsorToken);

/**
 * GET /api/sponsor-portal/stats?token=xxx&from=...&to=...
 * Stats du sponsor sur une période.
 */
router.get('/stats', getSponsorPortalStats);

/**
 * GET /api/sponsor-portal/report?token=xxx&from=...&to=...
 * Télécharge un rapport PDF.
 */
router.get('/report', getSponsorPortalReport);

export default router;
