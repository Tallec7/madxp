import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface Sponsor {
  id: string;
  name: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  status: 'active' | 'inactive' | 'paused';
  contract_start?: string;
  contract_end?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface SponsorVideo {
  video_id: string;
  video_title: string;
  video_duration: number;
  priority: number;
  associated_at: string;
  total_impressions?: number;
  total_screen_time?: number;
}

@Component({
  selector: 'app-sponsor-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="sponsor-detail-container">
      <!-- Header -->
      <div class="header">
        <button class="back-btn" (click)="goBack()">
          ← Retour aux sponsors
        </button>

        <div class="header-content" *ngIf="sponsor">
          <div class="sponsor-header">
            <img
              *ngIf="sponsor.logo_url"
              [src]="sponsor.logo_url"
              [alt]="sponsor.name"
              class="sponsor-logo-large"
              (error)="onLogoError($event)"
            />
            <div class="sponsor-info">
              <h1>{{ sponsor.name }}</h1>
              <span class="status-badge" [class]="'status-' + sponsor.status">
                {{ getStatusLabel(sponsor.status) }}
              </span>
            </div>
          </div>

          <div class="header-actions">
            <button class="btn btn-secondary" (click)="editSponsor()">
              ✏️ Éditer
            </button>
            <button class="btn btn-danger" (click)="confirmDelete()">
              🗑️ Supprimer
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="tabs-nav">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'info'"
          (click)="activeTab = 'info'"
        >
          📋 Informations
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'videos'"
          (click)="activeTab = 'videos'"
        >
          🎬 Vidéos ({{ sponsorVideos.length }})
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab === 'analytics'"
          (click)="activeTab = 'analytics'"
        >
          📊 Analytics
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="error-message">
        <p>❌ {{ error }}</p>
        <button class="btn btn-primary" (click)="loadSponsorData()">Réessayer</button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content" *ngIf="!loading && !error && sponsor">

        <!-- Info Tab -->
        <div *ngIf="activeTab === 'info'" class="info-tab">
          <div class="info-grid">
            <div class="info-card">
              <h3>📞 Contact</h3>
              <div class="info-row">
                <span class="label">Email:</span>
                <span class="value">{{ sponsor.contact_email || 'Non renseigné' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Téléphone:</span>
                <span class="value">{{ sponsor.contact_phone || 'Non renseigné' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Site web:</span>
                <a *ngIf="sponsor.website" [href]="sponsor.website" target="_blank" class="value link">
                  {{ sponsor.website }}
                </a>
                <span *ngIf="!sponsor.website" class="value">Non renseigné</span>
              </div>
            </div>

            <div class="info-card">
              <h3>📅 Contrat</h3>
              <div class="info-row">
                <span class="label">Début:</span>
                <span class="value">{{ formatDate(sponsor.contract_start) || 'Non défini' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Fin:</span>
                <span class="value">{{ formatDate(sponsor.contract_end) || 'Non défini' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Statut:</span>
                <span class="status-badge" [class]="'status-' + sponsor.status">
                  {{ getStatusLabel(sponsor.status) }}
                </span>
              </div>
            </div>

            <div class="info-card full-width">
              <h3>📝 Notes</h3>
              <p class="notes">{{ sponsor.notes || 'Aucune note' }}</p>
            </div>

            <div class="info-card">
              <h3>🕐 Métadonnées</h3>
              <div class="info-row">
                <span class="label">Créé le:</span>
                <span class="value">{{ formatDateTime(sponsor.created_at) }}</span>
              </div>
              <div class="info-row">
                <span class="label">Modifié le:</span>
                <span class="value">{{ formatDateTime(sponsor.updated_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Videos Tab -->
        <div *ngIf="activeTab === 'videos'" class="videos-tab">
          <div class="videos-header">
            <h2>Vidéos associées ({{ sponsorVideos.length }})</h2>
            <button class="btn btn-primary" (click)="openAddVideosModal()">
              ➕ Ajouter des vidéos
            </button>
          </div>

          <div *ngIf="sponsorVideos.length === 0" class="empty-state">
            <p>Aucune vidéo associée à ce sponsor</p>
            <button class="btn btn-primary" (click)="openAddVideosModal()">
              Ajouter des vidéos
            </button>
          </div>

          <div *ngIf="sponsorVideos.length > 0" class="videos-list">
            <div *ngFor="let video of sponsorVideos" class="video-item">
              <div class="video-info">
                <h4>{{ video.video_title }}</h4>
                <div class="video-meta">
                  <span>⏱️ {{ formatDuration(video.video_duration) }}</span>
                  <span>📊 {{ video.total_impressions || 0 }} impressions</span>
                  <span>🕐 {{ formatDuration(video.total_screen_time || 0) }} temps écran</span>
                  <span>🔢 Priorité: {{ video.priority }}</span>
                </div>
                <div class="video-date">
                  Associée le {{ formatDate(video.associated_at) }}
                </div>
              </div>
              <div class="video-actions">
                <button
                  class="btn btn-sm btn-danger"
                  (click)="removeVideo(video.video_id)"
                  [disabled]="removingVideo === video.video_id"
                >
                  {{ removingVideo === video.video_id ? 'Suppression...' : '🗑️ Retirer' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Analytics Tab -->
        <div *ngIf="activeTab === 'analytics'" class="analytics-tab">
          <div class="analytics-redirect">
            <h2>📊 Analytics Détaillées</h2>
            <p>Accédez au dashboard analytics complet pour ce sponsor</p>
            <button
              class="btn btn-primary btn-large"
              (click)="navigateToAnalytics()"
            >
              Voir le Dashboard Analytics →
            </button>

            <div class="quick-stats" *ngIf="quickStats">
              <h3>Aperçu Rapide</h3>
              <div class="stats-grid">
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.total_impressions?.toLocaleString() || 0 }}</span>
                  <span class="stat-label">Impressions totales</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ formatDuration(quickStats.total_screen_time || 0) }}</span>
                  <span class="stat-label">Temps écran total</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.completion_rate?.toFixed(1) || 0 }}%</span>
                  <span class="stat-label">Taux de complétion</span>
                </div>
                <div class="stat-card">
                  <span class="stat-value">{{ quickStats.unique_sites || 0 }}</span>
                  <span class="stat-label">Sites actifs</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <div class="modal-overlay" *ngIf="showEditModal" (click)="closeEditModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>✏️ Modifier le sponsor</h2>
            <button class="close-btn" (click)="closeEditModal()">✕</button>
          </div>

          <form (submit)="saveEdit($event)" class="modal-form">
            <div class="form-group">
              <label>Nom *</label>
              <input
                type="text"
                [(ngModel)]="editForm.name"
                name="name"
                required
                placeholder="Nom du sponsor"
              />
            </div>

            <div class="form-group">
              <label>Logo URL</label>
              <input
                type="url"
                [(ngModel)]="editForm.logo_url"
                name="logo_url"
                placeholder="https://..."
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Email de contact</label>
                <input
                  type="email"
                  [(ngModel)]="editForm.contact_email"
                  name="contact_email"
                  placeholder="contact@sponsor.com"
                />
              </div>

              <div class="form-group">
                <label>Téléphone</label>
                <input
                  type="tel"
                  [(ngModel)]="editForm.contact_phone"
                  name="contact_phone"
                  placeholder="+33 1 23 45 67 89"
                />
              </div>
            </div>

            <div class="form-group">
              <label>Site web</label>
              <input
                type="url"
                [(ngModel)]="editForm.website"
                name="website"
                placeholder="https://www.sponsor.com"
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Début du contrat</label>
                <input
                  type="date"
                  [(ngModel)]="editForm.contract_start"
                  name="contract_start"
                />
              </div>

              <div class="form-group">
                <label>Fin du contrat</label>
                <input
                  type="date"
                  [(ngModel)]="editForm.contract_end"
                  name="contract_end"
                />
              </div>
            </div>

            <div class="form-group">
              <label>Statut</label>
              <select [(ngModel)]="editForm.status" name="status">
                <option value="active">Actif</option>
                <option value="paused">En pause</option>
                <option value="inactive">Inactif</option>
              </select>
            </div>

            <div class="form-group">
              <label>Notes</label>
              <textarea
                [(ngModel)]="editForm.notes"
                name="notes"
                rows="4"
                placeholder="Notes internes sur ce sponsor..."
              ></textarea>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" (click)="closeEditModal()">
                Annuler
              </button>
              <button type="submit" class="btn btn-primary" [disabled]="saving">
                {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div class="modal-overlay" *ngIf="showDeleteModal" (click)="closeDeleteModal()">
        <div class="modal modal-sm" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>⚠️ Confirmer la suppression</h2>
            <button class="close-btn" (click)="closeDeleteModal()">✕</button>
          </div>

          <div class="modal-body">
            <p>Êtes-vous sûr de vouloir supprimer le sponsor <strong>{{ sponsor?.name }}</strong> ?</p>
            <p class="warning">Cette action est irréversible et supprimera également toutes les associations avec les vidéos.</p>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="closeDeleteModal()">
              Annuler
            </button>
            <button class="btn btn-danger" (click)="deleteSponsor()" [disabled]="deleting">
              {{ deleting ? 'Suppression...' : 'Supprimer définitivement' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sponsor-detail-container {
      padding: 2rem;
      max-width: 1400px;
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
      align-items: flex-start;
      gap: 2rem;
    }

    .sponsor-header {
      display: flex;
      gap: 1.5rem;
      align-items: center;
      flex: 1;
    }

    .sponsor-logo-large {
      width: 100px;
      height: 100px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 0.5rem;
      background: white;
    }

    .sponsor-info h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
      color: #111827;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Tabs */
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 2rem;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 1rem 1.5rem;
      cursor: pointer;
      font-size: 0.95rem;
      color: #6b7280;
      border-bottom: 3px solid transparent;
      transition: all 0.2s;
      margin-bottom: -2px;
    }

    .tab-btn:hover {
      color: #111827;
      background: #f9fafb;
    }

    .tab-btn.active {
      color: #2563eb;
      border-bottom-color: #2563eb;
      font-weight: 500;
    }

    /* Tab Content */
    .tab-content {
      min-height: 400px;
    }

    /* Info Tab */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .info-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
    }

    .info-card.full-width {
      grid-column: 1 / -1;
    }

    .info-card h3 {
      margin: 0 0 1rem 0;
      font-size: 1.1rem;
      color: #111827;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row .label {
      color: #6b7280;
      font-weight: 500;
    }

    .info-row .value {
      color: #111827;
    }

    .info-row .value.link {
      color: #2563eb;
      text-decoration: none;
    }

    .info-row .value.link:hover {
      text-decoration: underline;
    }

    .notes {
      color: #374151;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    /* Videos Tab */
    .videos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .videos-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }

    .videos-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .video-item {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      transition: box-shadow 0.2s;
    }

    .video-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .video-info {
      flex: 1;
    }

    .video-info h4 {
      margin: 0 0 0.5rem 0;
      color: #111827;
    }

    .video-meta {
      display: flex;
      gap: 1.5rem;
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }

    .video-date {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    /* Analytics Tab */
    .analytics-redirect {
      text-align: center;
      padding: 3rem 2rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .analytics-redirect h2 {
      margin: 0 0 1rem 0;
      font-size: 1.75rem;
    }

    .analytics-redirect p {
      color: #6b7280;
      margin-bottom: 2rem;
    }

    .btn-large {
      padding: 1rem 2rem;
      font-size: 1.1rem;
    }

    .quick-stats {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #e5e7eb;
    }

    .quick-stats h3 {
      margin: 0 0 1.5rem 0;
      font-size: 1.2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
      text-align: center;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 600;
      color: #2563eb;
    }

    .stat-label {
      color: #6b7280;
      font-size: 0.9rem;
    }

    /* Status badges */
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .status-active {
      background: #d1fae5;
      color: #065f46;
    }

    .status-paused {
      background: #fef3c7;
      color: #92400e;
    }

    .status-inactive {
      background: #f3f4f6;
      color: #6b7280;
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

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Loading & Error */
    .loading, .error-message, .empty-state {
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
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
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
    }

    .modal-body .warning {
      color: #dc2626;
      font-size: 0.9rem;
      margin-top: 1rem;
    }

    .modal-form {
      padding: 1.5rem;
    }

    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.9rem;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.95rem;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .modal-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    @media (max-width: 768px) {
      .sponsor-detail-container {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
      }

      .info-grid {
        grid-template-columns: 1fr;
      }

      .form-row {
        grid-template-columns: 1fr;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class SponsorDetailComponent implements OnInit {
  sponsorId: string = '';
  sponsor: Sponsor | null = null;
  sponsorVideos: SponsorVideo[] = [];
  quickStats: any = null;

  activeTab: 'info' | 'videos' | 'analytics' = 'info';
  loading = false;
  error = '';

  showEditModal = false;
  showDeleteModal = false;
  saving = false;
  deleting = false;
  removingVideo: string | null = null;

  editForm: Partial<Sponsor> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.sponsorId = this.route.snapshot.params['id'];
    this.loadSponsorData();
  }

  async loadSponsorData() {
    this.loading = true;
    this.error = '';

    try {
      // Load sponsor details
      const sponsorResponse = await fetch(`/api/analytics/sponsors/${this.sponsorId}`, {
        credentials: 'include'
      });

      if (!sponsorResponse.ok) {
        throw new Error('Sponsor non trouvé');
      }

      const sponsorData = await sponsorResponse.json();
      this.sponsor = sponsorData.data.sponsor;

      // Load associated videos
      const videosResponse = await fetch(`/api/analytics/sponsors/${this.sponsorId}/videos`, {
        credentials: 'include'
      });

      if (videosResponse.ok) {
        const videosData = await videosResponse.json();
        this.sponsorVideos = videosData.data.videos || [];
      }

      // Load quick stats (last 30 days)
      const statsResponse = await fetch(
        `/api/analytics/sponsors/${this.sponsorId}/stats?days=30`,
        { credentials: 'include' }
      );

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        this.quickStats = statsData.data.summary;
      }

    } catch (err: any) {
      this.error = err.message || 'Erreur lors du chargement des données';
      console.error('Error loading sponsor data:', err);
    } finally {
      this.loading = false;
    }
  }

  goBack() {
    this.router.navigate(['/sponsors']);
  }

  navigateToAnalytics() {
    this.router.navigate(['/sponsors', this.sponsorId, 'analytics']);
  }

  // Edit Functions
  editSponsor() {
    this.editForm = { ...this.sponsor! };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editForm = {};
  }

  async saveEdit(event: Event) {
    event.preventDefault();
    this.saving = true;

    try {
      const response = await fetch(`/api/analytics/sponsors/${this.sponsorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(this.editForm)
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      const data = await response.json();
      this.sponsor = data.data.sponsor;
      this.closeEditModal();

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la sauvegarde');
      console.error('Error saving sponsor:', err);
    } finally {
      this.saving = false;
    }
  }

  // Delete Functions
  confirmDelete() {
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
  }

  async deleteSponsor() {
    this.deleting = true;

    try {
      const response = await fetch(`/api/analytics/sponsors/${this.sponsorId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      // Redirect to list
      this.router.navigate(['/sponsors']);

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression');
      console.error('Error deleting sponsor:', err);
    } finally {
      this.deleting = false;
    }
  }

  // Video Management
  openAddVideosModal() {
    // TODO: Implement add videos modal
    alert('Fonctionnalité en développement - utilisez le composant sponsor-videos');
  }

  async removeVideo(videoId: string) {
    if (!confirm('Retirer cette vidéo du sponsor ?')) {
      return;
    }

    this.removingVideo = videoId;

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

      // Remove from local list
      this.sponsorVideos = this.sponsorVideos.filter(v => v.video_id !== videoId);

    } catch (err: any) {
      alert(err.message || 'Erreur lors de la suppression');
      console.error('Error removing video:', err);
    } finally {
      this.removingVideo = null;
    }
  }

  // Utility Functions
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Actif',
      paused: 'En pause',
      inactive: 'Inactif'
    };
    return labels[status] || status;
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  onLogoError(event: any) {
    event.target.src = '/assets/placeholder-logo.png';
  }
}
