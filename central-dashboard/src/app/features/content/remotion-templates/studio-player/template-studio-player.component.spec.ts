/**
 * ADR-075 / ADR-077 — TemplateStudioPlayerComponent Karma spec.
 * Vérifie le bridge React (createRoot/render/unmount) sans monter le vrai Player.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TemplateStudioPlayerComponent, RuntimePlayerState } from './template-studio-player.component';

describe('TemplateStudioPlayerComponent', () => {
  let fixture: ComponentFixture<TemplateStudioPlayerComponent>;
  let cmp: TemplateStudioPlayerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TemplateStudioPlayerComponent] });
    fixture = TestBed.createComponent(TemplateStudioPlayerComponent);
    cmp = fixture.componentInstance;
  });

  it('creates a React root on AfterViewInit and unmounts on destroy', () => {
    fixture.detectChanges();
    const root = (cmp as unknown as { root: { unmount: jasmine.Spy } | null }).root;
    expect(root).not.toBeNull();
    const unmountSpy = spyOn(root!, 'unmount').and.callThrough();
    fixture.destroy();
    expect(unmountSpy).toHaveBeenCalled();
  });

  it('ngOnChanges on state re-invokes the React render', () => {
    fixture.detectChanges();
    const root = (cmp as unknown as { root: { render: jasmine.Spy } }).root;
    const renderSpy = spyOn(root, 'render').and.callThrough();
    const state: RuntimePlayerState = {
      variants: [
        { id: 'v1', backgroundVideoUrl: 'https://cdn/bg.mp4' },
      ],
      layers: [],
      textFields: [],
      imageSlots: [],
      variantId: 'v1',
      textValues: {},
      imageUploads: {},
      canvasWidth: 1080,
      canvasHeight: 1920,
      durationSeconds: 6,
      fps: 30,
    };
    cmp.state = state;
    cmp.ngOnChanges({
      state: { currentValue: state, previousValue: null, firstChange: false, isFirstChange: () => false },
    });
    expect(renderSpy).toHaveBeenCalled();
  });

  it('shows the empty state when no state is provided', () => {
    fixture.detectChanges();
    const empty = fixture.nativeElement.querySelector('.studio-player__empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('Sélectionnez un template');
  });
});
