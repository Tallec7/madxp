/**
 * Smoke tests — incident 2026-08-04 : `POST /api/image-to-video` remontait
 * `ERR_HTTP2_PROTOCOL_ERROR` / `status: 0` côté navigateur.
 *
 * Cause : sur une route multipart, tous les gardes (authenticate, requireRole,
 * requireClubPermission, uploadRateLimit) ET le `fileFilter` multer répondent
 * PENDANT l'envoi du corps. L'edge Railway relaie la réponse puis annule la
 * stream HTTP/2 du client, et le vrai 400/401/403/429 n'atteint jamais
 * l'application. Reproduit en prod : réponse reçue après 196 Ko envoyés sur
 * 5 Mo, puis `CANCEL (err 8)`.
 *
 * Ce fichier est un garde-fou : il doit ÉCHOUER si le drain, l'allowlist
 * partagée ou le régime ffmpeg GIF disparaissent.
 *
 * Usage: npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../../..');
const DRAIN_PATH = path.join(ROOT, 'src/middleware/drain-request.ts');
const SERVER_PATH = path.join(ROOT, 'src/server.ts');
const UPLOAD_PATH = path.join(ROOT, 'src/middleware/upload.ts');
const SERVICE_PATH = path.join(ROOT, 'src/services/image-to-video.service.ts');
const CONTROLLER_PATH = path.join(ROOT, 'src/controllers/content-deployment.controller.ts');

const DASHBOARD_ROOT = path.join(ROOT, '../central-dashboard/src/app');
const CONSTANTS_PATH = path.join(DASHBOARD_ROOT, 'core/constants/media-upload.constants.ts');
const UPLOAD_SERVICE_PATH = path.join(DASHBOARD_ROOT, 'features/content/video-upload.service.ts');
const UPLOAD_ZONE_PATH = path.join(DASHBOARD_ROOT, 'shared/components/video-upload-zone/video-upload-zone.component.ts');
const CONTENT_HTML_PATH = path.join(DASHBOARD_ROOT, 'features/content/content-management.component.html');

const read = (p: string): string => fs.readFileSync(p, 'utf8');

describe('smoke-content-upload-incident-2026-08-04', () => {
  // -----------------------------------------------------------------------
  // Backend — drain du corps avant réponse d'erreur sur route multipart
  // -----------------------------------------------------------------------

  it('drain-request.ts existe et exporte drainOnEarlyResponse', () => {
    expect(fs.existsSync(DRAIN_PATH)).toBe(true);
    expect(read(DRAIN_PATH)).toContain('export const drainOnEarlyResponse');
  });

  it('drain-request.ts ne s\'active que sur les requêtes multipart', () => {
    const content = read(DRAIN_PATH);
    expect(content).toContain("startsWith('multipart/form-data')");
  });

  it('drain-request.ts passe la main immédiatement si le corps est déjà consommé', () => {
    // Sans ce court-circuit, le cas nominal (multer a lu le corps) attendrait
    // un 'end' qui n'arrivera jamais → toutes les réponses d'upload pendraient.
    expect(read(DRAIN_PATH)).toMatch(/req\.complete\s*\|\|\s*req\.readableEnded/);
  });

  it('drain-request.ts plafonne le drain (pas d\'éponge à bande passante)', () => {
    const content = read(DRAIN_PATH);
    expect(content).toContain('MAX_DRAIN_BYTES');
    expect(content).toContain('drained > maxDrainBytes');
  });

  it('server.ts monte drainOnEarlyResponse AVANT les routes /api', () => {
    const content = read(SERVER_PATH);
    const mountIdx = content.indexOf('app.use(drainOnEarlyResponse(');
    const firstApiRouteIdx = content.indexOf("app.use('/api'");
    expect(mountIdx).toBeGreaterThan(0);
    expect(firstApiRouteIdx).toBeGreaterThan(0);
    expect(mountIdx).toBeLessThan(firstApiRouteIdx);
  });

  // -----------------------------------------------------------------------
  // Backend — GIF accepté et converti en préservant l'animation
  // -----------------------------------------------------------------------

  it('upload.ts: image/gif fait partie de ALLOWED_IMAGE_MIMES', () => {
    const content = read(UPLOAD_PATH);
    expect(content).toContain('export const ALLOWED_IMAGE_MIMES');
    expect(content).toContain("'image/gif'");
  });

  it('upload.ts: imageFilter s\'appuie sur ALLOWED_IMAGE_MIMES (pas de liste dupliquée)', () => {
    const content = read(UPLOAD_PATH);
    expect(content).toMatch(/const imageFilter[\s\S]{0,400}ALLOWED_IMAGE_MIMES\.includes\(file\.mimetype\)/);
  });

  it('image-to-video.service.ts: un GIF utilise -ignore_loop 0 (animation préservée)', () => {
    const content = read(SERVICE_PATH);
    expect(content).toContain("'-ignore_loop', '0'");
    expect(content).toContain('isAnimatedSource');
  });

  it('image-to-video.service.ts: -loop 1 / -framerate 1 restent réservés aux images fixes', () => {
    // Régression garde : si le branchement disparaît, un GIF est figé sur sa 1re frame.
    const content = read(SERVICE_PATH);
    const branchIdx = content.indexOf('if (this.isAnimatedSource(inputPath))');
    const loopIdx = content.indexOf("args.push('-loop', '1')");
    const framerateIdx = content.indexOf("args.push('-framerate', '1')");
    expect(branchIdx).toBeGreaterThan(0);
    expect(loopIdx).toBeGreaterThan(branchIdx);
    expect(framerateIdx).toBeGreaterThan(branchIdx);
  });

  it('image-to-video.service.ts: l\'extension temporaire est forcée pour un GIF sans extension', () => {
    const content = read(SERVICE_PATH);
    expect(content).toMatch(/sourceMimeType === 'image\/gif'[\s\S]{0,80}'\.gif'/);
  });

  it('content-deployment.controller.ts: transmet le mime-type source au service', () => {
    expect(read(CONTROLLER_PATH)).toContain('sourceMimeType: file.mimetype');
  });

  it('image-to-video.service.ts: le foreground du fond flou ne déborde jamais du canvas', () => {
    // Régression 2026-08-04 (2e passe) : `scale=-1:720` ne borne que la hauteur.
    // Une bannière 1200x150 devenait 5760x720 → overlay rogne → zoom + texte coupé.
    const content = read(SERVICE_PATH);
    expect(content).not.toContain('scale=-1:720');
    expect(content).toContain('[0:v]scale=1280:720:force_original_aspect_ratio=decrease[fg]');
  });

  // -----------------------------------------------------------------------
  // Dashboard — validation avant envoi + erreur lisible
  // -----------------------------------------------------------------------

  it('media-upload.constants.ts: allowlist client alignée avec le backend (dont image/gif)', () => {
    const client = read(CONSTANTS_PATH);
    const server = read(UPLOAD_PATH);
    const extract = (src: string, marker: string): string[] => {
      const start = src.indexOf(marker);
      const end = src.indexOf('];', start);
      return (src.slice(start, end).match(/'image\/[a-z+]+'/g) || []).sort();
    };
    const clientMimes = extract(client, 'ALLOWED_IMAGE_MIME_TYPES');
    const serverMimes = extract(server, 'ALLOWED_IMAGE_MIMES');
    expect(clientMimes).toContain("'image/gif'");
    expect(clientMimes).toEqual(serverMimes);
  });

  it('video-upload.service.ts: utilise l\'allowlist partagée (pas de liste hardcodée)', () => {
    const content = read(UPLOAD_SERVICE_PATH);
    expect(content).toContain('isAllowedImageType');
    expect(content).not.toContain("['image/jpeg', 'image/png', 'image/webp']");
  });

  it('video-upload-zone.component.ts: rejette les images hors allowlist AVANT l\'envoi', () => {
    const content = read(UPLOAD_ZONE_PATH);
    expect(content).toContain('isAllowedImageType(file)');
    // Le rejet doit produire un état d'erreur visible, pas un silence
    expect(content).toMatch(/Format non supporté/);
  });

  it('video-upload-zone.component.ts: status 0 n\'est plus affiché comme une erreur muette', () => {
    const content = read(UPLOAD_ZONE_PATH);
    expect(content).toContain('describeUploadError');
    expect(content).toContain('ErrorExtractor.isNetworkError');
    // L'ancien extracteur naïf renvoyait `undefined` sur une réponse perdue
    expect(content).not.toContain("error.error?.error || 'Erreur conversion image'");
    expect(content).not.toContain("error.error?.error || 'Erreur upload'");
  });

  it('content-management.component.html: l\'attribut accept vient de la constante partagée', () => {
    const content = read(CONTENT_HTML_PATH);
    expect(content).toContain('[attr.accept]="imageUploadAccept"');
    expect(content).not.toContain('accept="image/jpeg,image/png,image/webp"');
  });
});
