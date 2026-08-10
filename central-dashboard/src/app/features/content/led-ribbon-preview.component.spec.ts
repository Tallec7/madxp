import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LedRibbonPreviewComponent } from './led-ribbon-preview.component';

/**
 * Aperçu du ruban — le rendu doit refléter EXACTEMENT ce que ffmpeg appliquera.
 * Un aperçu qui ment est pire que pas d'aperçu : il fait valider un cadrage faux.
 */
describe('LedRibbonPreviewComponent', () => {
  let fixture: ComponentFixture<LedRibbonPreviewComponent>;
  let component: LedRibbonPreviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LedRibbonPreviewComponent] }).compileComponents();
    fixture = TestBed.createComponent(LedRibbonPreviewComponent);
    component = fixture.componentInstance;
    component.videoUrl = 'https://example.test/siehr.mp4';
    component.targetWidth = 1600;
    component.targetHeight = 160;
  });

  it('ne rend rien sans vidéo — pas d’aperçu vide trompeur', () => {
    component.videoUrl = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="led-ribbon-preview"]')).toBeNull();
  });

  it('donne à la boîte le ratio EXACT du côté', () => {
    // C'est ce ratio qui rend les bandes noires visibles sans les expliquer.
    fixture.detectChanges();
    const box: HTMLElement = fixture.nativeElement.querySelector('[data-testid="led-ribbon-box"]');
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe('1600/160');
  });

  it('« Centré » utilise contain — le logo garde ses proportions', () => {
    component.layout = 'centered';
    fixture.detectChanges();
    expect(component.objectFit).toBe('contain');
    const video: HTMLElement = fixture.nativeElement.querySelector('video');
    expect(video.style.objectFit).toBe('contain');
  });

  it('« Étalé » utilise fill — la déformation doit se VOIR', () => {
    component.layout = 'stretched';
    fixture.detectChanges();
    expect(component.objectFit).toBe('fill');
  });

  it('n’affiche qu’une copie hors pavage', () => {
    component.layout = 'centered';
    component.cellPx = 800;
    fixture.detectChanges();
    expect(component.copies.length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('video').length).toBe(1);
  });

  it('répète selon la CADENCE réelle, pas au hasard', () => {
    // Côté 1600 px, cadence 800 px → 2 copies. En montrer 3 mentirait.
    component.layout = 'repeated';
    component.cellPx = 800;
    fixture.detectChanges();
    expect(component.copies.length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('video').length).toBe(2);
  });

  it('une cadence égale au côté donne une seule copie', () => {
    // Cas Piraths : côté 1600, cadence 10 m = 1600 px.
    component.layout = 'repeated';
    component.cellPx = 1600;
    fixture.detectChanges();
    expect(component.copies.length).toBe(1);
  });

  it('borne le pavage à 8 copies — au-delà l’aperçu ne montre plus rien', () => {
    component.layout = 'repeated';
    component.cellPx = 10;
    fixture.detectChanges();
    expect(component.copies.length).toBe(8);
  });

  it('retombe sur une copie si la cadence est inconnue', () => {
    component.layout = 'repeated';
    component.cellPx = 0;
    fixture.detectChanges();
    expect(component.copies.length).toBe(1);
  });

  it('annonce la répétition sur les côtés quand il y en a plusieurs', () => {
    component.sidesCount = 4;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('identique sur 4 côtés');
  });

  it('accepte une mise en page absente sans casser', () => {
    component.layout = undefined;
    fixture.detectChanges();
    expect(component.objectFit).toBe('contain');
    expect(fixture.nativeElement.querySelector('[data-testid="led-ribbon-preview"]')).toBeTruthy();
  });
});
