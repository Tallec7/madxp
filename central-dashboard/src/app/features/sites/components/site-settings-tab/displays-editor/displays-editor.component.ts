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
import { ledPitchMm, ledRibbonWidth, ledBandWidth, ledDerivedBandWidth } from '../../../../../core/utils/led-geometry';
import { environment } from '../../../../../../environments/environment';
import { LedCanvasOverviewComponent } from '../led-canvas-overview/led-canvas-overview.component';

interface DisplayTemplate {
  icon: string;
  label: string;
  type: string;
  /** Résolution standard du type, ou `null` quand elle se dérive de la géométrie. */
  resolution: string | null;
}

/** Type d'écran LED périmétrique (PROP-014) — pilote l'affichage du panneau LED. */
const LED_PERIMETER_TYPE = 'led-perimeter';

/**
 * Gabarits d'écran. `resolution` est la résolution STANDARD du type, écrite à la
 * création — sauf pour `led-perimeter`, dont la résolution ne peut pas être une
 * constante : elle se DÉRIVE du profil du terrain (côtés × pitch → bandes × hauteur).
 * D'où `resolution: null` : rien n'est persisté, `getDisplayResolution()` calcule.
 * Avant, la valeur '1920x1120' était figée ici et devenait fausse dès que
 * l'opérateur touchait un côté — y compris dans l'aide à l'upload côté Contenu.
 */
const DISPLAY_TEMPLATES: DisplayTemplate[] = [
  { icon: '📺', label: 'TV classique', type: 'tv', resolution: '1920x1080' },
  { icon: '🖥️', label: 'Bandeau LED horizontal', type: 'led-banner', resolution: '1920x384' },
  { icon: '📱', label: 'Totem portrait', type: 'totem', resolution: '1080x1920' },
  { icon: '🖥️', label: 'Mur LED', type: 'led-wall', resolution: '1920x1080' },
  { icon: '🟥', label: 'LED périmétrique (bord de terrain)', type: LED_PERIMETER_TYPE, resolution: null },
];

@Component({
  selector: 'app-displays-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, LedCanvasOverviewComponent],
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
        <!-- Type éditable sur TOUS les écrans, #0 compris : l'index dit quelle sortie,
             le type dit quelle surface est branchée. Un club peut avoir son ruban LED
             en sortie principale (PROP-014 §1). -->
        <select
          class="display-type-select"
          [ngModel]="display.type"
          (ngModelChange)="updateDisplayType(display, $event)"
          [attr.data-testid]="'display-type-' + display.index"
          [attr.aria-label]="'Type de l’écran #' + display.index"
        >
          <option *ngFor="let t of getTypeOptions(display)" [value]="t.type">
            {{ t.icon }} {{ t.label }}
          </option>
        </select>
        <span
          class="display-resolution"
          *ngIf="getDisplayResolution(display) as res"
          [attr.data-testid]="'display-resolution-' + display.index"
          title="Résolution effective — calculée, non saisie"
          >{{ res }}</span
        >

        <!-- Receiver badge — Phase 8. Pas de badge « Pi HDMI » : un écran ne sait pas
             qui le pilote. La distinction Pi / pas-Pi vit sur site_type. -->
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
        <div class="led-header">🟥 Ruban LED</div>

        <div class="led-grid">
          <!-- Côtés : une case par côté + bouton ajouter (1 à 8). PROP-014 §3. -->
          <div class="led-field led-field--sides">
            <span>Côtés (m)</span>
            <div class="led-sides-editor" data-testid="led-sides">
              <span
                class="led-side-chip"
                *ngFor="let s of display.led!.sides; let i = index; trackBy: trackBySideIndex"
              >
                <input
                  #sideInput
                  class="led-side-input"
                  type="number"
                  min="1"
                  [ngModel]="s"
                  (change)="updateSide(display, i, sideInput.value)"
                  [attr.data-testid]="'led-side-' + i"
                />
                <button
                  type="button"
                  class="led-side-remove"
                  *ngIf="display.led!.sides.length > 1"
                  (click)="removeSide(display, i)"
                  title="Remove side"
                >✕</button>
              </span>
              <button
                type="button"
                class="led-side-add"
                data-testid="led-side-add"
                (click)="addSide(display)"
                [disabled]="display.led!.sides.length >= 8"
                title="Add side"
              >+</button>
            </div>
            <small class="led-subhint" data-testid="led-perimeter"
              >Périmètre : {{ getLedPerimeterM(display) }} m</small
            >
            <!-- La résolution PAR BLOC en pixels : c'est le chiffre que donnent les
                 installateurs et les régies (« 1600×120 »), alors qu'on saisit des
                 mètres. Sans lui, impossible de vérifier d'un coup d'œil que la
                 géométrie décrit bien le matériel posé. -->
            <small class="led-subhint" data-testid="led-side-resolution"
              >Chaque côté : {{ getLedSideResolutions(display) }} px</small
            >
          </div>

          <!-- Pitch : menu de pas courants + saisie libre (datalist). -->
          <label class="led-field">
            <span>Pitch</span>
            <input
              class="form-input"
              type="text"
              data-testid="led-pitch"
              [(ngModel)]="display.led!.pitch"
              (blur)="commitLed(display)"
              [attr.list]="'led-pitch-' + display.index"
              placeholder="P6"
            />
            <datalist [id]="'led-pitch-' + display.index">
              <option *ngFor="let p of pitchOptions" [value]="p"></option>
            </datalist>
          </label>

          <!-- Hauteur en cm (modèle interne = rangées px). -->
          <label class="led-field">
            <span>Hauteur dalle (cm)</span>
            <input
              #heightCmInput
              class="form-input"
              type="number"
              min="1"
              step="1"
              data-testid="led-height"
              [ngModel]="getLedHeightCm(display)"
              (change)="onLedHeightCmChange(display, heightCmInput.value)"
              placeholder="96"
            />
            <small class="led-subhint" data-testid="led-height-rows"
              >= {{ display.led!.height }} rangées @ {{ display.led!.pitch }}</small
            >
          </label>

          <!-- Répétition par défaut (= cadence du motif, ex-« Espacement motif »). -->
          <label class="led-field">
            <span>Répétition par défaut</span>
            <select
              class="form-input"
              data-testid="led-spacing"
              [(ngModel)]="display.led!.spacing_m"
              (ngModelChange)="commitLed(display)"
            >
              <option *ngFor="let s of getSpacingOptions(display)" [ngValue]="s">tous les {{ s }} m</option>
            </select>
          </label>

        </div>

        <!-- Avancé (processeur) : repliable. Valeurs dérivées + override install
             (band_count / mode) — PROP-014 §3, §10, §12. -->
        <div class="led-advanced">
          <button
            type="button"
            class="led-adv-toggle"
            data-testid="led-adv-toggle"
            (click)="advOpen = !advOpen"
          >
            {{ advOpen ? '▾' : '▸' }} Avancé (processeur)
            <span
              class="led-provisional"
              *ngIf="isCanvasProvisional(display)"
              title="Valeurs processeur provisoires — à confirmer à l'installation (SPIKE-003)"
              >⚠️ à confirmer install</span
            >
          </button>
          <div class="led-adv-body" *ngIf="advOpen" data-testid="led-adv-body">
            <div class="led-adv-item">
              <span>Entrée processeur</span>
              <strong data-testid="led-adv-input"
                >{{ getLedBandWidth(display) }}×{{ getLedCanvasHeight(display) }}</strong
              >
              <em class="led-adv-note">ruban déroulé {{ getLedRibbonWidth(display) }}×{{ display.led!.height }}</em>
            </div>
            <label class="led-adv-item">
              <span>Largeur d'entrée</span>
              <input
                #bandWidthInput
                class="form-input led-adv-input-sm"
                type="number"
                min="1"
                data-testid="led-adv-band-width"
                [ngModel]="display.led!.canvas_in?.band_width ?? null"
                (change)="updateBandWidth(display, bandWidthInput.value)"
                [attr.placeholder]="getLedDerivedBandWidth(display)"
              />
              <em class="led-adv-note"
                >vide = dérivé du plus long côté ({{ getLedDerivedBandWidth(display) }} px)</em
              >
            </label>
            <label class="led-adv-item">
              <span>Bandes</span>
              <input
                #bandCountInput
                class="form-input led-adv-input-sm"
                type="number"
                min="1"
                data-testid="led-adv-bands"
                [ngModel]="display.led!.canvas_in?.band_count ?? null"
                (change)="updateBandCount(display, bandCountInput.value)"
                [attr.placeholder]="getLedBandCount(display)"
              />
            </label>
            <label class="led-adv-item led-adv-item--switch">
              <span>Diffuser le canvas plié</span>
              <input
                type="checkbox"
                data-testid="led-adv-serve-folded"
                [ngModel]="display.led!.canvas_in?.serve_folded === true"
                (ngModelChange)="updateServeFolded(display, $event)"
              />
              <em class="led-adv-note"
                >à n'activer qu'après avoir vérifié le rendu sur le ruban</em
              >
            </label>
            <label class="led-adv-item">
              <span>Mode</span>
              <select
                class="form-input led-adv-input-sm"
                data-testid="led-adv-mode"
                [(ngModel)]="display.led!.canvas_in!.mode"
                (ngModelChange)="commitLed(display)"
              >
                <option value="A">A — plug & play</option>
                <option value="B">B — pixel-perfect</option>
              </select>
            </label>
          </div>
        </div>

        <!-- Aperçu schématique du canvas plié (bandes empilées) -->
        <div class="led-ribbon-preview" data-testid="led-ribbon-preview" *ngIf="getLedBandCount(display) > 0">
          <div class="led-band" *ngFor="let b of getLedBandPreview(display)" [class.led-band--last]="b.last">
            <span class="led-band-fill" [style.width.%]="b.fillPct"></span>
          </div>
          <div class="led-band-overflow" *ngIf="getLedBandOverflow(display) > 0">+{{ getLedBandOverflow(display) }} bandes</div>
        </div>

        <!-- Vue d'ensemble des canvas : format livré vs attendu, état, aperçu.
             Placée ici parce que c'est l'écran où l'on règle déjà la géométrie —
             et parce que l'écart de format est la première cause de rendu raté. -->
        <app-led-canvas-overview [siteId]="siteId"></app-led-canvas-overview>

        <!-- Déclaration en masse des variantes ruban.
             Le pliage automatique (ADR-139) ne s'applique qu'aux vidéos AYANT une
             variante led-perimeter. Un club LED en a une dizaine, toutes déjà au
             format ruban : les déclarer une par une est dix allers-retours sans
             aucune décision à prendre. -->
        <div class="led-bulk" *ngIf="siteId" data-testid="led-bulk">
          <button
            type="button"
            class="btn btn-sm btn-secondary"
            data-testid="led-bulk-btn"
            [disabled]="bulkBusy"
            (click)="createLedVariantsInBulk()"
          >
            {{ bulkBusy ? 'Création…' : '⚡ Créer les variantes LED manquantes' }}
          </button>
          <span class="led-bulk-hint" *ngIf="bulkResult" data-testid="led-bulk-result">{{ bulkResult }}</span>
          <em class="led-bulk-note" *ngIf="!bulkResult"
            >déclare les vidéos du club sur le ruban — aucun encodage, aucun ré-upload</em
          >
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
          {{ tpl.icon }} {{ tpl.label }}
          <span class="tpl-resolution">({{ templateResolutionLabel(tpl) }})</span>
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

    .display-type-select {
      font-size: 0.75rem;
      color: #334155;
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      white-space: nowrap;
      cursor: pointer;
      max-width: 14rem;
    }

    .display-type-select:hover {
      border-color: #94a3b8;
    }

    .display-type-select:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 1px;
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

    .led-subhint {
      font-size: 0.65rem;
      font-weight: 400;
      color: #b45309;
    }

    .led-header {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #9a3412;
      margin-bottom: 0.5rem;
    }

    .led-field--sides {
      grid-column: 1 / -1;
    }

    .led-sides-editor {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.375rem;
    }

    .led-side-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
      background: white;
      border: 1px solid #fdba74;
      border-radius: 6px;
      padding: 0.125rem 0.25rem;
    }

    .led-side-input {
      width: 3.5rem;
      border: none;
      outline: none;
      background: transparent;
      font-size: 0.8125rem;
      font-weight: 400;
      color: #1e293b;
      text-align: center;
    }

    .led-side-remove {
      border: none;
      background: none;
      color: #c2410c;
      cursor: pointer;
      font-size: 0.7rem;
      line-height: 1;
      padding: 0;
      opacity: 0.6;
    }

    .led-side-remove:hover {
      opacity: 1;
    }

    .led-side-add {
      border: 1px dashed #fb923c;
      background: white;
      color: #c2410c;
      border-radius: 6px;
      width: 1.75rem;
      height: 1.75rem;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }

    .led-side-add:hover:not(:disabled) {
      background: #ffedd5;
    }

    .led-side-add:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Section Avancé (processeur) */
    .led-advanced {
      margin-top: 0.625rem;
      padding-top: 0.5rem;
      border-top: 1px dashed #fdba74;
    }

    .led-adv-toggle {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      color: #9a3412;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }

    .led-adv-body {
      margin-top: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1.25rem;
    }

    .led-adv-item--switch input {
      width: 1rem;
      height: 1rem;
      cursor: pointer;
    }

    .led-adv-item {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.7rem;
      color: #9a3412;
      font-weight: 600;
    }

    .led-adv-item strong {
      font-weight: 700;
      color: #7c2d12;
      font-size: 0.8125rem;
    }

    .led-adv-note {
      font-weight: 400;
      font-style: normal;
      color: #b45309;
      font-size: 0.62rem;
    }

    .led-adv-input-sm {
      width: 5rem;
      padding: 0.25rem 0.4rem;
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

  // --- Panneau LED ---
  /** Section « Avancé (processeur) » repliée par défaut. */
  advOpen = false;
  /** Pas LED courants proposés dans le datalist (saisie libre conservée). */
  readonly pitchOptions: string[] = ['P2.5', 'P3', 'P3.9', 'P4', 'P5', 'P6', 'P8', 'P10'];

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
    if (this.tbOpen) this.ensureVideosLoaded();
  }

  /**
   * Charge la liste vidéos (id + titre) une seule fois — partagée entre le banc
   * d'essai et les sélecteurs « Contenu par côté ». Idempotent.
   */
  private ensureVideosLoaded(): void {
    if (this.tbVideosLoaded) return;
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

  /**
   * Résolution EFFECTIVE d'un écran — la seule source affichable.
   *
   * Pour un `led-perimeter`, elle est CALCULÉE depuis la géométrie du terrain
   * (largeur de bande × bandes effectives × hauteur de dalle) : elle suit donc les
   * côtés, le pitch et la hauteur en direct. Pour tout autre type, c'est la
   * résolution standard choisie à la création. Renvoie `null` quand il n'y a rien
   * d'affichable (profil incomplet, type personnalisé sans résolution).
   */
  getDisplayResolution(display: DisplayConfig): string | null {
    if (this.isLedPerimeter(display)) {
      const w = this.getLedBandWidth(display);
      const h = this.getLedCanvasHeight(display);
      return w > 0 && h > 0 ? `${w}x${h}` : null;
    }
    return display.resolution || null;
  }

  /** Libellé de résolution dans le menu de gabarits (dérivée ⇒ pas de constante). */
  templateResolutionLabel(tpl: DisplayTemplate): string {
    return tpl.resolution ?? 'selon le terrain';
  }

  /**
   * Types proposés pour un écran : les gabarits connus, plus son type actuel s'il
   * est personnalisé — sans quoi changer un autre champ ferait silencieusement
   * retomber un slug custom sur le premier gabarit de la liste.
   */
  getTypeOptions(display: DisplayConfig): DisplayTemplate[] {
    const known = DISPLAY_TEMPLATES.some(t => t.type === display.type);
    if (known || !display.type) return DISPLAY_TEMPLATES;
    return [...DISPLAY_TEMPLATES, { icon: '⚙️', label: display.type, type: display.type, resolution: null }];
  }

  /**
   * Change le type d'un écran, y compris le #0. Le profil LED suit le type :
   * il apparaît en entrant sur `led-perimeter`, et disparaît en sortant (sinon un
   * profil orphelin resterait en base sur un écran qui n'est plus un ruban).
   * La résolution suit la même règle que `addFromTemplate` : persistée quand elle
   * est standard, absente quand elle se dérive.
   */
  updateDisplayType(display: DisplayConfig, type: string): void {
    if (!type || type === display.type) return;
    display.type = type;

    const tpl = DISPLAY_TEMPLATES.find(t => t.type === type);
    if (tpl?.resolution) display.resolution = tpl.resolution;
    else delete display.resolution;

    if (type === LED_PERIMETER_TYPE) {
      if (!display.led) display.led = this.defaultLedProfile();
    } else if (display.led) {
      delete display.led;
    }

    this.onDisplayChanged();
  }

  addFromTemplate(tpl: DisplayTemplate): void {
    const nextIndex = this.getNextIndex();
    // `resolution` n'est PAS persistée quand elle se dérive (led-perimeter) : une
    // valeur figée en base redeviendrait fausse au premier changement de côté.
    const display: DisplayConfig = { index: nextIndex, name: tpl.label, type: this.uniquifyType(tpl.type) };
    if (tpl.resolution) display.resolution = tpl.resolution;
    // Le setter `displays` normalise déjà le profil LED (`normalizeLed`).
    this.displays = [...this.displays, display];
    this.showTemplateMenu = false;
    this.displaysChange.emit(this.displays);
  }

  /**
   * Rend un type de gabarit unique parmi les écrans existants (ex: `led-perimeter`
   * → `led-perimeter-2`, `-3`...). Le backend rejette depuis #1181 deux displays
   * au type strictement identique (deux `led-perimeter` partagent la même clé de
   * variante vidéo, indistinguables au rendu Pi) — sans cette uniquification, le
   * bouton "LED périmétrique" du menu de gabarits recrée le doublon exact que la
   * validation refuse désormais, bloquant l'ajout d'un 2e écran du même gabarit.
   * `type: 'tv'` est exclu, comme côté backend : plusieurs TV physiques du même
   * type sont un cas légitime (TV principale + TV bar).
   */
  private uniquifyType(type: string): string {
    if (type === 'tv') return type;
    const existing = new Set(this.displays.map(d => d.type));
    if (!existing.has(type)) return type;
    let n = 2;
    while (existing.has(`${type}-${n}`)) n++;
    return `${type}-${n}`;
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
      canvas_in: { order: 'top-to-bottom', mode: 'B' },
    };
  }

  /** Garantit qu'un display led-perimeter porte un profil led complet. */
  private normalizeLed(display: DisplayConfig): DisplayConfig {
    if (display.type !== LED_PERIMETER_TYPE) return display;
    if (display.led) {
      // Complète canvas_in si absent (rétro-compat profils partiels).
      if (!display.led.canvas_in) {
        return { ...display, led: { ...display.led, canvas_in: { order: 'top-to-bottom', mode: 'B' } } };
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
    return ledPitchMm(pitch);
  }

  /**
   * Hauteur dalle exprimée en cm pour la saisie (un moldu mesure sa dalle en cm,
   * pas en rangées de LED). En interne le modèle reste en `height` = rangées px
   * (= la matrice réelle) ; on dérive cm = rangées × pitch_mm / 10. PROP-014 §4.
   */
  getLedHeightCm(display: DisplayConfig): number {
    const mm = this.pitchMm(display.led?.pitch);
    const rows = display.led?.height;
    if (mm === 0 || !(typeof rows === 'number' && rows > 0)) return 0;
    return Math.round((rows * mm) / 10);
  }

  /**
   * Saisie physique en cm → rangées de LED (entier, via le pitch). Une dalle ne
   * peut pas avoir une fraction de rangée → on arrête à l'entier le plus proche
   * (le sous-libellé « = N rangées » affiche le résultat effectif).
   */
  onLedHeightCmChange(display: DisplayConfig, raw: string): void {
    const led = display.led;
    if (!led) return;
    const cm = parseFloat(String(raw).replace(',', '.'));
    const mm = this.pitchMm(led.pitch);
    if (!Number.isFinite(cm) || cm <= 0 || mm === 0) return;
    led.height = Math.max(1, Math.round((cm * 10) / mm));
    this.commitLed(display);
  }

  /** Largeur du ruban déroulé (px) = Σ côtés (m) × (1000 / pitch_mm). PROP-014 §3. */
  getLedRibbonWidth(display: DisplayConfig): number {
    return ledRibbonWidth(display.led);
  }

  private bandWidth(display: DisplayConfig): number {
    return ledBandWidth(display.led);
  }

  /** Largeur d'entrée processeur (px) — exposé au template (section Avancé). */
  getLedBandWidth(display: DisplayConfig): number {
    return this.bandWidth(display);
  }

  /** Nb de bandes = ceil(ribbonWidth / bandWidth) — même calcul que fold(). */
  getLedBandCount(display: DisplayConfig): number {
    const ribbon = this.getLedRibbonWidth(display);
    const bw = this.bandWidth(display);
    if (ribbon <= 0 || bw <= 0) return 0;
    return Math.ceil(ribbon / bw);
  }

  /**
   * Nb de bandes effectif = override processeur confirmé (`canvas_in.band_count`)
   * sinon la valeur dérivée. L'installateur peut figer le vrai nombre sur place.
   */
  getLedBandsEffective(display: DisplayConfig): number {
    return display.led?.canvas_in?.band_count ?? this.getLedBandCount(display);
  }

  /** Hauteur du canvas plié = bandes effectives × hauteur dalle. */
  getLedCanvasHeight(display: DisplayConfig): number {
    return this.getLedBandsEffective(display) * (display.led?.height || 0);
  }

  /** Provisoire tant que le band_count processeur n'est pas confirmé (PROP-014 §13). */
  isCanvasProvisional(display: DisplayConfig): boolean {
    return !display.led?.canvas_in?.band_count;
  }

  /**
   * Bascule « diffuser le canvas plié » (ADR-139, étape D).
   *
   * Éteint par défaut, et volontairement : servir un canvas plié à un processeur
   * qui n'en veut pas donne un ruban noir un soir de match. On n'active qu'après
   * avoir observé le rendu réel (mire + photo).
   */
  updateServeFolded(display: DisplayConfig, on: boolean): void {
    if (!display.led?.canvas_in) return;
    display.led.canvas_in.serve_folded = on;
    this.commitLed(display);
  }

  /**
   * Résolution de chaque bloc en pixels — ex. `1600 × 120`, ou
   * `1600 × 120, 960 × 120` si les côtés diffèrent.
   *
   * On saisit des mètres et un pitch parce que c'est ce qui décrit la réalité
   * physique, mais installateurs et régies parlent en pixels. Sans ce rappel,
   * impossible de vérifier que la géométrie décrit bien le matériel posé — et
   * l'écart ne se voit qu'un soir de match.
   */
  getLedSideResolutions(display: DisplayConfig): string {
    const led = display.led;
    const mm = ledPitchMm(led?.pitch);
    const h = led?.height ?? 0;
    if (mm === 0 || h <= 0 || !led?.sides?.length) return '—';
    const uniques = [...new Set(led.sides.map((m) => Math.round(m * (1000 / mm))))];
    return uniques.map((w) => `${w} × ${h}`).join(', ');
  }

  /** Création en masse en cours — désarme le bouton pour éviter le double envoi. */
  bulkBusy = false;
  /** Compte-rendu de la dernière création en masse, affiché à côté du bouton. */
  bulkResult: string | null = null;

  /**
   * Déclare la variante `led-perimeter` manquante sur toutes les vidéos du club.
   *
   * Ce n'est pas un encodage : la variante pointe vers la vidéo elle-même, puisque
   * le fichier EST déjà le ruban. Ce qu'on lève, c'est le prérequis du pliage
   * automatique — sans variante, `substituteFoldedCanvas` n'a rien à substituer.
   *
   * Les vidéos ayant déjà une variante sont laissées intactes côté serveur : un
   * opérateur a pu y mettre un recadrage manuel qu'on ne doit pas écraser.
   */
  createLedVariantsInBulk(): void {
    if (!this.siteId || this.bulkBusy) return;
    this.bulkBusy = true;
    this.bulkResult = null;
    this.http
      .post<{
        created: number;
        skipped: number;
        excluded: number;
        failed: number;
        total: number;
        exclusions?: Array<{ filename: string; reason: string }>;
      }>(
        `${environment.apiUrl}/sites/${this.siteId}/led-variants/bulk`,
        {},
        { withCredentials: true }
      )
      .subscribe({
        next: (r) => {
          this.bulkBusy = false;
          const parts = [`${r.created} créée(s)`];
          if (r.skipped) parts.push(`${r.skipped} déjà en place`);
          // Nommer les écartées : sans ça, « 0 créée(s) » se lit comme une panne
          // alors que le club n'a que des clips TV, et l'opérateur ne sait pas
          // qu'il doit déclarer la variante à la main s'il en veut une.
          if (r.excluded) {
            const names = (r.exclusions ?? []).map((x) => x.filename).join(', ');
            parts.push(`${r.excluded} écartée(s) — format TV${names ? ` : ${names}` : ''}`);
          }
          if (r.failed) parts.push(`${r.failed} en échec`);
          this.bulkResult = parts.join(', ');
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.bulkBusy = false;
          // On montre le message serveur : « ce site n'a pas d'écran LED déclaré »
          // est autrement plus utile qu'un « erreur » générique.
          this.bulkResult = e?.error?.error ?? 'Échec de la création en masse';
          this.cdr.markForCheck();
        },
      });
  }

  /** Largeur d'entrée dérivée (px) — le plus long côté. Exposé au template. */
  getLedDerivedBandWidth(display: DisplayConfig): number {
    return ledDerivedBandWidth(display.led);
  }

  /**
   * Largeur d'entrée du processeur : vide → repasse sur le dérivé du terrain.
   *
   * Ce champ n'existait pas et valait 1920 en dur pour toute la flotte. Un club dont
   * les côtés ne font pas 1920 px se retrouvait avec du padding dans chaque bande,
   * sans aucun moyen de le corriger depuis le dashboard.
   */
  updateBandWidth(display: DisplayConfig, raw: string): void {
    if (!display.led?.canvas_in) return;
    const v = parseInt(String(raw).trim(), 10);
    display.led.canvas_in.band_width = Number.isFinite(v) && v > 0 ? v : undefined;
    this.commitLed(display);
  }

  /** Override install du nb de bandes : vide → repasse en provisoire (dérivé). */
  updateBandCount(display: DisplayConfig, raw: string): void {
    if (!display.led?.canvas_in) return;
    const v = parseInt(String(raw).trim(), 10);
    display.led.canvas_in.band_count = Number.isFinite(v) && v > 0 ? v : undefined;
    this.commitLed(display);
  }

  // --- Côtés (cases éditables) ---

  trackBySideIndex(index: number): number {
    return index;
  }

  /** Périmètre total (m) = Σ côtés. */
  getLedPerimeterM(display: DisplayConfig): number {
    return (display.led?.sides ?? []).reduce((a, b) => a + b, 0);
  }

  /** Met à jour un côté (m). Ignore une saisie ≤ 0 ou non numérique. */
  updateSide(display: DisplayConfig, index: number, raw: string): void {
    if (!display.led) return;
    const v = parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    const sides = [...(display.led.sides ?? [])];
    sides[index] = v;
    display.led.sides = sides;
    this.commitLed(display);
  }

  /** Ajoute un côté (max 8) — duplique le dernier comme valeur de départ. */
  addSide(display: DisplayConfig): void {
    if (!display.led) return;
    const sides = display.led.sides ?? [];
    if (sides.length >= 8) return;
    const seed = sides.length > 0 ? sides[sides.length - 1] : 10;
    display.led.sides = [...sides, seed];
    this.commitLed(display);
  }

  /** Retire un côté (garde toujours au moins 1). */
  removeSide(display: DisplayConfig, index: number): void {
    if (!display.led) return;
    const sides = [...(display.led.sides ?? [])];
    if (sides.length <= 1) return;
    sides.splice(index, 1);
    display.led.sides = sides;
    this.commitLed(display);
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
   * Espacements proposés (m) : diviseurs du PGCD des côtés ≥ 4 m → angles alignés +
   * nombre entier de répétitions (PROP-014 §4, anti-drift : jamais saisie libre).
   * Gère les côtés DÉCIMAUX (ex. 4,5 m) en travaillant en dixièmes de mètre : ×10
   * préserve exactement les options des côtés entiers, et débloque 4,5 m & co.
   * La valeur courante est toujours incluse pour ne pas la perdre.
   */
  getSpacingOptions(display: DisplayConfig): number[] {
    const led = display.led;
    const current = led?.spacing_m;
    // Dixièmes de mètre : 4,5 m → 45, 40 m → 400. Le PGCD se calcule sur entiers.
    const tenths = (led?.sides ?? [])
      .filter((s) => Number.isFinite(s) && s > 0)
      .map((s) => Math.round(s * 10));
    const opts = new Set<number>();

    if (tenths.length > 0) {
      const g = tenths.reduce((a, b) => this.gcd(a, b)); // PGCD en dixièmes
      for (let d = 1; d <= g; d++) {
        if (g % d === 0 && d >= 40) opts.add(d / 10); // diviseurs ≥ 4 m
      }
      // Fallback : si aucun diviseur ≥ 4 m (petits côtés), proposer au moins le PGCD.
      if (opts.size === 0 && g > 0) opts.add(g / 10);
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
