/**
 * Unit tests — template-spec-builder.service.ts
 * Audit P1 #5 / Quick task 260507-ong.
 *
 * Mocks the templateStudioRepository and asserts the builder produces a
 * SPEC.md frontmatter + body matching docs/templates/SPEC-TEMPLATE.md.
 */

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../repositories/template-studio.repository', () => ({
  templateStudioRepository: {
    findV2ById: jest.fn(),
    listLayers: jest.fn(),
    listTextFields: jest.fn(),
    listImageSlots: jest.fn(),
    listVariants: jest.fn(),
  },
}));

import logger from '../config/logger';
import { templateStudioRepository } from '../repositories/template-studio.repository';
import { templateSpecBuilderService } from './template-spec-builder.service';

const mockRepo = templateStudioRepository as jest.Mocked<typeof templateStudioRepository>;

const baseTemplate = {
  id: 't1',
  compositionId: 'joueur-detaille',
  name: 'Joueur détaillé',
  description: 'Clip annonce joueur',
  schemaVersion: 2 as const,
  durationSeconds: 6,
  fps: 30,
  canvasWidth: 1920,
  canvasHeight: 1080,
  thumbnailUrl: null,
  published: false,
  variants: [],
  layers: [],
  textFields: [],
  imageSlots: [],
  options: [],
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
};

const baseLayer = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'L1',
  templateId: 't1',
  name: 'Layer A',
  videoUrl: 'https://ftp/01.webm',
  zIndex: 1,
  mask: { top: 0, bottom: 0, left: 0, right: 0 },
  durationMs: 1200,
  ...over,
});

const baseText = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'T1',
  templateId: 't1',
  slotKey: 'titre',
  label: 'titre',
  position: { x: 0.5, y: 0.5 },
  maxWidth: 0.8,
  fontFamily: 'Bulevar',
  fontSize: 120,
  color: '#FFFFFF',
  align: 'center' as const,
  appearAt: 0,
  appearDuration: 0.4,
  animation: 'none' as const,
  defaultValue: 'Titre',
  maxChars: null,
  multiline: false,
  required: true,
  sortOrder: 0,
  alwaysVisible: false,
  scaleFrom: 1.0,
  scaleTo: 1.0,
  layerId: 'L1',
  respectAlpha: false,
  animationDirection: 'in' as const,
  textTransform: 'none' as const,
  visibleIf: null,
  ...over,
});

const baseImage = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'I1',
  templateId: 't1',
  slotKey: 'photo',
  label: 'photo',
  position: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
  appearAt: 0,
  appearDuration: 0.4,
  animation: 'none' as const,
  aspectRatio: null,
  required: true,
  sortOrder: 0,
  layerId: 'L1',
  anchor: 'center' as const,
  fitMode: 'contain' as const,
  safeTopPct: null,
  safeLeftPct: null,
  safeWidthPct: null,
  safeHeightPct: null,
  overflow: 'hidden' as const,
  animationDirection: 'in' as const,
  scaleFrom: null,
  scaleTo: null,
  visibleIf: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.findV2ById.mockResolvedValue({ ...baseTemplate });
  mockRepo.listLayers.mockResolvedValue([baseLayer() as never]);
  mockRepo.listTextFields.mockResolvedValue([baseText() as never]);
  mockRepo.listImageSlots.mockResolvedValue([]);
  mockRepo.listVariants.mockResolvedValue([
    { id: 'V1', templateId: 't1', name: 'Default', backgroundVideoUrl: '', thumbnailUrl: null, sortOrder: 0 },
  ]);
});

describe('templateSpecBuilderService.buildSpecMarkdown', () => {
  it('produces a markdown with frontmatter sections (template, layers, slots, variants)', async () => {
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toMatch(/template:\s*\n/);
    expect(content).toMatch(/\n\s*slug:\s*joueur-detaille/);
    expect(content).toMatch(/\nlayers:\s*\n/);
    expect(content).toMatch(/\nslots:\s*\n/);
    expect(content).toMatch(/\nvariants:\s*\n/);
    expect(content).toMatch(/\n---\n/);
    expect(content).toContain('# Template : Joueur détaillé');
    expect(content).toContain('Ré-importable via `npm run template:import`');
  });

  it('multiplies DB position fractions (0..1) by 100 to produce SPEC percentages', async () => {
    mockRepo.listTextFields.mockResolvedValue([
      baseText({ position: { x: 0.5, y: 0.5 } }) as never,
    ]);
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    // YAML position formatted with x: 50 / y: 50
    expect(content).toMatch(/x:\s*50/);
    expect(content).toMatch(/y:\s*50/);
  });

  it('multiplies DB appearDuration (seconds) by 1000 to produce SPEC duration_ms', async () => {
    mockRepo.listTextFields.mockResolvedValue([
      baseText({ animation: 'fade', appearDuration: 0.4 }) as never,
    ]);
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect(content).toMatch(/duration_ms:\s*400/);
  });

  it('emits a safe_zone block when image slot has safeTopPct populated', async () => {
    mockRepo.listImageSlots.mockResolvedValue([
      baseImage({
        safeTopPct: 15,
        safeLeftPct: 55,
        safeWidthPct: 40,
        safeHeightPct: 70,
      }) as never,
    ]);
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect(content).toMatch(/safe_zone:/);
    expect(content).toMatch(/top_pct:\s*15/);
    expect(content).toMatch(/left_pct:\s*55/);
    expect(content).toMatch(/width_pct:\s*40/);
    expect(content).toMatch(/height_pct:\s*70/);
  });

  it('throws "Template not found: <id>" when findV2ById returns null', async () => {
    mockRepo.findV2ById.mockResolvedValue(null);
    await expect(templateSpecBuilderService.buildSpecMarkdown('missing')).rejects.toThrow(
      /Template not found: missing/,
    );
  });

  it('derives layer keys A, B, C... from z_index ASC ordering', async () => {
    mockRepo.listLayers.mockResolvedValue([
      baseLayer({ id: 'Lc', name: 'C', zIndex: 3 }) as never,
      baseLayer({ id: 'La', name: 'A', zIndex: 1 }) as never,
      baseLayer({ id: 'Lb', name: 'B', zIndex: 2 }) as never,
    ]);
    mockRepo.listTextFields.mockResolvedValue([
      baseText({ slotKey: 'titre', layerId: 'Lc' }) as never,
    ]);
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    // Layer with z_index=3 should be referenced as layer: C
    expect(content).toMatch(/key:\s*A\b[\s\S]*key:\s*B\b[\s\S]*key:\s*C\b/);
    expect(content).toMatch(/key:\s*titre[\s\S]*?layer:\s*C/);
  });

  it('produces a filename of "<composition_id>-spec.md"', async () => {
    const { filename } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect(filename).toBe('joueur-detaille-spec.md');
  });

  it('logs Winston info "Building SPEC markdown" with template_id at start', async () => {
    await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect((logger.info as jest.Mock)).toHaveBeenCalledWith(
      'Building SPEC markdown',
      { template_id: 't1' },
    );
  });
});
