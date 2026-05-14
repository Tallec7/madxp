import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PlayerPickerComponent } from '../shared/player-picker.component';
import { SitePickerComponent } from '../shared/site-picker.component';
import { TemplatesStudioContextService } from '../templates-studio-context.service';
import { TemplatesStudioService } from '../templates-studio.service';
import type {
  ManifestInputProperty,
  ManifestInputSchema,
  RenderRequestSnapshot,
  TemplateSummary,
} from '../templates-studio.types';

/**
 * Page principale Templates Studio V1 :
 *   1. Liste les templates (catalogue depuis le backend)
 *   2. Form auto-généré depuis `manifest.inputSchema` du template sélectionné
 *   3. POST /render-requests → polling 2s du status → display MP4/PNG quand ready
 *
 * Player.* bindings : tant que S4 (roster joueurs) pas livré, les champs avec
 * `ref: 'Player'` affichent un input text disabled + message explicatif (à
 * remplacer par un PlayerPicker quand S4 sera là).
 */
@Component({
  selector: 'app-templates-studio-studio',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PlayerPickerComponent,
    SitePickerComponent,
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.scss'],
})
export class StudioComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  ctx = inject(TemplatesStudioContextService);
  private studio = inject(TemplatesStudioService);

  // Site actif vient du context partagé : picker pour internal roles, JWT pour
  // club. Passé au PlayerPicker pour qu'il liste les joueurs du club ciblé.
  siteId = this.ctx.activeSiteId;

  templates = signal<TemplateSummary[]>([]);
  selectedId = signal<string | null>(null);
  loadingTemplates = signal(true);
  loadingError = signal<string | null>(null);

  // Form courant + sa propriété schema lookup (clé pour le HTML).
  form: FormGroup = this.fb.group({});
  inputProperties = signal<Array<{ key: string; prop: ManifestInputProperty; required: boolean }>>([]);

  // Render job tracking
  jobId = signal<string | null>(null);
  jobStatus = signal<RenderRequestSnapshot | null>(null);
  jobError = signal<string | null>(null);
  submitting = signal(false);
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private pollSub: Subscription | null = null;

  selectedTemplate = computed(() => {
    const id = this.selectedId();
    return this.templates().find((t) => t.id === id) ?? null;
  });

  ngOnInit(): void {
    this.ctx.init();
    this.studio.listTemplates().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loadingTemplates.set(false);
        if (templates.length > 0) {
          this.selectTemplate(templates[0]);
        }
      },
      error: (err) => {
        this.loadingTemplates.set(false);
        this.loadingError.set(err?.error?.error ?? 'Erreur de chargement du catalogue');
      },
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  selectTemplate(template: TemplateSummary): void {
    this.selectedId.set(template.id);
    this.resetJobState();
    this.buildForm(template);
  }

  private buildForm(template: TemplateSummary): void {
    const inputSchema = (template.manifest['inputSchema'] ?? null) as ManifestInputSchema | null;
    if (!inputSchema || inputSchema.type !== 'object') {
      this.form = this.fb.group({});
      this.inputProperties.set([]);
      return;
    }
    const required = inputSchema.required ?? [];
    const controls: Record<string, unknown> = {};
    const entries: Array<{ key: string; prop: ManifestInputProperty; required: boolean }> = [];

    for (const [key, prop] of Object.entries(inputSchema.properties)) {
      const validators = [];
      const isRequired = required.includes(key);
      if (isRequired) validators.push(Validators.required);
      if (prop.type === 'integer' || prop.type === 'number') {
        if (typeof prop.minimum === 'number') validators.push(Validators.min(prop.minimum));
        if (typeof prop.maximum === 'number') validators.push(Validators.max(prop.maximum));
      }
      // Default value : empty string for text/enum, null for number, null for player ref.
      const defaultValue =
        prop.type === 'integer' || prop.type === 'number' ? null : '';
      controls[key] = [defaultValue, validators];
      entries.push({ key, prop, required: isRequired });
    }

    this.form = this.fb.group(controls);
    this.inputProperties.set(entries);
    // S4-D : les player refs sont maintenant gérés par <app-player-picker>
    // (Reactive Forms compatible via ControlValueAccessor). Le control reste
    // actif, le composant pèse les choix de l'utilisateur.
  }

  isPlayerRef(prop: ManifestInputProperty): boolean {
    return prop.ref === 'Player';
  }

  hasEnum(prop: ManifestInputProperty): boolean {
    return Array.isArray(prop.enum) && prop.enum.length > 0;
  }

  isNumber(prop: ManifestInputProperty): boolean {
    return prop.type === 'integer' || prop.type === 'number';
  }

  launchRender(): void {
    const template = this.selectedTemplate();
    if (!template || this.form.invalid) return;

    // Strip null/empty optional fields — le backend tolère extras mais on reste clean.
    const raw = this.form.value as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== null && v !== '' && v !== undefined) props[k] = v;
    }

    this.submitting.set(true);
    this.jobError.set(null);
    this.jobStatus.set(null);

    // Internal roles passent le siteId actif (picker) → route /sites/:siteId/render-requests.
    // Club user passe null → route /render-requests (siteId pris du JWT serveur).
    const targetSiteId = this.ctx.isInternalRole() ? this.siteId() : null;
    this.studio.createRenderRequest(template.id, props, targetSiteId).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.jobId.set(created.id);
        this.jobStatus.set({
          id: created.id,
          status: created.status,
          output_url: null,
          error_msg: null,
          created_at: created.created_at,
          updated_at: created.created_at,
        });
        this.startPolling(created.id);
      },
      error: (err) => {
        this.submitting.set(false);
        this.jobError.set(err?.error?.error ?? 'Erreur de création du render');
      },
    });
  }

  private startPolling(jobId: string): void {
    this.stopPolling();
    this.pollHandle = setInterval(() => {
      this.pollSub?.unsubscribe();
      this.pollSub = this.studio.getRenderRequest(jobId).subscribe({
        next: (snapshot) => {
          this.jobStatus.set(snapshot);
          if (snapshot.status === 'ready' || snapshot.status === 'failed') {
            this.stopPolling();
          }
        },
        error: (err) => {
          this.jobError.set(err?.error?.error ?? 'Erreur de suivi du render');
          this.stopPolling();
        },
      });
    }, 2_000);
  }

  private stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private resetJobState(): void {
    this.stopPolling();
    this.jobId.set(null);
    this.jobStatus.set(null);
    this.jobError.set(null);
    this.submitting.set(false);
  }
}
