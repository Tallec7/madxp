/**
 * Cloud Remote Component
 *
 * Télécommande cloud pour contrôler un site Neopro à distance.
 * Fonctionne sur n'importe quel réseau, même avec isolation client.
 *
 * Date: 2026-01-18
 */

import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, interval, takeUntil } from 'rxjs';
import { RemoteService, RemoteState, ScoreData, VideoData } from '../../core/services/remote.service';

interface VideoItem {
  name: string;
  path: string;
  category?: string;
}

interface TimeCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface Category {
  id: string;
  name: string;
  videos?: Array<{ name: string; path: string }>;
  subCategories?: Array<{
    id: string;
    name: string;
    videos?: Array<{ name: string; path: string }>;
  }>;
}

type ViewType = 'home' | 'time-categories' | 'category-videos' | 'all-videos' | 'score';

@Component({
  selector: 'app-cloud-remote',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cloud-remote" [class.dark]="isDarkMode">
      <!-- Header -->
      <header class="remote-header">
        <div class="header-left">
          <h1 class="header-title">{{ state()?.clubName || 'Chargement...' }}</h1>
          <span class="header-subtitle" [class.connected]="state()?.isConnected" [class.offline]="!state()?.isConnected">
            {{ state()?.isConnected ? 'Connecté' : 'Hors ligne' }}
          </span>
        </div>
        <div class="header-right">
          <select class="phase-select" [(ngModel)]="selectedPhase" (ngModelChange)="onPhaseChange($event)">
            <option value="neutral">🔄 Boucle</option>
            <option value="before">🚩 Avant</option>
            <option value="during">▶️ Match</option>
            <option value="after">🏆 Après</option>
          </select>
          <button class="icon-btn" (click)="toggleDarkMode()" [title]="isDarkMode ? 'Mode clair' : 'Mode sombre'">
            {{ isDarkMode ? '☀️' : '🌙' }}
          </button>
        </div>
      </header>

      <!-- Loading -->
      <div class="loading" *ngIf="isLoading()">
        <div class="spinner"></div>
        <span>Chargement...</span>
      </div>

      <!-- Error -->
      <div class="error-state" *ngIf="error()">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error() }}</span>
        <button class="retry-btn" (click)="loadState()">Réessayer</button>
      </div>

      <!-- Offline Warning -->
      <div class="offline-banner" *ngIf="state() && !state()?.isConnected">
        <span class="offline-icon">📡</span>
        <div class="offline-text">
          <strong>Site hors ligne</strong>
          <span>Les commandes ne seront pas reçues. Utilisez la télécommande locale (hotspot).</span>
        </div>
      </div>

      <!-- Content -->
      <main class="remote-content" *ngIf="state() && !isLoading() && !error()">

        <!-- Home View -->
        <div class="view-home" *ngIf="currentView === 'home'">

          <!-- Quick Actions -->
          <section class="section">
            <div class="section-title">⚡ Actions rapides</div>
            <div class="quick-actions">
              <button class="action-btn primary" (click)="playSponsors()" [disabled]="!state()?.isConnected">
                <span class="btn-icon">🔄</span>
                <span class="btn-label">Lancer boucle</span>
              </button>
              <button class="action-btn" (click)="currentView = 'score'" [disabled]="!state()?.isConnected">
                <span class="btn-icon">🏆</span>
                <span class="btn-label">Score</span>
              </button>
              <button class="action-btn" (click)="currentView = 'all-videos'">
                <span class="btn-icon">🎬</span>
                <span class="btn-label">Vidéos</span>
              </button>
            </div>
          </section>

          <!-- Current Loop Info -->
          <section class="section" *ngIf="currentLoopCount() > 0">
            <div class="loop-banner">
              <div class="loop-info">
                <span class="loop-badge">🔄 En boucle ({{ currentLoopCount() }} vidéo{{ currentLoopCount() > 1 ? 's' : '' }})</span>
                <span class="loop-phase">{{ getPhaseLabel(selectedPhase) }}</span>
              </div>
            </div>
          </section>

          <!-- Recent Videos -->
          <section class="section" *ngIf="recentVideos.length > 0">
            <div class="section-title">🕐 Récemment lancées</div>
            <div class="recent-scroll">
              <button
                class="recent-card"
                *ngFor="let video of recentVideos"
                [class.playing]="playingVideoPath === video.path"
                (click)="playVideo(video)"
                [disabled]="!state()?.isConnected"
              >
                <div class="recent-thumb">
                  <span *ngIf="playingVideoPath !== video.path">▶</span>
                  <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
                </div>
                <span class="recent-name">{{ video.name }}</span>
              </button>
            </div>
          </section>

          <!-- Time Categories -->
          <section class="section">
            <div class="section-title">📚 Organisation par temps</div>
            <div class="time-grid">
              <button
                class="time-card"
                *ngFor="let tc of timeCategories()"
                [class]="'time-card-' + tc.id"
                (click)="selectTimeCategory(tc)"
              >
                <div class="time-header">
                  <span class="time-icon">{{ tc.icon }}</span>
                  <span class="time-arrow">›</span>
                </div>
                <div class="time-name">{{ tc.name }}</div>
                <div class="time-desc">{{ tc.description }}</div>
                <div class="time-stats">{{ getCategoriesForTime(tc.id).length }} catégories</div>
              </button>
            </div>
          </section>
        </div>

        <!-- Score View -->
        <div class="view-score" *ngIf="currentView === 'score'">
          <div class="view-header">
            <button class="back-btn" (click)="currentView = 'home'">‹</button>
            <span class="view-title">Score en direct</span>
          </div>

          <div class="score-panel">
            <div class="team-row">
              <input
                type="text"
                class="team-input"
                [(ngModel)]="score.homeTeam"
                placeholder="Home team"
              />
              <div class="score-controls">
                <button class="score-btn minus" (click)="decrementScore('home')" [disabled]="score.homeScore <= 0">−</button>
                <span class="score-value">{{ score.homeScore }}</span>
                <button class="score-btn plus" (click)="incrementScore('home')">+</button>
              </div>
            </div>

            <div class="vs-divider">VS</div>

            <div class="team-row">
              <input
                type="text"
                class="team-input"
                [(ngModel)]="score.awayTeam"
                placeholder="Away team"
              />
              <div class="score-controls">
                <button class="score-btn minus" (click)="decrementScore('away')" [disabled]="score.awayScore <= 0">−</button>
                <span class="score-value">{{ score.awayScore }}</span>
                <button class="score-btn plus" (click)="incrementScore('away')">+</button>
              </div>
            </div>

            <div class="score-actions">
              <button class="action-btn primary" (click)="sendScore()" [disabled]="!state()?.isConnected || isSendingScore">
                {{ isSendingScore ? 'Envoi...' : 'Envoyer le score' }}
              </button>
              <button class="action-btn secondary" (click)="resetScore()" [disabled]="!state()?.isConnected">
                Remettre à 0
              </button>
            </div>
          </div>
        </div>

        <!-- Time Categories View -->
        <div class="view-categories" *ngIf="currentView === 'time-categories'">
          <div class="view-header">
            <button class="back-btn" (click)="currentView = 'home'">‹</button>
            <span class="view-title">{{ selectedTimeCategory?.name }}</span>
          </div>
          <div class="categories-list">
            <button
              class="category-card"
              *ngFor="let cat of getCategoriesForTime(selectedTimeCategory?.id || '')"
              (click)="selectCategory(cat)"
            >
              <span class="cat-icon">📁</span>
              <div class="cat-info">
                <span class="cat-name">{{ cat.name }}</span>
                <span class="cat-count">{{ getVideoCountForCategory(cat) }} vidéos</span>
              </div>
              <span class="cat-arrow">›</span>
            </button>
            <div class="empty-state" *ngIf="getCategoriesForTime(selectedTimeCategory?.id || '').length === 0">
              <span class="empty-icon">📂</span>
              <span class="empty-text">Aucune catégorie</span>
            </div>
          </div>
        </div>

        <!-- Category Videos View -->
        <div class="view-videos" *ngIf="currentView === 'category-videos'">
          <div class="view-header">
            <button class="back-btn" (click)="currentView = 'time-categories'">‹</button>
            <span class="view-title">{{ selectedCategory?.name }}</span>
          </div>
          <div class="videos-list">
            <button
              class="video-card"
              *ngFor="let video of getVideosForCategory(selectedCategory)"
              [class.playing]="playingVideoPath === video.path"
              (click)="playVideo(video)"
              [disabled]="!state()?.isConnected"
            >
              <div class="video-thumb">
                <span *ngIf="playingVideoPath !== video.path">▶</span>
                <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
              </div>
              <div class="video-info">
                <span class="video-name">{{ video.name }}</span>
              </div>
              <span class="video-play" *ngIf="playingVideoPath !== video.path">▶</span>
            </button>
          </div>
        </div>

        <!-- All Videos View -->
        <div class="view-all-videos" *ngIf="currentView === 'all-videos'">
          <div class="view-header">
            <button class="back-btn" (click)="currentView = 'home'">‹</button>
            <span class="view-title">Toutes les vidéos ({{ allVideos().length }})</span>
          </div>

          <!-- Search -->
          <div class="search-box">
            <input
              type="text"
              class="search-input"
              [(ngModel)]="searchQuery"
              placeholder="🔍 Search video..."
            />
          </div>

          <div class="videos-list">
            <button
              class="video-card"
              *ngFor="let video of filteredVideos()"
              [class.playing]="playingVideoPath === video.path"
              (click)="playVideo(video)"
              [disabled]="!state()?.isConnected"
            >
              <div class="video-thumb">
                <span *ngIf="playingVideoPath !== video.path">▶</span>
                <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
              </div>
              <div class="video-info">
                <span class="video-name">{{ video.name }}</span>
                <span class="video-cat">{{ video.category || 'Sans catégorie' }}</span>
              </div>
              <span class="video-play" *ngIf="playingVideoPath !== video.path">▶</span>
            </button>
            <div class="empty-state" *ngIf="filteredVideos().length === 0">
              <span class="empty-icon">🎬</span>
              <span class="empty-text">Aucune vidéo trouvée</span>
            </div>
          </div>
        </div>
      </main>

      <!-- Toast -->
      <div class="toast" *ngIf="showToast" [class.success]="toastType === 'success'" [class.error]="toastType === 'error'">
        {{ toastMessage }}
      </div>
    </div>
  `,
  styles: [`
    .cloud-remote {
      min-height: 100vh;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .cloud-remote.dark {
      background: #0f172a;
      color: white;
    }

    /* Header */
    .remote-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: white;
      border-bottom: 1px solid #e2e8f0;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .dark .remote-header {
      background: #1e293b;
      border-color: #334155;
    }

    .header-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .header-subtitle {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background: #fecaca;
      color: #dc2626;
    }

    .header-subtitle.connected {
      background: #bbf7d0;
      color: #16a34a;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .phase-select {
      padding: 0.5rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: white;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .dark .phase-select {
      background: #334155;
      border-color: #475569;
      color: white;
    }

    .icon-btn {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 8px;
      background: #f1f5f9;
      cursor: pointer;
      font-size: 1rem;
    }

    .dark .icon-btn {
      background: #334155;
    }

    /* Loading & Error */
    .loading, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      gap: 1rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-icon { font-size: 2rem; }
    .error-text { color: #dc2626; }

    .retry-btn {
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }

    /* Offline Banner */
    .offline-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #fef3c7;
      border-bottom: 1px solid #fcd34d;
    }

    .offline-icon { font-size: 1.25rem; }

    .offline-text {
      display: flex;
      flex-direction: column;
      font-size: 0.875rem;
    }

    .offline-text strong {
      color: #92400e;
    }

    .offline-text span {
      color: #a16207;
      font-size: 0.75rem;
    }

    /* Content */
    .remote-content {
      padding: 1rem;
      max-width: 600px;
      margin: 0 auto;
    }

    .section {
      margin-bottom: 1.5rem;
    }

    .section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 0.75rem;
    }

    .dark .section-title {
      color: #94a3b8;
    }

    /* Quick Actions */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }

    .action-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .dark .action-btn {
      background: #1e293b;
      border-color: #334155;
    }

    .action-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-btn.primary {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      border-color: transparent;
      color: white;
    }

    .action-btn.secondary {
      background: #f1f5f9;
    }

    .dark .action-btn.secondary {
      background: #334155;
    }

    .btn-icon { font-size: 1.5rem; }
    .btn-label { font-size: 0.75rem; font-weight: 500; }

    /* Loop Banner */
    .loop-banner {
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      border-radius: 12px;
      padding: 1rem;
      color: white;
    }

    .loop-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .loop-badge {
      font-size: 0.75rem;
      opacity: 0.9;
    }

    .loop-phase {
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
    }

    /* Recent Videos */
    .recent-scroll {
      display: flex;
      gap: 0.75rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
    }

    .recent-card {
      flex-shrink: 0;
      width: 80px;
      padding: 0.75rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      text-align: center;
      cursor: pointer;
    }

    .dark .recent-card {
      background: #1e293b;
      border-color: #334155;
    }

    .recent-card.playing {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }

    .recent-thumb {
      width: 100%;
      height: 40px;
      background: #f1f5f9;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      color: #64748b;
    }

    .dark .recent-thumb {
      background: #334155;
    }

    .recent-card.playing .recent-thumb {
      background: rgba(255, 255, 255, 0.2);
    }

    .playing-indicator {
      color: #22c55e;
      animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .recent-name {
      font-size: 0.625rem;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Time Categories Grid */
    .time-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .time-card {
      width: 100%;
      padding: 1rem;
      background: white;
      border: none;
      border-radius: 12px;
      text-align: left;
      cursor: pointer;
      transition: transform 0.15s;
    }

    .dark .time-card {
      background: #1e293b;
    }

    .time-card:hover {
      transform: scale(1.02);
    }

    .time-card-before { border-left: 4px solid #f59e0b; }
    .time-card-during { border-left: 4px solid #22c55e; }
    .time-card-after { border-left: 4px solid #3b82f6; }

    .time-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .time-icon { font-size: 1.25rem; }
    .time-arrow { color: #94a3b8; }

    .time-name {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .time-desc {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .dark .time-desc {
      color: #94a3b8;
    }

    .time-stats {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    /* View Header */
    .view-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .dark .view-header {
      border-color: #334155;
    }

    .back-btn {
      width: 32px;
      height: 32px;
      background: #f1f5f9;
      border: none;
      border-radius: 8px;
      font-size: 1.25rem;
      cursor: pointer;
    }

    .dark .back-btn {
      background: #334155;
      color: white;
    }

    .view-title {
      font-weight: 600;
    }

    /* Score Panel */
    .score-panel {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
    }

    .dark .score-panel {
      background: #1e293b;
    }

    .team-row {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .team-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 1rem;
      text-align: center;
    }

    .dark .team-input {
      background: #334155;
      border-color: #475569;
      color: white;
    }

    .score-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }

    .score-btn {
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      transition: transform 0.1s;
    }

    .score-btn:active:not(:disabled) {
      transform: scale(0.95);
    }

    .score-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .score-btn.minus {
      background: #fee2e2;
      color: #dc2626;
    }

    .score-btn.plus {
      background: #dcfce7;
      color: #16a34a;
    }

    .score-value {
      font-size: 2.5rem;
      font-weight: 700;
      min-width: 60px;
      text-align: center;
    }

    .vs-divider {
      text-align: center;
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0.5rem 0;
    }

    .score-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }

    .score-actions .action-btn {
      flex-direction: row;
      justify-content: center;
      padding: 1rem;
    }

    /* Categories & Videos Lists */
    .categories-list, .videos-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .category-card, .video-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
    }

    .dark .category-card, .dark .video-card {
      background: #1e293b;
      border-color: #334155;
    }

    .video-card:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cat-icon { font-size: 1.25rem; }

    .cat-info, .video-info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .cat-name, .video-name {
      font-weight: 500;
    }

    .cat-count, .video-cat {
      font-size: 0.75rem;
      color: #64748b;
    }

    .dark .cat-count, .dark .video-cat {
      color: #94a3b8;
    }

    .cat-arrow { color: #94a3b8; }

    .video-thumb {
      width: 48px;
      height: 36px;
      background: #f1f5f9;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      color: #64748b;
    }

    .dark .video-thumb {
      background: #334155;
    }

    .video-card.playing {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }

    .video-card.playing .video-thumb {
      background: rgba(255, 255, 255, 0.2);
    }

    .video-card.playing .video-cat {
      color: rgba(255, 255, 255, 0.8);
    }

    .video-play {
      width: 28px;
      height: 28px;
      background: #3b82f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      color: white;
    }

    /* Search */
    .search-box {
      margin-bottom: 1rem;
    }

    .search-input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      font-size: 0.875rem;
    }

    .dark .search-input {
      background: #1e293b;
      border-color: #334155;
      color: white;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem;
      color: #64748b;
    }

    .empty-icon { font-size: 2rem; opacity: 0.5; }
    .empty-text { font-size: 0.875rem; }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.75rem 1.5rem;
      background: #1e293b;
      color: white;
      border-radius: 9999px;
      font-size: 0.875rem;
      z-index: 1000;
      animation: slideUp 0.3s ease-out;
    }

    .toast.success {
      background: #16a34a;
    }

    .toast.error {
      background: #dc2626;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translate(-50%, 20px);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }
  `]
})
export class CloudRemoteComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly remoteService = inject(RemoteService);
  private readonly destroy$ = new Subject<void>();

  // State
  state = signal<RemoteState | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  // UI State
  currentView: ViewType = 'home';
  selectedPhase = 'neutral';
  selectedTimeCategory: TimeCategory | null = null;
  selectedCategory: Category | null = null;
  playingVideoPath: string | null = null;
  isDarkMode = false;
  searchQuery = '';

  // Score
  score: ScoreData = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0
  };
  isSendingScore = false;

  // Recent videos
  recentVideos: VideoItem[] = [];

  // Toast
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // Computed
  timeCategories = computed(() => {
    const config = this.state()?.config;
    if (config?.timeCategories?.length) {
      return config.timeCategories.map(tc => ({
        id: tc.id,
        name: tc.name,
        icon: tc.icon || this.getDefaultIcon(tc.id),
        description: tc.description || ''
      }));
    }
    return [
      { id: 'before', name: 'Avant-match', icon: '🚩', description: 'Échauffement, accueil' },
      { id: 'during', name: 'Match', icon: '▶️', description: 'Pendant le match' },
      { id: 'after', name: 'Après-match', icon: '🏆', description: 'Célébrations, résumé' }
    ];
  });

  allVideos = computed(() => {
    const st = this.state();
    if (!st) return [];

    const videos: VideoItem[] = [];

    // From categories
    st.config.categories?.forEach(cat => {
      cat.videos?.forEach(v => videos.push({ ...v, category: cat.name }));
      cat.subCategories?.forEach(sc => {
        sc.videos?.forEach(v => videos.push({ ...v, category: sc.name }));
      });
    });

    // From sponsors
    st.config.sponsors?.forEach(s => videos.push({ name: s.name, path: s.path, category: 'Sponsors' }));

    // From local videos
    const paths = new Set(videos.map(v => v.path));
    st.localVideos?.forEach(lv => {
      if (!paths.has(lv.path)) {
        videos.push({ name: lv.filename, path: lv.path, category: lv.category || 'Local' });
      }
    });

    return videos;
  });

  filteredVideos = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) return this.allVideos();
    return this.allVideos().filter(v =>
      v.name.toLowerCase().includes(query) ||
      v.category?.toLowerCase().includes(query)
    );
  });

  currentLoopCount = computed(() => {
    const st = this.state();
    if (!st) return 0;

    if (this.selectedPhase === 'neutral') {
      return st.config.sponsors?.length ?? 0;
    }

    const tc = st.config.timeCategories?.find(t => t.id === this.selectedPhase);
    if (tc?.loopVideos?.length) {
      return tc.loopVideos.length;
    }

    return st.config.sponsors?.length ?? 0;
  });

  ngOnInit() {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) {
      this.error.set('ID du site manquant');
      this.isLoading.set(false);
      return;
    }

    // Dark mode from localStorage
    this.isDarkMode = localStorage.getItem('remote-dark-mode') === 'true';

    // Load state
    this.loadState();

    // Refresh every 30s
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadState(true));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadState(silent = false) {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) return;

    if (!silent) this.isLoading.set(true);

    this.remoteService.getState(siteId).subscribe({
      next: (state) => {
        this.state.set(state);
        this.isLoading.set(false);
        this.error.set(null);
      },
      error: (err) => {
        console.error('Failed to load state:', err);
        this.error.set(err.error?.error || 'Erreur de chargement');
        this.isLoading.set(false);
      }
    });
  }

  // Actions
  onPhaseChange(phase: string) {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId || !this.state()?.isConnected) return;

    this.remoteService.changePhase(siteId, phase as any).subscribe({
      next: () => this.displayToast(`Phase: ${this.getPhaseLabel(phase)}`, 'success'),
      error: () => this.displayToast('Erreur lors du changement de phase', 'error')
    });
  }

  playSponsors() {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) return;

    this.remoteService.playSponsors(siteId).subscribe({
      next: () => this.displayToast('Boucle lancée', 'success'),
      error: () => this.displayToast('Erreur', 'error')
    });
  }

  playVideo(video: VideoItem) {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) return;

    this.playingVideoPath = video.path;

    this.remoteService.playVideo(siteId, { name: video.name, path: video.path }).subscribe({
      next: () => {
        this.displayToast(`${video.name} lancée`, 'success');
        this.addToRecent(video);
        setTimeout(() => this.playingVideoPath = null, 3000);
      },
      error: () => {
        this.displayToast('Erreur', 'error');
        this.playingVideoPath = null;
      }
    });
  }

  sendScore() {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) return;

    this.isSendingScore = true;

    this.remoteService.updateScore(siteId, this.score).subscribe({
      next: () => {
        this.displayToast('Score envoyé', 'success');
        this.isSendingScore = false;
      },
      error: () => {
        this.displayToast('Erreur', 'error');
        this.isSendingScore = false;
      }
    });
  }

  resetScore() {
    const siteId = this.route.snapshot.paramMap.get('siteId');
    if (!siteId) return;

    this.score.homeScore = 0;
    this.score.awayScore = 0;

    this.remoteService.resetScore(siteId).subscribe({
      next: () => this.displayToast('Score remis à zéro', 'success'),
      error: () => this.displayToast('Erreur', 'error')
    });
  }

  incrementScore(team: 'home' | 'away') {
    if (team === 'home') {
      this.score.homeScore++;
    } else {
      this.score.awayScore++;
    }
  }

  decrementScore(team: 'home' | 'away') {
    if (team === 'home' && this.score.homeScore > 0) {
      this.score.homeScore--;
    } else if (team === 'away' && this.score.awayScore > 0) {
      this.score.awayScore--;
    }
  }

  // Navigation
  selectTimeCategory(tc: TimeCategory) {
    this.selectedTimeCategory = tc;
    this.currentView = 'time-categories';
  }

  selectCategory(cat: Category) {
    this.selectedCategory = cat;
    this.currentView = 'category-videos';
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('remote-dark-mode', String(this.isDarkMode));
  }

  // Helpers
  getPhaseLabel(phase: string): string {
    const labels: Record<string, string> = {
      'neutral': 'Boucle standard',
      'before': 'Avant-match',
      'during': 'Pendant le match',
      'after': 'Après-match'
    };
    return labels[phase] || phase;
  }

  getDefaultIcon(id: string): string {
    const icons: Record<string, string> = { 'before': '🚩', 'during': '▶️', 'after': '🏆' };
    return icons[id] || '📁';
  }

  getCategoriesForTime(timeId: string): Category[] {
    const config = this.state()?.config;
    if (!config?.categories) return [];

    const tc = config.timeCategories?.find(t => t.id === timeId);
    if (tc?.categoryIds?.length) {
      return config.categories.filter(c => tc.categoryIds!.includes(c.id));
    }

    // Fallback: divide categories
    const cats = config.categories;
    const third = Math.ceil(cats.length / 3);
    if (timeId === 'before') return cats.slice(0, third);
    if (timeId === 'during') return cats.slice(third, third * 2);
    return cats.slice(third * 2);
  }

  getVideoCountForCategory(cat: Category | null): number {
    if (!cat) return 0;
    let count = cat.videos?.length || 0;
    cat.subCategories?.forEach(sc => count += sc.videos?.length || 0);
    return count;
  }

  getVideosForCategory(cat: Category | null): VideoItem[] {
    if (!cat) return [];
    const videos: VideoItem[] = [];
    cat.videos?.forEach(v => videos.push({ ...v, category: cat.name }));
    cat.subCategories?.forEach(sc => {
      sc.videos?.forEach(v => videos.push({ ...v, category: sc.name }));
    });
    return videos;
  }

  private addToRecent(video: VideoItem) {
    this.recentVideos = [video, ...this.recentVideos.filter(v => v.path !== video.path)].slice(0, 5);
  }

  private displayToast(message: string, type: 'success' | 'error') {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    setTimeout(() => this.showToast = false, 3000);
  }
}
