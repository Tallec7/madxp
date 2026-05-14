/**
 * Smoke tests — studio-render-server Dockerfile + boot scripts (ADR-118 Accepté).
 *
 * Garde-fous file-based pour empêcher les régressions du déploiement Railway.
 * Le déploiement réel (`docker build`, `docker run`) est testé manuellement
 * post-merge via le test plan de la PR.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const STUDIO = path.join(REPO_ROOT, 'studio-render-server');
const DOCKERFILE = path.join(STUDIO, 'Dockerfile');
const FETCH = path.join(STUDIO, 'scripts', 'fetch-assets.sh');
const START = path.join(STUDIO, 'scripts', 'start.sh');
const SERVER = path.join(STUDIO, 'studio-poc', 'server.mjs');

describe('studio-render-server — Dockerfile + boot scripts (ADR-118)', () => {
  it.each([
    'Dockerfile',
    'scripts/fetch-assets.sh',
    'scripts/start.sh',
  ])('contains %s', (rel) => {
    expect(fs.existsSync(path.join(STUDIO, rel))).toBe(true);
  });

  it('Dockerfile installs system Chromium + sets BROWSER_EXECUTABLE_PATH', () => {
    // Sans Chromium système, Remotion télécharge le sien (Puppeteer) au boot
    // → image gonflée + cold start lent. Pattern aligné central-server/Dockerfile.
    const content = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(content).toMatch(/apt-get install[\s\S]*?chromium/);
    expect(content).toMatch(/BROWSER_EXECUTABLE_PATH=\/usr\/bin\/chromium/);
    expect(content).toMatch(/PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true/);
  });

  it('Dockerfile installs lftp for FTP mirror at boot', () => {
    // Sans lftp, fetch-assets.sh ne peut pas mirror les 5+ GB d'assets.
    // Si on retire lftp, le boot script log "lftp: command not found".
    const content = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(content).toMatch(/apt-get install[\s\S]*?lftp/);
  });

  it('Dockerfile uses tini as ENTRYPOINT (zombie reaper for Chromium subprocesses)', () => {
    // Sans tini, Chromium peut leaker des sous-process et le container
    // ne se termine pas proprement sur SIGTERM (Railway redeploy stuck).
    const content = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(content).toMatch(/apt-get install[\s\S]*?tini/);
    expect(content).toMatch(/ENTRYPOINT \["\/usr\/bin\/tini"/);
  });

  it('Dockerfile does NOT COPY public/ (assets fetched at boot — ADR-118 décision)', () => {
    // L'image doit rester légère (~500 MB-1 GB). Si on COPY public/ au build,
    // l'image gonfle à 5+ GB et le déploiement Railway prend 10+ min.
    const content = fs.readFileSync(DOCKERFILE, 'utf8');
    // Aucun `COPY` qui inclut `public/` — on `mkdir -p public` à la place.
    expect(content).not.toMatch(/COPY[^\n]*\bpublic\b/);
    expect(content).toMatch(/mkdir -p public/);
  });

  it('fetch-assets.sh uses lftp mirror with --only-newer (idempotent reboot)', () => {
    // --only-newer = skip les fichiers déjà à jour. Sans ça, chaque reboot
    // re-télécharge les 5 GB → 5 min de cold start au lieu de 30s.
    const content = fs.readFileSync(FETCH, 'utf8');
    expect(content).toMatch(/lftp[\s\S]*?mirror[\s\S]*?--only-newer/);
  });

  it('fetch-assets.sh degrades gracefully if FTP env vars missing', () => {
    // En dev local sans FTP credentials, le boot doit pas crash — log clair
    // que les templates avec assets vont échouer, mais le service répond
    // au healthcheck (utile pour CI ou test infra).
    const content = fs.readFileSync(FETCH, 'utf8');
    expect(content).toMatch(/FTP_HOST.*FTP_USER.*FTP_PASS/);
    // Exit 0 (graceful) plutôt que exit 1 si env manquante.
    expect(content).toMatch(/Booting WITHOUT fetching assets[\s\S]*?exit 0/);
  });

  it('start.sh exec node studio-poc/server.mjs (entrypoint server)', () => {
    const content = fs.readFileSync(START, 'utf8');
    expect(content).toMatch(/bash scripts\/fetch-assets\.sh/);
    expect(content).toMatch(/exec node studio-poc\/server\.mjs/);
  });

  it('server.mjs reads PORT from env (Railway injection) and binds 0.0.0.0 in prod', () => {
    // Sans `process.env.PORT`, Railway log un warning + redirige le trafic
    // vers le mauvais port (ou n'arrive pas à scan le service health).
    // Sans `0.0.0.0` (default 127.0.0.1), Railway ne peut pas atteindre le
    // service depuis l'extérieur du container.
    const content = fs.readFileSync(SERVER, 'utf8');
    expect(content).toMatch(/process\.env\.PORT/);
    expect(content).toMatch(/0\.0\.0\.0/);
  });
});
