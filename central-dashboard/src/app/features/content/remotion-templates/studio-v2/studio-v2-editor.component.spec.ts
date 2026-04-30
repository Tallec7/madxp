/**
 * ADR-075 Sprint 2 — StudioV2EditorComponent Karma spec.
 * Vérifie l'init depuis @Input view, les émissions debouncées payloadChange
 * + readyChange, et l'upload image via RemotionTemplatesDataService.
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { StudioV2EditorComponent } from './studio-v2-editor.component';
import { RemotionTemplatesDataService } from '../remotion-templates-data.service';
import { NotificationService } from '../../../../core/services/notification.service';
import type { TemplateStudioView } from '../remotion-templates.types';

function makeView(overrides: Partial<TemplateStudioView> = {}): TemplateStudioView {
  return {
    id: 'tpl-1',
    name: 'Demo',
    description: null,
    schemaVersion: 2,
    compositionId: 'TemplateRuntime',
    durationSeconds: 6,
    fps: 30,
    canvasWidth: 1080,
    canvasHeight: 1920,
    thumbnailUrl: null,
    published: true,
    variants: [
      {
        id: 'v1',
        templateId: 'tpl-1',
        name: 'Plage',
        backgroundVideoUrl: 'https://cdn/beach.mp4',
        thumbnailUrl: null,
        sortOrder: 0,
      },
      {
        id: 'v2',
        templateId: 'tpl-1',
        name: 'Stade',
        backgroundVideoUrl: 'https://cdn/stadium.mp4',
        thumbnailUrl: null,
        sortOrder: 1,
      },
    ],
    layers: [],
    textFields: [
      {
        id: 't1',
        templateId: 'tpl-1',
        slotKey: 'title',
        label: 'Titre',
        position: { x: 540, y: 400 },
        maxWidth: 900,
        fontFamily: 'Inter',
        fontSize: 72,
        color: '#fff',
        align: 'center',
        appearAt: 0,
        appearDuration: 0.4,
        animation: 'fade',
        defaultValue: 'Hello',
        maxChars: 40,
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
      },
    ],
    imageSlots: [
      {
        id: 's1',
        templateId: 'tpl-1',
        slotKey: 'logo',
        label: 'Logo',
        position: { x: 100, y: 100, width: 200, height: 200 },
        appearAt: 0,
        appearDuration: 0.3,
        animation: 'fade',
        aspectRatio: null,
        required: true,
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
      },
    ],
    options: [],
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('StudioV2EditorComponent', () => {
  let fixture: ComponentFixture<StudioV2EditorComponent>;
  let cmp: StudioV2EditorComponent;
  let dataSpy: jasmine.SpyObj<RemotionTemplatesDataService>;

  beforeEach(() => {
    dataSpy = jasmine.createSpyObj<RemotionTemplatesDataService>('RemotionTemplatesDataService', [
      'uploadUserImage',
    ]);

    TestBed.configureTestingModule({
      imports: [StudioV2EditorComponent],
      providers: [
        { provide: RemotionTemplatesDataService, useValue: dataSpy },
        NotificationService,
      ],
    });

    fixture = TestBed.createComponent(StudioV2EditorComponent);
    cmp = fixture.componentInstance;
  });

  function setView(view: TemplateStudioView) {
    cmp.view = view;
    cmp.ngOnChanges({
      view: { currentValue: view, previousValue: undefined, firstChange: true, isFirstChange: () => true },
    });
  }

  it('initialises state from @Input view on ngOnChanges', () => {
    setView(makeView());
    expect(cmp.selectedVariantId).toBe('v1');
    expect(cmp.textValues['title']).toBe('Hello');
    expect(cmp.imageUploads).toEqual({});
    expect(cmp.playerState).not.toBeNull();
    expect(cmp.playerState!.canvasWidth).toBe(1080);
    expect(cmp.playerState!.canvasHeight).toBe(1920);
  });

  it('emits payloadChange (debounced 250ms) with selected variant and text values', fakeAsync(() => {
    const emissions: { variantId: string; textValues: Record<string, string> }[] = [];
    cmp.payloadChange.subscribe((p) => emissions.push(p));
    setView(makeView());
    tick(250);
    expect(emissions.length).toBe(1);
    expect(emissions[0].variantId).toBe('v1');
    expect(emissions[0].textValues['title']).toBe('Hello');
  }));

  it('selectVariant swaps variantId and re-emits', fakeAsync(() => {
    const emissions: { variantId: string }[] = [];
    cmp.payloadChange.subscribe((p) => emissions.push(p));
    setView(makeView());
    tick(250);
    cmp.selectVariant(cmp.view.variants[1]);
    tick(250);
    expect(cmp.selectedVariantId).toBe('v2');
    expect(emissions[emissions.length - 1].variantId).toBe('v2');
  }));

  it('readyChange emits false when a required text field is empty', fakeAsync(() => {
    const readyEmissions: boolean[] = [];
    cmp.readyChange.subscribe((r) => readyEmissions.push(r));
    setView(makeView());
    tick(250);
    expect(readyEmissions[readyEmissions.length - 1]).toBe(false);
  }));

  it('isReady returns true only when all required fields + image slots are filled', fakeAsync(() => {
    setView(makeView());
    tick(250);
    expect(cmp.isReady()).toBe(false);
    cmp.imageUploads = { logo: 'https://cdn/logo.png' };
    expect(cmp.isReady()).toBe(true);
    cmp.onTextChange('title', '');
    expect(cmp.isReady()).toBe(false);
  }));

  it('onImageFile uploads via dataService and stores URL on success', fakeAsync(() => {
    dataSpy.uploadUserImage.and.returnValue(
      of({ url: 'https://cdn/logo.png', slot_key: 'logo' }),
    );
    setView(makeView());
    tick(250);
    const slot = cmp.view.imageSlots[0];
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const fakeList = { 0: file, length: 1, item: () => file } as unknown as FileList;
    cmp.onImageFile(slot, fakeList);
    expect(dataSpy.uploadUserImage).toHaveBeenCalledWith('tpl-1', file, 'logo');
    tick(250);
    expect(cmp.imageUploads['logo']).toBe('https://cdn/logo.png');
    expect(cmp.uploadingSlot['logo']).toBe(false);
  }));

  it('onImageFile clears uploading flag on error', fakeAsync(() => {
    dataSpy.uploadUserImage.and.returnValue(
      throwError(() => ({ error: { error: 'too big' } })),
    );
    setView(makeView());
    tick(250);
    const slot = cmp.view.imageSlots[0];
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const fakeList = { 0: file, length: 1, item: () => file } as unknown as FileList;
    cmp.onImageFile(slot, fakeList);
    expect(cmp.uploadingSlot['logo']).toBe(false);
    expect(cmp.imageUploads['logo']).toBeUndefined();
  }));

  it('removeImage drops the slot URL and re-emits', fakeAsync(() => {
    setView(makeView());
    tick(250);
    cmp.imageUploads = { logo: 'https://cdn/logo.png' };
    const emissions: { imageUploads: Record<string, string> }[] = [];
    cmp.payloadChange.subscribe((p) => emissions.push(p));
    cmp.removeImage(cmp.view.imageSlots[0]);
    tick(250);
    expect(cmp.imageUploads['logo']).toBeUndefined();
    expect(emissions[0].imageUploads).toEqual({});
  }));
});
