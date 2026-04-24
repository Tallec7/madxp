/**
 * RemoteV2Component — Nouvelle télécommande (V7 UI).
 *
 * Architecture ADR-051 Phase 4 : orchestrateur mince, services scoped pour
 * score/timer/préférences, LocalOptionsService global pour le match.
 *
 * Rollback V1 : bouton "Revenir à V1" → localStorage override '0' + reload.
 *
 * Scope initial (Phase B) : hero (phases + loops), widgets score/chrono,
 * liste catégories, options match, retour V1. Le port UI complet du POC
 * V7 se fera par itérations (voir `.claude/preview/v7/remote-v7.jsx`).
 */
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Configuration, TimeCategory } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { SocketService } from '../../services/socket.service';
import { SaasConfigService, SaasProfile } from '../../services/saas-config.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { RemoteScoreService } from '../remote/remote-score.service';
import { RemoteTimerService } from '../remote/remote-timer.service';
import { RemotePreferencesService } from '../remote/remote-preferences.service';

type PhaseId = 'before' | 'during' | 'after' | 'neutral';
type SheetType = 'none' | 'gear' | 'match-info' | 'preferences' | 'profile' | 'options';

interface MatchDraft {
  teamHome: string;
  teamAway: string;
  date: string;
  spectators: number;
}

const V2_OVERRIDE_KEY = 'neopro_remote_v2_override';

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
  private readonly socketService = inject(SocketService);
  private readonly saasConfig = inject(SaasConfigService);
  private readonly localOptionsService = inject(LocalOptionsService);
  public readonly scoreService = inject(RemoteScoreService);
  public readonly timerService = inject(RemoteTimerService);
  public readonly prefsService = inject(RemotePreferencesService);

  // Data
  configuration: Configuration | null = null;
  categories: Category[] = [];
  timeCategories: TimeCategory[] = [];
  clubName = '';
  siteName = '';

  // Phase / loop state
  phaseId: PhaseId = 'neutral';
  loopId: PhaseId = 'neutral';

  // UI state
  activeSheet: SheetType = 'none';
  expandedCategoryId: string | null = null;
  expandedSubId: string | null = null;
  toastMessage = '';

  // Options
  localOptions!: LocalOptions;
  matchDraft: MatchDraft = { teamHome: '', teamAway: '', date: '', spectators: 0 };

  // Profiles (SaaS only)
  profiles: SaasProfile[] = [];
  currentProfileId: string | null = null;

  // Recording
  recording = false;

  private subs: Subscription[] = [];

  ngOnInit(): void {
    const data = this.route.snapshot.data['configuration'] as Configuration | undefined;
    if (data) {
      this.configuration = data;
      this.categories = data.categories || [];
      this.timeCategories = data.timeCategories || [];
    }

    this.clubName = this.saasConfig.getClubName() || 'Club';
    this.siteName = this.saasConfig.getSiteName() || '';

    this.subs.push(
      this.localOptionsService.getOptions$().subscribe(opts => {
        this.localOptions = opts;
        this.matchDraft = {
          teamHome: opts.match.homeTeam.name,
          teamAway: opts.match.awayTeam.name,
          date: '',
          spectators: 0,
        };
      }),
    );

    // Initialize timer from local options
    this.timerService.initialize(this.localOptions.timer);

    // Load SaaS profiles if applicable
    if (this.saasConfig.isSaasMode()) {
      this.saasConfig.getAvailableProfiles().subscribe({
        next: profiles => (this.profiles = profiles),
        error: () => (this.profiles = []),
      });
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ---------- Phase / Loop ----------

  setPhase(p: PhaseId): void {
    this.phaseId = p;
    this.expandedCategoryId = null;
    this.expandedSubId = null;
  }

  setLoop(p: Exclude<PhaseId, 'neutral'>): void {
    this.loopId = p;
    this.socketService.emit('phase-change', { phaseId: p });
    this.showToast(`Boucle : ${this.phaseLabel(p)}`);
  }

  alignPhaseToLoop(): void {
    if (this.loopId !== 'neutral') this.phaseId = this.loopId;
  }

  phaseLabel(p: PhaseId): string {
    switch (p) {
      case 'before': return 'Avant';
      case 'during': return 'Match';
      case 'after': return 'Après';
      default: return 'Neutre';
    }
  }

  // ---------- Categories / Videos ----------

  get currentCategories(): Category[] {
    // V2 first pass: ignorer les timeCategories pour simplifier, lister les categories globales.
    return this.categories;
  }

  toggleCategory(id: string): void {
    this.expandedCategoryId = this.expandedCategoryId === id ? null : id;
    this.expandedSubId = null;
  }

  toggleSub(id: string): void {
    this.expandedSubId = this.expandedSubId === id ? null : id;
  }

  playVideo(path: string, name?: string): void {
    this.socketService.emit('command', { type: 'play', video: path });
    this.showToast(name ? `Lecture : ${name}` : 'Lecture lancée');
  }

  // ---------- Score ----------

  incHome(): void { this.scoreService.incrementHomeScore(); }
  decHome(): void { this.scoreService.decrementHomeScore(); }
  incAway(): void { this.scoreService.incrementAwayScore(); }
  decAway(): void { this.scoreService.decrementAwayScore(); }

  // ---------- Timer ----------

  toggleTimer(): void {
    this.timerService.toggle(this.localOptions.timer);
  }

  formatTimer(): string {
    const total = this.timerService.currentTime;
    const mm = Math.floor(total / 60).toString().padStart(2, '0');
    const ss = (total % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // ---------- Recording ----------

  toggleRecording(): void {
    this.recording = !this.recording;
    this.socketService.emit('command', { type: this.recording ? 'start-recording' : 'stop-recording' });
    this.showToast(this.recording ? 'Enregistrement démarré' : 'Enregistrement arrêté');
  }

  // ---------- Sheets ----------

  openSheet(s: SheetType): void { this.activeSheet = s; }
  closeSheet(): void { this.activeSheet = 'none'; }

  // ---------- Match info ----------

  saveMatchInfo(): void {
    const d = this.matchDraft;
    this.localOptionsService.updateOptions({
      match: {
        ...this.localOptions.match,
        homeTeam: { ...this.localOptions.match.homeTeam, name: d.teamHome || 'DOMICILE' },
        awayTeam: { ...this.localOptions.match.awayTeam, name: d.teamAway || 'EXTÉRIEUR' },
      },
    });
    this.scoreService.setHomeTeamName(d.teamHome || 'DOMICILE');
    this.scoreService.setAwayTeamName(d.teamAway || 'EXTÉRIEUR');
    this.socketService.emit('match-config', {
      matchDate: d.date,
      matchName: `${d.teamHome} vs ${d.teamAway}`,
      audienceEstimate: d.spectators,
    });
    this.closeSheet();
    this.showToast('Infos match enregistrées');
  }

  // ---------- Profiles ----------

  selectProfile(profileId: string): void {
    if (!this.saasConfig.isSaasMode()) return;
    this.currentProfileId = profileId;
    const siteId = this.saasConfig.getSiteId();
    this.saasConfig.loadProfileConfiguration(siteId, profileId).subscribe({
      next: () => {
        this.closeSheet();
        window.location.reload();
      },
      error: () => this.showToast('Erreur de chargement du profil'),
    });
  }

  // ---------- Back to V1 ----------

  backToV1(): void {
    localStorage.setItem(V2_OVERRIDE_KEY, '0');
    window.location.reload();
  }

  // ---------- Options ----------

  toggleScoreOverlay(): void {
    this.localOptionsService.updateOptions({
      overlay: { ...this.localOptions.overlay, scoreEnabled: !this.localOptions.overlay.scoreEnabled },
    });
  }

  toggleTimerEnabled(): void {
    this.localOptionsService.updateOptions({
      timer: { ...this.localOptions.timer, enabled: !this.localOptions.timer.enabled },
    });
  }

  toggleCountDown(): void {
    this.localOptionsService.updateOptions({
      timer: { ...this.localOptions.timer, countDown: !this.localOptions.timer.countDown },
    });
  }

  toggleBreakingEnabled(): void {
    this.localOptionsService.updateOptions({
      breakingNews: { ...this.localOptions.breakingNews, enabled: !this.localOptions.breakingNews.enabled },
    });
  }

  // ---------- Toast ----------

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = '';
    }, 2500);
  }
}
