/**
 * SAFe Dashboard Controller
 *
 * Endpoints pour le pilotage SAFe : portfolio, proposals, epics.
 * Source de vérité : fichiers markdown dans docs/safe/ et docs/proposals/.
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { safeParserService } from '../services/safe-parser.service';
import logger from '../config/logger';
import { EpicStatus, ProposalStatus, ProposalType, SprintStoryStatus } from '../types/safe.types';

const VALID_EPIC_STATUSES: EpicStatus[] = ['funnel', 'analysis', 'backlog', 'implementing', 'done', 'partial'];
const VALID_PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'in-review', 'approved', 'implementing', 'done'];
const VALID_PROPOSAL_TYPES: ProposalType[] = ['prop', 'spike', 'spec'];
const VALID_STORY_STATUSES: SprintStoryStatus[] = ['todo', 'in-progress', 'done', 'removed'];

/**
 * GET /api/safe/portfolio
 * Retourne le portfolio SAFe complet (epics, themes, VS, objectives, risks, metrics, roadmap, KPIs)
 */
export const getPortfolio = async (_req: AuthRequest, res: Response) => {
  try {
    const portfolio = await safeParserService.getPortfolio();

    return res.json({
      success: true,
      data: portfolio,
    });
  } catch (error) {
    logger.error('Error getting SAFe portfolio:', error);
    return res.status(500).json({ error: 'Failed to get SAFe portfolio' });
  }
};

/**
 * GET /api/safe/proposals
 * Retourne la liste des proposals (sans contenu markdown)
 */
export const getProposals = async (_req: AuthRequest, res: Response) => {
  try {
    const proposals = await safeParserService.getProposals();

    return res.json({
      success: true,
      data: proposals,
    });
  } catch (error) {
    logger.error('Error getting SAFe proposals:', error);
    return res.status(500).json({ error: 'Failed to get SAFe proposals' });
  }
};

/**
 * GET /api/safe/proposals/:id
 * Retourne une proposal avec son contenu markdown
 */
export const getProposal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const proposal = await safeParserService.getProposal(id);

    if (!proposal) {
      return res.status(404).json({ error: `Proposal ${id} not found` });
    }

    return res.json({
      success: true,
      data: proposal,
    });
  } catch (error) {
    logger.error('Error getting SAFe proposal:', error);
    return res.status(500).json({ error: 'Failed to get SAFe proposal' });
  }
};

/**
 * PUT /api/safe/proposals/:id
 * Met à jour le statut d'une proposal dans le fichier .md
 */
export const updateProposalStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_PROPOSAL_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_PROPOSAL_STATUSES.join(', ')}`,
      });
    }

    const updated = await safeParserService.updateProposalStatus(id, status);

    if (!updated) {
      return res.status(404).json({ error: `Proposal ${id} not found` });
    }

    logger.info('SAFe proposal status updated', {
      proposalId: id,
      newStatus: status,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { id, status },
    });
  } catch (error) {
    logger.error('Error updating SAFe proposal status:', error);
    return res.status(500).json({ error: 'Failed to update proposal status' });
  }
};

/**
 * PUT /api/safe/epics/:id/status
 * Met à jour le statut d'un epic (placeholder pour V2 - write-back dans FEATURES.md)
 */
export const updateEpicStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_EPIC_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_EPIC_STATUSES.join(', ')}`,
      });
    }

    // V1: log + invalidate cache (write-back dans FEATURES.md en V2)
    logger.info('SAFe epic status update requested', {
      epicId: id,
      newStatus: status,
      updatedBy: req.user?.email,
    });

    safeParserService.invalidateCache();

    return res.json({
      success: true,
      data: { id, status, note: 'Epic status update logged. Manual update in FEATURES.md required for V1.' },
    });
  } catch (error) {
    logger.error('Error updating SAFe epic status:', error);
    return res.status(500).json({ error: 'Failed to update epic status' });
  }
};

/**
 * GET /api/safe/sprints
 * Retourne le Sprint Tracker (sprints, stories, vélocité)
 */
export const getSprints = async (_req: AuthRequest, res: Response) => {
  try {
    const tracker = await safeParserService.getSprints();

    return res.json({
      success: true,
      data: tracker,
    });
  } catch (error) {
    logger.error('Error getting SAFe sprints:', error);
    return res.status(500).json({ error: 'Failed to get SAFe sprints' });
  }
};

/**
 * PUT /api/safe/sprints/:sprintId/stories/:storyId/status
 * Met à jour le statut d'une story dans USER-STORIES.md
 */
export const updateStoryStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { sprintId, storyId } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STORY_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_STORY_STATUSES.join(', ')}`,
      });
    }

    const updated = await safeParserService.updateStoryStatus(sprintId, storyId, status);

    if (!updated) {
      return res.status(404).json({ error: `Story ${storyId} in sprint ${sprintId} not found` });
    }

    logger.info('SAFe story status updated', {
      sprintId,
      storyId,
      newStatus: status,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { sprintId, storyId, status },
    });
  } catch (error) {
    logger.error('Error updating SAFe story status:', error);
    return res.status(500).json({ error: 'Failed to update story status' });
  }
};

/**
 * POST /api/safe/proposals
 * Crée une nouvelle proposal (fichier .md dans docs/proposals/)
 */
export const createProposal = async (req: AuthRequest, res: Response) => {
  try {
    const { title, type, relatedEpic, content } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (type && !VALID_PROPOSAL_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid type. Must be one of: ${VALID_PROPOSAL_TYPES.join(', ')}`,
      });
    }

    const proposal = safeParserService.createProposal({
      title: title.trim(),
      type: type || 'prop',
      relatedEpic: relatedEpic || null,
      content: content || '',
    });

    logger.info('SAFe proposal created', {
      proposalId: proposal.id,
      title: proposal.title,
      createdBy: req.user?.email,
    });

    return res.status(201).json({
      success: true,
      data: proposal,
    });
  } catch (error) {
    logger.error('Error creating SAFe proposal:', error);
    return res.status(500).json({ error: 'Failed to create proposal' });
  }
};

/**
 * DELETE /api/safe/proposals/:id
 * Supprime une proposal (fichier .md)
 */
export const deleteProposal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = safeParserService.deleteProposal(id);

    if (!deleted) {
      return res.status(404).json({ error: `Proposal ${id} not found` });
    }

    logger.info('SAFe proposal deleted', {
      proposalId: id,
      deletedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    logger.error('Error deleting SAFe proposal:', error);
    return res.status(500).json({ error: 'Failed to delete proposal' });
  }
};
