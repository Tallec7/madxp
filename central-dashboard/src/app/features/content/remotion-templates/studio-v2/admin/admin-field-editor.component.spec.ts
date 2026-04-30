import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminFieldEditorComponent, type EditableField } from './admin-field-editor.component';
import type { TemplateTextField, TemplateImageSlot } from '../../remotion-templates.types';

function makeTextField(): TemplateTextField {
  return {
    id: 'f1',
    templateId: 't1',
    slotKey: 'score',
    label: 'Score',
    position: { x: 100, y: 200 },
    maxWidth: 400,
    fontFamily: 'Inter',
    fontSize: 48,
    color: '#ffffff',
    align: 'center',
    appearAt: 0,
    appearDuration: 2,
    animation: 'fade',
    defaultValue: '',
    maxChars: null,
    multiline: false,
    required: true,
    sortOrder: 0,
    alwaysVisible: false,
    scaleFrom: 0.7,
    scaleTo: 1.0,
    layerId: null,
    respectAlpha: false,
    animationDirection: 'in',
    visibleIf: null,
  };
}

function makeImageSlot(): TemplateImageSlot {
  return {
    id: 's1',
    templateId: 't1',
    slotKey: 'logo',
    label: 'Logo',
    position: { x: 10, y: 20, width: 100, height: 100 },
    appearAt: 0,
    appearDuration: 3,
    animation: 'scale-in',
    aspectRatio: '1:1',
    required: false,
    sortOrder: 0,
    layerId: null,
    anchor: 'center',
    fitMode: 'contain',
    safeTopPct: null,
    safeLeftPct: null,
    safeWidthPct: null,
    safeHeightPct: null,
    overflow: 'hidden',
    animationDirection: 'in',
    scaleFrom: null,
    scaleTo: null,
    visibleIf: null,
  };
}

describe('AdminFieldEditorComponent', () => {
  let fixture: ComponentFixture<AdminFieldEditorComponent>;
  let cmp: AdminFieldEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFieldEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminFieldEditorComponent);
    cmp = fixture.componentInstance;
  });

  it('renders a text field header with label + slot key', async () => {
    cmp.field = { kind: 'text', value: makeTextField() } as EditableField;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    // Label is rendered as an editable input bound via ngModel — check presence + value
    const labelInput = host.querySelector<HTMLInputElement>(
      '[data-testid="admin-field-label-score"]',
    );
    expect(labelInput).toBeTruthy();
    expect(labelInput!.value).toBe('Score');
    expect(host.textContent).toContain('score');
    expect(host.textContent).toContain('Texte');
  });

  it('renders image-specific width/height inputs only for image kind', () => {
    cmp.field = { kind: 'image', value: makeImageSlot() } as EditableField;
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('width');
    expect(host.textContent).toContain('height');
    expect(host.textContent).not.toContain('fontFamily');
  });

  it('emits patch snapshot on emitPatch()', () => {
    const field = makeTextField();
    cmp.field = { kind: 'text', value: field } as EditableField;
    fixture.detectChanges();

    const spy = jasmine.createSpy('patch');
    cmp.patch.subscribe(spy);

    cmp.emitPatch();
    expect(spy).toHaveBeenCalledTimes(1);
    const emitted = spy.calls.mostRecent().args[0];
    expect(emitted.slotKey).toBe('score');
    // shallow clone: mutating the source must not mutate the emitted payload ref
    expect(emitted).not.toBe(field);
  });

  it('emits delete event on button click', () => {
    cmp.field = { kind: 'text', value: makeTextField() } as EditableField;
    fixture.detectChanges();

    const spy = jasmine.createSpy('delete');
    cmp.delete.subscribe(spy);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.afe__delete');
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
