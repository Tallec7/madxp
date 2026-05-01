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
      'getScopedStorageKey', 'getSelectedProfileId',
    ]);
    mockSaas.getClubName.and.returnValue('NEO');
    mockSaas.getSiteName.and.returnValue('NEO');
    mockSaas.getSiteId.and.returnValue('site-123');
    mockSaas.isSaasMode.and.returnValue(false);
    // Tests vérifient les clés legacy non scopées — le mock retourne la clé brute
    // (équivalent au comportement Pi natif où siteId est vide → fallback legacy).
    mockSaas.getScopedStorageKey.and.callFake((base: string) => base);
    mockSaas.getSelectedProfileId.and.returnValue(null);

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

  // ---- Parité V1/V2 — path d'émission commande (ADR-081) ----
  describe('emitCommand parity (V1 ↔ V2)', () => {
    function lastCommandPayload(): Record<string, unknown> | undefined {
      const calls = mockSocket.emit.calls.allArgs().filter((args) => args[0] === 'command');
      const last = calls[calls.length - 1];
      return last?.[1] as Record<string, unknown> | undefined;
    }

    it('joint un commandId UUID v4 à chaque emit video', () => {
      component.playVideo({ id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' });
      const p = lastCommandPayload();
      expect(p?.['type']).toBe('video');
      expect(typeof p?.['commandId']).toBe('string');
      expect(p?.['commandId']).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('joint un commandId à stop-manual', () => {
      component.stopPlaying();
      const p = lastCommandPayload();
      expect(p?.['type']).toBe('stop-manual');
      expect(typeof p?.['commandId']).toBe('string');
    });

    it('omet target quand targetDisplay = "all"', () => {
      component.targetDisplay = 'all';
      component.playVideo({ id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' });
      const p = lastCommandPayload();
      expect(p?.['target']).toBeUndefined();
    });

    it('propage target=[N] quand un écran spécifique est ciblé', () => {
      component.targetDisplay = '1';
      component.playVideo({ id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' });
      const p = lastCommandPayload();
      expect(p?.['target']).toEqual([1]);
    });

    it("n'expose plus le champ displayIndex (régression ADR-081)", () => {
      component.targetDisplay = '0';
      component.playVideo({ id: 'v1', name: 'V1', type: 'video', path: 'videos/v1.mp4' });
      const p = lastCommandPayload();
      expect(p && 'displayIndex' in p).toBe(false);
    });
  });

  // ---- Orchestration parity (V1 ↔ V2) — emits que V2 oubliait ----
  describe('orchestration parity (V1 ↔ V2)', () => {
    function emitsForEvent(event: string): unknown[] {
      return mockSocket.emit.calls.allArgs()
        .filter((args) => args[0] === event)
        .map((args) => args[1]);
    }
    function findHandler(event: string): ((data: unknown) => void) | undefined {
      const call = mockSocket.on.calls.allArgs().find(args => args[0] === event);
      return call?.[1] as ((data: unknown) => void) | undefined;
    }

    it('demande un request-state au boot pour récupérer le snapshot serveur', () => {
      const events = mockSocket.emit.calls.allArgs().map(a => a[0]);
      expect(events).toContain('request-state');
    });

    it('reset la cible si le display ciblé disparaît (parité V1)', () => {
      const handler = findHandler('displays-changed');
      expect(handler).toBeDefined();
      handler?.({ displays: [{ index: 0, type: 'tv' }, { index: 1, type: 'secondary' }] });
      component.targetDisplay = '1';
      handler?.({ displays: [{ index: 0, type: 'tv' }] });
      expect(component.targetDisplay).toBe('all');
    });

    it('toggleBreaking() émet un payload breaking-news complet quand activé avec texte', () => {
      component.breakingText = 'BUT pour le HBC !';
      component['localOptions'] = {
        ...component['localOptions'],
        breakingNews: {
          enabled: false, position: 'bottom', defaultDuration: 15,
          displayMode: 'scroll', quickMessages: [],
        },
      };
      component.toggleBreaking();
      const payloads = emitsForEvent('breaking-news');
      expect(payloads.length).toBeGreaterThan(0);
      const news = payloads[payloads.length - 1] as Record<string, unknown>;
      expect(news['message']).toBe('BUT pour le HBC !');
      expect(news['duration']).toBe(15);
      expect(news['position']).toBe('bottom');
    });

    it("toggleBreaking() n'émet rien quand on désactive (pas d'event clear côté TV)", () => {
      component.breakingText = '';
      component['localOptions'] = {
        ...component['localOptions'],
        breakingNews: {
          enabled: true, position: 'bottom', defaultDuration: 10,
          displayMode: 'scroll', quickMessages: [],
        },
      };
      const before = emitsForEvent('breaking-news').length;
      component.toggleBreaking();
      const after = emitsForEvent('breaking-news').length;
      expect(after).toBe(before);
    });

    it('propage tout changement options à la TV via socket+localBroadcast', () => {
      // Simule une mise à jour utilisateur (ex: toggle timer enabled)
      const optionsSubject = mockLocalOptions.getOptions$.calls.mostRecent().returnValue;
      // Récupère le BehaviorSubject sous-jacent du mock
      const newOpts = {
        ...component['localOptions'],
        timer: { ...component['localOptions'].timer, enabled: false },
      };
      // L'observable est créé avec `.asObservable()`, on n'a pas le subject brut.
      // On valide donc que la méthode privée est bien appelée — proxy via spy
      // sur localBroadcast.broadcast (déjà observable côté tests).
      const broadcastSpy = jasmine.createSpy('broadcast');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).localBroadcast.broadcast = broadcastSpy;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component as any).broadcastOptions(newOpts);
      const events = mockSocket.emit.calls.allArgs().map(a => a[0]);
      expect(events).toContain('options-update');
      expect(broadcastSpy).toHaveBeenCalledWith('options-update', jasmine.any(Object));
      // Suppress unused var
      void optionsSubject;
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

  // AUDIT-V2-LAYOUT-01 — parité V1 du filtrage catégories par phase
  // (bug pré-fix : V2 utilisait substring 'avant'/'match'/'apres' au lieu
  // des ids anglais → fallback systématique sur toutes les catégories,
  // ignorant le mapping "Organisation Télécommande" du dashboard).
  describe('phaseCategories (parité V1)', () => {
    const allCats = [
      { id: 'entree', name: 'ENTRÉE' },
      { id: 'match-cat', name: 'MATCH' },
      { id: 'infos-club', name: 'INFOS CLUB' },
      { id: 'focus-partenaires', name: 'FOCUS PARTENAIRES' },
    ];

    beforeEach(() => {
      component.configuration = {
        categories: allCats,
        timeCategories: [
          { id: 'before', name: 'Avant-match', categoryIds: ['entree', 'infos-club', 'focus-partenaires'], loopVideos: [] },
          { id: 'during', name: 'Match', categoryIds: ['match-cat', 'infos-club', 'focus-partenaires'], loopVideos: [] },
          { id: 'after', name: 'Après-match', categoryIds: ['infos-club', 'focus-partenaires'], loopVideos: [] },
        ],
      } as unknown as Configuration;
    });

    it('phase before → ENTRÉE + INFOS CLUB + FOCUS PARTENAIRES', () => {
      component.phaseId = 'before';
      const ids = component.phaseCategories().map(c => c.id);
      expect(ids).toEqual(['entree', 'infos-club', 'focus-partenaires']);
    });

    it('phase during → MATCH + INFOS CLUB + FOCUS PARTENAIRES (pas ENTRÉE)', () => {
      component.phaseId = 'during';
      const ids = component.phaseCategories().map(c => c.id);
      expect(ids).toEqual(['match-cat', 'infos-club', 'focus-partenaires']);
      expect(ids).not.toContain('entree');
    });

    it('phase after → INFOS CLUB + FOCUS PARTENAIRES (ni ENTRÉE ni MATCH)', () => {
      component.phaseId = 'after';
      const ids = component.phaseCategories().map(c => c.id);
      expect(ids).toEqual(['infos-club', 'focus-partenaires']);
    });

    it('fallback toutes catégories si la config n\'a pas de timeCategories', () => {
      component.configuration = {
        categories: allCats,
        timeCategories: [],
      } as unknown as Configuration;
      component.phaseId = 'during';
      expect(component.phaseCategories().length).toBe(allCats.length);
    });

    it('fallback toutes catégories si aucune TimeCategory ne match phaseId', () => {
      component.configuration = {
        categories: allCats,
        timeCategories: [{ id: 'unknown', name: '?', categoryIds: ['entree'], loopVideos: [] }],
      } as unknown as Configuration;
      component.phaseId = 'before';
      expect(component.phaseCategories().length).toBe(allCats.length);
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
