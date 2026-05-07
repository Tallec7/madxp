import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DisplayConfig, ReceiverConfig, ReceiverInfo } from '../../../../../core/models';

interface DisplayTemplate {
  icon: string;
  label: string;
  type: string;
  resolution: string;
}

const DISPLAY_TEMPLATES: DisplayTemplate[] = [
  { icon: '📺', label: 'TV classique', type: 'tv', resolution: '1920x1080' },
  { icon: '🖥️', label: 'Bandeau LED horizontal', type: 'led-banner', resolution: '1920x384' },
  { icon: '📱', label: 'Totem portrait', type: 'totem', resolution: '1080x1920' },
  { icon: '🖥️', label: 'Mur LED', type: 'led-wall', resolution: '1920x1080' },
];

@Component({
  selector: 'app-displays-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="displays-list">
      <div class="display-row" *ngFor="let display of displays; trackBy: trackByIndex">
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
export class DisplaysEditorComponent {
  @Input() displays: DisplayConfig[] = [];
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
    private cdr: ChangeDetectorRef
  ) {}

  trackByIndex(_: number, display: DisplayConfig): number {
    return display.index;
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

  // --- Receiver UX (Phase 8) ---

  formatMac(mac: string): string {
    // 'AA:BB:CC:DD:EE:FF' → 'AA:BB:C…FF'
    if (!mac || mac.length < 8) return mac;
    return mac.substring(0, 6) + '…' + mac.substring(mac.length - 2);
  }

  formatLastSeen(iso: string): string {
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

  private getNextIndex(): number {
    if (this.displays.length === 0) return 0;
    return Math.max(...this.displays.map(d => d.index)) + 1;
  }
}
