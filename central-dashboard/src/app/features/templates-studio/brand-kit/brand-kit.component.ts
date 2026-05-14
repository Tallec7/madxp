import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TemplatesStudioContextService } from '../templates-studio-context.service';
import { TemplatesStudioService } from '../templates-studio.service';
import { SitePickerComponent } from '../shared/site-picker.component';
import type { BrandKit, BrandKitUpsertInput } from '../templates-studio.types';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

@Component({
  selector: 'app-templates-studio-brand-kit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SitePickerComponent],
  templateUrl: './brand-kit.component.html',
  styleUrls: ['./brand-kit.component.scss'],
})
export class BrandKitComponent implements OnInit {
  private fb = inject(FormBuilder);
  ctx = inject(TemplatesStudioContextService);
  private studio = inject(TemplatesStudioService);

  // État UI signals — Angular 20 style.
  loading = signal(true);
  saving = signal(false);
  uploadingLogo = signal(false);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  // Limites mirroir backend (S3.1 multer config).
  readonly maxLogoSizeBytes = 2 * 1024 * 1024;
  readonly allowedLogoMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  readonly logoAcceptAttr = '.jpg,.jpeg,.png,.webp,.svg,image/jpeg,image/png,image/webp,image/svg+xml';
  // Site actif vient du context partagé : picker pour internal roles, JWT pour club.
  siteId = this.ctx.activeSiteId;

  form: FormGroup = this.fb.group({
    club_name: [''],
    colors: this.fb.group({
      primary: ['', [Validators.pattern(HEX_PATTERN)]],
      secondary: ['', [Validators.pattern(HEX_PATTERN)]],
      accent: ['', [Validators.pattern(HEX_PATTERN)]],
    }),
    logos: this.fb.group({
      primary: [''],
    }),
    fonts: this.fb.group({
      display: [''],
      body: [''],
    }),
  });

  // Effect : reload du brand kit dès que le site actif change (picker UI ou
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
    this.studio.getBrandKit(siteId).subscribe({
      next: (kit) => {
        this.patchForm(kit);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Erreur de chargement du brand kit');
      },
    });
  }

  private patchForm(kit: BrandKit): void {
    this.form.patchValue({
      club_name: kit.club_name ?? '',
      colors: {
        primary: kit.colors?.primary ?? '',
        secondary: kit.colors?.secondary ?? '',
        accent: kit.colors?.accent ?? '',
      },
      logos: {
        primary: kit.logos?.primary ?? '',
      },
      fonts: {
        display: kit.fonts?.display ?? '',
        body: kit.fonts?.body ?? '',
      },
    });
  }

  save(): void {
    const siteId = this.siteId();
    if (!siteId || this.form.invalid) return;

    // Build a minimal PUT payload — n'envoie que les champs renseignés.
    // Le serveur coalesce avec les valeurs existantes (PUT partiel safe).
    const raw = this.form.value as {
      club_name: string;
      colors: Record<string, string>;
      logos: Record<string, string>;
      fonts: Record<string, string>;
    };
    const payload: BrandKitUpsertInput = {};
    if (raw.club_name?.trim()) payload.club_name = raw.club_name.trim();
    const colors = this.filterNonEmpty(raw.colors);
    if (Object.keys(colors).length > 0) payload.colors = colors;
    const logos = this.filterNonEmpty(raw.logos);
    if (Object.keys(logos).length > 0) payload.logos = logos;
    const fonts = this.filterNonEmpty(raw.fonts);
    if (Object.keys(fonts).length > 0) payload.fonts = fonts;

    if (Object.keys(payload).length === 0) {
      this.errorMsg.set('Aucun champ rempli — rien à enregistrer.');
      return;
    }

    this.saving.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.studio.upsertBrandKit(siteId, payload).subscribe({
      next: (kit) => {
        this.patchForm(kit);
        this.saving.set(false);
        this.successMsg.set('Brand kit enregistré.');
        setTimeout(() => this.successMsg.set(null), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Erreur de sauvegarde');
      },
    });
  }

  private filterNonEmpty(obj: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && v.trim().length > 0) out[k] = v.trim();
    }
    return out;
  }

  // Upload direct logo (S3.1). FormData → backend FTP → bump logos.primary.
  // Le serveur retourne le brand kit complet, on patch le form pour refléter
  // la nouvelle URL FTP (l'<img> preview se met à jour automatiquement).
  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadLogo(file);
    input.value = '';
  }

  private uploadLogo(file: File): void {
    const siteId = this.siteId();
    if (!siteId) {
      this.errorMsg.set('Aucun site actif — sélectionnez un site avant d\'uploader.');
      return;
    }
    if (!this.allowedLogoMimes.includes(file.type)) {
      this.errorMsg.set(`Format non supporté (${file.type || 'inconnu'}). Accepté : JPEG, PNG, WebP, SVG.`);
      return;
    }
    if (file.size > this.maxLogoSizeBytes) {
      this.errorMsg.set('Fichier trop volumineux (max 2 MB).');
      return;
    }
    this.uploadingLogo.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.studio.uploadBrandKitLogo(siteId, file, 'primary').subscribe({
      next: (kit) => {
        this.patchForm(kit);
        this.uploadingLogo.set(false);
        this.successMsg.set('Logo uploadé.');
        setTimeout(() => this.successMsg.set(null), 3000);
      },
      error: (err) => {
        this.uploadingLogo.set(false);
        this.errorMsg.set(err?.error?.error ?? 'Upload du logo échoué');
      },
    });
  }
}
