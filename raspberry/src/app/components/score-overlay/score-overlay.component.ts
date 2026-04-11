import { Component, Input, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SocketService } from '../../services/socket.service';
import { LocalBroadcastService, ScoreUpdateEvent, BreakingNewsEvent, TimerUpdateEvent, OptionsUpdateEvent } from '../../services/local-broadcast.service';
import { LocalOptionsService, LocalOptions } from '../../services/local-options.service';
import { Configuration, ScoreOverlayPosition } from '../../interfaces/configuration.interface';

/**
 * Score data received from remote or cloud
 */
export interface ScoreData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeLogo?: string;
  awayLogo?: string;
  period?: string;
  matchTime?: string;
}

@Component({
  selector: 'app-score-overlay',
  templateUrl: './score-overlay.component.html',
  styleUrl: './score-overlay.component.scss',
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
})
export class ScoreOverlayComponent implements OnInit, OnDestroy {
  @Input() configuration: Configuration;
  @Input() displayType: 'tv' | 'secondary' = 'tv';
  @Input() displayIndex = 0;

  // Score state
  public currentScore: ScoreData | null = null;
  public showScoreOverlay = false;

  // Goal animation
  public showGoalAnimation = false;
  public goalScoringTeam: 'home' | 'away' | null = null;
  private goalAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
  private goalAudio: HTMLAudioElement | null = null;

  // Breaking news
  public showBreakingNews = false;
  public currentBreakingNews: BreakingNewsEvent | null = null;
  private breakingNewsTimeout: ReturnType<typeof setTimeout> | null = null;

  // Timer
  public timerCurrentTime = 0;
  public timerIsRunning = false;
  public timerCountDown = false;
  public timerHalfDuration = 45;
  private localTimerInterval: ReturnType<typeof setInterval> | null = null;

  // Local options (from Remote)
  public localOptions: LocalOptions;

  private subscriptions: Subscription[] = [];

  constructor(
    private readonly socketService: SocketService,
    private readonly localBroadcast: LocalBroadcastService,
    private readonly localOptionsService: LocalOptionsService,
  ) {
    this.localOptions = this.localOptionsService.getOptions();
  }

  public ngOnInit(): void {
    // Subscribe to local options changes
    this.subscriptions.push(
      this.localOptionsService.getOptions$().subscribe((options) => {
        this.localOptions = options;
        if (!options.overlay.scoreEnabled) {
          this.showScoreOverlay = false;
        }
      })
    );

    // === Socket.IO handlers ===

    this.socketService.on('score-update', (scoreData: ScoreData | null) => {
      if (!scoreData) return;
      this.handleScoreUpdate(scoreData);
    });

    this.socketService.on('score-reset', () => {
      this.currentScore = null;
      this.showScoreOverlay = false;
    });

    this.socketService.on('match-info-updated', (_matchInfo: { audienceEstimate?: number }) => {
      // audience estimate is handled by TvComponent (analytics context)
    });

    this.socketService.on<OptionsUpdateEvent>('options-update', (options) => {
      this.localOptions = options as LocalOptions;
      if (!options.overlay.scoreEnabled) {
        this.showScoreOverlay = false;
      }
    });

    this.socketService.on<BreakingNewsEvent & { target?: number[] }>('breaking-news', (news) => {
      // Phase 4 — PROP-002: targeted breaking news
      if (news.target && Array.isArray(news.target) && !news.target.includes(this.displayIndex)) {
        return;
      }
      this.displayBreakingNews(news);
    });

    this.socketService.on<TimerUpdateEvent>('timer-update', (timerEvent) => {
      this.handleTimerUpdate(timerEvent);
    });

    // === BroadcastChannel handlers (local) ===

    this.subscriptions.push(
      this.localBroadcast.onScoreUpdate().subscribe((scoreData: ScoreUpdateEvent) => {
        if (scoreData.reset) {
          this.currentScore = null;
          this.showScoreOverlay = false;
        } else {
          this.handleScoreUpdate(scoreData);
        }
      })
    );

    this.subscriptions.push(
      this.localBroadcast.onOptionsUpdate().subscribe((options: OptionsUpdateEvent) => {
        this.localOptions = options as LocalOptions;
        if (!options.overlay.scoreEnabled) {
          this.showScoreOverlay = false;
        }
      })
    );

    this.subscriptions.push(
      this.localBroadcast.onBreakingNews().subscribe((news: BreakingNewsEvent) => {
        this.displayBreakingNews(news);
      })
    );

    this.subscriptions.push(
      this.localBroadcast.onTimerUpdate().subscribe((timerEvent: TimerUpdateEvent) => {
        this.handleTimerUpdate(timerEvent);
      })
    );
  }

  public ngOnDestroy(): void {
    this.stopLocalTimer();
    if (this.goalAnimationTimeout) clearTimeout(this.goalAnimationTimeout);
    if (this.breakingNewsTimeout) clearTimeout(this.breakingNewsTimeout);
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  // === Public API (called by TvComponent) ===

  /**
   * Called by TvComponent when a score-update arrives via handleTvCommand or reloadConfiguration
   */
  public handleScoreUpdate(scoreData: ScoreData): void {
    // Detect goal scored
    if (this.currentScore && this.localOptions.goalAnimation.enabled) {
      const homeScored = scoreData.homeScore > this.currentScore.homeScore;
      const awayScored = scoreData.awayScore > this.currentScore.awayScore;
      if (homeScored || awayScored) {
        this.triggerGoalAnimation(homeScored ? 'home' : 'away');
      }
    }

    // Enrich with local option logos if not provided
    this.currentScore = {
      ...scoreData,
      homeLogo: scoreData.homeLogo || this.localOptions.match.homeTeam.logo,
      awayLogo: scoreData.awayLogo || this.localOptions.match.awayTeam.logo,
      period: scoreData.period || this.localOptions.match.period,
    };

    if (this.localOptions.overlay.scoreEnabled) {
      this.showScoreOverlay = true;
    }
  }

  /**
   * Toggle score overlay visibility (called from remote command)
   */
  public toggleScoreOverlay(): void {
    this.showScoreOverlay = !this.showScoreOverlay;
  }

  /**
   * Reset score (called when phase changes to neutral or configuration reloads)
   */
  public resetScore(): void {
    this.currentScore = null;
    this.showScoreOverlay = false;
  }

  // === Template helpers ===

  public getOverlayPosition(): ScoreOverlayPosition {
    return this.localOptions.overlay.position
      || this.configuration?.scoreOverlay?.position as ScoreOverlayPosition
      || 'top-right';
  }

  public getGoalAnimationStyle(): string {
    return `style-${this.localOptions.goalAnimation.style}`;
  }

  public get showGoalPopup(): boolean {
    return this.showGoalAnimation;
  }

  public formatTimerDisplay(): string {
    const mins = Math.floor(this.timerCurrentTime / 60);
    const secs = this.timerCurrentTime % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // === Internal methods ===

  private displayBreakingNews(news: BreakingNewsEvent): void {
    if (this.breakingNewsTimeout) {
      clearTimeout(this.breakingNewsTimeout);
    }
    this.currentBreakingNews = news;
    this.showBreakingNews = true;
    this.breakingNewsTimeout = setTimeout(() => {
      this.showBreakingNews = false;
      this.currentBreakingNews = null;
    }, news.duration * 1000);
  }

  public handleTimerUpdate(event: TimerUpdateEvent): void {
    if (event.currentTime !== undefined) {
      this.timerCurrentTime = event.currentTime;
    }
    if (event.halfDuration !== undefined) {
      this.timerHalfDuration = event.halfDuration;
    }
    if (event.countDown !== undefined) {
      this.timerCountDown = event.countDown;
    }

    if (event.action === 'start' && !this.timerIsRunning) {
      this.timerIsRunning = true;
      this.startLocalTimer();
    } else if (event.action === 'pause' && this.timerIsRunning) {
      this.timerIsRunning = false;
      this.stopLocalTimer();
    } else if (event.action === 'reset') {
      this.timerIsRunning = false;
      this.stopLocalTimer();
    } else if (event.action === 'sync') {
      if (event.isRunning !== undefined && event.isRunning !== this.timerIsRunning) {
        this.timerIsRunning = event.isRunning;
        if (this.timerIsRunning && !this.localTimerInterval) {
          this.startLocalTimer();
        } else if (!this.timerIsRunning && this.localTimerInterval) {
          this.stopLocalTimer();
        }
      }
    }
  }

  private startLocalTimer(): void {
    if (this.localTimerInterval) return;
    this.localTimerInterval = setInterval(() => {
      if (this.timerCountDown) {
        if (this.timerCurrentTime > 0) {
          this.timerCurrentTime--;
        }
      } else {
        const maxTime = this.timerHalfDuration * 60;
        if (this.timerCurrentTime < maxTime) {
          this.timerCurrentTime++;
        }
      }
    }, 1000);
  }

  private stopLocalTimer(): void {
    if (this.localTimerInterval) {
      clearInterval(this.localTimerInterval);
      this.localTimerInterval = null;
    }
  }

  private triggerGoalAnimation(team: 'home' | 'away'): void {
    const config = this.localOptions.goalAnimation;
    if (!config.enabled) return;

    if (this.goalAnimationTimeout) {
      clearTimeout(this.goalAnimationTimeout);
    }

    this.goalScoringTeam = team;
    this.showGoalAnimation = true;

    // Play sound (not on secondary — sound comes from primary)
    if (this.displayType !== 'secondary' && config.soundEnabled && config.soundUrl) {
      this.playGoalSound(config.soundUrl);
    }

    // Secondary: shorter duration (quick flash)
    const duration = this.displayType === 'secondary' ? Math.min(config.duration, 3) : config.duration;
    this.goalAnimationTimeout = setTimeout(() => {
      this.showGoalAnimation = false;
      this.goalScoringTeam = null;
    }, duration * 1000);
  }

  private playGoalSound(soundUrl: string): void {
    try {
      if (!this.goalAudio) {
        this.goalAudio = new Audio();
      }
      this.goalAudio.src = soundUrl;
      this.goalAudio.volume = 0.8;
      this.goalAudio.play().catch(err => {
        console.warn('[TV] Could not play goal sound:', err.message);
      });
    } catch (err) {
      console.warn('[TV] Error playing goal sound:', err);
    }
  }
}
