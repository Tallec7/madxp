/**
 * Smoke tests — python-rembg-worker scaffold (S4-C, ADR-119).
 *
 * File-based : vérifie que le worker Python existe avec ses invariants
 * critiques. Tourne dans la suite jest central-server pour bénéficier du
 * gating standard `test:smoke`. Pas de tests d'intégration Python ici —
 * ce serait un autre runner (pytest), hors scope du smoke Node.
 *
 * Garde-fous :
 *   - Le worker existe physiquement (pas de PR qui le supprime accidentel)
 *   - Pattern claim atomic FOR UPDATE SKIP LOCKED conservé (cohérence avec
 *     le worker render Node + multi-workers safe)
 *   - Anti-orphan recovery au boot (sinon une row 'processing' claimée par
 *     un process mort reste bloquée ad vitam)
 *   - Path FTP scopé par site_id (tenant invariant)
 *   - ESLint root ignore le dossier (Python pas concerné par les règles
 *     Angular du dashboard)
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WORKER_DIR = path.join(REPO_ROOT, 'python-rembg-worker');
const MAIN_PY = path.join(WORKER_DIR, 'main.py');
const ADR_FILE = path.join(REPO_ROOT, 'docs', 'adr', 'ADR-119-rembg-python-worker.md');
const ESLINT_CONFIG = path.join(REPO_ROOT, 'eslint.config.js');

describe('python-rembg-worker — scaffold (S4-C)', () => {
  it.each([
    'main.py',
    'requirements.txt',
    'Dockerfile',
    'README.md',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(WORKER_DIR, rel))).toBe(true);
  });

  it('ADR-119 documents the architecture decision', () => {
    expect(fs.existsSync(ADR_FILE)).toBe(true);
    const content = fs.readFileSync(ADR_FILE, 'utf8');
    expect(content).toMatch(/Statut\*\*\s*:\s*Proposé/);
    expect(content).toMatch(/rembg/);
    expect(content).toMatch(/BiRefNet/);
  });

  it('eslint root config ignores python-rembg-worker (no JS/TS to lint)', () => {
    const content = fs.readFileSync(ESLINT_CONFIG, 'utf8');
    expect(content).toMatch(/python-rembg-worker\/\*\*/);
  });
});

describe('python-rembg-worker — invariants critiques (S4-C)', () => {
  const main = fs.readFileSync(MAIN_PY, 'utf8');

  it('claim_pending uses FOR UPDATE SKIP LOCKED (multi-workers safe + atomic)', () => {
    // Sans ça, deux workers en parallèle peuvent claim la même row → double
    // traitement + double upload FTP. Le pattern aligne avec le worker render
    // Node (`studio-render-worker.service.ts` smoke enforced).
    expect(main).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);
  });

  it('claim_pending only picks players with photo_raw_url IS NOT NULL', () => {
    // Un player sans raw URL n'a rien à détourer → ne doit pas être claim
    // (sinon le worker crash sur le download et marque failed pour rien).
    expect(main).toMatch(/photo_raw_url\s+IS\s+NOT\s+NULL/i);
  });

  it('fail_stale_processing recovers orphaned rows at boot (anti-orphan)', () => {
    // Pattern aligné sur `failStaleRunning(10)` du worker render Node :
    // si un worker meurt en cours de traitement, sa row 'processing' reste
    // claimée. Le boot du nouveau worker la remet en 'pending'.
    expect(main).toMatch(/fail_stale_processing/);
    expect(main).toMatch(/'processing'[\s\S]+'pending'/);
  });

  it('upload path is scoped by site_id (tenant invariant)', () => {
    // FTP path = `players/{site_id}/{player_id}-cutout.png`. Sans le site_id
    // les cutouts de plusieurs clubs s'accumuleraient à plat → fuite cross-tenant.
    expect(main).toMatch(/players\/\{site_id\}\/\{player_id\}-cutout\.png/);
  });

  it('mark_ready bumps cutout_status=ready + sets photo_cutout_url', () => {
    // Sans ce update, le résolveur côté central continue de retourner null
    // pour player.cutoutUrl → BUT/ENTRÉE templates restent sans photo détourée.
    expect(main).toMatch(/cutout_status\s*=\s*'ready'/);
    expect(main).toMatch(/photo_cutout_url\s*=/);
  });

  it('drain loop : process_one called repeatedly per tick (no N*POLL latency)', () => {
    // Pattern : `while process_one(): pass` — vide la queue à chaque tick
    // au lieu d'attendre N*POLL_INTERVAL pour drainer N rows. Aligné worker render.
    expect(main).toMatch(/while\s+process_one\(\)/);
  });

  it('rembg.remove called with downloaded raw bytes (not URL passthrough)', () => {
    // Garde-fou anti-régression : on doit télécharger d'abord (requests.get)
    // PUIS appeler remove(content). Ne pas balancer l'URL à rembg directement
    // (ça échoue silencieusement et marque cutout vide).
    expect(main).toMatch(/requests\.get\(raw_url/);
    expect(main).toMatch(/remove\(resp\.content\)/);
  });
});

describe('python-rembg-worker — Dockerfile pre-downloads model', () => {
  it('Dockerfile preloads rembg model at build time (cold start fix)', () => {
    // Sans pré-download, le 1er render attend ~30s pour télécharger BiRefNet
    // (~170 MB). On le fait au build pour que l'image soit prête à servir.
    const content = fs.readFileSync(path.join(WORKER_DIR, 'Dockerfile'), 'utf8');
    expect(content).toMatch(/from rembg import new_session/);
  });
});
