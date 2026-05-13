import React, { useMemo, useState } from 'react';
import { CATALOG } from './catalog';
import { INITIAL_BRAND_KIT, INITIAL_PLAYERS } from './mocks';
import type { BrandKit, Player } from './mocks';
import { resolve } from './resolver';
import { AutoForm } from './components/AutoForm';
import { BrandKitPanel } from './components/BrandKitPanel';
import { RenderPreview } from './components/RenderPreview';
import { RenderPanel } from './components/RenderPanel';

export const App: React.FC = () => {
  const [templateId, setTemplateId] = useState<string>(CATALOG[0].id);
  const [inputs, setInputs] = useState<Record<string, Record<string, unknown>>>({});
  const [brandKit, setBrandKit] = useState<BrandKit>(INITIAL_BRAND_KIT);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [tab, setTab] = useState<'studio' | 'brand' | 'players'>('studio');

  const manifest = CATALOG.find((m) => m.id === templateId)!;
  const currentInput = inputs[templateId] ?? {};

  const resolved = useMemo(
    () => resolve(manifest, currentInput, brandKit, players),
    [manifest, currentInput, brandKit, players],
  );

  const canRender = manifest.inputSchema.required.every(
    (k) => currentInput[k] != null && currentInput[k] !== '',
  );

  const setInput = (next: Record<string, unknown>) =>
    setInputs((prev) => ({ ...prev, [templateId]: next }));

  const addPlayer = () => {
    const id = `p${Date.now().toString(36)}`;
    setPlayers((prev) => [
      ...prev,
      {
        id,
        prenom: 'Nouveau',
        nom: 'Joueur',
        numero: 99,
        poste: 'Attaquant',
        photoRawUrl: '/players/001.jpg',
        photoCutoutUrl: null,
        cutoutStatus: 'processing',
      },
    ]);
    setTimeout(() => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, cutoutStatus: 'ready', photoCutoutUrl: p.photoRawUrl }
            : p,
        ),
      );
    }, 4000);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Studio POC</strong>
          <span className="muted"> · Templates Clubs V1 · maquette</span>
        </div>
        <nav className="tabs">
          <button
            className={tab === 'studio' ? 'active' : ''}
            onClick={() => setTab('studio')}
          >
            Studio
          </button>
          <button
            className={tab === 'brand' ? 'active' : ''}
            onClick={() => setTab('brand')}
          >
            Brand Kit
          </button>
          <button
            className={tab === 'players' ? 'active' : ''}
            onClick={() => setTab('players')}
          >
            Joueurs ({players.length})
          </button>
        </nav>
      </header>

      {tab === 'studio' && (
        <main className="layout">
          <aside className="sidebar">
            <h3>Templates</h3>
            <ul className="template-list">
              {CATALOG.map((m) => (
                <li key={m.id}>
                  <button
                    className={templateId === m.id ? 'active' : ''}
                    onClick={() => setTemplateId(m.id)}
                  >
                    <strong>{m.label}</strong>
                    <span className="muted small">{m.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="form-col">
            <h3>{manifest.label}</h3>
            <p className="muted">{manifest.description}</p>
            <AutoForm
              manifest={manifest}
              value={currentInput}
              onChange={setInput}
              players={players}
            />
            <RenderPanel
              manifest={manifest}
              resolved={resolved}
              canRender={canRender}
            />
          </section>

          <section className="preview-col">
            <h3>Aperçu</h3>
            <RenderPreview
              compositionId={manifest.compositionId}
              kind={manifest.kind}
              resolved={resolved}
            />
          </section>
        </main>
      )}

      {tab === 'brand' && (
        <main className="layout-narrow">
          <BrandKitPanel brandKit={brandKit} onChange={setBrandKit} />
        </main>
      )}

      {tab === 'players' && (
        <main className="layout-narrow">
          <div className="panel">
            <div className="row">
              <h3>Roster</h3>
              <button className="primary" onClick={addPlayer}>
                + Ajouter joueur (fake)
              </button>
            </div>
            <div className="players-grid">
              {players.map((p) => (
                <div key={p.id} className="player-card">
                  <img
                    src={p.photoCutoutUrl ?? p.photoRawUrl}
                    alt={`${p.prenom} ${p.nom}`}
                  />
                  <div>
                    <strong>#{p.numero}</strong> {p.prenom} {p.nom}
                  </div>
                  <div className="muted small">{p.poste}</div>
                  <div className={`badge badge--${p.cutoutStatus}`}>
                    {p.cutoutStatus === 'ready' && '✅ Détouré'}
                    {p.cutoutStatus === 'processing' && '⏳ Détourage…'}
                    {p.cutoutStatus === 'pending' && '🟡 En attente'}
                    {p.cutoutStatus === 'failed' && '❌ Échec'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};
