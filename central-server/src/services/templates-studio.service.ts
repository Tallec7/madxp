/**
 * Templates Studio V1 — service métier (résolveur de bindings).
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md §5
 *
 * Le résolveur applique la **cascade** suivante pour produire le payload final
 * envoyé au render server :
 *
 *   input override < brand kit < manifest defaults
 *
 * Trois sources de bindings supportées :
 *   - `input.<key>` (avec transform optionnel `player.fullName`/`number`/`cutoutUrl`/`poste`)
 *   - `brandKit.<path>` (lookup profond dans `colors_json`/`logos_json`/`fonts_json`/`club_name`)
 *   - `literal` (valeur en dur dans le manifest)
 *
 * Le résolveur tourne **côté centrale** au moment du `POST /render-requests`,
 * pas côté worker. Conséquence : `render_requests.props_json` contient le
 * payload **résolu** — audit trail clair, brand kit changes après queueing
 * n'affectent pas les renders déjà en file.
 *
 * **Player.* bindings (S4)** : tant que le repo `players` n'est pas peuplé
 * (worker rembg pas livré), les bindings `transform: 'player.*'` retournent
 * `null` avec un warn structuré. La validation Joi côté form bloquera
 * normalement la création tant que le buteur n'est pas choisi, mais on est
 * defensive ici.
 */

import logger from '../config/logger';
import {
  type SiteBrandKitRow,
  type PlayerRow,
} from '../repositories';

// ────────────────────────────────────────────────────────────────────────────
// Types — alignés sur le manifest V1
// ────────────────────────────────────────────────────────────────────────────

export type BindingSource =
  | { source: string; transform?: string }
  | { source: 'literal'; value: unknown };

export interface ManifestBindings {
  bindings?: Record<string, BindingSource>;
}

export type ResolvedProps = Record<string, unknown>;

// Brand kit "lookup vue" : combinaison du club_name + JSONs en un objet plat
// indexable via les chemins du manifest (`brandKit.clubName`, `brandKit.colors.primary`).
function buildBrandKitView(brandKit: SiteBrandKitRow | null): Record<string, unknown> {
  if (!brandKit) {
    return { clubName: null, colors: {}, logos: {}, fonts: {} };
  }
  return {
    clubName: brandKit.club_name,
    colors: brandKit.colors_json ?? {},
    logos: brandKit.logos_json ?? {},
    fonts: brandKit.fonts_json ?? {},
  };
}

function lookupPath(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return null;
    }
  }
  return cur;
}

function applyPlayerTransform(player: PlayerRow, transform: string): unknown {
  switch (transform) {
    case 'player.fullName':
      return `${player.prenom} ${player.nom}`;
    case 'player.number':
      return player.numero;
    case 'player.cutoutUrl':
      return player.photo_cutout_url;
    case 'player.poste':
      return player.poste;
    default:
      return null;
  }
}

export interface ResolveContext {
  manifest: ManifestBindings;
  inputProps: Record<string, unknown>;
  brandKit: SiteBrandKitRow | null;
  // Map<playerId, PlayerRow> — fournie par le caller au lookup S4.
  // Null tant que les players ne sont pas implémentés.
  playersById?: Map<string, PlayerRow>;
}

/**
 * Résout les `bindings` du manifest contre l'input + brand kit + players.
 * Retourne un objet plat prêt à être passé en `inputProps` à Remotion.
 */
export function resolveBindings(ctx: ResolveContext): ResolvedProps {
  const out: ResolvedProps = {};
  const bindings = ctx.manifest.bindings ?? {};
  const brandKitView = buildBrandKitView(ctx.brandKit);

  for (const [key, binding] of Object.entries(bindings)) {
    if (binding.source === 'literal') {
      const lit = binding as { source: 'literal'; value: unknown };
      out[key] = lit.value;
      continue;
    }

    // input.<key> [+ transform]
    if (binding.source.startsWith('input.')) {
      const inputKey = binding.source.slice('input.'.length);
      const raw = ctx.inputProps[inputKey];
      const transform = (binding as { transform?: string }).transform;

      if (transform && transform.startsWith('player.')) {
        if (typeof raw !== 'string') {
          out[key] = null;
          continue;
        }
        const player = ctx.playersById?.get(raw);
        if (!player) {
          // S4 deferred OR player unknown — log structuré, on continue.
          logger.warn('templates-studio.resolver: player not resolved', {
            binding_key: key,
            input_key: inputKey,
            player_id: raw,
            reason: ctx.playersById ? 'unknown_player_id' : 'players_lookup_not_provided',
          });
          out[key] = null;
          continue;
        }
        out[key] = applyPlayerTransform(player, transform);
        continue;
      }

      out[key] = raw ?? null;
      continue;
    }

    // brandKit.<path>
    if (binding.source.startsWith('brandKit.')) {
      const segments = binding.source.slice('brandKit.'.length).split('.');
      out[key] = lookupPath(brandKitView, segments);
      continue;
    }

    // Source inconnue — on ne crash pas, on log et on met null.
    logger.warn('templates-studio.resolver: unknown binding source', {
      binding_key: key,
      source: binding.source,
    });
    out[key] = null;
  }

  return out;
}
