import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';

interface ClubPermission {
  key: string;
  granted: boolean;
  granted_at: string | null;
}

interface ClubUser {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  last_login_at: string | null;
}

interface EditDraft {
  email: string;
  full_name: string;
  status: string;
}

const PERMISSION_LABELS: Record<string, { fr: string; icon: string }> = {
  view_status: { fr: 'Voir le statut du boîtier', icon: '📡' },
  view_content: { fr: 'Voir le contenu', icon: '👁️' },
  upload_video: { fr: 'Uploader des vidéos', icon: '📤' },
  edit_loop: { fr: 'Modifier la boucle', icon: '🔄' },
  manage_sponsors: { fr: 'Gérer les sponsors', icon: '💼' },
  view_analytics: { fr: 'Voir les analytics', icon: '📈' },
};

@Component({
  selector: 'app-club-access-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="club-access-tab">
      <h3>Accès club</h3>
      <p class="description">Gérez les comptes club et les permissions pour ce site.</p>

      <!-- Existing club users list -->
      <div class="section" *ngIf="clubUsers.length > 0">
        <h4>Comptes club ({{ clubUsers.length }})</h4>
        <div class="user-card" *ngFor="let user of clubUsers">
          <ng-container *ngIf="editingId !== user.id">
            <div class="user-info">
              <strong>{{ user.full_name || user.email }}</strong>
              <span class="email">{{ user.email }}</span>
              <span class="badge" [class.active]="user.status === 'active'" [class.inactive]="user.status !== 'active'">
                {{ user.status }}
              </span>
            </div>
            <div class="user-actions">
              <button class="btn btn-sm btn-secondary" (click)="startEdit(user)">Modifier</button>
              <button class="btn btn-sm btn-secondary" (click)="startResetPassword(user)">Reset mot de passe</button>
              <button class="btn btn-sm btn-danger" (click)="deleteClubUser(user)">Supprimer</button>
            </div>
          </ng-container>

          <ng-container *ngIf="editingId === user.id && editDraft">
            <div class="form-row">
              <div class="form-group">
                <label>Email</label>
                <input type="email" [(ngModel)]="editDraft.email" />
              </div>
              <div class="form-group">
                <label>Nom complet</label>
                <input type="text" [(ngModel)]="editDraft.full_name" />
              </div>
              <div class="form-group">
                <label>Statut</label>
                <select [(ngModel)]="editDraft.status">
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="suspended">suspended</option>
                </select>
              </div>
            </div>
            <div class="user-actions">
              <button class="btn btn-sm btn-primary" (click)="saveEdit(user)">Enregistrer</button>
              <button class="btn btn-sm btn-secondary" (click)="cancelEdit()">Annuler</button>
            </div>
          </ng-container>

          <ng-container *ngIf="resetPasswordId === user.id">
            <div class="form-row">
              <div class="form-group">
                <label>Nouveau mot de passe (min. 8 caractères)</label>
                <input type="password" [(ngModel)]="newPasswordValue" />
              </div>
            </div>
            <div class="user-actions">
              <button class="btn btn-sm btn-primary" [disabled]="newPasswordValue.length < 8" (click)="confirmResetPassword(user)">Valider</button>
              <button class="btn btn-sm btn-secondary" (click)="cancelResetPassword()">Annuler</button>
            </div>
          </ng-container>
        </div>
      </div>

      <!-- Create club user form (always available) -->
      <div class="section" *ngIf="!loading">
        <h4>Ajouter un compte club</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Email</label>
            <input type="email" [(ngModel)]="newUserEmail" placeholder="club@exemple.fr" />
          </div>
          <div class="form-group">
            <label>Nom complet</label>
            <input type="text" [(ngModel)]="newUserName" placeholder="Responsable du club" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" [(ngModel)]="newUserPassword" placeholder="Min. 8 caractères" />
          </div>
        </div>
        <button class="btn btn-primary" [disabled]="!canCreate()" (click)="createClubUser()">
          Créer le compte
        </button>
      </div>

      <!-- Permissions -->
      <div class="section" *ngIf="permissions.length > 0">
        <h4>Permissions</h4>
        <p class="hint">Ces permissions s'appliquent à tous les comptes club de ce site.</p>
        <div class="permissions-grid">
          <label class="permission-item" *ngFor="let perm of permissions">
            <input type="checkbox" [(ngModel)]="perm.granted" (change)="onPermissionToggle()" />
            <span class="perm-icon">{{ getPermLabel(perm.key).icon }}</span>
            <span class="perm-label">{{ getPermLabel(perm.key).fr }}</span>
          </label>
        </div>
        <button class="btn btn-primary btn-sm" [disabled]="!permissionsDirty" (click)="savePermissions()">
          Sauvegarder les permissions
        </button>
      </div>

      <div class="loading" *ngIf="loading">Chargement...</div>
    </div>
  `,
  styles: [`
    .club-access-tab { padding: 1rem 0; }
    .description { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .hint { color: #64748b; font-size: 0.8rem; margin: 0 0 0.75rem; }

    .section { margin-bottom: 2rem; }
    .section h4 { font-size: 1rem; margin: 0 0 1rem; color: #334155; }

    .user-card {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;
      padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 0.75rem;
    }
    .user-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .email { color: #64748b; font-size: 0.875rem; }
    .badge { font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 12px; width: fit-content; }
    .badge.active { background: #dcfce7; color: #166534; }
    .badge.inactive { background: #fee2e2; color: #991b1b; }
    .user-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

    .form-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; width: 100%; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .form-group label { font-size: 0.875rem; font-weight: 500; color: #334155; }
    .form-group input, .form-group select {
      padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem;
    }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--neo-hockey-dark, #2022E9); box-shadow: 0 0 0 2px rgba(32,34,233,0.1); }

    .permissions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem; margin-bottom: 1rem; }
    .permission-item {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 6px; cursor: pointer;
      border: 1px solid #e2e8f0; transition: background 0.15s;
    }
    .permission-item:hover { background: #f1f5f9; }
    .perm-icon { font-size: 1.1rem; }
    .perm-label { font-size: 0.875rem; }

    .btn { padding: 0.5rem 1rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .btn-primary { background: var(--neo-hockey-dark, #2022E9); color: white; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-sm { font-size: 0.875rem; padding: 0.375rem 0.75rem; }

    .loading { color: #64748b; padding: 1rem; }
  `]
})
export class ClubAccessTabComponent implements OnInit, OnChanges {
  @Input() siteId = '';

  private readonly api = inject(ApiService);
  private readonly notification = inject(NotificationService);

  clubUsers: ClubUser[] = [];
  permissions: ClubPermission[] = [];
  permissionsDirty = false;
  loading = true;

  newUserEmail = '';
  newUserName = '';
  newUserPassword = '';

  editingId: string | null = null;
  editDraft: EditDraft | null = null;

  resetPasswordId: string | null = null;
  newPasswordValue = '';

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.loadData();
    }
  }

  private loadData(): void {
    if (!this.siteId) return;
    this.loading = true;

    this.api.get<{ permissions: ClubPermission[] }>(`/sites/${this.siteId}/club-permissions`).subscribe({
      next: (data) => { this.permissions = data.permissions; },
      error: () => { this.permissions = []; }
    });

    this.api.get<{ success: boolean; data: { users: ClubUser[] } }>(`/users?role=club&site_id=${this.siteId}`).subscribe({
      next: (res) => {
        this.clubUsers = res.data?.users ?? [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  getPermLabel(key: string): { fr: string; icon: string } {
    return PERMISSION_LABELS[key] || { fr: key, icon: '⚙️' };
  }

  onPermissionToggle(): void {
    this.permissionsDirty = true;
  }

  canCreate(): boolean {
    return this.newUserEmail.includes('@') && this.newUserPassword.length >= 8;
  }

  createClubUser(): void {
    this.api.post('/users', {
      email: this.newUserEmail,
      full_name: this.newUserName || null,
      password: this.newUserPassword,
      role: 'club',
      site_id: this.siteId,
    }).subscribe({
      next: () => {
        this.notification.success('Compte club créé');
        this.newUserEmail = '';
        this.newUserName = '';
        this.newUserPassword = '';
        this.loadData();
      },
      error: (err) => {
        this.notification.error(err?.error?.error || 'Erreur lors de la création');
      }
    });
  }

  startEdit(user: ClubUser): void {
    this.cancelResetPassword();
    this.editingId = user.id;
    this.editDraft = {
      email: user.email,
      full_name: user.full_name ?? '',
      status: user.status,
    };
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editDraft = null;
  }

  saveEdit(user: ClubUser): void {
    if (!this.editDraft) return;
    const payload: Record<string, string> = {
      email: this.editDraft.email,
      status: this.editDraft.status,
    };
    if (this.editDraft.full_name) {
      payload['full_name'] = this.editDraft.full_name;
    }
    this.api.put(`/users/${user.id}`, payload).subscribe({
      next: () => {
        this.notification.success('Compte mis à jour');
        this.cancelEdit();
        this.loadData();
      },
      error: (err) => {
        this.notification.error(err?.error?.error || 'Erreur lors de la mise à jour');
      }
    });
  }

  startResetPassword(user: ClubUser): void {
    this.cancelEdit();
    this.resetPasswordId = user.id;
    this.newPasswordValue = '';
  }

  cancelResetPassword(): void {
    this.resetPasswordId = null;
    this.newPasswordValue = '';
  }

  confirmResetPassword(user: ClubUser): void {
    if (this.newPasswordValue.length < 8) return;
    this.api.post(`/users/${user.id}/reset-password`, { new_password: this.newPasswordValue }).subscribe({
      next: () => {
        this.notification.success('Mot de passe réinitialisé');
        this.cancelResetPassword();
      },
      error: (err) => {
        this.notification.error(err?.error?.error || 'Erreur lors de la réinitialisation');
      }
    });
  }

  deleteClubUser(user: ClubUser): void {
    if (!confirm(`Supprimer le compte ${user.email} ?`)) return;
    this.api.delete(`/users/${user.id}`).subscribe({
      next: () => {
        this.notification.success('Compte club supprimé');
        this.loadData();
      },
      error: (err) => {
        this.notification.error(err?.error?.error || 'Erreur lors de la suppression');
      }
    });
  }

  savePermissions(): void {
    const granted = this.permissions.filter(p => p.granted).map(p => p.key);
    this.api.put(`/sites/${this.siteId}/club-permissions`, { permissions: granted }).subscribe({
      next: () => {
        this.notification.success('Permissions mises à jour');
        this.permissionsDirty = false;
      },
      error: (err) => {
        this.notification.error(err?.error?.error || 'Erreur lors de la sauvegarde');
      }
    });
  }
}
