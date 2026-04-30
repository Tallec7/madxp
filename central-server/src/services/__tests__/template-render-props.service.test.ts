/**
 * Unit tests — templateRenderPropsService.buildV2
 *
 * Couvre la résolution packshot pluggable + l'hydratation des selectedOptions
 * + le merge des layers/slots avec z_index_offset et appearAt shift.
 *
 * Mock les 2 repositories pour isoler la logique merge sans toucher la DB.
 */

import { templateRenderPropsService } from '../template-render-props.service';

jest.mock('../../repositories', () => ({
  templateStudioRepository: {
    findV2ById: jest.fn(),
  },
  templateOptionsRepository: {
    resolvePackshot: jest.fn(),
  },
}));

import { templateStudioRepository, templateOptionsRepository } from '../../repositories';

const mockedStudio = templateStudioRepository as jest.Mocked<typeof templateStudioRepository>;
const mockedOptions = templateOptionsRepository as jest.Mocked<typeof templateOptionsRepository>;

const baseTemplate = {
  id: 'tpl-parent',
  name: 'Parent',
  description: null,
  schemaVersion: 2 as const,
  compositionId: 'TemplateRuntime',
  durationSeconds: 6,
  fps: 25,
  canvasWidth: 1920,
  canvasHeight: 1080,
  thumbnailUrl: null,
  published: true,
  variants: [{ id: 'v1', templateId: 'tpl-parent', name: 'Default', backgroundVideoUrl: '', thumbnailUrl: null, sortOrder: 0 }],
  layers: [{ id: 'l1', templateId: 'tpl-parent', name: 'A', videoUrl: 'A.webm', zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 6000 }],
  textFields: [],
  imageSlots: [],
  options: [
    { id: 'o1', templateId: 'tpl-parent', key: 'packshot', label: 'Packshot', type: 'enum' as const, values: ['generique', 'img'], defaultValue: 'generique', userEditable: true, sortOrder: 0 },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const packshotTemplate = {
  ...baseTemplate,
  id: 'tpl-packshot',
  name: 'Packshot Generique',
  layers: [{ id: 'pkl1', templateId: 'tpl-packshot', name: 'PG', videoUrl: 'PG.webm', zIndex: 1, mask: { top: 0, bottom: 0, left: 0, right: 0 }, durationMs: 4000 }],
  textFields: [
    { id: 'pkt1', templateId: 'tpl-packshot', slotKey: 'prenom', label: 'Prénom', position: { x: 0.5, y: 0.5 }, maxWidth: 0.8, fontFamily: 'Bulevar', fontSize: 100, color: '#fff', align: 'center' as const, appearAt: 0.5, appearDuration: 0.4, animation: 'fade' as const, defaultValue: '', maxChars: 30, multiline: false, required: true, sortOrder: 0, alwaysVisible: false, scaleFrom: 1, scaleTo: 1, layerId: null, respectAlpha: false, animationDirection: 'in' as const, textTransform: 'none' as const, visibleIf: null },
  ],
  imageSlots: [],
  options: [],
};

describe('templateRenderPropsService.buildV2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retourne null si template introuvable / pas v2', async () => {
    mockedStudio.findV2ById.mockResolvedValueOnce(null);
    const result = await templateRenderPropsService.buildV2('tpl-x', { variantId: 'v1' });
    expect(result).toBeNull();
  });

  it('hydrate selectedOptions avec defaultValue si client en oublie', async () => {
    mockedStudio.findV2ById.mockResolvedValueOnce(baseTemplate);
    mockedOptions.resolvePackshot.mockResolvedValueOnce(null);

    const result = await templateRenderPropsService.buildV2('tpl-parent', { variantId: 'v1' });
    expect(result?.selectedOptions).toEqual({ packshot: 'generique' });
  });

  it('respecte les selectedOptions du client (override default)', async () => {
    mockedStudio.findV2ById.mockResolvedValueOnce(baseTemplate);
    mockedOptions.resolvePackshot.mockResolvedValueOnce(null);

    const result = await templateRenderPropsService.buildV2('tpl-parent', {
      variantId: 'v1',
      selectedOptions: { packshot: 'img' },
    });
    expect(result?.selectedOptions).toEqual({ packshot: 'img' });
  });

  it('sans packshot ref → propage layers/slots du template parent uniquement', async () => {
    mockedStudio.findV2ById.mockResolvedValueOnce(baseTemplate);
    mockedOptions.resolvePackshot.mockResolvedValueOnce(null);

    const result = await templateRenderPropsService.buildV2('tpl-parent', { variantId: 'v1' });
    expect(result?.resolvedPackshotTemplateId).toBeNull();
    expect(result?.layers).toHaveLength(1);
    expect(result?.layers[0].videoUrl).toBe('A.webm');
    expect(result?.textFields).toHaveLength(0);
  });

  it('avec packshot ref → merge layers (z+offset) + slots (appearAt shifté)', async () => {
    mockedStudio.findV2ById
      .mockResolvedValueOnce(baseTemplate) // appel parent
      .mockResolvedValueOnce(packshotTemplate); // appel packshot
    mockedOptions.resolvePackshot.mockResolvedValueOnce({
      id: 'ref1',
      template_id: 'tpl-parent',
      option_key: 'packshot',
      option_value: 'generique',
      packshot_template_id: 'tpl-packshot',
      start_at_ms: 2000,
      z_index_offset: 100,
      created_at: new Date(),
    });

    const result = await templateRenderPropsService.buildV2('tpl-parent', { variantId: 'v1' });

    expect(result?.resolvedPackshotTemplateId).toBe('tpl-packshot');
    // layers : 1 parent + 1 packshot avec z décalé de 100
    expect(result?.layers).toHaveLength(2);
    expect(result?.layers[0].zIndex).toBe(1); // parent inchangé
    expect(result?.layers[1].zIndex).toBe(101); // packshot z=1 + offset=100
    // textField packshot : appearAt 0.5 + 2000ms / 1000 = 2.5
    expect(result?.textFields).toHaveLength(1);
    expect(result?.textFields[0].appearAt).toBe(2.5);
  });

  it('packshot template manquant → log warn + pas de merge (graceful)', async () => {
    mockedStudio.findV2ById
      .mockResolvedValueOnce(baseTemplate)
      .mockResolvedValueOnce(null);
    mockedOptions.resolvePackshot.mockResolvedValueOnce({
      id: 'ref1',
      template_id: 'tpl-parent',
      option_key: 'packshot',
      option_value: 'generique',
      packshot_template_id: 'tpl-missing',
      start_at_ms: 0,
      z_index_offset: 100,
      created_at: new Date(),
    });

    const result = await templateRenderPropsService.buildV2('tpl-parent', { variantId: 'v1' });
    expect(result?.resolvedPackshotTemplateId).toBeNull();
    expect(result?.layers).toHaveLength(1); // pas de merge
  });

  it('default values pour textValues + imageUploads si non fournis', async () => {
    mockedStudio.findV2ById.mockResolvedValueOnce(baseTemplate);
    mockedOptions.resolvePackshot.mockResolvedValueOnce(null);

    const result = await templateRenderPropsService.buildV2('tpl-parent', { variantId: 'v1' });
    expect(result?.textValues).toEqual({});
    expect(result?.imageUploads).toEqual({});
  });
});
