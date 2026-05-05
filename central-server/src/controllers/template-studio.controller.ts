/**
 * ADR-075 — Template Studio controllers (v2 compositeur).
 * CRUD granulaire sur variants / layers / text_fields / image_slots.
 * Gated super_admin via routes.
 *
 * Supervision : chaque endpoint incrémente `neopro_template_studio_operations_total`
 * (labels: resource, operation, status) pour détecter les régressions (pics d'erreurs,
 * 404/409 anormaux) sans dépendre des logs applicatifs.
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  templateStudioRepository,
  remotionTemplatesRepository,
} from '../repositories';
import { metricsService } from '../services/metrics.service';

type StudioResource = 'variant' | 'layer' | 'text_field' | 'image_slot' | 'studio_view';
type StudioOperation = 'create' | 'update' | 'delete' | 'list' | 'get';
type StudioStatus = 'success' | 'not_found' | 'conflict' | 'error';

const record = (resource: StudioResource, operation: StudioOperation, status: StudioStatus): void => {
  metricsService.recordTemplateStudioOperation(resource, operation, status);
};

const logError = (op: string, req: AuthRequest, error: unknown): void => {
  logger.error(`templateStudio.${op} error`, {
    error,
    params: req.params,
    userId: req.user?.id,
  });
};

const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: string })?.code === '23505';

// Pattern LIST/GET : retourne null → 404, sinon JSON.
const handleRead = async (
  req: AuthRequest,
  res: Response,
  op: string,
  resource: StudioResource,
  operation: StudioOperation,
  fn: () => Promise<unknown>
): Promise<void> => {
  try {
    const result = await fn();
    if (result === null) {
      record(resource, operation, 'not_found');
      res.status(404).json({ error: 'Ressource non trouvée' });
      return;
    }
    record(resource, operation, 'success');
    res.json(result);
  } catch (error) {
    record(resource, operation, 'error');
    logError(op, req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

const assertTemplateExists = async (id: string): Promise<boolean> => {
  const tpl = await remotionTemplatesRepository.findById(id);
  return !!tpl;
};

// Pattern CREATE : vérifie template parent, delegue repo, gère 409 sur slotKey dupliqué.
const handleCreate = async (
  req: AuthRequest,
  res: Response,
  op: string,
  resource: StudioResource,
  fn: (templateId: string) => Promise<unknown>
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) {
      record(resource, 'create', 'not_found');
      res.status(404).json({ error: 'Template non trouvé' });
      return;
    }
    const created = await fn(id);
    record(resource, 'create', 'success');
    res.status(201).json(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      record(resource, 'create', 'conflict');
      res.status(409).json({ error: 'slotKey déjà utilisé pour ce template' });
      return;
    }
    record(resource, 'create', 'error');
    logError(op, req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Pattern UPDATE : repo retourne null → 404, sinon JSON. Gère 409.
const handleUpdate = async (
  req: AuthRequest,
  res: Response,
  op: string,
  resource: StudioResource,
  notFoundMsg: string,
  fn: () => Promise<unknown>
): Promise<void> => {
  try {
    const updated = await fn();
    if (!updated) {
      record(resource, 'update', 'not_found');
      res.status(404).json({ error: notFoundMsg });
      return;
    }
    record(resource, 'update', 'success');
    res.json(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      record(resource, 'update', 'conflict');
      res.status(409).json({ error: 'slotKey déjà utilisé pour ce template' });
      return;
    }
    record(resource, 'update', 'error');
    logError(op, req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Pattern DELETE : repo retourne boolean. false → 404.
const handleDelete = async (
  req: AuthRequest,
  res: Response,
  op: string,
  resource: StudioResource,
  notFoundMsg: string,
  fn: () => Promise<boolean>
): Promise<void> => {
  try {
    const ok = await fn();
    if (!ok) {
      record(resource, 'delete', 'not_found');
      res.status(404).json({ error: notFoundMsg });
      return;
    }
    record(resource, 'delete', 'success');
    res.status(204).send();
  } catch (error) {
    record(resource, 'delete', 'error');
    logError(op, req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ── GET /api/remotion-templates/:id/studio
// Retourne la vue V2 consolidée (variants + layers + text_fields + image_slots).
// 404 si template legacy (schema_version=1) ou inexistant.
export const getStudioView = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleRead(req, res, 'getStudioView', 'studio_view', 'get', () =>
    templateStudioRepository.findV2ById(req.params.id)
  );
};

// ── Variants
export const listVariants = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleRead(req, res, 'listVariants', 'variant', 'list', async () => {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) return null;
    return templateStudioRepository.listVariants(id);
  });
};

export const createVariant = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleCreate(req, res, 'createVariant', 'variant', (id) =>
    templateStudioRepository.createVariant(id, req.body)
  );
};

export const updateVariant = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleUpdate(req, res, 'updateVariant', 'variant', 'Variante non trouvée', () =>
    templateStudioRepository.updateVariant(req.params.variantId, req.body)
  );
};

export const deleteVariant = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleDelete(req, res, 'deleteVariant', 'variant', 'Variante non trouvée', () =>
    templateStudioRepository.deleteVariant(req.params.variantId)
  );
};

// ── Layers
export const listLayers = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleRead(req, res, 'listLayers', 'layer', 'list', async () => {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) return null;
    return templateStudioRepository.listLayers(id);
  });
};

export const createLayer = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleCreate(req, res, 'createLayer', 'layer', (id) =>
    templateStudioRepository.createLayer(id, req.body)
  );
};

export const updateLayer = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleUpdate(req, res, 'updateLayer', 'layer', 'Couche non trouvée', () =>
    templateStudioRepository.updateLayer(req.params.layerId, req.body)
  );
};

export const deleteLayer = async (req: AuthRequest, res: Response): Promise<void> => {
  // ADR-110 / ASSET-03 / pitfall P5 — guard against orphaning a WebM still
  // referenced by another published layer. We block the delete with 409
  // and surface usedByPublishedCount so the UI can prompt the admin.
  try {
    const { layerId } = req.params;
    const usedByPublishedCount = await templateStudioRepository.countLayersSharingVideoUrl(layerId);
    if (usedByPublishedCount > 0) {
      record('layer', 'delete', 'conflict');
      res.status(409).json({
        error: 'asset_in_use',
        message: `Ce fond est utilisé par ${usedByPublishedCount} autre(s) template(s) publié(s).`,
        detail: { usedByPublishedCount },
      });
      return;
    }
  } catch (error) {
    record('layer', 'delete', 'error');
    logError('deleteLayer', req, error);
    res.status(500).json({ error: 'Erreur serveur' });
    return;
  }
  await handleDelete(req, res, 'deleteLayer', 'layer', 'Couche non trouvée', () =>
    templateStudioRepository.deleteLayer(req.params.layerId)
  );
};

/**
 * ADR-110 / Plan 04 / WIZARD-04 — Reorder all layers of a template in a
 * single transaction. Body: `{ orderedLayerIds: string[] }`. Returns the
 * new ordered list (z_index ASC). Maps the repo `layer_ownership_mismatch`
 * error to 400.
 */
export const reorderLayers = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { orderedLayerIds } = req.body as { orderedLayerIds: string[] };
  try {
    if (!(await assertTemplateExists(id))) {
      record('layer', 'update', 'not_found');
      res.status(404).json({ error: 'Template non trouvé' });
      return;
    }
    const layers = await templateStudioRepository.reorderLayers(id, orderedLayerIds);
    record('layer', 'update', 'success');
    res.json(layers);
  } catch (error) {
    if ((error as Error)?.message === 'layer_ownership_mismatch') {
      record('layer', 'update', 'conflict');
      res.status(400).json({
        error: 'layer_ownership_mismatch',
        message:
          "Un ou plusieurs fonds animés n'appartiennent pas à ce template.",
      });
      return;
    }
    record('layer', 'update', 'error');
    logError('reorderLayers', req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ── Text fields
export const listTextFields = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleRead(req, res, 'listTextFields', 'text_field', 'list', async () => {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) return null;
    return templateStudioRepository.listTextFields(id);
  });
};

export const createTextField = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleCreate(req, res, 'createTextField', 'text_field', (id) =>
    templateStudioRepository.createTextField(id, req.body)
  );
};

export const updateTextField = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleUpdate(req, res, 'updateTextField', 'text_field', 'Champ non trouvé', () =>
    templateStudioRepository.updateTextField(req.params.fieldId, req.body)
  );
};

export const deleteTextField = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleDelete(req, res, 'deleteTextField', 'text_field', 'Champ non trouvé', () =>
    templateStudioRepository.deleteTextField(req.params.fieldId)
  );
};

// ── Image slots
export const listImageSlots = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleRead(req, res, 'listImageSlots', 'image_slot', 'list', async () => {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) return null;
    return templateStudioRepository.listImageSlots(id);
  });
};

export const createImageSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleCreate(req, res, 'createImageSlot', 'image_slot', (id) =>
    templateStudioRepository.createImageSlot(id, req.body)
  );
};

export const updateImageSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleUpdate(req, res, 'updateImageSlot', 'image_slot', 'Slot non trouvé', () =>
    templateStudioRepository.updateImageSlot(req.params.slotId, req.body)
  );
};

export const deleteImageSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  await handleDelete(req, res, 'deleteImageSlot', 'image_slot', 'Slot non trouvé', () =>
    templateStudioRepository.deleteImageSlot(req.params.slotId)
  );
};

// ── POST /:id/studio/scaffold
// Seed placeholders (1 variant + 1 text_field + 1 image_slot) pour débloquer
// le flip v1→v2 d'un template legacy. Idempotent : ne crée que les ressources
// manquantes. super_admin only.
export const scaffoldStudio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!(await assertTemplateExists(id))) {
      record('studio_view', 'create', 'not_found');
      res.status(404).json({ error: 'Template non trouvé' });
      return;
    }
    const created = await templateStudioRepository.scaffoldPlaceholders(id);
    record('studio_view', 'create', 'success');
    logger.info('Template studio scaffold seeded', {
      templateId: id,
      userId: req.user?.id,
      created,
    });
    res.status(201).json({ templateId: id, created });
  } catch (error) {
    record('studio_view', 'create', 'error');
    logError('scaffoldStudio', req, error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
