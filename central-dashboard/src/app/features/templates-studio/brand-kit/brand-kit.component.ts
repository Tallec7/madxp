import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TemplatesStudioService } from '../templates-studio.service';
import type { BrandKit, BrandKitUpsertInput } from '../templates-studio.types';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

@Component({
  selector: 'app-templates-studio-brand-kit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './brand-kit.component.html',
  styleUrls: ['./brand-kit.component.scss'],
})
export class BrandKitComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private studio = inject(TemplatesStudioService);

  // État UI signals — Angular 20 style.
  loading = signal(true);
  saving = signal(false);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);
  siteId = signal<string | null>(null);

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

  ngOnInit(): void {
    this.auth.currentUser$.subscribe((user) => {
      const siteId = user?.site_id ?? null;
      this.siteId.set(siteId);
      if (siteId) {
        this.load(siteId);
      } else {
        this.loading.set(false);
        this.errorMsg.set('Aucun site associé à votre compte (V1 = club user uniquement)');
      }
    });
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
}
