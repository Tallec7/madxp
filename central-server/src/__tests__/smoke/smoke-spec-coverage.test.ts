/**
 * Smoke test — SPEC coverage guard
 *
 * Goal: keep `docs/specs/` aligned with code reality. Three independent guards:
 *
 *   1. **ADR coverage** — every ADR with `Statut: Accepté` must be referenced in ≥1 SPEC.
 *      Frozen allowlist `LEGACY_ADRS_WITHOUT_SPEC` for ADRs not yet covered (audit 2026-04-27).
 *      Remove an entry when the corresponding SPEC is written.
 *
 *   2. **Service coverage** — every `central-server/src/services/*.service.ts` >500 lines
 *      must be mentioned (by file basename) in ≥1 SPEC.
 *      Frozen allowlist `LEGACY_SERVICES_WITHOUT_SPEC` for services not yet covered.
 *      Remove an entry when the corresponding SPEC is written.
 *
 *   3. **Format** — every `.spec.md` must include the obligatory sections defined
 *      in `docs/specs/README.md` (En une phrase / Périmètre / Règles métier /
 *      Comportements observables / Cas d'edge / Ce qui n'est PAS).
 *
 * Freshness ("Dernière revue" <6 months) is a warning surfaced by `npm run specs:audit`
 * (out of scope for this smoke), not a hard failure here.
 *
 * Allowlists are FROZEN — do not add entries. When you ship a SPEC that covers an
 * orphan, remove its entry in the same PR.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SPECS_DIR = path.join(REPO_ROOT, 'docs/specs');
const ADR_DIR = path.join(REPO_ROOT, 'docs/adr');
const SERVICES_DIR = path.resolve(__dirname, '../../services');

// ─────────────────────────────────────────────────────────────────────────────
// FROZEN ALLOWLISTS — audit 2026-04-27 baseline.
// Do NOT add. Remove an entry when its SPEC ships in the same PR.
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_ADRS_WITHOUT_SPEC = new Set<string>([
  'ADR-004', 'ADR-006', 'ADR-008', 'ADR-010', 'ADR-011',
  'ADR-012', 'ADR-013', 'ADR-014', 'ADR-015', 'ADR-021', 'ADR-024',
  'ADR-026', 'ADR-027', 'ADR-030', 'ADR-031', 'ADR-032', 'ADR-036',
  // ADR-033 / ADR-042 / ADR-057 now covered by docs/specs/features/manual-video-transitions.spec.md
  'ADR-041', 'ADR-043', 'ADR-044', 'ADR-045', 'ADR-046',
  // ADR-052 archivée 2026-05-16 (ADR-129 kill V2) — plus parmi les Accepté.
  'ADR-047', 'ADR-048', 'ADR-050', 'ADR-051', 'ADR-053', 'ADR-056',
  // ADR-007 / ADR-058 / ADR-060 / ADR-092 now covered by docs/specs/features/remote.spec.md
  'ADR-063', 'ADR-064', 'ADR-065',
  'ADR-066', 'ADR-067', 'ADR-068', 'ADR-070', 'ADR-072',
  // ADR-082 désormais couvert par docs/specs/features/templates-studio.spec.md
  // (réutilisation du pattern grants admin → clubs pour Templates Studio V1, cf. ADR-123).
  'ADR-078', 'ADR-083', 'ADR-085',
  // ADR-089 is now covered by docs/specs/features/web-live-content.spec.md (ADR-103 Phase 1)
  // ADR-098 now covered by docs/specs/features/video-cycle.spec.md (FTP audit angle mort)
  // ADR-099 now covered by docs/specs/services/command-queue.spec.md (cas d'edge socket zombie)
  'ADR-091', 'ADR-094',
]);

const LEGACY_SERVICES_WITHOUT_SPEC = new Set<string>([
  'metrics.service.ts',
  'excel-export.service.ts',
  // subscription.service.ts retiree 2026-05-14 :
  // mentionnee dans docs/specs/features/pi-connectivity-model.spec.md (Pattern 1 message_remote)
  // et docs/specs/services/command-queue.spec.md (referentiel patterns existants).
  'canary-deployment.service.ts',
  // alerting.service.ts + alerting-checks.service.ts retirees 2026-05-05 :
  // couvertes par docs/specs/services/alert-repository.spec.md (ADR-111).
  'safe-parser.service.ts',
  'update-deployment.service.ts',
  'orchestrated-deployment.service.ts',
]);

// SPECs livrées avant le pivot SPEC=domaine (2026-04-27). Elles seront réécrites
// en Sprint 1-2 pour ajouter la section "Périmètre" formalisée. Frozen — toute
// nouvelle SPEC doit respecter le format complet.
const LEGACY_SPECS_PRE_DOMAIN_PIVOT = new Set<string>([
  // 'docs/specs/features/templates-studio.spec.md' retirée 2026-05-16 :
  // SPEC V2 supprimée en ADR-129, réécrite en V1 code-driven (format complet).
  'docs/specs/services/cron-scheduler.spec.md',
  'docs/specs/services/socket-service.spec.md',
]);

const SERVICE_LINE_THRESHOLD = 500;

const REQUIRED_SECTIONS = [
  'En une phrase',
  'Périmètre',
  'Règles métier',
  'Comportements observables',
  "Cas d'edge",
  "Ce qui n'est PAS",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function walkSync(dir: string, predicate: (p: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSync(full, predicate, out);
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function listSpecFiles(): string[] {
  return walkSync(SPECS_DIR, (p) => p.endsWith('.spec.md'));
}

function readSpecsContent(): string {
  return listSpecFiles()
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n\n');
}

function listAcceptedAdrs(): string[] {
  if (!fs.existsSync(ADR_DIR)) return [];
  const adrs: string[] = [];
  for (const entry of fs.readdirSync(ADR_DIR)) {
    if (!/^ADR-\d{3}-/.test(entry) || !entry.endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(ADR_DIR, entry), 'utf8');
    if (/^\*\*Statut\*\*\s*:\s*Accept/m.test(content)) {
      const match = entry.match(/^(ADR-\d{3})-/);
      if (match) adrs.push(match[1]);
    }
  }
  return adrs.sort();
}

function listLargeServices(): string[] {
  return walkSync(
    SERVICES_DIR,
    (p) => p.endsWith('.service.ts') && !p.endsWith('.test.ts')
  ).filter((p) => {
    const lines = fs.readFileSync(p, 'utf8').split('\n').length;
    return lines >= SERVICE_LINE_THRESHOLD;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Smoke — SPEC coverage guard', () => {
  it('every Accepté ADR is referenced in at least one SPEC', () => {
    const accepted = listAcceptedAdrs();
    const specsContent = readSpecsContent();
    const orphans: string[] = [];
    const allowlistUsed = new Set<string>();

    for (const adr of accepted) {
      const re = new RegExp(`\\b${adr}\\b`);
      if (re.test(specsContent)) continue;
      if (LEGACY_ADRS_WITHOUT_SPEC.has(adr)) {
        allowlistUsed.add(adr);
        continue;
      }
      orphans.push(adr);
    }

    if (orphans.length > 0) {
      throw new Error(
        [
          '',
          `Found ${orphans.length} Accepté ADR(s) not referenced in any SPEC:`,
          ...orphans.map((a) => `  - ${a}`),
          '',
          'Either reference the ADR in the relevant SPEC, or document why it is out of scope.',
          'Do NOT add to LEGACY_ADRS_WITHOUT_SPEC — the allowlist is frozen.',
          '',
        ].join('\n')
      );
    }

    const stale = [...LEGACY_ADRS_WITHOUT_SPEC].filter((a) => !allowlistUsed.has(a));
    if (stale.length > 0) {
      throw new Error(
        [
          '',
          `Stale entries in LEGACY_ADRS_WITHOUT_SPEC (${stale.length}):`,
          ...stale.map((s) => `  - ${s}`),
          '',
          'These ADRs are now covered by a SPEC (or were superseded). Remove the entries.',
          '',
        ].join('\n')
      );
    }
  });

  it('every service >500 lines is mentioned in at least one SPEC', () => {
    const services = listLargeServices();
    const specsContent = readSpecsContent();
    const orphans: string[] = [];
    const allowlistUsed = new Set<string>();

    for (const svc of services) {
      const fileName = path.basename(svc); // e.g. "metrics.service.ts"
      const baseName = fileName.replace(/\.ts$/, ''); // "metrics.service"
      const escaped = baseName.replace(/\./g, '\\.');
      const re = new RegExp(`\\b${escaped}\\b`);
      if (re.test(specsContent)) continue;
      if (LEGACY_SERVICES_WITHOUT_SPEC.has(fileName)) {
        allowlistUsed.add(fileName);
        continue;
      }
      orphans.push(fileName);
    }

    if (orphans.length > 0) {
      throw new Error(
        [
          '',
          `Found ${orphans.length} large service(s) not mentioned in any SPEC:`,
          ...orphans.map((s) => `  - src/services/${s}`),
          '',
          'Reference the service in the relevant domain SPEC under "Périmètre → Services backend".',
          'Do NOT add to LEGACY_SERVICES_WITHOUT_SPEC — the allowlist is frozen.',
          '',
        ].join('\n')
      );
    }

    const stale = [...LEGACY_SERVICES_WITHOUT_SPEC].filter((s) => !allowlistUsed.has(s));
    if (stale.length > 0) {
      throw new Error(
        [
          '',
          `Stale entries in LEGACY_SERVICES_WITHOUT_SPEC (${stale.length}):`,
          ...stale.map((s) => `  - ${s}`),
          '',
          'These services are now mentioned in a SPEC (or were deleted/shrunk). Remove the entries.',
          '',
        ].join('\n')
      );
    }
  });

  it('every SPEC has the obligatory sections', () => {
    const specs = listSpecFiles();
    const violations: string[] = [];
    const allowlistUsed = new Set<string>();

    for (const spec of specs) {
      const content = fs.readFileSync(spec, 'utf8');
      const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
      if (missing.length === 0) continue;

      const rel = path.relative(REPO_ROOT, spec);
      if (LEGACY_SPECS_PRE_DOMAIN_PIVOT.has(rel)) {
        allowlistUsed.add(rel);
        continue;
      }
      violations.push(`${rel} — missing sections: ${missing.join(', ')}`);
    }

    if (violations.length > 0) {
      throw new Error(
        [
          '',
          `Found ${violations.length} SPEC(s) missing obligatory sections:`,
          ...violations.map((v) => `  - ${v}`),
          '',
          `Required sections (per docs/specs/README.md): ${REQUIRED_SECTIONS.join(', ')}`,
          'Do NOT add to LEGACY_SPECS_PRE_DOMAIN_PIVOT — the allowlist is frozen.',
          '',
        ].join('\n')
      );
    }

    const stale = [...LEGACY_SPECS_PRE_DOMAIN_PIVOT].filter((s) => !allowlistUsed.has(s));
    if (stale.length > 0) {
      throw new Error(
        [
          '',
          `Stale entries in LEGACY_SPECS_PRE_DOMAIN_PIVOT (${stale.length}):`,
          ...stale.map((s) => `  - ${s}`),
          '',
          'These SPECs are now compliant (or were deleted). Remove the entries.',
          '',
        ].join('\n')
      );
    }
  });
});
