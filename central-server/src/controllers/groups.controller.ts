import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { groupRepository } from '../repositories';
import { AuthRequest } from '../types';
import logger from '../config/logger';

export const getGroups = async (req: AuthRequest, res: Response) => {
  try {
    const groups = await groupRepository.findAllWithSiteCount();

    res.json({
      total: groups.length,
      groups,
    });
  } catch (error) {
    logger.error('Get groups error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des groupes' });
  }
};

export const getGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const group = await groupRepository.findGroupById(id);

    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    const sites = await groupRepository.findGroupSites(id);

    res.json({
      ...group,
      sites,
    });
  } catch (error) {
    logger.error('Get group error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du groupe' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, filters } = req.body;

    const id = uuidv4();

    const group = await groupRepository.create({
      id,
      name,
      description: description || null,
      type,
      filters: filters ? JSON.stringify(filters) : null,
    });

    logger.info('Group created', { groupId: id, groupName: name, createdBy: req.user?.email });

    res.status(201).json(group);
  } catch (error) {
    logger.error('Create group error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du groupe' });
  }
};

export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, type, filters } = req.body;

    if (name === undefined && description === undefined && type === undefined && filters === undefined) {
      return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    }

    const group = await groupRepository.update(id, {
      name,
      description,
      type,
      filters: filters !== undefined ? JSON.stringify(filters) : undefined,
    });

    if (!group) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    logger.info('Group updated', { groupId: id, updatedBy: req.user?.email });

    res.json(group);
  } catch (error) {
    logger.error('Update group error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du groupe' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const groupName = await groupRepository.deleteGroup(id);

    if (!groupName) {
      return res.status(404).json({ error: 'Groupe non trouvé' });
    }

    logger.info('Group deleted', { groupId: id, groupName, deletedBy: req.user?.email });

    res.json({ message: 'Groupe supprimé avec succès' });
  } catch (error) {
    logger.error('Delete group error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du groupe' });
  }
};

export const addSitesToGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { site_ids } = req.body;

    await groupRepository.addSites(id, site_ids);

    logger.info('Sites added to group', { groupId: id, siteCount: site_ids.length, addedBy: req.user?.email });

    res.json({
      message: `${site_ids.length} site(s) ajouté(s) au groupe avec succès`,
      added_count: site_ids.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('not found')) {
      return res.status(404).json({ error: message });
    }
    logger.error('Add sites to group error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout des sites au groupe' });
  }
};

export const removeSiteFromGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id, siteId } = req.params;

    const removed = await groupRepository.removeSite(id, siteId);

    if (!removed) {
      return res.status(404).json({ error: 'Association non trouvée' });
    }

    logger.info('Site removed from group', { groupId: id, siteId, removedBy: req.user?.email });

    res.json({ message: 'Site retiré du groupe avec succès' });
  } catch (error) {
    logger.error('Remove site from group error:', error);
    res.status(500).json({ error: 'Erreur lors du retrait du site du groupe' });
  }
};

export const getGroupSites = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const sites = await groupRepository.findGroupSites(id);

    res.json({
      group_id: id,
      total: sites.length,
      sites,
    });
  } catch (error) {
    logger.error('Get group sites error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des sites du groupe' });
  }
};
