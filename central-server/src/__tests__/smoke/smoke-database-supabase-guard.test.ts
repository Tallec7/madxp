/**
 * Smoke test — guard ADR-070 / issue #863
 *
 * Vérifie que `central-server/src/config/database.ts` refuse de booter si
 * `DATABASE_URL` pointe encore sur l'ancienne instance Supabase orpheline.
 * Sans ce guard, le serveur démarre silencieusement contre des données gelées
 * (ou timeout) et provoque des faux diagnostics.
 *
 * Usage: npm run test:smoke
 */

import fs from 'fs';
import path from 'path';

describe('smoke — database supabase orpheline guard (ADR-070, issue #863)', () => {
  const dbConfigPath = path.resolve(__dirname, '../../config/database.ts');
  const envExamplePath = path.resolve(__dirname, '../../../.env.example');

  it('database.ts contient le guard `supabase.co` qui throw au boot', () => {
    const source = fs.readFileSync(dbConfigPath, 'utf8');
    expect(source).toMatch(/supabase\.co/);
    expect(source).toMatch(/throw new Error/);
    // Doit référencer l'ADR ou l'issue pour la traçabilité.
    expect(source).toMatch(/ADR-070|#863/);
  });

  it('.env.example avertit explicitement contre supabase.co', () => {
    const source = fs.readFileSync(envExamplePath, 'utf8');
    expect(source).toMatch(/supabase\.co/);
    expect(source).toMatch(/use-prod-db\.sh/);
  });
});
