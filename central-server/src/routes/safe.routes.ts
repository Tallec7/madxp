/**
 * SAFe Dashboard Routes
 *
 * Routes pour le pilotage SAFe (portfolio, proposals, epics).
 * Accès restreint aux admins.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as safeController from '../controllers/safe.controller';

const router = Router();

// Portfolio complet (epics, themes, VS, objectives, risks, metrics, roadmap, KPIs)
router.get('/portfolio', authenticate, requireRole('admin'), safeController.getPortfolio);

// Liste des proposals (sans contenu)
router.get('/proposals', authenticate, requireRole('admin'), safeController.getProposals);

// Détail d'une proposal (avec contenu markdown)
router.get('/proposals/:id', authenticate, requireRole('admin'), safeController.getProposal);

// Mise à jour du statut d'une proposal
router.put('/proposals/:id', authenticate, requireRole('admin'), safeController.updateProposalStatus);

// Mise à jour du statut d'un epic (V1: log only, V2: write-back)
router.put('/epics/:id/status', authenticate, requireRole('admin'), safeController.updateEpicStatus);

export default router;
