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
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
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
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { RemoteScoreService } from '../remote/remote-score.service';
import { RemoteTimerService } from '../remote/remote-timer.service';
import { RemotePreferencesService, RemotePreferences } from '../remote/remote-preferences.service';

type Phase = 'before' | 'during' | 'after';
type SheetType = null | 'gear' | 'matchInfo' | 'profile' | 'prefs' | 'options' | 'widget-score' | 'widget-chrono' | 'widget-breaking';

interface DisplayInfo {
  id: string;
  label: string;
  status: 'online' | 'offline';
}

@Component({
  selector: 'app-remote-v2',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './remote-v2.component.html',
  styleUrl: './remote-v2.component.scss',
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

  private subs: Subscription[] = [];

  /** Configuration chargée via le resolver du route /remote. */
  configuration: Configuration | null = null;

  /** Options locales (match, overlay, chrono, breaking, template). */
  localOptions!: LocalOptions;

  /** Phase de navigation (catégories affichées) — peut différer de la boucle active. */
  phaseId: Phase = 'during';

  /** Boucle à l'antenne (cloud push vers le TV). */
  loopId: Phase = 'during';

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

  /** Profils SaaS (si mode SaaS, sinon vide). */
  profiles: SaasProfile[] = [];

  /** Profil actif (nom). */
  currentProfile = '';

  /** Initiales (2 lettres max) du club/profil actif pour le badge header. */
  get clubInitials(): string {
    const source = this.currentProfile || '';
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /** Toast (notification fugitive). */
  toast: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Cycle de vie -----------------------------------------------------

  ngOnInit(): void {
    this.configuration = (this.route.snapshot.data['configuration'] as Configuration) || null;
    this.localOptions = this.localOptionsService.getOptions();

    // Score: synchro avec match info
    const m = this.localOptions.match;
    this.scoreService.currentScore.homeTeam = m.homeTeam.name || 'DOMICILE';
    this.scoreService.currentScore.awayTeam = m.awayTeam.name || 'EXTÉRIEUR';

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

    // Expansion par défaut : catégorie alignée sur la phase
    this.setDefaultExpanded();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  // ---- Helpers UI -------------------------------------------------------

  private setDefaultExpanded(): void {
    const cats = this.phaseCategories();
    if (cats.length > 0) {
      this.expandedCategories = { [cats[0].id]: true };
    }
  }

  showToast(msg: string): void {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 1800);
  }

  openSheet(sheet: Exclude<SheetType, null>): void {
    this.activeSheet = sheet;
  }

  closeSheet(): void {
    this.activeSheet = null;
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
    const timeCats = (this.configuration.timeCategories || []) as TimeCategory[];
    const targetKey = this.loopId === 'before' ? 'avant' : this.loopId === 'during' ? 'match' : 'apres';
    const tc = timeCats.find(t => t.id.toLowerCase().includes(targetKey));
    const first = tc?.loopVideos?.[0];
    if (!first) return null;
    return { name: first.name || 'Vidéo', duration: (first as { duration?: number }).duration };
  }

  /** Phase ≠ Loop → afficher le bouton "Aligner sur boucle". */
  get phaseDivergesFromLoop(): boolean {
    return this.phaseId !== this.loopId;
  }

  // ---- Actions ----------------------------------------------------------

  setPhase(p: Phase): void {
    this.phaseId = p;
    this.setDefaultExpanded();
  }

  alignPhaseToLoop(): void {
    this.setPhase(this.loopId);
    this.showToast(`Navigation alignée sur ${this.loopLabel(this.loopId)}`);
  }

  setLoop(p: Phase): void {
    this.loopId = p;
    this.socketService.emit('phase-change', { phase: p });
    this.showToast(`Boucle : ${this.loopLabel(p)}`);
  }

  loopLabel(p: Phase): string {
    return p === 'before' ? 'Avant-match' : p === 'during' ? 'Match' : 'Après-match';
  }

  toggleCategory(id: string): void {
    this.expandedCategories[id] = !this.expandedCategories[id];
  }

  toggleSub(id: string): void {
    this.expandedSubs[id] = !this.expandedSubs[id];
  }

  playVideo(v: PiConfigVideoEntry): void {
    this.playingVideoId = v.id ?? null;
    this.socketService.emit('command', {
      type: 'video',
      data: v,
      displayIndex: this.targetDisplay === 'all' ? undefined : parseInt(this.targetDisplay, 10),
    });
    this.showToast(`Diffusé : ${v.name}`);
    // Le 2nd écran reprend la boucle automatiquement à la fin de la vidéo forcée.
  }

  toggleRecording(): void {
    this.recording = !this.recording;
    this.socketService.emit('command', {
      type: this.recording ? 'record-start' : 'record-stop',
    });
    this.showToast(this.recording ? 'Enregistrement démarré' : 'Enregistrement arrêté');
  }

  setTargetDisplay(id: string): void {
    this.targetDisplay = id;
    this.showToast(id === 'all' ? 'Cible : tous les écrans' : `Cible : écran #${id}`);
  }

  // ---- Widgets: score + chrono ------------------------------------------

  incHome(): void { this.scoreService.incrementHomeScore(); }
  decHome(): void { this.scoreService.decrementHomeScore(); }
  incAway(): void { this.scoreService.incrementAwayScore(); }
  decAway(): void { this.scoreService.decrementAwayScore(); }
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
    this.socketService.emit('match-config', {
      matchDate: d.date,
      matchName: `${d.teamHome} vs ${d.teamAway}`,
      audienceEstimate: d.spectators,
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

  // ---- Rollback V1 ------------------------------------------------------

  backToV1(): void {
    localStorage.setItem('neopro_remote_v2_override', '0');
    this.router.navigate(['/remote'], { queryParams: { v2: '0' } });
  }
}
