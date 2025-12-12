import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import socketService from '../services/socket.service';

/**
 * Calcule les différences entre deux configurations
 */
function computeConfigDiff(
  oldConfig: Record<string, unknown> | null,
  newConfig: Record<string, unknown>,
  path = ''
): Array<{ field: string; path: string; type: 'added' | 'removed' | 'changed'; oldValue?: unknown; newValue?: unknown }> {
  const diffs: Array<{ field: string; path: string; type: 'added' | 'removed' | 'changed'; oldValue?: unknown; newValue?: unknown }> = [];

  if (!oldConfig) {
    // Nouvelle configuration, tout est "ajouté"
    for (const key of Object.keys(newConfig)) {
      const newPath = path ? `${path}.${key}` : key;
      diffs.push({
        field: key,
        path: newPath,
        type: 'added',
        newValue: newConfig[key],
      });
    }
    return diffs;
  }

  const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    const oldValue = oldConfig[key];
    const newValue = newConfig[key];

    if (!(key in oldConfig)) {
      diffs.push({ field: key, path: newPath, type: 'added', newValue });
    } else if (!(key in newConfig)) {
      diffs.push({ field: key, path: newPath, type: 'removed', oldValue });
    } else if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue !== null && newValue !== null && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
      // Récursion pour les objets imbriqués
      diffs.push(...computeConfigDiff(oldValue as Record<string, unknown>, newValue as Record<string, unknown>, newPath));
    } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({ field: key, path: newPath, type: 'changed', oldValue, newValue });
    }
  }

  return diffs;
}

/**
 * Récupère l'historique des configurations d'un site
 */
export const getConfigHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const result = await query(
      `SELECT
        ch.id,
        ch.site_id,
        ch.configuration,
        ch.deployed_by,
        ch.deployed_at,
        ch.comment,
        ch.changes_summary,
        u.email as deployed_by_email,
        u.full_name as deployed_by_name
      FROM config_history ch
      LEFT JOIN users u ON ch.deployed_by = u.id
      WHERE ch.site_id = $1
      ORDER BY ch.deployed_at DESC
      LIMIT $2 OFFSET $3`,
      [id, parseInt(limit as string), parseInt(offset as string)]
    );

    // Compter le total
    const countResult = await query(
      'SELECT COUNT(*) as total FROM config_history WHERE site_id = $1',
      [id]
    );

    const total = countResult.rows[0] as { total: string };
    res.json({
      site_id: id,
      total: parseInt(total.total),
      history: result.rows,
    });
  } catch (error) {
    logger.error('Get config history error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
};

/**
 * Récupère une version spécifique de la configuration
 */
export const getConfigVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    const result = await query(
      `SELECT
        ch.id,
        ch.site_id,
        ch.configuration,
        ch.deployed_by,
        ch.deployed_at,
        ch.comment,
        ch.changes_summary,
        u.email as deployed_by_email,
        u.full_name as deployed_by_name
      FROM config_history ch
      LEFT JOIN users u ON ch.deployed_by = u.id
      WHERE ch.id = $1 AND ch.site_id = $2`,
      [versionId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Version de configuration non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get config version error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la version' });
  }
};

/**
 * Sauvegarde une nouvelle version de configuration dans l'historique
 * Appelé automatiquement avant un déploiement
 */
export const saveConfigVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { configuration, comment } = req.body;

    if (!configuration) {
      return res.status(400).json({ error: 'Configuration requise' });
    }

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [id]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Récupérer la dernière version pour calculer le diff
    const lastVersionResult = await query(
      `SELECT id, configuration FROM config_history
       WHERE site_id = $1
       ORDER BY deployed_at DESC
       LIMIT 1`,
      [id]
    );

    const lastVersion = lastVersionResult.rows[0] as { id: string; configuration: Record<string, unknown> } | undefined;
    const previousVersionId = lastVersion?.id || null;
    const previousConfig = lastVersion?.configuration || null;

    // Calculer les différences
    const changesSummary = computeConfigDiff(previousConfig as Record<string, unknown> | null, configuration);

    // Créer le nouvel enregistrement
    const versionId = uuidv4();
    const result = await query(
      `INSERT INTO config_history (id, site_id, configuration, deployed_by, comment, previous_version_id, changes_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, site_id, configuration, deployed_by, deployed_at, comment, changes_summary`,
      [
        versionId,
        id,
        JSON.stringify(configuration),
        req.user?.id,
        comment || null,
        previousVersionId,
        JSON.stringify(changesSummary),
      ]
    );

    logger.info('Config version saved', {
      siteId: id,
      siteName: siteResult.rows[0].site_name,
      versionId,
      savedBy: req.user?.email,
      changesCount: changesSummary.length,
    });

    try {
      await query(
        `UPDATE sites SET pending_config_version_id = $1 WHERE id = $2`,
        [versionId, id]
      );

      await socketService.triggerPendingConfigSync(id);
    } catch (error: any) {
      if (error?.code === '42703') {
        logger.warn('pending_config_version_id column missing - pending sync will be skipped (run migration add-pending-config-column.sql)', {
          siteId: id,
          versionId,
        });
      } else {
        logger.error('Error triggering pending config deployment:', error);
      }
    }

    res.status(201).json({
      ...result.rows[0],
      changes_summary: changesSummary,
    });
  } catch (error) {
    logger.error('Save config version error:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde de la version' });
  }
};

/**
 * Compare deux versions de configuration
 */
export const compareConfigVersions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version1, version2 } = req.query;

    if (!version1 || !version2) {
      return res.status(400).json({ error: 'Deux versions à comparer sont requises (version1, version2)' });
    }

    // Récupérer les deux versions
    const result = await query(
      `SELECT id, configuration, deployed_at FROM config_history
       WHERE site_id = $1 AND id IN ($2, $3)`,
      [id, version1, version2]
    );

    if (result.rows.length !== 2) {
      return res.status(404).json({ error: 'Une ou plusieurs versions non trouvées' });
    }

    interface ConfigVersionRow {
      id: string;
      configuration: Record<string, unknown>;
      deployed_at: Date;
    }

    const rows = result.rows as unknown as ConfigVersionRow[];
    const v1 = rows.find((r) => r.id === version1);
    const v2 = rows.find((r) => r.id === version2);

    if (!v1 || !v2) {
      return res.status(404).json({ error: 'Une ou plusieurs versions non trouvées' });
    }

    const diff = computeConfigDiff(v1.configuration, v2.configuration);

    res.json({
      version1: {
        id: v1.id,
        deployed_at: v1.deployed_at,
        configuration: v1.configuration,
      },
      version2: {
        id: v2.id,
        deployed_at: v2.deployed_at,
        configuration: v2.configuration,
      },
      diff,
    });
  } catch (error) {
    logger.error('Compare config versions error:', error);
    res.status(500).json({ error: 'Erreur lors de la comparaison des versions' });
  }
};

/**
 * Génère un diff entre la configuration actuelle du site et une nouvelle configuration
 */
export const previewConfigDiff = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { newConfiguration } = req.body;

    if (!newConfiguration) {
      return res.status(400).json({ error: 'Nouvelle configuration requise' });
    }

    // Récupérer la dernière version
    const lastVersionResult = await query(
      `SELECT configuration FROM config_history
       WHERE site_id = $1
       ORDER BY deployed_at DESC
       LIMIT 1`,
      [id]
    );

    const lastVersionRow = lastVersionResult.rows[0] as { configuration: Record<string, unknown> } | undefined;
    const currentConfig = lastVersionRow?.configuration || null;
    const diff = computeConfigDiff(currentConfig, newConfiguration);

    res.json({
      hasChanges: diff.length > 0,
      changesCount: diff.length,
      diff,
      currentConfiguration: currentConfig,
      newConfiguration,
    });
  } catch (error) {
    logger.error('Preview config diff error:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du diff' });
  }
};
