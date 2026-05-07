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
