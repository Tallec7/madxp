import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ChangeDetectorRef,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DisplayConfig, ReceiverConfig, ReceiverInfo, LedProfileConfig } from '../../../../../core/models';
import { environment } from '../../../../../../environments/environment';

interface DisplayTemplate {
  icon: string;
  label: string;
  type: string;
  resolution: string;
}

/** Type d'écran LED périmétrique (PROP-014) — pilote l'affichage du panneau LED. */
const LED_PERIMETER_TYPE = 'led-perimeter';

const DISPLAY_TEMPLATES: DisplayTemplate[] = [
  { icon: '📺', label: 'TV classique', type: 'tv', resolution: '1920x1080' },
  { icon: '🖥️', label: 'Bandeau LED horizontal', type: 'led-banner', resolution: '1920x384' },
  { icon: '📱', label: 'Totem portrait', type: 'totem', resolution: '1080x1920' },
  { icon: '🖥️', label: 'Mur LED', type: 'led-wall', resolution: '1920x1080' },
  { icon: '🟥', label: 'LED périmétrique (bord de terrain)', type: LED_PERIMETER_TYPE, resolution: '1920x1120' },
];

@Component({
  selector: 'app-displays-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="displays-list">
      <div class="display-entry" *ngFor="let display of displays; trackBy: trackByIndex">
      <div class="display-row">
        <span class="display-index">#{{ display.index }}</span>
        <span class="display-icon">{{ getDisplayIcon(display.type) }}</span>
        <input
          class="display-name-input"
          type="text"
          [(ngModel)]="display.name"
          (blur)="onDisplayChanged()"
          placeholder="Nom de l'ecran"
        />
        <span class="display-type-label">{{ display.type }}</span>
        <span class="display-resolution" *ngIf="display.resolution">{{ display.resolution }}</span>

        <!-- Receiver badge — Phase 8 -->
        <!-- State 1: Pi native (index 0 or kind=pi_native) -->
        <span
          class="receiver-badge receiver-badge--native"
          *ngIf="display.index === 0 || display.receiver?.kind === 'pi_native'"
          title="Ecran principal — connecté directement au Pi"
          >🖥️ Pi HDMI</span
        >

        <!-- State 2: Fire Stick assigned — Phase 11: badge MAC séparé + bouton [Réassigner ▾] -->
        <ng-container
          *ngIf="display.index !== 0 && display.receiver?.kind === 'firestick' && display.receiver?.mac"
        >
          <button
            class="receiver-badge receiver-badge--assigned receiver-badge--mac"
            [class.receiver-badge--stale]="isReceiverStale(display)"
            [title]="isReceiverStale(display) ? 'Récepteur hors-ligne' : display.receiver!.mac!"
            (click)="openReceiverDropdown($event, display.index)"
            [attr.data-display-index]="display.index"
          >
            📺 {{ formatMac(display.receiver!.mac!) }}
          </button>
          <button
            class="receiver-badge receiver-badge--reassign"
            (click)="openReceiverDropdown($event, display.index)"
            [attr.data-display-index]="display.index"
          >
            Réassigner ▾
          </button>
        </ng-container>

        <!-- State 3: Unassigned (index > 0, no receiver or receiver is null) -->
        <button
          class="receiver-badge receiver-badge--unassigned"
          *ngIf="display.index !== 0 && !display.receiver?.mac"
          (click)="openReceiverDropdown($event, display.index)"
          [attr.data-display-index]="display.index"
        >
          + Assigner
        </button>

        <!-- Receiver dropdown (position:fixed, portaled via ngIf) -->
        <div
          class="receiver-dropdown template-menu"
          *ngIf="activeDropdownIndex === display.index"
          [style.top.px]="dropdownTop"
          [style.left.px]="dropdownLeft"
        >
          <ng-container *ngIf="getReassignableReceivers(display).length > 0; else noReceivers">
            <button
              class="template-option"
              *ngFor="let r of getReassignableReceivers(display)"
              (click)="assignReceiver(display.index, r)"
            >
              <span
                class="receiver-badge receiver-badge--unknown"
                *ngIf="isUnknownFirestick(r)"
                data-testid="receiver-badge-unknown"
              >Non assigné</span>
              <span class="receiver-mac">{{ r.mac }}</span>
              <span class="receiver-lastseen" *ngIf="getCrossDisplayHint(r, display.index) as hint"> — {{ hint }}</span>
              <span class="receiver-lastseen" *ngIf="!getCrossDisplayHint(r, display.index)"> — {{ formatLastSeen(r.lastSeenAt) }}</span>
            </button>
            <hr *ngIf="display.receiver?.mac" class="receiver-dropdown-sep" />
            <button
              class="template-option receiver-unassign"
              *ngIf="display.receiver?.mac"
              (click)="unassignReceiver(display.index)"
            >
              — Désassigner
            </button>
          </ng-container>
          <ng-template #noReceivers>
            <span class="receiver-empty">Aucun récepteur détecté (Pi hors-ligne ?)</span>
            <hr *ngIf="display.receiver?.mac" class="receiver-dropdown-sep" />
            <button
              class="template-option receiver-unassign"
              *ngIf="display.receiver?.mac"
              (click)="unassignReceiver(display.index)"
            >
              — Désassigner
            </button>
          </ng-template>
        </div>

        <button
          class="btn-remove"
          *ngIf="display.index !== 0"
          (click)="removeDisplay(display.index)"
          title="Remove display"
        >&times;</button>
        <span class="display-locked" *ngIf="display.index === 0" title="Ecran principal (non supprimable)">🔒</span>
      </div>

      <!-- Panneau profil LED périmétrique — rendu UNIQUEMENT pour le type 'led-perimeter'
           (PROP-014 §8 règle d'or : piloté par TYPE, pas par index). -->
      <div class="led-panel" *ngIf="isLedPerimeter(display) && display.led" data-testid="led-panel">
        <div class="led-grid">
          <label class="led-field">
            <span>Côtés (m)</span>
            <input
              #sidesInput
              class="form-input"
              type="text"
              data-testid="led-sides"
              [ngModel]="getLedSidesInput(display)"
              (change)="onLedSidesChange(display, sidesInput.value)"
              placeholder="40, 20, 20"
            />
          </label>
          <label class="led-field">
            <span>Pas (pitch)</span>
            <input
              class="form-input"
              type="text"
              data-testid="led-pitch"
              [(ngModel)]="display.led!.pitch"
              (blur)="commitLed(display)"
              placeholder="P6"
            />
          </label>
          <label class="led-field">
            <span>Hauteur dalle (px)</span>
            <input
              class="form-input"
              type="number"
              min="1"
              data-testid="led-height"
              [(ngModel)]="display.led!.height"
              (blur)="commitLed(display)"
            />
          </label>
          <label class="led-field">
            <span>Espacement motif</span>
            <select
              class="form-input"
              data-testid="led-spacing"
              [(ngModel)]="display.led!.spacing_m"
              (ngModelChange)="commitLed(display)"
            >
              <option *ngFor="let s of getSpacingOptions(display)" [ngValue]="s">{{ s }} m</option>
            </select>
          </label>
          <label class="led-field">
            <span>Zones</span>
            <select
              class="form-input"
              data-testid="led-zones"
              [(ngModel)]="display.led!.zones"
              (ngModelChange)="commitLed(display)"
            >
              <option value="uniform">Même contenu partout</option>
              <option value="per-side">Contenu par côté</option>
            </select>
          </label>
        </div>

        <div class="led-derived" data-testid="led-derived">
          Ruban
          <strong>{{ getLedRibbonWidth(display) }}×{{ display.led!.height }}</strong>
          → plié en
          <strong>{{ getLedBandCount(display) }}</strong> bande(s) de
          {{ display.led!.canvas_in?.band_width || 1920 }}×{{ display.led!.height }}
          (canvas {{ display.led!.canvas_in?.band_width || 1920 }}×{{ getLedCanvasHeight(display) }})
          <span
            class="led-provisional"
            *ngIf="isCanvasProvisional(display)"
            title="Valeurs processeur provisoires — confirmées à l'installation (SPIKE-003)"
            >⏳ pliage provisoire</span
          >
        </div>

        <!-- Aperçu schématique du canvas plié (bandes empilées) -->
        <div class="led-ribbon-preview" data-testid="led-ribbon-preview" *ngIf="getLedBandCount(display) > 0">
          <div class="led-band" *ngFor="let b of getLedBandPreview(display)" [class.led-band--last]="b.last">
            <span class="led-band-fill" [style.width.%]="b.fillPct"></span>
          </div>
          <div class="led-band-overflow" *ngIf="getLedBandOverflow(display) > 0">+{{ getLedBandOverflow(display) }} bandes</div>
        </div>

        <!-- Banc d'essai (PROP-014 §6 / ADR-134) : plie une vidéo AU CHOIX avec ce
             profil pour comparer les mises en page avant de figer une variante. -->
        <div class="led-testbench" *ngIf="siteId" data-testid="led-testbench">
          <button type="button" class="led-tb-toggle" (click)="toggleTestbench()" data-testid="led-tb-toggle">
            🧪 Banc d'essai — tester une vidéo {{ tbOpen ? '▲' : '▼' }}
          </button>
          <div class="led-tb-body" *ngIf="tbOpen">
            <p class="led-tb-hint">
              Plie une vidéo au choix avec le profil ci-dessus. Compare Répété / Défilant /
              Étalé / Centré sans toucher aux variantes.
            </p>
            <div class="led-tb-row">
              <select class="form-input" data-testid="led-tb-video" [(ngModel)]="tbVideoId" [disabled]="tbBusy">
                <option value="">— Choisir une vidéo —</option>
                <option *ngFor="let v of tbVideos" [value]="v.id">{{ v.title }}</option>
              </select>
              <select class="form-input" data-testid="led-tb-layout" [(ngModel)]="tbLayout" [disabled]="tbBusy">
                <option *ngFor="let opt of tbLayoutOptions" [value]="opt.value">{{ opt.label }}</option>
              </select>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                data-testid="led-tb-run"
                (click)="runTestExport()"
                [disabled]="!tbVideoId || tbBusy || !ledProfileValid(display)"
              >
                {{ tbBusy ? 'Pliage…' : 'Générer l’aperçu' }}
              </button>
            </div>
            <div class="led-tb-status" *ngIf="tbStatus" data-testid="led-tb-status">{{ tbStatus }}</div>
            <div class="led-tb-error" *ngIf="tbError" data-testid="led-tb-error">{{ tbError }}</div>
            <div class="led-tb-result" *ngIf="tbUrl" data-testid="led-tb-result">
              <video class="led-tb-player" [src]="tbUrl" controls></video>
              <a class="led-tb-download" [href]="tbUrl" target="_blank" rel="noopener" download>⬇ Télécharger le MP4 plié</a>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <div class="add-display" *ngIf="!showCustomForm">
      <div class="add-display-trigger" (click)="showTemplateMenu = !showTemplateMenu">
        + Ajouter un ecran
      </div>
      <div class="template-menu" *ngIf="showTemplateMenu">
        <button
          class="template-option"
          *ngFor="let tpl of templates"
          (click)="addFromTemplate(tpl)"
        >
          {{ tpl.icon }} {{ tpl.label }} <span class="tpl-resolution">({{ tpl.resolution }})</span>
        </button>
        <button class="template-option template-custom" (click)="openCustomForm()">
          ⚙️ Personnalise...
        </button>
      </div>
    </div>

    <div class="custom-form" *ngIf="showCustomForm">
      <div class="custom-form-row">
        <input class="form-input" type="text" [(ngModel)]="customName" placeholder="Nom (ex: TV Buvette)" />
        <input class="form-input" type="text" [(ngModel)]="customType" placeholder="Type (ex: led-banner)" />
        <input class="form-input" type="text" [(ngModel)]="customResolution" placeholder="Resolution (ex: 1920x384)" />
      </div>
      <div class="custom-form-actions">
        <button class="btn btn-primary btn-sm" (click)="addCustomDisplay()" [disabled]="!customName || !customType">Ajouter</button>
        <button class="btn btn-secondary btn-sm" (click)="showCustomForm = false">Annuler</button>
      </div>
    </div>
  `,
  styles: [`
    .displays-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .display-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .display-index {
      font-size: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
      min-width: 1.5rem;
    }

    .display-icon {
      font-size: 1rem;
    }

    .display-name-input {
      flex: 1;
      border: 1px solid transparent;
      background: transparent;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
      min-width: 0;
    }

    .display-name-input:hover,
    .display-name-input:focus {
      border-color: #cbd5e1;
      background: white;
      outline: none;
    }

    .display-type-label {
      font-size: 0.75rem;
      color: #64748b;
      background: #e2e8f0;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .display-resolution {
      font-size: 0.75rem;
      color: #94a3b8;
      white-space: nowrap;
    }

    /* LED perimeter profile panel (PROP-014) */
    .display-entry {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .led-panel {
      margin: 0 0 0.25rem 1.75rem;
      padding: 0.625rem 0.75rem;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }

    .led-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.5rem;
    }

    .led-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.7rem;
      color: #9a3412;
      font-weight: 600;
    }

    .led-field .form-input {
      padding: 0.3rem 0.5rem;
      border: 1px solid #fdba74;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 400;
      color: #1e293b;
      background: white;
    }

    .led-derived {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #7c2d12;
    }

    .led-derived strong {
      color: #9a3412;
    }

    .led-provisional {
      margin-left: 0.5rem;
      font-size: 0.7rem;
      color: #b45309;
      background: #fef3c7;
      padding: 0.0625rem 0.375rem;
      border-radius: 4px;
    }

    /* Aperçu schématique du canvas plié */
    .led-ribbon-preview {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-width: 220px;
    }

    .led-band {
      height: 7px;
      background: repeating-linear-gradient(45deg, #fed7aa 0 4px, #ffedd5 4px 8px);
      border-radius: 2px;
      overflow: hidden;
    }

    .led-band-fill {
      display: block;
      height: 100%;
      background: #fb923c;
      border-radius: 2px;
    }

    .led-band--last .led-band-fill {
      background: #f97316;
    }

    .led-band-overflow {
      font-size: 0.7rem;
      color: #9a3412;
    }

    /* Banc d'essai LED */
    .led-testbench {
      margin-top: 0.625rem;
      padding-top: 0.5rem;
      border-top: 1px dashed #fdba74;
    }

    .led-tb-toggle {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #9a3412;
      padding: 0.125rem 0;
    }

    .led-tb-hint {
      margin: 0.375rem 0;
      font-size: 0.72rem;
      color: #7c2d12;
    }

    .led-tb-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .led-tb-row .form-input {
      padding: 0.3rem 0.5rem;
      border: 1px solid #fdba74;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #1e293b;
      background: white;
    }

    .led-tb-status {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #9a3412;
    }

    .led-tb-error {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #dc2626;
    }

    .led-tb-result {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .led-tb-player {
      width: 100%;
      max-width: 480px;
      border-radius: 6px;
      background: #000;
    }

    .led-tb-download {
      font-size: 0.8125rem;
      color: #2563eb;
    }

    .btn-remove {
      background: none;
      border: none;
      color: #dc2626;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0 0.25rem;
      line-height: 1;
      opacity: 0.5;
    }

    .btn-remove:hover {
      opacity: 1;
    }

    .display-locked {
      font-size: 0.75rem;
      opacity: 0.5;
    }

    .add-display {
      margin-top: 0.75rem;
      position: relative;
    }

    .add-display-trigger {
      display: inline-flex;
      align-items: center;
      padding: 0.375rem 0.75rem;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      cursor: pointer;
      color: #64748b;
      font-size: 0.8125rem;
      transition: border-color 0.2s, color 0.2s;
    }

    .add-display-trigger:hover {
      border-color: #3b82f6;
      color: #3b82f6;
    }

    .template-menu {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .template-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 0.8125rem;
      color: #334155;
      border-radius: 4px;
      text-align: left;
    }

    .template-option:hover {
      background: #f1f5f9;
    }

    .template-custom {
      border-top: 1px solid #e2e8f0;
      margin-top: 0.25rem;
      padding-top: 0.625rem;
    }

    .tpl-resolution {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .custom-form {
      margin-top: 0.75rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .custom-form-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .custom-form-row .form-input {
      flex: 1;
      min-width: 120px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .custom-form-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .btn { padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; border: none; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #e2e8f0; color: #475569; }
    .btn-secondary:hover { background: #cbd5e1; }

    @media (max-width: 768px) {
      .display-row { flex-wrap: wrap; }
      .custom-form-row { flex-direction: column; }
      .custom-form-row .form-input { min-width: unset; }
    }

    /* Receiver badges (Phase 8) */
    .receiver-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
      cursor: default;
      border: none;
      font-weight: 500;
    }

    .receiver-badge--native {
      background: #e2e8f0;
      color: #64748b;
    }

    .receiver-badge--assigned {
      background: #dcfce7;
      color: #166534;
      cursor: pointer;
      border: 1px solid #86efac;
    }

    .receiver-badge--assigned:hover {
      background: #bbf7d0;
    }

    .receiver-badge--unassigned {
      background: transparent;
      color: #3b82f6;
      cursor: pointer;
      text-decoration: underline;
      padding: 0.125rem 0.25rem;
    }

    .receiver-badge--unassigned:hover {
      color: #2563eb;
    }

    /* Receiver badge variants — Phase 11 */
    .receiver-badge--mac {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #86efac;
      cursor: pointer;
    }

    .receiver-badge--stale {
      opacity: 0.55;
      background: #f1f5f9;
      color: #94a3b8;
      border-color: #cbd5e1;
    }

    .receiver-badge--reassign {
      background: transparent;
      color: #3b82f6;
      cursor: pointer;
      text-decoration: underline;
      padding: 0.125rem 0.25rem;
      font-size: 0.75rem;
    }

    .receiver-badge--reassign:hover {
      color: #2563eb;
    }

    /* Phase 12 OBSERVE — badge ambre Fire Stick non assigné */
    .receiver-badge--unknown {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fbbf24;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-right: 0.375rem;
    }

    /* Receiver dropdown */
    .receiver-dropdown {
      position: fixed;
      z-index: 9999;
      min-width: 260px;
      max-width: 360px;
      margin-top: 0;
    }

    .receiver-mac {
      font-family: monospace;
      font-size: 0.8rem;
    }

    .receiver-lastseen {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .receiver-empty {
      display: block;
      padding: 0.5rem 0.75rem;
      color: #94a3b8;
      font-size: 0.8125rem;
      font-style: italic;
    }

    .receiver-dropdown-sep {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 0.25rem 0;
    }

    .receiver-unassign {
      color: #dc2626 !important;
    }

    .receiver-unassign:hover {
      background: #fef2f2 !important;
    }
  `]
})
export class DisplaysEditorComponent implements OnDestroy {
  private _displays: DisplayConfig[] = [];

  /** Club consulté — requis pour le banc d'essai (le pliage se fait pour CE club). */
  @Input() siteId: string | null = null;

  // --- Banc d'essai LED (PROP-014 §6 / ADR-134) ---
  readonly tbLayoutOptions: { value: string; label: string }[] = [
    { value: 'repeated', label: 'Répété' },
    { value: 'scrolling', label: 'Défilant' },
    { value: 'stretched', label: 'Étalé' },
    { value: 'centered', label: 'Centré' },
  ];
  tbOpen = false;
  tbVideos: { id: string; title: string }[] = [];
  private tbVideosLoaded = false;
  tbVideoId = '';
  tbLayout = 'repeated';
  tbBusy = false;
  tbStatus = '';
  tbError = '';
  tbUrl: string | null = null;
  private tbPollTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Les displays de type `led-perimeter` reçoivent un profil `led` par défaut s'il
   * manque (chargement d'anciens displays). Normaliser ici garantit que les bindings
   * `display.led!.*` du panneau LED ne crashent jamais. PROP-014 §8.
   */
  @Input() set displays(value: DisplayConfig[]) {
    this._displays = (value ?? []).map((d) => this.normalizeLed(d));
  }
  get displays(): DisplayConfig[] {
    return this._displays;
  }

  @Output() displaysChange = new EventEmitter<DisplayConfig[]>();

  @Input() connectedReceivers: ReceiverInfo[] = [];

  // Receiver dropdown state
  activeDropdownIndex: number | null = null;
  dropdownTop = 0;
  dropdownLeft = 0;

  readonly templates = DISPLAY_TEMPLATES;
  showTemplateMenu = false;
  showCustomForm = false;
  customName = '';
  customType = '';
  customResolution = '';

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnDestroy(): void {
    if (this.tbPollTimer) clearTimeout(this.tbPollTimer);
  }

  trackByIndex(_: number, display: DisplayConfig): number {
    return display.index;
  }

  // --- Banc d'essai LED ---

  /** Wrapper public de la validation profil (le template gate le bouton dessus). */
  ledProfileValid(display: DisplayConfig): boolean {
    return this.isLedProfileValid(display);
  }

  toggleTestbench(): void {
    this.tbOpen = !this.tbOpen;
    if (this.tbOpen && !this.tbVideosLoaded) this.loadTestVideos();
  }

  private loadTestVideos(): void {
    this.tbVideosLoaded = true;
    this.http
      .get<{ id: string; title: string }[]>(`${environment.apiUrl}/videos/names`, {
        withCredentials: true,
      })
      .subscribe({
        next: (rows) => {
          this.tbVideos = rows ?? [];
          this.cdr.markForCheck();
        },
        error: () => {
          this.tbVideosLoaded = false;
          this.tbError = 'Impossible de charger la liste des vidéos';
          this.cdr.markForCheck();
        },
      });
  }

  runTestExport(): void {
    if (!this.siteId || !this.tbVideoId || this.tbBusy) return;
    this.tbBusy = true;
    this.tbError = '';
    this.tbUrl = null;
    this.tbStatus = 'Mise en file…';
    this.http
      .post<{ job_id: string; status: string; output_url?: string | null; reused?: boolean }>(
        `${environment.apiUrl}/led-test-export/${this.siteId}`,
        { video_id: this.tbVideoId, layout: this.tbLayout },
        { withCredentials: true }
      )
      .subscribe({
        next: (res) => {
          if (res.status === 'ready' && res.output_url) {
            this.tbBusy = false;
            this.tbStatus = '';
            this.tbUrl = res.output_url;
          } else {
            this.tbStatus = 'Pliage en cours…';
            this.pollTbExport(res.job_id);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.tbBusy = false;
          this.tbStatus = '';
          this.tbError = err?.error?.error || 'Erreur lors du pliage';
          this.cdr.markForCheck();
        },
      });
  }

  private pollTbExport(jobId: string): void {
    // Cache-buster obligatoire (incident 2026-06-03) : sinon le navigateur sert le
    // 1er statut depuis son cache et le polling ne voit jamais 'ready'.
    this.http
      .get<{ status: string; output_url: string | null; error_msg: string | null }>(
        `${environment.apiUrl}/led-export-jobs/${jobId}?_=${Date.now()}`,
        { withCredentials: true }
      )
      .subscribe({
        next: (job) => {
          if (job.status === 'ready') {
            this.tbBusy = false;
            this.tbStatus = '';
            this.tbUrl = job.output_url;
          } else if (job.status === 'failed') {
            this.tbBusy = false;
            this.tbStatus = '';
            this.tbError = job.error_msg || 'Pliage échoué';
          } else {
            this.tbStatus = job.status === 'processing' ? 'Pliage en cours…' : 'En file…';
            this.tbPollTimer = setTimeout(() => this.pollTbExport(jobId), 2000);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.tbBusy = false;
          this.tbStatus = '';
          this.tbError = 'Erreur de suivi du job';
          this.cdr.markForCheck();
        },
      });
  }

  getDisplayIcon(type: string): string {
    const tpl = DISPLAY_TEMPLATES.find(t => t.type === type);
    return tpl?.icon || '🖥️';
  }

  addFromTemplate(tpl: DisplayTemplate): void {
    const nextIndex = this.getNextIndex();
    this.displays = [
      ...this.displays,
      { index: nextIndex, name: tpl.label, type: tpl.type, resolution: tpl.resolution },
    ];
    this.showTemplateMenu = false;
    this.displaysChange.emit(this.displays);
  }

  openCustomForm(): void {
    this.showTemplateMenu = false;
    this.showCustomForm = true;
    this.customName = '';
    this.customType = '';
    this.customResolution = '';
  }

  addCustomDisplay(): void {
    if (!this.customName || !this.customType) return;
    const slug = this.customType.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const nextIndex = this.getNextIndex();
    this.displays = [
      ...this.displays,
      { index: nextIndex, name: this.customName, type: slug, resolution: this.customResolution || undefined },
    ];
    this.showCustomForm = false;
    this.displaysChange.emit(this.displays);
  }

  removeDisplay(index: number): void {
    this.displays = this.displays.filter(d => d.index !== index);
    this.displaysChange.emit(this.displays);
  }

  onDisplayChanged(): void {
    this.displaysChange.emit(this.displays);
  }

  /**
   * Émet les changements d'un display LED UNIQUEMENT si son profil est valide.
   * Évite d'envoyer au serveur des états transitoires (`pitch` "P3." en cours de
   * frappe → 400 "Données invalides"). Appelé sur blur/change, jamais par frappe.
   */
  commitLed(display: DisplayConfig): void {
    if (this.isLedProfileValid(display)) {
      this.onDisplayChanged();
    }
  }

  /** Le profil LED est-il sauvegardable (mêmes contraintes que le schéma Joi serveur) ? */
  private isLedProfileValid(display: DisplayConfig): boolean {
    const led = display.led;
    if (!led) return false;
    if (!Array.isArray(led.sides) || led.sides.length === 0) return false;
    if (!/^P\d+(\.\d+)?$/.test(led.pitch ?? '')) return false;
    if (!(typeof led.height === 'number' && led.height > 0)) return false;
    if (!(typeof led.spacing_m === 'number' && led.spacing_m > 0)) return false;
    return true;
  }

  // --- Receiver UX (Phase 8) ---

  formatMac(mac: string): string {
    // 'AA:BB:CC:DD:EE:FF' → 'AA:BB:C…FF'
    if (!mac || mac.length < 8) return mac;
    return mac.substring(0, 6) + '…' + mac.substring(mac.length - 2);
  }

  formatLastSeen(iso: string | number): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'à l\'instant';
    if (mins < 60) return `il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  }

  openReceiverDropdown(event: Event, displayIndex: number): void {
    event.stopPropagation();
    if (this.activeDropdownIndex === displayIndex) {
      this.activeDropdownIndex = null;
      this.cdr.markForCheck();
      return;
    }
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.dropdownTop = rect.bottom + 4;
    this.dropdownLeft = rect.left;
    this.activeDropdownIndex = displayIndex;
    this.cdr.markForCheck();
  }

  /**
   * Phase 12 OBSERVE — Vrai SSI le receiver est un Fire Stick détecté sur le hotspot
   * mais pas encore assigné à un display (displayIndex === null).
   * kind === 'browser' (téléphones bénévoles) → false par construction.
   */
  isUnknownFirestick(r: ReceiverInfo): boolean {
    return r.kind === 'firestick' && r.displayIndex === null;
  }

  isReceiverStale(display: DisplayConfig): boolean {
    const mac = display.receiver?.mac;
    if (!mac) return false;
    return !this.connectedReceivers.find(r => r.mac === mac);
  }

  getReassignableReceivers(display: DisplayConfig): ReceiverInfo[] {
    const currentMac = display.receiver?.mac;
    return currentMac
      ? this.connectedReceivers.filter(r => r.mac !== currentMac)
      : this.connectedReceivers;
  }

  getCrossDisplayHint(receiver: ReceiverInfo, currentDisplayIndex: number): string | null {
    const other = this.displays.find(
      d => d.receiver?.mac === receiver.mac && d.index !== currentDisplayIndex
    );
    return other ? `actuellement sur ${other.name}` : null;
  }

  assignReceiver(displayIndex: number, receiver: ReceiverInfo): void {
    const sourceDisplay = this.displays.find(
      d => d.receiver?.mac === receiver.mac && d.index !== displayIndex
    );

    this.displays = this.displays.map(d => {
      if (d.index === displayIndex) {
        return {
          ...d,
          receiver: {
            kind: receiver.kind,
            mac: receiver.mac,
            last_seen_at: receiver.lastSeenAt,
          } as ReceiverConfig,
        };
      }
      if (sourceDisplay && d.index === sourceDisplay.index) {
        return { ...d, receiver: null };
      }
      return d;
    });
    this.activeDropdownIndex = null;
    this.displaysChange.emit([...this.displays]);
    this.cdr.markForCheck();
  }

  unassignReceiver(displayIndex: number): void {
    this.displays = this.displays.map(d => {
      if (d.index !== displayIndex) return d;
      return { ...d, receiver: null };
    });
    this.activeDropdownIndex = null;
    this.displaysChange.emit([...this.displays]);
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.activeDropdownIndex === null) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.activeDropdownIndex = null;
      this.cdr.markForCheck();
    }
  }

  // --- LED perimeter profile (PROP-014) ---

  isLedPerimeter(display: DisplayConfig): boolean {
    return display.type === LED_PERIMETER_TYPE;
  }

  /** Profil LED par défaut (canvas_in provisoire jusqu'au SPIKE — PROP-014 §13). */
  private defaultLedProfile(): LedProfileConfig {
    return {
      sides: [40],
      pitch: 'P6',
      height: 160,
      spacing_m: 10,
      zones: 'uniform',
      canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' },
    };
  }

  /** Garantit qu'un display led-perimeter porte un profil led complet. */
  private normalizeLed(display: DisplayConfig): DisplayConfig {
    if (display.type !== LED_PERIMETER_TYPE) return display;
    if (display.led) {
      // Complète canvas_in si absent (rétro-compat profils partiels).
      if (!display.led.canvas_in) {
        return { ...display, led: { ...display.led, canvas_in: { band_width: 1920, order: 'top-to-bottom', mode: 'B' } } };
      }
      return display;
    }
    return { ...display, led: this.defaultLedProfile() };
  }

  getLedSidesInput(display: DisplayConfig): string {
    return (display.led?.sides ?? []).join(', ');
  }

  onLedSidesChange(display: DisplayConfig, raw: string): void {
    if (!display.led) return;
    const sides = raw
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    display.led.sides = sides;
    this.commitLed(display);
  }

  /** Pas de pixel en mm (P6 → 6). Retourne 0 si non parsable. */
  private pitchMm(pitch: string | undefined): number {
    if (!pitch) return 0;
    const mm = parseFloat(pitch.replace(/^P/i, ''));
    return Number.isFinite(mm) && mm > 0 ? mm : 0;
  }

  /** Largeur du ruban déroulé (px) = Σ côtés (m) × (1000 / pitch_mm). PROP-014 §3. */
  getLedRibbonWidth(display: DisplayConfig): number {
    const led = display.led;
    if (!led) return 0;
    const mm = this.pitchMm(led.pitch);
    if (mm === 0) return 0;
    const sumSides = (led.sides ?? []).reduce((a, b) => a + b, 0);
    return Math.round(sumSides * (1000 / mm));
  }

  private bandWidth(display: DisplayConfig): number {
    return display.led?.canvas_in?.band_width || 1920;
  }

  /** Nb de bandes = ceil(ribbonWidth / bandWidth) — même calcul que fold(). */
  getLedBandCount(display: DisplayConfig): number {
    const ribbon = this.getLedRibbonWidth(display);
    const bw = this.bandWidth(display);
    if (ribbon <= 0 || bw <= 0) return 0;
    return Math.ceil(ribbon / bw);
  }

  /** Hauteur du canvas plié = bandCount × hauteur dalle. */
  getLedCanvasHeight(display: DisplayConfig): number {
    return this.getLedBandCount(display) * (display.led?.height || 0);
  }

  /** Provisoire tant que le SPIKE n'a pas confirmé band_count (PROP-014 §13). */
  isCanvasProvisional(display: DisplayConfig): boolean {
    return !display.led?.canvas_in?.band_count;
  }

  /**
   * Aperçu schématique du canvas plié : une bande = un segment de 1920px du ruban,
   * empilées. La dernière est partiellement remplie (padding). Cap à 24 bandes pour
   * éviter un DOM énorme sur les très grands périmètres.
   */
  getLedBandPreview(display: DisplayConfig): Array<{ fillPct: number; last: boolean }> {
    const count = this.getLedBandCount(display);
    if (count <= 0) return [];
    const ribbon = this.getLedRibbonWidth(display);
    const bw = this.bandWidth(display);
    const max = Math.min(count, 24);
    const bands: Array<{ fillPct: number; last: boolean }> = [];
    for (let i = 0; i < max; i++) {
      const w = Math.min(bw, ribbon - i * bw);
      bands.push({ fillPct: Math.max(2, Math.min(100, (w / bw) * 100)), last: i === count - 1 });
    }
    return bands;
  }

  getLedBandOverflow(display: DisplayConfig): number {
    return Math.max(0, this.getLedBandCount(display) - 24);
  }

  /**
   * Espacements proposés (m) : diviseurs entiers du PGCD des côtés ≥ 4 m → angles
   * alignés + nombre entier de répétitions (PROP-014 §4, anti-drift : jamais saisie
   * libre). La valeur courante est toujours incluse pour ne pas la perdre.
   */
  getSpacingOptions(display: DisplayConfig): number[] {
    const led = display.led;
    const current = led?.spacing_m;
    const sides = (led?.sides ?? []).filter((s) => Number.isInteger(s) && s > 0);
    const opts = new Set<number>();

    if (sides.length > 0) {
      const g = sides.reduce((a, b) => this.gcd(a, b));
      for (let d = 1; d <= g; d++) {
        if (g % d === 0 && d >= 4) opts.add(d);
      }
      // Fallback : si aucun diviseur ≥ 4 (petits côtés), proposer au moins le PGCD.
      if (opts.size === 0 && g > 0) opts.add(g);
    }

    if (current && current > 0) opts.add(current);
    return Array.from(opts).sort((a, b) => a - b);
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  private getNextIndex(): number {
    if (this.displays.length === 0) return 0;
    return Math.max(...this.displays.map(d => d.index)) + 1;
  }
}
