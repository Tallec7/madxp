/**
 * Tests for helpers.js - shared utility functions
 */

const {
  sanitizeSegment,
  sanitizeFilename,
  formatUptime,
  parseDiskInfo,
  extractPathSegments,
  buildDisplayNameFromFilename,
  resolveDisplayName,
  guessMimeFromExtension,
  createVideoEntry,
  isLocked,
  canModifyCategory,
  canModifyVideo,
  findInConfig,
  shellEscape,
} = require('../helpers');

// =============================================================================
// sanitizeSegment
// =============================================================================

describe('sanitizeSegment', () => {
  it('should return fallback for null/undefined/empty', () => {
    expect(sanitizeSegment(null, 'FALLBACK')).toBe('FALLBACK');
    expect(sanitizeSegment(undefined, 'FALLBACK')).toBe('FALLBACK');
    expect(sanitizeSegment('', 'FALLBACK')).toBe('FALLBACK');
    expect(sanitizeSegment('   ', 'FALLBACK')).toBe('FALLBACK');
  });

  it('should uppercase and replace non-alphanumeric with underscores', () => {
    expect(sanitizeSegment('hello world', null)).toBe('HELLO_WORLD');
    expect(sanitizeSegment('foo-bar_baz', null)).toBe('FOO_BAR_BAZ');
    expect(sanitizeSegment('CàféLàtté', null)).toBe('C_F_L_TT_');
  });

  it('should collapse multiple underscores', () => {
    expect(sanitizeSegment('a---b___c', null)).toBe('A_B_C');
  });
});

// =============================================================================
// sanitizeFilename
// =============================================================================

describe('sanitizeFilename', () => {
  it('should return fallback for null/undefined/empty', () => {
    expect(sanitizeFilename(null, 'default.mp4')).toBe('default.mp4');
    expect(sanitizeFilename('', 'default.mp4')).toBe('default.mp4');
  });

  it('should lowercase and keep safe characters', () => {
    expect(sanitizeFilename('MyVideo.MP4', null)).toBe('myvideo.mp4');
    expect(sanitizeFilename('file-name_v2.mkv', null)).toBe('file-name_v2.mkv');
  });

  it('should replace unsafe characters with underscores and collapse consecutive', () => {
    // space and ( are both replaced by _, then _+ collapses to single _
    expect(sanitizeFilename('my video (1).mp4', null)).toBe('my_video_1_.mp4');
  });
});

// =============================================================================
// formatUptime
// =============================================================================

describe('formatUptime', () => {
  it('should format seconds only', () => {
    expect(formatUptime(30)).toBe('0m');
  });

  it('should format minutes', () => {
    expect(formatUptime(300)).toBe('5m');
  });

  it('should format hours and minutes', () => {
    expect(formatUptime(3660)).toBe('1h 1m');
  });

  it('should format days, hours and minutes', () => {
    expect(formatUptime(90061)).toBe('1j 1h 1m');
  });
});

// =============================================================================
// parseDiskInfo
// =============================================================================

describe('parseDiskInfo', () => {
  it('should parse df output', () => {
    const output = '/dev/root       15G  8.2G  5.8G  59% /';
    const result = parseDiskInfo(output);
    expect(result).toEqual({
      total: '15G',
      used: '8.2G',
      available: '5.8G',
      percent: '59%',
    });
  });
});

// =============================================================================
// extractPathSegments
// =============================================================================

describe('extractPathSegments', () => {
  it('should return null for falsy input', () => {
    expect(extractPathSegments(null)).toBeNull();
    expect(extractPathSegments('')).toBeNull();
  });

  it('should extract category and second segment as subcategory', () => {
    // extractPathSegments treats the second segment as subcategory regardless of content
    expect(extractPathSegments('FOOTBALL/video.mp4')).toEqual({
      category: 'FOOTBALL',
      subcategory: 'video.mp4',
    });
  });

  it('should extract category and subcategory with videos/ prefix', () => {
    expect(extractPathSegments('videos/FOOTBALL/JUNIORS/video.mp4')).toEqual({
      category: 'FOOTBALL',
      subcategory: 'JUNIORS',
    });
  });

  it('should strip videos/ prefix and still extract subcategory', () => {
    expect(extractPathSegments('videos/HANDBALL/clip.mp4')).toEqual({
      category: 'HANDBALL',
      subcategory: 'clip.mp4',
    });
  });

  it('should return null subcategory for single-segment path', () => {
    expect(extractPathSegments('FOOTBALL')).toEqual({
      category: 'FOOTBALL',
      subcategory: null,
    });
  });
});

// =============================================================================
// buildDisplayNameFromFilename
// =============================================================================

describe('buildDisplayNameFromFilename', () => {
  it('should remove extension and replace separators', () => {
    expect(buildDisplayNameFromFilename('my-awesome_video.mp4')).toBe('my awesome video');
  });

  it('should handle multiple separators', () => {
    expect(buildDisplayNameFromFilename('clip__2024---final.mkv')).toBe('clip 2024 final');
  });
});

// =============================================================================
// resolveDisplayName
// =============================================================================

describe('resolveDisplayName', () => {
  it('should use provided name if non-empty', () => {
    expect(resolveDisplayName('file.mp4', 'My Custom Name')).toBe('My Custom Name');
  });

  it('should fall back to filename-derived name', () => {
    expect(resolveDisplayName('awesome-clip.mp4', '')).toBe('awesome clip');
    expect(resolveDisplayName('awesome-clip.mp4', null)).toBe('awesome clip');
  });
});

// =============================================================================
// guessMimeFromExtension
// =============================================================================

describe('guessMimeFromExtension', () => {
  it('should return correct mime for known extensions', () => {
    expect(guessMimeFromExtension('video.mkv')).toBe('video/x-matroska');
    expect(guessMimeFromExtension('video.mov')).toBe('video/quicktime');
    expect(guessMimeFromExtension('video.avi')).toBe('video/x-msvideo');
    expect(guessMimeFromExtension('video.mp4')).toBe('video/mp4');
  });

  it('should default to mp4 for unknown extensions', () => {
    expect(guessMimeFromExtension('video.webm')).toBe('video/mp4');
    expect(guessMimeFromExtension('')).toBe('video/mp4');
  });
});

// =============================================================================
// createVideoEntry
// =============================================================================

describe('createVideoEntry', () => {
  it('should create a proper video entry', () => {
    const entry = createVideoEntry('clip.mp4', 'videos/FOOT/clip.mp4', 'video/mp4', 'My Clip');
    expect(entry).toEqual({
      name: 'My Clip',
      path: 'videos/FOOT/clip.mp4',
      type: 'video/mp4',
    });
  });

  it('should derive name from filename when displayName is empty', () => {
    const entry = createVideoEntry('awesome-goal.mp4', 'path/awesome-goal.mp4', null, '');
    expect(entry.name).toBe('awesome goal');
    expect(entry.type).toBe('video/mp4');
  });
});

// =============================================================================
// isLocked / canModifyCategory / canModifyVideo
// =============================================================================

describe('isLocked', () => {
  it('should detect locked items', () => {
    expect(isLocked({ locked: true })).toBe(true);
    expect(isLocked({ owner: 'neopro' })).toBe(true);
  });

  it('should return false for unlocked items', () => {
    expect(isLocked({ locked: false })).toBe(false);
    expect(isLocked({})).toBe(false);
    expect(isLocked(null)).toBeFalsy();
  });
});

describe('canModifyCategory', () => {
  it('should allow modification of unlocked categories', () => {
    expect(canModifyCategory({ id: 'test' })).toEqual({ allowed: true });
  });

  it('should deny modification of locked categories', () => {
    const result = canModifyCategory({ id: 'test', locked: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe('canModifyVideo', () => {
  it('should allow modification of unlocked videos', () => {
    expect(canModifyVideo({}, {})).toEqual({ allowed: true });
  });

  it('should deny if video is locked', () => {
    expect(canModifyVideo({ locked: true }, {}).allowed).toBe(false);
  });

  it('should deny if parent category is locked', () => {
    expect(canModifyVideo({}, { locked: true }).allowed).toBe(false);
  });

  it('should deny if parent subcategory is locked', () => {
    expect(canModifyVideo({}, {}, { locked: true }).allowed).toBe(false);
  });
});

// =============================================================================
// findInConfig
// =============================================================================

describe('findInConfig', () => {
  const config = {
    categories: [
      {
        id: 'football',
        name: 'Football',
        videos: [{ path: 'videos/FOOT/clip.mp4' }],
        subCategories: [
          {
            id: 'juniors',
            name: 'Juniors',
            videos: [{ path: 'videos/FOOT/JUNIORS/goal.mp4' }],
          },
        ],
      },
    ],
  };

  it('should find a category by id', () => {
    const result = findInConfig(config, 'football');
    expect(result.category).toBeDefined();
    expect(result.category.id).toBe('football');
  });

  it('should return null for unknown category', () => {
    const result = findInConfig(config, 'unknown');
    expect(result.category).toBeNull();
  });

  it('should find subcategory', () => {
    const result = findInConfig(config, 'football', 'juniors');
    expect(result.subcategory).toBeDefined();
    expect(result.subcategory.id).toBe('juniors');
  });

  it('should find a video by path', () => {
    const result = findInConfig(config, 'football', null, 'videos/FOOT/clip.mp4');
    expect(result.video).toBeDefined();
    expect(result.video.path).toBe('videos/FOOT/clip.mp4');
  });

  it('should find a video in a subcategory', () => {
    const result = findInConfig(config, 'football', 'juniors', 'videos/FOOT/JUNIORS/goal.mp4');
    expect(result.video).toBeDefined();
    expect(result.video.path).toBe('videos/FOOT/JUNIORS/goal.mp4');
  });
});

// =============================================================================
// shellEscape
// =============================================================================

describe('shellEscape', () => {
  it('should wrap simple values in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  it('should escape embedded single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('should handle empty/null input', () => {
    expect(shellEscape('')).toBe("''");
    expect(shellEscape(null)).toBe("''");
  });

  it('should handle shell metacharacters safely', () => {
    const escaped = shellEscape('"; rm -rf / #');
    expect(escaped).toBe("'\"; rm -rf / #'");
  });
});
