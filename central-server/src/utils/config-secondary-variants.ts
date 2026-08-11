/**
 * Enrichit une SiteConfiguration avec les informations de variants display.
 *
 * Parcourt toutes les vidéos de la configuration (sponsors, categories, timeCategories),
 * extrait les filenames, interroge la base pour récupérer les variants par type d'écran,
 * et injecte variants[displayType] sur chaque entrée vidéo correspondante.
 *
 * Phase 5 — PROP-002: generalized from secondary-only to N display types.
 */

import { SiteConfiguration, VideoVariants } from '../types';
import { videoVariantRepository } from '../repositories/video-variant.repository';
import { siteRepository } from '../repositories/site.repository';
import { ledExportJobRepository } from '../repositories/led-export-job.repository';
import {
  computeFoldedCanvasHash,
  computeSiteCanvas,
  normalizeLayout,
  fitFromLayout,
} from '../services/led-fold.service';
import { extractFilenameFromPath } from './config-video-paths';
import logger from '../config/logger';
import { getVideoUrl } from '../services/storage.service';

/**
 * Résout les display types actifs pour un site en lisant sites.displays[].type.
 * Exclut le display principal 'tv' (pas un variant).
 * Fallback ['secondary'] pour les sites sans displays configurés (rétrocompat).
 */
export async function resolveDisplayTypesForSite(siteId: string): Promise<string[]> {
  try {
    const displays = await siteRepository.getDisplays(siteId);
    const types = [...new Set(displays.map(d => d.type).filter(t => t !== 'tv'))];
    return types.length > 0 ? types : ['secondary'];
  } catch {
    return ['secondary'];
  }
}

/**
 * Enrichit la configuration avec les variants pour les display types donnés.
 * Modifie la configuration en place et retourne le nombre de variants injectées.
 *
 * `displayTypes` vide (défaut) → fetch ALL variants quel que soit leur type
 * (`'secondary'`, `'led-banner'`, `'led-wall'`, `'totem'`, `display-N`, ...).
 * Bug historique : le default était `['secondary']`, ce qui ignorait silencieusement
 * tout nouveau type ajouté en DB après PR #918 (bandeaux LED, totems, etc.).
 */
/**
 * Remplace le chemin d'une variante led-perimeter par celui du CANVAS PLIÉ
 * fabriqué pour ce site (ADR-139, étape D).
 *
 * ## Interrupteur explicite, éteint par défaut
 *
 * N'agit QUE si `display.led.canvas_in.serve_folded === true`. Servir un canvas
 * plié à un processeur qui n'en veut pas donne un ruban noir un soir de match :
 * la bascule doit être un geste délibéré, posé après avoir observé le montage
 * réel (cf. `npm run led:mire`). `canvas_in.mode` ne peut PAS servir de bascule —
 * il vaut `'B'` par défaut Joi sur tout le parc, sans que personne l'ait choisi.
 *
 * ## Jamais de régression
 *
 * Si le canvas n'est pas encore fabriqué, on garde le fichier brut et on met le
 * pliage en file. Le prochain déploiement servira le canvas. Un cache manquant
 * dégrade la qualité, il ne casse pas la diffusion.
 */
/**
 * Ramène une URL publique de stockage à son chemin relatif.
 *
 * Les chemins de la config sont TOUJOURS relatifs — la base publique est ajoutée
 * au moment de servir (SaaS) ou de déployer (Pi). Y injecter une URL absolue la
 * fait préfixer une seconde fois.
 *
 * On dérive la base depuis `getVideoUrl('')` plutôt que de la coder en dur : elle
 * change entre environnements, et un préfixe figé ici casserait en silence.
 */
function toRelativeStoragePath(url: string): string {
  const base = getVideoUrl('');
  return base && url.startsWith(base) ? url.slice(base.length) : url;
}

async function substituteFoldedCanvas(
  variantMap: Map<string, VideoVariants>,
  siteId: string
): Promise<void> {
  let led;
  try {
    const displays = await siteRepository.getDisplays(siteId);
    led = displays.find((d) => d.type === 'led-perimeter')?.led;
  } catch (error) {
    logger.warn('folded canvas: profil LED illisible (fichier brut conservé)', { siteId, error });
    return;
  }

  if (!led?.canvas_in?.serve_folded) return; // interrupteur éteint = comportement historique
  if (!Array.isArray(led.sides) || led.sides.length === 0) return;

  // La géométrie dérivée est la SEULE source de la largeur d'entrée. Un profil qui
  // ne se dérive pas ne doit pas produire d'empreinte — sinon on mettrait en file
  // des fabrications vouées à échouer, à chaque déploiement.
  let canvas;
  try {
    canvas = computeSiteCanvas(led);
  } catch (error) {
    logger.warn('folded canvas: géométrie invalide (fichier brut conservé)', { siteId, error });
    return;
  }

  // `?? 1920` codait en dur une valeur que le worker n'utilise pas : l'empreinte
  // enregistrait 1920 là où le pliage se fait à 1600. La géométrie ne changeait pas
  // (côtés et pitch sont dans l'empreinte), mais « une empreinte = une géométrie »
  // devenait faux dans le détail — et c'est ce qu'ADR-139 revendique.
  const bandWidth = canvas.geometry.bandWidth;

  for (const variants of variantMap.values()) {
    const v = variants['led-perimeter'];
    if (!v?.path) continue;

    const hash = computeFoldedCanvasHash({
      sides: led.sides,
      pitch: led.pitch,
      height: led.height,
      bandWidth,
      order: led.canvas_in.order,
      sourcePath: v.path,
      layout: v.layout ?? null,
    });

    try {
      const ready = await ledExportJobRepository.findReadyByGeometry(siteId, v.videoId ?? '', hash);
      if (ready?.output_url) {
        // `output_url` est une URL PUBLIQUE complète, alors que `v.path` doit rester
        // un chemin relatif : `saas.controller` (et le Pi) y ajoutent la base ensuite.
        // Sans ce dépliage, la TV recevait
        // `https://…/neopro-video/https://…/neopro-video/led-exports/…` → 404 sur
        // chaque canvas, boucle d'erreurs et reset complet du player (Piraths,
        // 2026-08-11).
        v.path = toRelativeStoragePath(ready.output_url);
        v.folded = true;
        continue;
      }

      // Pas encore fabriqué : on garde le brut et on met en file, une seule fois.
      if (v.videoId && !(await ledExportJobRepository.hasPendingForGeometry(siteId, v.videoId, hash))) {
        const layout = normalizeLayout(v.layout ?? null);
        await ledExportJobRepository.create({
          site_id: siteId,
          video_id: v.videoId,
          display_type: 'led-perimeter',
          fit: fitFromLayout(layout),
          layout,
          created_by: null,
          geometry_hash: hash,
        });
        logger.info('folded canvas: fabrication mise en file', { siteId, videoId: v.videoId, hash });
      }
    } catch (error) {
      // Le déploiement ne doit JAMAIS tomber à cause du cache de pliage.
      logger.warn('folded canvas: cache indisponible (fichier brut conservé)', { siteId, error });
    }
  }
}

export async function enrichConfigWithDisplayVariants(
  config: SiteConfiguration,
  displayTypes: string[] = [],
  options: { siteId?: string | null } = {}
): Promise<{ config: SiteConfiguration; enrichedCount: number }> {
  // 1. Extract all unique filenames from the config
  const filenameToEntries = new Map<string, Array<{ path: string; setVariants: (v: VideoVariants) => void }>>();

  const registerEntry = (
    path: string,
    setter: (v: VideoVariants) => void
  ): void => {
    const filename = extractFilenameFromPath(path);
    if (!filenameToEntries.has(filename)) {
      filenameToEntries.set(filename, []);
    }
    filenameToEntries.get(filename)!.push({ path, setVariants: setter });
  };

  // Sponsors
  if (config.sponsors) {
    for (const sponsor of config.sponsors) {
      if (sponsor.path) {
        registerEntry(sponsor.path, (v) => { sponsor.variants = { ...sponsor.variants, ...v }; });
      }
    }
  }

  // Categories
  if (config.categories) {
    for (const category of config.categories) {
      for (const video of category.videos || []) {
        if (video.path) {
          registerEntry(video.path, (v) => { video.variants = { ...video.variants, ...v }; });
        }
      }
      for (const subCat of category.subCategories || []) {
        for (const video of subCat.videos || []) {
          if (video.path) {
            registerEntry(video.path, (v) => { video.variants = { ...video.variants, ...v }; });
          }
        }
      }
    }
  }

  // Time Categories
  if (config.timeCategories) {
    for (const tc of config.timeCategories) {
      for (const video of tc.loopVideos || []) {
        if (video.path) {
          registerEntry(video.path, (v) => { video.variants = { ...video.variants, ...v }; });
        }
      }
    }
  }

  if (filenameToEntries.size === 0) {
    return { config, enrichedCount: 0 };
  }

  // 2. Query variants from DB for all requested display types
  const filenames = [...filenameToEntries.keys()];
  const variants = await videoVariantRepository.findVariantsByFilenamesAndTypes(filenames, displayTypes);

  if (variants.length === 0) {
    return { config, enrichedCount: 0 };
  }

  // 3. Build filename → { [displayType]: variantInfo } map
  const variantMap = new Map<string, VideoVariants>();
  for (const v of variants) {
    // Variante led-perimeter « par côté pure » (ADR-135) : ni storage_path ni
    // filename — son rendu déployable est le CANVAS COMPOSÉ (par site), pas cette
    // row. On la SAUTE ici pour ne JAMAIS injecter un chemin cassé `videos-.../null`
    // (sinon MP4 noir côté Pi). La diffusion du composé est câblée à part (D).
    if (!v.storage_path && !v.filename) continue;
    // Use storage_path if available (FTP sharded path), fallback to legacy flat path
    const variantPath = v.storage_path
      ? v.storage_path
      : v.display_type === 'secondary'
        ? `videos-secondary/${v.filename}`
        : `videos-${v.display_type}/${v.filename}`;
    if (!variantMap.has(v.source_filename)) {
      variantMap.set(v.source_filename, {});
    }
    variantMap.get(v.source_filename)![v.display_type] = {
      path: variantPath,
      filename: v.filename,
      width: v.width ?? undefined,
      height: v.height ?? undefined,
      duration: v.duration ?? undefined,
      // Requis par l'étape D (ADR-139) pour retrouver/fabriquer le canvas plié.
      // Réservé au ruban : un `secondary` n'a pas de géométrie à plier, et ces
      // deux champs partiraient dans la config servie sans rien y signifier.
      ...(v.display_type === 'led-perimeter' ? { videoId: v.video_id, layout: v.layout ?? null } : {}),
    };
  }

  // 3bis. Étape D (ADR-139) — servir le CANVAS PLIÉ au lieu du fichier brut,
  // uniquement pour les sites qui l'ont explicitement activé.
  if (options.siteId) {
    await substituteFoldedCanvas(variantMap, options.siteId);
  }

  // 4. Inject variants into config entries
  let enrichedCount = 0;
  for (const [filename, entries] of filenameToEntries) {
    const variant = variantMap.get(filename);
    if (variant) {
      for (const entry of entries) {
        entry.setVariants(variant);
        enrichedCount++;
      }
    }
  }

  if (enrichedCount > 0) {
    logger.info('Config enriched with display variants', {
      displayTypes,
      totalFilenames: filenames.length,
      variantsFound: variants.length,
      entriesEnriched: enrichedCount,
    });
  }

  return { config, enrichedCount };
}

/** @deprecated Use enrichConfigWithDisplayVariants — backward compat alias */
export async function enrichConfigWithSecondaryVariants(
  config: SiteConfiguration
): Promise<{ config: SiteConfiguration; enrichedCount: number }> {
  return enrichConfigWithDisplayVariants(config, ['secondary']);
}
