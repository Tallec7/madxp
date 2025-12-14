import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Video {
  id: string;
  title: string;
  filename: string;
  duration: number;
  file_size?: number;
  created_at: string;
}

interface SponsorVideo {
  video_id: string;
  video_title: string;
  video_duration: number;
  priority: number;
  associated_at: string;
}

@Component({
  selector: 'app-sponsor-videos',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="sponsor-videos-container">
      <!-- Header -->
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          ← Retour au sponsor
        </button>

        <div class="header-content">
          <h1>🎬 Gestion des vidéos - {{ sponsorName }}</h1>
          <button class="btn btn-primary" (click)="openAddModal()">
            ➕ Ajouter des vidéos
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-message">
        <p>❌ {{ error }}</p>
        <button class="btn btn-primary" (click)="loadData()">Réessayer</button>
      </div>

      <!-- Content -->
      <div *ngIf="!loading && !error" class="content">

        <!-- Associated Videos List -->
        <div class="section">
          <div class="section-header">
            <h2>Vidéos associées ({{ sponsorVideos.length }})</h2>
            <p class="section-subtitle">
              Gérez les vidéos sponsors et leur ordre de diffusion
            </p>
          </div>

          <div *ngIf="sponsorVideos.length === 0" class="empty-state">
            <div class="empty-icon">📹</div>
            <h3>Aucune vidéo associée</h3>
            <p>Commencez par ajouter des vidéos à ce sponsor</p>
            <button class="btn btn-primary" (click)="openAddModal()">
              Ajouter des vidéos
            </button>
          </div>

          <div *ngIf="sponsorVideos.length > 0" class="videos-list">
            <div
              *ngFor="let video of sponsorVideos; let i = index"
              class="video-card"
              draggable="true"
              (dragstart)="onDragStart($event, i)"
              (dragover)="onDragOver($event)"
              (drop)="onDrop($event, i)"
              [class.dragging]="draggingIndex === i"
            >
              <div class="drag-handle">
                ⋮⋮
              </div>

              <div class="video-info">
                <div class="video-header">
                  <h3>{{ video.video_title }}</h3>
                  <span class="priority-badge">Priorité: {{ video.priority }}</span>
                </div>
                <div class="video-meta">
                  <span>⏱️ {{ formatDuration(video.video_duration) }}</span>
                  <span>📅 Associée le {{ formatDate(video.associated_at) }}</span>
                </div>
              </div>

              <div class="video-actions">
                <button
                  class="btn-icon"
                  (click)="editPriority(video)"
                  title="Modifier la priorité"
                >
                  ✏️
                </button>
                <button
                  class="btn-icon btn-danger"
                  (click)="removeVideo(video.video_id)"
                  [disabled]="removingId === video.video_id"
                  title="Retirer"
                >
                  {{ removingId === video.video_id ? '...' : '🗑️' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div class="section info-section">
          <h3>💡 Comment ça fonctionne ?</h3>
          <ul class="instructions-list">
            <li>
              <strong>Glisser-déposer</strong> : Réorganisez les vidéos en les faisant glisser pour changer leur priorité
            </li>
            <li>
              <strong>Priorité</strong> : Les vidéos avec la priorité la plus haute (1, 2, 3...) seront diffusées en premier
            </li>
            <li>
              <strong>Association</strong> : Seules les vidéos associées au sponsor seront comptabilisées dans les analytics
            </li>
          </ul>
        </div>
      </div>

      <!-- Add Videos Modal -->
      <div class="modal-overlay" *ngIf="showAddModal" (click)="closeAddModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>➕ Ajouter des vidéos</h2>
            <button class="close-btn" (click)="closeAddModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Search -->
            <div class="search-box">
              <input
                type="text"
                [(ngModel)]="searchTerm"
                (input)="filterAvailableVideos()"
                placeholder="🔍 Rechercher une vidéo..."
              />
            </div>

            <!-- Available Videos List -->
            <div class="available-videos-list">
              <div
                *ngFor="let video of filteredAvailableVideos"
                class="available-video-item"
                [class.selected]="isSelected(video.id)"
                (click)="toggleSelection(video.id)"
              >
                <div class="checkbox">
                  <input
                    type="checkbox"
                    [checked]="isSelected(video.id)"
                    (change)="toggleSelection(video.id)"
                    (click)="$event.stopPropagation()"
                  />
                </div>
                <div class="video-details">
                  <h4>{{ video.title }}</h4>
                  <div class="video-meta-small">
                    <span>{{ video.filename }}</span>
                    <span>⏱️ {{ formatDuration(video.duration) }}</span>
                    <span *ngIf="video.file_size">📦 {{ formatFileSize(video.file_size) }}</span>
                  </div>
                </div>
              </div>

              <div *ngIf="filteredAvailableVideos.length === 0" class="empty-state-small">
                <p *ngIf="searchTerm">Aucune vidéo trouvée pour "{{ searchTerm }}"</p>
                <p *ngIf="!searchTerm">Aucune vidéo disponible</p>
              </div>
            </div>

            <!-- Selected Count -->
            <div class="selection-info" *ngIf="selectedVideoIds.length > 0">
              {{ selectedVideoIds.length }} vidéo(s) sélectionnée(s)
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeAddModal()">
              Annuler
            </button>
            <button
              class="btn btn-primary"
              (click)="addSelectedVideos()"
              [disabled]="selectedVideoIds.length === 0 || adding"
            >
              {{ adding ? 'Ajout...' : 'Ajouter (' + selectedVideoIds.length + ')' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Edit Priority Modal -->
      <div class="modal-overlay" *ngIf="showPriorityModal" (click)="closePriorityModal()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>✏️ Modifier la priorité</h2>
            <button class="close-btn" (click)="closePriorityModal()">✕</button>
          </div>

          <div class="modal-body">
            <p>{{ editingVideo?.video_title }}</p>
            <div class="form-group">
              <label>Priorité (1 = la plus haute)</label>
              <input
                type="number"
                [(ngModel)]="newPriority"
                min="1"
                max="999"
                class="priority-input"
              />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closePriorityModal()">
              Annuler
            </button>
            <button
              class="btn btn-primary"
              (click)="savePriority()"
              [disabled]="updatingPriority"
            >
              {{ updatingPriority ? 'Sauvegarde...' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sponsor-videos-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      margin-bottom: 2rem;
    }

    .back-btn {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.95rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
      transition: color 0.2s;
    }

    .back-btn:hover {
      color: #111827;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2rem;
    }

    .header-content h1 {
      margin: 0;
      font-size: 2rem;
      color: #111827;
    }

    /* Section */
    .section {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 1.5rem;
    }

    .section-header {
      margin-bottom: 1.5rem;
    }

    .section-header h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.5rem;
      color: #111827;
    }

    .section-subtitle {
      margin: 0;
      color: #6b7280;
      font-size: 0.95rem;
    }

    /* Videos List */
    .videos-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .video-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: move;
      transition: all 0.2s;
    }

    .video-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-color: #d1d5db;
    }

    .video-card.dragging {
      opacity: 0.5;
      border-style: dashed;
    }

    .drag-handle {
      color: #9ca3af;
      font-size: 1.25rem;
      cursor: grab;
      user-select: none;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .video-info {
      flex: 1;
    }

    .video-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .video-header h3 {
      margin: 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .priority-badge {
      padding: 0.25rem 0.75rem;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
      white-space: nowrap;
    }

    .video-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
    }

    .video-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-icon {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.25rem;
      padding: 0.5rem;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .btn-icon:hover {
      background: #f3f4f6;
    }

    .btn-icon.btn-danger:hover {
      background: #fee2e2;
    }

    .btn-icon:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Info Section */
    .info-section {
      background: #f9fafb;
    }

    .info-section h3 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .instructions-list {
      margin: 0;
      padding-left: 1.5rem;
      list-style: none;
    }

    .instructions-list li {
      margin-bottom: 0.75rem;
      color: #374151;
      line-height: 1.6;
      position: relative;
    }

    .instructions-list li::before {
      content: "→";
      position: absolute;
      left: -1.5rem;
      color: #2563eb;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: #6b7280;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .empty-state p {
      margin: 0 0 1.5rem 0;
    }

    /* Buttons */
    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      border-radius: 8px;
      max-width: 700px;
      width: 90%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .modal-sm {
      max-width: 450px;
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: #f3f4f6;
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
      flex: 1;
    }

    .modal-actions {
      padding: 1.5rem;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
    }

    /* Search Box */
    .search-box {
      margin-bottom: 1rem;
    }

    .search-box input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    /* Available Videos List */
    .available-videos-list {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 1rem;
    }

    .available-video-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.2s;
    }

    .available-video-item:last-child {
      border-bottom: none;
    }

    .available-video-item:hover {
      background: #f9fafb;
    }

    .available-video-item.selected {
      background: #eff6ff;
    }

    .checkbox {
      display: flex;
      align-items: center;
    }

    .checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .video-details {
      flex: 1;
    }

    .video-details h4 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      color: #111827;
    }

    .video-meta-small {
      display: flex;
      gap: 1rem;
      font-size: 0.85rem;
      color: #6b7280;
    }

    .empty-state-small {
      padding: 2rem;
      text-align: center;
      color: #9ca3af;
    }

    .selection-info {
      padding: 0.75rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      color: #1e40af;
      font-weight: 500;
      text-align: center;
    }

    /* Form Group */
    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
    }

    .priority-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
    }

    .priority-input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    /* Loading & Error */
    .loading, .error-message {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }

    .spinner {
      border: 3px solid #f3f4f6;
      border-top-color: #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #ef4444;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .sponsor-videos-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
        align-items: flex-start;
      }

      .video-card {
        flex-wrap: wrap;
      }

      .video-actions {
        width: 100%;
        justify-content: flex-end;
      }
    }
  `]
})
export class SponsorVideosComponent implements OnInit {
  sponsorId: string = '';
  sponsorName: string = '';

  sponsorVideos: SponsorVideo[] = [];
  availableVideos: Video[] = [];
  filteredAvailableVideos: Video[] = [];

  selectedVideoIds: string[] = [];
  searchTerm: string = '';

  loading = false;
  error = '';
  removingId: string | null = null;
  adding = false;

  showAddModal = false;
  showPriorityModal = false;
  editingVideo: SponsorVideo | null = null;
  newPriority: number = 1;
  updatingPriority = false;

  draggingIndex: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.error = '';

    try {
      // Load sponsor info
      const sponsorResponse = await fetch(`/api/analytics/sponsors/${this.sponsorId}`, {
        credentials: 'include'
      });

      if (!sponsorResponse.ok) {
        throw new Error('Sponsor non trouvé');
      }

      const sponsorData = await sponsorResponse.json();
      this.sponsorName = sponsorData.data.sponsor.name;

      // Load associated videos
      await this.loadSponsorVideos();

      // Load all available videos
      await this.loadAvailableVideos();

    } catch (err: any) {
      this.error = err.message || 'Erreur lors du chargement';
      console.error('Error loading data:', err);
    } finally {
      this.loading = false;
    }
  }

  async loadSponsorVideos() {
    const response = await fetch(`/api/analytics/sponsors/${this.sponsorId}/videos`, {
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      this.sponsorVideos = (data.data.videos || []).sort((a: SponsorVideo, b: SponsorVideo) =>
        a.priority - b.priority
      );
    }
  }

  async loadAvailableVideos() {
    const response = await fetch('/api/videos', { credentials: 'include' });

    if (response.ok) {
      const data = await response.json();
      this.availableVideos = data.data.videos || [];
      this.filteredAvailableVideos = this.availableVideos;
    }
  }

  // Add Modal Functions
  openAddModal() {
    this.showAddModal = true;
    this.selectedVideoIds = [];
    this.searchTerm = '';
    this.filterAvailableVideos();
  }

  closeAddModal() {
    this.showAddModal = false;
    this.selectedVideoIds = [];
    this.searchTerm = '';
  }

  filterAvailableVideos() {
    const term = this.searchTerm.toLowerCase();
    const associatedIds = new Set(this.sponsorVideos.map(v => v.video_id));

    this.filteredAvailableVideos = this.availableVideos.filter(video => {
      const matchesSearch = video.title.toLowerCase().includes(term) ||
                          video.filename.toLowerCase().includes(term);
      const notAssociated = !associatedIds.has(video.id);
      return matchesSearch && notAssociated;
    });
  }

  isSelected(videoId: string): boolean {
    return this.selectedVideoIds.includes(videoId);
  }

  toggleSelection(videoId: string) {
    const index = this.selectedVideoIds.indexOf(videoId);
    if (index === -1) {
      this.selectedVideoIds.push(videoId);
    } else {
      this.selectedVideoIds.splice(index, 1);
    }
  }

  async addSelectedVideos() {
    if (this.selectedVideoIds.length === 0) return;

    this.adding = true;

    try {
      const response = await fetch(`/api/analytics/sponsors/${this.sponsorId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ video_ids: this.selectedVideoIds })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'ajout des vidéos');
      }

      await this.loadSponsorVideos();
      this.closeAddModal();

    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'ajout');
      console.error('Error adding videos:', err);
    } finally {
      this.adding = false;
    }
  }

  // Remove Video
  async removeVideo(videoId: string) {
    if (!confirm('Retirer cette vidéo du sponsor ?')) {
      return;
    }

    this.removingId = videoId;

    try {
      const response = await fetch(
        `/api/analytics/sponsors/${this.sponsorId}/videos/${videoId}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      this.sponsorVideos = this.sponsorVideos.filter(v => v.video_id !== videoId);

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression');
      console.error('Error removing video:', err);
    } finally {
      this.removingId = null;
    }
  }

  // Priority Modal
  editPriority(video: SponsorVideo) {
    this.editingVideo = video;
    this.newPriority = video.priority;
    this.showPriorityModal = true;
  }

  closePriorityModal() {
    this.showPriorityModal = false;
    this.editingVideo = null;
  }

  async savePriority() {
    if (!this.editingVideo) return;

    this.updatingPriority = true;

    try {
      const response = await fetch(
        `/api/analytics/sponsors/${this.sponsorId}/videos/${this.editingVideo.video_id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ priority: this.newPriority })
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      await this.loadSponsorVideos();
      this.closePriorityModal();

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la sauvegarde');
      console.error('Error updating priority:', err);
    } finally {
      this.updatingPriority = false;
    }
  }

  // Drag and Drop
  onDragStart(event: DragEvent, index: number) {
    this.draggingIndex = index;
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  async onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();

    if (this.draggingIndex === null || this.draggingIndex === targetIndex) {
      this.draggingIndex = null;
      return;
    }

    // Reorder array
    const movedVideo = this.sponsorVideos[this.draggingIndex];
    this.sponsorVideos.splice(this.draggingIndex, 1);
    this.sponsorVideos.splice(targetIndex, 0, movedVideo);

    // Update priorities
    this.sponsorVideos.forEach((video, index) => {
      video.priority = index + 1;
    });

    this.draggingIndex = null;

    // Save new order to backend
    await this.saveOrder();
  }

  async saveOrder() {
    try {
      const updates = this.sponsorVideos.map(video => ({
        video_id: video.video_id,
        priority: video.priority
      }));

      const response = await fetch(
        `/api/analytics/sponsors/${this.sponsorId}/videos/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ videos: updates })
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde de l\'ordre');
      }

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la réorganisation');
      console.error('Error saving order:', err);
      await this.loadSponsorVideos(); // Reload to restore correct state
    }
  }

  goBack() {
    this.router.navigate(['/sponsors', this.sponsorId]);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatFileSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return mb > 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }
}
