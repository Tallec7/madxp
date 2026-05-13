import React, { useState } from 'react';
import type { Manifest } from '../catalog';
import type { ResolvedProps } from '../resolver';

type RenderStatus = 'idle' | 'queued' | 'rendering' | 'ready' | 'failed';

type Job = {
  id: string;
  templateLabel: string;
  status: RenderStatus;
  outputUrl: string | null;
  startedAt: number;
};

type Props = {
  manifest: Manifest;
  resolved: ResolvedProps;
  canRender: boolean;
};

export const RenderPanel: React.FC<Props> = ({ manifest, resolved, canRender }) => {
  const [jobs, setJobs] = useState<Job[]>([]);

  const launch = () => {
    const id = `r_${Date.now().toString(36)}`;
    const job: Job = {
      id,
      templateLabel: manifest.label,
      status: 'queued',
      outputUrl: null,
      startedAt: Date.now(),
    };
    setJobs((prev) => [job, ...prev]);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: 'rendering' } : j)),
      );
    }, 1500);
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? {
                ...j,
                status: 'ready',
                outputUrl: `https://kalonpartners.bzh/neopro-video/renders/2026-05/${id}.mp4`,
              }
            : j,
        ),
      );
    }, 5000);
  };

  return (
    <div className="panel">
      <h3>Lancer un rendu</h3>
      <button
        type="button"
        className="primary"
        onClick={launch}
        disabled={!canRender}
        title={canRender ? '' : 'Remplis les champs requis du formulaire'}
      >
        Lancer le rendu
      </button>
      <details className="resolved-preview" open>
        <summary>Payload résolu (debug)</summary>
        <pre>{JSON.stringify(resolved, null, 2)}</pre>
      </details>
      <div className="jobs">
        <h4>Renders ({jobs.length})</h4>
        {jobs.length === 0 && <p className="muted">Aucun rendu lancé.</p>}
        {jobs.map((j) => (
          <div key={j.id} className={`job job--${j.status}`}>
            <div>
              <strong>{j.templateLabel}</strong>
              <span className="job-id"> · {j.id}</span>
            </div>
            <div className="job-status">
              {j.status === 'queued' && '🟡 En file'}
              {j.status === 'rendering' && '🔵 Rendu en cours…'}
              {j.status === 'ready' && (
                <a href={j.outputUrl ?? '#'} onClick={(e) => e.preventDefault()}>
                  ✅ MP4 prêt (lien dummy)
                </a>
              )}
              {j.status === 'failed' && '❌ Échec'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
