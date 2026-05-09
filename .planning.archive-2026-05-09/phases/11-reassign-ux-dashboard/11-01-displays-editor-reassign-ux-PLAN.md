---
phase: 11-reassign-ux-dashboard
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
  - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
autonomous: true
requirements:
  - ASSIGN-01
  - ASSIGN-02
  - ASSIGN-03

must_haves:
  truths:
    - "Sur un display déjà assigné (receiver.kind === 'firestick' && receiver.mac), le bouton dans la colonne Récepteur affiche le texte 'Réassigner ▾' (et non la MAC)"
    - "Le badge MAC '📺 AA:BB…FF' reste visible à gauche du bouton [Réassigner ▾] (info séparée de l'action)"
    - 'Le dropdown ouvert sur un display assigné exclut la MAC actuelle de la liste des options proposées'
    - "Une MAC déjà assignée à un autre display affiche le sous-texte 'actuellement sur [display.name]' au lieu du last_seen_at habituel"
    - 'Sélectionner une MAC déjà assignée à un autre display déclenche un seul displaysChange.emit() avec un payload contenant 2 mutations : source.receiver = null et target.receiver = nouveau receiver'
    - "Quand display.receiver.mac existe mais est absent de connectedReceivers, le badge MAC reçoit la classe CSS receiver-badge--stale et un title='Récepteur hors-ligne'"
    - "Quand connectedReceivers (filtré) est vide, le bouton [Réassigner ▾] reste actif et le dropdown affiche 'Aucun récepteur détecté (Pi hors-ligne ?)' + l'option Désassigner"
    - "Tous les tests Karma A-G de Phase 8 + nouveaux tests H-M passent (npm run test:central -- --include='**/displays-editor.component.spec.ts' exits 0)"
  artifacts:
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts'
      provides: 'Composant displays-editor étendu avec UX réassignation 1-clic, helper isReceiverStale, helper getReassignableReceivers, helper getCrossDisplayHint, classe CSS receiver-badge--stale, classe CSS receiver-badge--mac, classe CSS receiver-badge--reassign'
      contains: 'isReceiverStale('
    - path: 'central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts'
      provides: 'Tests Karma Phase 11 (H-M) couvrant ASSIGN-01/02/03 + Zone C — au moins 5 nouveaux tests'
      contains: 'Réassigner'
  key_links:
    - from: 'displays-editor.component.ts.assignReceiver()'
      to: 'displaysChange.emit() avec mutation atomique 2-displays'
      via: 'this.displays.find() pour détecter source + this.displays.map() qui mute source ET target dans la même passe'
      pattern: "displaysChange\\.emit\\(\\[\\.\\.\\.this\\.displays\\]\\)"
    - from: 'Template badge MAC'
      to: 'Helper isReceiverStale(display)'
      via: '[class.receiver-badge--stale]="isReceiverStale(display)" + [title]="isReceiverStale(display) ? ''Récepteur hors-ligne'' : ..."'
      pattern: 'receiver-badge--stale'
    - from: 'Template dropdown options'
      to: 'Helper getReassignableReceivers(display) + getCrossDisplayHint(receiver, displayIndex)'
      via: "*ngFor='let r of getReassignableReceivers(display)' + sous-texte conditionnel"
      pattern: "getReassignableReceivers\\("
---

<objective>
Étendre le composant `DisplaysEditorComponent` (livré Phase 8) avec la réassignation 1-clic d'un Fire Stick d'un display à un autre, sans passer par Désassigner puis Assigner en deux temps.

Purpose: Phase 11 (REASSIGN) du milestone v4.1 Fire Stick polish. Élimine la friction UX pour le bénévole/admin lors d'une réorganisation des écrans (rotation des Fire Sticks entre TVs).

Output:

- Composant `displays-editor.component.ts` étendu (~120 LOC ajoutées) — bouton [Réassigner ▾], helpers `isReceiverStale` / `getReassignableReceivers` / `getCrossDisplayHint`, mutation atomique 2-displays dans `assignReceiver`, classe CSS `receiver-badge--stale`.
- Spec `displays-editor.component.spec.ts` étendue (~150 LOC ajoutées) — au moins 5 tests H-M pour ASSIGN-01/02/03 + Zone C, sans casser les tests A-G de Phase 8.
- Zéro modification backend. Zéro modification du parent `site-settings-tab.component.ts` (le PATCH existant accepte déjà un payload mutant N displays simultanément).
  </objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/11-reassign-ux-dashboard/11-CONTEXT.md
@.planning/phases/11-reassign-ux-dashboard/11-RESEARCH.md
@.planning/phases/11-reassign-ux-dashboard/11-VALIDATION.md
@central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts
@central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts
@central-dashboard/src/app/core/models/index.ts
@CLAUDE.md
@.claude/rules/testing.md
@.claude/rules/dashboard.md

<interfaces>
<!-- Types et signatures dont l'exécuteur a besoin pour implémenter sans explorer le codebase -->

From central-dashboard/src/app/core/models/index.ts:

```typescript
export interface ReceiverConfig {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string;
  last_seen_at?: string; // ISO8601
}

export interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  receiver?: ReceiverConfig | null;
}

export interface ReceiverInfo {
  mac: string;
  kind: 'pi_native' | 'firestick' | 'browser';
  lastSeenAt: string; // ISO8601
}
```

From displays-editor.component.ts (Phase 8 — méthodes existantes à réutiliser/étendre):

```typescript
@Input() displays: DisplayConfig[];
@Input() connectedReceivers: ReceiverInfo[];
@Output() displaysChange = new EventEmitter<DisplayConfig[]>();

formatMac(mac: string): string;          // Retourne 'AA:BB:C…FF'
formatLastSeen(iso: string): string;     // Retourne 'il y a 2 min'
openReceiverDropdown(event, displayIndex): void;  // À conserver tel quel
assignReceiver(displayIndex, receiver): void;     // À ÉTENDRE (mutation 2-displays)
unassignReceiver(displayIndex): void;             // Inchangé
```

Pattern OnPush + cdr.markForCheck() obligatoire dans toute mutation locale (CLAUDE.md, rule .claude/rules/dashboard.md).
</interfaces>

</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Étendre DisplaysEditorComponent — helpers + mutation atomique + template + CSS</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts</files>

<read_first> - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts (composant cible 565 lignes — lire INTÉGRALEMENT avant édition) - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts (pour comprendre le contrat exact attendu par les tests A-G qui doivent rester verts) - central-dashboard/src/app/core/models/index.ts (lignes 175-196 — DisplayConfig, ReceiverConfig, ReceiverInfo) - .planning/phases/11-reassign-ux-dashboard/11-CONTEXT.md (Zones A/B/C — décisions verrouillées) - .planning/phases/11-reassign-ux-dashboard/11-RESEARCH.md (Patterns 1-4 + Code Examples + Pitfalls) - .planning/phases/08-dashboard-ux-admin-assignation/08-CONTEXT.md (pattern OnPush + dropdown position:fixed à conserver) - .claude/rules/dashboard.md (règles smoke test enforced — ne pas reverser pattern OnPush, ne pas introduire de fetch())
</read_first>

  <behavior>
    - Test H : Display avec receiver.kind === 'firestick' && receiver.mac rend le bouton avec textContent === 'Réassigner ▾' (pas la MAC dans le bouton). Le badge MAC '.receiver-badge--mac' est aussi présent à côté.
    - Test I : Dropdown ouvert sur display assigné exclut la MAC courante (elle n'apparaît dans aucune option).
    - Test J : Si une MAC du dropdown est déjà sur un autre display, le sous-texte affiché contient 'actuellement sur [name]' (utilise display.name, ex: 'Écran principal').
    - Test K : Sélectionner une MAC déjà assignée à un autre display déclenche emitCount === 1, et le payload contient 2 mutations : displays.find(d => d.index === sourceIndex).receiver === null ET displays.find(d => d.index === targetIndex).receiver.mac === macSelected.
    - Test L : display.receiver.mac présent mais absent de connectedReceivers → le badge .receiver-badge--mac reçoit la classe .receiver-badge--stale ET title === 'Récepteur hors-ligne'.
    - Test M : connectedReceivers vide (ou filtré vide après exclusion MAC courante) → le bouton [Réassigner ▾] reste actif (pas de disabled), cliquer ouvre le dropdown qui affiche '.receiver-empty' avec textContent contenant 'Aucun récepteur détecté' + une option '— Désassigner'.
  </behavior>

  <action>
    Étendre `DisplaysEditorComponent` (TS strict, OnPush conservé, Conventional Commits) :

    **1. Ajouter 3 méthodes publiques (au-dessus de `assignReceiver`) :**

    ```typescript
    /** True si display.receiver.mac existe mais est absent de connectedReceivers (Fire Stick offline). */
    isReceiverStale(display: DisplayConfig): boolean {
      const mac = display.receiver?.mac;
      if (!mac) return false;
      return !this.connectedReceivers.find(r => r.mac === mac);
    }

    /** Receivers sélectionnables pour ce display (exclut la MAC courante du display). */
    getReassignableReceivers(display: DisplayConfig): ReceiverInfo[] {
      const currentMac = display.receiver?.mac;
      return currentMac
        ? this.connectedReceivers.filter(r => r.mac !== currentMac)
        : this.connectedReceivers;
    }

    /** Si un receiver est déjà assigné à un autre display, retourne 'actuellement sur [name]', sinon null. */
    getCrossDisplayHint(receiver: ReceiverInfo, currentDisplayIndex: number): string | null {
      const other = this.displays.find(
        d => d.receiver?.mac === receiver.mac && d.index !== currentDisplayIndex
      );
      return other ? `actuellement sur ${other.name}` : null;
    }
    ```

    **2. Refactor `assignReceiver(displayIndex, receiver)` pour mutation atomique 2-displays :**

    ```typescript
    assignReceiver(displayIndex: number, receiver: ReceiverInfo): void {
      // Détecte le display source si la MAC est déjà assignée ailleurs (cross-display reassign)
      const sourceDisplay = this.displays.find(
        d => d.receiver?.mac === receiver.mac && d.index !== displayIndex
      );

      this.displays = this.displays.map(d => {
        // Target : set new receiver
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
        // Source : clear receiver (cross-display reassign — même passe map())
        if (sourceDisplay && d.index === sourceDisplay.index) {
          return { ...d, receiver: null };
        }
        return d;
      });

      this.activeDropdownIndex = null;
      this.displaysChange.emit([...this.displays]); // Single emit, atomic payload (1 ou 2 mutations)
      this.cdr.markForCheck();
    }
    ```

    **3. Modifier le template (bloc State 2 — Fire Stick assigned, lignes ~58-70 actuelles) :**

    Remplacer le bouton combiné Phase 8 :
    ```html
    <ng-container *ngIf="display.index !== 0 && display.receiver?.kind === 'firestick' && display.receiver?.mac">
      <button class="receiver-badge receiver-badge--assigned" ...>
        📺 {{ formatMac(display.receiver!.mac!) }} ▾
      </button>
    </ng-container>
    ```

    Par badge séparé + bouton [Réassigner ▾] :
    ```html
    <ng-container *ngIf="display.index !== 0 && display.receiver?.kind === 'firestick' && display.receiver?.mac">
      <span
        class="receiver-badge receiver-badge--mac"
        [class.receiver-badge--stale]="isReceiverStale(display)"
        [title]="isReceiverStale(display) ? 'Récepteur hors-ligne' : display.receiver!.mac!"
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

    **4. Modifier le template du dropdown (bloc *ngFor receivers, lignes ~89-97 actuelles) :**

    Remplacer :
    ```html
    <button class="template-option" *ngFor="let r of connectedReceivers" (click)="assignReceiver(display.index, r)">
      <span class="receiver-mac">{{ r.mac }}</span>
      <span class="receiver-lastseen"> — {{ formatLastSeen(r.lastSeenAt) }}</span>
    </button>
    ```

    Par filtrage MAC courante + sous-texte conditionnel :
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

    Important : guard de l'empty state doit basculer sur `getReassignableReceivers(display).length` au lieu de `connectedReceivers.length` :
    ```html
    <ng-container *ngIf="getReassignableReceivers(display).length > 0; else noReceivers">
    ```

    **5. Ajouter les styles CSS dans le bloc `styles: [...]` (à côté des `.receiver-badge--*` existants) :**

    ```css
    .receiver-badge--mac {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
      cursor: default;
    }

    .receiver-badge--stale {
      opacity: 0.55;
      background: #f1f5f9;
      color: #94a3b8;
      border-color: #cbd5e1;
    }

    .receiver-badge--reassign {
      background: transparent;
      color: #3b82f6;
      cursor: pointer;
      text-decoration: underline;
      padding: 0.125rem 0.25rem;
      font-size: 0.75rem;
    }

    .receiver-badge--reassign:hover {
      color: #2563eb;
    }
    ```

    **Contraintes invariantes (NE PAS faire) :**
    - NE PAS retirer `ChangeDetectionStrategy.OnPush` (rule dashboard.md).
    - NE PAS retirer `cdr.markForCheck()` à la fin de `assignReceiver` / `unassignReceiver` / `openReceiverDropdown`.
    - NE PAS introduire de `fetch()` (rule dashboard.md — composant pur).
    - NE PAS muter `display.receiver = null` en place — toujours `this.displays = this.displays.map(...)` puis `emit([...this.displays])` (Pitfall 3 RESEARCH).
    - NE PAS faire 2 emits séparés (1 pour source, 1 pour target) — single emit atomique obligatoire (Zone B CONTEXT).
    - NE PAS appeler une API depuis le composant — laisser le parent `site-settings-tab` gérer le PATCH (pattern composant pur Phase 8).
    - NE PAS modifier `unassignReceiver` (Phase 11 ne le touche pas).
    - NE PAS modifier le bloc State 1 (Pi native badge) ni State 3 (Unassigned button + Assigner) — invariants Phase 8.

  </action>

  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/vigorous-nash-48c552/central-dashboard && npm run build 2>&1 | tail -20</automated>
  </verify>

<acceptance_criteria> - displays-editor.component.ts contains "isReceiverStale(" - displays-editor.component.ts contains "getReassignableReceivers(" - displays-editor.component.ts contains "getCrossDisplayHint(" - displays-editor.component.ts contains "actuellement sur " - displays-editor.component.ts contains "receiver-badge--stale" - displays-editor.component.ts contains "receiver-badge--mac" - displays-editor.component.ts contains "receiver-badge--reassign" - displays-editor.component.ts contains "Réassigner ▾" - displays-editor.component.ts contains "Récepteur hors-ligne" - displays-editor.component.ts contains "sourceDisplay" (mutation atomique) - displays-editor.component.ts contains "ChangeDetectionStrategy.OnPush" - displays-editor.component.ts contains "this.cdr.markForCheck()" - `cd central-dashboard && npm run build` exits 0 (Angular AOT compile + TS strict) - grep -c "displaysChange.emit" displays-editor.component.ts → unchanged ou +0 (toujours 1 seul emit dans assignReceiver)
</acceptance_criteria>

  <done>
    Le composant compile en TypeScript strict + Angular AOT. Bouton [Réassigner ▾] séparé du badge MAC. Helpers `isReceiverStale`, `getReassignableReceivers`, `getCrossDisplayHint` ajoutés. `assignReceiver` mute source + target dans une seule passe `.map()` et émet une seule fois `displaysChange`. Classes CSS `receiver-badge--stale` / `--mac` / `--reassign` ajoutées. Tous les invariants Phase 8 conservés (OnPush, cdr.markForCheck, dropdown position:fixed, pattern composant pur).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Étendre les tests Karma — H/I/J/K/L/M pour ASSIGN-01/02/03 + Zone C</name>
  <files>central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts</files>

<read_first> - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.spec.ts (spec Phase 8 — pattern TestBed standalone + 7 tests A-G à ne pas casser) - central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts (post-Task 1 — pour aligner les sélecteurs CSS et les comportements testés) - .planning/phases/11-reassign-ux-dashboard/11-RESEARCH.md (Code Examples 1-3 — patterns Karma exacts) - .planning/phases/11-reassign-ux-dashboard/11-VALIDATION.md (Per-Task Verification Map — 7 tests pinés) - .planning/phases/11-reassign-ux-dashboard/11-CONTEXT.md (Zone D — scénarios pinés)
</read_first>

  <behavior>
    Ajouter 6 nouveaux tests (H, I, J, K, L, M) dans un nouveau `describe('DisplaysEditorComponent — Phase 11 Reassign UX', ...)` dans le même fichier spec, sans toucher aux tests A-G existants.

    - **Test H (ASSIGN-01)** : Display assigné rend `<button.receiver-badge--reassign>` avec textContent === 'Réassigner ▾' ; un `<span.receiver-badge--mac>` est aussi présent (badge MAC séparé).
    - **Test I (ASSIGN-01)** : Sur un display assigné à AA:BB:CC:DD:EE:FF avec mockReceivers contenant aussi 11:22:33:44:55:66, ouvrir le dropdown et vérifier que `.receiver-dropdown .template-option` ne contient PAS AA:BB:CC:DD:EE:FF (filtré) mais contient 11:22:33:44:55:66.
    - **Test J (ASSIGN-01)** : Display 1 ('Écran principal') assigné à AA:BB:CC:DD:EE:FF + display 2 ('TV Buvette') unassigned. Ouvrir dropdown sur display 2. Le textContent du dropdown contient 'actuellement sur Écran principal'.
    - **Test K (ASSIGN-02 + ASSIGN-03)** : Même setup que test J. Sélectionner AA:BB:CC:DD:EE:FF dans le dropdown du display 2. Assertions :
      - emitCount === 1 (un seul emit)
      - emitted.find(d => d.index === 1).receiver === null (source clearée)
      - emitted.find(d => d.index === 2).receiver.mac === 'AA:BB:CC:DD:EE:FF' (target assignée)
      - emitted.find(d => d.index === 2).receiver.kind === 'firestick'
    - **Test L (Zone C — stale)** : Display assigné à 'ZZ:ZZ:ZZ:ZZ:ZZ:ZZ' qui n'est pas dans mockReceivers. Vérifier `.receiver-badge--mac.receiver-badge--stale` présent + `getAttribute('title') === 'Récepteur hors-ligne'`.
    - **Test M (Zone C — empty filtered)** : Display assigné à AA:BB:CC:DD:EE:FF, connectedReceivers === [{mac: 'AA:BB:CC:DD:EE:FF', ...}] (uniquement la MAC courante → filtré vide). Cliquer sur le bouton [Réassigner ▾] → `.receiver-empty` présent dans le dropdown avec 'Aucun récepteur détecté' + `.receiver-unassign` ('— Désassigner') présent.

  </behavior>

  <action>
    Ajouter à la fin du fichier `displays-editor.component.spec.ts`, APRÈS le `describe('DisplaysEditorComponent — Phase 8 Receiver UX', ...)` existant, un nouveau bloc `describe`. Réutiliser le pattern TestBed standalone identique :

    ```typescript
    describe('DisplaysEditorComponent — Phase 11 Reassign UX', () => {
      let fixture: ComponentFixture<DisplaysEditorComponent>;
      let component: DisplaysEditorComponent;

      const mockReceivers: ReceiverInfo[] = [
        { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
        { mac: '11:22:33:44:55:66', kind: 'firestick', lastSeenAt: new Date(Date.now() - 120000).toISOString() },
      ];

      beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [DisplaysEditorComponent] }).compileComponents();
        fixture = TestBed.createComponent(DisplaysEditorComponent);
        component = fixture.componentInstance;
      });

      // Test H — ASSIGN-01
      it("H — assigned display shows separate MAC badge + [Réassigner ▾] button (not MAC in button)", () => {
        component.displays = [{
          index: 1, name: 'Écran principal', type: 'tv',
          receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() },
        }];
        component.connectedReceivers = mockReceivers;
        fixture.detectChanges();

        const reassignBtn = fixture.nativeElement.querySelector('.receiver-badge--reassign') as HTMLElement;
        expect(reassignBtn).toBeTruthy();
        expect(reassignBtn.textContent?.trim()).toContain('Réassigner');

        const macBadge = fixture.nativeElement.querySelector('.receiver-badge--mac') as HTMLElement;
        expect(macBadge).toBeTruthy();
        expect(macBadge.textContent).toContain('AA:BB');
      });

      // Test I — ASSIGN-01 (filtre MAC courante)
      it('I — dropdown excludes the current MAC of the assigned display', () => {
        component.displays = [{
          index: 1, name: 'TV', type: 'tv',
          receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() },
        }];
        component.connectedReceivers = mockReceivers;
        fixture.detectChanges();

        const btn = fixture.nativeElement.querySelector('.receiver-badge--reassign') as HTMLButtonElement;
        btn.click();
        fixture.detectChanges();

        const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
        expect(dropdown.textContent).not.toContain('AA:BB:CC:DD:EE:FF');
        expect(dropdown.textContent).toContain('11:22:33:44:55:66');
      });

      // Test J — ASSIGN-01 (sous-texte cross-display)
      it("J — dropdown shows 'actuellement sur [name]' hint for cross-display MAC", () => {
        component.displays = [
          { index: 1, name: 'Écran principal', type: 'tv', receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() } },
          { index: 2, name: 'TV Buvette', type: 'tv' },
        ];
        component.connectedReceivers = mockReceivers;
        fixture.detectChanges();

        const btn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
        btn.click();
        fixture.detectChanges();

        const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
        expect(dropdown.textContent).toContain('actuellement sur Écran principal');
      });

      // Test K — ASSIGN-02 + ASSIGN-03 (atomicité 2 mutations dans 1 emit)
      it('K — selecting cross-display MAC emits 2 mutations atomically (single emit)', () => {
        component.displays = [
          { index: 1, name: 'Écran principal', type: 'tv', receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() } },
          { index: 2, name: 'TV Buvette', type: 'tv' },
        ];
        component.connectedReceivers = mockReceivers;
        fixture.detectChanges();

        let emitCount = 0;
        let emitted: DisplayConfig[] | undefined;
        component.displaysChange.subscribe((val: DisplayConfig[]) => { emitCount++; emitted = val; });

        const btn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
        btn.click();
        fixture.detectChanges();

        const options = fixture.nativeElement.querySelectorAll('.receiver-dropdown .template-option');
        // Trouver l'option AA:BB:... (la 1ère option non-Désassigner contenant la MAC)
        const targetOption = Array.from(options).find(
          (o) => (o as HTMLElement).textContent?.includes('AA:BB:CC:DD:EE:FF')
        ) as HTMLButtonElement;
        expect(targetOption).toBeTruthy();
        targetOption.click();
        fixture.detectChanges();

        expect(emitCount).toBe(1);
        expect(emitted).toBeDefined();
        const source = emitted!.find((d) => d.index === 1);
        const target = emitted!.find((d) => d.index === 2);
        expect(source?.receiver).toBeNull();
        expect(target?.receiver?.mac).toBe('AA:BB:CC:DD:EE:FF');
        expect(target?.receiver?.kind).toBe('firestick');
      });

      // Test L — Zone C (stale badge)
      it('L — display with MAC absent from connectedReceivers shows stale badge + tooltip', () => {
        component.displays = [{
          index: 1, name: 'TV', type: 'tv',
          receiver: { kind: 'firestick', mac: 'ZZ:ZZ:ZZ:ZZ:ZZ:ZZ', last_seen_at: new Date().toISOString() },
        }];
        component.connectedReceivers = mockReceivers; // ne contient pas ZZ:...
        fixture.detectChanges();

        const macBadge = fixture.nativeElement.querySelector('.receiver-badge--mac') as HTMLElement;
        expect(macBadge).toBeTruthy();
        expect(macBadge.classList.contains('receiver-badge--stale')).toBe(true);
        expect(macBadge.getAttribute('title')).toBe('Récepteur hors-ligne');
      });

      // Test M — Zone C (empty filtered set, button still active)
      it('M — empty filtered receivers (only current MAC) keeps button active + shows placeholder + Désassigner', () => {
        component.displays = [{
          index: 1, name: 'TV', type: 'tv',
          receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() },
        }];
        component.connectedReceivers = [
          { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
        ];
        fixture.detectChanges();

        const btn = fixture.nativeElement.querySelector('.receiver-badge--reassign') as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.hasAttribute('disabled')).toBe(false);
        btn.click();
        fixture.detectChanges();

        const empty = fixture.nativeElement.querySelector('.receiver-empty');
        expect(empty).toBeTruthy();
        expect(empty.textContent).toContain('Aucun récepteur détecté');

        const unassign = fixture.nativeElement.querySelector('.receiver-unassign');
        expect(unassign).toBeTruthy();
        expect(unassign.textContent).toContain('Désassigner');
      });
    });
    ```

    **Contraintes :**
    - NE PAS modifier le `describe('DisplaysEditorComponent — Phase 8 Receiver UX', ...)` existant.
    - NE PAS modifier les fixtures/mocks Phase 8 (mockReceivers, displayNative, displayUnassigned, displayAssigned restent intacts).
    - NE PAS introduire de dépendance HttpClient/Router (composant pur, TestBed standalone-only).
    - Réutiliser les sélecteurs CSS exacts du Task 1 (`.receiver-badge--reassign`, `.receiver-badge--mac`, `.receiver-badge--stale`, `.receiver-badge--unassigned`, `.receiver-dropdown .template-option`, `.receiver-empty`, `.receiver-unassign`).

  </action>

  <verify>
    <automated>cd /Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/worktrees/vigorous-nash-48c552/central-dashboard && npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false 2>&1 | tail -40</automated>
  </verify>

<acceptance_criteria> - displays-editor.component.spec.ts contains "Phase 11 Reassign UX" - displays-editor.component.spec.ts contains "H — assigned display shows separate MAC badge" - displays-editor.component.spec.ts contains "I — dropdown excludes the current MAC" - displays-editor.component.spec.ts contains "J — dropdown shows 'actuellement sur" - displays-editor.component.spec.ts contains "K — selecting cross-display MAC emits 2 mutations atomically" - displays-editor.component.spec.ts contains "L — display with MAC absent from connectedReceivers shows stale badge" - displays-editor.component.spec.ts contains "M — empty filtered receivers" - displays-editor.component.spec.ts contains "expect(emitCount).toBe(1)" (assertion atomicité) - displays-editor.component.spec.ts contains "expect(source?.receiver).toBeNull()" (assertion mutation source) - `npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false` exits 0 - Les 7 tests A-G de Phase 8 + 6 nouveaux tests H-M passent (13 tests total verts)
</acceptance_criteria>

  <done>
    6 nouveaux tests Karma (H, I, J, K, L, M) ajoutés dans un `describe` dédié Phase 11 du même fichier spec. Tests A-G de Phase 8 inchangés et toujours verts. Suite Karma cible verte (`npm run test:central -- --include='**/displays-editor.component.spec.ts'` exits 0). ASSIGN-01/02/03 + Zone C couverts par assertions automatisées.
  </done>
</task>

</tasks>

<verification>
**Sampling per task** : `npm run test:central -- --include='**/displays-editor.component.spec.ts' --watch=false` (~3-5s, 13 tests).

**Phase gate** (avant `/gsd:verify-work`) :

1. `cd central-dashboard && npm run build` exits 0 (TS strict + Angular AOT).
2. `npm run test:central` (suite Karma complète, 520+ tests, ~60s — vérifie qu'aucune régression).
3. `npm run test:smoke:smart` depuis la racine (smoke server domain-aware — devrait skip car aucun fichier server modifié, mais on vérifie).
4. Validation manuelle ASSIGN-03 (cf. 11-VALIDATION.md Manual-Only Verifications) : sur Pi RACC avec 2 Fire Sticks, réassigner FS-A → Display 2, vérifier que l'ancien display de FS-B repasse en page d'attente sans reboot. Optionnel (couvert implicitement par Phase 7+9).
   </verification>

<success_criteria>

- [ ] Composant `displays-editor.component.ts` étendu : helpers `isReceiverStale`, `getReassignableReceivers`, `getCrossDisplayHint` + `assignReceiver` mute 2 displays atomiquement.
- [ ] Template Phase 11 : badge MAC séparé (`.receiver-badge--mac`) + bouton `[Réassigner ▾]` (`.receiver-badge--reassign`) + dropdown filtré + sous-texte cross-display.
- [ ] CSS : classes `.receiver-badge--mac`, `.receiver-badge--stale`, `.receiver-badge--reassign` ajoutées.
- [ ] Tests Karma : 6 nouveaux tests H-M dans un `describe` Phase 11 dédié, sans casser les 7 tests A-G de Phase 8.
- [ ] `npm run test:central -- --include='**/displays-editor.component.spec.ts'` exits 0 (13 tests verts).
- [ ] `npm run build` (central-dashboard) exits 0 (TS strict + AOT).
- [ ] Aucune régression : `OnPush`, `cdr.markForCheck()`, dropdown `position:fixed`, pattern composant pur, dropdown placeholder vide → tous conservés.
- [ ] Aucun fichier backend (`central-server/`, `raspberry/`, `sync-agent/`) modifié.
      </success_criteria>

<output>
After completion, create `.planning/phases/11-reassign-ux-dashboard/11-01-SUMMARY.md` documenting:
- Files modified (2 fichiers)
- Helpers ajoutés et leur signature
- Pattern atomicité 2-displays (cite test K)
- Décisions Zone A/B/C respectées
- Tests verts (13 total : A-G Phase 8 + H-M Phase 11)
- Commit hashes (1 commit Task 1 implémentation + 1 commit Task 2 tests, conventionnel `feat(displays-editor): ...`)
</output>
