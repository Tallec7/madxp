/**
 * TestBed spec pour RemoteV2Component (US-V2-06).
 *
 * Couvre la logique d'orchestration : enrichissement config, lifecycle, actions
 * (saveMatchInfo, setLoop, toggleRecording, nextPeriod), watchdog auto-revert,
 * persistance recents/widgets dans localStorage.
 *
 * Helpers purs déjà couverts par `remote-v2-helpers.spec.ts`.
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Subject, BehaviorSubject } from 'rxjs';

import { RemoteV2Component } from './remote-v2.component';
import { SocketService } from '../../services/socket.service';
import { SaasConfigService } from '../../services/saas-config.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';

const DEFAULT_LOCAL_OPTIONS: LocalOptions = {
  sport: 'football',
  match: {
    homeTeam: { name: 'DOMICILE', shortName: 'DOM', logo: undefined },
    awayTeam: { name: 'EXTÉRIEUR', shortName: 'EXT', logo: undefined },
    period: '1ère mi-temps',
    periodIndex: 0,
  },
  overlay: { scoreEnabled: false, position: undefined },
  goalAnimation: { enabled: true, style: 'popup', duration: 4, soundEnabled: true, soundUrl: '' },
  timer: { enabled: false, periodDuration: 45, countDown: true, integratedWithScore: true },
  breakingNews: {
    enabled: false, position: 'bottom', defaultDuration: 10,
    displayMode: 'scroll', quickMessages: [],
  },
  template: 'broadcast',
};
import { RecordingStateService, RecordingWarningState } from '../../services/recording-state.service';
import { DemoConfigService } from '../../services/demo-config.service';
import { Configuration } from '../../interfaces/configuration.interface';

interface MockSocket {
  emit: jasmine.Spy;
  on: jasmine.Spy;
  initialize: jasmine.Spy;
}

describe('RemoteV2Component', () => {
  let fixture: ComponentFixture<RemoteV2Component>;
  let component: RemoteV2Component;
  let mockSocket: MockSocket;
  let mockSaas: jasmine.SpyObj<SaasConfigService>;
  let mockLocalOptions: jasmine.SpyObj<LocalOptionsService>;
  let mockRecording: {
    isRecording$: Subject<boolean>;
    warning$: Subject<RecordingWarningState>;
    inactivityExpired$: Subject<void>;
    toggleRecording: jasmine.Spy;
    onPhaseChange: jasmine.Spy;
    resetInactivityTimer: jasmine.Spy;
    extendRecording: jasmine.Spy;
    stopRecording: jasmine.Spy;
  };
  let mockDemo: jasmine.SpyObj<DemoConfigService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const config: Configuration = {
    categories: [
      { id: 'cat-A', name: 'A', videos: [{ id: 'v1', name: 'V1', type: 'video', path: 'videos/a/v1.mp4' }] },
      {
        id: 'cat-B', name: 'B',
        subCategories: [
          { id: 'sub-1', name: 'S1', videos: [{ id: 'v2', name: 'V2', type: 'video', path: 'videos/b/v2.mp4' }] },
        ],
      },
    ],
    timeCategories: [
      { id: 'time-match', name: 'Match', categoryIds: ['cat-A', 'cat-B'], loopVideos: [] },
    ],
  } as unknown as Configuration;

  beforeEach(async () => {
    localStorage.clear();
    mockSocket = {
      emit: jasmine.createSpy('emit'),
      on: jasmine.createSpy('on'),
      initialize: jasmine.createSpy('initialize'),
    };
    mockSaas = jasmine.createSpyObj('SaasConfigService', [
      'getClubName', 'getSiteName', 'getSiteId', 'isSaasMode', 'getAvailableProfiles', 'loadProfileConfiguration',
    ]);
    mockSaas.getClubName.and.returnValue('NEO');
    mockSaas.getSiteName.and.returnValue('NEO');
    mockSaas.getSiteId.and.returnValue('site-123');
    mockSaas.isSaasMode.and.returnValue(false);

    mockLocalOptions = jasmine.createSpyObj('LocalOptionsService', [
      'getOptions', 'getOptions$', 'updateOptions', 'updateOverlayOptions', 'updateBreakingNewsOptions',
      'updateTimerOptions', 'setSport', 'setPeriod', 'nextPeriod', 'getAvailablePeriods',
      'updateHomeTeam', 'updateAwayTeam', 'setTeamLogo', 'resetMatch', 'updateGoalAnimation', 'setTemplate',
    ]);
    mockLocalOptions.getOptions.and.returnValue(DEFAULT_LOCAL_OPTIONS);
    mockLocalOptions.getOptions$.and.returnValue(new BehaviorSubject(DEFAULT_LOCAL_OPTIONS).asObservable());
    mockLocalOptions.getAvailablePeriods.and.returnValue(['1ère mi-temps', '2ème mi-temps']);

    mockRecording = {
      isRecording$: new Subject<boolean>(),
      warning$: new Subject<RecordingWarningState>(),
      inactivityExpired$: new Subject<void>(),
      toggleRecording: jasmine.createSpy('toggleRecording'),
      onPhaseChange: jasmine.createSpy('onPhaseChange'),
      resetInactivityTimer: jasmine.createSpy('resetInactivityTimer'),
      extendRecording: jasmine.createSpy('extendRecording'),
      stopRecording: jasmine.createSpy('stopRecording'),
    };
    mockDemo = jasmine.createSpyObj('DemoConfigService', ['isDemoMode']);
    mockDemo.isDemoMode.and.returnValue(false);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [RemoteV2Component, HttpClientTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: { configuration: config } } } },
        { provide: Router, useValue: mockRouter },
        { provide: SocketService, useValue: mockSocket },
        { provide: SaasConfigService, useValue: mockSaas },
        { provide: LocalOptionsService, useValue: mockLocalOptions },
        { provide: RecordingStateService, useValue: mockRecording },
        { provide: DemoConfigService, useValue: mockDemo },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RemoteV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  // ---- US-V2-01 : enrichVideosWithCategoryId ----
  describe('enrichVideosWithCategoryId (US-V2-01)', () => {
    it('enrichit toutes les vidéos avec leur categoryId au boot', () => {
      const all = component.getAllVideos();
      expect(all.length).toBe(2);
      expect(all.find(v => v.id === 'v1')?.categoryId).toBe('cat-A');
      expect(all.find(v => v.id === 'v2')?.categoryId).toBe('sub-1');
    });
  });

  // ---- US-V2-02 : auto-revert neutral après inactivité ----
  describe('inactivityExpired auto-revert (US-V2-02)', () => {
    it('repasse en neutral et émet phase-change', () => {
      component.loopId = 'during';
      mockRecording.inactivityExpired$.next();
      expect(component.loopId).toBe('neutral');
      expect(mockSocket.emit).toHaveBeenCalledWith('phase-change', { phase: 'neutral' });
    });

    it('ne fait rien si déjà en neutral (parité V1)', () => {
      component.loopId = 'neutral';
      mockSocket.emit.calls.reset();
      mockRecording.inactivityExpired$.next();
      // Aucune émission phase-change additionnelle
      const phaseEmits = mockSocket.emit.calls.allArgs().filter(a => a[0] === 'phase-change');
      expect(phaseEmits.length).toBe(0);
    });
  });

  // ---- US-V2-03 : payload match-config complet ----
  describe('saveMatchInfo (US-V2-03)', () => {
    it('émet match-config avec sessionId + ADR-093 fields', () => {
      component.matchDraft = { teamHome: 'NEO', teamAway: 'PRO', date: '2026-04-25', spectators: 250 };
      component.saveMatchInfo();

      const call = mockSocket.emit.calls.allArgs().find(a => a[0] === 'match-config');
      expect(call).toBeTruthy();
      const payload = call![1];
      expect(payload.homeTeam).toBe('NEO');
      expect(payload.awayTeam).toBe('PRO');
      expect(payload.eventType).toBe('match');
      expect(payload.matchDate).toBe('2026-04-25');
      expect(payload.audienceEstimate).toBe(250);
      expect(payload.sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });
  });

  // ---- US-V2-04 : notifyUserActivity câblé partout ----
  describe('notifyUserActivity (US-V2-04)', () => {
    it('reset le watchdog sur setLoop', () => {
      component.setLoop('before');
      expect(mockRecording.resetInactivityTimer).toHaveBeenCalled();
    });

    it('reset le watchdog sur setSport', () => {
      mockRecording.resetInactivityTimer.calls.reset();
      component.setSport('handball');
      expect(mockRecording.resetInactivityTimer).toHaveBeenCalled();
    });

    it('reset le watchdog sur toggleBreaking', () => {
      mockRecording.resetInactivityTimer.calls.reset();
      component.toggleBreaking();
      expect(mockRecording.resetInactivityTimer).toHaveBeenCalled();
    });
  });

  // ---- US-V2-05 : reset matchDraft après nouveau match ----
  describe('startNewMatch (US-V2-05)', () => {
    it('reset le buffer matchDraft avec date du jour', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.matchDraft = { teamHome: 'OLD', teamAway: 'OLD2', date: '2020-01-01', spectators: 999 };
      component.startNewMatch();
      expect(component.matchDraft.teamHome).toBe('');
      expect(component.matchDraft.teamAway).toBe('');
      expect(component.matchDraft.spectators).toBe(0);
      expect(component.matchDraft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ---- US-V2-07 : Esc ferme la sheet ----
  describe('Esc keyboard (US-V2-07)', () => {
    it('ferme la sheet active', () => {
      component.openSheet('gear');
      expect(component.activeSheet).toBe('gear');
      component.onEscapeKey();
      expect(component.activeSheet).toBeNull();
    });

    it('no-op si pas de sheet active', () => {
      component.activeSheet = null;
      component.onEscapeKey();
      expect(component.activeSheet).toBeNull();
    });
  });

  // ---- US-V2-08 : toast déjà enregistré ----
  describe('addQuickMessageFromText (US-V2-08)', () => {
    it('toast info si message déjà dans la liste', () => {
      // Préfixer la liste avec le message
      component.localOptions = {
        ...DEFAULT_LOCAL_OPTIONS,
        breakingNews: { ...DEFAULT_LOCAL_OPTIONS.breakingNews, quickMessages: ['déjà là'] },
      };
      component.breakingText = 'déjà là';
      component.addQuickMessageFromText();
      expect(component.toast).toBe('Message déjà enregistré');
      expect(mockLocalOptions.updateBreakingNewsOptions).not.toHaveBeenCalled();
    });

    it('persiste un nouveau message via service', () => {
      component.localOptions = DEFAULT_LOCAL_OPTIONS;
      component.breakingText = 'TOMBOLA mi-temps';
      component.addQuickMessageFromText();
      expect(mockLocalOptions.updateBreakingNewsOptions).toHaveBeenCalledWith(
        jasmine.objectContaining({ quickMessages: jasmine.arrayContaining(['TOMBOLA mi-temps']) }),
      );
    });
  });

  // ---- US-V2-11 : reset chrono on nextPeriod ----
  describe('nextPeriod (US-V2-11)', () => {
    it('reset le timer après changement de période', () => {
      const resetSpy = spyOn(component.timerService, 'reset');
      component.nextPeriod();
      expect(mockLocalOptions.nextPeriod).toHaveBeenCalled();
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  // ---- US-V2-09 : team colors customisables ----
  describe('team colors (US-V2-09)', () => {
    it('utilise localOptions.match.homeTeam.color si défini', () => {
      component.localOptions = {
        ...DEFAULT_LOCAL_OPTIONS,
        match: {
          ...DEFAULT_LOCAL_OPTIONS.match,
          homeTeam: { ...DEFAULT_LOCAL_OPTIONS.match.homeTeam, color: '#abcdef' },
        },
      };
      expect(component.homeColor()).toBe('#abcdef');
    });

    it('fallback hash si color absent', () => {
      component.localOptions = DEFAULT_LOCAL_OPTIONS;
      const c = component.homeColor();
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  // ---- Recents persistence (Lot 3) ----
  describe('recentVideos persistence', () => {
    it('persiste dans localStorage à chaque playVideo', () => {
      const v = { id: 'v1', name: 'V1', type: 'video', path: 'videos/a/v1.mp4' };
      component.playVideo(v);
      const raw = localStorage.getItem('neopro_remote_v2_recent');
      expect(raw).toContain('v1');
    });

    it('limite à 10 entrées max', () => {
      for (let i = 0; i < 15; i++) {
        component.playVideo({ id: `v${i}`, name: `V${i}`, type: 'video', path: `videos/x/${i}.mp4` });
      }
      expect(component['recentVideoIds'].length).toBeLessThanOrEqual(10);
    });

    it('dédup : remontée en tête si rejouée', () => {
      const a = { id: 'a', name: 'A', type: 'video', path: 'videos/a.mp4' };
      const b = { id: 'b', name: 'B', type: 'video', path: 'videos/b.mp4' };
      component.playVideo(a);
      component.playVideo(b);
      component.playVideo(a);
      expect(component['recentVideoIds'][0]).toBe('a');
      expect(component['recentVideoIds'].length).toBe(2);
    });
  });

  // ---- Widgets activation persistence ----
  describe('widgetsEnabled persistence', () => {
    it('persiste à chaque toggle', () => {
      component.toggleWidget('breaking');
      const raw = localStorage.getItem('neopro_remote_v2_widgets');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).breaking).toBe(true);
    });
  });

  // ---- Search ----
  describe('search', () => {
    it('searchResults vide quand searchQuery vide', () => {
      component.searchQuery = '';
      expect(component.searchResults().length).toBe(0);
    });

    it('searchResults filtre par nom case-insensitive', () => {
      component.searchQuery = 'v1';
      const r = component.searchResults();
      expect(r.length).toBe(1);
      expect(r[0].name).toBe('V1');
    });
  });

  // ---- Sheet routing ----
  describe('onGearAction', () => {
    it('matchInfo → ouvre la sheet matchInfo', () => {
      component.onGearAction('matchInfo');
      expect(component.activeSheet).toBe('matchInfo');
    });

    it('options → ouvre la sheet options', () => {
      component.onGearAction('options');
      expect(component.activeSheet).toBe('options');
    });
  });

  // ---- Feedback erreur vidéo (player-state.lastError === 'play_error') ----
  describe('handlePlayerState — feedback erreur vidéo manuelle', () => {
    function getPlayerStateHandler(): (data: { lastError?: string | null }) => void {
      const call = mockSocket.on.calls.allArgs().find(args => args[0] === 'player-state');
      expect(call).toBeTruthy();
      return call![1] as (data: { lastError?: string | null }) => void;
    }

    it('enregistre un listener Socket.IO sur player-state au boot', () => {
      const events = mockSocket.on.calls.allArgs().map(a => a[0]);
      expect(events).toContain('player-state');
    });

    it('marque la vidéo en erreur, reset playingVideoId et émet un toast rouge', () => {
      const v = { id: 'joueur-85', name: 'Joueur 85', type: 'video', path: 'videos/x/85.mp4' };
      component.playVideo(v);
      expect(component.playingVideoId).toBe('joueur-85');

      getPlayerStateHandler()({ lastError: 'play_error' });

      expect(component.erroredVideoIds.has('joueur-85')).toBe(true);
      expect(component.playingVideoId).toBeNull();
      expect(component.playingVideo).toBeNull();
      expect(component.toast).toContain('Joueur 85');
      expect(component.toast).toContain('indisponible');
      expect(component.toastKind).toBe('error');
    });

    it('ignore les player-state sans erreur', () => {
      const v = { id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' };
      component.playVideo(v);
      getPlayerStateHandler()({ lastError: null });
      expect(component.playingVideoId).toBe('v1');
      expect(component.erroredVideoIds.has('v1')).toBe(false);
    });

    it('retire le marqueur d\'erreur quand l\'utilisateur retente la lecture', () => {
      const v = { id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' };
      component.erroredVideoIds.add('v1');
      component.playVideo(v);
      expect(component.erroredVideoIds.has('v1')).toBe(false);
    });
  });

  // ---- Phase divergence ----
  describe('phaseDivergesFromLoop', () => {
    it('false quand phase === loop', () => {
      component.phaseId = 'during';
      component.loopId = 'during';
      expect(component.phaseDivergesFromLoop).toBe(false);
    });

    it('true quand phase !== loop et loop !== neutral', () => {
      component.phaseId = 'during';
      component.loopId = 'before';
      expect(component.phaseDivergesFromLoop).toBe(true);
    });

    it('false quand loop === neutral (sponsors n\'est pas alignable)', () => {
      component.phaseId = 'during';
      component.loopId = 'neutral';
      expect(component.phaseDivergesFromLoop).toBe(false);
    });
  });

  // SPEC-V2-LAYOUT-01 — système de préférences de layout (3 mobile × 3 PC)
  describe('layoutClasses (SPEC-V2-LAYOUT-01)', () => {
    it('retourne le couple par défaut (classic / sidebar)', () => {
      component.prefsService.reset();
      expect(component.layoutClasses).toEqual([
        'layout-mobile-classic',
        'layout-desktop-sidebar',
      ]);
    });

    it('reflète les préférences mises à jour', () => {
      component.prefsService.update('layoutMobile', 'compact');
      component.prefsService.update('layoutDesktop', 'pro');
      expect(component.layoutClasses).toEqual([
        'layout-mobile-compact',
        'layout-desktop-pro',
      ]);
    });

    it('couvre les 9 combinaisons sans erreur', () => {
      const mobiles = ['classic', 'grid', 'compact'] as const;
      const desktops = ['centered', 'sidebar', 'pro'] as const;
      for (const m of mobiles) {
        for (const d of desktops) {
          component.prefsService.update('layoutMobile', m);
          component.prefsService.update('layoutDesktop', d);
          expect(component.layoutClasses).toEqual([
            `layout-mobile-${m}`,
            `layout-desktop-${d}`,
          ]);
        }
      }
    });
  });
});
