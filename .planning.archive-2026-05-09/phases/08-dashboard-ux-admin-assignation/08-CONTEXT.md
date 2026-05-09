# Phase 8 — DASHBOARD — Decisions Context

**Phase goal:** Un super_admin peut assigner ou désassigner un Fire Stick à un display depuis le dashboard, sans saisie aveugle, sans aide technique.
**Created:** 2026-05-07
**Status:** Ready for planning

---

## Decisions Locked

### Zone A — États visuels de la colonne Récepteur

**Decision: badge inline dans la row existante de `displays-editor`, 3 états distincts**

- **Pi natif** (index 0, pas de `receiver` ou `kind: 'pi_native'`) : badge `🖥️ Pi HDMI` — gris clair, read-only, pas de bouton d'action.
- **Fire Stick assigné** (`kind: 'firestick'`, `mac` présent) : badge vert `📺 AA:BB…FF` (6 chars + `…` + 2 derniers) + bouton toggle `▾`.
- **Non assigné** (pas de `receiver` ou `receiver: null`) : bouton `[+ Assigner]` texte bleu subtil.
- Le badge s'insère dans la row flex existante, **après** `.display-resolution`, avant `.btn-remove`.
- Pas de nouvelle colonne HTML séparée — s'intègre dans le flex `.display-row` existant.

### Zone B — Dropdown Assigner : custom inline `<ul>`, pas de `<select>` natif

**Decision: dropdown custom `position: absolute` ancré sur le bouton, MACs listées avec `last_seen_at`**

- Le bouton `[+ Assigner]` / `[AA:BB…FF ▾]` ouvre un `<ul>` dropdown positionné `absolute` (style cohérent avec `.template-menu` existant dans `displays-editor`).
- Chaque `<li>` : MAC formatée + `last_seen_at` en sous-texte (ex: "AA:BB:CC:DD:EE:FF — il y a 2 min").
- Si la liste est vide → une `<li>` disabled affichant "Aucun récepteur détecté (Pi hors-ligne ?)".
- Pas de champ texte libre — dropdown only (DASHBOARD-02 strict).
- `position: fixed` sur le dropdown pour échapper aux containers `overflow: hidden` (pattern `.vss__dropdown` du `video-search-select`).

### Zone C — Désassigner : option dans le dropdown, sans confirmation

**Decision: option "— Désassigner" en bas du dropdown, séparée par un `<hr>`, sans modale**

- Visible uniquement quand un `receiver.mac` est assigné (état "Fire Stick assigné").
- Clic → PATCH `{ displays }` avec `receiver: null` sur ce display index → pas de `confirm()` / modale.
- Justification : action réversible (re-assigner suffit). Friction minimale pour l'admin.

### Zone D — Chargement des données receivers

**Decision: appel unique dans `site-settings-tab.component.ts` `ngOnInit`, passé en `@Input` à `displays-editor`**

- `site-settings-tab.component.ts` appelle `GET /api/sites/:id/connected-receivers` dans `ngOnInit` en parallèle avec le chargement des displays existant.
- Résultat typé `ReceiverInfo[]` passé via `@Input() connectedReceivers: ReceiverInfo[]` au composant `displays-editor`.
- **Pas de polling** — une seule requête à l'ouverture de l'onglet.
- Pi offline / erreur API → `connectedReceivers = []` → dropdown affiche "Aucun récepteur détecté".
- Pas de bouton 🔄 rafraîchir en Phase 8 (v4.1+).

---

## Code Context (reusable assets)

### Dashboard Angular

| File                                                                                                                 | What's reusable                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` | Composant à étendre — row flex existante, pattern `.template-menu` pour dropdown style |
| `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts:381`           | `saveDisplays()` — pattern PATCH existant à réutiliser pour assign/unassign            |
| `central-dashboard/src/app/core/models/index.ts:176`                                                                 | `DisplayConfig` interface — à étendre avec `receiver?: ReceiverConfig \| null`         |
| `central-dashboard/src/app/core/services/api.service.ts`                                                             | `ApiService` — Observable-based, pattern `this.api.get<ReceiverInfo[]>(...)`           |

### Patterns CSS existants (à réutiliser)

- `.template-menu` : dropdown `position: absolute`, white bg, border `#e2e8f0`, shadow, `border-radius: 8px` — **réutiliser tel quel** pour le receiver dropdown.
- `.display-type-label` : pill badge gris — base pour badge Pi natif.
- `.btn-remove` : bouton icône inline — pattern pour bouton toggle `▾`.

### Interface ReceiverInfo (livrée Phase 7)

```typescript
// Exportée depuis socket.service.ts (central-server)
interface ReceiverInfo {
  mac: string; // 'AA:BB:CC:DD:EE:FF'
  kind: 'pi_native' | 'firestick' | 'browser';
  lastSeenAt: string; // ISO8601
}
```

Côté dashboard : définir `ReceiverInfo` dans `core/models/index.ts`.

### Extension DisplayConfig (à faire en Phase 8)

```typescript
interface ReceiverConfig {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string;
  last_seen_at?: string;
}

interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  receiver?: ReceiverConfig | null; // NEW Phase 8
}
```

---

## What's Already Done (skip in planning)

- ✅ `PATCH /api/sites/:id/displays` accepte `receiver` dans le payload (Phase 4 Joi + Phase 7)
- ✅ `GET /api/sites/:id/connected-receivers` livrée Phase 7
- ✅ `saveDisplays()` dans `site-settings-tab.component.ts` fait déjà le PATCH complet

---

## Phase Boundary (FIXED)

Phase 8 livre **exactement** :

1. Extension `DisplayConfig` + `ReceiverInfo` dans `core/models/index.ts`
2. `@Input() connectedReceivers` dans `displays-editor` + badge 3 états + dropdown assign/unassign
3. Chargement `connectedReceivers` dans `site-settings-tab.component.ts` `ngOnInit`
4. Karma tests sur les nouvelles interactions

**Hors scope Phase 8 :**

- Bouton 🔄 rafraîchir (v4.1)
- Suite smoke `smoke-receivers-discovery` (Phase 9)
- Métriques Prometheus (Phase 9)
- Alertes Fire Stick offline (v4.1)
