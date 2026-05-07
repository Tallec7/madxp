/**
 * DisplaysEditorComponent — Phase 8 Receiver UX
 *
 * Regression guard for: pi_native badge (A), assigned badge (B), unassigned button (C),
 * dropdown open (D), assign emit (E), unassign null emit (F), empty state message (G).
 *
 * Uses TestBed with imports: [DisplaysEditorComponent] (standalone component).
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DisplaysEditorComponent } from './displays-editor.component';
import { DisplayConfig, ReceiverInfo } from '../../../../../core/models';

describe('DisplaysEditorComponent — Phase 8 Receiver UX', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;

  const mockReceivers: ReceiverInfo[] = [
    { mac: 'AA:BB:CC:DD:EE:FF', kind: 'firestick', lastSeenAt: new Date().toISOString() },
    {
      mac: '11:22:33:44:55:66',
      kind: 'firestick',
      lastSeenAt: new Date(Date.now() - 120000).toISOString(),
    },
  ];

  const displayNative: DisplayConfig = {
    index: 0,
    name: 'TV',
    type: 'tv',
    resolution: '1920x1080',
  };

  const displayUnassigned: DisplayConfig = {
    index: 1,
    name: 'TV Buvette',
    type: 'tv',
    resolution: '1920x1080',
  };

  const displayAssigned: DisplayConfig = {
    index: 1,
    name: 'TV Buvette',
    type: 'tv',
    resolution: '1920x1080',
    receiver: {
      kind: 'firestick',
      mac: 'AA:BB:CC:DD:EE:FF',
      last_seen_at: new Date().toISOString(),
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplaysEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
  });

  // Test A: Pi native badge for display.index === 0
  it('A — display index 0 shows Pi HDMI badge (read-only)', () => {
    component.displays = [displayNative];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const nativeBadge = el.querySelector('.receiver-badge--native');
    expect(nativeBadge).toBeTruthy();
    expect(nativeBadge!.textContent).toContain('Pi HDMI');

    // No Assigner button for index 0
    const assignerBtn = el.querySelector('.receiver-badge--unassigned');
    expect(assignerBtn).toBeNull();

    // No assigned badge either
    const assignedBadge = el.querySelector('.receiver-badge--assigned');
    expect(assignedBadge).toBeNull();
  });

  // Test B: Assigned display shows green badge with truncated MAC
  it('B — assigned display shows green badge with truncated MAC', () => {
    component.displays = [displayAssigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const badge = el.querySelector('.receiver-badge--assigned') as HTMLElement;
    expect(badge).toBeTruthy();
    // formatMac: 'AA:BB:CC:DD:EE:FF' → 'AA:BB:C…FF'
    expect(badge.textContent).toContain('AA:BB');
    expect(badge.textContent).toContain('FF');

    // No unassigned button for an assigned display
    const assignerBtn = el.querySelector('.receiver-badge--unassigned');
    expect(assignerBtn).toBeNull();
  });

  // Test C: Unassigned display (index > 0) shows Assigner button
  it('C — unassigned display (index > 0) shows Assigner button', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const assignerBtn = el.querySelector('.receiver-badge--unassigned') as HTMLElement;
    expect(assignerBtn).toBeTruthy();
    expect(assignerBtn.textContent).toContain('Assigner');

    // No native badge for index > 0
    const nativeBadge = el.querySelector('.receiver-badge--native');
    expect(nativeBadge).toBeNull();
  });

  // Test D: Click Assigner opens dropdown with receiver MACs
  it('D — clicking Assigner button opens dropdown with receiver MACs', () => {
    component.displays = [displayUnassigned];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown!.textContent).toContain('AA:BB:CC:DD:EE:FF');
    expect(dropdown!.textContent).toContain('11:22:33:44:55:66');
  });

  // Test E: Clicking a MAC in dropdown emits displaysChange with receiver assigned
  it('E — clicking a MAC in dropdown emits displaysChange with receiver.mac set', () => {
    component.displays = [{ ...displayUnassigned }];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    // Subscribe before opening dropdown
    let emitted: DisplayConfig[] | undefined;
    component.displaysChange.subscribe((val: DisplayConfig[]) => (emitted = val));

    // Open dropdown
    const btn = fixture.nativeElement.querySelector(
      '.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    // Click first receiver option
    const options = fixture.nativeElement.querySelectorAll(
      '.receiver-dropdown .template-option',
    );
    expect(options.length).toBeGreaterThan(0);
    (options[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toBeDefined();
    const assigned = emitted!.find((d) => d.index === 1);
    expect(assigned?.receiver?.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(assigned?.receiver?.kind).toBe('firestick');
  });

  // Test F: Clicking Désassigner emits displaysChange with receiver: null
  it('F — clicking Désassigner emits displaysChange with receiver: null', () => {
    component.displays = [{ ...displayAssigned }];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    let emitted: DisplayConfig[] | undefined;
    component.displaysChange.subscribe((val: DisplayConfig[]) => (emitted = val));

    // Open dropdown via assigned badge
    const btn = fixture.nativeElement.querySelector(
      '.receiver-badge--assigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const unassignBtn = fixture.nativeElement.querySelector(
      '.receiver-unassign',
    ) as HTMLButtonElement;
    expect(unassignBtn).toBeTruthy();
    unassignBtn.click();
    fixture.detectChanges();

    expect(emitted).toBeDefined();
    const unassigned = emitted!.find((d) => d.index === 1);
    expect(unassigned?.receiver).toBeNull();
  });

  // Test G: Empty connectedReceivers shows empty state in dropdown
  it('G — empty connectedReceivers shows "Aucun récepteur détecté" in dropdown', () => {
    component.displays = [{ ...displayUnassigned }];
    component.connectedReceivers = [];
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '.receiver-badge--unassigned',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const emptyMsg = el.querySelector('.receiver-empty');
    expect(emptyMsg).toBeTruthy();
    expect(emptyMsg!.textContent).toContain('Aucun récepteur détecté');
  });
});

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

  // Test H — ASSIGN-01 : display assigné → badge MAC séparé + bouton [Réassigner ▾]
  it('H — assigned display shows separate MAC badge + [Réassigner ▾] button (not MAC in button)', () => {
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

  // Test I — ASSIGN-01 : dropdown exclut la MAC courante du display assigné
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

  // Test J — ASSIGN-01 : sous-texte 'actuellement sur [name]' pour MAC cross-display
  it("J — dropdown shows 'actuellement sur [name]' hint for cross-display MAC", () => {
    component.displays = [
      { index: 1, name: 'Écran principal', type: 'tv', receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: new Date().toISOString() } },
      { index: 2, name: 'TV Buvette', type: 'tv' },
    ];
    component.connectedReceivers = mockReceivers;
    fixture.detectChanges();

    // Ouvre dropdown sur display 2 (non assigné)
    const btn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const dropdown = fixture.nativeElement.querySelector('.receiver-dropdown');
    expect(dropdown.textContent).toContain('actuellement sur Écran principal');
  });

  // Test K — ASSIGN-02 + ASSIGN-03 : mutation atomique 2 displays dans 1 seul emit
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

    // Ouvre dropdown sur display 2 (non assigné)
    const btn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    // Sélectionne la MAC déjà assignée au display 1
    const options = fixture.nativeElement.querySelectorAll('.receiver-dropdown .template-option');
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

  // Test L — Zone C : MAC absente de connectedReceivers → badge stale + tooltip
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

  // Test M — Zone C : filtrage vide (seule la MAC courante) → bouton actif + placeholder + Désassigner
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
