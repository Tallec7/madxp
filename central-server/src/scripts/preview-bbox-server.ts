/**
 * Mini serveur de preview localhost pour le POC auto_crop bbox.
 *
 * Permet de tester le service png-bbox.service sur de vraies photos via
 * une UI drag-drop, sans avoir besoin de l'API endpoint super_admin câblé.
 *
 * Usage :
 *   npm run template:preview-bbox
 *   → http://localhost:3030
 *
 * Sécurité : ce serveur écoute uniquement sur 127.0.0.1, pas d'auth, pas
 * de persistence. À utiliser en dev only — ne jamais bind sur 0.0.0.0.
 */

import express, { type Request, type Response } from 'express';
import { PNG } from 'pngjs';
import { pngBboxService } from '../services/png-bbox.service';

const PORT = Number(process.env.BBOX_PREVIEW_PORT ?? 3030);
const app = express();

app.use(express.raw({ type: 'image/png', limit: '20mb' }));

const HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>POC auto_crop bbox — preview</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    margin: 0;
    padding: 24px;
    background: #f5f5f7;
    color: #1d1d1f;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1c; color: #f0f0f2; }
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .lead { color: #666; margin: 0 0 24px; font-size: 14px; }
  @media (prefers-color-scheme: dark) { .lead { color: #999; } }
  .drop {
    border: 2px dashed #c0c0c8;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s;
    background: white;
  }
  @media (prefers-color-scheme: dark) {
    .drop { background: #2a2a2c; border-color: #555; }
  }
  .drop:hover, .drop.drag {
    border-color: #007aff;
    background: #e8f1ff;
  }
  @media (prefers-color-scheme: dark) {
    .drop:hover, .drop.drag { background: #003566; }
  }
  .drop input { display: none; }
  .controls { margin: 16px 0; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .controls label { font-size: 13px; color: #666; }
  .controls input[type=number] {
    width: 60px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 6px;
    background: white; color: inherit;
  }
  @media (prefers-color-scheme: dark) {
    .controls input[type=number] { background: #2a2a2c; border-color: #555; color: #f0f0f2; }
  }
  .results { margin-top: 24px; display: none; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  @media (prefers-color-scheme: dark) {
    .card { background: #2a2a2c; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  }
  .card h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
  .card img { max-width: 100%; height: auto; border-radius: 6px; display: block; background: #f0f0f0 url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect x='0' y='0' width='8' height='8' fill='%23e0e0e0'/><rect x='8' y='8' width='8' height='8' fill='%23e0e0e0'/></svg>"); }
  pre {
    background: #1d1d1f; color: #00ff00; padding: 12px; border-radius: 8px; overflow-x: auto;
    font-size: 12px; line-height: 1.5;
  }
  .err { color: #ff3b30; padding: 12px; background: #fff0f0; border-radius: 8px; margin-top: 16px; }
  @media (prefers-color-scheme: dark) { .err { background: #4a1a1a; } }
  .legend { display: flex; gap: 16px; font-size: 12px; margin-top: 8px; flex-wrap: wrap; }
  .swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
</style>
</head>
<body>
<h1>POC auto_crop bbox PNG</h1>
<p class="lead">Drop une photo joueur PNG (avec canal alpha) pour valider le cadrage automatique. SPEC JOUEUR Q15.</p>

<label class="drop" id="drop">
  <input type="file" id="file" accept="image/png">
  <div id="dropText">📥 Drop une photo PNG ici (ou clique pour sélectionner)</div>
</label>

<div class="controls">
  <label>Seuil alpha (0-255) :
    <input type="number" id="threshold" value="16" min="0" max="255" step="1">
  </label>
</div>

<div id="error" class="err" style="display:none"></div>

<div class="results" id="results">
  <div class="grid">
    <div class="card">
      <h3>Photo originale</h3>
      <img id="origImg" alt="">
    </div>
    <div class="card">
      <h3>BBox détectée + crosshairs</h3>
      <img id="bboxImg" alt="">
      <div class="legend">
        <span><span class="swatch" style="background:#ff0000"></span>BBox</span>
        <span><span class="swatch" style="background:#00cc00"></span>Centre canvas</span>
        <span><span class="swatch" style="background:#0078ff"></span>Centre bbox</span>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Résultat algo</h3>
    <pre id="json"></pre>
  </div>
</div>

<script>
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const thresholdInput = document.getElementById('threshold');
const results = document.getElementById('results');
const errBox = document.getElementById('error');
const origImg = document.getElementById('origImg');
const bboxImg = document.getElementById('bboxImg');
const jsonBox = document.getElementById('json');

['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => {
  ev.preventDefault(); drop.classList.add('drag');
}));
['dragleave', 'drop'].forEach(e => drop.addEventListener(e, () => drop.classList.remove('drag')));
drop.addEventListener('drop', ev => {
  ev.preventDefault();
  if (ev.dataTransfer?.files?.[0]) processFile(ev.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) processFile(fileInput.files[0]);
});

async function processFile(file) {
  errBox.style.display = 'none';
  if (!file.type.includes('png')) {
    return showError('Ce fichier n\\'est pas un PNG.');
  }
  const buf = await file.arrayBuffer();
  origImg.src = URL.createObjectURL(file);

  const threshold = thresholdInput.value || '16';
  try {
    const r = await fetch('/bbox?threshold=' + encodeURIComponent(threshold) + '&visual=1', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: buf,
    });
    if (!r.ok) {
      const txt = await r.text();
      return showError('Erreur serveur: ' + r.status + ' — ' + txt);
    }
    const json = JSON.parse(r.headers.get('x-bbox-result') || '{}');
    jsonBox.textContent = JSON.stringify(json, null, 2);
    const blob = await r.blob();
    bboxImg.src = URL.createObjectURL(blob);
    results.style.display = 'block';
  } catch (e) {
    showError('Erreur réseau: ' + e.message);
  }
}

function showError(msg) {
  errBox.textContent = msg;
  errBox.style.display = 'block';
  results.style.display = 'none';
}
</script>
</body>
</html>`;

app.get('/', (_req: Request, res: Response) => {
  res.type('html').send(HTML);
});

app.post('/bbox', async (req: Request, res: Response) => {
  try {
    const buffer = req.body as Buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      res.status(400).send('Body must be a PNG');
      return;
    }
    const threshold = Number(req.query.threshold ?? 16);
    const visual = req.query.visual === '1';

    const t0 = Date.now();
    const hasAlpha = await pngBboxService.hasAlphaChannel(buffer);
    const result = await pngBboxService.computeAlphaBbox(buffer, {
      alpha_threshold: threshold,
    });
    const elapsed_ms = Date.now() - t0;

    const summary = {
      ...result,
      has_alpha_channel: hasAlpha,
      elapsed_ms,
    };

    res.setHeader('x-bbox-result', JSON.stringify(summary));

    if (visual && !result.empty) {
      const annotated = drawOverlay(buffer, result.bbox, result.canvas_width, result.canvas_height);
      res.type('image/png').send(annotated);
    } else {
      res.type('image/png').send(buffer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).send(msg);
  }
});

function drawOverlay(
  buffer: Buffer,
  bbox: { top: number; left: number; right: number; bottom: number },
  width: number,
  height: number
): Buffer {
  const png = PNG.sync.read(buffer);
  const data = png.data;

  const drawPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  // Rectangle rouge épais (3px) sur les 4 bords de la bbox
  for (let dx = -1; dx <= 1; dx++) {
    for (let x = bbox.left; x <= bbox.right; x++) {
      drawPixel(x, bbox.top + dx, 255, 0, 0);
      drawPixel(x, bbox.bottom + dx, 255, 0, 0);
    }
    for (let y = bbox.top; y <= bbox.bottom; y++) {
      drawPixel(bbox.left + dx, y, 255, 0, 0);
      drawPixel(bbox.right + dx, y, 255, 0, 0);
    }
  }

  // Crosshair vert (centre canvas) + bleu (centre bbox)
  const canvasCx = Math.round((width - 1) / 2);
  const canvasCy = Math.round((height - 1) / 2);
  const bboxCx = Math.round((bbox.left + bbox.right) / 2);
  const bboxCy = Math.round((bbox.top + bbox.bottom) / 2);
  const crossSize = Math.max(10, Math.min(width, height) / 40);
  for (let i = -crossSize; i <= crossSize; i++) {
    drawPixel(canvasCx + i, canvasCy, 0, 200, 0);
    drawPixel(canvasCx, canvasCy + i, 0, 200, 0);
    drawPixel(bboxCx + i, bboxCy, 0, 120, 255);
    drawPixel(bboxCx, bboxCy + i, 0, 120, 255);
  }

  return PNG.sync.write(png);
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`📸 BBox preview server : http://localhost:${PORT}`);
  console.log('   Drop a PNG to see the auto_crop bbox detection in action.');
});
