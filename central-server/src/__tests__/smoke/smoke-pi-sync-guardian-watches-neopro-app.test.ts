/**
 * Smoke — Pi sync-guardian surveille aussi neopro-app
 *
 * Incident 2026-05-13 (NLF, storm auto-deploys, PR #977) : neopro-app a crashé
 * sur le Pi, le guardian a maintenu neopro-sync-agent en vie mais ne surveillait
 * pas l'app — Pi resté offline jusqu'à intervention physique au gymnase.
 *
 * Ce smoke vérifie que `raspberry/scripts/sync-agent-guardian.sh` :
 *   1. Référence le service `neopro-app` (is-active + restart)
 *   2. Émet un événement structuré `neopro_app_restart_attempt` (observabilité)
 *   3. Implémente un plafond de restart (cap 5/h) pour éviter la boucle infinie
 *   4. Implémente un backoff (BACKOFF_FILE) pour éviter de taper en boucle
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const GUARDIAN_PATH = resolve(
  __dirname,
  '../../../../raspberry/scripts/sync-agent-guardian.sh',
);

describe('Pi sync-guardian — neopro-app watchdog (incident 2026-05-13)', () => {
  const script = readFileSync(GUARDIAN_PATH, 'utf-8');

  it('définit NEOPRO_APP_SERVICE="neopro-app"', () => {
    expect(script).toMatch(/NEOPRO_APP_SERVICE="neopro-app"/);
  });

  it('vérifie systemctl is-active sur neopro-app', () => {
    // Tolérant à la forme : variable ou string littérale
    expect(script).toMatch(
      /systemctl is-active --quiet "?(\$NEOPRO_APP_SERVICE|neopro-app)"?/,
    );
  });

  it('tente un systemctl restart sur neopro-app', () => {
    expect(script).toMatch(
      /systemctl restart "?(\$NEOPRO_APP_SERVICE|neopro-app)"?/,
    );
  });

  it('émet un événement structuré sur la tentative de restart', () => {
    expect(script).toMatch(/neopro_app_restart_attempt/);
    expect(script).toMatch(/neopro_app_down/);
    expect(script).toMatch(/neopro_app_recovered/);
  });

  it('implémente un plafond de restart (5/heure)', () => {
    expect(script).toMatch(/NEOPRO_APP_RESTART_CAP=5/);
    expect(script).toMatch(/NEOPRO_APP_RESTART_WINDOW=3600/);
    expect(script).toMatch(/neopro_app_restart_cap_reached/);
  });

  it('implémente un backoff exponentiel pour éviter la boucle infinie', () => {
    expect(script).toMatch(/NEOPRO_APP_BACKOFF_MIN=/);
    expect(script).toMatch(/NEOPRO_APP_BACKOFF_MAX=/);
    expect(script).toMatch(/NEOPRO_APP_NEXT_TRY_FILE/);
  });

  it("câble watch_neopro_app dans la boucle principale", () => {
    expect(script).toMatch(/watch_neopro_app\b/);
    // Vérifier que la fonction est définie ET appelée
    expect(script.match(/watch_neopro_app\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
