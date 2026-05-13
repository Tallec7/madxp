import React, { useEffect, useRef, useState } from 'react';
import type { ResolvedProps } from '../resolver';

// Mapping compositionId V1 → composition Remotion + adapter de props.
// (Identique au REGISTRY de l'ancien RemotionPreview, mais sans le Player.)
function splitName(full: string | null | undefined): string {
  if (!full) return 'PRÉNOM\nNOM';
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase();
  return `${parts[0].toUpperCase()}\n${parts.slice(1).join(' ').toUpperCase()}`;
}

type Adapter = (r: ResolvedProps) => { remotionCompId: string; props: Record<string, unknown> };

const ADAPTERS: Record<string, Adapter> = {
  FaitsDeJeuStory: (r) => ({
    remotionCompId: 'FaitsDeJeu2Min',
    props: { label: r.label ?? '2MIN' },
  }),
  ButGeneriqueStory: (r) => ({
    remotionCompId: 'JoueurButGeneriqueV1',
    props: {
      prenomNom: splitName(r.scorerName as string | null),
      nomClub: (r.clubName as string) || 'NOM DU CLUB',
      numero: r.scorerNumber != null ? String(r.scorerNumber) : '9',
      titre: 'BUT',
    },
  }),
  EntreeJoueurStory: (r) => ({
    remotionCompId: 'JoueurEntreeGenerique',
    props: {
      prenomNom: splitName(r.playerName as string | null),
      nomClub: (r.clubName as string) || 'NOM DU CLUB',
      numero: r.playerNumber != null ? String(r.playerNumber) : '9',
    },
  }),
};

type Status =
  | { kind: 'idle' }
  | { kind: 'rendering'; startedAt: number }
  | { kind: 'ready'; url: string; durationMs: number; cached: boolean }
  | { kind: 'error'; message: string };

type Props = {
  compositionId: string;
  kind: 'video' | 'still';
  resolved: ResolvedProps;
};

export const RenderPreview: React.FC<Props> = ({ compositionId, kind, resolved }) => {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Reset state when template changes.
  useEffect(() => {
    setStatus({ kind: 'idle' });
  }, [compositionId]);

  // Tick elapsed time while rendering.
  useEffect(() => {
    if (status.kind === 'rendering') {
      intervalRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - status.startedAt) / 1000));
      }, 250);
      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
      };
    }
    setElapsed(0);
  }, [status]);

  const adapter = ADAPTERS[compositionId];

  const launchRender = async () => {
    if (!adapter) {
      setStatus({ kind: 'error', message: `Pas d'adapter pour ${compositionId}` });
      return;
    }
    const { remotionCompId, props } = adapter(resolved);
    setStatus({ kind: 'rendering', startedAt: Date.now() });
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositionId: remotionCompId, props, kind }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        url: string;
        durationMs: number;
        cached: boolean;
      };
      setStatus({
        kind: 'ready',
        url: data.url,
        durationMs: data.durationMs,
        cached: data.cached,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus({ kind: 'error', message });
    }
  };

  return (
    <div className="render-preview">
      {status.kind === 'idle' && (
        <div className="preview-placeholder">
          <p className="muted">
            Aperçu = rendu MP4 serveur. Premier render : 15-40s selon template
            (bundle cache + decode VP9). Re-clic même config = retour cache instant.
          </p>
          <button className="primary" onClick={launchRender}>
            Générer l'aperçu
          </button>
        </div>
      )}

      {status.kind === 'rendering' && (
        <div className="preview-placeholder">
          <div className="spinner" />
          <p>Rendu en cours… {elapsed}s</p>
          <p className="muted small">
            `bundle()` + `renderMedia()` via @remotion/renderer côté Node.
          </p>
        </div>
      )}

      {status.kind === 'ready' && (
        <div>
          {kind === 'still' ? (
            <img
              key={status.url}
              src={status.url}
              alt="Aperçu"
              style={{ width: '100%', borderRadius: 8, background: '#000' }}
            />
          ) : (
            <video
              key={status.url}
              src={status.url}
              controls
              autoPlay
              loop
              playsInline
              style={{ width: '100%', borderRadius: 8, background: '#000' }}
            />
          )}
          <div className="render-meta">
            <span className="muted small">
              {status.cached
                ? '✅ Depuis cache'
                : `✅ Rendu en ${(status.durationMs / 1000).toFixed(1)}s`}
            </span>
            <button className="secondary" onClick={launchRender}>
              Re-render
            </button>
          </div>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="preview-placeholder">
          <p className="error">❌ {status.message}</p>
          <button className="primary" onClick={launchRender}>
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
};
