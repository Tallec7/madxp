import React from 'react';
import type { Manifest } from '../catalog';
import type { Player } from '../mocks';

type Props = {
  manifest: Manifest;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  players: Player[];
};

export const AutoForm: React.FC<Props> = ({ manifest, value, onChange, players }) => {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });

  return (
    <form className="autoform">
      {Object.entries(manifest.inputSchema.properties).map(([key, prop]) => {
        const required = manifest.inputSchema.required.includes(key);
        const label = (prop.label ?? key) + (required ? ' *' : '');

        if (prop.ref === 'Player') {
          return (
            <label key={key} className="field">
              <span>{label}</span>
              <select
                value={(value[key] as string) ?? ''}
                onChange={(e) => set(key, e.target.value || undefined)}
              >
                <option value="">— Choisir un joueur —</option>
                {players
                  .filter((p) => p.cutoutStatus === 'ready')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.numero} {p.prenom} {p.nom}
                    </option>
                  ))}
              </select>
            </label>
          );
        }

        if (prop.enum) {
          return (
            <label key={key} className="field">
              <span>{label}</span>
              <select
                value={(value[key] as string) ?? ''}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">—</option>
                {prop.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (prop.type === 'integer' || prop.type === 'number') {
          return (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                type="number"
                min={prop.minimum}
                max={prop.maximum}
                value={(value[key] as number | undefined) ?? ''}
                onChange={(e) =>
                  set(key, e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </label>
          );
        }

        return (
          <label key={key} className="field">
            <span>{label}</span>
            <input
              type="text"
              value={(value[key] as string) ?? ''}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        );
      })}
    </form>
  );
};
