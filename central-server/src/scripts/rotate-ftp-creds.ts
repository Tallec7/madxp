/* eslint-disable no-console */
/**
 * Audit P0 #2 — FTP credentials rotation procedure (ADR-113).
 *
 * Manual CLI : `npm run rotate:ftp-creds`. Cadence : 90 jours.
 *
 * Ce script ne change PAS les credentials lui-même (Hostinger n'expose pas
 * d'API pour le mot de passe FTP — l'opération passe obligatoirement par le
 * cPanel UI). Il sert deux usages :
 *
 *   1. Imprimer la procédure step-by-step (`npm run rotate:ftp-creds`).
 *   2. Tester une connexion FTP avec un nouveau password sans toucher Railway
 *      (`npm run rotate:ftp-creds -- --test-connection <newPassword>`).
 *
 * Sortie : exit code 0 si la procédure s'imprime ou si le test connexion
 * réussit ; 1 si le test connexion échoue.
 */
import * as ftp from 'basic-ftp';
import logger from '../config/logger';

const STEPS: string[] = [
  '1. Générer nouveau mot de passe FTP via UI Hostinger (cPanel → FTP Accounts → Edit user → Change password). Garder l\'ancien mdp ouvert dans 1Password en cas de rollback.',
  '2. Tester la connexion en local : npm run rotate:ftp-creds -- --test-connection <newPassword>',
  '3. Mettre à jour Railway (env production) : railway variables set FTP_PASSWORD=<newPassword>',
  '4. Redeploy Railway : railway up (ou push d\'un commit vide pour déclencher un build).',
  '5. Smoke test post-deploy : curl -fsS https://kalonpartners.bzh/$(date +%s).probe || echo "FTP_PUBLIC_URL OK"',
  '6. Archiver l\'ancien mot de passe dans le coffre 1Password (entrée "FTP Hostinger / rotation history") avec la date.',
  '7. Mettre à jour la table "Historique des rotations" dans docs/adr/ADR-113-ftp-creds-rotation-procedure.md (Date / Opérateur / Hash sha256 partiel ancien+nouveau).',
];

const printProcedure = (): void => {
  logger.info('FTP creds rotation — procedure (ADR-113)');
  console.log('\n=== FTP credentials rotation — procedure (ADR-113) ===\n');
  for (const step of STEPS) {
    console.log(step);
    console.log('');
  }
  console.log('Cadence : 90 jours. Voir docs/adr/ADR-113-ftp-creds-rotation-procedure.md pour le contexte complet.\n');
};

const testConnection = async (newPassword: string): Promise<boolean> => {
  const host = process.env['FTP_HOST'];
  const port = Number(process.env['FTP_PORT'] || '21');
  const user = process.env['FTP_USER'];
  const secure = process.env['FTP_SECURE'] === 'true';

  if (!host || !user) {
    console.error('FTP_HOST and FTP_USER must be set in env to test connection');
    return false;
  }

  const client = new ftp.Client(15_000);
  try {
    await client.access({ host, port, user, password: newPassword, secure });
    const cwd = await client.pwd();
    console.log(`✓ Connection OK — pwd: ${cwd}`);
    logger.info('FTP rotation test-connection succeeded', { host, user });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Connection FAILED — ${message}`);
    logger.error('FTP rotation test-connection failed', { host, user, error: message });
    return false;
  } finally {
    client.close();
  }
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--test-connection');
  if (idx !== -1) {
    const newPassword = args[idx + 1];
    if (!newPassword) {
      console.error('Usage: npm run rotate:ftp-creds -- --test-connection <newPassword>');
      process.exit(1);
    }
    const ok = await testConnection(newPassword);
    process.exit(ok ? 0 : 1);
  }
  printProcedure();
  process.exit(0);
}

void main();
