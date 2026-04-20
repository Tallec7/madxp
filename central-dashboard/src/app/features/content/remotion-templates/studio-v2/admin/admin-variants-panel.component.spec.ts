import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminVariantsPanelComponent } from './admin-variants-panel.component';
import type { TemplateVariant } from '../../remotion-templates.types';

function makeVariant(id: string, order: number): TemplateVariant {
  return {
    id,
    templateId: 't1',
    name: `V${order}`,
    backgroundVideoUrl: `https://example.com/${id}.mp4`,
    thumbnailUrl: null,
    sortOrder: order,
  };
}

describe('AdminVariantsPanelComponent', () => {
  let fixture: ComponentFixture<AdminVariantsPanelComponent>;
  let cmp: AdminVariantsPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminVariantsPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminVariantsPanelComponent);
    cmp = fixture.componentInstance;
  });

  it('shows empty message when no variants', () => {
    cmp.variants = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aucun variant');
  });

  it('lists all variants with their order', () => {
    cmp.variants = [makeVariant('a', 0), makeVariant('b', 1)];
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.avp__item');
    expect(items.length).toBe(2);
  });

  it('emits create with sortOrder=length on submitNew', () => {
    cmp.variants = [makeVariant('a', 0)];
    fixture.detectChanges();

    const spy = jasmine.createSpy('create');
    cmp.create.subscribe(spy);

    cmp.draft.name = 'New';
    cmp.draft.backgroundVideoUrl = 'https://example.com/new.mp4';
    cmp.submitNew();

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.calls.mostRecent().args[0];
    expect(payload.sortOrder).toBe(1);
    expect(payload.name).toBe('New');
  });

  it('does not emit create when name or url missing', () => {
    cmp.variants = [];
    const spy = jasmine.createSpy('create');
    cmp.create.subscribe(spy);

    cmp.draft.name = '';
    cmp.draft.backgroundVideoUrl = 'x';
    cmp.submitNew();
    expect(spy).not.toHaveBeenCalled();
  });

  it('moveUp swaps sortOrder between adjacent items', () => {
    const a = makeVariant('a', 0);
    const b = makeVariant('b', 1);
    cmp.variants = [a, b];
    fixture.detectChanges();

    const spy = jasmine.createSpy('update');
    cmp.update.subscribe(spy);

    cmp.moveUp(b, 1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.calls.argsFor(0)[0]).toEqual({ id: 'b', patch: { sortOrder: 0 } });
    expect(spy.calls.argsFor(1)[0]).toEqual({ id: 'a', patch: { sortOrder: 1 } });
  });

  it('moveUp is no-op at index 0', () => {
    const a = makeVariant('a', 0);
    cmp.variants = [a, makeVariant('b', 1)];
    const spy = jasmine.createSpy('update');
    cmp.update.subscribe(spy);

    cmp.moveUp(a, 0);
    expect(spy).not.toHaveBeenCalled();
  });
});
