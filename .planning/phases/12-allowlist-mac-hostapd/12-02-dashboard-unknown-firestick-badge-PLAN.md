---
phase: 12-allowlist-mac-hostapd
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
autonomous: true
requirements:
  - OBSERVE-03
must_haves:
  truths:
    - "Dans la liste du dropdown receiver, chaque MAC firestick non assignée est précédée d'un badge ambre 'Non assigné'"
    - "Les receivers kind='browser' ne reçoivent jamais le badge ambre (téléphones bénévoles invisibles)"
    - "Les receivers kind='firestick' avec displayIndex !== null gardent le badge vert existant (assigné), pas d'ambre"
    - 'Le badge ambre est distinct visuellement du badge vert (couleur amber #f59e0b vs green #10b981) et du badge rouge stale'
  artifacts:
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts'
      provides: 'Helper isUnknownFirestick(receiver) + classe CSS .receiver-badge--unknown + binding template dans le dropdown'
      contains: 'receiver-badge--unknown'
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts'
      provides: 'Karma tests pour le badge ambre (présence/absence selon kind+displayIndex)'
      contains: 'Non assigné'
  key_links:
    - from: 'Template displays-editor.component.ts (inline template au-dessus de @Component)'
      to: 'Classe CSS .receiver-badge--unknown définie dans styles inline'
      via: 'Span ngIf=isUnknownFirestick(r) inside *ngFor receiver dropdown loop'
      pattern: 'receiver-badge--unknown'
    - from: 'isUnknownFirestick(r: ReceiverInfo): boolean'
      to: "Renvoie true SSI r.kind === 'firestick' && r.displayIndex === null"
      via: 'Helper TS exposé à la classe component'
      pattern: 'isUnknownFirestick'
---

<objective>
Ajouter un badge ambre "Non assigné" dans la vue Écrans (`displays-editor.component`) au niveau de la liste du dropdown receiver, pour chaque MAC firestick détectée par le Pi mais non encore assignée à un display. Distinct du badge vert (assigné) et du badge rouge stale. Les `kind === 'browser'` (téléphones bénévoles) ne reçoivent jamais de badge.

Purpose: L'admin ouvre le dropdown receiver et voit immédiatement si un Fire Stick branché en attente d'assignation existe sur le hotspot, signalé visuellement par une couleur ambre distincte du vert (assigné) et du badge stale rouge (perdu de vue).

Output: Helper TS, classe CSS, template binding, tests Karma verts.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-allowlist-mac-hostapd/12-CONTEXT.md

# Existing code to reference

@central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
@central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts

<interfaces>
<!-- ReceiverInfo (already imported in displays-editor.component.ts) -->
```typescript
interface ReceiverInfo {
  mac: string;
  kind: 'firestick' | 'browser' | 'pi_native';
  displayIndex: number | null;
  lastSeenAt: string | number;
}
```

<!-- Existing badge classes (lines 358-420 of displays-editor.component.ts inline styles) -->

- .receiver-badge--native : bleu, Pi natif HDMI #0
- .receiver-badge--assigned : vert, Fire Stick assigné à un display
- .receiver-badge--mac : modifier, affiche la MAC tronquée
- .receiver-badge--stale : rouge, MAC pas vue depuis > 5min
- .receiver-badge--reassign : variant du dropdown trigger
- .receiver-badge--unassigned : gris, bouton "+ Assigner" pour display sans receiver
- (NEW) .receiver-badge--unknown : ambre #f59e0b, Fire Stick détecté hotspot mais sans displayIndex

<!-- Existing dropdown loop (template lines 97-106) -->

```html
<ng-container *ngIf="getReassignableReceivers(display).length > 0; else noReceivers">
  <button
    class="template-option"
    *ngFor="let r of getReassignableReceivers(display)"
    (click)="assignReceiver(display.index, r)"
  >
    <span class="receiver-mac">{{ r.mac }}</span>
    <span class="receiver-lastseen" *ngIf="getCrossDisplayHint(r, display.index) as hint">
      — {{ hint }}</span
    >
    <span class="receiver-lastseen" *ngIf="!getCrossDisplayHint(r, display.index)">
      — {{ formatLastSeen(r.lastSeenAt) }}</span
    >
  </button>
  ...
</ng-container>
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add isUnknownFirestick helper + .receiver-badge--unknown CSS + template binding in dropdown</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts</files>

<read_first> - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts (read entire — inline template + styles + class)
</read_first>

  <behavior>
    - Test 1: Quand le dropdown affiche `getReassignableReceivers(display)` et qu'un receiver `r` a `kind === 'firestick'` AND `r.displayIndex === null`, un span `<span class="receiver-badge receiver-badge--unknown">Non assigné</span>` apparaît AVANT `<span class="receiver-mac">`.
    - Test 2: Quand `r.kind === 'browser'` (téléphone bénévole), aucun badge ambre n'apparaît dans la ligne dropdown.
    - Test 3: Quand `r.kind === 'firestick'` et `r.displayIndex === 1` (déjà assigné à un autre display), aucun badge ambre dans la ligne dropdown (le hint cross-display existant continue à s'afficher).
    - Test 4: La classe CSS `.receiver-badge--unknown` a `background: #fef3c7; color: #92400e;` (ambre Tailwind-like) et n'est utilisée nulle part ailleurs que dans le dropdown receiver.
  </behavior>

  <action>
    1. Dans la classe `DisplaysEditorComponent` (ts file), ajouter un helper public à côté de `isReceiverStale`/`getReassignableReceivers` :
    ```typescript
    /**
     * Phase 12 OBSERVE — Vrai SSI le receiver est un Fire Stick détecté sur le hotspot
     * mais pas encore assigné à un display (displayIndex === null).
     * kind === 'browser' (téléphones bénévoles) → false par construction.
     */
    isUnknownFirestick(r: ReceiverInfo): boolean {
      return r.kind === 'firestick' && r.displayIndex === null;
    }
    ```

    2. Dans le template inline (au-dessus de la classe), à l'intérieur du `*ngFor="let r of getReassignableReceivers(display)"` (lignes ~100-106), insérer un span juste AVANT `<span class="receiver-mac">` :
    ```html
    <span
      class="receiver-badge receiver-badge--unknown"
      *ngIf="isUnknownFirestick(r)"
      data-testid="receiver-badge-unknown"
    >Non assigné</span>
    ```

    3. Dans la section `styles: [` du `@Component` decorator (autour des lignes 358-420), ajouter immédiatement après `.receiver-badge--unassigned:hover { ... }` :
    ```css
    .receiver-badge--unknown {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fbbf24;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-right: 0.375rem;
    }
    ```

    Ne PAS modifier `getReassignableReceivers`, ne PAS toucher aux autres badges (assigned/native/stale/unassigned). Le badge n'est inséré QUE dans la liste dropdown — pas dans la zone display row principale (qui reste régie par le badge vert/rouge existant pour les assignés).

  </action>

  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro && grep -n "receiver-badge--unknown\|isUnknownFirestick" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts | wc -l</automated>
  </verify>

<acceptance_criteria> - `grep -n "isUnknownFirestick" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns >= 2 matches (definition + template \*ngIf). - `grep -n "receiver-badge--unknown" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns >= 2 matches (template class + styles). - `grep -n "Non assigné" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns >= 1 match. - `grep -n "data-testid=\"receiver-badge-unknown\"" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns 1 match. - `grep -n "background: #fef3c7" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` returns 1 match. - The function `isUnknownFirestick` returns exactly the boolean expression `r.kind === 'firestick' && r.displayIndex === null` — no other condition (verify with `grep -A1 "isUnknownFirestick(r" displays-editor.component.ts`). - Existing helpers (`isReceiverStale`, `getReassignableReceivers`, `getCrossDisplayHint`) remain unchanged: `git diff` shows no removed lines for these methods.
</acceptance_criteria>

  <done>
    Helper `isUnknownFirestick`, classe CSS `.receiver-badge--unknown`, et badge inline avec `data-testid` ajoutés dans le dropdown ; aucun comportement existant régressé.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Karma tests — badge ambre apparaît pour firestick non assigné, absent sinon</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts</files>

<read_first> - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts (read entire — pour comprendre le pattern fixture, mock connectedReceivers, openReceiverDropdown, fixture.detectChanges)
</read_first>

  <behavior>
    - Test 1: Avec `connectedReceivers = [{mac:'aa:bb:cc:dd:ee:ff', kind:'firestick', displayIndex:null, lastSeenAt:Date.now()}]` et un display 1 sans receiver, ouvrir le dropdown sur display 1 doit rendre exactement 1 élément matchant `[data-testid="receiver-badge-unknown"]` avec textContent === 'Non assigné'.
    - Test 2: Avec `connectedReceivers = [{mac:'aa:bb:cc:dd:ee:ff', kind:'browser', displayIndex:null, lastSeenAt:Date.now()}]`, ouvrir le dropdown ne doit rendre aucun `[data-testid="receiver-badge-unknown"]`.
    - Test 3: Avec `connectedReceivers = [{mac:'aa:bb:cc:dd:ee:ff', kind:'firestick', displayIndex:0, lastSeenAt:Date.now()}]` et le dropdown ouvert sur un display différent (index 1), le badge "Non assigné" ne doit PAS apparaître pour cette MAC (elle est déjà assignée à display 0). Le hint cross-display existant continue de s'afficher.
    - Test 4: Le helper `component.isUnknownFirestick({kind:'firestick', displayIndex:null, mac:'x', lastSeenAt:0})` retourne true, et avec `displayIndex:0` retourne false, et avec `kind:'browser'` retourne false.
  </behavior>

  <action>
    Ajouter à la fin de `displays-editor.component.spec.ts`, AVANT le dernier `});` qui ferme le `describe` racine, un nouveau bloc :
    ```typescript
    describe('Phase 12 OBSERVE — badge ambre Non assigné', () => {
      it('isUnknownFirestick returns true for firestick with displayIndex === null', () => {
        expect(component.isUnknownFirestick({ kind: 'firestick', displayIndex: null, mac: 'aa:bb:cc:dd:ee:01', lastSeenAt: Date.now() } as any)).toBe(true);
        expect(component.isUnknownFirestick({ kind: 'firestick', displayIndex: 0, mac: 'aa:bb:cc:dd:ee:02', lastSeenAt: Date.now() } as any)).toBe(false);
        expect(component.isUnknownFirestick({ kind: 'browser', displayIndex: null, mac: 'aa:bb:cc:dd:ee:03', lastSeenAt: Date.now() } as any)).toBe(false);
      });

      it('renders amber "Non assigné" badge for firestick with displayIndex === null in dropdown', () => {
        component.displays = [
          { index: 0, name: 'TV principale', type: 'pi-native', resolution: '1920x1080', receiver: { kind: 'pi_native' } } as any,
          { index: 1, name: 'TV buvette', type: 'firestick', resolution: '1920x1080' } as any,
        ];
        component.connectedReceivers = [
          { mac: 'aa:bb:cc:dd:ee:ff', kind: 'firestick', displayIndex: null, lastSeenAt: Date.now() } as any,
        ];
        fixture.detectChanges();
        component.openReceiverDropdown(new MouseEvent('click'), 1);
        fixture.detectChanges();

        const badges = fixture.nativeElement.querySelectorAll('[data-testid="receiver-badge-unknown"]');
        expect(badges.length).toBe(1);
        expect(badges[0].textContent.trim()).toBe('Non assigné');
        expect(badges[0].classList.contains('receiver-badge--unknown')).toBe(true);
      });

      it('does NOT render badge for kind=browser (téléphone bénévole)', () => {
        component.displays = [
          { index: 0, name: 'TV', type: 'pi-native', resolution: '1920x1080', receiver: { kind: 'pi_native' } } as any,
          { index: 1, name: 'TV2', type: 'firestick', resolution: '1920x1080' } as any,
        ];
        component.connectedReceivers = [
          { mac: 'aa:bb:cc:dd:ee:bb', kind: 'browser', displayIndex: null, lastSeenAt: Date.now() } as any,
        ];
        fixture.detectChanges();
        component.openReceiverDropdown(new MouseEvent('click'), 1);
        fixture.detectChanges();

        const badges = fixture.nativeElement.querySelectorAll('[data-testid="receiver-badge-unknown"]');
        expect(badges.length).toBe(0);
      });

      it('does NOT render badge for firestick already assigned to another display', () => {
        component.displays = [
          { index: 0, name: 'TV', type: 'pi-native', resolution: '1920x1080', receiver: { kind: 'pi_native' } } as any,
          { index: 1, name: 'TV2', type: 'firestick', resolution: '1920x1080', receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:cc' } } as any,
          { index: 2, name: 'TV3', type: 'firestick', resolution: '1920x1080' } as any,
        ];
        component.connectedReceivers = [
          { mac: 'aa:bb:cc:dd:ee:cc', kind: 'firestick', displayIndex: 1, lastSeenAt: Date.now() } as any,
        ];
        fixture.detectChanges();
        component.openReceiverDropdown(new MouseEvent('click'), 2);
        fixture.detectChanges();

        const badges = fixture.nativeElement.querySelectorAll('[data-testid="receiver-badge-unknown"]');
        expect(badges.length).toBe(0);
      });
    });
    ```

    Adapter les noms de champs `displays`/`connectedReceivers` exactement à ceux exposés en `@Input` du composant (lire le fichier d'abord). Si la mock de display nécessite des champs additionnels (selon le shape Phase 8), les ajouter en `as any` plutôt que de typer strictement.

  </action>

  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro && npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false</automated>
  </verify>

<acceptance_criteria> - `grep -c "Phase 12 OBSERVE — badge ambre Non assigné" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` returns 1. - `grep -c "data-testid=\"receiver-badge-unknown\"" central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts` returns >= 3. - All 4 new `it(...)` cases PASS in Karma (output contains `Phase 12 OBSERVE — badge ambre Non assigné` with 4 specs success). - Existing tests in `displays-editor.component.spec.ts` (Phase 8 + Phase 11) all remain green (output: NO failures, total spec count >= prior + 4).
</acceptance_criteria>

  <done>
    4 nouveaux tests Karma verts couvrant la présence/absence du badge ambre selon `kind` et `displayIndex`. Les tests existants Phase 8/11 restent verts.
  </done>
</task>

</tasks>

<verification>
- Karma cible : `npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false` → 4 nouveaux specs verts + total ≥ 17 (Phase 11 livrait 13).
- Build dashboard : `npm run build:central` ne casse pas (template syntax + classes CSS valides).
- Visuel manuel (post-merge optionnel) : ouvrir Sites > NLF > Écrans, brancher un Fire Stick non assigné sur le hotspot, ouvrir le dropdown receiver d'un display libre — voir le badge ambre "Non assigné" devant la MAC.
</verification>

<success_criteria>

1. Helper `isUnknownFirestick(r)` retourne true UNIQUEMENT pour `kind === 'firestick' && displayIndex === null` (OBSERVE-03).
2. Badge ambre rendu inline dans le dropdown receiver (pas dans la display row principale).
3. `kind === 'browser'` jamais badgé.
4. `kind === 'firestick'` AVEC `displayIndex !== null` jamais badgé (le hint cross-display existant continue à fonctionner).
5. CSS distincte des badges existants (#fef3c7 ambre, vs #10b981 vert assigné, vs #fee2e2 stale).
6. 4 nouveaux tests Karma verts, tests existants intacts.
7. Aucune modification de la signature `getReassignableReceivers` ni des helpers Phase 11.
   </success_criteria>

<output>
After completion, create `.planning/phases/12-allowlist-mac-hostapd/12-02-SUMMARY.md`
</output>
