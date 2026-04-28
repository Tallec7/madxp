/**
 * RemoteV2Component — Télécommande Neopro V2 (Phase B).
 *
 * Refonte visuelle de la V1 basée sur le POC `.claude/preview/v7/`. Les services
 * sous-jacents (score, timer, options, socket) sont réutilisés tels quels — V2
 * n'apporte qu'une nouvelle UI.
 *
 * Activation : feature flag `remote_v2` (cf. RemoteHostComponent).
 * Rollback : `?v2=0` ou décoche le flag dans le dashboard → retour V1 instantané.
 *
 * Structure V7 :
 *  - Header (pill club cliquable, REC badge, gear, loupe)
 *  - Hero "À l'antenne" (segmented loop + REC + display target + thumbnail)
 *  - Widgets compacts (score, chrono, breaking)
 *  - Phase tabs (nav indépendante de la boucle + "Aligner sur boucle")
 *  - Catégories accordéon (sous-catégories + vidéos)
 *  - Gear menu : Infos match, Profil, Préférences, Options
 *  - Sheets : Match info, Préférences appareil, Options match, Profil, Widget editor
 */
import { Component, inject, OnInit, OnDestroy, HostListener, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Configuration, TimeCategory } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { PiConfigVideoEntry } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';
import { SaasConfigService, SaasProfile } from '../../services/saas-config.service';
import { LocalOptionsService, LocalOptions, SPORT_LABELS } from '../../services/local-options.service';
import { SportType, ScoreOverlayPosition } from '../../interfaces/configuration.interface';
import { RemoteScoreService } from '../remote/remote-score.service';
import { RemoteTimerService } from '../remote/remote-timer.service';
import { RemotePreferencesService, RemotePreferences } from '../remote/remote-preferences.service';
import { RecordingStateService, RecordingWarningState } from '../../services/recording-state.service';
import { DemoConfigService } from '../../services/demo-config.service';
import * as H from './remote-v2-helpers';
import { R2HeaderComponent } from './parts/r2-header.component';
import { R2RecordingWarningComponent } from './parts/r2-recording-warning.component';
import { R2WidgetsComponent } from './parts/r2-widgets.component';
import { R2HeroComponent } from './parts/r2-hero.component';
import { R2BrowseComponent } from './parts/r2-browse.component';
import { R2VideoRowComponent } from './parts/r2-video-row.component';
import { R2GearSheetComponent, GearAction } from './parts/r2-gear-sheet.component';
import { R2WidgetsToggleSheetComponent } from './parts/r2-widgets-toggle-sheet.component';
import { R2IconComponent } from './icons/r2-icon.component';

type Phase = 'before' | 'during' | 'after';
type Loop = 'neutral' | 'before' | 'during' | 'after';
type SheetType =
  | null
  | 'gear'
  | 'matchInfo'
  | 'profile'
  | 'prefs'
  | 'options'
  | 'search'
  | 'widgets'
  | 'widget-score'
  | 'widget-chrono'
  | 'widget-breaking';

interface WidgetsEnabled {
  score: boolean;
  chrono: boolean;
  breaking: boolean;
}

const WIDGETS_STORAGE_KEY = 'neopro_remote_v2_widgets';
const RECENT_VIDEOS_STORAGE_KEY = 'neopro_remote_v2_recent';
const RECENT_VIDEOS_MAX = 10;

const OVERLAY_POSITIONS: ScoreOverlayPosition[] = [
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

interface DisplayInfo {
  id: string;
  label: string;
  status: 'online' | 'offline';
}

@Component({
  selector: 'app-remote-v2',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    R2HeaderComponent, R2RecordingWarningComponent, R2WidgetsComponent, R2HeroComponent,
    R2BrowseComponent, R2VideoRowComponent,
    R2GearSheetComponent, R2WidgetsToggleSheetComponent,
    R2IconComponent,
  ],
  templateUrl: './remote-v2.component.html',
  styleUrl: './remote-v2.component.scss',
  // Encapsulation None : permet le partage des classes .r2-* à tous les sous-composants
  // sans duplication du SCSS. Risque collision mitigé par le préfixe `.r2-`.
  encapsulation: ViewEncapsulation.None,
  providers: [RemoteScoreService, RemoteTimerService, RemotePreferencesService],
})
export class RemoteV2Component implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly saasConfig = inject(SaasConfigService);
  private readonly localOptionsService = inject(LocalOptionsService);
  public readonly scoreService = inject(RemoteScoreService);
  public readonly timerService = inject(RemoteTimerService);
  public readonly prefsService = inject(RemotePreferencesService);
  private readonly recordingStateService = inject(RecordingStateService);
  private readonly demoConfigService = inject(DemoConfigService);
  private readonly ngZone = inject(NgZone);

  private subs: Subscription[] = [];

  /** Configuration chargée via le resolver du route /remote. */
  configuration: Configuration | null = null;

  /** Options locales (match, overlay, chrono, breaking, template). */
  localOptions!: LocalOptions;

  /** Phase de navigation (catégories affichées) — peut différer de la boucle active. */
  phaseId: Phase = 'during';

  /** Boucle à l'antenne (cloud push vers le TV). 'neutral' = rotation sponsors par défaut. */
  loopId: Loop = 'during';

  /** Sheet / modal actif. null = aucune. */
  activeSheet: SheetType = null;

  /** État catégorie ouverte (accordéon). */
  expandedCategories: Record<string, boolean> = {};
  expandedSubs: Record<string, boolean> = {};

  /** Enregistrement en cours. */
  recording = false;

  /** Cible d'écran active. "all" ou id d'un display. */
  targetDisplay = 'all';

  /** Liste des écrans connectés. */
  displays: DisplayInfo[] = [];

  /** ID de la vidéo forcée en cours (hors boucle). */
  playingVideoId: string | null = null;

  /** Vidéo forcée en cours (objet complet, pour subline + barre de progression). */
  playingVideo: PiConfigVideoEntry | null = null;
  private playingTimer: ReturnType<typeof setTimeout> | null = null;

  /** Activation des widgets (persisté localStorage). */
  widgetsEnabled: WidgetsEnabled = { score: true, chrono: true, breaking: false };

  /** Recherche globale. */
  searchQuery = '';

  /** Mode demo (pas de thumbnails distantes). */
  isDemoMode = false;

  /** True si on doit utiliser le fallback local `/thumbnails/...` (mode Pi only). */
  useLocalThumbnails = true;

  /** Cache buster pour les thumbnails (rechargement config). */
  private thumbnailCacheBuster = Date.now();

  /** Warning d'inactivité enregistreur (compte à rebours avant auto-stop). */
  recordingWarning: RecordingWarningState = { active: false, secondsRemaining: 0 };

  /** IDs des vidéos lancées récemment (les + récentes en tête). */
  recentVideoIds: string[] = [];

  readonly overlayPositions = OVERLAY_POSITIONS;

  /** Profils SaaS (si mode SaaS, sinon vide). */
  profiles: SaasProfile[] = [];

  /** Profil actif (nom). */
  currentProfile = '';

  /** Initiales (2 lettres max) du club/profil actif pour le badge header. */
  get clubInitials(): string {
    return H.clubInitials(this.currentProfile);
  }

  /** Toast (notification fugitive). */
  toast: string | null = null;
  /** Type du toast pour le style ('error' = rouge, sinon neutre). */
  toastKind: 'info' | 'error' = 'info';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Vidéos dont la dernière tentative de lecture a échoué côté TV
   * (player-state.lastError === 'play_error'). Affiché via un badge ⚠️ sur
   * la ligne. Vidé pour un id donné quand l'utilisateur retente la lecture.
   */
  erroredVideoIds = new Set<string>();

  /** Breaking news — texte courant (bufferisé localement, broadcast on demand). */
  breakingText = '';

  private static readonly THUMB_GRADIENTS = [
    'linear-gradient(135deg, #20473c, #51b28b)',
    'linear-gradient(135deg, #cc384e, #e77085)',
    'linear-gradient(135deg, #1f4e8c, #5a8ed6)',
    'linear-gradient(135deg, #7d3aa3, #b06ed0)',
    'linear-gradient(135deg, #c97a1e, #e3a95a)',
    'linear-gradient(135deg, #2e2e2e, #696969)',
  ];

  // ---- Cycle de vie -----------------------------------------------------

  /** UUID de la session match courante (US-V2-03 — payload match-config). */
  private currentSessionId: string | null = null;
  /** ID du profil SaaS courant (US-V2-03 — payload match-config). */
  private currentProfileId: string | null = null;

  ngOnInit(): void {
    const cfg = (this.route.snapshot.data['configuration'] as Configuration) || null;
    this.configuration = cfg ? this.enrichVideosWithCategoryId(cfg) : null;
    this.localOptions = this.localOptionsService.getOptions();

    // Score: synchro avec match info
    const m = this.localOptions.match;
    this.scoreService.currentScore.homeTeam = m.homeTeam.name || 'DOMICILE';
    this.scoreService.currentScore.awayTeam = m.awayTeam.name || 'EXTÉRIEUR';

    // Breaking news: hydrate depuis le premier quickMessage s'il existe
    this.breakingText = this.localOptions.breakingNews?.quickMessages?.[0] || '';

    // Timer: initialisation
    this.timerService.initialize(this.localOptions.timer);

    // Options observable
    this.subs.push(
      this.localOptionsService.getOptions$().subscribe(opts => {
        this.localOptions = opts;
      }),
    );

    // Profil courant
    this.currentProfile = this.saasConfig.getClubName() || this.saasConfig.getSiteName() || 'Club';

    // Profils dispo (SaaS uniquement)
    if (this.saasConfig.isSaasMode()) {
      this.subs.push(
        this.saasConfig.getAvailableProfiles().subscribe({
          next: profiles => (this.profiles = profiles),
          error: () => (this.profiles = []),
        }),
      );
    }

    // Socket: initialisation + listeners essentiels
    this.socketService.initialize();
    this.socketService.on<{ displays: Array<{ index: number; type: string }> }>(
      'displays-changed',
      data => {
        this.displays = (data.displays || []).map(d => ({
          id: String(d.index),
          label: `display-${d.index}`,
          status: 'online' as const,
        }));
      },
    );
    this.socketService.on<{ phase: Phase | 'neutral' }>('phase-change', data => {
      if (data.phase === 'before' || data.phase === 'during' || data.phase === 'after') {
        this.loopId = data.phase;
      }
    });

    // Feedback erreur vidéo : la TV émet `player-state` avec
    // `lastError: 'play_error'` quand une vidéo manuelle plante (404, format
    // invalide, timeout réseau). Sans ce listener, le bouton Remote reste
    // figé en "playing" alors que la TV recovery vers la boucle.
    this.socketService.on<{ lastError?: string | null; isManualMode?: boolean }>(
      'player-state',
      data => this.handlePlayerState(data),
    );

    // Expansion par défaut : catégorie alignée sur la phase
    this.setDefaultExpanded();

    // Widgets enabled : restore depuis localStorage
    this.widgetsEnabled = this.loadWidgetsEnabled();

    // Demo mode (skip thumbnails distants)
    this.isDemoMode = this.demoConfigService.isDemoMode();
    // En SaaS, pas de fichier local /thumbnails — on n'utilise que `thumbnailUrl` cloud.
    this.useLocalThumbnails = !this.isDemoMode && !this.saasConfig.isSaasMode();

    // Vidéos récentes (localStorage)
    this.recentVideoIds = this.loadRecentVideos();

    // Recording state — sync UI + warnings (parité V1 : ngZone.run pour CD reliable)
    this.subs.push(
      this.recordingStateService.isRecording$.subscribe(rec =>
        this.ngZone.run(() => (this.recording = rec)),
      ),
    );
    this.subs.push(
      this.recordingStateService.warning$.subscribe(w =>
        this.ngZone.run(() => (this.recordingWarning = w)),
      ),
    );
    this.subs.push(
      this.recordingStateService.inactivityExpired$.subscribe(() =>
        this.ngZone.run(() => {
          // US-V2-02 + parité V1 : retour auto neutral seulement si pas déjà en neutral
          if (this.loopId !== 'neutral') {
            this.setLoop('neutral');
            this.showToast('Enregistrement arrêté (inactivité) — retour aux sponsors');
          }
        }),
      ),
    );

    // US-V2-03 : suivre le profil courant pour le payload match-config
    if (this.saasConfig.isSaasMode()) {
      this.currentProfileId = this.saasConfig.getSiteId() || null;
    }
  }

  // ---- Enrichissement config (US-V2-01) ---------------------------------

  private enrichVideosWithCategoryId(config: Configuration): Configuration {
    return H.enrichVideosWithCategoryId(config);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.playingTimer) clearTimeout(this.playingTimer);
  }

  private loadWidgetsEnabled(): WidgetsEnabled {
    try {
      const raw = localStorage.getItem(WIDGETS_STORAGE_KEY);
      if (!raw) return { score: true, chrono: true, breaking: false };
      const parsed = JSON.parse(raw) as Partial<WidgetsEnabled>;
      return {
        score: parsed.score ?? true,
        chrono: parsed.chrono ?? true,
        breaking: parsed.breaking ?? false,
      };
    } catch {
      return { score: true, chrono: true, breaking: false };
    }
  }

  private persistWidgetsEnabled(): void {
    try {
      localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(this.widgetsEnabled));
    } catch {
      /* localStorage indisponible (mode privé) — silent */
    }
  }

  toggleWidget(id: keyof WidgetsEnabled): void {
    this.widgetsEnabled = { ...this.widgetsEnabled, [id]: !this.widgetsEnabled[id] };
    this.persistWidgetsEnabled();
  }

  /** Routeur du sheet gear → ouvre la sheet correspondante (US-V2-12 sheets extraction). */
  onGearAction(action: GearAction): void {
    if (action === 'matchInfo') this.openMatchInfo();
    else this.openSheet(action);
  }

  // ---- Helpers UI -------------------------------------------------------

  private setDefaultExpanded(): void {
    const cats = this.phaseCategories();
    if (cats.length > 0) {
      this.expandedCategories = { [cats[0].id]: true };
    }
  }

  showToast(msg: string, kind: 'info' | 'error' = 'info'): void {
    this.toast = msg;
    this.toastKind = kind;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    // Les erreurs restent un peu plus longtemps pour laisser le staff lire.
    const duration = kind === 'error' ? 3500 : 1800;
    this.toastTimer = setTimeout(() => (this.toast = null), duration);
  }

  /**
   * Reçoit l'état du player TV. Si la TV signale un `play_error` alors qu'on
   * a une vidéo forcée en cours, on marque l'id en erreur et on ramène l'UI
   * à l'état "boucle" (sinon le bouton reste figé surligné).
   */
  private handlePlayerState(data: { lastError?: string | null }): void {
    if (data?.lastError !== 'play_error') return;
    const failedId = this.playingVideoId;
    if (failedId) this.erroredVideoIds.add(failedId);
    const failedName = this.playingVideo?.name || 'Vidéo';
    if (this.playingTimer) {
      clearTimeout(this.playingTimer);
      this.playingTimer = null;
    }
    this.playingVideoId = null;
    this.playingVideo = null;
    this.showToast(`⚠️ ${failedName} indisponible — boucle reprise`, 'error');
  }

  openSheet(sheet: Exclude<SheetType, null>): void {
    this.activeSheet = sheet;
  }

  closeSheet(): void {
    this.activeSheet = null;
  }

  /** US-V2-07 : Esc ferme la sheet active. */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.activeSheet) this.closeSheet();
  }

  /** Catégories affichées pour la phase de nav courante. */
  phaseCategories(): Category[] {
    if (!this.configuration) return [];
    const timeCats = (this.configuration.timeCategories || []) as TimeCategory[];
    const targetKey = this.phaseId === 'before' ? 'avant' : this.phaseId === 'during' ? 'match' : 'apres';
    const tc = timeCats.find(t => t.id.toLowerCase().includes(targetKey));
    const allCats = (this.configuration.categories || []) as Category[];
    if (!tc) return allCats;
    return allCats.filter(c => tc.categoryIds?.includes(c.id));
  }

  /** TimeCategory active pour la boucle (pour afficher sa première vidéo dans le hero). */
  loopVideo(): { name: string; duration?: number } | null {
    if (!this.configuration) return null;
    if (this.loopId === 'neutral') return { name: 'Rotation sponsors par défaut' };
    const timeCats = (this.configuration.timeCategories || []) as TimeCategory[];
    const targetKey = this.loopId === 'before' ? 'avant' : this.loopId === 'during' ? 'match' : 'apres';
    const tc = timeCats.find(t => t.id.toLowerCase().includes(targetKey));
    const first = tc?.loopVideos?.[0];
    if (!first) return null;
    return { name: first.name || 'Vidéo', duration: (first as { duration?: number }).duration };
  }

  /** Phase ≠ Loop → afficher le bouton "Aligner sur boucle". 'neutral' n'est pas alignable (pas dans les phases). */
  get phaseDivergesFromLoop(): boolean {
    return this.loopId !== 'neutral' && this.phaseId !== this.loopId;
  }

  /** True si la config a un découpage par phase utilisable (filtrage actif). */
  get hasTimeCategorization(): boolean {
    const tcs = this.configuration?.timeCategories || [];
    return tcs.some(tc => Array.isArray(tc.categoryIds) && tc.categoryIds.length > 0);
  }

  // ---- Actions ----------------------------------------------------------

  setPhase(p: Phase): void {
    this.notifyUserActivity();
    this.phaseId = p;
    this.setDefaultExpanded();
  }

  alignPhaseToLoop(): void {
    if (this.loopId === 'neutral') return;
    this.setPhase(this.loopId);
    this.showToast(`Navigation alignée sur ${this.loopLabel(this.loopId)}`);
  }

  setLoop(p: Loop): void {
    this.loopId = p;
    this.socketService.emit('phase-change', { phase: p });
    this.recordingStateService.onPhaseChange(p);
    this.notifyUserActivity();
    this.showToast(`Boucle : ${this.loopLabel(p)}`);
  }

  loopLabel(p: Loop): string {
    return H.loopLabel(p);
  }

  notifyUserActivity(): void {
    this.recordingStateService.resetInactivityTimer();
  }

  extendRecording(): void {
    this.recordingStateService.extendRecording();
    this.showToast('Enregistrement prolongé');
  }

  dismissRecordingWarning(): void {
    this.recordingStateService.stopRecording(true);
  }

  formatWarningTime(seconds: number): string {
    return H.formatWarningTime(seconds);
  }

  toggleCategory(id: string): void {
    this.expandedCategories[id] = !this.expandedCategories[id];
  }

  toggleSub(id: string): void {
    this.expandedSubs[id] = !this.expandedSubs[id];
  }

  playVideo(v: PiConfigVideoEntry): void {
    this.notifyUserActivity();
    this.addToRecentVideos(v);
    // Retry : on retire le marqueur d'erreur précédent pour cet id.
    if (v.id) this.erroredVideoIds.delete(v.id);
    this.playingVideoId = v.id ?? null;
    this.playingVideo = v;
    this.socketService.emit('command', {
      type: 'video',
      data: v,
      displayIndex: this.targetDisplay === 'all' ? undefined : parseInt(this.targetDisplay, 10),
    });
    this.activeSheet = null;
    this.showToast(`Diffusé : ${v.name}`);
    // Le 2nd écran reprend la boucle automatiquement à la fin de la vidéo forcée.
    if (this.playingTimer) clearTimeout(this.playingTimer);
    const duration = (v.durationSeconds ?? 0) * 1000;
    const ms = duration > 0 ? Math.min(duration, 5000) : 5000;
    this.playingTimer = setTimeout(() => {
      this.playingVideoId = null;
      this.playingVideo = null;
    }, ms);
  }

  // ---- Helpers visuels --------------------------------------------------

  homeColor(): string {
    // US-V2-09 : couleur identitaire si définie, sinon hash sur le nom
    return (
      this.localOptions?.match?.homeTeam?.color ||
      H.pickTeamColor(this.scoreService.currentScore.homeTeam || 'home')
    );
  }

  awayColor(): string {
    return (
      this.localOptions?.match?.awayTeam?.color ||
      H.pickTeamColor(this.scoreService.currentScore.awayTeam || 'away')
    );
  }

  setTeamColor(team: 'home' | 'away', color: string): void {
    this.notifyUserActivity();
    if (team === 'home') {
      this.localOptionsService.updateHomeTeam({ color });
    } else {
      this.localOptionsService.updateAwayTeam({ color });
    }
    this.scoreService.broadcast();
  }

  teamShort(name: string | undefined): string {
    return H.teamShort(name);
  }

  categoryCount(cat: Category): number {
    return H.categoryCount(cat);
  }

  hasSubCategories(cat: Category): boolean {
    return H.hasSubCategories(cat);
  }

  formatDuration(sec: number | null | undefined): string {
    return H.formatDuration(sec);
  }

  videoTags(v: PiConfigVideoEntry): Array<'secondary' | 'sponsor' | 'link'> {
    return H.videoTags(v);
  }

  homeLogo(): string | undefined {
    return this.localOptions?.match?.homeTeam?.logo;
  }

  awayLogo(): string | undefined {
    return this.localOptions?.match?.awayTeam?.logo;
  }

  /** Subline du hero "À l'antenne". */
  heroSubline(): string {
    if (this.playingVideo) return 'Lecture ponctuelle · retour boucle';
    return 'Tourne en fond';
  }

  toggleRecording(): void {
    this.notifyUserActivity();
    // RecordingStateService propage lui-même via socket.emit('recording-state') — pas de double emit (parité V1).
    this.recordingStateService.toggleRecording();
    const next = !this.recording;
    this.showToast(next ? 'Enregistrement démarré' : 'Enregistrement arrêté');
  }

  setTargetDisplay(id: string): void {
    this.targetDisplay = id;
    this.showToast(id === 'all' ? 'Cible : tous les écrans' : `Cible : écran #${id}`);
  }

  // ---- Widgets: score + chrono ------------------------------------------

  incHome(): void { this.notifyUserActivity(); this.scoreService.incrementHomeScore(); }
  decHome(): void { this.notifyUserActivity(); this.scoreService.decrementHomeScore(); }
  incAway(): void { this.notifyUserActivity(); this.scoreService.incrementAwayScore(); }
  decAway(): void { this.notifyUserActivity(); this.scoreService.decrementAwayScore(); }
  resetScore(): void { this.scoreService.resetScore(); this.showToast('Score remis à 0'); }

  toggleTimer(): void {
    this.timerService.toggle(this.localOptions.timer);
  }

  resetTimer(): void {
    this.timerService.reset(this.localOptions.timer);
    this.showToast('Chrono réinitialisé');
  }

  get chronoDisplay(): string {
    return this.timerService.getDisplayTime();
  }

  // ---- Sport / période / nouveau match ----------------------------------

  readonly sportTypes: SportType[] = ['football', 'basketball', 'handball', 'volleyball', 'rugby', 'hockey'];

  sportLabel(s: SportType): string {
    return SPORT_LABELS[s];
  }

  setSport(sport: SportType): void {
    this.notifyUserActivity();
    this.localOptionsService.setSport(sport);
    this.showToast(`Sport : ${SPORT_LABELS[sport]}`);
  }

  setPeriod(periodIndex: number): void {
    this.notifyUserActivity();
    this.localOptionsService.setPeriod(periodIndex);
    this.scoreService.broadcast();
    // US-V2-11 : reset chrono à chaque changement de période (sync vers scoreboard externe via timerService)
    this.timerService.reset(this.localOptions.timer);
    this.showToast(`Période : ${this.localOptions.match.period}`);
  }

  nextPeriod(): void {
    this.notifyUserActivity();
    this.localOptionsService.nextPeriod();
    this.scoreService.broadcast();
    // US-V2-11 : reset chrono à chaque période suivante
    this.timerService.reset(this.localOptions.timer);
    this.showToast(`Période : ${this.localOptions.match.period} · chrono réinitialisé`);
  }

  getAvailablePeriods(): string[] {
    return this.localOptionsService.getAvailablePeriods();
  }

  startNewMatch(): void {
    if (!confirm('Préparer un nouveau match ? (Score, chrono et équipes seront réinitialisés)')) return;
    this.notifyUserActivity();
    this.localOptionsService.resetMatch();
    const m = this.localOptions.match;
    this.scoreService.resetForNewMatch(m.homeTeam.name, m.awayTeam.name);
    this.timerService.reset(this.localOptions.timer);
    this.scoreService.broadcast();
    // US-V2-05 : reset le buffer matchDraft pour que la prochaine ouverture de la sheet soit propre
    this.matchDraft = {
      teamHome: '',
      teamAway: '',
      date: new Date().toISOString().slice(0, 10),
      spectators: 0,
    };
    this.currentSessionId = null;
    this.showToast('Nouveau match préparé');
  }

  // ---- Logos équipes ----------------------------------------------------

  onLogoUpload(event: Event, team: 'home' | 'away'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.showToast('Sélectionne une image');
      input.value = '';
      return;
    }
    if (file.size > 500 * 1024) {
      this.showToast('Image trop volumineuse (max 500 Ko)');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      this.localOptionsService.setTeamLogo(team, e.target?.result as string);
      this.scoreService.broadcast();
      this.showToast('Logo mis à jour');
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearTeamLogo(team: 'home' | 'away'): void {
    this.localOptionsService.setTeamLogo(team, undefined);
    this.scoreService.broadcast();
    this.showToast('Logo supprimé');
  }

  // ---- Audience +/− -----------------------------------------------------

  incrementAudience(): void {
    this.matchDraft.spectators = (this.matchDraft.spectators || 0) + 10;
  }

  decrementAudience(): void {
    this.matchDraft.spectators = Math.max(0, (this.matchDraft.spectators || 0) - 10);
  }

  // ---- Animation de but -------------------------------------------------

  updateGoalAnimation<K extends keyof LocalOptions['goalAnimation']>(
    key: K,
    value: LocalOptions['goalAnimation'][K],
  ): void {
    this.localOptionsService.updateGoalAnimation({ [key]: value } as Partial<LocalOptions['goalAnimation']>);
  }

  // ---- Infos match (modal) ----------------------------------------------

  /** Valeurs éditées dans le modal Infos match (buffer). */
  matchDraft = { teamHome: '', teamAway: '', date: '', spectators: 0 };

  openMatchInfo(): void {
    const m = this.localOptions.match;
    this.matchDraft = {
      teamHome: m.homeTeam.name || '',
      teamAway: m.awayTeam.name || '',
      date: new Date().toISOString().slice(0, 10),
      spectators: 0,
    };
    this.openSheet('matchInfo');
  }

  saveMatchInfo(): void {
    this.notifyUserActivity();
    const d = this.matchDraft;
    this.localOptionsService.updateOptions({
      match: {
        ...this.localOptions.match,
        homeTeam: { ...this.localOptions.match.homeTeam, name: d.teamHome },
        awayTeam: { ...this.localOptions.match.awayTeam, name: d.teamAway },
      },
    });
    this.scoreService.currentScore.homeTeam = d.teamHome || 'DOMICILE';
    this.scoreService.currentScore.awayTeam = d.teamAway || 'EXTÉRIEUR';

    // US-V2-03 : payload complet ADR-093 (sessionId, homeTeam, awayTeam, profileId, eventType)
    this.currentSessionId = this.generateUUID();
    this.socketService.emit('match-config', {
      sessionId: this.currentSessionId,
      matchDate: d.date,
      matchName: `${d.teamHome} vs ${d.teamAway}`,
      audienceEstimate: d.spectators,
      homeTeam: d.teamHome || undefined,
      awayTeam: d.teamAway || undefined,
      profileId: this.currentProfileId || undefined,
      eventType: 'match',
    });
    this.showToast(`Match : ${d.teamHome} vs ${d.teamAway}`);
    this.closeSheet();
  }

  // ---- Profil (modal) ---------------------------------------------------

  selectProfile(p: SaasProfile): void {
    this.currentProfile = p.displayName || p.name;
    const siteId = this.saasConfig.getSiteId();
    if (siteId) {
      this.saasConfig.loadProfileConfiguration(siteId, p.id).subscribe({
        next: () => {
          this.showToast(`Profil : ${this.currentProfile}`);
          this.closeSheet();
          // Reload pour appliquer la nouvelle config proprement
          window.location.reload();
        },
        error: () => this.showToast('Erreur chargement profil'),
      });
    } else {
      this.closeSheet();
    }
  }

  // ---- Préférences (sheet) ----------------------------------------------

  updatePref<K extends keyof RemotePreferences>(key: K, value: RemotePreferences[K]): void {
    this.prefsService.update(key, value);
  }

  // ---- Options match (sheet) — mise à jour directe via LocalOptionsService

  updateOverlayScore(enabled: boolean): void {
    this.localOptionsService.updateOverlayOptions({ scoreEnabled: enabled });
  }

  updateTimerDuration(minutes: number): void {
    this.localOptionsService.updateTimerOptions({ periodDuration: minutes });
  }

  updateTimerCountDown(countDown: boolean): void {
    this.localOptionsService.updateTimerOptions({ countDown });
  }

  updateBreakingEnabled(enabled: boolean): void {
    this.localOptionsService.updateBreakingNewsOptions({ enabled });
  }

  updateBreakingPosition(position: 'top' | 'bottom'): void {
    this.localOptionsService.updateBreakingNewsOptions({ position });
  }

  get breakingLive(): boolean {
    return !!this.localOptions.breakingNews?.enabled;
  }

  toggleBreaking(): void {
    this.notifyUserActivity();
    const next = !this.breakingLive;
    this.localOptionsService.updateBreakingNewsOptions({ enabled: next });
    if (next && this.breakingText.trim()) {
      const existing = this.localOptions.breakingNews?.quickMessages || [];
      const head = this.breakingText.trim();
      const dedup = [head, ...existing.filter(m => m !== head)].slice(0, 10);
      this.localOptionsService.updateBreakingNewsOptions({ quickMessages: dedup });
    }
    this.showToast(next ? 'Breaking news diffusé' : 'Breaking news retiré');
  }

  updateBreakingText(text: string): void {
    this.breakingText = text;
  }

  videoThumbGradient(id: string | undefined | null): string {
    const s = id || 'x';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const idx = Math.abs(h) % RemoteV2Component.THUMB_GRADIENTS.length;
    return RemoteV2Component.THUMB_GRADIENTS[idx];
  }

  updateTemplate(t: 'broadcast' | 'minimal'): void {
    this.localOptionsService.setTemplate(t);
  }

  resetOptions(): void {
    if (confirm('Réinitialiser toutes les options ?')) {
      this.localOptionsService.updateOptions({
        overlay: { scoreEnabled: true },
        goalAnimation: { enabled: true, style: 'popup', duration: 4, soundEnabled: false },
        timer: { enabled: true, periodDuration: 45, countDown: true, integratedWithScore: true },
        breakingNews: { enabled: false, position: 'bottom', defaultDuration: 10, displayMode: 'scroll', quickMessages: [] },
        template: 'broadcast',
      });
      this.showToast('Options réinitialisées');
    }
  }

  // ---- Thumbnails (reuse helpers V1) ------------------------------------

  getVideoThumbnailUrl(video: PiConfigVideoEntry): string | null {
    if (video.thumbnailUrl) return video.thumbnailUrl;
    if (!video.path || !this.useLocalThumbnails) return null;
    const thumbnailPath = video.path.replace(/^videos\//, 'thumbnails/').replace(/\.\w+$/, '.jpg');
    return `/${thumbnailPath}?t=${this.thumbnailCacheBuster}`;
  }

  getVideoInitials(video: PiConfigVideoEntry): string {
    // Sentinelle consommée par <r2-icon name="play"> côté template (SPEC-V2-ICONS-01).
    if (!video.name) return '__icon_play__';
    const words = video.name.trim().split(/\s+/);
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : video.name.substring(0, 2).toUpperCase();
  }

  onThumbnailError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      img.parentElement?.classList.add('thumbnail-error');
    }
  }

  // ---- Recherche globale ------------------------------------------------

  /** Aplatit toutes les vidéos de la config (toutes phases + sous-catégories). */
  getAllVideos(): PiConfigVideoEntry[] {
    return H.flattenVideos(this.configuration);
  }

  /** Vidéos filtrées selon `searchQuery` (case-insensitive sur `name`). */
  searchResults(): PiConfigVideoEntry[] {
    return H.searchVideos(this.getAllVideos(), this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  // ---- Quick messages breaking ------------------------------------------

  get quickMessages(): string[] {
    return this.localOptions.breakingNews?.quickMessages || [];
  }

  selectQuickMessage(msg: string): void {
    this.notifyUserActivity();
    this.breakingText = msg;
    if (!this.breakingLive) {
      this.localOptionsService.updateBreakingNewsOptions({ enabled: true });
      this.showToast('Breaking news diffusé');
    }
  }

  addQuickMessageFromText(): void {
    this.notifyUserActivity();
    const txt = this.breakingText.trim();
    if (!txt) return;
    const existing = this.quickMessages;
    // US-V2-08 : feedback explicite si le message est déjà enregistré
    if (existing.includes(txt)) {
      this.showToast('Message déjà enregistré');
      return;
    }
    const dedup = [txt, ...existing].slice(0, 10);
    this.localOptionsService.updateBreakingNewsOptions({ quickMessages: dedup });
    this.showToast('Message enregistré');
  }

  removeQuickMessage(idx: number): void {
    this.notifyUserActivity();
    const list = [...this.quickMessages];
    list.splice(idx, 1);
    this.localOptionsService.updateBreakingNewsOptions({ quickMessages: list });
  }

  // ---- Reload config ----------------------------------------------------

  reloadConfiguration(): void {
    if (this.isDemoMode) {
      this.showToast('Mode démo — pas de reload');
      return;
    }
    this.thumbnailCacheBuster = Date.now();

    const onSuccess = (cfg: Configuration): void => {
      // US-V2-01 : enrichir lors du reload aussi
      this.configuration = this.enrichVideosWithCategoryId(cfg);
      this.setDefaultExpanded();
      this.closeSheet();
      this.showToast('Config rechargée');
    };
    const onError = (): void => this.showToast('Erreur de chargement');

    if (this.saasConfig.isSaasMode()) {
      // SaaS : recharger depuis le cloud (pas de fichier local)
      const siteId = this.saasConfig.getSiteId();
      if (!siteId) {
        this.showToast('Site ID introuvable');
        return;
      }
      this.saasConfig.loadConfiguration(siteId).subscribe({ next: onSuccess, error: onError });
    } else {
      // Pi : recharger depuis le fichier local servi par nginx
      this.http.get<Configuration>(`/configuration.json?t=${this.thumbnailCacheBuster}`).subscribe({
        next: onSuccess,
        error: onError,
      });
    }
  }

  // ---- Position overlay score TV ---------------------------------------

  setOverlayPosition(pos: ScoreOverlayPosition): void {
    this.localOptionsService.updateOverlayOptions({ position: pos });
    this.showToast(`Position : ${this.overlayPositionLabel(pos)}`);
  }

  overlayPositionLabel(pos: ScoreOverlayPosition): string {
    const map: Record<ScoreOverlayPosition, string> = {
      'top-left': 'Haut · Gauche',
      'top-center': 'Haut · Centre',
      'top-right': 'Haut · Droit',
      'bottom-left': 'Bas · Gauche',
      'bottom-center': 'Bas · Centre',
      'bottom-right': 'Bas · Droit',
    };
    return map[pos];
  }

  // ---- Vidéos récentes -------------------------------------------------

  private loadRecentVideos(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_VIDEOS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private persistRecentVideos(): void {
    try {
      localStorage.setItem(RECENT_VIDEOS_STORAGE_KEY, JSON.stringify(this.recentVideoIds));
    } catch {
      /* noop */
    }
  }

  private addToRecentVideos(v: PiConfigVideoEntry): void {
    const key = H.videoKey(v);
    if (!key) return;
    const without = this.recentVideoIds.filter(id => id !== key);
    this.recentVideoIds = [key, ...without].slice(0, RECENT_VIDEOS_MAX);
    this.persistRecentVideos();
  }

  recentVideos(): PiConfigVideoEntry[] {
    if (this.recentVideoIds.length === 0) return [];
    const all = this.getAllVideos();
    const byKey = new Map<string, PiConfigVideoEntry>();
    for (const v of all) {
      const k = H.videoKey(v);
      if (k) byKey.set(k, v);
    }
    return this.recentVideoIds
      .map(id => byKey.get(id))
      .filter((v): v is PiConfigVideoEntry => !!v);
  }

  // ---- Rollback V1 ------------------------------------------------------

  backToV1(): void {
    localStorage.setItem('neopro_remote_v2_override', '0');
    this.router.navigate(['/remote'], { queryParams: { v2: '0' } });
  }
}
