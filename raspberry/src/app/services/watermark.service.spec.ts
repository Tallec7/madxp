import { TestBed } from '@angular/core/testing';
import { WatermarkService } from './watermark.service';
import { Configuration, WatermarkScheduleRule } from '../interfaces/configuration.interface';

/**
 * Factory pour cr\u00e9er une configuration minimale avec watermark
 */
function makeConfig(overrides: Partial<Configuration['watermark']> = {}): Configuration {
  return {
    remote: { title: 'Test' },
    version: '1.0',
    categories: [],
    sponsors: [],
    watermark: {
      enabled: true,
      imagePath: '/assets/logo.png',
      fullscreen: false,
      position: 'bottom-right',
      offsetX: 20,
      offsetY: 20,
      opacity: 80,
      width: 150,
      height: 0,
      borderRadius: 0,
      animation: 'none',
      animationDuration: 300,
      ...overrides,
    },
  };
}

describe('WatermarkService', () => {
  let service: WatermarkService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WatermarkService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Visibility
  // ---------------------------------------------------------------------------

  it('should not show watermark before init', () => {
    expect(service.showWatermark).toBe(false);
  });

  it('should show watermark when enabled with imagePath', () => {
    service.init(makeConfig());
    expect(service.showWatermark).toBe(true);
  });

  it('should NOT show watermark when disabled', () => {
    service.init(makeConfig({ enabled: false }));
    expect(service.showWatermark).toBe(false);
  });

  it('should NOT show watermark when imagePath is empty', () => {
    service.init(makeConfig({ imagePath: '' }));
    expect(service.showWatermark).toBe(false);
  });

  it('should show watermark when schedule is disabled (always visible)', () => {
    service.init(makeConfig({
      schedule: { enabled: false, rules: [] },
    }));
    expect(service.showWatermark).toBe(true);
  });

  it('should show watermark when schedule has no rules', () => {
    service.init(makeConfig({
      schedule: { enabled: true, rules: [] },
    }));
    expect(service.showWatermark).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Schedule rules
  // ---------------------------------------------------------------------------

  it('should show watermark when schedule rule matches current day/time', () => {
    const now = new Date();
    const rule: WatermarkScheduleRule = {
      id: 'r1',
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: [now.getDay()],
      matchPhases: ['all'],
    };

    service.init(makeConfig({
      schedule: { enabled: true, rules: [rule] },
    }));
    expect(service.showWatermark).toBe(true);
  });

  it('should NOT show watermark when schedule rule does not match day', () => {
    const now = new Date();
    const wrongDay = (now.getDay() + 1) % 7;
    const rule: WatermarkScheduleRule = {
      id: 'r1',
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: [wrongDay],
      matchPhases: ['all'],
    };

    service.init(makeConfig({
      schedule: { enabled: true, rules: [rule] },
    }));
    expect(service.showWatermark).toBe(false);
  });

  it('should respect match phase filtering', () => {
    const now = new Date();
    const rule: WatermarkScheduleRule = {
      id: 'r1',
      startTime: '00:00',
      endTime: '23:59',
      daysOfWeek: [now.getDay()],
      matchPhases: ['during'],
    };

    service.init(makeConfig({
      schedule: { enabled: true, rules: [rule] },
    }));

    // En phase neutral, pas de match -> pas visible
    service.setActivePhase('neutral');
    expect(service.showWatermark).toBe(false);

    // En phase during -> visible
    service.setActivePhase('during');
    expect(service.showWatermark).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // setConfiguration (reload)
  // ---------------------------------------------------------------------------

  it('should update watermark visibility on setConfiguration', () => {
    service.init(makeConfig());
    expect(service.showWatermark).toBe(true);

    service.setConfiguration(makeConfig({ enabled: false }));
    expect(service.showWatermark).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getStyles
  // ---------------------------------------------------------------------------

  it('should return empty styles when no configuration', () => {
    expect(service.getStyles()).toEqual({});
  });

  it('should return fullscreen styles', () => {
    service.init(makeConfig({ fullscreen: true, opacity: 80 }));
    const styles = service.getStyles();
    expect(styles['width']).toBe('100%');
    expect(styles['height']).toBe('100%');
    expect(styles['opacity']).toBe('0.8');
  });

  it('should return positioned styles for bottom-right', () => {
    service.init(makeConfig({ position: 'bottom-right', offsetX: 10, offsetY: 15, width: 200, opacity: 100 }));
    const styles = service.getStyles();
    expect(styles['bottom']).toBe('15px');
    expect(styles['right']).toBe('10px');
    expect(styles['width']).toBe('200px');
    expect(styles['opacity']).toBe('1');
  });

  it('should return positioned styles for top-left', () => {
    service.init(makeConfig({ position: 'top-left', offsetX: 5, offsetY: 10 }));
    const styles = service.getStyles();
    expect(styles['top']).toBe('10px');
    expect(styles['left']).toBe('5px');
  });

  it('should return centered styles for middle-center', () => {
    service.init(makeConfig({ position: 'middle-center' }));
    const styles = service.getStyles();
    expect(styles['top']).toBe('50%');
    expect(styles['left']).toBe('50%');
    expect(styles['transform']).toBe('translate(-50%, -50%)');
  });

  it('should return top-center styles', () => {
    service.init(makeConfig({ position: 'top-center' }));
    const styles = service.getStyles();
    expect(styles['top']).toContain('px');
    expect(styles['left']).toBe('50%');
    expect(styles['transform']).toBe('translateX(-50%)');
  });

  it('should include height when > 0', () => {
    service.init(makeConfig({ height: 100 }));
    const styles = service.getStyles();
    expect(styles['height']).toBe('100px');
  });

  it('should NOT include height when 0 (auto)', () => {
    service.init(makeConfig({ height: 0 }));
    const styles = service.getStyles();
    expect(styles['height']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // getAnimationClass
  // ---------------------------------------------------------------------------

  it('should return animation class from config', () => {
    service.init(makeConfig({ animation: 'fade' }));
    expect(service.getAnimationClass()).toBe('watermark-anim-fade');
  });

  it('should default to none animation', () => {
    service.init(makeConfig());
    expect(service.getAnimationClass()).toBe('watermark-anim-none');
  });

  // ---------------------------------------------------------------------------
  // getImagePath
  // ---------------------------------------------------------------------------

  it('should return image path', () => {
    service.init(makeConfig({ imagePath: '/test/logo.png' }));
    expect(service.getImagePath()).toBe('/test/logo.png');
  });

  it('should return null when no config', () => {
    expect(service.getImagePath()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // onImageError
  // ---------------------------------------------------------------------------

  it('should hide watermark on image error', () => {
    service.init(makeConfig());
    expect(service.showWatermark).toBe(true);

    service.onImageError();
    expect(service.showWatermark).toBe(false);
  });
});
