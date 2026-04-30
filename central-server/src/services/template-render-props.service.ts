/**
 * Template Render Props Service — assembleur du payload Remotion pour v2.
 *
 * Le client envoie un payload minimal au render :
 *   { variantId, textValues, imageUploads, selectedOptions }
 *
 * Le worker doit enrichir avec :
 *   - layers / textFields / imageSlots / variants depuis la DB (TemplateV2)
 *   - **packshot pluggable** : si selectedOptions match un template_packshot_refs,
 *     on empile les layers + slots du packshot référencé EN SURCOUCHE, avec
 *     z_index_offset et appearAt décalé par start_at_ms.
 *
 * Refs :
 *   - PR #771 (DB template_packshot_refs + repository)
 *   - PR #773 (UI form options + propagation selectedOptions)
 *   - PDF Specs Animation Joueur §démarrage (packshot generique|img pluggable)
 */

import logger from '../config/logger';
import {
  templateStudioRepository,
  templateOptionsRepository,
} from '../repositories';
import type {
  TemplateV2,
  TemplateLayer,
  TemplateTextField,
  TemplateImageSlot,
} from '../types/template-studio.types';

export interface EnrichedRenderProps {
  variants: TemplateV2['variants'];
  layers: TemplateLayer[];
  textFields: TemplateTextField[];
  imageSlots: TemplateImageSlot[];
  variantId: string;
  textValues: Record<string, string>;
  imageUploads: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
  selectedOptions: Record<string, string>;
  /** Trace pour debug : packshot effectivement résolu (si applicable). */
  resolvedPackshotTemplateId: string | null;
}

export interface ClientRenderPayload {
  variantId: string;
  textValues?: Record<string, string>;
  imageUploads?: Record<string, string>;
  selectedOptions?: Record<string, string>;
}

class TemplateRenderPropsService {
  /**
   * Assemble les inputProps Remotion pour un template v2.
   * Retourne null si le template n'est pas v2 (caller fallback v1 legacy).
   */
  async buildV2(
    templateId: string,
    payload: ClientRenderPayload
  ): Promise<EnrichedRenderProps | null> {
    const tpl = await templateStudioRepository.findV2ById(templateId);
    if (!tpl) return null;

    const selectedOptions = { ...payload.selectedOptions };
    // Hydrate les options non fournies avec leur defaultValue (utile si le
    // client a oublié d'en envoyer une — robustesse).
    for (const opt of tpl.options ?? []) {
      if (!(opt.key in selectedOptions)) {
        selectedOptions[opt.key] = opt.defaultValue;
      }
    }

    // Packshot pluggable : résoud si une option correspond à un ref enregistré.
    const packshotRef = await templateOptionsRepository.resolvePackshot(
      templateId,
      selectedOptions
    );

    let mergedLayers = [...tpl.layers];
    let mergedTextFields = [...tpl.textFields];
    let mergedImageSlots = [...tpl.imageSlots];
    let resolvedPackshotTemplateId: string | null = null;

    if (packshotRef) {
      const packshot = await templateStudioRepository.findV2ById(
        packshotRef.packshot_template_id
      );
      if (packshot) {
        resolvedPackshotTemplateId = packshot.id;
        // Décale tous les layers/slots du packshot pour les empiler au-dessus
        // du template parent + retarder leur apparition (start_at_ms).
        const packshotStartSec = packshotRef.start_at_ms / 1000;
        const zOffset = packshotRef.z_index_offset;

        for (const layer of packshot.layers) {
          mergedLayers.push({
            ...layer,
            zIndex: layer.zIndex + zOffset,
          });
        }
        for (const tf of packshot.textFields) {
          mergedTextFields.push({
            ...tf,
            appearAt: tf.appearAt + packshotStartSec,
          });
        }
        for (const slot of packshot.imageSlots) {
          mergedImageSlots.push({
            ...slot,
            appearAt: slot.appearAt + packshotStartSec,
          });
        }

        logger.info('Packshot merged into render props', {
          parentTemplateId: templateId,
          packshotTemplateId: packshot.id,
          startAtMs: packshotRef.start_at_ms,
          zOffset,
          addedLayers: packshot.layers.length,
          addedTextFields: packshot.textFields.length,
          addedImageSlots: packshot.imageSlots.length,
        });
      } else {
        logger.warn('Packshot ref points to missing template', {
          parentTemplateId: templateId,
          packshotTemplateId: packshotRef.packshot_template_id,
        });
      }
    }

    return {
      variants: tpl.variants,
      layers: mergedLayers,
      textFields: mergedTextFields,
      imageSlots: mergedImageSlots,
      variantId: payload.variantId,
      textValues: payload.textValues ?? {},
      imageUploads: payload.imageUploads ?? {},
      canvasWidth: tpl.canvasWidth,
      canvasHeight: tpl.canvasHeight,
      selectedOptions,
      resolvedPackshotTemplateId,
    };
  }
}

export const templateRenderPropsService = new TemplateRenderPropsService();
