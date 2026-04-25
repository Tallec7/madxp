import { removeVideoFromConfig } from './config-video-cleanup';

describe('removeVideoFromConfig (PR2.1)', () => {
  const VIDEO_ID = 'acff5e34-173b-4d10-912f-617f7833f813';
  const FILENAME = 'JOUEUR_85.mp4';

  it('returns 0 when no criteria provided', () => {
    const config = { sponsors: [{ path: 'a.mp4' }] };
    expect(removeVideoFromConfig(config, {})).toBe(0);
    expect(config.sponsors).toHaveLength(1);
  });

  it('removes sponsor entry by video_id', () => {
    const config = {
      sponsors: [
        { path: 'sponsor-a.mp4', video_id: 'aaa' },
        { path: 'sponsor-b.mp4', video_id: VIDEO_ID },
        { path: 'sponsor-c.mp4', video_id: 'ccc' },
      ],
    };
    const removed = removeVideoFromConfig(config, { videoId: VIDEO_ID });
    expect(removed).toBe(1);
    expect(config.sponsors).toHaveLength(2);
    expect(config.sponsors.map(s => s.video_id)).toEqual(['aaa', 'ccc']);
  });

  it('removes sponsor entry by filename (legacy entries without video_id)', () => {
    const config = {
      sponsors: [
        { path: 'videos/JOUEUR_85.mp4' },
        { path: 'videos/JOUEUR_01.mp4' },
      ],
    };
    const removed = removeVideoFromConfig(config, { filename: FILENAME });
    expect(removed).toBe(1);
    expect(config.sponsors).toHaveLength(1);
    expect(config.sponsors[0].path).toBe('videos/JOUEUR_01.mp4');
  });

  it('removes from categories.videos and subCategories.videos', () => {
    const config = {
      categories: [
        {
          videos: [{ path: 'a.mp4', video_id: VIDEO_ID }, { path: 'b.mp4' }],
          subCategories: [
            { videos: [{ path: 'c.mp4', video_id: VIDEO_ID }] },
          ],
        },
      ],
    };
    const removed = removeVideoFromConfig(config, { videoId: VIDEO_ID });
    expect(removed).toBe(2);
    expect(config.categories[0].videos).toHaveLength(1);
    expect(config.categories[0].subCategories[0].videos).toHaveLength(0);
  });

  it('removes from timeCategories.loopVideos (phases de match)', () => {
    const config = {
      timeCategories: [
        {
          loopVideos: [
            { path: 'pre-1.mp4', video_id: VIDEO_ID },
            { path: 'pre-2.mp4' },
          ],
        },
        { loopVideos: [{ path: 'half-1.mp4' }] },
      ],
    };
    const removed = removeVideoFromConfig(config, { videoId: VIDEO_ID });
    expect(removed).toBe(1);
    expect(config.timeCategories[0].loopVideos).toHaveLength(1);
    expect(config.timeCategories[1].loopVideos).toHaveLength(1);
  });

  it('matches by videoId OR filename (OR semantic, not AND)', () => {
    const config = {
      sponsors: [
        { path: 'old-legacy.mp4', /* no video_id */ },  // matches by filename
        { path: 'enriched.mp4', video_id: VIDEO_ID },   // matches by videoId
        { path: 'unrelated.mp4', video_id: 'other' },   // no match
      ],
    };
    const removed = removeVideoFromConfig(config, {
      videoId: VIDEO_ID,
      filename: 'old-legacy.mp4',
    });
    expect(removed).toBe(2);
    expect(config.sponsors).toHaveLength(1);
    expect(config.sponsors[0].path).toBe('unrelated.mp4');
  });

  it('handles empty / missing arrays gracefully', () => {
    expect(removeVideoFromConfig({}, { videoId: VIDEO_ID })).toBe(0);
    expect(removeVideoFromConfig({ sponsors: [] }, { videoId: VIDEO_ID })).toBe(0);
    expect(removeVideoFromConfig({ categories: [{}] }, { videoId: VIDEO_ID })).toBe(0);
  });
});
