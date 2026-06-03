/**
 * VideoVariantPanelComponent — sélecteur de mise en page LED (PROP-014 §8 / ADR-134).
 *
 * Garde-fou : le sélecteur de layout n'apparaît QUE pour les variantes de type
 * 'led-perimeter' (piloté par TYPE, pas par index), et persiste via PATCH.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { VideoVariantPanelComponent } from './video-variant-panel.component';
import { NotificationService } from '../../core/services/notification.service';
import { environment } from '../../../environments/environment';

interface VariantLike {
  id: string;
  video_id: string;
  display_type: string;
  filename: string;
  original_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  url: string | null;
  created_at: string;
  layout?: string | null;
}

function makeVariant(display_type: string, layout: string | null = null): VariantLike {
  return {
    id: `id-${display_type}`,
    video_id: 'vid-1',
    display_type,
    filename: `${display_type}.mp4`,
    original_name: null,
    file_size: 1000,
    width: null,
    height: null,
    duration: null,
    url: null,
    created_at: '2026-06-03T00:00:00Z',
    layout,
  };
}

describe('VideoVariantPanelComponent — LED layout (PROP-014)', () => {
  let fixture: ComponentFixture<VideoVariantPanelComponent>;
  let component: VideoVariantPanelComponent;
  let httpMock: HttpTestingController;

  const notificationStub = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoVariantPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notificationStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoVariantPanelComponent);
    component = fixture.componentInstance;
    component.videoId = 'vid-1';
    httpMock = TestBed.inject(HttpTestingController);

    // ngOnInit → GET variants (flush vide, on injecte ensuite à la main).
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants`).flush({ variants: [] });
  });

  afterEach(() => httpMock.verify());

  function openVariant(v: VariantLike): void {
    component.isOpen = true;
    component.variants = [v as never];
    component.openPanels[v.display_type] = true;
    fixture.detectChanges();
  }

  it('rend le sélecteur de layout pour une variante led-perimeter', () => {
    openVariant(makeVariant('led-perimeter', 'repeated'));
    const row = fixture.nativeElement.querySelector('[data-testid="variant-layout-row"]');
    expect(row).toBeTruthy();
    const select = fixture.nativeElement.querySelector('[data-testid="variant-layout-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('repeated');
  });

  it('ne rend PAS le sélecteur pour une variante non-LED (secondary)', () => {
    openVariant(makeVariant('secondary'));
    expect(fixture.nativeElement.querySelector('[data-testid="variant-layout-row"]')).toBeNull();
  });

  it('isLedPerimeter discrimine par type', () => {
    expect(component.isLedPerimeter('led-perimeter')).toBe(true);
    expect(component.isLedPerimeter('led-banner')).toBe(false);
    expect(component.isLedPerimeter('tv')).toBe(false);
  });

  it('onLayoutChange PATCH le layout et met à jour la variante', () => {
    const variant = makeVariant('led-perimeter', null);
    openVariant(variant);

    const event = { target: { value: 'scrolling' } } as unknown as Event;
    component.onLayoutChange(variant as never, event);

    const req = httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants/led-perimeter/layout`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ layout: 'scrolling' });
    req.flush({ ...variant, layout: 'scrolling' });

    expect(variant.layout).toBe('scrolling');
  });

  it('onLayoutChange envoie layout=null quand on sélectionne "non définie"', () => {
    const variant = makeVariant('led-perimeter', 'repeated');
    openVariant(variant);

    component.onLayoutChange(variant as never, { target: { value: '' } } as unknown as Event);

    const req = httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants/led-perimeter/layout`);
    expect(req.request.body).toEqual({ layout: null });
    req.flush({ ...variant, layout: null });
    expect(variant.layout).toBeNull();
  });

  it('rollback optimiste du layout si le PATCH échoue', () => {
    const variant = makeVariant('led-perimeter', 'repeated');
    openVariant(variant);

    component.onLayoutChange(variant as never, { target: { value: 'stretched' } } as unknown as Event);
    const req = httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants/led-perimeter/layout`);
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(variant.layout).toBe('repeated'); // revenu à l'état précédent
  });
});
