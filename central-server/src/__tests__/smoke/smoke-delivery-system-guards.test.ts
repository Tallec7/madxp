/**
 * Smoke tests — delivery system guards
 *
 * Garde-fous contre les régressions de la session "audit CTO 25/04/2026" :
 *
 * 1. **Dockerfile BuildKit guard** : empêche la réintroduction des directives
 *    BuildKit (`# syntax=docker/dockerfile:1.6`, `--mount=type=cache`) qui ont
 *    cassé le build Railway prod en v3.240.1/2 (PR #595 hotfix).
 *
 * 2. **Alertmanager critical-email-and-slack guard** : empêche la suppression
 *    du receiver dual Slack+email ajouté Sprint 2 du programme delivery system
 *    (PR #592). Sans lui, perte du filet email backup sur les alertes critical.
 *
 * 3. **Render.yaml absence guard** : empêche la réintroduction du fichier
 *    `render.yaml` (Sprint 0 cleanup, PR #591). Render.com retiré.
 *
 * Usage: npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

describe('Dockerfile BuildKit guard (PR #595 — Railway prod outage v3.240.x)', () => {
  const dockerfilePath = path.join(repoRoot, 'central-server', 'Dockerfile');

  it('Dockerfile must exist', () => {
    expect(fs.existsSync(dockerfilePath)).toBe(true);
  });

  it('Dockerfile must NOT contain `# syntax=docker/dockerfile:1.6` directive (Railway sans BuildKit → parse error en 15s)', () => {
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    // La directive doit être strictement la 1ère ligne pour être active.
    // On la rejette en début de fichier OU sur n'importe quelle ligne (être strict).
    expect(content.split('\n').slice(0, 3)).not.toContain('# syntax=docker/dockerfile:1.6');
    expect(content).not.toMatch(/^# syntax=docker\/dockerfile:/m);
  });

  it('Dockerfile must NOT contain `--mount=type=cache` BuildKit directives', () => {
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    // Détecte les RUN avec --mount=type=cache (lignes RUN actives, pas dans commentaires).
    const lines = content.split('\n');
    const violations = lines
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) => {
        const trimmed = line.trim();
        // Skip comments
        if (trimmed.startsWith('#')) return false;
        return /--mount=type=cache/.test(line);
      });
    expect(violations).toEqual([]);
  });

  it('Dockerfile structural win must be preserved (`FROM deps AS prod-deps` + `npm prune`)', () => {
    // PR #590 a apporté un vrai gain hors-BuildKit qu'il faut conserver :
    // au lieu d'un second `npm ci --omit=dev` complet, on prune le stage deps.
    // Économie ~45s par build, indépendant de BuildKit.
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).toMatch(/FROM deps AS prod-deps/);
    expect(content).toMatch(/npm prune --omit=dev/);
  });
});

describe('Alertmanager critical-email-and-slack receiver (Sprint 2, PR #592)', () => {
  const alertmanagerPath = path.join(repoRoot, 'docker', 'alertmanager', 'alertmanager.yml');

  it('alertmanager.yml must exist', () => {
    expect(fs.existsSync(alertmanagerPath)).toBe(true);
  });

  it('receiver `critical-email-and-slack` must be defined (double-notification Slack+email pour les criticals)', () => {
    const content = fs.readFileSync(alertmanagerPath, 'utf8');
    // Le receiver doit être déclaré (ligne `- name: critical-email-and-slack`).
    expect(content).toMatch(/^\s+- name: critical-email-and-slack\s*$/m);
  });

  it('route severity=critical must use `critical-email-and-slack` receiver (pas slack-critical seul)', () => {
    const content = fs.readFileSync(alertmanagerPath, 'utf8');
    // Cherche le bloc qui matche severity:critical et son receiver.
    // On veut s'assurer que la route critical pointe vers le receiver dual.
    const criticalRouteMatch = content.match(
      /-\s+match:\s*\n\s*severity:\s*critical\s*\n\s*receiver:\s*([\w-]+)/m,
    );
    expect(criticalRouteMatch).not.toBeNull();
    expect(criticalRouteMatch?.[1]).toBe('critical-email-and-slack');
  });
});

describe('Sprint 0 cleanup — Render.com fully removed', () => {
  it('render.yaml must NOT exist at repo root', () => {
    const renderYamlPath = path.join(repoRoot, 'render.yaml');
    expect(fs.existsSync(renderYamlPath)).toBe(false);
  });

  it('central-server/Dockerfile must NOT reference neopro.onrender.com', () => {
    const dockerfilePath = path.join(repoRoot, 'central-server', 'Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).not.toMatch(/neopro\.onrender\.com/);
  });
});

describe('Sprint 2 — migration-check.yml workflow (PR #592)', () => {
  it('migration-check.yml workflow must exist', () => {
    const wfPath = path.join(repoRoot, '.github', 'workflows', 'migration-check.yml');
    expect(fs.existsSync(wfPath)).toBe(true);
  });

  it('migration-check.yml must trigger on full-schema and migrations paths', () => {
    const wfPath = path.join(repoRoot, '.github', 'workflows', 'migration-check.yml');
    const content = fs.readFileSync(wfPath, 'utf8');
    expect(content).toMatch(/full-schema\.sql/);
    expect(content).toMatch(/scripts\/migrations\/\*\.sql/);
  });

  it('migration-check.yml must apply full-schema then changed migrations on ephemeral PG', () => {
    const wfPath = path.join(repoRoot, '.github', 'workflows', 'migration-check.yml');
    const content = fs.readFileSync(wfPath, 'utf8');
    expect(content).toMatch(/postgres:18-alpine/);
    expect(content).toMatch(/full-schema\.sql/);
  });
});

describe('Sprint 0+1+2 — required documentation files exist', () => {
  it.each([
    'docs/technical/ENVIRONMENTS.md',
    'docs/guides/RUNBOOK_INCIDENT.md',
    'docs/guides/PI_STAGING_PROVISIONING.md',
    'CONTRIBUTING.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ])('%s must exist', (relPath) => {
    expect(fs.existsSync(path.join(repoRoot, relPath))).toBe(true);
  });

  it('CI workflow must include smoke tests step (Sprint 0 — PR #591)', () => {
    const wfPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
    const content = fs.readFileSync(wfPath, 'utf8');
    expect(content).toMatch(/npm run test:smoke/);
  });

  it('db-backup.yml must NOT contain Supabase mirror step (Sprint 0 cleanup)', () => {
    const wfPath = path.join(repoRoot, '.github', 'workflows', 'db-backup.yml');
    const content = fs.readFileSync(wfPath, 'utf8');
    expect(content).not.toMatch(/Mirror to Supabase/);
    expect(content).not.toMatch(/pg_restore.*SUPABASE_URL/);
  });
});
