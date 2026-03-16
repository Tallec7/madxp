import { generateWeightedPlaylist } from './weighted-playlist';
import { LoopVideo } from '../interfaces/sponsor.interface';

function makeVideo(name: string, sponsorId?: string, weight?: number): LoopVideo {
    return {
        name,
        type: 'video/mp4',
        path: `videos/${name}.mp4`,
        site_sponsor_id: sponsorId,
        weight,
    };
}

describe('generateWeightedPlaylist', () => {
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
        // sponsor-1 has weight 5, sponsor-2 has weight 1
        // After sponsor-2 is exhausted, sponsor-1 must repeat
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

    it('is deterministic (same input → same output)', () => {
        const a = makeVideo('A', 'sponsor-1', 3);
        const b = makeVideo('B', 'sponsor-2', 2);
        const c = makeVideo('C', 'sponsor-3', 1);

        const result1 = generateWeightedPlaylist([a, b, c]);
        const result2 = generateWeightedPlaylist([a, b, c]);

        expect(result1.map(v => v.name)).toEqual(result2.map(v => v.name));
    });

    it('uses path as fallback sponsor ID when site_sponsor_id is missing', () => {
        const a = makeVideo('A', undefined, 2);
        const b = makeVideo('B', undefined, 1);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(3);

        // Should interleave since paths are different
        const countA = result.filter(v => v === a).length;
        const countB = result.filter(v => v === b).length;
        expect(countA).toBe(2);
        expect(countB).toBe(1);
    });

    it('rounds fractional weights', () => {
        const a = makeVideo('A', 'sponsor-1', 2.7);
        const b = makeVideo('B', 'sponsor-2', 1.3);
        const result = generateWeightedPlaylist([a, b]);
        expect(result.length).toBe(4); // round(2.7)=3 + round(1.3)=1
    });

    it('preserves object references (same LoopVideo instances)', () => {
        const a = makeVideo('A', 'sponsor-1', 2);
        const b = makeVideo('B', 'sponsor-2', 1);
        const result = generateWeightedPlaylist([a, b]);

        for (const video of result) {
            expect(video === a || video === b).toBe(true);
        }
    });
});
