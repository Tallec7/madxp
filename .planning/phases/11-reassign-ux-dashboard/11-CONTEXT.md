# Phase 11 — REASSIGN — Decisions Context

**Phase goal:** Un super_admin réassigne un Fire Stick d'un display à un autre en 1 clic depuis le dashboard, sans passer par Désassigner puis Assigner en deux temps.
**Created:** 2026-05-07
**Status:** Ready for planning

---

<domain>

## Phase Boundary

Phase 11 livre **exactement** :

1. Le bouton de la colonne Récepteur sur un display déjà assigné affiche `[Réassigner ▾]` (au lieu du badge MAC cliquable de Phase 8).
2. Le dropdown exclut la MAC actuellement assignée à ce display, et marque les MACs déjà assignées à d'autres displays avec leur localisation (`"actuellement sur Écran principal"`).
3. La sélection d'une MAC déjà sur un autre display effectue une mutation atomique côté front : un seul `displaysChange.emit()` qui mute simultanément Display source (clear `receiver`) + Display cible (set `receiver`), produisant un seul PATCH `/api/sites/:id/displays`.
4. Le payload PATCH déclenche `receiver_assignment_updated` (livré Phase 7) → Pi met à jour son cache → l'ancien Fire Stick bascule en page d'attente captive sans reboot.
5. Tests Karma sur le composant `displays-editor` couvrant les nouveaux scénarios.

**Hors scope Phase 11 :**

- Confirmation modale / toast cross-display (silent, cohérent Phase 8)
- Spinner / loading state pendant le PATCH (optimistic update)
- Refresh `connectedReceivers` post-PATCH (décision Phase 8 : 1-shot)
- Smoke test E2E cloud→Pi→captive (wiring livré Phase 7, vérifié via assertion payload émis)
- Toast service côté dashboard (parent gère erreurs comme aujourd'hui)
- Bouton 🔄 rafraîchir manuel (v4.1+)

</domain>

<decisions>

## Implementation Decisions

### Zone A — UX dropdown (label + filtrage)

**Decision: bouton [Réassigner ▾] + filtrage MAC courante + marqueur cross-display**

- Sur un display avec `receiver?.mac` présent, le bouton affiche `[Réassigner ▾]` (texte explicite, pas la MAC). Le badge MAC `📺 AA:BB…FF` reste visible **à gauche du bouton** dans la row pour conserver l'info actuelle.
- Le dropdown filtre `connectedReceivers` pour **exclure la MAC courante** du display (`r.mac !== display.receiver?.mac`).
- Pour chaque MAC restante, si elle est déjà assignée à un autre display du même site (cherchée dans `displays`), afficher en sous-texte `actuellement sur [nom du display]` au lieu du `last_seen_at` habituel. Sinon afficher le `last_seen_at` (pattern Phase 8).
- L'option `— Désassigner` reste en bas du dropdown, séparée par `<hr>` (pattern Phase 8 conservé).
- Si `connectedReceivers` ne contient que la MAC courante (filtrée), le dropdown affiche `Aucun récepteur détecté (Pi hors-ligne ?)` + l'option `— Désassigner`.

### Zone B — Feedback réassignation cross-display

**Decision: silent + atomic emit + parent gère erreurs**

- **Pas de modale, pas de toast, pas de spinner.** Cohérent avec Phase 8 (désassignation silent). Action réversible.
- **Atomicité** : la méthode `assignReceiver(displayIndex, receiver)` détecte si `receiver.mac` est déjà sur un autre display via `this.displays.find(d => d.receiver?.mac === receiver.mac && d.index !== displayIndex)`. Si oui, le `this.displays.map()` mute **les deux displays dans la même passe** (clear sur source, set sur target) **avant** un seul `displaysChange.emit([...this.displays])`. Pas de double emit, pas d'état intermédiaire visible.
- **Échec PATCH** : laisser le parent (`site-settings-tab.component.ts`) gérer l'erreur. Le composant `displays-editor` reste pur (présentation), il émet l'intention ; le parent fait le PATCH et peut rollback en cas d'erreur en re-passant l'ancien `displays` via `@Input()`. Le composant ne fait pas d'API call directement (pattern existant).

### Zone C — Cas dégradé MAC actuelle hors-ligne

**Decision: badge désaturé + dropdown toujours actif + pas de refresh**

- Si `display.receiver?.mac` existe mais n'apparaît pas dans `connectedReceivers` (Pi offline / Fire Stick débranché), le badge MAC s'affiche en variante désaturée (CSS opacity 0.55 ou couleur grise), avec `title="Récepteur hors-ligne"` (tooltip natif).
- Détection : booléen calculé `isReceiverStale(display)` retourne `true` si `display.receiver?.mac && !connectedReceivers.find(r => r.mac === display.receiver.mac)`.
- Le bouton `[Réassigner ▾]` reste **actif** même si `connectedReceivers` est vide après filtrage. Le dropdown affiche le placeholder `Aucun récepteur détecté (Pi hors-ligne ?)` (pattern Phase 8) + l'option `— Désassigner`.
- **Pas de refresh post-PATCH** : la liste `connectedReceivers` reste celle chargée à l'ouverture de l'onglet (cohérent décision Phase 8 — `site-settings-tab` charge en `ngOnInit` une seule fois).
- ASSIGN-03 vérifié via assertion Karma sur `displaysChange.emit()` payload (les 2 mutations présentes), pas via E2E.

### Zone D — Tests Karma scénarios (dérivé Zones A/B/C)

Scénarios pinés (cf. plan downstream) :

- Display avec `receiver` → bouton render `[Réassigner ▾]` (pas la MAC).
- Dropdown sur display assigné exclut la MAC courante.
- MAC du dropdown déjà sur un autre display → sous-texte `actuellement sur [nom]` au lieu de `last_seen_at`.
- Sélection d'une MAC libre → emit avec 1 display muté.
- Sélection d'une MAC cross-display → emit avec 2 displays mutés simultanément (assertion : un seul appel `displaysChange.emit`, payload contient les 2 mutations).
- MAC courante absente de `connectedReceivers` → `isReceiverStale === true`, classe CSS désaturée appliquée.
- `connectedReceivers` vide → bouton reste actif, dropdown affiche placeholder + option Désassigner.

### Claude's Discretion

- Nommage exact de la classe CSS désaturée (ex: `receiver-badge--stale`).
- Implémentation précise du helper `isReceiverStale` (méthode component vs pipe).
- Détail du libellé sous-texte cross-display (« actuellement sur X » vs « assigné à X » — la sémantique compte, le wording est libre).
- Refactor mineur de `assignReceiver` pour absorber la mutation 2-displays (signature et structure interne).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 11 — Goal + success criteria
- `.planning/REQUIREMENTS.md` — ASSIGN-01, ASSIGN-02, ASSIGN-03

### Prior phase decisions (héritées)

- `.planning/phases/07-cloud-api-sync-agent/07-CONTEXT.md` — Cloud emit `receiver_assignment_updated` après PATCH displays + sync-agent whitelist
- `.planning/phases/08-dashboard-ux-admin-assignation/08-CONTEXT.md` — Composant `displays-editor`, dropdown custom, pattern `.template-menu`, chargement 1-shot, pas de modale

### Code (à lire avant édition)

- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` — Composant à étendre (565 lignes, livré Phase 8)
- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` — Tests Karma Phase 8 à étendre
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` — Parent qui fait le PATCH, charge `connectedReceivers`
- `central-dashboard/src/app/core/models/index.ts` — `DisplayConfig`, `ReceiverConfig`, `ReceiverInfo`

### Project rules

- `CLAUDE.md` — Conventions code Neopro (TS strict, repository pattern, Conventional Commits)
- `.claude/rules/testing.md` — Smoke tests à lancer après modif dashboard

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

| Asset                                       | Where                                   | Usage Phase 11                                                |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `assignReceiver(displayIndex, receiver)`    | `displays-editor.component.ts:524`      | Étendre pour mutation atomique 2-displays quand cross-display |
| `unassignReceiver(displayIndex)`            | `displays-editor.component.ts:540`      | Inchangé (option `— Désassigner` reste)                       |
| `openReceiverDropdown(event, displayIndex)` | `displays-editor.component.ts:511`      | Inchangé (positionnement dropdown)                            |
| `formatMac()` / `formatLastSeen()`          | `displays-editor.component.ts:495/501`  | Réutilisés tel quel                                           |
| `.receiver-badge--assigned`                 | CSS dans `displays-editor.component.ts` | Ajouter variante `--stale` (opacity 0.55)                     |
| `.template-menu`                            | CSS dropdown existant                   | Réutilisé tel quel pour le dropdown filtré                    |

### Established Patterns

- **Composant pur (présentation)** : `displays-editor` n'appelle pas l'API. Il émet `displaysChange` ; le parent `site-settings-tab` fait le PATCH. Phase 11 conserve ce découpage.
- **Optimistic update** : la mutation locale `displays.map()` se fait avant le PATCH. En cas d'échec, le parent rollback en re-injectant l'ancien `displays` via `@Input()`.
- **Dropdown custom `position: fixed`** : ancré sur le bouton via `getBoundingClientRect()`, échappe aux containers `overflow: hidden`. Pattern Phase 8 conservé.
- **`changeDetection: OnPush` + `cdr.markForCheck()`** : déjà en place dans `displays-editor`. Toute nouvelle prop calculée doit déclencher `markForCheck()`.

### Integration Points

- `site-settings-tab.component.ts.saveDisplays()` (PATCH `/api/sites/:id/displays`) — non modifié Phase 11 (le payload est déjà compatible : un tableau de displays avec mutations atomiques).
- Cloud `updateSiteDisplays` controller (Phase 7) émet `receiver_assignment_updated` au Pi — non modifié.
- Pi `command-dispatch.js` handler `receiver_assignment_updated` (Phase 7) → `assignDisplay` + cache local — non modifié.

</code_context>

<specifics>

## Specific Ideas

- **Label exact bouton réassigner** : `Réassigner ▾` (français, cohérent avec `Désassigner` Phase 8).
- **Sous-texte cross-display** : `actuellement sur [display.name]` (utilise le `name` du display, ex: "Écran principal", pas l'index brut).
- **Tooltip stale** : `Récepteur hors-ligne` (HTML `title=""` natif, pas de tooltip Angular Material).
- **Le badge MAC reste affiché** à gauche du bouton `[Réassigner ▾]` même quand assigné — Phase 8 le mettait DANS le bouton ; Phase 11 sépare badge (info) et bouton (action) pour clarifier l'UX.

</specifics>

<deferred>

## Deferred Ideas

- Toast service global pour feedback cross-display ("Déplacé depuis Écran principal") — v4.1+
- Bouton 🔄 rafraîchir `connectedReceivers` manuellement — v4.1+
- Smoke test E2E cloud→Pi→captive (chemin complet ASSIGN-03) — couvert implicitement par Phase 7 + Phase 9, peut devenir un smoke `smoke-receivers-reassign` en v4.1
- Historique des réassignations (audit log) — pas dans v4.1
- Loading state visuel pendant PATCH — v4.1+ si feedback utilisateur le demande

</deferred>

---

_Phase: 11-reassign-ux-dashboard_
_Context gathered: 2026-05-07_
