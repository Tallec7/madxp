import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Player } from '@remotion/player';
import { ButSimple } from '../../src/ButSimple';
import { ButImgJoueur } from '../../src/ButImgJoueur';

// Filtre le spam d'AbortError émis par Chrome quand il met en pause power-save
// les <video> sans piste audio (video-only background media). Le `initiallyMuted`
// + `allow="autoplay"` iframe ne suffisent pas : chaque OffthreadVideo empilé
// déclenche le warning indépendamment. Lecture non affectée — bruit cosmétique.
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args[0];
  if (typeof msg === 'string' && msg.includes('Could not play video')) return;
  origConsoleError(...args);
};

// ── Registry des compositions ─────────────────────────────────────────────────

interface CompositionDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>;
  durationInFrames: number;
  fps: number;
  // Dossiers de masques PNG per-frame à précharger pour éviter les stutters
  // (1 HTTP request par frame sinon → 30 req/s au premier passage).
  maskDirs?: string[];
}

const COMPOSITIONS: Record<string, CompositionDef> = {
  ButSimple: {
    component: ButSimple,
    durationInFrames: 180,
    fps: 30,
    maskDirs: ['masks/but-simple-C'],
  },
  ButImgJoueur: {
    component: ButImgJoueur,
    durationInFrames: 210,
    fps: 30,
    maskDirs: ['masks/but-img-joueur-C', 'masks/but-img-joueur-E'],
  },
};

// Précharge les PNGs de masque ET force leur décodage bitmap.
// Sans decode() + sans rétention des Image, le GC peut libérer les bitmaps
// et CSS mask-image redécode async à chaque frame → flash/saccade pendant
// la décompression. On garde les Image en mémoire pour verrouiller le cache
// décodé du navigateur.
const preloadedDirs = new Set<string>();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const maskImageCache: HTMLImageElement[] = [];
function preloadMasks(dirs: string[], frames: number): void {
  const base = new URL('./public/', window.location.href).href;
  for (const dir of dirs) {
    if (preloadedDirs.has(dir)) continue;
    preloadedDirs.add(dir);
    for (let i = 1; i <= frames; i++) {
      const img = new Image();
      img.decoding = 'sync';
      img.src = `${base}${dir}/${String(i).padStart(4, '0')}.png`;
      // decode() force la décompression off-main-thread avant usage.
      img.decode().catch(() => { /* ignore — HTTP cache gère le fallback */ });
      maskImageCache.push(img);
    }
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [compositionId, setCompositionId] = useState<string>('ButSimple');
  const [props, setProps] = useState<Record<string, unknown>>({});

  useEffect(() => {
    // Initialisation depuis les query params (ex: ?composition=ButSimple&props=...)
    const params = new URLSearchParams(window.location.search);
    const comp = params.get('composition');
    if (comp && COMPOSITIONS[comp]) setCompositionId(comp);

    // Préchauffe le cache des masques PNG de la composition initiale.
    const initialId = comp && COMPOSITIONS[comp] ? comp : 'ButSimple';
    const initialComp = COMPOSITIONS[initialId];
    if (initialComp?.maskDirs) preloadMasks(initialComp.maskDirs, initialComp.durationInFrames);

    const propsParam = params.get('props');
    if (propsParam) {
      try {
        setProps(JSON.parse(decodeURIComponent(propsParam)));
      } catch {
        // props mal formées → on ignore
      }
    }

    // Écoute les mises à jour live depuis le dashboard Angular (postMessage)
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'remotion-props-update') return;
      if (e.data.compositionId && COMPOSITIONS[e.data.compositionId]) {
        const nextId = e.data.compositionId as string;
        const nextComp = COMPOSITIONS[nextId];
        if (nextComp?.maskDirs) preloadMasks(nextComp.maskDirs, nextComp.durationInFrames);
        setCompositionId(nextId);
      }
      if (e.data.props) setProps(e.data.props);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const comp = COMPOSITIONS[compositionId];
  if (!comp) {
    return (
      <div style={{ color: '#fff', padding: 24, fontFamily: 'sans-serif' }}>
        Composition « {compositionId} » non trouvée.
      </div>
    );
  }

  // NE PAS RETIRER `initiallyMuted` sur <Player> : sans cette prop, le Player
  // tente play() avec audio, WebKit/Chrome bloquent l'autoplay sur
  // « video-only background media » (onglet masqué, iframe non visible, pas
  // d'interaction user) → spam d'AbortError dans la console. Démarrer muté
  // élimine la tentative audio ; `controls` permet à l'utilisateur de démuter.
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
      <Player
        component={comp.component}
        compositionWidth={1920}
        compositionHeight={1080}
        durationInFrames={comp.durationInFrames}
        fps={comp.fps}
        inputProps={props}
        controls
        loop
        autoPlay
        initiallyMuted
        acknowledgeRemotionLicense
        style={{ width: '100%', maxHeight: '100vh', aspectRatio: '16/9' }}
        // publicPath : chemin absolu vers les assets statiques (webm, fonts, images).
        // staticFile("foo.webm") retourne publicPath + "foo.webm".
        // On utilise window.location pour calculer l'URL absolue dynamiquement,
        // quelle que soit l'origine (local ou Railway production).
        // new URL('./public/', href) ignore le query string — toujours correct.
        publicPath={new URL('./public/', window.location.href).href}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
