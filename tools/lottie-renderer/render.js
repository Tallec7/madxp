/**
 * Template overlay + MP4 → new MP4 composite renderer
 *
 * Pipeline:
 *   1. Open headless Chromium with animated HTML template (transparent background)
 *   2. Capture each frame as PNG with alpha channel
 *   3. Use FFmpeg to composite the PNG sequence over the input MP4
 *
 * Supports two modes:
 *   - Built-in HTML/CSS templates (--template tpl_score_plus)
 *   - External Lottie JSON files from After Effects/Bodymovin (--lottie animation.json)
 *
 * Usage:
 *   node render.js input.mp4 --template tpl_score_plus --var score=+3 --var nom=DUPONT --var club=UCKNEF
 *   node render.js input.mp4 --template tpl_buteur --var nom=DUPONT --var numero=7 --var club=UCKNEF
 *   node render.js input.mp4 --lottie gabin-export.json
 *   node render.js input.mp4 -o output.mp4 --fps 30
 */
import puppeteer from 'puppeteer';
import { spawnSync, execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    input: 'test-input.mp4',
    output: '',
    templateId: 'tpl_score_plus',
    lottieFile: null,
    variables: {},
    fps: 30,
    width: 1920,
    height: 1080,
    durationS: 4, // overlay duration in seconds
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--template' || arg === '-t') { config.templateId = args[++i]; }
    else if (arg === '--lottie' || arg === '-l') { config.lottieFile = args[++i]; }
    else if (arg === '--var' || arg === '-v') {
      const [key, ...rest] = args[++i].split('=');
      config.variables[key] = rest.join('=');
    }
    else if (arg === '--fps') { config.fps = parseInt(args[++i], 10); }
    else if (arg === '--duration' || arg === '-d') { config.durationS = parseFloat(args[++i]); }
    else if (arg === '--output' || arg === '-o') { config.output = args[++i]; }
    else if (!arg.startsWith('-')) { config.input = arg; }
    i++;
  }

  if (!config.output) {
    const ext = path.extname(config.input);
    const base = path.basename(config.input, ext);
    config.output = `${base}_overlay${ext}`;
  }

  return config;
}

// ── HTML/CSS Templates ────────────────────────────────────────────────────

function buildScorePlusHTML(vars) {
  const score = vars.score || '+1';
  const nom = vars.nom || '';
  const club = vars.club || '';
  const color = vars.color || '#FF3333';

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }
  .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .club { font-size: 48px; font-weight: 700; color: #FFD700; letter-spacing: 0.1em; margin-bottom: 20px; text-transform: uppercase; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.15s forwards; }
  .score { font-size: 320px; font-weight: 900; color: ${color}; line-height: 1; opacity: 0; animation: scaleIn 0.4s ease-out 0s forwards; text-shadow: 0 0 80px ${color}66; }
  .player { font-size: 80px; font-weight: 700; color: white; margin-top: 10px; letter-spacing: 0.08em; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.3s forwards; text-transform: uppercase; }

  /* Fade out all elements before end */
  .club, .score, .player { animation-fill-mode: forwards; }
  .overlay { animation: fadeOutAll 0.5s ease-in 3.2s forwards; }

  @keyframes scaleIn { from { opacity: 0; transform: scale(1.6); } to { opacity: 1; transform: scale(1); } }
  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeOutAll { from { opacity: 1; } to { opacity: 0; } }
</style>
</head><body>
<div class="overlay">
  ${club ? `<div class="club">${escapeHtml(club)}</div>` : ''}
  <div class="score">${escapeHtml(score)}</div>
  ${nom ? `<div class="player">${escapeHtml(nom)}</div>` : ''}
</div>
</body></html>`;
}

function buildButeurHTML(vars) {
  const nom = vars.nom || '';
  const numero = vars.numero || '';
  const club = vars.club || '';

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }
  .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .club { font-size: 50px; font-weight: 700; color: #FFD700; letter-spacing: 0.12em; margin-bottom: 30px; text-transform: uppercase; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.1s forwards; }
  .but { font-size: 140px; font-weight: 900; color: #FF3344; line-height: 1; opacity: 0; animation: punchIn 0.5s ease-out 0s forwards; text-shadow: 0 0 60px rgba(255,50,70,0.5); letter-spacing: 0.05em; }
  .numero { font-size: 220px; font-weight: 900; color: white; line-height: 1; opacity: 0; animation: scaleIn 0.5s ease-out 0.4s forwards; text-shadow: 0 0 40px rgba(255,255,255,0.3); }
  .player { font-size: 90px; font-weight: 700; color: white; margin-top: 10px; letter-spacing: 0.08em; opacity: 0; animation: fadeSlideUp 0.5s ease-out 0.7s forwards; text-transform: uppercase; }

  .overlay { animation: fadeOutAll 0.6s ease-in 4s forwards; }

  @keyframes punchIn { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
  @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeOutAll { from { opacity: 1; } to { opacity: 0; } }
</style>
</head><body>
<div class="overlay">
  ${club ? `<div class="club">${escapeHtml(club)}</div>` : ''}
  <div class="but">BUUUUT !</div>
  ${numero ? `<div class="numero">#${escapeHtml(numero)}</div>` : ''}
  ${nom ? `<div class="player">${escapeHtml(nom)}</div>` : ''}
</div>
</body></html>`;
}

function buildLottieHTML(lottieJson) {
  return `<!DOCTYPE html><html><head>
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
  #c { width: 1920px; height: 1080px; }
  #c svg { width: 100% !important; height: 100% !important; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"><\/script>
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
<\/script>
</body></html>`;
}

function buildPlayerNameHTML(vars) {
  const nom = vars.nom || 'JOUEUR';
  const prenom = vars.prenom || '';
  const numero = vars.numero || '';
  const position = vars.position || 'bottom'; // 'bottom' | 'top' | 'center'
  const color = vars.color || '#FFFFFF';
  const bgColor = vars.bg || 'rgba(0,0,0,0.6)';
  const accentColor = vars.accent || '#FFD700';

  const positionCSS = position === 'top'
    ? 'top: 60px; bottom: auto;'
    : position === 'center'
      ? 'top: 50%; bottom: auto; transform: translateX(-50%) translateY(-50%);'
      : 'bottom: 80px; top: auto;'; // default: bottom

  // Fade out timing adapts to video duration (vars._duration)
  const dur = parseFloat(vars._duration || '3.4');
  const fadeOutStart = Math.max(dur - 0.6, 1.5);

  return `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; overflow: hidden; font-family: 'Inter', Arial, sans-serif; }

  .player-banner {
    position: absolute;
    ${positionCSS}
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 18px 48px;
    background: ${bgColor};
    backdrop-filter: blur(12px);
    border-radius: 16px;
    border: 2px solid rgba(255,255,255,0.15);
    opacity: 0;
    animation: bannerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards;
  }

  .player-banner .numero {
    font-size: 72px;
    font-weight: 900;
    color: ${accentColor};
    line-height: 1;
    min-width: 80px;
    text-align: center;
  }

  .player-banner .separator {
    width: 3px;
    height: 60px;
    background: rgba(255,255,255,0.25);
    border-radius: 2px;
  }

  .player-banner .name-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .player-banner .prenom {
    font-size: 32px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .player-banner .nom {
    font-size: 56px;
    font-weight: 900;
    color: ${color};
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .player-banner { animation: bannerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards, bannerOut 0.4s ease-in ${fadeOutStart}s forwards; }

  @keyframes bannerIn {
    from { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.95); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes bannerOut {
    from { opacity: 1; transform: translateX(-50%) translateY(0); }
    to { opacity: 0; transform: translateX(-50%) translateY(-15px); }
  }
</style>
</head><body>
<div class="player-banner">
  ${numero ? `<span class="numero">#${escapeHtml(numero)}</span><span class="separator"></span>` : ''}
  <div class="name-block">
    ${prenom ? `<span class="prenom">${escapeHtml(prenom)}</span>` : ''}
    <span class="nom">${escapeHtml(nom)}</span>
  </div>
</div>
</body></html>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TEMPLATES = {
  tpl_score_plus: { build: buildScorePlusHTML, defaultDurationS: 4 },
  tpl_buteur: { build: buildButeurHTML, defaultDurationS: 5 },
  tpl_player: { build: buildPlayerNameHTML, defaultDurationS: 3.4 },
};

// ── Step 1: Render frames via Puppeteer ───────────────────────────────────

async function renderFrames(html, framesDir, fps, width, height, durationS, isLottie = false) {
  const totalFrames = Math.ceil(durationS * fps);
  console.log(`  Rendering ${totalFrames} frames at ${fps}fps (${width}x${height}, ${durationS}s)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  if (isLottie) {
    await page.waitForFunction('window.ready === true', { timeout: 10000 });
  }

  // For CSS animations: reload page for each batch to reset animation state
  // We use a timeline approach — set animation-delay to negative to jump to each frame
  if (!isLottie) {
    // Inject CSS to pause all animations
    await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; }' });
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeS = frame / fps;

    if (isLottie) {
      await page.evaluate((f) => window.goToFrame(f), frame);
    } else {
      // Jump CSS animations to this point in time
      await page.evaluate((t) => {
        document.querySelectorAll('*').forEach(el => {
          el.style.animationDelay = '';
          el.getAnimations().forEach(anim => {
            anim.currentTime = t * 1000;
          });
        });
      }, timeS);
    }

    await new Promise(r => setTimeout(r, 15)); // Let render settle

    const frameNum = String(frame).padStart(5, '0');
    await page.screenshot({
      path: path.join(framesDir, `frame_${frameNum}.png`),
      type: 'png',
      omitBackground: true,
    });

    if (frame % 30 === 0 || frame === totalFrames - 1) {
      process.stdout.write(`  Frame ${frame + 1}/${totalFrames}\r`);
    }
  }

  console.log(`  ✓ ${totalFrames} frames captured              `);
  await browser.close();
}

// ── Step 2: Composite with FFmpeg ─────────────────────────────────────────

function compositeWithFFmpeg(inputVideo, framesDir, outputVideo, fps) {
  console.log(`  Compositing overlay on ${inputVideo}...`);

  const cmd = [
    'ffmpeg', '-y',
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
    outputVideo
  ];

  const result = spawnSync(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });

  if (result.status !== 0) {
    console.error(result.stderr?.toString());
    throw new Error(`FFmpeg exited with code ${result.status}`);
  }

  console.log(`  ✓ Output: ${outputVideo}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const framesDir = path.join(__dirname, '.frames');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Neopro Template + MP4 Renderer (proto)  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();
  console.log(`  Input:    ${config.input}`);
  console.log(`  Output:   ${config.output}`);
  console.log(`  Template: ${config.lottieFile ? 'Lottie: ' + config.lottieFile : config.templateId}`);
  console.log(`  Vars:     ${JSON.stringify(config.variables)}`);
  console.log();

  if (!existsSync(config.input)) {
    console.error(`✗ Input video not found: ${config.input}`);
    process.exit(1);
  }

  try { execSync('ffmpeg -version', { stdio: 'pipe' }); }
  catch { console.error('✗ FFmpeg not found. Install: brew install ffmpeg'); process.exit(1); }

  // Build HTML
  let html;
  let isLottie = false;
  let durationS = config.durationS;

  if (config.lottieFile) {
    console.log(`[1/3] Loading Lottie JSON: ${config.lottieFile}`);
    const lottieJson = JSON.parse(readFileSync(config.lottieFile, 'utf8'));
    html = buildLottieHTML(lottieJson);
    isLottie = true;
    durationS = (lottieJson.op - lottieJson.ip) / lottieJson.fr;
  } else {
    const template = TEMPLATES[config.templateId];
    if (!template) {
      console.error(`✗ Unknown template: ${config.templateId}`);
      console.error(`  Available: ${Object.keys(TEMPLATES).join(', ')}`);
      process.exit(1);
    }
    console.log(`[1/3] Building HTML template: ${config.templateId}`);
    html = template.build(config.variables);
    durationS = config.durationS || template.defaultDurationS;
  }

  // Clean & create frames dir
  if (existsSync(framesDir)) rmSync(framesDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  // Render frames
  console.log(`[2/3] Rendering ${durationS}s of overlay frames...`);
  await renderFrames(html, framesDir, config.fps, config.width, config.height, durationS, isLottie);

  // Composite
  console.log(`[3/3] Compositing with FFmpeg...`);
  compositeWithFFmpeg(config.input, framesDir, config.output, config.fps);

  // Cleanup
  rmSync(framesDir, { recursive: true });

  console.log();
  console.log(`✓ Done! Output: ${config.output}`);
  console.log(`  Open: open "${config.output}"`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
