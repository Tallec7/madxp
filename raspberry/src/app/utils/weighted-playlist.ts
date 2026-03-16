import { LoopVideo } from '../interfaces/sponsor.interface';

/**
 * Génère une playlist pondérée à partir de vidéos avec des poids.
 * Chaque vidéo apparaît proportionnellement à son poids, intercalée
 * pour éviter les passages consécutifs du même sponsor.
 *
 * L'algorithme est déterministe : même input → même output (pas de random).
 * Rétro-compatible : weight absent/0/undefined → traité comme 1.
 *
 * Exemple :
 *   Input:  [{sponsor X, weight 3}, {sponsor Y, weight 2}, {sponsor Z, weight 1}]
 *   Output: [X, Y, X, Z, Y, X]
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

    // Construire la liste des slots : chaque vidéo a `weight` slots restants
    const slots: Array<{ video: LoopVideo; remaining: number; sponsorId: string }> = videos.map(v => ({
        video: v,
        remaining: getWeight(v),
        sponsorId: v.site_sponsor_id || v.path,
    }));

    const totalSlots = slots.reduce((sum, s) => sum + s.remaining, 0);
    const result: LoopVideo[] = [];
    let lastSponsorId = '';

    for (let i = 0; i < totalSlots; i++) {
        // Choisir le slot avec le plus de remaining, en évitant le même sponsor que le dernier
        let bestIdx = -1;
        let bestRemaining = -1;

        for (let j = 0; j < slots.length; j++) {
            if (slots[j].remaining <= 0) continue;
            if (slots[j].sponsorId === lastSponsorId && hasOtherOptions(slots, lastSponsorId)) continue;
            if (slots[j].remaining > bestRemaining) {
                bestRemaining = slots[j].remaining;
                bestIdx = j;
            }
        }

        // Fallback : si rien trouvé (ne devrait pas arriver), prendre le premier avec remaining > 0
        if (bestIdx === -1) {
            bestIdx = slots.findIndex(s => s.remaining > 0);
        }

        result.push(slots[bestIdx].video);
        slots[bestIdx].remaining--;
        lastSponsorId = slots[bestIdx].sponsorId;
    }

    return result;
}

function getWeight(video: LoopVideo): number {
    const w = video.weight;
    if (!w || w < 1) return 1;
    return Math.round(w);
}

function hasOtherOptions(slots: Array<{ remaining: number; sponsorId: string }>, excludeSponsorId: string): boolean {
    return slots.some(s => s.remaining > 0 && s.sponsorId !== excludeSponsorId);
}
