import { TestBed } from '@angular/core/testing';
import {
  LocalOptionsService,
  LocalOptions,
  SPORT_PERIODS,
  SPORT_PERIOD_DURATIONS,
  DEFAULT_GOAL_SOUNDS,
} from './local-options.service';

describe('LocalOptionsService', () => {
  let service: LocalOptionsService;
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageMock[key] ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => { localStorageMock[key] = value; });

    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalOptionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Options par défaut
  // ---------------------------------------------------------------------------

  it('should return default options', () => {
    const opts = service.getOptions();
    expect(opts.sport).toBe('football');
    expect(opts.overlay.scoreEnabled).toBe(false);
    expect(opts.timer.enabled).toBe(false);
    expect(opts.template).toBe('broadcast');
    expect(opts.match.homeTeam.name).toBe('DOMICILE');
    expect(opts.match.awayTeam.name).toBe('EXTÉRIEUR');
  });

  it('should return default options via observable', (done) => {
    service.getOptions$().subscribe(opts => {
      expect(opts.sport).toBe('football');
      done();
    });
  });

  // ---------------------------------------------------------------------------
  // updateOptions
  // ---------------------------------------------------------------------------

  it('should update options partially', () => {
    service.updateOptions({ template: 'minimal' });
    expect(service.getOptions().template).toBe('minimal');
  });

  it('should deep merge nested options', () => {
    service.updateOptions({ overlay: { scoreEnabled: true } as any });
    const opts = service.getOptions();
    // scoreEnabled should be updated
    expect(opts.overlay.scoreEnabled).toBe(true);
  });

  it('should emit updated options via observable', (done) => {
    const emissions: LocalOptions[] = [];
    service.getOptions$().subscribe(opts => {
      emissions.push(opts);
      if (emissions.length === 2) {
        expect(emissions[1].template).toBe('minimal');
        done();
      }
    });

    service.updateOptions({ template: 'minimal' });
  });

  it('should persist to localStorage', () => {
    service.updateOptions({ template: 'minimal' });
    expect(localStorage.setItem).toHaveBeenCalledWith('neopro-local-options', jasmine.any(String));
  });

  // ---------------------------------------------------------------------------
  // Overlay options
  // ---------------------------------------------------------------------------

  it('should update overlay options', () => {
    service.updateOverlayOptions({ scoreEnabled: true, position: 'bottom-left' });
    const opts = service.getOptions();
    expect(opts.overlay.scoreEnabled).toBe(true);
    expect(opts.overlay.position).toBe('bottom-left');
  });

  // ---------------------------------------------------------------------------
  // Timer options
  // ---------------------------------------------------------------------------

  it('should update timer options', () => {
    service.updateTimerOptions({ enabled: true, countDown: false });
    const opts = service.getOptions();
    expect(opts.timer.enabled).toBe(true);
    expect(opts.timer.countDown).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Breaking news options
  // ---------------------------------------------------------------------------

  it('should update breaking news options', () => {
    service.updateBreakingNewsOptions({ enabled: true, position: 'top' });
    const opts = service.getOptions();
    expect(opts.breakingNews.enabled).toBe(true);
    expect(opts.breakingNews.position).toBe('top');
  });

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------

  it('should set template', () => {
    service.setTemplate('minimal');
    expect(service.getOptions().template).toBe('minimal');
  });

  // ---------------------------------------------------------------------------
  // Quick messages
  // ---------------------------------------------------------------------------

  it('should add quick message', () => {
    const initial = service.getOptions().breakingNews.quickMessages.length;
    service.addQuickMessage('Test message');
    expect(service.getOptions().breakingNews.quickMessages.length).toBe(initial + 1);
    expect(service.getOptions().breakingNews.quickMessages).toContain('Test message');
  });

  it('should NOT add duplicate quick message', () => {
    service.addQuickMessage('Test');
    const after = service.getOptions().breakingNews.quickMessages.length;
    service.addQuickMessage('Test');
    expect(service.getOptions().breakingNews.quickMessages.length).toBe(after);
  });

  it('should NOT add empty quick message', () => {
    const initial = service.getOptions().breakingNews.quickMessages.length;
    service.addQuickMessage('');
    service.addQuickMessage('   ');
    expect(service.getOptions().breakingNews.quickMessages.length).toBe(initial);
  });

  it('should remove quick message by index', () => {
    const initial = service.getOptions().breakingNews.quickMessages.length;
    service.removeQuickMessage(0);
    expect(service.getOptions().breakingNews.quickMessages.length).toBe(initial - 1);
  });

  // ---------------------------------------------------------------------------
  // Sport & periods
  // ---------------------------------------------------------------------------

  it('should change sport and update related options', () => {
    service.setSport('basketball');
    const opts = service.getOptions();
    expect(opts.sport).toBe('basketball');
    expect(opts.match.period).toBe('1er quart');
    expect(opts.match.periodIndex).toBe(0);
    expect(opts.timer.periodDuration).toBe(10);
    expect(opts.goalAnimation.soundUrl).toBe(DEFAULT_GOAL_SOUNDS.basketball);
  });

  it('should return available periods for current sport', () => {
    service.setSport('volleyball');
    expect(service.getAvailablePeriods()).toEqual(SPORT_PERIODS.volleyball);
  });

  it('should change period', () => {
    service.setSport('football');
    service.setPeriod(1);
    const opts = service.getOptions();
    expect(opts.match.period).toBe('2ème mi-temps');
    expect(opts.match.periodIndex).toBe(1);
  });

  it('should NOT change period with invalid index', () => {
    service.setSport('football');
    service.setPeriod(99);
    expect(service.getOptions().match.periodIndex).toBe(0);
  });

  it('should advance to next period', () => {
    service.setSport('football');
    service.nextPeriod();
    expect(service.getOptions().match.periodIndex).toBe(1);
  });

  it('should wrap around periods', () => {
    service.setSport('football');
    // Football: 4 periods
    service.setPeriod(3);
    service.nextPeriod();
    expect(service.getOptions().match.periodIndex).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Teams & logos
  // ---------------------------------------------------------------------------

  it('should update home team', () => {
    service.updateHomeTeam({ name: 'PSG', shortName: 'PSG' });
    expect(service.getOptions().match.homeTeam.name).toBe('PSG');
  });

  it('should update away team', () => {
    service.updateAwayTeam({ name: 'OL' });
    expect(service.getOptions().match.awayTeam.name).toBe('OL');
  });

  it('should set team logo', () => {
    service.setTeamLogo('home', 'data:image/png;base64,abc');
    expect(service.getOptions().match.homeTeam.logo).toBe('data:image/png;base64,abc');

    service.setTeamLogo('away', '/logos/away.png');
    expect(service.getOptions().match.awayTeam.logo).toBe('/logos/away.png');
  });

  it('should clear team logos', () => {
    service.setTeamLogo('home', 'logo.png');
    service.setTeamLogo('away', 'logo2.png');
    service.clearTeamLogos();

    expect(service.getOptions().match.homeTeam.logo).toBeUndefined();
    expect(service.getOptions().match.awayTeam.logo).toBeUndefined();
  });

  it('should reset match', () => {
    service.updateHomeTeam({ name: 'PSG' });
    service.setPeriod(2);
    service.resetMatch();

    const opts = service.getOptions();
    expect(opts.match.homeTeam.name).toBe('DOMICILE');
    expect(opts.match.periodIndex).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Goal animation
  // ---------------------------------------------------------------------------

  it('should update goal animation config', () => {
    service.updateGoalAnimation({ enabled: false, style: 'fullscreen', duration: 6 });
    const opts = service.getOptions();
    expect(opts.goalAnimation.enabled).toBe(false);
    expect(opts.goalAnimation.style).toBe('fullscreen');
    expect(opts.goalAnimation.duration).toBe(6);
  });

  // ---------------------------------------------------------------------------
  // resetToDefaults
  // ---------------------------------------------------------------------------

  it('should reset all options to defaults', () => {
    service.setSport('rugby');
    service.setTemplate('minimal');
    service.updateOverlayOptions({ scoreEnabled: true });

    service.resetToDefaults();

    const opts = service.getOptions();
    expect(opts.sport).toBe('football');
    expect(opts.template).toBe('broadcast');
    expect(opts.overlay.scoreEnabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // LocalStorage integration
  // ---------------------------------------------------------------------------

  it('should load from localStorage on creation', () => {
    const saved: Partial<LocalOptions> = {
      sport: 'hockey',
      template: 'minimal',
    };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);

    const newService = new LocalOptionsService();
    expect(newService.getOptions().sport).toBe('hockey');
    expect(newService.getOptions().template).toBe('minimal');
    // Merged with defaults
    expect(newService.getOptions().overlay.scoreEnabled).toBe(false);
  });

  it('should handle corrupted localStorage gracefully', () => {
    localStorageMock['neopro-local-options'] = 'not json!';
    const newService = new LocalOptionsService();
    expect(newService.getOptions().sport).toBe('football');
  });

  // ---------------------------------------------------------------------------
  // Migration v1 → v2
  // ---------------------------------------------------------------------------

  it('should migrate sportif template to broadcast', () => {
    const saved = { sport: 'football', template: 'sportif' };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    expect(newService.getOptions().template).toBe('broadcast');
  });

  it('should migrate elegant template to broadcast', () => {
    const saved = { sport: 'football', template: 'elegant' };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    expect(newService.getOptions().template).toBe('broadcast');
  });

  it('should keep minimal template as-is during migration', () => {
    const saved = { sport: 'football', template: 'minimal' };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    expect(newService.getOptions().template).toBe('minimal');
  });

  it('should strip legacy overlay color fields during migration', () => {
    const saved = {
      overlay: {
        scoreEnabled: true,
        useLocalColors: true,
        backgroundColor: '#123',
        scoreColor: '#456',
        teamNameColor: '#789',
      },
    };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    const opts = newService.getOptions();
    expect(opts.overlay.scoreEnabled).toBe(true);
    // Legacy fields should not survive migration
    expect((opts.overlay as Record<string, unknown>)['useLocalColors']).toBeUndefined();
    expect((opts.overlay as Record<string, unknown>)['backgroundColor']).toBeUndefined();
    expect((opts.overlay as Record<string, unknown>)['scoreColor']).toBeUndefined();
    expect((opts.overlay as Record<string, unknown>)['teamNameColor']).toBeUndefined();
  });

  it('should strip presets during migration', () => {
    const saved = {
      presets: [{ id: 'p1', name: 'test' }],
    };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    expect((newService.getOptions() as Record<string, unknown>)['presets']).toBeUndefined();
  });

  it('should force displayMode to scroll during migration', () => {
    const saved = {
      breakingNews: { displayMode: 'truncate' },
    };
    localStorageMock['neopro-local-options'] = JSON.stringify(saved);
    const newService = new LocalOptionsService();
    expect(newService.getOptions().breakingNews.displayMode).toBe('scroll');
  });
});
