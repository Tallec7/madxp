/**
 * Quick task 260507-gxd — Task 2
 * Controller tests for DELETE /api/remotion-templates/:id
 *
 * Pattern : supertest + Express app monté avec les middlewares mockés
 * (auth bypass + role injection) + repositories/services mockés.
 */

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';

// ─── Mocks (must precede the controller import) ───────────────────────────────

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../repositories', () => ({
  remotionTemplatesRepository: {
    findById: jest.fn(),
  },
  remotionTemplateVersionsRepository: {},
  remotionRenderJobRepository: {},
  siteRepository: {},
}));

jest.mock('../../repositories/template-studio.repository', () => ({
  templateStudioRepository: {
    deleteTemplate: jest.fn(),
    getTemplateUsedByCount: jest.fn(),
  },
}));

jest.mock('../../services/metrics.service', () => ({
  metricsService: {
    recordTemplateDeleted: jest.fn(),
    recordTemplateAssetProxyUpstream: jest.fn(),
    recordTemplateStudioOperation: jest.fn(),
  },
}));

jest.mock('../../config/ftp-storage', () => ({
  deleteFileFromFtp: jest.fn(),
}));

// Avoid loading anything heavy from these
jest.mock('../../services/storage.service', () => ({
  uploadAsset: jest.fn(),
  getAssetUrl: jest.fn(),
}));
jest.mock('../../services/thumbnail.service', () => ({ thumbnailService: {} }));
jest.mock('../../services/asset-poster.service', () => ({
  generateAndUploadPoster: jest.fn(),
}));
jest.mock('../../services/template-validation', () => ({ runValidation: jest.fn() }));
jest.mock('../../middleware/require-site-tier', () => ({
  hasFeatureOverride: jest.fn(),
  resolveTierLevel: jest.fn(),
  TIER_LEVEL: {},
}));
jest.mock('../../services/club-template-quota.service', () => ({
  clubTemplateQuotaService: {},
}));
jest.mock('../../services/remotion-render-worker.service', () => ({
  prewarmRemotionBundle: jest.fn(),
}));

import { deleteTemplate } from '../../controllers/remotion-templates.controller';
import { remotionTemplatesRepository } from '../../repositories';
import { templateStudioRepository } from '../../repositories/template-studio.repository';
import { metricsService } from '../../services/metrics.service';
import { deleteFileFromFtp } from '../../config/ftp-storage';

const mockFindById = remotionTemplatesRepository.findById as jest.Mock;
const mockDeleteTemplate = (templateStudioRepository as unknown as {
  deleteTemplate: jest.Mock;
}).deleteTemplate;
const mockGetUsedByCount = (templateStudioRepository as unknown as {
  getTemplateUsedByCount: jest.Mock;
}).getTemplateUsedByCount;
const mockRecordDeleted = metricsService.recordTemplateDeleted as unknown as jest.Mock;
const mockDeleteFtp = deleteFileFromFtp as unknown as jest.Mock;

function buildApp(role: string = 'super_admin') {
  const app = express();
  app.use(express.json());
  // Inject a fake user
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 'u1', role };
    next();
  });
  app.delete('/api/remotion-templates/:id', deleteTemplate);
  return app;
}

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('DELETE /api/remotion-templates/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when template does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await request(buildApp()).delete(`/api/remotion-templates/${VALID_ID}`);
    expect(res.status).toBe(404);
    expect(mockDeleteTemplate).not.toHaveBeenCalled();
  });

  it('returns 409 with code TEMPLATE_IN_USE when published and !force', async () => {
    mockFindById.mockResolvedValue({ id: VALID_ID, name: 'tpl', published: true });
    mockGetUsedByCount.mockResolvedValue(0);

    const res = await request(buildApp()).delete(`/api/remotion-templates/${VALID_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TEMPLATE_IN_USE');
    expect(res.body.published).toBe(true);
    expect(mockDeleteTemplate).not.toHaveBeenCalled();
  });

  it('returns 409 when usedByCount > 0 and !force', async () => {
    mockFindById.mockResolvedValue({ id: VALID_ID, name: 'tpl', published: false });
    mockGetUsedByCount.mockResolvedValue(3);

    const res = await request(buildApp()).delete(`/api/remotion-templates/${VALID_ID}`);
    expect(res.status).toBe(409);
    expect(res.body.usedByCount).toBe(3);
  });

  it('returns 200 + records metric success/user when deleting unpublished unused template', async () => {
    mockFindById.mockResolvedValue({ id: VALID_ID, name: 'tpl', published: false });
    mockGetUsedByCount.mockResolvedValue(0);
    mockDeleteTemplate.mockResolvedValue({
      deleted: true,
      orphanAssetUrls: [],
      cascadeRowCounts: {
        variants: 0,
        layers: 0,
        textFields: 0,
        imageSlots: 0,
        options: 0,
        packshotRefs: 0,
        versions: 0,
      },
    });

    const res = await request(buildApp()).delete(`/api/remotion-templates/${VALID_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.ftpFailures).toBe(0);
    expect(mockRecordDeleted).toHaveBeenCalledWith('success', 'user');
  });

  it('returns 200 + records metric partial/admin_force when force=true and 1 FTP delete fails', async () => {
    mockFindById.mockResolvedValue({ id: VALID_ID, name: 'tpl', published: true });
    mockGetUsedByCount.mockResolvedValue(0);
    mockDeleteTemplate.mockResolvedValue({
      deleted: true,
      orphanAssetUrls: [
        'https://kalonpartners.bzh/neopro-asset/u1.webm',
        'https://kalonpartners.bzh/neopro-asset/u2.webm',
      ],
      cascadeRowCounts: {
        variants: 1,
        layers: 1,
        textFields: 1,
        imageSlots: 0,
        options: 0,
        packshotRefs: 0,
        versions: 0,
      },
    });
    mockDeleteFtp
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('FTP timeout'));

    const res = await request(buildApp()).delete(
      `/api/remotion-templates/${VALID_ID}?force=true`,
    );
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.ftpFailures).toBe(1);
    expect(mockRecordDeleted).toHaveBeenCalledWith('partial', 'admin_force');
  });

  it('returns 500 + records metric failed when repository throws', async () => {
    mockFindById.mockResolvedValue({ id: VALID_ID, name: 'tpl', published: false });
    mockGetUsedByCount.mockResolvedValue(0);
    mockDeleteTemplate.mockRejectedValue(new Error('DB exploded'));

    const res = await request(buildApp()).delete(`/api/remotion-templates/${VALID_ID}`);
    expect(res.status).toBe(500);
    expect(mockRecordDeleted).toHaveBeenCalledWith('failed', 'user');
  });
});
