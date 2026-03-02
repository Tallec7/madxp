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

// Création d'une proposal
router.post('/proposals', authenticate, requireRole('admin'), safeController.createProposal);

// Mise à jour du statut d'une proposal
router.put('/proposals/:id', authenticate, requireRole('admin'), safeController.updateProposalStatus);

// Suppression d'une proposal
router.delete('/proposals/:id', authenticate, requireRole('admin'), safeController.deleteProposal);

// Mise à jour du statut d'un epic (V1: log only, V2: write-back)
router.put('/epics/:id/status', authenticate, requireRole('admin'), safeController.updateEpicStatus);

// Sprint Tracker
router.get('/sprints', authenticate, requireRole('admin'), safeController.getSprints);

// Mise à jour du statut d'une story dans un sprint
router.put('/sprints/:sprintId/stories/:storyId/status', authenticate, requireRole('admin'), safeController.updateStoryStatus);

export default router;
