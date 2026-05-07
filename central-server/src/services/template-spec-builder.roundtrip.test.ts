/**
 * Round-trip — DB fixture → buildSpecMarkdown → parse YAML → assert structure
 * matches the contract consumed by `scripts/import-template-spec.ts`.
 *
 * `extractFrontmatter` is re-implemented locally (instead of imported from
 * the CLI script) because `import-template-spec.ts` runs `main()` at import
 * time (top-level side-effect) which would crash inside Jest.
 */

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

import { templateStudioRepository } from '../repositories/template-studio.repository';
import { templateSpecBuilderService } from './template-spec-builder.service';
import { parse as parseYaml } from 'yaml';

const repo = templateStudioRepository as jest.Mocked<typeof templateStudioRepository>;

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('frontmatter not found');
  return match[1];
}

describe('template-spec-builder roundtrip (DB → SPEC.md → parse)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    repo.findV2ById.mockResolvedValue({
      id: 't1',
      compositionId: 'joueur-test',
      name: 'Joueur Test',
      description: 'desc',
      schemaVersion: 2,
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
    });

    repo.listLayers.mockResolvedValue([
      {
        id: 'L1',
        templateId: 't1',
        name: 'Logo',
        videoUrl: 'https://ftp/01.webm',
        zIndex: 1,
        mask: { top: 0, bottom: 0, left: 0, right: 0 },
        durationMs: 1200,
      },
      {
        id: 'L2',
        templateId: 't1',
        name: 'Trans',
        videoUrl: 'https://ftp/02.webm',
        zIndex: 2,
        mask: { top: 0, bottom: 0, left: 0, right: 0 },
        durationMs: 600,
      },
      {
        id: 'L3',
        templateId: 't1',
        name: 'Titre',
        videoUrl: 'https://ftp/03.webm',
        zIndex: 3,
        mask: { top: 0, bottom: 0, left: 0, right: 0 },
        durationMs: 2000,
      },
    ]);

    repo.listTextFields.mockResolvedValue([
      {
        id: 'T1',
        templateId: 't1',
        slotKey: 'titre',
        label: 'titre',
        position: { x: 0.5, y: 0.5 },
        maxWidth: 0.8,
        fontFamily: 'Bulevar',
        fontSize: 120,
        color: '#FFFFFF',
        align: 'center',
        appearAt: 0,
        appearDuration: 0.8,
        animation: 'zoom',
        defaultValue: 'Titre',
        maxChars: null,
        multiline: false,
        required: true,
        sortOrder: 0,
        alwaysVisible: false,
        scaleFrom: 1.0,
        scaleTo: 1.3,
        layerId: 'L3',
        respectAlpha: true,
        animationDirection: 'out',
        textTransform: 'none',
        visibleIf: null,
      },
      {
        id: 'T2',
        templateId: 't1',
        slotKey: 'nom',
        label: 'nom',
        position: { x: 0.1, y: 0.5 },
        maxWidth: 0.4,
        fontFamily: 'Bulevar',
        fontSize: 80,
        color: '#FFFFFF',
        align: 'left',
        appearAt: 0,
        appearDuration: 0.4,
        animation: 'fade',
        defaultValue: 'Nom',
        maxChars: null,
        multiline: false,
        required: true,
        sortOrder: 1,
        alwaysVisible: false,
        scaleFrom: 1,
        scaleTo: 1,
        layerId: 'L3',
        respectAlpha: false,
        animationDirection: 'in',
        textTransform: 'none',
        visibleIf: null,
      },
    ]);

    repo.listImageSlots.mockResolvedValue([
      {
        id: 'I1',
        templateId: 't1',
        slotKey: 'logo',
        label: 'logo',
        position: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
        appearAt: 0,
        appearDuration: 0.4,
        animation: 'none',
        aspectRatio: null,
        required: true,
        sortOrder: 0,
        layerId: 'L1',
        anchor: 'center',
        fitMode: 'contain',
        safeTopPct: null,
        safeLeftPct: null,
        safeWidthPct: null,
        safeHeightPct: null,
        overflow: 'hidden',
        animationDirection: 'in',
        scaleFrom: null,
        scaleTo: null,
        visibleIf: null,
      },
    ]);

    repo.listVariants.mockResolvedValue([
      {
        id: 'V1',
        templateId: 't1',
        name: 'Default',
        backgroundVideoUrl: '',
        thumbnailUrl: null,
        sortOrder: 0,
      },
    ]);
  });

  it('produces a SPEC.md re-importable by template:import parser', async () => {
    const { content, filename } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    expect(filename).toBe('joueur-test-spec.md');

    const fm = extractFrontmatter(content);
    const parsed = parseYaml(fm) as {
      template: { slug: string; canvas: { width: number; height: number } };
      layers: Array<{ key: string; duration_ms: number }>;
      slots: Array<{ key: string; layer: string; position: { x: number; y: number } }>;
      variants: Array<{ slug: string; is_default: boolean }>;
    };

    // Template
    expect(parsed.template.slug).toBe('joueur-test');
    expect(parsed.template.canvas.width).toBe(1920);

    // Layers — 3, sorted by z_index ASC, keys A/B/C
    expect(parsed.layers).toHaveLength(3);
    expect(parsed.layers[0].key).toBe('A');
    expect(parsed.layers[0].duration_ms).toBe(1200);
    expect(parsed.layers[1].key).toBe('B');
    expect(parsed.layers[1].duration_ms).toBe(600);
    expect(parsed.layers[2].key).toBe('C');
    expect(parsed.layers[2].duration_ms).toBe(2000);

    // Slots — 2 text + 1 image = 3
    expect(parsed.slots).toHaveLength(3);
    const titre = parsed.slots.find((s) => s.key === 'titre');
    expect(titre).toBeDefined();
    expect(titre?.position.x).toBe(50);
    expect(titre?.position.y).toBe(50);
    expect(titre?.layer).toBe('C');

    const logo = parsed.slots.find((s) => s.key === 'logo');
    expect(logo?.layer).toBe('A');

    // Variants — 1, default flagged
    expect(parsed.variants).toHaveLength(1);
    expect(parsed.variants[0].is_default).toBe(true);
    expect(parsed.variants[0].slug).toBe('default');
  });

  it('output passes the same shape checks the CLI parser performs', async () => {
    const { content } = await templateSpecBuilderService.buildSpecMarkdown('t1');
    const parsed = parseYaml(extractFrontmatter(content)) as Record<string, unknown>;

    // Mirror of `validate()` in import-template-spec.ts
    const t = parsed['template'] as { slug?: unknown; name?: unknown; canvas?: Record<string, unknown> };
    expect(typeof t.slug).toBe('string');
    expect(typeof t.name).toBe('string');
    expect(typeof t.canvas?.['width']).toBe('number');
    expect(typeof t.canvas?.['height']).toBe('number');
    expect(typeof t.canvas?.['fps']).toBe('number');
    expect(Array.isArray(parsed['layers'])).toBe(true);
    expect((parsed['layers'] as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(parsed['slots'])).toBe(true);
    expect(Array.isArray(parsed['variants'])).toBe(true);
    expect((parsed['variants'] as unknown[]).length).toBeGreaterThan(0);
  });
});
