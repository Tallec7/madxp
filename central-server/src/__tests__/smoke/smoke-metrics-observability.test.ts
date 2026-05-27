/**
 * Smoke test — metrics observability guard
 *
 * Goal: every Prometheus metric REGISTERED in `metrics.service.ts` MUST be referenced
 * in at least one Grafana dashboard JSON or Prometheus alert rule. Otherwise it is a
 * blind spot — the metric is collected but nobody looks at it.
 *
 * Detection:
 *   - Source: lines like `name: 'madxp_xxx_total',` in `central-server/src/services/metrics.service.ts`
 *   - Sinks:  any `madxp_xxx_total` substring in:
 *               - docker/grafana/provisioning/dashboards/json/**\/*.json
 *               - docker/prometheus/rules.yml
 *
 * For histograms, the Grafana side typically references `<name>_bucket` / `_count` / `_sum`.
 * The substring match handles all three transparently.
 *
 * Legacy uncovered metrics are grandfathered via `LEGACY_METRICS_WITHOUT_VIZ` below.
 * The allowlist is FROZEN — do not add entries. When you wire a metric to a dashboard
 * or alert, remove the entry in the same PR.
 *
 * Companion dashboard: `docker/grafana/provisioning/dashboards/json/cloud/madxp-blind-spots-cloud.json`
 * — the dashboard surfaces every blind-spot metric so the allowlist can shrink.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const METRICS_FILE = path.join(REPO_ROOT, 'central-server/src/services/metrics.service.ts');
const DASHBOARDS_DIR = path.join(REPO_ROOT, 'docker/grafana/provisioning/dashboards/json');
const RULES_FILE = path.join(REPO_ROOT, 'docker/prometheus/rules.yml');

// LEGACY — metrics registered but not yet wired to any dashboard or alert at the time
// the guard was introduced (2026-04-26). Do NOT add entries. Remove an entry when you
// add the metric to a dashboard panel or alert rule in the same PR.
const LEGACY_METRICS_WITHOUT_VIZ = new Set<string>([
  // Histograms whose `_bucket` form IS used in dashboards but base name happens
  // to also appear standalone. Grandfathered to avoid false positives.
  // (Currently empty — substring match covers histogram suffixes.)
]);

function walkJson(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, out);
    else if (entry.isFile() && full.endsWith('.json')) out.push(full);
  }
  return out;
}

function extractRegisteredMetrics(source: string): string[] {
  const re = /name:\s*['"](madxp_[a-z0-9_]+)['"]/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return [...names];
}

function loadSinkContent(): string {
  const parts: string[] = [];
  for (const f of walkJson(DASHBOARDS_DIR)) {
    parts.push(fs.readFileSync(f, 'utf8'));
  }
  if (fs.existsSync(RULES_FILE)) parts.push(fs.readFileSync(RULES_FILE, 'utf8'));
  return parts.join('\n');
}

describe('Smoke — metrics observability guard', () => {
  it('every registered madxp_ metric is referenced in a dashboard or alert rule', () => {
    expect(fs.existsSync(METRICS_FILE)).toBe(true);
    expect(fs.existsSync(DASHBOARDS_DIR)).toBe(true);

    const registered = extractRegisteredMetrics(fs.readFileSync(METRICS_FILE, 'utf8'));
    expect(registered.length).toBeGreaterThan(20);

    const sinkContent = loadSinkContent();
    expect(sinkContent.length).toBeGreaterThan(0);

    const blindSpots: string[] = [];
    const allowlistUsed = new Set<string>();

    for (const metric of registered) {
      if (sinkContent.includes(metric)) continue;
      if (LEGACY_METRICS_WITHOUT_VIZ.has(metric)) {
        allowlistUsed.add(metric);
        continue;
      }
      blindSpots.push(metric);
    }

    if (blindSpots.length > 0) {
      const msg = [
        '',
        `Found ${blindSpots.length} metric(s) registered but not visualized anywhere:`,
        ...blindSpots.map((m) => `  - ${m}`),
        '',
        'Every madxp_* metric must appear in at least one Grafana dashboard panel',
        `(under ${path.relative(REPO_ROOT, DASHBOARDS_DIR)}/) or one Prometheus alert rule`,
        `(in ${path.relative(REPO_ROOT, RULES_FILE)}).`,
        '',
        'Quick fix: add a panel to madxp-blind-spots-cloud.json (the catch-all dashboard)',
        'then promote to a domain-specific dashboard once the metric earns its keep.',
        '',
        'Do NOT add to LEGACY_METRICS_WITHOUT_VIZ — the allowlist is frozen.',
        '',
      ].join('\n');
      throw new Error(msg);
    }

    const stale: string[] = [];
    for (const entry of LEGACY_METRICS_WITHOUT_VIZ) {
      if (!allowlistUsed.has(entry)) stale.push(entry);
    }
    if (stale.length > 0) {
      throw new Error(
        `Stale entries in LEGACY_METRICS_WITHOUT_VIZ: ${stale.join(', ')}. ` +
          'Either the metric was removed, or it is now wired to a dashboard. Remove the entry.',
      );
    }
  });
});
