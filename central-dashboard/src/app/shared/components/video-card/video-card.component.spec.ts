import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoCardComponent } from './video-card.component';

describe('VideoCardComponent', () => {
  let fixture: ComponentFixture<VideoCardComponent>;
  let component: VideoCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [VideoCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(VideoCardComponent);
    component = fixture.componentInstance;
  });

  it('renders title, subtitle, and meta parts joined by bullets', () => {
    component.title = 'Mon Match';
    component.subtitle = 'SaaS';
    component.metaParts = ['12 Mo', '1080p', '30s'];
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.vc__title')?.textContent).toContain('Mon Match');
    expect(el.querySelector('.vc__subtitle')?.textContent).toContain('SaaS');
    const meta = el.querySelector('.vc__meta')?.textContent || '';
    expect(meta).toContain('12 Mo');
    expect(meta).toContain('1080p');
    expect(meta).toContain('30s');
    expect(el.querySelectorAll('.vc__meta-sep').length).toBe(2);
  });

  it('shows thumbnail image when thumbnailUrl is set', () => {
    component.thumbnailUrl = 'https://example.com/thumb.jpg';
    component.title = 'Vidéo';
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('.vc__thumb img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('thumb.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(fixture.nativeElement.querySelector('.vc__thumb-fallback')).toBeNull();
  });

  it('shows placeholder fallback when thumbnailUrl is null', () => {
    component.thumbnailUrl = null;
    component.thumbnailPlaceholder = '🎬';
    fixture.detectChanges();
    const fallback = fixture.nativeElement.querySelector('.vc__thumb-fallback');
    expect(fallback).toBeTruthy();
    expect(fallback.textContent).toContain('🎬');
  });

  it('renders thumb overlays when provided', () => {
    component.thumbOverlayLeft = '⏳';
    component.thumbOverlayRight = 'HD';
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.vc__thumb-overlay--left')?.textContent).toContain('⏳');
    expect(el.querySelector('.vc__thumb-overlay--right')?.textContent).toContain('HD');
  });

  it('applies --selected class when selected is true', () => {
    component.selected = true;
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.vc') as HTMLElement).classList).toContain(
      'vc--selected',
    );
  });

  it('emits cardClick only when clickable is true', () => {
    const spy = jasmine.createSpy('cardClick');
    component.cardClick.subscribe(spy);
    const root = fixture.nativeElement.querySelector('.vc') as HTMLElement;

    component.clickable = false;
    fixture.detectChanges();
    root.click();
    expect(spy).not.toHaveBeenCalled();

    component.clickable = true;
    fixture.detectChanges();
    root.click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.vc--clickable')).toBeTruthy();
  });

  it('uses titleTooltip when provided', () => {
    fixture.componentRef.setInput('title', 'Short');
    fixture.componentRef.setInput('titleTooltip', 'Full title for tooltip');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vc__title')?.getAttribute('title')).toBe(
      'Full title for tooltip',
    );
  });

  it('falls back to title when titleTooltip is null', () => {
    fixture.componentRef.setInput('title', 'Short');
    fixture.componentRef.setInput('titleTooltip', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vc__title')?.getAttribute('title')).toBe('Short');
  });

  it('omits meta block when metaParts is empty', () => {
    component.metaParts = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vc__meta')).toBeNull();
  });
});
