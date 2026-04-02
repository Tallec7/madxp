/**
 * Template Renderer Service
 *
 * Renders animated overlays (HTML/CSS or Lottie JSON) on top of an existing MP4 video.
 * Pipeline: Puppeteer captures transparent PNG frames → FFmpeg composites over source MP4.
 *
 * Used by: POST /api/content/render-template
 * Pattern: Same as image-to-video.service.ts (ffmpeg + temp files + buffer result)
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

// Puppeteer loaded lazily (heavy dependency, only needed for rendering)
type PuppeteerModule = typeof import('puppeteer');
let puppeteerModule: PuppeteerModule | null = null;

async function loadPuppeteer(): Promise<PuppeteerModule> {
  if (!puppeteerModule) {
    puppeteerModule = await import('puppeteer');
  }
  return puppeteerModule;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface TemplateRenderOptions {
  templateId: string;
  variables: Record<string, string>;
  /** Optional external Lottie JSON (from After Effects / Bodymovin export) */
  lottieJson?: Record<string, unknown>;
  /** Override FPS (default: match source video) */
  fps?: number;
}

export interface TemplateRenderResult {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
  durationSeconds: number;
}

// ── Built-in HTML/CSS Templates ───────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface TemplateDefinition {
  buildHtml: (vars: Record<string, string>) => string;
  defaultDurationS: number;
}

function buildPlayerNameHTML(vars: Record<string, string>): string {
  const nom = vars['nom'] || 'JOUEUR';
  const prenom = vars['prenom'] || '';
  const numero = vars['numero'] || '';
  const position = vars['position'] || 'bottom';
  const color = vars['color'] || '#FFFFFF';
  const bgColor = vars['bg'] || 'rgba(0,0,0,0.6)';
  const accentColor = vars['accent'] || '#FFD700';
  const dur = parseFloat(vars['_duration'] || '3.4');
  const fadeOutStart = Math.max(dur - 0.6, 1.5);

  const positionCSS = position === 'top'
    ? 'top: 60px; bottom: auto;'
    : position === 'center'
      ? 'top: 50%; bottom: auto; transform: translateX(-50%) translateY(-50%);'
      : 'bottom: 80px; top: auto;';

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }
  .player-banner {
    position: absolute; ${positionCSS} left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 24px;
    padding: 18px 48px; background: ${escapeHtml(bgColor)}; backdrop-filter: blur(12px);
    border-radius: 16px; border: 2px solid rgba(255,255,255,0.15);
    opacity: 0;
    animation: bannerIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.6s forwards, bannerOut 0.4s ease-in ${fadeOutStart}s forwards;
  }
  .numero { font-size: 72px; font-weight: 900; color: ${escapeHtml(accentColor)}; line-height: 1; min-width: 80px; text-align: center; }
  .separator { width: 3px; height: 60px; background: rgba(255,255,255,0.25); border-radius: 2px; }
  .name-block { display: flex; flex-direction: column; gap: 2px; }
  .prenom { font-size: 32px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.05em; text-transform: uppercase; }
  .nom { font-size: 56px; font-weight: 900; color: ${escapeHtml(color)}; letter-spacing: 0.08em; text-transform: uppercase; }
  @keyframes bannerIn { from { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.95); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
  @keyframes bannerOut { from { opacity: 1; transform: translateX(-50%) translateY(0); } to { opacity: 0; transform: translateX(-50%) translateY(-15px); } }
</style></head><body>
<div class="player-banner">
  ${numero ? `<span class="numero">#${escapeHtml(numero)}</span><span class="separator"></span>` : ''}
  <div class="name-block">
    ${prenom ? `<span class="prenom">${escapeHtml(prenom)}</span>` : ''}
    <span class="nom">${escapeHtml(nom)}</span>
  </div>
</div></body></html>`;
}

function buildScorePlusHTML(vars: Record<string, string>): string {
  const score = vars['score'] || '+1';
  const nom = vars['nom'] || '';
  const club = vars['club'] || '';
  const color = vars['color'] || '#FF3333';
  const dur = parseFloat(vars['_duration'] || '4');
  const fadeOutStart = Math.max(dur - 0.8, 1.5);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }
  .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .club { font-size: 48px; font-weight: 700; color: #FFD700; letter-spacing: 0.1em; margin-bottom: 20px; text-transform: uppercase; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.15s forwards; }
  .score { font-size: 320px; font-weight: 900; color: ${escapeHtml(color)}; line-height: 1; opacity: 0; animation: scaleIn 0.4s ease-out 0s forwards; text-shadow: 0 0 80px ${escapeHtml(color)}66; }
  .player { font-size: 80px; font-weight: 700; color: white; margin-top: 10px; letter-spacing: 0.08em; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.3s forwards; text-transform: uppercase; }
  .overlay { animation: fadeOutAll 0.5s ease-in ${fadeOutStart}s forwards; }
  @keyframes scaleIn { from { opacity: 0; transform: scale(1.6); } to { opacity: 1; transform: scale(1); } }
  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeOutAll { from { opacity: 1; } to { opacity: 0; } }
</style></head><body>
<div class="overlay">
  ${club ? `<div class="club">${escapeHtml(club)}</div>` : ''}
  <div class="score">${escapeHtml(score)}</div>
  ${nom ? `<div class="player">${escapeHtml(nom)}</div>` : ''}
</div></body></html>`;
}

function buildButeurHTML(vars: Record<string, string>): string {
  const nom = vars['nom'] || '';
  const numero = vars['numero'] || '';
  const club = vars['club'] || '';
  const dur = parseFloat(vars['_duration'] || '5');
  const fadeOutStart = Math.max(dur - 1, 2);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }
  .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .club { font-size: 50px; font-weight: 700; color: #FFD700; letter-spacing: 0.12em; margin-bottom: 30px; text-transform: uppercase; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.1s forwards; }
  .but { font-size: 140px; font-weight: 900; color: #FF3344; line-height: 1; opacity: 0; animation: punchIn 0.5s ease-out 0s forwards; text-shadow: 0 0 60px rgba(255,50,70,0.5); }
  .numero { font-size: 220px; font-weight: 900; color: white; line-height: 1; opacity: 0; animation: scaleIn 0.5s ease-out 0.4s forwards; }
  .player { font-size: 90px; font-weight: 700; color: white; margin-top: 10px; letter-spacing: 0.08em; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.7s forwards; text-transform: uppercase; }
  .overlay { animation: fadeOutAll 0.6s ease-in ${fadeOutStart}s forwards; }
  @keyframes punchIn { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeOutAll { from { opacity: 1; } to { opacity: 0; } }
</style></head><body>
<div class="overlay">
  ${club ? `<div class="club">${escapeHtml(club)}</div>` : ''}
  <div class="but">BUUUUT !</div>
  ${numero ? `<div class="numero">#${escapeHtml(numero)}</div>` : ''}
  ${nom ? `<div class="player">${escapeHtml(nom)}</div>` : ''}
</div></body></html>`;
}

const BUILT_IN_TEMPLATES: Record<string, TemplateDefinition> = {
  tpl_player: { buildHtml: buildPlayerNameHTML, defaultDurationS: 3.4 },
  tpl_score_plus: { buildHtml: buildScorePlusHTML, defaultDurationS: 4 },
  tpl_buteur: { buildHtml: buildButeurHTML, defaultDurationS: 5 },
};

// ── Service ───────────────────────────────────────────────────────────────

class TemplateRendererService {
  /**
   * Check if rendering dependencies are available (ffmpeg + puppeteer).
   */
  async isAvailable(): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });
        proc.on('close', (code) => (code === 0 ? resolve() : reject()));
        proc.on('error', reject);
      });
      await loadPuppeteer();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available built-in template IDs.
   */
  getTemplateIds(): string[] {
    return Object.keys(BUILT_IN_TEMPLATES);
  }

  /**
   * Render an animated overlay on top of a source MP4 video.
   *
   * @param videoBuffer - Source MP4 video buffer
   * @param originalFilename - Original filename of the source video
   * @param options - Template ID, variables, optional Lottie JSON
   * @returns Buffer of the composited MP4
   */
  async render(
    videoInput: Buffer | string,
    originalFilename: string,
    options: TemplateRenderOptions
  ): Promise<TemplateRenderResult> {
    const tempDir = os.tmpdir();
    const tempId = uuidv4();
    const inputPath = typeof videoInput === 'string'
      ? videoInput
      : path.join(tempDir, `neopro-tpl-input-${tempId}.mp4`);
    const framesDir = path.join(tempDir, `neopro-tpl-frames-${tempId}`);
    const outputPath = path.join(tempDir, `neopro-tpl-output-${tempId}.mp4`);

    try {
      // 1. Write source video to temp file (skip if path provided)
      if (typeof videoInput !== 'string') {
        await fs.promises.writeFile(inputPath, videoInput);
      }

      // 2. Probe source video metadata
      const probe = await this.probeVideo(inputPath);
      const fps = options.fps || probe.fps;
      const durationS = probe.durationS;

      logger.info('Template render starting', {
        templateId: options.templateId,
        variables: options.variables,
        fps,
        durationS,
        inputSize: videoBuffer.length,
      });

      // 3. Build overlay HTML
      const varsWithDuration = { ...options.variables, _duration: String(durationS) };
      let html: string;

      if (options.lottieJson) {
        html = this.buildLottieHTML(options.lottieJson);
      } else {
        const template = BUILT_IN_TEMPLATES[options.templateId];
        if (!template) {
          throw new Error(`Unknown template: ${options.templateId}. Available: ${Object.keys(BUILT_IN_TEMPLATES).join(', ')}`);
        }
        html = template.buildHtml(varsWithDuration);
      }

      // 4. Render transparent PNG frames via Puppeteer
      await fs.promises.mkdir(framesDir, { recursive: true });
      await this.renderFrames(html, framesDir, fps, durationS);

      // 5. Composite with FFmpeg
      await this.composite(inputPath, framesDir, outputPath, fps);

      // 6. Read result
      const resultBuffer = await fs.promises.readFile(outputPath);
      const baseName = path.basename(originalFilename, path.extname(originalFilename));
      const resultFilename = `${baseName}_${options.templateId}.mp4`;

      logger.info('Template render complete', {
        templateId: options.templateId,
        outputSize: resultBuffer.length,
        durationS,
      });

      return {
        buffer: resultBuffer,
        filename: resultFilename,
        mimetype: 'video/mp4',
        size: resultBuffer.length,
        durationSeconds: durationS,
      };
    } finally {
      // Cleanup temp files
      await this.cleanupTemp(inputPath, framesDir, outputPath);
    }
  }

  // ── Private methods ───────────────────────────────────────────────────

  private async probeVideo(filePath: string): Promise<{ fps: number; durationS: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=r_frame_rate,width,height',
        '-show_entries', 'format=duration',
        '-of', 'json',
        filePath,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
        try {
          const data = JSON.parse(stdout);
          const stream = data.streams?.[0] || {};
          const fpsRaw = stream.r_frame_rate || '25/1';
          const [num, den] = fpsRaw.split('/').map(Number);
          resolve({
            fps: Math.round(num / (den || 1)),
            durationS: parseFloat(data.format?.duration || '5'),
            width: stream.width || 1920,
            height: stream.height || 1080,
          });
        } catch (e) {
          reject(e);
        }
      });
      proc.on('error', reject);
    });
  }

  private async renderFrames(html: string, framesDir: string, fps: number, durationS: number): Promise<void> {
    const puppeteer = await loadPuppeteer();
    const totalFrames = Math.ceil(durationS * fps);

    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Pause CSS animations for frame-by-frame control
      await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; }' });

      for (let frame = 0; frame < totalFrames; frame++) {
        const timeS = frame / fps;

        // Jump CSS animations to this point in time (code runs in Chromium, not Node)
        await page.evaluate(`
          document.querySelectorAll('*').forEach(el => {
            el.getAnimations().forEach(anim => { anim.currentTime = ${timeS * 1000}; });
          });
        `);

        await new Promise((r) => setTimeout(r, 15));

        const frameNum = String(frame).padStart(5, '0');
        await page.screenshot({
          path: path.join(framesDir, `frame_${frameNum}.png`),
          type: 'png',
          omitBackground: true,
        });
      }

      logger.info('Overlay frames rendered', { totalFrames, fps });
    } finally {
      await browser.close();
    }
  }

  private async composite(inputVideo: string, framesDir: string, outputVideo: string, fps: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-i', inputVideo,
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'frame_%05d.png'),
        '-filter_complex', '[0:v][1:v]overlay=0:0:shortest=1:format=auto',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputVideo,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error('FFmpeg composite failed', { code, stderr: stderr.slice(-500) });
          return reject(new Error(`FFmpeg exited with code ${code}`));
        }
        resolve();
      });
      proc.on('error', reject);
    });
  }

  private buildLottieHTML(lottieJson: Record<string, unknown>): string {
    return `<!DOCTYPE html><html><head>
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
  #c { width: 1920px; height: 1080px; }
  #c svg { width: 100% !important; height: 100% !important; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"><` + `/script>
</head><body>
<div id="c"></div>
<script>
  const anim = lottie.loadAnimation({
    container: document.getElementById('c'),
    renderer: 'svg',
    loop: false,
    autoplay: false,
    animationData: ${JSON.stringify(lottieJson)}
  });
  window.goToFrame = (f) => anim.goToAndStop(f, true);
  window.totalFrames = anim.totalFrames;
  window.isLottieMode = true;
  window.ready = true;
<` + `/script></body></html>`;
  }

  private async cleanupTemp(inputPath: string, framesDir: string, outputPath: string): Promise<void> {
    try {
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
      await fs.promises.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    } catch {
      // Cleanup is best-effort
    }
  }
}

export const templateRendererService = new TemplateRendererService();
export default templateRendererService;
