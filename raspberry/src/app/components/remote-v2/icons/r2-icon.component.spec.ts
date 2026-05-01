/**
 * Spec Karma pour R2IconComponent (SPEC-V2-ICONS-01).
 * Couvre rendu, attributs aria, taille custom et résilience du registre.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { R2IconComponent } from './r2-icon.component';
import { R2_ICONS, R2IconName } from './r2-icon-registry';

describe('R2IconComponent', () => {
  let fixture: ComponentFixture<R2IconComponent>;
  let component: R2IconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [R2IconComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(R2IconComponent);
    component = fixture.componentInstance;
  });

  it('renders the requested icon path from the registry', () => {
    component.name = 'camera';
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.innerHTML).toContain('circle');
  });

  it('uses currentColor for stroke (CSS-themable)', () => {
    component.name = 'check';
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('applies a custom size to width/height', () => {
    component.name = 'play';
    component.size = 24;
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('marks the icon as decorative when no label is provided', () => {
    component.name = 'arrow-right';
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('exposes role="img" + aria-label when a label is provided', () => {
    component.name = 'x';
    component.label = 'Fermer';
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Fermer');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('has a registry entry for every R2IconName', () => {
    const names: R2IconName[] = [
      'camera',
      'refresh-cw',
      'play',
      'pause',
      'x',
      'lightbulb',
      'arrow-right',
      'chevron-right',
      'check',
      'alert-triangle',
      'alert-circle',
      'search',
      'settings',
      'plus',
      'trash-2',
    ];
    for (const n of names) {
      expect(R2_ICONS[n]).toBeTruthy();
      expect(R2_ICONS[n]).toContain('<');
    }
  });
});
