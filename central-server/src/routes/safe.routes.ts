/**
 * SAFe Dashboard Routes
 *
 * Routes pour le pilotage SAFe (portfolio, proposals, epics).
 * Accès restreint aux admins.
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, paramSchemas, schemas } from '../middleware/validation';
import * as safeController from '../controllers/safe.controller';

const router = Router();

// Portfolio complet (epics, themes, VS, objectives, risks, metrics, roadmap, KPIs)
router.get('/portfolio', authenticate, requireRole('admin'), safeController.getPortfolio);

// Liste des proposals (sans contenu)
router.get('/proposals', authenticate, requireRole('admin'), safeController.getProposals);

// Détail d'une proposal (avec contenu markdown)
router.get('/proposals/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), safeController.getProposal);

// Création d'une proposal
router.post('/proposals', authenticate, requireRole('admin'), validate(schemas.createProposal), safeController.createProposal);

// Mise à jour du statut d'une proposal
router.put('/proposals/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), validate(schemas.updateProposalStatus), safeController.updateProposalStatus);

// Suppression d'une proposal
router.delete('/proposals/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), safeController.deleteProposal);

// Mise à jour d'un epic (nom et/ou statut) — write-back dans FEATURES.md
router.put('/epics/:id', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), validate(schemas.updateEpic), safeController.updateEpic);

// Sprint Tracker
router.get('/sprints', authenticate, requireRole('admin'), safeController.getSprints);

// Mise à jour du statut d'une story dans un sprint
router.put('/sprints/:sprintId/stories/:storyId/status', authenticate, requireRole('admin'), validateParams(paramSchemas.sprintIdAndStoryId), validate(schemas.updateStoryStatus), safeController.updateStoryStatus);

// Mise à jour des champs d'une story (SP, priorité)
router.put('/sprints/:sprintId/stories/:storyId/fields', authenticate, requireRole('admin'), validateParams(paramSchemas.sprintIdAndStoryId), validate(schemas.updateStoryFields), safeController.updateStoryFields);

// Mise à jour du statut ROAM d'un risque
router.put('/risks/:id/roam-status', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), validate(schemas.updateRiskRoamStatus), safeController.updateRiskRoamStatus);

// Mise à jour du contenu d'une proposal (titre + markdown)
router.put('/proposals/:id/content', authenticate, requireRole('admin'), validateParams(paramSchemas.idString), validate(schemas.updateProposalContent), safeController.updateProposalContent);

export default router;
