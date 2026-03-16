import { LoopVideo } from '../interfaces/sponsor.interface';

/**
 * Génère une playlist pondérée via un algorithme Bresenham (smooth scheduling)
 * avec contrainte anti-consécutif par sponsor.
 *
 * Bresenham distribue les vidéos de façon RÉGULIÈRE sur toute la playlist,
 * contrairement au greedy qui front-load le sponsor dominant :
 *
 *   Greedy  A(×4) + 7 autres(×1) → [A,B,A,C,A,D,A,E,F,G,H]  (A "1 sur 2" puis absent)
 *   Bresenham                     → [A,B,C,A,D,E,F,A,G,H,A]  (A "1 sur 3" régulier)
 *
 * Cela rend la pondération visuellement perceptible :
 *   ×4 → ~1 vidéo sur 3 | ×10 → ~1 vidéo sur 2
 *
 * L'algorithme est déterministe : même input → même output (pas de random).
 * Rétro-compatible : weight absent/0/undefined → traité comme 1.
 */
export function generateWeightedPlaylist(videos: LoopVideo[]): LoopVideo[] {
    if (!videos || videos.length === 0) return [];
    if (videos.length === 1) {
        const w = getWeight(videos[0]);
        return Array(w).fill(videos[0]);
    }

    // Vérifier si tous les poids sont 1 (ou absents) → retourner tel quel (fast path)
    const allDefaultWeight = videos.every(v => getWeight(v) === 1);
    if (allDefaultWeight) return [...videos];

    // Bresenham smooth scheduling avec anti-consécutif
    const entries = videos.map(v => ({
        video: v,
        weight: getWeight(v),
        remaining: getWeight(v),
        accumulator: 0,
        sponsorId: v.site_sponsor_id || v.path,
    }));

    const totalSlots = entries.reduce((sum, e) => sum + e.remaining, 0);
    const result: LoopVideo[] = [];
    let lastSponsorId = '';

    for (let i = 0; i < totalSlots; i++) {
        // Phase 1 : accumuler le poids de chaque vidéo encore disponible
        for (const entry of entries) {
            if (entry.remaining > 0) {
                entry.accumulator += entry.weight;
            }
        }

        // Phase 2 : sélectionner le meilleur candidat (plus gros accumulateur)
        // avec contrainte anti-consécutif par sponsor
        let bestIdx = -1;
        let bestAcc = -Infinity;

        for (let j = 0; j < entries.length; j++) {
            if (entries[j].remaining <= 0) continue;
            if (entries[j].sponsorId === lastSponsorId && hasOtherSponsorOptions(entries, lastSponsorId)) continue;
            if (entries[j].accumulator > bestAcc) {
                bestAcc = entries[j].accumulator;
                bestIdx = j;
            }
        }

        // Fallback : si rien trouvé, prendre le premier avec remaining > 0
        if (bestIdx === -1) {
            bestIdx = entries.findIndex(e => e.remaining > 0);
        }

        result.push(entries[bestIdx].video);
        entries[bestIdx].remaining--;
        entries[bestIdx].accumulator -= totalSlots;
        lastSponsorId = entries[bestIdx].sponsorId;
    }

    return result;
}

/** Poids effectif : absent/0/négatif → 1, arrondi sinon */
function getWeight(video: LoopVideo): number {
    const w = video.weight;
    if (!w || w < 1) return 1;
    return Math.round(w);
}

function hasOtherSponsorOptions(
    entries: Array<{ remaining: number; sponsorId: string }>,
    excludeSponsorId: string,
): boolean {
    return entries.some(e => e.remaining > 0 && e.sponsorId !== excludeSponsorId);
}
