---
plan: 11-01
phase: 11-reassign-ux-dashboard
status: complete
completed: 2026-05-07
commits:
  - 16e0f680 # feat(displays-editor): Task 1 — composant UX réassignation
  - 1ed3c5d2 # test(displays-editor): Task 2 — tests H-M Phase 11
---

# Plan 11-01 — Summary

## Files Modified

| Fichier                                                                                                                   | +LOC | -LOC | Nature                    |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------------------------- |
| `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts`      | +90  | -16  | Composant étendu Phase 11 |
| `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` | +147 | 0    | Tests H-M ajoutés         |

Aucun fichier backend modifié (central-server, raspberry, sync-agent).

## Helpers Ajoutés

```typescript
isReceiverStale(display: DisplayConfig): boolean
// True si display.receiver.mac existe mais absent de connectedReceivers
// → badge receiver-badge--stale + title='Récepteur hors-ligne'

getReassignableReceivers(display: DisplayConfig): ReceiverInfo[]
// Filtre connectedReceivers pour exclure la MAC courante du display
// → dropdown ne propose jamais la réassignation sur soi-même

getCrossDisplayHint(receiver: ReceiverInfo, currentDisplayIndex: number): string | null
// Retourne 'actuellement sur [display.name]' si la MAC est assignée à un autre display
// → sous-texte conditionnel dans le dropdown (sinon: last_seen_at habituel)
```

## Atomicité 2-displays (Test K)

`assignReceiver()` détecte d'abord si le receiver est déjà sur un autre display (`sourceDisplay`), puis exécute une seule passe `this.displays.map()` qui mute simultanément :

- **source** → `receiver: null`
- **target** → `receiver: { kind, mac, last_seen_at }`

Suivi d'un unique `displaysChange.emit([...this.displays])`. Test K valide l'assertion `emitCount === 1` + payload 2 mutations.

## Décisions Zone A/B/C Respectées

- **Zone A** : badge `receiver-badge--mac` (info) séparé du bouton `receiver-badge--reassign` (action). Backward compat : `receiver-badge--assigned` conservée sur le badge MAC → tests B et F Phase 8 inchangés.
- **Zone B** : mutation atomique + single emit, aucune API call depuis le composant, parent `site-settings-tab` gère le PATCH + rollback.
- **Zone C** : `isReceiverStale` + CSS `--stale` (opacity 0.55) + tooltip. Dropdown `#noReceivers` inclut `— Désassigner` si `display.receiver?.mac` présent (test M).

## Tests Verts — 13/13

| Test                                                       | Requirement  | Status |
| ---------------------------------------------------------- | ------------ | ------ |
| A — Pi HDMI badge read-only                                | (Phase 8)    | ✅     |
| B — green badge truncated MAC                              | (Phase 8)    | ✅     |
| C — unassigned shows Assigner button                       | (Phase 8)    | ✅     |
| D — clicking Assigner opens dropdown with MACs             | (Phase 8)    | ✅     |
| E — clicking MAC emits displaysChange receiver.mac set     | (Phase 8)    | ✅     |
| F — clicking Désassigner emits receiver: null              | (Phase 8)    | ✅     |
| G — empty connectedReceivers shows placeholder             | (Phase 8)    | ✅     |
| H — badge MAC séparé + bouton [Réassigner ▾]               | ASSIGN-01    | ✅     |
| I — dropdown exclut MAC courante                           | ASSIGN-01    | ✅     |
| J — sous-texte 'actuellement sur [name]'                   | ASSIGN-01    | ✅     |
| K — 1 seul emit, 2 mutations atomiques                     | ASSIGN-02/03 | ✅     |
| L — badge stale + tooltip Récepteur hors-ligne             | Zone C       | ✅     |
| M — filtré vide → bouton actif + placeholder + Désassigner | Zone C       | ✅     |

**Commande** : `npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false` → `TOTAL: 13 SUCCESS`

## Phase Gate

- [x] `npm run build` (central-dashboard) → OK (warnings connus React/Remotion pre-Phase 11)
- [x] 13/13 tests Karma verts
- [x] Smoke tests serveur 4035/4035 verts (smoke-dashboard-guards, smoke-wiring, smoke-consistency inclus)
- [x] Aucun fichier backend modifié
- [ ] Validation manuelle ASSIGN-03 (Pi RACC + 2 Fire Sticks) — optionnel, couvert par payload assertion Test K
