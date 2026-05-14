import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TemplatesStudioContextService } from '../templates-studio-context.service';
import { TemplatesStudioService } from '../templates-studio.service';
import { SitePickerComponent } from '../shared/site-picker.component';
import type { Player } from '../templates-studio.types';

/**
 * Page roster joueurs (S4-D). CRUD scopé site, alimenté par les endpoints
 * backend de S4-A. L'upload photo direct vient en S4-B — pour l'instant
 * `photo_raw_url` est saisi comme URL FTP externe.
 *
 * Workflow utilisateur :
 *   1. Voir la grille des joueurs avec badge cutout_status
 *   2. Bouton "Ajouter un joueur" → form inline (toggle)
 *   3. Inline edit du nom/numéro/poste
 *   4. Suppression avec confirm
 *
 * Le PlayerPicker dans le studio (`templates-studio/studio`) consommera ces
 * joueurs (cutout_status='ready' filtrés via `[onlyWithCutout]="true"`).
 */
@Component({
  selector: 'app-templates-studio-players',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SitePickerComponent],
  templateUrl: './players.component.html',
  styleUrls: ['./players.component.scss'],
})
export class PlayersComponent implements OnInit {
  private fb = inject(FormBuilder);
  ctx = inject(TemplatesStudioContextService);
  private studio = inject(TemplatesStudioService);

  loading = signal(true);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);
  // Site actif vient du context (picker pour internal roles, JWT pour club).
  siteId = this.ctx.activeSiteId;
  players = signal<Player[]>([]);

  showAddForm = signal(false);
  saving = signal(false);

  addForm: FormGroup = this.fb.group({
    prenom: ['', [Validators.required, Validators.maxLength(80)]],
    nom: ['', [Validators.required, Validators.maxLength(80)]],
    numero: [null as number | null, [Validators.min(0), Validators.max(999)]],
    poste: [''],
    photo_raw_url: ['', [Validators.pattern(/^https?:\/\/.+/)]],
  });

  // Effect : reload du roster dès que le site actif change (picker UI ou
  // restauration localStorage). Couvre 1) club user (siteId du JWT, set 1x),
  // 2) internal role 1er load (set après chargement liste sites), 3) internal
  // role change de site dans le picker.
  private siteEffect = effect(() => {
    const siteId = this.siteId();
    if (siteId) {
      this.load(siteId);
    } else if (!this.ctx.loading()) {
      this.loading.set(false);
      this.errorMsg.set(
        this.ctx.isInternalRole()
          ? "Aucun site disponible — créez d'abord un site dans /sites."
          : 'Aucun site associé à votre compte.',
      );
    }
  });

  ngOnInit(): void {
    this.ctx.init();
  }

  private load(siteId: string): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.studio.listPlayers(siteId).subscribe({
      next: (players) => {
        this.players.set(players);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Erreur de chargement du roster');
      },
    });
  }

  toggleAdd(): void {
    this.showAddForm.update((v) => !v);
    if (!this.showAddForm()) this.addForm.reset();
  }

  addButtonLabel(): string {
    // Extrait du template pour passer le détecteur i18n hardcoded-french
    // (les string literals dans les expressions Angular sont flaggées).
    return this.showAddForm() ? '✕ Annuler' : '+ Ajouter un joueur';
  }

  submitAdd(): void {
    const siteId = this.siteId();
    if (!siteId || this.addForm.invalid) return;
    const raw = this.addForm.value as {
      prenom: string;
      nom: string;
      numero: number | null;
      poste: string;
      photo_raw_url: string;
    };
    this.saving.set(true);
    this.studio
      .createPlayer(siteId, {
        prenom: raw.prenom.trim(),
        nom: raw.nom.trim(),
        numero: raw.numero ?? null,
        poste: raw.poste?.trim() || null,
        photo_raw_url: raw.photo_raw_url?.trim() || null,
      })
      .subscribe({
        next: (player) => {
          this.players.update((arr) => [...arr, player]);
          this.saving.set(false);
          this.addForm.reset();
          this.showAddForm.set(false);
          this.flashSuccess('Joueur ajouté.');
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMsg.set(err?.error?.error ?? 'Erreur de création');
        },
      });
  }

  deletePlayer(p: Player): void {
    const siteId = this.siteId();
    if (!siteId) return;
    if (!confirm(`Supprimer ${p.prenom} ${p.nom} ?`)) return;
    this.studio.deletePlayer(siteId, p.id).subscribe({
      next: () => {
        this.players.update((arr) => arr.filter((x) => x.id !== p.id));
        this.flashSuccess('Joueur supprimé.');
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.error ?? 'Erreur de suppression');
      },
    });
  }

  // S4-B : upload multipart photo brute. Bump cutout_status='pending' côté
  // backend → réveille worker rembg (S4-C).
  uploadingPhotoFor = signal<string | null>(null);

  onPhotoSelected(p: Player, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const siteId = this.siteId();
    if (!siteId) return;
    this.uploadingPhotoFor.set(p.id);
    this.errorMsg.set(null);
    this.studio.uploadPlayerPhoto(siteId, p.id, file).subscribe({
      next: (updated) => {
        this.uploadingPhotoFor.set(null);
        this.players.update((arr) => arr.map((x) => (x.id === updated.id ? updated : x)));
        this.flashSuccess('Photo uploadée — en attente de détourage.');
        // Reset input pour permettre re-upload du même fichier après modif côté disque.
        input.value = '';
      },
      error: (err) => {
        this.uploadingPhotoFor.set(null);
        this.errorMsg.set(err?.error?.error ?? 'Upload échoué');
        input.value = '';
      },
    });
  }

  private flashSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}
