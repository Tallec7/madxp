import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Player } from '@remotion/player';
import { ButSimple } from '../../src/ButSimple';
import { ButImgJoueur } from '../../src/ButImgJoueur';

// ── Registry des compositions ─────────────────────────────────────────────────

interface CompositionDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>;
  durationInFrames: number;
  fps: number;
}

const COMPOSITIONS: Record<string, CompositionDef> = {
  ButSimple: { component: ButSimple, durationInFrames: 180, fps: 30 },
  ButImgJoueur: { component: ButImgJoueur, durationInFrames: 210, fps: 30 },
};

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [compositionId, setCompositionId] = useState<string>('ButSimple');
  const [props, setProps] = useState<Record<string, unknown>>({});

  useEffect(() => {
    // Initialisation depuis les query params (ex: ?composition=ButSimple&props=...)
    const params = new URLSearchParams(window.location.search);
    const comp = params.get('composition');
    if (comp && COMPOSITIONS[comp]) setCompositionId(comp);

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
        setCompositionId(e.data.compositionId);
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
