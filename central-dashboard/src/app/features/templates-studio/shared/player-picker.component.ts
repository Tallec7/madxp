import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TemplatesStudioService } from '../templates-studio.service';
import type { Player } from '../templates-studio.types';

/**
 * Sélecteur de joueur réutilisable. Implémente `ControlValueAccessor` pour se
 * brancher dans un Reactive Form (`<app-player-picker formControlName="X" />`).
 *
 * Affiche un `<select>` avec les joueurs du site qui ont `cutout_status='ready'`
 * (S4-A : un joueur sans cutout peut quand même être picked, le résolveur
 * renverra `null` pour `player.cutoutUrl` mais `nom`/`numéro`/`poste` OK).
 *
 * Filtre `?onlyWithCutout=true` (Input) pour les templates qui exigent une
 * photo détourée (BUT, ENTRÉE) — masque les joueurs sans cutout.
 */
@Component({
  selector: 'app-player-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="pp">
      @if (loading()) {
        <span class="pp__loading">Chargement…</span>
      } @else if (filtered().length === 0) {
        <span class="pp__empty">
          Aucun joueur disponible
          @if (onlyWithCutout) {
            (avec photo détourée)
          }
          —
          <a routerLink="/templates-studio/players">ajouter un joueur</a>
        </span>
      } @else {
        <select
          [ngModel]="selectedId()"
          (ngModelChange)="onSelect($event)"
          [disabled]="isDisabled"
        >
          <option [ngValue]="null">— Choisir un joueur —</option>
          @for (p of filtered(); track p.id) {
            <option [ngValue]="p.id">
              #{{ p.numero ?? '?' }} {{ p.prenom }} {{ p.nom }}
              @if (p.cutout_status !== 'ready') {
                (photo en {{ p.cutout_status }})
              }
            </option>
          }
        </select>
      }
    </div>
  `,
  styles: [
    `
      .pp__loading,
      .pp__empty {
        color: #8b949e;
        font-size: 0.85em;
        a {
          color: #58a6ff;
        }
      }
      select {
        width: 100%;
        background: #0d1117;
        color: #e6edf3;
        border: 1px solid #30363d;
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 0.95em;
        &:focus {
          border-color: #58a6ff;
          outline: none;
        }
      }
    `,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PlayerPickerComponent),
      multi: true,
    },
  ],
})
export class PlayerPickerComponent implements OnInit, OnChanges, ControlValueAccessor {
  @Input() siteId: string | null = null;
  @Input() onlyWithCutout = false;

  private studio = inject(TemplatesStudioService);

  loading = signal(false);
  players = signal<Player[]>([]);
  filtered = signal<Player[]>([]);
  selectedId = signal<string | null>(null);
  isDisabled = false;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    if (this.siteId) this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && this.siteId) {
      this.load();
    }
    if (changes['onlyWithCutout']) {
      this.applyFilter();
    }
  }

  private load(): void {
    if (!this.siteId) return;
    this.loading.set(true);
    this.studio.listPlayers(this.siteId).subscribe({
      next: (players) => {
        this.players.set(players);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => {
        this.players.set([]);
        this.filtered.set([]);
        this.loading.set(false);
      },
    });
  }

  private applyFilter(): void {
    const all = this.players();
    this.filtered.set(
      this.onlyWithCutout
        ? all.filter((p) => p.cutout_status === 'ready' && !!p.photo_cutout_url)
        : all,
    );
  }

  onSelect(id: string | null): void {
    this.selectedId.set(id);
    this.onChange(id);
    this.onTouched();
  }

  // ── ControlValueAccessor ────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.selectedId.set(value ?? null);
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }
}
