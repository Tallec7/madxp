/**
 * Tests unitaires pour le service de brouillons de configuration
 *
 * Ce service gère:
 * - La création/mise à jour de brouillons de configuration
 * - La validation des brouillons (vidéos manquantes)
 * - L'extraction des vidéos à déployer
 *
 * @module draft.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-draft-1234'),
}));

// Import after mocks
import draftService from './draft.service';

describe('DraftService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // getDraft
  // ============================================
  describe('getDraft', () => {
    it('should return null if no draft exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.getDraft('site-123');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM config_drafts'),
        ['site-123']
      );
    });

    it('should return draft if exists', async () => {
      const mockDraftRow = {
        id: 'draft-123',
        site_id: 'site-123',
        name: 'Test Draft',
        configuration: JSON.stringify({ sponsors: [] }),
        referenced_video_ids: ['video-1', 'video-2'],
        status: 'draft',
        created_by: 'user-123',
        updated_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockDraftRow] });

      const result = await draftService.getDraft('site-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('draft-123');
      expect(result?.name).toBe('Test Draft');
      expect(result?.configuration).toEqual({ sponsors: [] });
    });

    it('should parse configuration if stored as string', async () => {
      const mockDraftRow = {
        id: 'draft-123',
        site_id: 'site-123',
        name: 'Test Draft',
        configuration: '{"sponsors":[{"name":"Sponsor A"}]}',
        referenced_video_ids: [],
        status: 'draft',
        created_by: 'user-123',
        updated_by: 'user-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockDraftRow] });

      const result = await draftService.getDraft('site-123');

      expect(result?.configuration).toEqual({ sponsors: [{ name: 'Sponsor A' }] });
    });
  });

  // ============================================
  // createOrUpdateDraft
  // ============================================
  describe('createOrUpdateDraft', () => {
    const mockConfig = {
      sponsors: [{ name: 'Sponsor A', path: 'videos/sponsor_a.mp4' }],
    };

    it('should create new draft if none exists', async () => {
      // getDraft returns null
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'video-1', filename: 'sponsor_a.mp4', storage_path: 'uploads/sponsor_a.mp4' },
        ],
      });
      // INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'mock-uuid-draft-1234',
          site_id: 'site-123',
          name: 'New Draft',
          configuration: mockConfig,
          referenced_video_ids: ['video-1'],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await draftService.createOrUpdateDraft(
        'site-123',
        'New Draft',
        mockConfig as any,
        'user-123'
      );

      expect(result.id).toBe('mock-uuid-draft-1234');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO config_drafts'),
        expect.arrayContaining(['mock-uuid-draft-1234', 'site-123', 'New Draft'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Draft created', expect.any(Object));
    });

    it('should update existing draft', async () => {
      // getDraft returns existing
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'existing-draft-123',
          site_id: 'site-123',
          name: 'Old Draft',
          configuration: {},
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'existing-draft-123',
          site_id: 'site-123',
          name: 'Updated Draft',
          configuration: mockConfig,
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-456',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await draftService.createOrUpdateDraft(
        'site-123',
        'Updated Draft',
        mockConfig as any,
        'user-456'
      );

      expect(result.name).toBe('Updated Draft');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE config_drafts'),
        expect.arrayContaining(['Updated Draft', 'user-456', 'site-123'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Draft updated', expect.any(Object));
    });

    it('should extract referenced video IDs from configuration', async () => {
      const configWithVideos = {
        sponsors: [
          { name: 'Sponsor A', path: 'videos/sponsor_a.mp4' },
          { name: 'Sponsor B', path: 'videos/sponsor_b.mp4' },
        ],
        categories: [
          {
            name: 'Category 1',
            videos: [{ name: 'Video 1', path: 'videos/video1.mp4' }],
          },
        ],
      };

      // getDraft returns null
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'vid-1', filename: 'sponsor_a.mp4', storage_path: 'uploads/sponsor_a.mp4' },
          { id: 'vid-2', filename: 'sponsor_b.mp4', storage_path: 'uploads/sponsor_b.mp4' },
          { id: 'vid-3', filename: 'video1.mp4', storage_path: 'uploads/video1.mp4' },
        ],
      });
      // INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'mock-uuid-draft-1234',
          site_id: 'site-123',
          name: 'Draft',
          configuration: configWithVideos,
          referenced_video_ids: ['vid-1', 'vid-2', 'vid-3'],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      await draftService.createOrUpdateDraft(
        'site-123',
        'Draft',
        configWithVideos as any,
        'user-123'
      );

      // Verify the INSERT was called with referenced_video_ids
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        expect.arrayContaining([
          expect.arrayContaining(['vid-1', 'vid-2', 'vid-3']),
        ])
      );
    });
  });

  // ============================================
  // deleteDraft
  // ============================================
  describe('deleteDraft', () => {
    it('should return true if draft was deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await draftService.deleteDraft('site-123');

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Draft deleted', { siteId: 'site-123' });
    });

    it('should return false if no draft existed', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await draftService.deleteDraft('site-123');

      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should handle null rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null });

      const result = await draftService.deleteDraft('site-123');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // updateDraftStatus
  // ============================================
  describe('updateDraftStatus', () => {
    it('should update draft status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await draftService.updateDraftStatus('site-123', 'deploying');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE config_drafts SET status'),
        ['deploying', 'site-123']
      );
    });

    it('should accept all valid statuses', async () => {
      const statuses: Array<'draft' | 'deploying' | 'deployed' | 'failed'> = [
        'draft',
        'deploying',
        'deployed',
        'failed',
      ];

      for (const status of statuses) {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await draftService.updateDraftStatus('site-123', status);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          [status, 'site-123']
        );
      }
    });
  });

  // ============================================
  // validateDraft
  // ============================================
  describe('validateDraft', () => {
    it('should return invalid result if no draft exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      expect(result.valid).toBe(false);
      expect(result.missingVideos).toEqual([]);
      expect(result.videosToDeploy).toEqual([]);
    });

    it('should return valid if all videos are on Pi', async () => {
      // getDraft
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [{ name: 'A', path: 'videos/a.mp4' }],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite local_config_mirror
      mockQuery.mockResolvedValueOnce({
        rows: [{
          local_config_mirror: {
            _localVideos: [{ filename: 'a.mp4', path: 'videos/a.mp4' }],
          },
        }],
      });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      expect(result.valid).toBe(true);
      expect(result.missingVideos).toHaveLength(0);
      expect(result.videosToDeploy).toHaveLength(0);
    });

    it('should detect videos in cloud but not on Pi', async () => {
      // getDraft
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [
              { name: 'A', path: 'videos/a.mp4' },
              { name: 'B', path: 'videos/b.mp4' },
            ],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite - only a.mp4 on Pi
      mockQuery.mockResolvedValueOnce({
        rows: [{
          local_config_mirror: {
            _localVideos: [{ filename: 'a.mp4', path: 'videos/a.mp4' }],
          },
        }],
      });
      // getCloudVideos - b.mp4 in cloud
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'cloud-b', filename: 'b.mp4', storage_path: 'uploads/b.mp4' },
        ],
      });

      const result = await draftService.validateDraft('site-123');

      expect(result.valid).toBe(true); // valid because b.mp4 is in cloud
      expect(result.missingVideos).toHaveLength(1);
      expect(result.missingVideos[0]).toEqual({
        videoId: 'cloud-b',
        filename: 'b.mp4',
        path: 'videos/b.mp4',
        isInCloud: true,
        isOnPi: false,
      });
      expect(result.videosToDeploy).toEqual(['cloud-b']);
    });

    it('should detect videos missing from both Pi and cloud', async () => {
      // getDraft
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [{ name: 'Missing', path: 'videos/missing.mp4' }],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite - empty Pi
      mockQuery.mockResolvedValueOnce({
        rows: [{ local_config_mirror: { _localVideos: [] } }],
      });
      // getCloudVideos - empty cloud
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      expect(result.valid).toBe(false); // invalid because video doesn't exist anywhere
      expect(result.missingVideos).toHaveLength(1);
      expect(result.missingVideos[0]).toEqual({
        videoId: null,
        filename: 'missing.mp4',
        path: 'videos/missing.mp4',
        isInCloud: false,
        isOnPi: false,
      });
      expect(result.videosToDeploy).toEqual([]);
    });

    it('should handle case-insensitive filename matching', async () => {
      // getDraft
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [{ name: 'A', path: 'videos/Video_A.MP4' }],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite - lowercase on Pi
      mockQuery.mockResolvedValueOnce({
        rows: [{
          local_config_mirror: {
            _localVideos: [{ filename: 'video_a.mp4', path: 'videos/video_a.mp4' }],
          },
        }],
      });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      expect(result.valid).toBe(true);
      expect(result.missingVideos).toHaveLength(0);
    });

    it('should deduplicate videosToDeploy', async () => {
      // getDraft with same video referenced multiple times
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [
              { name: 'A', path: 'videos/same.mp4' },
              { name: 'B', path: 'videos/same.mp4' }, // duplicate
            ],
            timeCategories: [
              { id: 'before', loopVideos: [{ name: 'C', path: 'videos/same.mp4' }] }, // another duplicate
            ],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite - empty Pi
      mockQuery.mockResolvedValueOnce({
        rows: [{ local_config_mirror: { _localVideos: [] } }],
      });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'video-same', filename: 'same.mp4', storage_path: 'uploads/same.mp4' }],
      });

      const result = await draftService.validateDraft('site-123');

      // Should only have one entry in videosToDeploy despite 3 references
      expect(result.videosToDeploy).toEqual(['video-same']);
    });
  });

  // ============================================
  // getVideosToDeployForDraft
  // ============================================
  describe('getVideosToDeployForDraft', () => {
    it('should return empty array if no videos to deploy', async () => {
      // validateDraft mocks (getDraft returns null)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.getVideosToDeployForDraft('site-123');

      expect(result).toEqual([]);
    });

    it('should return video objects for videos to deploy', async () => {
      // getDraft
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [{ name: 'A', path: 'videos/a.mp4' }],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      // getSite - empty Pi
      mockQuery.mockResolvedValueOnce({
        rows: [{ local_config_mirror: { _localVideos: [] } }],
      });
      // getCloudVideos
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'video-a', filename: 'a.mp4', storage_path: 'uploads/a.mp4' }],
      });
      // SELECT videos
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'video-a',
          filename: 'a.mp4',
          original_name: 'Video A.mp4',
          category: 'sponsors',
          subcategory: null,
          file_size: 1000000,
          duration: 30,
          mime_type: 'video/mp4',
          storage_path: 'uploads/a.mp4',
          thumbnail_url: null,
          metadata: {},
          uploaded_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });

      const result = await draftService.getVideosToDeployForDraft('site-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('video-a');
      expect(result[0].filename).toBe('a.mp4');
    });
  });

  // ============================================
  // extractVideoPaths (private, tested indirectly)
  // ============================================
  describe('extractVideoPaths (via validateDraft)', () => {
    it('should extract paths from sponsors', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            sponsors: [
              { name: 'A', path: 'videos/SPONSORS/a.mp4' },
              { name: 'B', path: 'videos/SPONSORS/b.mp4' },
            ],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ local_config_mirror: {} }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      expect(result.missingVideos.map(v => v.filename)).toContain('a.mp4');
      expect(result.missingVideos.map(v => v.filename)).toContain('b.mp4');
    });

    it('should extract paths from categories and subcategories', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            categories: [
              {
                name: 'Cat1',
                videos: [{ name: 'V1', path: 'videos/cat1.mp4' }],
                subCategories: [
                  {
                    name: 'SubCat1',
                    videos: [{ name: 'V2', path: 'videos/subcat1.mp4' }],
                  },
                ],
              },
            ],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ local_config_mirror: {} }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      const filenames = result.missingVideos.map(v => v.filename);
      expect(filenames).toContain('cat1.mp4');
      expect(filenames).toContain('subcat1.mp4');
    });

    it('should extract paths from timeCategories', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'draft-123',
          site_id: 'site-123',
          name: 'Test',
          configuration: JSON.stringify({
            timeCategories: [
              {
                id: 'before',
                name: 'Avant-match',
                loopVideos: [
                  { name: 'Before1', path: 'videos/before1.mp4' },
                  { name: 'Before2', path: 'videos/before2.mp4' },
                ],
              },
              {
                id: 'during',
                name: 'Pendant',
                loopVideos: [
                  { name: 'During1', path: 'videos/during1.mp4' },
                ],
              },
            ],
          }),
          referenced_video_ids: [],
          status: 'draft',
          created_by: 'user-123',
          updated_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ local_config_mirror: {} }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await draftService.validateDraft('site-123');

      const filenames = result.missingVideos.map(v => v.filename);
      expect(filenames).toContain('before1.mp4');
      expect(filenames).toContain('before2.mp4');
      expect(filenames).toContain('during1.mp4');
    });
  });

  // ============================================
  // Error handling
  // ============================================
  describe('Error handling', () => {
    it('should propagate database errors in getDraft', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(draftService.getDraft('site-123')).rejects.toThrow('Database connection failed');
    });

    it('should propagate database errors in createOrUpdateDraft', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // getDraft
      mockQuery.mockRejectedValueOnce(new Error('Database error')); // getCloudVideos

      await expect(
        draftService.createOrUpdateDraft('site-123', 'Test', {} as any, 'user-123')
      ).rejects.toThrow('Database error');
    });

    it('should propagate database errors in deleteDraft', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(draftService.deleteDraft('site-123')).rejects.toThrow('Delete failed');
    });
  });
});
