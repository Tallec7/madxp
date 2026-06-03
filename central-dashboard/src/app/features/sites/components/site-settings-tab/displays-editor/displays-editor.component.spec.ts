/**
 * DisplaysEditorComponent — Phase 8 Receiver UX
 *
 * Regression guard for: pi_native badge (A), assigned badge (B), unassigned button (C),
 * dropdown open (D), assign emit (E), unassign null emit (F), empty state message (G).
 *
 * Uses TestBed with imports: [DisplaysEditorComponent] (standalone component).
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
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
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    await TestBed.configureTestingModule({ imports: [DisplaysEditorComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
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

describe('Phase 12 OBSERVE — badge ambre Non assigné', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DisplaysEditorComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
  });

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
    // Click the "+ Assigner" button for display 1 to open dropdown
    const assignBtn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
    assignBtn.click();
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
    // Click the "+ Assigner" button for display 1 to open dropdown
    const assignBtn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
    assignBtn.click();
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
    // Click the "+ Assigner" button for display 2 (the unassigned one) to open dropdown
    const assignBtn = fixture.nativeElement.querySelector('.receiver-badge--unassigned') as HTMLButtonElement;
    assignBtn.click();
    fixture.detectChanges();

    // The firestick is in the dropdown (different display), but has displayIndex: 1 (not null) so no badge
    const badges = fixture.nativeElement.querySelectorAll('[data-testid="receiver-badge-unknown"]');
    expect(badges.length).toBe(0);
  });
});

describe('DisplaysEditorComponent — LED perimeter profile (PROP-014)', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;

  const ledDisplay: DisplayConfig = {
    index: 1,
    name: 'Bord de terrain',
    type: 'led-perimeter',
    led: {
      sides: [40, 20, 20],
      pitch: 'P6',
      height: 160,
      spacing_m: 10,
      zones: 'uniform',
      canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DisplaysEditorComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
  });

  it('renders the LED panel ONLY for type led-perimeter (type-driven, not index)', () => {
    component.displays = [
      { index: 0, name: 'TV', type: 'tv', resolution: '1920x1080' },
      { ...ledDisplay, led: { ...ledDisplay.led! } },
    ];
    fixture.detectChanges();

    const panels = fixture.nativeElement.querySelectorAll('[data-testid="led-panel"]');
    expect(panels.length).toBe(1); // only the led-perimeter display, not the TV
    expect(fixture.nativeElement.querySelector('[data-testid="led-sides"]')).toBeTruthy();
  });

  it('normalizes a led-perimeter display missing its led profile (defaults applied)', () => {
    component.displays = [{ index: 1, name: 'LED', type: 'led-perimeter' } as DisplayConfig];
    fixture.detectChanges();

    const d = component.displays[0];
    expect(d.led).toBeTruthy();
    expect(d.led!.pitch).toBe('P6');
    expect(d.led!.canvas_in?.band_width).toBe(1920);
    expect(d.led!.canvas_in?.mode).toBe('B');
  });

  it('adding the led-perimeter template seeds a default led profile', () => {
    component.displays = [{ index: 0, name: 'TV', type: 'tv' }];
    fixture.detectChanges();

    const tpl = component.templates.find((t) => t.type === 'led-perimeter')!;
    expect(tpl).toBeTruthy();
    component.addFromTemplate(tpl);
    fixture.detectChanges();

    const added = component.displays.find((d) => d.type === 'led-perimeter');
    expect(added?.led).toBeTruthy();
    expect(added?.led?.zones).toBe('uniform');
  });

  it('computes ribbon width and band count (80 m P6 → 13333×160 → 7 bands)', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();

    const d = component.displays[0];
    // 80 m × (1000/6) = 13333.3 → round 13333
    expect(component.getLedRibbonWidth(d)).toBe(13333);
    expect(component.getLedBandCount(d)).toBe(7); // ceil(13333/1920)
    expect(component.getLedCanvasHeight(d)).toBe(1120); // 7 × 160
  });

  it('parses comma-separated sides and emits change', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led!, sides: [40] } }];
    fixture.detectChanges();

    let emitted: DisplayConfig[] | undefined;
    component.displaysChange.subscribe((v) => (emitted = v));

    component.onLedSidesChange(component.displays[0], '40, 20, 20');
    expect(component.displays[0].led!.sides).toEqual([40, 20, 20]);
    expect(emitted).toBeDefined();
  });

  it('drops invalid side tokens (non-numeric, zero, negative)', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    component.onLedSidesChange(component.displays[0], '40, abc, 0, -5, 20');
    expect(component.displays[0].led!.sides).toEqual([40, 20]);
  });

  it('spacing options = divisors of gcd(sides) ≥ 4 m (40/20/20 → 4,5,10,20; never 8)', () => {
    const opts = component.getSpacingOptions({ ...ledDisplay, led: { ...ledDisplay.led! } });
    expect(opts).toContain(4);
    expect(opts).toContain(5);
    expect(opts).toContain(10);
    expect(opts).toContain(20);
    expect(opts).not.toContain(8); // 8 ne divise pas 20 → exclu (PROP-014 §4)
  });

  it('spacing options always include the current value even if not a divisor', () => {
    const led = { ...ledDisplay.led!, spacing_m: 7 };
    const opts = component.getSpacingOptions({ ...ledDisplay, led });
    expect(opts).toContain(7);
  });

  it('flags canvas as provisional until SPIKE confirms band_count', () => {
    const provisional = { ...ledDisplay, led: { ...ledDisplay.led! } };
    expect(component.isCanvasProvisional(provisional)).toBe(true);

    const confirmed = {
      ...ledDisplay,
      led: { ...ledDisplay.led!, canvas_in: { band_width: 1920, band_count: 7, order: 'top-to-bottom' as const, mode: 'B' as const } },
    };
    expect(component.isCanvasProvisional(confirmed)).toBe(false);
  });

  it('renders the provisional badge (« à confirmer install ») while band_count unset', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.led-provisional');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('à confirmer');
  });

  it('renders a ribbon preview with one bar per fold band (7 for 80 m P6)', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    const preview = fixture.nativeElement.querySelector('[data-testid="led-ribbon-preview"]');
    expect(preview).toBeTruthy();
    const bands = preview.querySelectorAll('.led-band');
    expect(bands.length).toBe(7);
    expect(preview.querySelector('.led-band--last')).toBeTruthy();
  });

  it('getLedBandPreview marks the last band partially filled (padding)', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led! } };
    const bands = component.getLedBandPreview(d);
    expect(bands.length).toBe(7);
    expect(bands[6].last).toBe(true);
    // dernière bande = 13333 - 6×1920 = 1813 px → ~94.4 % de 1920
    expect(bands[6].fillPct).toBeLessThan(100);
    expect(bands[0].fillPct).toBe(100);
  });

  // --- Régression : ne pas sauvegarder un profil LED transitoire/invalide ---
  // (pitch "P3." en cours de frappe provoquait des PATCH 400 par keystroke)

  it('commitLed émet quand le profil est valide', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led! } };
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.commitLed(d);
    expect(emitted).toBe(true);
  });

  it("commitLed N'émet PAS pour un pitch invalide (ex. \"P3.\" en cours de frappe)", () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led!, pitch: 'P3.' } };
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.commitLed(d);
    expect(emitted).toBe(false);
  });

  it("commitLed N'émet PAS quand sides est vide", () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led!, sides: [] } };
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.commitLed(d);
    expect(emitted).toBe(false);
  });

  it('le pitch commit sur (blur), pas sur (ngModelChange) — pas de PATCH par frappe', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    const pitch = fixture.nativeElement.querySelector('[data-testid="led-pitch"]') as HTMLInputElement;
    let emitCount = 0;
    component.displaysChange.subscribe(() => emitCount++);

    // Frappe d'un état transitoire invalide : aucun emit tant qu'on n'a pas blur.
    pitch.value = 'P3.';
    pitch.dispatchEvent(new Event('input'));
    expect(emitCount).toBe(0);

    // Blur avec une valeur invalide → toujours aucun emit (gate).
    pitch.dispatchEvent(new Event('blur'));
    expect(emitCount).toBe(0);
  });

  // --- Hauteur dalle : saisie physique en cm, modèle interne en rangées px ---

  it('getLedHeightCm convertit les rangées px en cm via le pitch (160 px @ P6 → 96 cm)', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led! } };
    expect(component.getLedHeightCm(d)).toBe(96); // 160 × 6 / 10
  });

  it('onLedHeightCmChange convertit les cm saisis en rangées px (96 cm @ P6 → 160)', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led!, height: 0 } };
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.onLedHeightCmChange(d, '96');
    expect(d.led!.height).toBe(160); // 96 × 10 / 6
    expect(emitted).toBe(true);
  });

  it('onLedHeightCmChange arrondit à la rangée entière la plus proche (80 cm @ P6 → 133)', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led! } };
    component.onLedHeightCmChange(d, '80'); // 800 / 6 = 133.3
    expect(d.led!.height).toBe(133);
  });

  it('onLedHeightCmChange ignore une saisie invalide (pas de mutation ni emit)', () => {
    const d = { ...ledDisplay, led: { ...ledDisplay.led! } };
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.onLedHeightCmChange(d, 'abc');
    expect(d.led!.height).toBe(160); // inchangé
    expect(emitted).toBe(false);
  });

  it('le champ hauteur (cm) affiche le nombre de rangées effectif (160 @ P6)', () => {
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    // Le libellé "cm" est sur le champ ; le sous-texte montre les rangées dérivées.
    expect(fixture.nativeElement.querySelector('[data-testid="led-height"]')).toBeTruthy();
    const rows = fixture.nativeElement.querySelector('[data-testid="led-height-rows"]');
    expect(rows.textContent).toContain('160 rangées');
    expect(rows.textContent).toContain('P6');
  });
});

describe('DisplaysEditorComponent — Refonte panneau LED', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;

  const ledDisplay: DisplayConfig = {
    index: 1,
    name: 'Bord de terrain',
    type: 'led-perimeter',
    led: {
      sides: [40, 20, 20],
      pitch: 'P6',
      height: 160,
      spacing_m: 10,
      zones: 'uniform',
      canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' },
    },
  };

  const fresh = (): DisplayConfig => ({ ...ledDisplay, led: { ...ledDisplay.led!, sides: [...ledDisplay.led!.sides], canvas_in: { ...ledDisplay.led!.canvas_in! } } });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplaysEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
  });

  // --- Côtés : cases éditables ---

  it('rend une case par côté + un bouton « + » d’ajout', () => {
    component.displays = [fresh()];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.led-side-input').length).toBe(3);
    expect(fixture.nativeElement.querySelector('[data-testid="led-side-add"]')).toBeTruthy();
  });

  it('addSide ajoute un côté (max 8) et émet', () => {
    const d = fresh();
    let emitted = false;
    component.displaysChange.subscribe(() => (emitted = true));
    component.addSide(d);
    expect(d.led!.sides.length).toBe(4);
    expect(emitted).toBe(true);
  });

  it('addSide plafonne à 8 côtés', () => {
    const d = fresh();
    d.led!.sides = [10, 10, 10, 10, 10, 10, 10, 10];
    component.addSide(d);
    expect(d.led!.sides.length).toBe(8);
  });

  it('removeSide retire un côté mais en garde toujours au moins 1', () => {
    const d = fresh();
    component.removeSide(d, 1);
    expect(d.led!.sides).toEqual([40, 20]);
    const single = fresh();
    single.led!.sides = [9];
    component.removeSide(single, 0);
    expect(single.led!.sides).toEqual([9]); // pas de suppression du dernier
  });

  it('updateSide remplace une valeur et ignore une saisie invalide', () => {
    const d = fresh();
    component.updateSide(d, 0, '50');
    expect(d.led!.sides[0]).toBe(50);
    component.updateSide(d, 0, 'abc');
    expect(d.led!.sides[0]).toBe(50); // inchangé
  });

  it('getLedPerimeterM somme les côtés', () => {
    expect(component.getLedPerimeterM(fresh())).toBe(80);
  });

  // --- Pitch : datalist ---

  it('propose les pas courants dans un datalist (saisie libre conservée)', () => {
    component.displays = [fresh()];
    fixture.detectChanges();
    const datalist = fixture.nativeElement.querySelector('datalist');
    expect(datalist).toBeTruthy();
    expect(datalist.querySelectorAll('option').length).toBe(component.pitchOptions.length);
    // input reste un text (saisie libre), lié au datalist
    const pitch = fixture.nativeElement.querySelector('[data-testid="led-pitch"]') as HTMLInputElement;
    expect(pitch.getAttribute('list')).toBe('led-pitch-1');
  });

  // --- Répétition par défaut (libellés « tous les X m ») ---

  it('le sélecteur de répétition affiche « tous les X m »', () => {
    component.displays = [fresh()];
    fixture.detectChanges();
    const sel = fixture.nativeElement.querySelector('[data-testid="led-spacing"]');
    expect(sel.textContent).toContain('tous les');
  });

  // --- Avancé (processeur) ---

  it('la section Avancé est repliée par défaut et s’ouvre au clic', () => {
    component.displays = [fresh()];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-adv-body"]')).toBeNull();
    (fixture.nativeElement.querySelector('[data-testid="led-adv-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-adv-body"]')).toBeTruthy();
  });

  it('updateBandCount fige le band_count (lève le provisoire) et le vide le rétablit', () => {
    const d = fresh();
    expect(component.isCanvasProvisional(d)).toBe(true);
    component.updateBandCount(d, '7');
    expect(d.led!.canvas_in!.band_count).toBe(7);
    expect(component.isCanvasProvisional(d)).toBe(false);
    component.updateBandCount(d, '');
    expect(d.led!.canvas_in!.band_count).toBeUndefined();
    expect(component.isCanvasProvisional(d)).toBe(true);
  });

  it('getLedCanvasHeight suit le band_count confirmé quand il diffère du dérivé', () => {
    const d = fresh(); // 80 m P6 → 7 bandes dérivées
    expect(component.getLedCanvasHeight(d)).toBe(1120); // 7 × 160
    component.updateBandCount(d, '8');
    expect(component.getLedCanvasHeight(d)).toBe(1280); // 8 × 160
  });

  it('Entrée processeur = band_width × canvas height', () => {
    component.displays = [fresh()];
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="led-adv-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('[data-testid="led-adv-input"]');
    expect(input.textContent).toContain('1920×1120');
  });
});

describe('DisplaysEditorComponent — Banc d\'essai LED (PROP-014 §6)', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;
  let httpMock: HttpTestingController;

  const ledDisplay: DisplayConfig = {
    index: 1,
    name: 'Bord de terrain',
    type: 'led-perimeter',
    led: {
      sides: [40, 20, 20],
      pitch: 'P6',
      height: 160,
      spacing_m: 10,
      zones: 'uniform',
      canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' },
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplaysEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('masque le banc d’essai quand aucun siteId n’est fourni', () => {
    component.siteId = null;
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-testbench"]')).toBeNull();
  });

  it('affiche le banc d’essai quand un siteId est fourni', () => {
    component.siteId = 'site-1';
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-testbench"]')).toBeTruthy();
  });

  it('charge la liste des vidéos à la 1re ouverture (lazy)', () => {
    component.siteId = 'site-1';
    component.displays = [{ ...ledDisplay, led: { ...ledDisplay.led! } }];
    fixture.detectChanges();

    component.toggleTestbench();
    const req = httpMock.expectOne((r) => r.url.endsWith('/videos/names'));
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'v1', title: 'Jingle' }]);
    expect(component.tbVideos.length).toBe(1);
  });

  it('runTestExport POST /led-test-export/:siteId puis poll jusqu’à ready', () => {
    component.siteId = 'site-1';
    component.tbVideoId = 'v1';
    component.tbLayout = 'scrolling';

    component.runTestExport();
    const post = httpMock.expectOne((r) => r.url.endsWith('/led-test-export/site-1'));
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ video_id: 'v1', layout: 'scrolling' });
    post.flush({ job_id: 'job-1', status: 'queued' });

    const poll = httpMock.expectOne((r) => r.url.includes('/led-export-jobs/job-1'));
    expect(poll.request.method).toBe('GET');
    poll.flush({ status: 'ready', output_url: 'https://x/y.mp4', error_msg: null });

    expect(component.tbBusy).toBe(false);
    expect(component.tbUrl).toBe('https://x/y.mp4');
  });

  it('réutilisation : un export déjà prêt (200) affiche l’URL sans polling', () => {
    component.siteId = 'site-1';
    component.tbVideoId = 'v1';

    component.runTestExport();
    const post = httpMock.expectOne((r) => r.url.endsWith('/led-test-export/site-1'));
    post.flush({ job_id: 'job-9', status: 'ready', output_url: 'https://x/reused.mp4', reused: true });

    expect(component.tbUrl).toBe('https://x/reused.mp4');
    expect(component.tbBusy).toBe(false);
    // Aucun polling : pas de requête en attente (httpMock.verify en afterEach).
  });
});

describe('DisplaysEditorComponent — Contenu par côté (ADR-135)', () => {
  let fixture: ComponentFixture<DisplaysEditorComponent>;
  let component: DisplaysEditorComponent;
  let httpMock: HttpTestingController;

  const perSide = (): DisplayConfig => ({
    index: 1,
    name: 'Bord de terrain',
    type: 'led-perimeter',
    led: {
      sides: [40, 20, 20],
      pitch: 'P6',
      height: 160,
      spacing_m: 10,
      zones: 'per-side',
      canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' },
    },
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisplaysEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(DisplaysEditorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushVideos(): void {
    const req = httpMock.expectOne((r) => r.url.endsWith('/videos/names'));
    req.flush([
      { id: 'v1', title: 'Pub Coca' },
      { id: 'v2', title: 'Pub Nike' },
    ]);
  }

  it('le bloc « Contenu par côté » n’apparaît qu’en mode per-side', () => {
    component.displays = [perSide()];
    flushVideos();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-sidezones"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.led-sz-row').length).toBe(3);
    expect(fixture.nativeElement.querySelector('[data-testid="led-sz-video-0"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="led-sz-spacing-1"]')).toBeTruthy();
    // Note honnête « diffusion à venir » (anti flag mort).
    expect(fixture.nativeElement.querySelector('.led-sz-note')).toBeTruthy();
  });

  it('mode uniform : pas de bloc par côté ni de chargement vidéos', () => {
    component.displays = [{ ...perSide(), led: { ...perSide().led!, zones: 'uniform' } }];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-sidezones"]')).toBeNull();
    httpMock.expectNone((r) => r.url.endsWith('/videos/names'));
  });

  it('précharge la liste vidéos quand un profil est déjà en per-side', () => {
    component.displays = [perSide()];
    flushVideos();
    expect(component.tbVideos.length).toBe(2);
  });

  it('setSideName / setSideVideo / setSideSpacing patchent side_zones par index', () => {
    const d = perSide();
    component.setSideName(d, 0, 'Tribune');
    component.setSideVideo(d, 1, 'v2');
    component.setSideSpacing(d, 2, 5);
    expect(d.led!.side_zones!.length).toBe(3);
    expect(d.led!.side_zones![0].name).toBe('Tribune');
    expect(d.led!.side_zones![1].video_id).toBe('v2');
    expect(d.led!.side_zones![2].spacing_m).toBe(5);
  });

  it('efface un champ (vidéo vide / répétition null → undefined)', () => {
    const d = perSide();
    component.setSideVideo(d, 0, 'v1');
    component.setSideVideo(d, 0, '');
    expect(d.led!.side_zones![0].video_id).toBeUndefined();
    component.setSideSpacing(d, 0, 5);
    component.setSideSpacing(d, 0, null);
    expect(d.led!.side_zones![0].spacing_m).toBeUndefined();
  });

  it('removeSide réaligne side_zones (retire la bonne zone)', () => {
    const d = perSide();
    component.setSideName(d, 0, 'A');
    component.setSideName(d, 1, 'B');
    component.setSideName(d, 2, 'C');
    component.removeSide(d, 1);
    expect(d.led!.sides).toEqual([40, 20]);
    expect(d.led!.side_zones!.map((z) => z.name)).toEqual(['A', 'C']);
  });

  it('getSideZone retourne {} si non défini (jamais undefined)', () => {
    expect(component.getSideZone(perSide(), 0)).toEqual({});
  });
});
