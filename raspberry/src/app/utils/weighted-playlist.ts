import { LoopVideo } from '../interfaces/sponsor.interface';

/**
 * Génère une playlist pondérée via un algorithme Bresenham (smooth scheduling)
 * avec contrainte anti-consécutif par sponsor et support des vidéos épinglées.
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
 * Les vidéos avec `pinned: true` restent à leur position d'origine.
 * L'algorithme est déterministe : même input → même output (pas de random).
 * Rétro-compatible : weight absent/0/undefined → traité comme 1.
 */
export function generateWeightedPlaylist(videos: LoopVideo[]): LoopVideo[] {
    if (!videos || videos.length === 0) return [];
    if (videos.length === 1) {
        const w = getWeight(videos[0]);
        return Array(w).fill(videos[0]);
    }

    // Vérifier si tous les poids sont 1 (ou absents) ET pas de pinned → retourner tel quel
    const allDefaultWeight = videos.every(v => getWeight(v) === 1);
    const hasPinned = videos.some(v => v.pinned);
    if (allDefaultWeight && !hasPinned) return [...videos];

    // Séparer les vidéos épinglées (restent à leur position) des vidéos mobiles (Bresenham)
    const pinnedSlots = new Map<number, LoopVideo>(); // index original → vidéo
    const mobileVideos: LoopVideo[] = [];

    for (let i = 0; i < videos.length; i++) {
        if (videos[i].pinned) {
            pinnedSlots.set(i, videos[i]);
        } else {
            mobileVideos.push(videos[i]);
        }
    }

    // Si toutes les vidéos sont épinglées, retourner l'ordre original
    if (mobileVideos.length === 0) return [...videos];

    // Si tous les mobiles ont weight 1 et aucun pinned → fast path
    const allMobileDefault = mobileVideos.every(v => getWeight(v) === 1);
    if (allMobileDefault && pinnedSlots.size === 0) return [...videos];

    // Bresenham smooth scheduling sur les vidéos mobiles uniquement
    const bresenhamResult = bresenhamSchedule(mobileVideos);

    // Si pas de vidéos épinglées, retourner directement le résultat Bresenham
    if (pinnedSlots.size === 0) {
        fixWrapAround(bresenhamResult);
        return bresenhamResult;
    }

    // Fusionner : insérer les vidéos épinglées à leurs positions
    const totalLength = bresenhamResult.length + pinnedSlots.size;
    const result: LoopVideo[] = [];
    let bresenhamIdx = 0;

    for (let i = 0; i < totalLength; i++) {
        if (pinnedSlots.has(i)) {
            result.push(pinnedSlots.get(i)!);
        } else if (bresenhamIdx < bresenhamResult.length) {
            result.push(bresenhamResult[bresenhamIdx]);
            bresenhamIdx++;
        }
    }

    // Ajouter les éventuels restants (cas weight > 1 qui expand la playlist)
    while (bresenhamIdx < bresenhamResult.length) {
        result.push(bresenhamResult[bresenhamIdx]);
        bresenhamIdx++;
    }

    fixWrapAround(result);
    return result;
}

/**
 * Bresenham smooth scheduling avec contrainte anti-consécutif par sponsor.
 * Distribue les vidéos uniformément selon leur poids.
 */
function bresenhamSchedule(videos: LoopVideo[]): LoopVideo[] {
    if (videos.length === 0) return [];
    if (videos.length === 1) {
        const w = getWeight(videos[0]);
        return Array(w).fill(videos[0]);
    }

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

/**
 * Corrige le cas wrap-around : la boucle TV cycle (pos N → pos 1).
 * Si premier et dernier ont le même sponsor, le dernier est déplacé
 * au milieu de la playlist pour éviter un double passage à la jonction.
 * Les vidéos épinglées ne sont jamais déplacées.
 */
function fixWrapAround(result: LoopVideo[]): void {
    if (result.length <= 2) return;

    const getSponsorId = (v: LoopVideo): string => v.site_sponsor_id || v.path;
    const firstSid = getSponsorId(result[0]);
    const lastSid = getSponsorId(result[result.length - 1]);

    if (firstSid !== lastSid) return;

    // Ne pas déplacer si le dernier est épinglé
    if (result[result.length - 1].pinned) return;

    // Retirer le dernier élément et trouver un emplacement au milieu
    const removed = result.pop()!;
    const mid = Math.floor(result.length / 2);

    // Chercher autour du milieu un emplacement où les voisins sont d'autres sponsors
    for (let offset = 0; offset <= result.length; offset++) {
        const candidates = offset === 0 ? [mid] : [mid + offset, mid - offset];
        for (const pos of candidates) {
            if (pos < 1 || pos >= result.length) continue;
            const prevSid = getSponsorId(result[pos - 1]);
            const nextSid = getSponsorId(result[pos]);
            if (prevSid !== lastSid && nextSid !== lastSid) {
                result.splice(pos, 0, removed);
                return;
            }
        }
    }

    // Fallback : remettre à la fin (ne devrait pas arriver avec des sponsors variés)
    result.push(removed);
}
