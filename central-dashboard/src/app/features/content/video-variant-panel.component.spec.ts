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

  // --- Validateur de format à l'upload (PROP-014 §6) ---

  it('affiche l\'avis de format avec la classe du verdict', () => {
    const variant = makeVariant('led-perimeter');
    component.formatNotices['led-perimeter'] = {
      verdict: 'incompatible',
      message: 'Ratio incompatible → blocs/espaces au pliage.',
      ribbonWidth: 13333,
      ribbonHeight: 160,
      videoWidth: 4800,
      videoHeight: 800,
    };
    openVariant(variant);

    const notice = fixture.nativeElement.querySelector('[data-testid="format-notice"]') as HTMLElement;
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('Ratio incompatible');
    expect(notice.classList.contains('format-notice--incompatible')).toBe(true);
  });

  it('formatNoticeClass mappe le verdict sur une classe', () => {
    expect(component.formatNoticeClass('exact')).toBe('format-notice--exact');
    expect(component.formatNoticeClass('resize')).toBe('format-notice--resize');
    expect(component.formatNoticeClass('unknown')).toBe('format-notice--unknown');
  });

  it('pas d\'avis affiché si aucun notice pour ce type', () => {
    openVariant(makeVariant('led-perimeter'));
    expect(fixture.nativeElement.querySelector('[data-testid="format-notice"]')).toBeNull();
  });

  // --- Export plié async (PROP-014 §6 / étape 6) ---

  it('le bouton d\'export n\'apparaît que pour led-perimeter', () => {
    openVariant(makeVariant('secondary'));
    expect(fixture.nativeElement.querySelector('[data-testid="led-export-btn"]')).toBeNull();

    openVariant(makeVariant('led-perimeter'));
    expect(fixture.nativeElement.querySelector('[data-testid="led-export-btn"]')).toBeTruthy();
  });

  it('exportLed : enqueue → poll → lien de téléchargement quand ready', () => {
    const variant = makeVariant('led-perimeter');
    openVariant(variant);

    component.exportLed(variant as never);

    // 1) enqueue POST → 202 { job_id }
    const enqueue = httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants/led-perimeter/export`);
    expect(enqueue.request.method).toBe('POST');
    enqueue.flush({ job_id: 'job-1', status: 'queued' });

    // 2) poll GET → ready + url
    const poll = httpMock.expectOne(`${environment.apiUrl}/led-export-jobs/job-1`);
    expect(poll.request.method).toBe('GET');
    poll.flush({ status: 'ready', output_url: 'https://x/led.mp4', error_msg: null });

    expect(component.exportStates['led-perimeter'].status).toBe('ready');
    fixture.detectChanges();
    const dl = fixture.nativeElement.querySelector('[data-testid="led-export-download"]') as HTMLAnchorElement;
    expect(dl).toBeTruthy();
    expect(dl.getAttribute('href')).toBe('https://x/led.mp4');
  });

  it('exportLed : statut failed → état failed (pas de lien)', () => {
    const variant = makeVariant('led-perimeter');
    openVariant(variant);
    component.exportLed(variant as never);
    httpMock.expectOne(`${environment.apiUrl}/videos/vid-1/variants/led-perimeter/export`).flush({ job_id: 'job-2', status: 'queued' });
    httpMock.expectOne(`${environment.apiUrl}/led-export-jobs/job-2`).flush({ status: 'failed', output_url: null, error_msg: 'boom' });

    expect(component.exportStates['led-perimeter'].status).toBe('failed');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-export-download"]')).toBeNull();
  });
});
