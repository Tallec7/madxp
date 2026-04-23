/**
 * Smoke tests — PROP-003 scoreboard domain (F-15.2 prep).
 *
 * Protège :
 *   - PROP-003 : 3 corrections protocolaires appliquées (Bodet 9600 bps, Scorepad
 *     client TCP côté Pi, Stramatel 0x33 seul porteur de l'état match).
 *   - SPEC-PROP-003 : annexe protocolaire présente avec les layouts basket.
 *   - Simulateurs dev sim-bodet-scorepad + sim-stramatel : fichiers + tests
 *     Node natif en place.
 *
 * Ces corrections ont été établies en avril 2026 après reverse-engineering de
 * Panel2Net + lecture du PDF Bodet 608264. Les régressions côté doc seraient
 * invisibles à la prochaine implémentation du connecteur, d'où la protection
 * smoke file-based.
 *
 * Usage: npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function existsRepo(rel: string): boolean {
  return fs.existsSync(path.join(repoRoot, rel));
}

describe('PROP-003 — 3 corrections protocolaires verrouillées', () => {
  const prop = 'docs/proposals/PROP-003-score-live-multi-vendor.md';

  it('proposition PROP-003 présente', () => {
    expect(existsRepo(prop)).toBe(true);
  });

  it('Bodet série : baudRate = 9600 (et non 19200)', () => {
    const text = readRepo(prop);
    // Bloc Bodet série configure baudRate: 9600. Panel2Net + doc Moxa officielle.
    expect(text).toMatch(/baudRate:\s*9600/);
    // Aucune occurrence de baudRate: 19200 dans le bloc Bodet (Stramatel reste à 19200).
    const bodetBlock = text.slice(
      text.indexOf('BodetSerialConnector'),
      text.indexOf('break;', text.indexOf('BodetSerialConnector'))
    );
    expect(bodetBlock).not.toMatch(/baudRate:\s*19200/);
  });

  it('Bodet Scorepad : le Pi est TCP server (createServer), console = client', () => {
    const text = readRepo(prop);
    expect(text).toMatch(/net\.createServer\(\)\.listen\(4001\)/);
    expect(text).toMatch(/Scorepad est le client TCP/i);
  });

  it('Stramatel : 0x33 = état match ; 0x37/0x38 = stats joueur (hors scope overlay)', () => {
    const text = readRepo(prop);
    expect(text).toMatch(/0x33[^\n]*état match/);
    expect(text).toMatch(/0x37.*0x38.*stats joueur/);
    // Les niveaux L4/L5 doivent pointer vers 0x33, pas 0x37/0x38.
    expect(text).toMatch(/Stramatel\s+`0x33`.*fautes\/timeouts/);
    expect(text).toMatch(/Stramatel\s+`0x33`.*shot clock\/possession/);
  });

  it('PROP-003 référence l\'annexe SPEC protocolaire', () => {
    const text = readRepo(prop);
    expect(text).toMatch(/SPEC-PROP-003-protocoles-scoreboards\.md/);
  });
});

describe('SPEC-PROP-003 — annexe protocolaire', () => {
  const spec = 'docs/proposals/SPEC-PROP-003-protocoles-scoreboards.md';

  it('annexe SPEC présente', () => {
    expect(existsRepo(spec)).toBe(true);
  });

  it('couvre Stramatel 0x33 (layout 54 octets) + Bodet framing LRC', () => {
    const text = readRepo(spec);
    expect(text).toMatch(/## 1\. Stramatel/);
    expect(text).toMatch(/Layout du message\s+`0x33`/);
    expect(text).toMatch(/## 2\. Bodet Scorepad/);
    // Framing Bodet
    expect(text).toMatch(/SOH.*Address.*STX.*CTRL.*Message.*ETX.*LRC/);
    // LRC formula: XOR puis AND 0x7F puis +32 si < 32
    expect(text).toMatch(/AND\s+0x7F/i);
    expect(text).toMatch(/\+\s*32/);
  });

  it('section 2.9 layouts basket byte-par-byte présente', () => {
    const text = readRepo(spec);
    expect(text).toMatch(/2\.9.*Layouts basket/i);
  });
});

describe('Simulateurs dev (raspberry/scripts/sim-*) — fichiers en place', () => {
  const bodetRoot = 'raspberry/scripts/sim-bodet-scorepad';
  const straRoot = 'raspberry/scripts/sim-stramatel';

  it('sim-bodet-scorepad : package.json + src/framing.js + tests', () => {
    expect(existsRepo(`${bodetRoot}/package.json`)).toBe(true);
    expect(existsRepo(`${bodetRoot}/src/framing.js`)).toBe(true);
    expect(existsRepo(`${bodetRoot}/src/messages-basket.js`)).toBe(true);
    expect(existsRepo(`${bodetRoot}/test/framing.test.js`)).toBe(true);
    expect(existsRepo(`${bodetRoot}/test/messages-basket.test.js`)).toBe(true);
  });

  it('sim-bodet framing.js : LRC applique AND 0x7F puis +32 si < 0x20', () => {
    const src = readRepo(`${bodetRoot}/src/framing.js`);
    expect(src).toMatch(/0x7[fF]/);
    expect(src).toMatch(/0x20|32/);
  });

  it('sim-stramatel : package.json + src/frame-0x33.js + tests', () => {
    expect(existsRepo(`${straRoot}/package.json`)).toBe(true);
    expect(existsRepo(`${straRoot}/src/frame-0x33.js`)).toBe(true);
    expect(existsRepo(`${straRoot}/test/frame-0x33.test.js`)).toBe(true);
  });

  it('sim-stramatel frame-0x33 : trame 54 octets + byte start 0xF8 + type 0x33', () => {
    const src = readRepo(`${straRoot}/src/frame-0x33.js`);
    expect(src).toMatch(/0x[fF]8/);
    expect(src).toMatch(/0x33/);
    // La trame doit faire 54 octets (constante ou alloc explicite)
    expect(src).toMatch(/54/);
  });

  it('les 2 simulateurs ont zéro dépendance runtime (scripts dev standalone)', () => {
    const bodetPkg = JSON.parse(readRepo(`${bodetRoot}/package.json`));
    const straPkg = JSON.parse(readRepo(`${straRoot}/package.json`));
    expect(bodetPkg.dependencies || {}).toEqual({});
    expect(straPkg.dependencies || {}).toEqual({});
  });

  it('les 2 simulateurs exposent un script test (node --test)', () => {
    const bodetPkg = JSON.parse(readRepo(`${bodetRoot}/package.json`));
    const straPkg = JSON.parse(readRepo(`${straRoot}/package.json`));
    expect(bodetPkg.scripts?.test || '').toMatch(/node\s+--test/);
    expect(straPkg.scripts?.test || '').toMatch(/node\s+--test/);
  });
});
