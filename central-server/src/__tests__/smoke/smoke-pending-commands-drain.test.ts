/**
 * Smoke garde-fou — CRON pending_commands_drain (Phase 14, fix sync 2026-05-09).
 *
 * Le bug racine résolu par cette feature : `processPendingCommands(siteId)`
 * n'était appelé qu'au moment de l'authentication socket d'un Pi. Toute
 * commande queuée pour un site déjà connecté restait en DB indéfiniment.
 * Incident terrain Mangin-Beaulieu : commande `receiver_assignment_updated`
 * queuée à 14:47 avec attempts=0, jamais drainée → Fire Stick coincé sur
 * la wait page.
 *
 * Ce smoke verrouille les invariants critiques pour que le drain CRON
 * survive aux refactors :
 *   1. task_type 'pending_commands_drain' déclaré dans le type CronTaskType
 *   2. Migration ajoute le task_type à check_task_type + seed un schedule actif
 *   3. full-schema.sql aligné sur la migration
 *   4. Executor isolé (`cron-tasks/pending-commands-drain.task.ts`) et enregistré
 *      dans le dispatch table de cron-scheduler.service
 *   5. Métrique Prometheus `neopro_pending_commands_drain_total` exposée
 *      (sans elle un bug silencieux du drainer reste invisible)
 *   6. Le task itère bien `socketService.getConnectedSites()` (pas un autre
 *      proxy) et délègue à `commandQueueService.processPendingCommands`
 */

import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('Phase 14 — pending_commands_drain CRON', () => {
  it("CronTaskType inclut 'pending_commands_drain'", () => {
    const types = fs.readFileSync(
      path.join(REPO_ROOT, 'central-server/src/cron-tasks/types.ts'),
      'utf8'
    );
    expect(types).toMatch(/'pending_commands_drain'/);
  });

  it('Migration add-pending-commands-drain-cron étend check_task_type et seed le schedule', () => {
    const migration = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'central-server/src/scripts/migrations/add-pending-commands-drain-cron.sql'
      ),
      'utf8'
    );
    // Étend la CHECK
    expect(migration).toMatch(/ADD CONSTRAINT[\s\S]*?check_task_type[\s\S]*?'pending_commands_drain'/);
    // Seed idempotent
    expect(migration).toMatch(/INSERT INTO recurring_schedules[\s\S]*?'pending_commands_drain'/);
    expect(migration).toMatch(/WHERE NOT EXISTS[\s\S]*?'pending_commands_drain'/);
    // Schedule actif et 30s
    expect(migration).toMatch(/'\*\/30 \* \* \* \* \*'/);
    expect(migration).toMatch(/true/);
  });

  it("full-schema.sql aligné — check_task_type contient 'pending_commands_drain'", () => {
    const schema = fs.readFileSync(
      path.join(REPO_ROOT, 'central-server/src/scripts/full-schema.sql'),
      'utf8'
    );
    expect(schema).toMatch(/CONSTRAINT check_task_type[\s\S]*?'pending_commands_drain'/);
  });

  it('Executor isolé existe et exporte executePendingCommandsDrainTask', () => {
    const taskFile = path.join(
      REPO_ROOT,
      'central-server/src/cron-tasks/pending-commands-drain.task.ts'
    );
    expect(fs.existsSync(taskFile)).toBe(true);
    const src = fs.readFileSync(taskFile, 'utf8');
    expect(src).toMatch(/export async function executePendingCommandsDrainTask/);
    // Itère les sites connectés (pas un autre proxy fragile)
    expect(src).toMatch(/socketService\.getConnectedSites\(\)/);
    // Délègue le travail à processPendingCommands (pas un INSERT ad hoc)
    expect(src).toMatch(/processPendingCommands\(siteId\)/);
    // Reporte la métrique Prometheus
    expect(src).toMatch(/metricsService\.recordPendingCommandsDrain/);
  });

  it('cron-scheduler.service enregistre executePendingCommandsDrainTask dans le dispatch', () => {
    const scheduler = fs.readFileSync(
      path.join(REPO_ROOT, 'central-server/src/services/cron-scheduler.service.ts'),
      'utf8'
    );
    expect(scheduler).toMatch(
      /import\s+\{\s*executePendingCommandsDrainTask\s*\}\s+from\s+'\.\.\/cron-tasks\/pending-commands-drain\.task'/
    );
    expect(scheduler).toMatch(/pending_commands_drain:\s*executePendingCommandsDrainTask/);
  });

  it('metrics.service expose neopro_pending_commands_drain_total et recordPendingCommandsDrain', () => {
    const metrics = fs.readFileSync(
      path.join(REPO_ROOT, 'central-server/src/services/metrics.service.ts'),
      'utf8'
    );
    expect(metrics).toMatch(/neopro_pending_commands_drain_total/);
    expect(metrics).toMatch(/recordPendingCommandsDrain\s*\(/);
    // Labels structurés (site_id, outcome) pour distinguer drain ok / failed
    expect(metrics).toMatch(/labelNames:\s*\[\s*'site_id'\s*,\s*'outcome'\s*\]/);
  });

  it("socketService.getConnectedSites() reste public — la task en dépend", () => {
    const socketSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'central-server/src/services/socket.service.ts'),
      'utf8'
    );
    // Pas de modificateur (méthode publique par défaut en TS)
    expect(socketSrc).toMatch(/getConnectedSites\(\)\s*:\s*string\[\]/);
  });
});
