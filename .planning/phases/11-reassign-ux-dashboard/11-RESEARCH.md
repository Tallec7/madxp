# Phase 11: REASSIGN — Réassigner UX dashboard - Research

**Researched:** 2026-05-07
**Domain:** Frontend Angular 20 — composant `displays-editor` (extension Phase 8)
**Confidence:** HIGH

## Summary

La Phase 11 ajoute la **réassignation cross-display 1-clic** au composant `DisplaysEditorComponent` livré en Phase 8. Tout le wiring backend (Phase 7 cloud `receiver_assignment_updated` → Pi → captive) et l'UX dropdown de base (Phase 8) sont en prod. C'est une phase **frontend Angular only** : ~150 lignes ajoutées dans 2 fichiers (`displays-editor.component.ts` + `.spec.ts`), zéro modification backend, zéro modification du parent `site-settings-tab.component.ts` (le PATCH existant accepte déjà un payload mutant 2 displays simultanément).

Le composant cible existe (565 lignes, `ChangeDetectionStrategy.OnPush`), tous les helpers nécessaires sont en place (`formatMac`, `formatLastSeen`, `openReceiverDropdown`, `assignReceiver`, `unassignReceiver`, dropdown `position: fixed` via `getBoundingClientRect()`). Le test spec Phase 8 couvre 7 scénarios (A→G) avec un pattern TestBed standalone reproductible.

**Primary recommendation:** Refactor `assignReceiver(displayIndex, receiver)` pour détecter une assignation existante de la MAC sur un autre display via `this.displays.find()` et muter les 2 displays dans la même passe `.map()` avant un seul `displaysChange.emit()`. Ajouter un helper computed `isReceiverStale(display)` + classe CSS `--stale` pour Zone C. Étendre le template pour bouton `[Réassigner ▾]` séparé du badge MAC + sous-texte cross-display dans le dropdown. Ajouter 4-5 nouveaux tests Karma (H→L) sans toucher aux 7 existants.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Zone A — UX dropdown (label + filtrage)**

- Bouton `[Réassigner ▾]` (texte explicite) sur display assigné. Badge MAC `📺 AA:BB…FF` reste visible **à gauche** du bouton (séparation badge/action).
- Dropdown filtre `connectedReceivers` pour exclure `r.mac !== display.receiver?.mac`.
- MACs déjà assignées à un autre display → sous-texte `actuellement sur [name]` (utilise `display.name`, ex: "Écran principal") au lieu du `last_seen_at` Phase 8.
- Option `— Désassigner` reste en bas du dropdown, séparée par `<hr>` (pattern Phase 8).
- Si `connectedReceivers` filtré est vide → placeholder `Aucun récepteur détecté (Pi hors-ligne ?)` + option `— Désassigner`.

**Zone B — Feedback réassignation cross-display**

- **Pas de modale, pas de toast, pas de spinner.** Cohérent Phase 8.
- **Atomicité** : `assignReceiver(displayIndex, receiver)` détecte si `receiver.mac` est déjà sur un autre display. Si oui, `this.displays.map()` mute les 2 displays (clear source, set target) **dans la même passe** avant un seul `displaysChange.emit([...this.displays])`.
- **Échec PATCH** : géré par parent `site-settings-tab` (rollback en re-injectant ancien `displays` via `@Input()`). Composant reste pur (présentation).

**Zone C — Cas dégradé MAC actuelle hors-ligne**

- `display.receiver?.mac` présent mais absent de `connectedReceivers` → badge désaturé (CSS `opacity 0.55` ou couleur grise) + `title="Récepteur hors-ligne"` (tooltip natif).
- Helper booléen : `isReceiverStale(display)` retourne `true` si `display.receiver?.mac && !connectedReceivers.find(r => r.mac === display.receiver.mac)`.
- Bouton `[Réassigner ▾]` reste **actif** même si `connectedReceivers` filtré est vide (placeholder + `— Désassigner`).
- Pas de refresh post-PATCH — `connectedReceivers` reste celle chargée à l'ouverture (cohérent Phase 8 1-shot).
- ASSIGN-03 vérifié via assertion Karma sur payload `displaysChange.emit()` (les 2 mutations présentes), pas via E2E.

**Zone D — Tests Karma scénarios** (7 nouveaux scénarios, dérivés Zones A/B/C — voir Validation Architecture).

### Claude's Discretion

- Nommage exact classe CSS désaturée (recommandation : `receiver-badge--stale`).
- Implémentation `isReceiverStale` (méthode component recommandée vs pipe — méthode est plus simple et compatible OnPush via cdr.markForCheck quand inputs changent).
- Wording sous-texte cross-display ("actuellement sur X" vs "assigné à X") — sémantique compte, libellé libre.
- Refactor mineur de `assignReceiver` (signature/structure interne) — la signature publique reste `(displayIndex, receiver)`.

### Deferred Ideas (OUT OF SCOPE)

- Toast service global "Déplacé depuis Écran principal" — v4.1+
- Bouton 🔄 rafraîchir `connectedReceivers` — v4.1+
- Smoke test E2E cloud→Pi→captive (`smoke-receivers-reassign`) — couvert implicitement Phase 7+9
- Historique des réassignations (audit log) — pas dans v4.1
- Loading state visuel pendant PATCH — v4.1+

## Phase Requirements

| ID        | Description                                                                                                           | Research Support                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ASSIGN-01 | Dropdown d'un display déjà assigné propose `[Réassigner ▾]` pré-rempli avec MACs détectées (sauf MAC courante)        | Filtrage côté template via `*ngFor` filtré + label bouton conditionnel — voir "Standard Stack" + Code Examples |
| ASSIGN-02 | Sélection d'une MAC effectue assignation 1-clic (désassigne ancien display + assigne nouveau atomiquement)            | Mutation `displays.map()` 2-displays + un seul `displaysChange.emit()` — voir Pattern atomique                 |
| ASSIGN-03 | Ancien Fire Stick désassigné repasse en page d'attente via `receiver_assignment_updated` → Pi → captive (sans reboot) | Wiring backend Phase 7 inchangé. Vérifié via assertion Karma sur payload `emit()` (2 mutations dans 1 array)   |

## Standard Stack

### Core (déjà en place — pas de nouveau package)

| Library         | Version    | Purpose                            | Why Standard                   |
| --------------- | ---------- | ---------------------------------- | ------------------------------ |
| Angular         | 20.x       | Framework UI                       | Stack dashboard existante      |
| @angular/forms  | 20.x       | `FormsModule` `[(ngModel)]`        | Déjà importé dans le composant |
| @angular/common | 20.x       | `CommonModule` (`*ngIf`, `*ngFor`) | Déjà importé                   |
| Karma + Jasmine | (existing) | Tests unitaires Angular            | Pattern Phase 8 spec à étendre |

**Aucun `npm install` requis.** Tout le scaffolding est livré Phase 8.

### Patterns à réutiliser

| Pattern                                                  | Source                                                    | Usage Phase 11                                                |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `ChangeDetectionStrategy.OnPush` + `cdr.markForCheck()`  | `displays-editor.component.ts:33,442,514,522,539,549,557` | Tout setter de prop calculée doit déclencher `markForCheck()` |
| `position: fixed` dropdown via `getBoundingClientRect()` | `displays-editor.component.ts:517-521`                    | Inchangé pour Phase 11                                        |
| Mutation immutable `displays.map()` + spread emit        | `displays-editor.component.ts:526-538`                    | Étendre pour muter 2 displays simultanément                   |
| `@HostListener('document:click')` close on outside       | `displays-editor.component.ts:552-559`                    | Inchangé                                                      |
| TestBed standalone import                                | `displays-editor.component.spec.ts:54-56`                 | Réutiliser tel quel pour nouveaux scénarios                   |

## Architecture Patterns

### Recommended Project Structure (inchangée)

```
central-dashboard/src/app/features/sites/components/site-settings-tab/
├── site-settings-tab.component.ts        # Parent (PATCH, ngOnInit load) — INCHANGÉ
├── displays-editor/
│   ├── displays-editor.component.ts      # ÉTENDU Phase 11 (~120 lignes ajoutées)
│   └── displays-editor.component.spec.ts # ÉTENDU Phase 11 (~150 lignes nouveaux tests)
```

### Pattern 1: Mutation atomique 2-displays

**What:** Détecter MAC déjà assignée sur autre display, muter source + target dans le même `.map()`, émettre 1 fois.
**When to use:** Réassignation cross-display (ASSIGN-02).

```typescript
// Source: pattern dérivé de displays-editor.component.ts:525-540 (Phase 8 1-display)
assignReceiver(displayIndex: number, receiver: ReceiverInfo): void {
  // Détecter le display source si la MAC est déjà assignée ailleurs
  const sourceDisplay = this.displays.find(
    d => d.receiver?.mac === receiver.mac && d.index !== displayIndex
  );

  this.displays = this.displays.map(d => {
    // Target: set new receiver
    if (d.index === displayIndex) {
      return {
        ...d,
        receiver: {
          kind: receiver.kind,
          mac: receiver.mac,
          last_seen_at: receiver.lastSeenAt,
        } as ReceiverConfig,
      };
    }
    // Source: clear receiver (cross-display reassign)
    if (sourceDisplay && d.index === sourceDisplay.index) {
      return { ...d, receiver: null };
    }
    return d;
  });

  this.activeDropdownIndex = null;
  this.displaysChange.emit([...this.displays]); // Single emit, atomic payload
  this.cdr.markForCheck();
}
```

### Pattern 2: Helper `isReceiverStale` (Zone C)

**What:** Méthode component pure (pas de pipe — overkill pour OnPush single-component).

```typescript
isReceiverStale(display: DisplayConfig): boolean {
  const mac = display.receiver?.mac;
  if (!mac) return false;
  return !this.connectedReceivers.find(r => r.mac === mac);
}
```

**Note OnPush :** Cette méthode est appelée depuis le template (`[class.receiver-badge--stale]="isReceiverStale(display)"`). OnPush re-évalue les bindings quand `@Input() connectedReceivers` ou `@Input() displays` changent (référence change détectée par Angular). Tant que les inputs sont remplacés (immutables, ce qui est déjà le pattern), pas besoin d'appel manuel à `markForCheck()` pour ce binding.

### Pattern 3: Sous-texte cross-display dans le dropdown

```typescript
// Helper pour le template
getCrossDisplayHint(receiver: ReceiverInfo, currentDisplayIndex: number): string | null {
  const other = this.displays.find(
    d => d.receiver?.mac === receiver.mac && d.index !== currentDisplayIndex
  );
  return other ? `actuellement sur ${other.name}` : null;
}
```

Template :

```html
<button
  class="template-option"
  *ngFor="let r of getReassignableReceivers(display)"
  (click)="assignReceiver(display.index, r)"
>
  <span class="receiver-mac">{{ r.mac }}</span>
  <span class="receiver-lastseen" *ngIf="getCrossDisplayHint(r, display.index) as hint">
    — {{ hint }}
  </span>
  <span class="receiver-lastseen" *ngIf="!getCrossDisplayHint(r, display.index)">
    — {{ formatLastSeen(r.lastSeenAt) }}
  </span>
</button>
```

`getReassignableReceivers(display)` filtre out la MAC courante :

```typescript
getReassignableReceivers(display: DisplayConfig): ReceiverInfo[] {
  const currentMac = display.receiver?.mac;
  return currentMac
    ? this.connectedReceivers.filter(r => r.mac !== currentMac)
    : this.connectedReceivers;
}
```

### Pattern 4: Bouton `[Réassigner ▾]` séparé du badge MAC

Template actuel (Phase 8) — combine badge et bouton :

```html
<button class="receiver-badge receiver-badge--assigned" (click)="openReceiverDropdown(...)">
  📺 {{ formatMac(display.receiver!.mac!) }} ▾
</button>
```

Template Phase 11 — séparation badge (info) / bouton (action) :

```html
<ng-container
  *ngIf="display.index !== 0 && display.receiver?.kind === 'firestick' && display.receiver?.mac"
>
  <span
    class="receiver-badge receiver-badge--mac"
    [class.receiver-badge--stale]="isReceiverStale(display)"
    [title]="isReceiverStale(display) ? 'Récepteur hors-ligne' : display.receiver!.mac"
  >
    📺 {{ formatMac(display.receiver!.mac!) }}
  </span>
  <button
    class="receiver-badge receiver-badge--reassign"
    (click)="openReceiverDropdown($event, display.index)"
    [attr.data-display-index]="display.index"
  >
    Réassigner ▾
  </button>
</ng-container>
```

### Anti-Patterns to Avoid

- **Double emit `displaysChange`** (1 par mutation). Casse l'atomicité, le parent fait 2 PATCHs séquentiels, race condition cloud → Pi.
- **Mutation in-place** (`d.receiver = null`). Casse OnPush + le pattern immutable Phase 8.
- **Pipe pour `isReceiverStale`** : overkill, augmente la surface de test sans bénéfice perf (composant single-instance, pas de liste massive).
- **Service métier dans le composant** : `displays-editor` doit rester pur (présentation). Le PATCH reste dans `site-settings-tab.saveDisplays()`.
- **Refresh `connectedReceivers` post-PATCH** : explicitement out of scope (Zone C).

## Don't Hand-Roll

| Problem                        | Don't Build              | Use Instead                                                              | Why                                                                        |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Tooltip "Récepteur hors-ligne" | Tooltip Angular Material | `title=""` HTML natif                                                    | Cohérent CONTEXT.md Zone C, zéro dépendance                                |
| Badge désaturé                 | Lib CSS-in-JS            | Variante CSS `.receiver-badge--stale { opacity: 0.55; color: #94a3b8; }` | Pattern Phase 8 déjà avec variantes `--native`/`--assigned`/`--unassigned` |
| Détection MAC cross-display    | RxJS `combineLatest`     | `Array.find()` synchrone sur `this.displays`                             | Composant single-tab, données déjà dans inputs                             |
| Toast feedback réassignation   | NotificationService      | Rien (silent par décision Zone B)                                        | Cohérence Phase 8                                                          |

**Key insight:** La Phase 11 est **pure UX presentational layer**. Aucun service à introduire, aucune nouvelle dépendance. Le wiring atomique vit dans `assignReceiver()` qui reste un setter local.

## Common Pitfalls

### Pitfall 1: Race entre `@Input() displays` et `@Input() connectedReceivers`

**What goes wrong:** Au premier render, `displays` arrive (synchrone via `site.displays`) mais `connectedReceivers` arrive plus tard (async via `getConnectedReceivers().subscribe`). Pendant ce gap, `isReceiverStale(display)` retourne `true` à tort (la MAC est en réalité connectée mais la liste est vide).
**Why it happens:** `site-settings-tab.ngOnInit` charge displays sync depuis `@Input() site` mais déclenche la requête API receivers en parallèle.
**How to avoid:** Accepter ce comportement transitoire (badge désaturé pendant 100-300ms). Ne PAS gater le rendu sur `connectedReceivers.length > 0` (casse l'affichage initial). Les tests Karma simulent le steady-state (deux inputs déjà setés avant `detectChanges()`), pas le transient.
**Warning signs:** Si l'utilisateur signale "le badge devient gris brièvement à l'ouverture", c'est attendu, pas un bug.

### Pitfall 2: `<hr>` séparateur affiché quand pas de désassignation possible

**What goes wrong:** Le template Phase 8 affiche `<hr>` uniquement si `display.receiver?.mac` existe. En Phase 11, le bouton `[Réassigner ▾]` n'apparaît QUE quand `display.receiver?.mac` existe (sinon c'est `[+ Assigner]`). Donc `<hr>` est toujours affiché quand le dropdown est ouvert via `[Réassigner ▾]`. ✅ Pas de bug.
**How to avoid:** Conserver le guard `*ngIf="display.receiver?.mac"` sur le `<hr>` et sur l'option `— Désassigner` (pattern Phase 8).

### Pitfall 3: OnPush + mutation in-place

**What goes wrong:** Si on fait `display.receiver = null` au lieu d'un nouveau `{...d, receiver: null}`, le parent ne détecte pas le changement (référence array identique).
**Why it happens:** Réflexe imperative.
**How to avoid:** Toujours `this.displays = this.displays.map(...)` puis `displaysChange.emit([...this.displays])`. Le `[...]` final assure une nouvelle référence pour le parent OnPush.
**Warning signs:** Test Karma `expect(emitted).toBeDefined()` passe mais le parent ne re-render pas.

### Pitfall 4: Filtrage MAC courante sans `getReassignableReceivers`

**What goes wrong:** Si on filtre dans le template `*ngFor="let r of connectedReceivers | mac-filter:display.receiver?.mac"`, on introduit un pipe non testé.
**How to avoid:** Filtrer dans une méthode component (`getReassignableReceivers`). Plus testable, plus simple. Performance acceptable (liste typique : 1-10 receivers).

### Pitfall 5: Smoke tests pinned côté server touchés ?

**Vérifié :** Les modifications Phase 11 ne touchent QUE `central-dashboard/`. Aucun fichier `central-server/`, `raspberry/`, `sync-agent/`. Selon `.claude/rules/dashboard.md` (smoke test enforced), les contraintes pertinentes sont :

- ✅ Pas de `fetch()` introduit (composant ne fait pas d'API call) — OK
- ✅ `ChangeDetectionStrategy.OnPush` conservé — OK
- ✅ Pas de modification des composants protégés (`displays-editor` n'est pas dans la liste des composants gelés Phase 8 — il est encore en évolution active) — OK

**Smoke `smoke-dashboard-guards`** : verrouille les guards composants/structures. Aucun guard Phase 8 n'est retiré (pas de modif Pi badge native, pas de modif désassign), donc OK.

## Code Examples

### Example 1: Test Karma pattern (mutation atomique cross-display)

```typescript
// Source: extension de displays-editor.component.spec.ts (pattern Phase 8)
it('I — selecting a MAC from another display emits 2 mutations in single emit (atomic)', () => {
  const display1: DisplayConfig = {
    index: 1,
    name: 'Écran principal',
    type: 'tv',
    receiver: {
      kind: 'firestick',
      mac: 'AA:BB:CC:DD:EE:FF',
      last_seen_at: new Date().toISOString(),
    },
  };
  const display2: DisplayConfig = { index: 2, name: 'TV Buvette', type: 'tv' };

  component.displays = [display1, display2];
  component.connectedReceivers = mockReceivers; // contient AA:BB:CC:DD:EE:FF
  fixture.detectChanges();

  let emitCount = 0;
  let emitted: DisplayConfig[] | undefined;
  component.displaysChange.subscribe((val) => {
    emitCount++;
    emitted = val;
  });

  // Open dropdown sur display 2 (unassigned)
  const btn = fixture.nativeElement.querySelector(
    '.receiver-badge--unassigned',
  ) as HTMLButtonElement;
  btn.click();
  fixture.detectChanges();

  // Sélectionner AA:BB:CC:DD:EE:FF (déjà sur display 1)
  const options = fixture.nativeElement.querySelectorAll('.receiver-dropdown .template-option');
  (options[0] as HTMLButtonElement).click();
  fixture.detectChanges();

  // Atomicité : 1 seul emit
  expect(emitCount).toBe(1);
  expect(emitted).toBeDefined();
  // Display 1 : receiver clear
  expect(emitted!.find((d) => d.index === 1)?.receiver).toBeNull();
  // Display 2 : receiver set
  expect(emitted!.find((d) => d.index === 2)?.receiver?.mac).toBe('AA:BB:CC:DD:EE:FF');
});
```

### Example 2: Test Karma — sous-texte cross-display

```typescript
it('J — dropdown shows "actuellement sur X" hint for cross-display MAC', () => {
  component.displays = [
    {
      index: 1,
      name: 'Écran principal',
      type: 'tv',
      receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: '...' },
    },
    { index: 2, name: 'TV Buvette', type: 'tv' },
  ];
  component.connectedReceivers = mockReceivers;
  fixture.detectChanges();

  // Open dropdown sur display 2 (unassigned)
  const btn = fixture.nativeElement.querySelector(
    '.receiver-badge--unassigned',
  ) as HTMLButtonElement;
  btn.click();
  fixture.detectChanges();

  const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
  expect(dropdown.textContent).toContain('actuellement sur Écran principal');
});
```

### Example 3: Test Karma — badge stale

```typescript
it('K — assigned display with MAC absent from connectedReceivers shows stale badge', () => {
  component.displays = [
    {
      index: 1,
      name: 'TV',
      type: 'tv',
      receiver: { kind: 'firestick', mac: 'ZZ:ZZ:ZZ:ZZ:ZZ:ZZ', last_seen_at: '...' },
    },
  ];
  component.connectedReceivers = mockReceivers; // ne contient pas ZZ:...
  fixture.detectChanges();

  const badge = fixture.nativeElement.querySelector('.receiver-badge--mac');
  expect(badge).toBeTruthy();
  expect(badge.classList.contains('receiver-badge--stale')).toBe(true);
  expect(badge.getAttribute('title')).toContain('Récepteur hors-ligne');
});
```

## State of the Art

| Old Approach (Phase 8)                        | Current Approach (Phase 11)                      | When Changed | Impact                                                   |
| --------------------------------------------- | ------------------------------------------------ | ------------ | -------------------------------------------------------- |
| Bouton combiné badge+action `📺 AA…FF ▾`      | Badge MAC séparé + bouton `[Réassigner ▾]`       | Phase 11     | Clarté UX, info / action séparées                        |
| Dropdown MAC unique sous-texte `last_seen_at` | Sous-texte cross-display `actuellement sur X`    | Phase 11     | Évite confusion lors de réassignation                    |
| Mutation 1-display via `displays.map()`       | Mutation 2-displays atomique (source + target)   | Phase 11     | Single PATCH cloud, single `receiver_assignment_updated` |
| Pas de signal MAC offline                     | Badge `--stale` + tooltip `Récepteur hors-ligne` | Phase 11     | Visibilité Pi offline / Fire Stick débranché             |

**Pas de deprecation.** Phase 11 ajoute par-dessus, ne casse rien.

## Open Questions

Aucune question bloquante. CONTEXT.md couvre toutes les zones de décision. Quelques détails d'implémentation laissés à la discrétion de Claude (cf. CONTEXT.md `<decisions>` dernière sous-section) :

1. **Nom de classe CSS désaturée** : recommandation `receiver-badge--stale` (cohérent BEM Phase 8).
2. **Wording sous-texte cross-display** : recommandation `actuellement sur ${display.name}` (verbatim CONTEXT.md `<specifics>`).
3. **Localisation du helper `getReassignableReceivers`** : recommandation méthode component (vs pipe) — plus testable, pas de surface API supplémentaire.

## Validation Architecture

### Test Framework

| Property           | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| Framework          | Karma + Jasmine (Angular 20)                                               |
| Config file        | `central-dashboard/karma.conf.js` (existant)                               |
| Quick run command  | `npm run test:central -- --include='**/displays-editor.component.spec.ts'` |
| Full suite command | `npm run test:central` (520 tests)                                         |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                                                                                                     | Test Type    | Automated Command                                                                   | File Exists?          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------- | --------------------- |
| ASSIGN-01 | Bouton `[Réassigner ▾]` rendu sur display assigné (pas la MAC dans le bouton)                                                                | unit (Karma) | `npm run test:central -- --include='**/displays-editor.component.spec.ts'` (test H) | ✅ étend Phase 8 spec |
| ASSIGN-01 | Dropdown filtre MAC courante du display assigné                                                                                              | unit         | (test I)                                                                            | ✅ étend              |
| ASSIGN-01 | MAC déjà sur autre display → sous-texte `actuellement sur [name]`                                                                            | unit         | (test J)                                                                            | ✅ étend              |
| ASSIGN-02 | Sélection MAC libre → 1 emit, 1 display muté                                                                                                 | unit         | (test extension de E Phase 8)                                                       | ✅ étend (couvert E)  |
| ASSIGN-02 | Sélection MAC cross-display → 1 seul `displaysChange.emit()`, payload contient 2 mutations (source `receiver: null` + target `receiver` set) | unit         | (test K — atomicité)                                                                | ✅ étend              |
| ASSIGN-03 | Payload émis contient les 2 mutations dans la même array → assertion suffisante (le wiring backend Phase 7 est déjà testé)                   | unit         | (test K — assertion sur structure payload)                                          | ✅ étend              |
| Zone C    | MAC courante absente de `connectedReceivers` → `isReceiverStale === true`, classe CSS `--stale` appliquée + tooltip                          | unit         | (test L)                                                                            | ✅ étend              |
| Zone C    | `connectedReceivers` vide ou filtré vide → bouton reste actif, dropdown affiche placeholder + option Désassigner                             | unit         | (test M — extension de G Phase 8)                                                   | ✅ étend              |

### Sampling Rate

- **Per task commit** : `npm run test:central -- --include='**/displays-editor.component.spec.ts'` (~3-5s, 7 tests Phase 8 + 5-6 nouveaux Phase 11)
- **Per wave merge** : `npm run test:central` (suite Karma complète, 520 tests + nouveaux)
- **Phase gate** : `npm run test:central` + `npm run test:smoke:smart` (vérifie qu'aucune régression smoke côté server malgré le scope frontend-only)

### Wave 0 Gaps

- [ ] Aucun gap framework — Karma + spec Phase 8 déjà en place. Les nouveaux tests s'ajoutent dans le `describe()` existant ou créent un second `describe('DisplaysEditorComponent — Phase 11 Reassign UX')` dans le même fichier spec.
- [ ] Aucun mock supplémentaire — `mockReceivers` Phase 8 est suffisant, peut être étendu avec un 3ème receiver pour scénarios "filtre MAC courante + 2 autres MACs disponibles".

_(Wave 0 = Aucun fichier de test à créer ; le spec existant Phase 8 est étendu en place)_

## Sources

### Primary (HIGH confidence)

- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` — Composant cible (565 lignes, lu intégralement)
- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` — Spec Phase 8 (210 lignes, 7 tests A-G, lu intégralement)
- `central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts` — Parent (vérifié : `saveDisplays` accepte payload mutant N displays simultanément, INCHANGÉ Phase 11)
- `central-dashboard/src/app/core/models/index.ts` — `DisplayConfig`, `ReceiverConfig`, `ReceiverInfo` (vérifié : interfaces complètes Phase 8)
- `.planning/phases/11-reassign-ux-dashboard/11-CONTEXT.md` — Décisions verrouillées (171 lignes)
- `.planning/phases/07-cloud-api-sync-agent/07-CONTEXT.md` — Confirme wiring `receiver_assignment_updated` livré (handler Phase 7 zone C)
- `.planning/phases/08-dashboard-ux-admin-assignation/08-CONTEXT.md` — Pattern composant Phase 8 réutilisé
- `.planning/REQUIREMENTS.md` — ASSIGN-01/02/03 (lignes 61-63)
- `CLAUDE.md` — Conventions Neopro (TypeScript strict, OnPush, Conventional Commits)
- `.claude/rules/dashboard.md` — Smoke tests dashboard (vérifié : aucun guard Phase 8 retiré par Phase 11)
- `.claude/rules/testing.md` — Smoke tests centraux (vérifié : Phase 11 frontend-only, smoke server non concerné)

### Secondary (MEDIUM confidence)

- Aucune. Toutes les références sont du code lu directement ou des CONTEXT.md livrés.

### Tertiary (LOW confidence)

- Aucune.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Stack Angular existante, aucun nouveau package
- Architecture: HIGH — Pattern Phase 8 + extension mineure (mutation 2-displays vs 1)
- Pitfalls: HIGH — Race transient input async, mutation in-place OnPush, sont des classiques Angular bien connus + vérifiés sur le code source

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 jours, stack stable)

---

_Phase: 11-reassign-ux-dashboard_
_Researched: 2026-05-07_
