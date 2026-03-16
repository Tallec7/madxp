import { generateWeightedPlaylist } from './weighted-playlist';
import { LoopVideo } from '../interfaces/sponsor.interface';

function makeVideo(name: string, sponsorId?: string, weight?: number, pinned?: boolean): LoopVideo {
    return {
        name,
        type: 'video/mp4',
        path: `videos/${name}.mp4`,
        site_sponsor_id: sponsorId,
        weight,
        pinned,
    };
}

describe('generateWeightedPlaylist', () => {
    // --- Edge cases ---

    it('returns empty array for empty input', () => {
        expect(generateWeightedPlaylist([])).toEqual([]);
    });

    it('returns empty array for null/undefined input', () => {
        expect(generateWeightedPlaylist(null as unknown as LoopVideo[])).toEqual([]);
        expect(generateWeightedPlaylist(undefined as unknown as LoopVideo[])).toEqual([]);
    });

    it('returns single video once when weight is 1', () => {
        const video = makeVideo('A', 'sponsor-1', 1);
        const result = generateWeightedPlaylist([video]);
        expect(result).toEqual([video]);
    });

    it('returns single video repeated when weight > 1', () => {
        const video = makeVideo('A', 'sponsor-1', 3);
        const result = generateWeightedPlaylist([video]);
        expect(result.length).toBe(3);
        expect(result.every(v => v === video)).toBe(true);
    });

    // --- Fast paths ---

    it('returns original order when all weights are 1 (fast path)', () => {
        const a = makeVideo('A', 'sponsor-1', 1);
        const b = makeVideo('B', 'sponsor-2', 1);
        const c = makeVideo('C', 'sponsor-3', 1);
        const result = generateWeightedPlaylist([a, b, c]);
        expect(result).toEqual([a, b, c]);
    });

    it('returns original order when all weights are undefined (backward compat)', () => {
        const a = makeVideo('A', 'sponsor-1');
        const b = makeVideo('B', 'sponsor-2');
        const result = generateWeightedPlaylist([a, b]);
        expect(result).toEqual([a, b]);
    });

    // --- Weight normalization ---

    it('treats weight 0 as 1', () => {
        const a = makeVideo('A', 'sponsor-1', 0);
        const b = makeVideo('B', 'sponsor-2', 0);
        const result = generateWeightedPlaylist([a, b]);
        expect(result).toEqual([a, b]);
    });

    it('treats negative weight as 1', () => {
        const a = makeVideo('A', 'sponsor-1', -5);
        const result = generateWeightedPlaylist([a]);
        expect(result.length).toBe(1);
    });

    it('rounds fractional weights', () => {
        const a = makeVideo('A', 'sponsor-1', 2.7);
        const b = makeVideo('B', 'sponsor-2', 1.3);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(4); // round(2.7)=3 + round(1.3)=1
    });

    // --- Correct proportions ---

    it('generates correct total length for weighted videos', () => {
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const c = makeVideo('C', 'sponsor-3', 1);
        const result = generateWeightedPlaylist([a, b, c]);
        expect(result.length).toBe(6); // 3 + 2 + 1
    });

    it('respects weight proportions', () => {
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const c = makeVideo('C', 'sponsor-3', 1);
        const result = generateWeightedPlaylist([a, b, c]);

        const countA = result.filter(v => v === a).length;
        const countB = result.filter(v => v === b).length;
        const countC = result.filter(v => v === c).length;

        expect(countA).toBe(3);
        expect(countB).toBe(2);
        expect(countC).toBe(1);
    });

    // --- Anti-consecutive sponsor constraint ---

    it('avoids consecutive same-sponsor when possible', () => {
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const c = makeVideo('C', 'sponsor-3', 1);
        const result = generateWeightedPlaylist([a, b, c]);

        for (let i = 1; i < result.length; i++) {
            const prevSponsor = result[i - 1].site_sponsor_id;
            const currSponsor = result[i].site_sponsor_id;
            expect({ index: i, consecutive: prevSponsor === currSponsor }).toEqual({
                index: i,
                consecutive: false,
            });
        }
    });

    it('allows consecutive when only one sponsor remains', () => {
        const a = makeVideo('A', 'sponsor-1', 5);
        const b = makeVideo('B', 'sponsor-2', 1);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(6);

        const countA = result.filter(v => v === a).length;
        const countB = result.filter(v => v === b).length;
        expect(countA).toBe(5);
        expect(countB).toBe(1);
    });

    it('handles all same sponsor (no interleaving possible)', () => {
        const a = makeVideo('A', 'sponsor-1', 2);
        const b = makeVideo('B', 'sponsor-1', 1);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(3); // 2 + 1
    });

    // --- Bresenham uniform distribution ---

    it('distributes dominant video evenly (not front-loaded)', () => {
        // A(×4) + B,C,D,E,F,G,H(×1 each) = 11 slots
        // Bresenham should spread A across the whole playlist, not front-load
        const a = makeVideo('A', 'sponsor-1', 4);
        const others = ['B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) =>
            makeVideo(n, `sponsor-${i + 2}`, 1),
        );
        const result = generateWeightedPlaylist([a, ...others]);

        expect(result.length).toBe(11);
        expect(result.filter(v => v === a).length).toBe(4);

        // A should NOT be front-loaded (greedy would put A at 0,2,4,6)
        // Bresenham should have A appearing in the second half too
        const aPositions = result.map((v, i) => (v === a ? i : -1)).filter(i => i >= 0);
        const lastAPosition = aPositions[aPositions.length - 1];
        expect(lastAPosition).toBeGreaterThanOrEqual(8); // A should reach the end of the playlist
    });

    it('produces visibly different patterns for ×4 vs ×10', () => {
        const others = ['B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) =>
            makeVideo(n, `sponsor-${i + 2}`, 1),
        );

        const a4 = makeVideo('A', 'sponsor-1', 4);
        const result4 = generateWeightedPlaylist([a4, ...others]);
        const positions4 = result4.map((v, i) => (v === a4 ? i : -1)).filter(i => i >= 0);

        const a10 = makeVideo('A', 'sponsor-1', 10);
        const result10 = generateWeightedPlaylist([a10, ...others]);
        const positions10 = result10.map((v, i) => (v === a10 ? i : -1)).filter(i => i >= 0);

        // ×4: average gap between A appearances should be ~2.75 (11/4)
        // ×10: average gap should be ~1.7 (17/10)
        const avgGap4 = computeAverageGap(positions4);
        const avgGap10 = computeAverageGap(positions10);

        // ×10 should have noticeably smaller gaps than ×4
        expect(avgGap4).toBeGreaterThan(avgGap10 + 0.5);
    });

    // --- Determinism ---

    it('is deterministic (same input → same output)', () => {
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const c = makeVideo('C', 'sponsor-3', 1);

        const result1 = generateWeightedPlaylist([a, b, c]);
        const result2 = generateWeightedPlaylist([a, b, c]);

        expect(result1.map(v => v.name)).toEqual(result2.map(v => v.name));
    });

    // --- Fallback sponsor ID ---

    it('uses path as fallback sponsor ID when site_sponsor_id is missing', () => {
        const a = makeVideo('A', undefined, 2);
        const b = makeVideo('B', undefined, 1);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(3);

        const countA = result.filter(v => v === a).length;
        const countB = result.filter(v => v === b).length;
        expect(countA).toBe(2);
        expect(countB).toBe(1);
    });

    // --- Wrap-around fix ---

    it('avoids same-sponsor at first AND last position (loop cycles)', () => {
        // Cofap(×2) + 8 others(×1) = 10 slots
        // Without wrap-around fix: Cofap at pos 0 AND pos 9 → double passage à la jonction
        const cofap = makeVideo('Cofap', 'sponsor-cofap', 2);
        const others = ['Intro', 'Viaweb', 'Lidl', 'Elsan', 'Laugier', 'Affut', 'AppartCity', 'Kamineo'].map((n, i) =>
            makeVideo(n, `sponsor-${i + 2}`, 1),
        );
        const result = generateWeightedPlaylist([cofap, ...others]);

        expect(result.length).toBe(10);
        expect(result.filter(v => v === cofap).length).toBe(2);

        // First and last must NOT be the same sponsor
        const firstSponsor = result[0].site_sponsor_id;
        const lastSponsor = result[result.length - 1].site_sponsor_id;
        expect({
            wrapAroundSafe: firstSponsor !== lastSponsor,
            first: firstSponsor,
            last: lastSponsor,
        }).toEqual({
            wrapAroundSafe: true,
            first: firstSponsor,
            last: lastSponsor,
        });

        // Internal anti-consecutive must still hold
        for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1].site_sponsor_id;
            const curr = result[i].site_sponsor_id;
            if (prev === curr) {
                // Only OK if no other sponsor available (shouldn't happen here)
                expect({ index: i, consecutive: true }).toEqual({ index: i, consecutive: false });
            }
        }
    });

    it('wrap-around fix preserves video count', () => {
        // Multiple weighted sponsors
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const others = ['C', 'D', 'E', 'F', 'G'].map((n, i) =>
            makeVideo(n, `sponsor-${i + 3}`, 1),
        );
        const result = generateWeightedPlaylist([a, b, ...others]);

        expect(result.length).toBe(10); // 3 + 2 + 5
        expect(result.filter(v => v === a).length).toBe(3);
        expect(result.filter(v => v === b).length).toBe(2);
    });

    // --- Object identity ---

    it('preserves object references (same LoopVideo instances)', () => {
        const a = makeVideo('A', 'sponsor-1', 2);
        const b = makeVideo('B', 'sponsor-2', 1);
        const result = generateWeightedPlaylist([a, b]);

        for (const video of result) {
            expect(video === a || video === b).toBe(true);
        }
    });

    // --- Pinned videos ---

    it('keeps pinned video at its original position', () => {
        const intro = makeVideo('Intro', 'sponsor-neopro', 1, true);
        const a = makeVideo('A', 'sponsor-1', 2);
        const b = makeVideo('B', 'sponsor-2', 1);
        const c = makeVideo('C', 'sponsor-3', 1);
        const result = generateWeightedPlaylist([intro, a, b, c]);

        // Intro pinned at position 0 → must stay first
        expect(result[0]).toBe(intro);
        // Total = 1 (intro pinned) + 2 + 1 + 1 = 5 slots
        expect(result.length).toBe(5);
        expect(result.filter(v => v === intro).length).toBe(1);
        expect(result.filter(v => v === a).length).toBe(2);
    });

    it('keeps multiple pinned videos at their positions', () => {
        const intro = makeVideo('Intro', 'sponsor-neopro', 1, true);
        const a = makeVideo('A', 'sponsor-1', 1);
        const outro = makeVideo('Outro', 'sponsor-neopro', 1, true);
        const result = generateWeightedPlaylist([intro, a, outro]);

        // intro at 0, outro at 2 → pinned stay
        expect(result[0]).toBe(intro);
        expect(result[2]).toBe(outro);
        expect(result.length).toBe(3);
    });

    it('returns original order when all videos are pinned', () => {
        const a = makeVideo('A', 'sponsor-1', 1, true);
        const b = makeVideo('B', 'sponsor-2', 1, true);
        const c = makeVideo('C', 'sponsor-3', 1, true);
        const result = generateWeightedPlaylist([a, b, c]);

        expect(result).toEqual([a, b, c]);
    });

    it('pinned videos do not participate in Bresenham scheduling', () => {
        const intro = makeVideo('Intro', 'sponsor-neopro', 1, true);
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 1);
        const result = generateWeightedPlaylist([intro, a, b]);

        // Intro stays at 0 (pinned), Bresenham fills the rest (3 + 1 = 4 mobile slots)
        expect(result[0]).toBe(intro);
        expect(result.length).toBe(5); // 1 pinned + 4 mobile
        expect(result.filter(v => v === a).length).toBe(3);
        expect(result.filter(v => v === b).length).toBe(1);
    });

    it('pinned videos are not moved by wrap-around fix', () => {
        // Set up scenario where wrap-around would normally move the last element
        const a = makeVideo('A', 'sponsor-1', 2);
        const b = makeVideo('B', 'sponsor-2', 1);
        const c = makeVideo('C', 'sponsor-3', 1);
        const outro = makeVideo('Outro', 'sponsor-neopro', 1, true);
        // outro is pinned at position 3
        const result = generateWeightedPlaylist([a, b, c, outro]);

        // Outro pinned at position 3 → stays there regardless of wrap-around
        expect(result[3]).toBe(outro);
    });
});

/** Calcule l'écart moyen entre les positions d'apparition */
function computeAverageGap(positions: number[]): number {
    if (positions.length <= 1) return 0;
    let totalGap = 0;
    for (let i = 1; i < positions.length; i++) {
        totalGap += positions[i] - positions[i - 1];
    }
    return totalGap / (positions.length - 1);
}
