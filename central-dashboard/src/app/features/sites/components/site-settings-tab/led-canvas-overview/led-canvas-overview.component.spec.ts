/**
 * Vue Canvas LED — ce qu'un opérateur doit voir AVANT le match.
 *
 * Ce qui casse le rendu n'est presque jamais le pliage : c'est le format source.
 * Ces tests verrouillent les deux façons dont cette vue peut mentir.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { LedCanvasOverviewComponent } from './led-canvas-overview.component';
import { environment } from '../../../../../../environments/environment';

describe('LedCanvasOverviewComponent', () => {
  let fixture: ComponentFixture<LedCanvasOverviewComponent>;
  let component: LedCanvasOverviewComponent;
  let http: HttpTestingController;

  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    video_id: 'v1', filename: 'SIEHR.mp4',
    source: { width: 1600, height: 120 },
    expected: { width: 1600, height: 120 },
    matches_expected: true, has_variant: true, layout: 'repeated',
    canvas: { status: 'ready', url: 'https://cdn/x.mp4', updated_at: null },
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedCanvasOverviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LedCanvasOverviewComponent);
    component = fixture.componentInstance;
    component.siteId = 'site-1';
    http = TestBed.inject(HttpTestingController);
  });

  function openAndFlush(videos: unknown[]) {
    fixture.detectChanges();
    component.toggle();
    http
      .expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`)
      .flush({ expected: { width: 1600, height: 120 }, videos });
    fixture.detectChanges();
  }

  it('compte comme « à vérifier » un format inadapté, un échec et un canvas absent', () => {
    openAndFlush([
      row(),
      row({ video_id: 'v2', matches_expected: false }),
      row({ video_id: 'v3', canvas: { status: 'failed', url: null, updated_at: null } }),
      row({ video_id: 'v4', canvas: { status: 'missing', url: null, updated_at: null } }),
    ]);

    // 3 problèmes sur 4 : c'est exactement ce qu'on veut voir sans dérouler.
    expect(component.problemCount).toBe(3);
  });

  it('un format NON MESURÉ n’est pas compté comme un problème', () => {
    // `null` ≠ `false` : un upload antérieur à la sonde ffprobe n'a pas de
    // dimensions. Le signaler enverrait l'opérateur re-livrer un fichier correct.
    openAndFlush([row({ matches_expected: null, source: { width: 0, height: 0 } })]);

    expect(component.problemCount).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('non mesuré');
  });

  it('« Refaire » est désarmé sans variante — le pliage n’aurait rien à plier', () => {
    openAndFlush([row({ has_variant: false })]);

    const btn = fixture.nativeElement.querySelector('[data-testid="lco-redo-v1"]');
    expect(btn.disabled).toBe(true);
  });

  it('affiche le message serveur, pas un « erreur » générique', () => {
    fixture.detectChanges();
    component.toggle();
    http.expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`).flush(
      { error: "Ce site n'a pas de ruban LED configuré" },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="lco-error"]').textContent).toContain(
      'ruban LED'
    );
  });
});
