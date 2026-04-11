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
import { EpicStatus, ProposalStatus, ProposalType, RoamStatus, SprintStoryStatus } from '../types/safe.types';

const VALID_EPIC_STATUSES: EpicStatus[] = ['funnel', 'analysis', 'backlog', 'implementing', 'done', 'partial'];
const VALID_PROPOSAL_STATUSES: ProposalStatus[] = ['draft', 'in-review', 'approved', 'implementing', 'done'];
const VALID_PROPOSAL_TYPES: ProposalType[] = ['prop', 'spike', 'spec'];
const VALID_STORY_STATUSES: SprintStoryStatus[] = ['todo', 'in-progress', 'done', 'removed'];
const VALID_ROAM_STATUSES: RoamStatus[] = ['Resolved', 'Owned', 'Accepted', 'Mitigated'];
const VALID_STORY_PRIORITIES = ['Must', 'Should', 'Could', 'Nice'];

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
 * PUT /api/safe/epics/:id
 * Met à jour un epic (nom et/ou statut) — write-back dans FEATURES.md
 */
export const updateEpic = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, name } = req.body;

    if (!status && !name) {
      return res.status(400).json({ error: 'At least one of status or name is required' });
    }

    if (status && !VALID_EPIC_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${VALID_EPIC_STATUSES.join(', ')}`,
      });
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ error: 'Name must be a non-empty string' });
    }

    const updated = safeParserService.updateEpic(id, { status, name: name?.trim() });

    if (!updated) {
      return res.status(404).json({ error: `Epic ${id} not found in FEATURES.md` });
    }

    logger.info('SAFe epic updated', {
      epicId: id,
      newStatus: status,
      newName: name,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { id, status, name },
    });
  } catch (error) {
    logger.error('Error updating SAFe epic:', error);
    return res.status(500).json({ error: 'Failed to update epic' });
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

    const proposal = await safeParserService.createProposal({
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
    const deleted = await safeParserService.deleteProposal(id);

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

/**
 * PUT /api/safe/risks/:id/roam-status
 * Met à jour le statut ROAM d'un risque dans ROAM.md
 */
export const updateRiskRoamStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_ROAM_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid ROAM status. Must be one of: ${VALID_ROAM_STATUSES.join(', ')}`,
      });
    }

    const updated = safeParserService.updateRiskRoamStatus(id, status);

    if (!updated) {
      return res.status(404).json({ error: `Risk ${id} not found` });
    }

    logger.info('SAFe risk ROAM status updated', {
      riskId: id,
      newStatus: status,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { id, status },
    });
  } catch (error) {
    logger.error('Error updating SAFe risk ROAM status:', error);
    return res.status(500).json({ error: 'Failed to update risk ROAM status' });
  }
};

/**
 * PUT /api/safe/proposals/:id/content
 * Met à jour le titre et/ou contenu d'une proposal
 */
export const updateProposalContent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    if (!title && content === undefined) {
      return res.status(400).json({ error: 'At least one of title or content must be provided' });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Title must be a non-empty string' });
    }

    const updated = await safeParserService.updateProposalContent(id, {
      title: title?.trim(),
      content,
    });

    if (!updated) {
      return res.status(404).json({ error: `Proposal ${id} not found` });
    }

    logger.info('SAFe proposal content updated', {
      proposalId: id,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    logger.error('Error updating SAFe proposal content:', error);
    return res.status(500).json({ error: 'Failed to update proposal content' });
  }
};

/**
 * PUT /api/safe/sprints/:sprintId/stories/:storyId/fields
 * Met à jour les story points et/ou priorité d'une story dans USER-STORIES.md
 */
export const updateStoryFields = async (req: AuthRequest, res: Response) => {
  try {
    const { storyId } = req.params;
    const { storyPoints, priority } = req.body;

    if (storyPoints === undefined && priority === undefined) {
      return res.status(400).json({ error: 'At least one of storyPoints or priority must be provided' });
    }

    if (storyPoints !== undefined && (typeof storyPoints !== 'number' || storyPoints < 1 || storyPoints > 21)) {
      return res.status(400).json({ error: 'storyPoints must be a number between 1 and 21' });
    }

    if (priority !== undefined && !VALID_STORY_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        error: `Invalid priority. Must be one of: ${VALID_STORY_PRIORITIES.join(', ')}`,
      });
    }

    const updated = safeParserService.updateStoryFields(storyId, { storyPoints, priority });

    if (!updated) {
      return res.status(404).json({ error: `Story ${storyId} not found` });
    }

    logger.info('SAFe story fields updated', {
      storyId,
      storyPoints,
      priority,
      updatedBy: req.user?.email,
    });

    return res.json({
      success: true,
      data: { storyId, storyPoints, priority },
    });
  } catch (error) {
    logger.error('Error updating SAFe story fields:', error);
    return res.status(500).json({ error: 'Failed to update story fields' });
  }
};
