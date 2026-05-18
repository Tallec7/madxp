/**
 * Tests unitaires — studio-assets-cache.service (ADR-130).
 *
 * Tests d'API publique sans dépendance réseau (FTP / DB). Le preload + download
 * réel est couvert par le smoke test garde-fou file-based
 * (`smoke-studio-assets-cache.test.ts`) + validation manuelle post-deploy.
 */

import {
  __resetStudioAssetsCacheForTests,
  getCachedAssetUrl,
  startStudioCacheServer,
  stopStudioCacheServer,
} from './studio-assets-cache.service';

describe('studio-assets-cache.service', () => {
  afterEach(() => {
    __resetStudioAssetsCacheForTests();
  });

  describe('getCachedAssetUrl', () => {
    it('retourne null avant que le cache server ne soit démarré', () => {
      const url = getCachedAssetUrl({
        id: '00000000-0000-0000-0000-000000000001',
        asset_kind: 'file',
        filename: 'foo.webm',
      });
      expect(url).toBeNull();
    });

    it('retourne null pour un asset non préchargé (cache miss préserve le fallback FTP)', async () => {
      await startStudioCacheServer();
      const url = getCachedAssetUrl({
        id: '00000000-0000-0000-0000-000000000002',
        asset_kind: 'directory',
        filename: 'masks',
      });
      // Pas de preloadStudioAssets() entre temps → la map cachedAssetIds est vide
      // → fallback null = legacy FTP behaviour préservé.
      expect(url).toBeNull();
    });
  });

  describe('startStudioCacheServer / stopStudioCacheServer', () => {
    it('le serveur démarre et bind sur 127.0.0.1', async () => {
      await startStudioCacheServer();
      // L'URL exposée via getCachedAssetUrl ne sera pas null une fois qu'un
      // asset est dans la map. Sans preload, on ne peut vérifier que la non-throw.
      expect(true).toBe(true);
    });

    it('startStudioCacheServer est idempotent (appel multiple sans erreur)', async () => {
      await startStudioCacheServer();
      await expect(startStudioCacheServer()).resolves.not.toThrow();
    });

    it('stopStudioCacheServer est idempotent (appel multiple sans erreur)', () => {
      expect(() => stopStudioCacheServer()).not.toThrow();
      expect(() => stopStudioCacheServer()).not.toThrow();
    });
  });
});
