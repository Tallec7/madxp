import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { videoRepository, siteRepository, siteVideoRepository } from '../repositories';
import { uploadVideo, uploadThumbnail, buildThumbnailPath, getThumbnailUrl } from '../services/storage.service';
import thumbnailService from '../services/thumbnail.service';
import { UploadStatus } from '../services/upload-verification.service';
import { templateRendererService } from '../services/template-renderer.service';
import { fixMulterEncoding, generateUniqueFilename, calculateChecksum } from './content.helpers';

// ============================================================================
// Template Rendering (overlay animation on existing MP4)
// ============================================================================

/**
 * GET /api/content/templates/available
 * Returns list of available built-in overlay templates with their variable schemas.
 */
export const getAvailableTemplates = async (_req: AuthRequest, res: Response) => {
  try {
    const templateSchemas = [
      {
        id: 'tpl_player',
        name: 'Annonce Joueur',
        description: 'Prénom + Nom plein écran avec photo joueur et logo club',
        variables: [
          { key: 'numero', label: 'Numéro', type: 'text', required: false, placeholder: '7' },
          { key: 'prenom', label: 'Prénom', type: 'text', required: true, placeholder: 'THOMAS' },
          { key: 'nom', label: 'Nom', type: 'text', required: true, placeholder: 'DUPONT' },
          { key: 'club', label: 'Nom du club', type: 'text', required: false, placeholder: 'UCKNEF BASKET', prefillFrom: 'club_name' },
          { key: 'photo', label: 'Photo joueur', type: 'image', required: false, accept: 'image/jpeg,image/png,image/webp' },
          { key: 'logo', label: 'Logo club', type: 'image', required: false, accept: 'image/jpeg,image/png,image/webp' },
        ],
      },
      {
        id: 'tpl_score_plus',
        name: 'Score +N',
        description: 'Overlay score (+1, +2, +3) avec nom joueur et logo club',
        variables: [
          { key: 'score', label: 'Score', type: 'text', required: true, placeholder: '+1' },
          { key: 'nom', label: 'Nom joueur', type: 'text', required: false, placeholder: 'DUPONT' },
          { key: 'club', label: 'Nom du club', type: 'text', required: false, placeholder: 'UCKNEF BASKET' },
          { key: 'color', label: 'Couleur score', type: 'color', required: false, placeholder: '#FF3333' },
          { key: 'logo', label: 'Logo club', type: 'image', required: false, accept: 'image/jpeg,image/png,image/webp' },
        ],
      },
      {
        id: 'tpl_buteur',
        name: 'Annonce Buteur',
        description: 'Animation BUUUUT ! avec numéro, nom et logo club',
        variables: [
          { key: 'nom', label: 'Nom', type: 'text', required: true, placeholder: 'DUPONT' },
          { key: 'numero', label: 'Numéro', type: 'text', required: false, placeholder: '7' },
          { key: 'club', label: 'Club', type: 'text', required: false, placeholder: 'UCKNEF BASKET' },
          { key: 'logo', label: 'Logo club', type: 'image', required: false, accept: 'image/jpeg,image/png,image/webp' },
        ],
      },
    ];

    res.json({ templates: templateSchemas });
  } catch (error) {
    logger.error('Error getting available templates:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/content/render-template
 * Renders an animated overlay on top of an uploaded MP4 video.
 *
 * multipart/form-data:
 *   - video: MP4 file (the base video)
 *   - templateId: string (e.g. 'tpl_player')
 *   - variables: JSON string (e.g. '{"nom":"DUPONT","numero":"7"}')
 *   - site_id: string (optional, tag the result for a specific site)
 */
export const renderTemplate = async (req: AuthRequest, res: Response) => {
  try {
    // With uploadTemplate.fields(), files are in req.files (object keyed by field name)
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const videoFiles = files?.['video'];
    const file = videoFiles?.[0];
    if (!file) {
      return res.status(400).json({ error: 'Aucune vidéo fournie' });
    }

    const { templateId, site_id: body_site_id } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId est requis' });
    }

    // Club users: auto-tag with their site_id
    const site_id = (req.user?.role === 'club' && req.user.site_id) ? req.user.site_id : body_site_id;

    // Parse variables
    let variables: Record<string, string> = {};
    if (req.body.variables) {
      try {
        variables = typeof req.body.variables === 'string'
          ? JSON.parse(req.body.variables)
          : req.body.variables;
      } catch {
        return res.status(400).json({ error: 'variables doit être un JSON valide' });
      }
    }

    // Extract image files and inject as base64 data URIs into variables
    // Image fields are named image_<key> (e.g. image_photo, image_logo)
    const imageKeys = Object.keys(files || {}).filter(k => k.startsWith('image_'));
    for (const fieldName of imageKeys) {
      const imageFile = files![fieldName]?.[0];
      if (imageFile) {
        const varKey = fieldName.replace('image_', '');
        const imageBuffer = imageFile.path
          ? await fs.promises.readFile(imageFile.path)
          : imageFile.buffer;
        const base64 = imageBuffer.toString('base64');
        variables[`_image_${varKey}`] = `data:${imageFile.mimetype};base64,${base64}`;
      }
    }

    // Validate site_id if provided
    if (site_id) {
      const siteExists = await siteRepository.exists(site_id);
      if (!siteExists) {
        return res.status(400).json({ error: 'Site non trouvé' });
      }
    }

    // Check renderer availability
    const available = await templateRendererService.isAvailable();
    if (!available) {
      logger.error('Template renderer not available (ffmpeg or puppeteer missing)');
      return res.status(503).json({
        error: 'Le service de rendu n\'est pas disponible. ffmpeg ou puppeteer manquant.',
      });
    }

    const correctedOriginalname = fixMulterEncoding(file.originalname);

    logger.info('Starting template render', {
      templateId,
      variables,
      originalFilename: correctedOriginalname,
      videoSize: file.size,
      siteId: site_id,
    });

    // Render the composite video (pass file.path for disk storage, file.buffer for memory)
    const videoInput = file.path || file.buffer;
    if (!videoInput) {
      return res.status(400).json({ error: 'Fichier vidéo non accessible' });
    }
    const result = await templateRendererService.render(
      videoInput,
      correctedOriginalname,
      { templateId, variables }
    );

    // Generate unique filename and checksum
    const filename = await generateUniqueFilename(result.filename);
    const checksum = calculateChecksum(result.buffer);

    // Upload to FTP storage
    const uploadResult = await uploadVideo(result.buffer, filename, result.mimetype);
    if (!uploadResult) {
      logger.error('Failed to upload rendered video to storage');
      return res.status(500).json({ error: 'Erreur lors de l\'upload de la vidéo rendue' });
    }

    const uploadStatus: UploadStatus = uploadResult.verified ? 'ready' : 'failed';
    const baseName = path.basename(correctedOriginalname, path.extname(correctedOriginalname));
    const videoTitle = `${baseName} (${templateId})`;

    // Insert in database
    const video = await videoRepository.create({
      filename,
      original_name: result.filename,
      category: null,
      subcategory: null,
      file_size: result.size,
      mime_type: result.mimetype,
      storage_path: uploadResult.path,
      checksum,
      metadata: {
        title: videoTitle,
        renderedFromTemplate: true,
        templateId,
        variables,
        sourceVideo: correctedOriginalname,
      },
      uploaded_by: req.user?.id || null,
      uploaded_for_site_id: site_id || null,
      upload_status: uploadStatus,
      upload_verified_at: uploadResult.verified ? new Date() : null,
      upload_verified_size: uploadResult.actualSize ?? null,
      duration: result.durationSeconds,
    });

    // Link video to site via pivot table (ADR-048)
    if (site_id) {
      await siteVideoRepository.link(site_id, video.id, req.user?.id);
    }

    // Generate thumbnail from rendered video buffer (ADR-048)
    let thumbnailUrl: string | null = null;
    if (uploadStatus === 'ready') {
      try {
        const tmpVideoPath = path.join(require('os').tmpdir(), `neopro_thumb_${video.id}.mp4`);
        fs.writeFileSync(tmpVideoPath, result.buffer);
        const thumbBuffer = await thumbnailService.generateThumbnailBuffer(tmpVideoPath);
        fs.unlinkSync(tmpVideoPath);
        if (thumbBuffer) {
          const thumbStoragePath = buildThumbnailPath(video.id);
          const thumbResult = await uploadThumbnail(thumbBuffer, thumbStoragePath);
          if (thumbResult) {
            thumbnailUrl = getThumbnailUrl(thumbStoragePath);
            await videoRepository.update(video.id, { thumbnail_url: thumbnailUrl });
          }
        }
      } catch (thumbError) {
        logger.warn('Thumbnail generation failed for template render (non-blocking)', {
          videoId: video.id,
          error: thumbError instanceof Error ? thumbError.message : String(thumbError),
        });
      }
    }

    const videoResponse = { ...video, title: videoTitle, url: uploadResult.url, thumbnail_url: thumbnailUrl };

    logger.info('Template rendered and uploaded successfully', {
      id: videoResponse.id,
      filename,
      title: videoTitle,
      templateId,
      outputSize: result.size,
      durationSeconds: result.durationSeconds,
      siteId: site_id,
    });

    res.status(201).json({
      success: true,
      message: `Vidéo rendue avec le template "${templateId}"`,
      video: videoResponse,
    });
  } catch (error) {
    logger.error('Error rendering template:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({
      error: 'Erreur lors du rendu du template',
      details: errorMessage,
    });
  }
};
