// Resolver : applique la cascade (input < brandKit < manifest defaults) sur les bindings.
// En V1 réelle ce code vivra dans central-server/src/services/templates-studio.service.ts.

import type { Manifest } from './catalog';
import type { BrandKit, Player } from './mocks';

export type ResolvedProps = Record<string, unknown>;

export function resolve(
  manifest: Manifest,
  input: Record<string, unknown>,
  brandKit: BrandKit,
  players: Player[],
): ResolvedProps {
  const out: ResolvedProps = {};
  const playerById = new Map(players.map((p) => [p.id, p]));

  for (const [key, binding] of Object.entries(manifest.bindings)) {
    if (binding.source === 'literal') {
      out[key] = (binding as { source: 'literal'; value: unknown }).value;
      continue;
    }
    if (binding.source.startsWith('input.')) {
      const path = binding.source.slice('input.'.length);
      const raw = input[path];
      const t = (binding as { transform?: string }).transform;
      if (t && t.startsWith('player.') && typeof raw === 'string') {
        const player = playerById.get(raw);
        if (!player) {
          out[key] = null;
          continue;
        }
        switch (t) {
          case 'player.fullName':
            out[key] = `${player.prenom} ${player.nom}`;
            break;
          case 'player.number':
            out[key] = player.numero;
            break;
          case 'player.poste':
            out[key] = player.poste;
            break;
          case 'player.cutoutUrl':
            out[key] = player.photoCutoutUrl;
            break;
          default:
            out[key] = null;
        }
      } else {
        out[key] = raw ?? null;
      }
      continue;
    }
    if (binding.source.startsWith('brandKit.')) {
      const path = binding.source.slice('brandKit.'.length).split('.');
      let cur: unknown = brandKit;
      for (const seg of path) {
        if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[seg];
        } else {
          cur = null;
          break;
        }
      }
      out[key] = cur;
    }
  }
  return out;
}
