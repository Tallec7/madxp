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
    source_url: 'https://cdn/src.mp4', crop: null,
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

  function openAndFlush(videos: unknown[], displays: unknown[] = []) {
    fixture.detectChanges();
    component.toggle();
    http
      .expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`)
      .flush({ expected: { width: 1600, height: 120 }, videos });
    // `toggle()` déclenche aussi loadDisplays() pour localiser le led-perimeter
    // (toggle scene_scaling) — secondaire à l'écran Canvas, silencieux en erreur.
    http.expectOne(`${environment.apiUrl}/sites/site-1/displays`).flush({ displays });
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

  it('« Retirer » supprime la variante ruban, PAS la vidéo', () => {
    openAndFlush([row()]);

    fixture.nativeElement.querySelector('[data-testid="lco-del-v1"]').click();

    // Un clip TV (carton jaune, temps mort) reste dans la boucle : il cesse
    // seulement d'être déclaré comme contenu de ruban.
    const del = http.expectOne(`${environment.apiUrl}/videos/v1/variants/led-perimeter`);
    expect(del.request.method).toBe('DELETE');
    del.flush({});
    http.expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`).flush({ expected: null, videos: [] });
  });

  it('« Retirer » n’apparaît pas sans variante — rien à retirer', () => {
    openAndFlush([row({ has_variant: false })]);
    expect(fixture.nativeElement.querySelector('[data-testid="lco-del-v1"]')).toBeNull();
  });

  describe('détourage des marges (PROP-015)', () => {
    const STRASOL = { width: 4096, height: 1416 };
    const BANDEAU = { x: 0, y: 554, w: 4096, h: 306 };

    it('analyser NE détoure pas — il faut un second geste', () => {
      openAndFlush([row({ source: STRASOL, matches_expected: false })]);

      fixture.nativeElement.querySelector('[data-testid="lco-crop-detect-v1"]').click();
      const detect = http.expectOne(
        `${environment.apiUrl}/videos/v1/variants/led-perimeter/crop/detect`
      );
      expect(detect.request.method).toBe('POST');
      // Le format visé dépend du club consulté, pas du propriétaire de la vidéo.
      expect(detect.request.body).toEqual({ target_site_id: 'site-1' });
      detect.flush({ crop: BANDEAU, recommended: true, reason: 'Marges détectées…' });
      fixture.detectChanges();

      // Rien n'a été écrit : aucune requête d'enregistrement n'est partie.
      http.verify();
      expect(fixture.nativeElement.querySelector('[data-testid="lco-crop-panel-v1"]')).toBeTruthy();
    });

    it('« Appliquer » est le seul geste qui enregistre le rectangle', () => {
      openAndFlush([row({ source: STRASOL, matches_expected: false })]);
      fixture.nativeElement.querySelector('[data-testid="lco-crop-detect-v1"]').click();
      http
        .expectOne(`${environment.apiUrl}/videos/v1/variants/led-perimeter/crop/detect`)
        .flush({ crop: BANDEAU, recommended: true, reason: 'Marges détectées…' });
      fixture.detectChanges();

      fixture.nativeElement.querySelector('[data-testid="lco-crop-apply-v1"]').click();
      const put = http.expectOne(`${environment.apiUrl}/videos/v1/variants/led-perimeter/crop`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ crop: BANDEAU });
      put.flush({});
      // On relit : le canvas fabriqué avant le détourage est devenu inatteignable.
      http.expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`).flush({ expected: null, videos: [] });
    });

    it('un plein cadre 16:9 ne se voit proposer AUCUN détourage', () => {
      openAndFlush([row({ source: { width: 1920, height: 1080 }, matches_expected: false })]);
      fixture.nativeElement.querySelector('[data-testid="lco-crop-detect-v1"]').click();
      http.expectOne(`${environment.apiUrl}/videos/v1/variants/led-perimeter/crop/detect`).flush({
        crop: { x: 0, y: 0, w: 1920, h: 1080 },
        recommended: false,
        reason: "Aucune marge détectée : l'image occupe déjà tout le cadre…",
      });
      fixture.detectChanges();

      // La bonne réponse ici est « Retirer », pas un détourage : le bouton
      // d'application ne doit pas exister.
      expect(fixture.nativeElement.querySelector('[data-testid="lco-crop-apply-v1"]')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Aucune marge détectée');
    });

    it('un détourage déjà validé s’affiche et se retire', () => {
      openAndFlush([row({ source: STRASOL, crop: BANDEAU })]);

      expect(
        fixture.nativeElement.querySelector('[data-testid="lco-crop-badge-v1"]').textContent
      ).toContain('4096 × 306');

      fixture.nativeElement.querySelector('[data-testid="lco-crop-clear-v1"]').click();
      const put = http.expectOne(`${environment.apiUrl}/videos/v1/variants/led-perimeter/crop`);
      expect(put.request.body).toEqual({ crop: null });
      put.flush({});
      http.expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`).flush({ expected: null, videos: [] });
    });

    it('l’aperçu « après » cadre exactement le rectangle, comme le fera ffmpeg', () => {
      const r = { ...row({ source: STRASOL }), crop: null } as never;
      const style = component.cropStyle(r, BANDEAU);

      // 1416/306 ≈ 4,63 → la vidéo est agrandie de 463 % en hauteur et décalée de
      // 554/306 ≈ 181 % vers le haut : seul le bandeau reste dans le cadre.
      expect(style['width']).toBe('100%');
      expect(parseFloat(style['height'])).toBeCloseTo((1416 / 306) * 100, 1);
      expect(parseFloat(style['top'])).toBeCloseTo((-554 / 306) * 100, 1);
      expect(style['left']).toBe('0%');
    });
  });

  it('affiche le message serveur, pas un « erreur » générique', () => {
    fixture.detectChanges();
    component.toggle();
    http.expectOne(`${environment.apiUrl}/sites/site-1/led-canvases`).flush(
      { error: "Ce site n'a pas de ruban LED configuré" },
      { status: 400, statusText: 'Bad Request' }
    );
    http.expectOne(`${environment.apiUrl}/sites/site-1/displays`).flush({ displays: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="lco-error"]').textContent).toContain(
      'ruban LED'
    );
  });

  describe('scene_scaling (scale façon B2B, opt-in)', () => {
    const ledDisplay = (canvasInOver: Partial<Record<string, unknown>> = {}) => ({
      index: 0,
      name: 'Ruban',
      type: 'led-perimeter',
      led: {
        sides: [10, 10, 10, 10],
        pitch: 'P6.25',
        height: 120,
        spacing_m: 10,
        canvas_in: { band_width: 1600, band_count: 4, order: 'top-to-bottom', mode: 'B', ...canvasInOver },
      },
    });

    it('le toggle est absent sans display led-perimeter', () => {
      openAndFlush([row()], []);
      expect(fixture.nativeElement.querySelector('[data-testid="lco-scene-scaling-row"]')).toBeNull();
    });

    it('reflète scene_scaling du display led-perimeter', () => {
      openAndFlush([row()], [ledDisplay({ scene_scaling: true })]);

      const checkbox = fixture.nativeElement.querySelector('[data-testid="lco-scene-scaling-checkbox"]');
      expect(checkbox.checked).toBe(true);
    });

    it('cocher le toggle PATCH tout le tableau displays avec scene_scaling: true', () => {
      openAndFlush([row()], [ledDisplay()]);

      fixture.nativeElement.querySelector('[data-testid="lco-scene-scaling-checkbox"]').click();

      const patch = http.expectOne(`${environment.apiUrl}/sites/site-1/displays`);
      expect(patch.request.method).toBe('PATCH');
      const body = patch.request.body as { displays: Array<{ led?: { canvas_in?: { scene_scaling?: boolean } } }> };
      expect(body.displays[0].led?.canvas_in?.scene_scaling).toBe(true);
      // Le reste de la géométrie ne doit pas être perdu dans l'aller-retour.
      expect(body.displays[0].led?.canvas_in).toEqual(
        jasmine.objectContaining({ band_width: 1600, band_count: 4 })
      );
      patch.flush({});

      expect(component.sceneScalingEnabled).toBe(true);
    });
  });
});
