/**
 * Tests for templates-studio.service — résolveur de bindings.
 *
 * Couvre les 3 sources (input/brandKit/literal) + le transform player.*
 * + les fail-soft (binding inconnu, player absent, brand kit null).
 */

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  resolveBindings,
  type ManifestBindings,
} from './templates-studio.service';
import type { SiteBrandKitRow, PlayerRow } from '../repositories';

const baseBrandKit: SiteBrandKitRow = {
  site_id: 's-1',
  club_name: 'NLF',
  colors_json: { primary: '#0066ff', secondary: '#ffffff', accent: '#ffd400' },
  logos_json: { primary: 'https://kalonpartners.bzh/neopro-video/logos/nlf.png' },
  fonts_json: { display: 'GeneralSans-Bold' },
  sponsors_json: {},
  updated_at: new Date(),
};

const player: PlayerRow = {
  id: 'p-1',
  site_id: 's-1',
  prenom: 'Lise',
  nom: 'Le Prielec',
  numero: 4,
  poste: 'Ailier',
  photo_raw_url: '/raw.jpg',
  photo_cutout_url: 'https://kalonpartners.bzh/neopro-video/players/p-1/cutout.png',
  cutout_status: 'ready',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('resolveBindings — input.* sources', () => {
  it('resolves input.<key> to the raw value', () => {
    const manifest: ManifestBindings = {
      bindings: {
        minute: { source: 'input.minute' },
        label: { source: 'input.label' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: { minute: 42, label: '2MIN' },
      brandKit: null,
    });
    expect(out).toEqual({ minute: 42, label: '2MIN' });
  });

  it('returns null when input key is absent', () => {
    const manifest: ManifestBindings = {
      bindings: { foo: { source: 'input.foo' } },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: null,
    });
    expect(out.foo).toBeNull();
  });
});

describe('resolveBindings — brandKit.* sources', () => {
  it('resolves single-level path (brandKit.clubName)', () => {
    const manifest: ManifestBindings = {
      bindings: { clubName: { source: 'brandKit.clubName' } },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: baseBrandKit,
    });
    expect(out.clubName).toBe('NLF');
  });

  it('resolves nested path (brandKit.colors.primary)', () => {
    const manifest: ManifestBindings = {
      bindings: {
        primaryColor: { source: 'brandKit.colors.primary' },
        clubLogo: { source: 'brandKit.logos.primary' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: baseBrandKit,
    });
    expect(out.primaryColor).toBe('#0066ff');
    expect(out.clubLogo).toBe('https://kalonpartners.bzh/neopro-video/logos/nlf.png');
  });

  it('returns null when brand kit is missing the path', () => {
    const manifest: ManifestBindings = {
      bindings: { unknown: { source: 'brandKit.colors.fuchsia' } },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: baseBrandKit,
    });
    expect(out.unknown).toBeNull();
  });

  it('returns empty object structure when brand kit is null (no row in DB yet)', () => {
    const manifest: ManifestBindings = {
      bindings: {
        primaryColor: { source: 'brandKit.colors.primary' },
        clubName: { source: 'brandKit.clubName' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: null,
    });
    expect(out.primaryColor).toBeNull();
    expect(out.clubName).toBeNull();
  });
});

describe('resolveBindings — player.* transforms', () => {
  it('applies fullName / number / cutoutUrl / poste transforms', () => {
    const manifest: ManifestBindings = {
      bindings: {
        scorerName: { source: 'input.scorerPlayerId', transform: 'player.fullName' },
        scorerNumber: { source: 'input.scorerPlayerId', transform: 'player.number' },
        scorerPhoto: { source: 'input.scorerPlayerId', transform: 'player.cutoutUrl' },
        scorerPoste: { source: 'input.scorerPlayerId', transform: 'player.poste' },
      },
    };
    const playersById = new Map([[player.id, player]]);
    const out = resolveBindings({
      manifest,
      inputProps: { scorerPlayerId: player.id },
      brandKit: null,
      playersById,
    });
    expect(out.scorerName).toBe('Lise Le Prielec');
    expect(out.scorerNumber).toBe(4);
    expect(out.scorerPhoto).toBe(player.photo_cutout_url);
    expect(out.scorerPoste).toBe('Ailier');
  });

  it('returns null when playersById map not provided (S4 not delivered yet)', () => {
    const manifest: ManifestBindings = {
      bindings: {
        scorerName: { source: 'input.scorerPlayerId', transform: 'player.fullName' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: { scorerPlayerId: 'p-unknown' },
      brandKit: null,
      // playersById absent → fail-soft null + warn
    });
    expect(out.scorerName).toBeNull();
  });

  it('returns null when player ID not found in map', () => {
    const manifest: ManifestBindings = {
      bindings: {
        scorerName: { source: 'input.scorerPlayerId', transform: 'player.fullName' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: { scorerPlayerId: 'p-ghost' },
      brandKit: null,
      playersById: new Map(),
    });
    expect(out.scorerName).toBeNull();
  });
});

describe('resolveBindings — literal source', () => {
  it('returns the literal value as-is', () => {
    const manifest: ManifestBindings = {
      bindings: {
        version: { source: 'literal', value: 'v1.0.0' } as never,
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: null,
    });
    expect(out.version).toBe('v1.0.0');
  });
});

describe('resolveBindings — fail-soft on unknown source', () => {
  it('returns null for unknown binding source (forward-compat)', () => {
    const manifest: ManifestBindings = {
      bindings: {
        weird: { source: 'somethingNew.foo' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: {},
      brandKit: null,
    });
    expect(out.weird).toBeNull();
  });

  it('handles empty bindings object', () => {
    const out = resolveBindings({
      manifest: { bindings: {} },
      inputProps: {},
      brandKit: null,
    });
    expect(out).toEqual({});
  });

  it('handles undefined bindings (no manifest section)', () => {
    const out = resolveBindings({
      manifest: {},
      inputProps: {},
      brandKit: null,
    });
    expect(out).toEqual({});
  });
});

describe('resolveBindings — full FAITS DE JEU manifest scenario', () => {
  it('resolves the actual faits_de_jeu V1 manifest shape', () => {
    const manifest: ManifestBindings = {
      bindings: {
        label: { source: 'input.label' },
      },
    };
    const out = resolveBindings({
      manifest,
      inputProps: { label: 'PÉNALTY' },
      brandKit: baseBrandKit,
    });
    expect(out).toEqual({ label: 'PÉNALTY' });
  });
});
