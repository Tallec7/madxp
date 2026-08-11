import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';

interface CanvasRow {
  video_id: string;
  filename: string;
  source: { width: number; height: number };
  expected: { width: number; height: number } | null;
  matches_expected: boolean | null;
  has_variant: boolean;
  layout: string | null;
  canvas: { status: string; url: string | null; updated_at: string | null };
}

/**
 * Vue d'ensemble des canvas LED d'un club.
 *
 * ## Pourquoi cet écran existe
 *
 * Le pliage se contrôlait une vidéo à la fois — banc d'essai, export par variante,
 * aperçu. Les défauts se découvraient donc en regardant la boucle tourner, un par un,
 * en conditions réelles : chez Piraths, un sponsor minuscule au centre d'une bande et
 * un autre rogné à droite ont coûté une soirée avant d'être compris.
 *
 * Or ce qui casse le rendu n'est presque jamais le pliage : c'est le FORMAT SOURCE.
 * Cet écran met donc côte à côte, pour chaque vidéo, ce que l'agence a livré et ce
 * que le ruban attend — l'écart saute aux yeux avant le match, pas pendant.
 */
@Component({
  selector: 'app-led-canvas-overview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lco" *ngIf="siteId" data-testid="led-canvas-overview">
      <button type="button" class="lco__toggle" data-testid="lco-toggle" (click)="toggle()">
        {{ open ? '▾' : '▸' }} 🖼️ Canvas du club
        <span class="lco__alert" *ngIf="open && problemCount > 0" data-testid="lco-alert"
          >⚠️ {{ problemCount }} à vérifier</span
        >
      </button>

      <div class="lco__body" *ngIf="open">
        <p class="lco__loading" *ngIf="loading">Lecture…</p>
        <p class="lco__error" *ngIf="error" data-testid="lco-error">{{ error }}</p>

        <p class="lco__expected" *ngIf="expected as e">
          Format attendu par le ruban : <strong>{{ e.width }} × {{ e.height }} px</strong>
          — c'est le chiffre à donner aux agences.
        </p>

        <table class="lco__table" *ngIf="!loading && rows.length">
          <thead>
            <tr><th>Vidéo</th><th>Livré</th><th>Canvas</th><th>Aperçu</th><th></th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows" [attr.data-testid]="'lco-row-' + r.video_id">
              <td class="lco__name">{{ r.filename }}</td>
              <td>
                <!-- Dimensions jamais mesurées : on ne conclut pas qu'un fichier
                     est inadapté alors qu'on ne l'a simplement pas mesuré. -->
                <span *ngIf="r.matches_expected === null" class="lco__badge lco__badge--unknown"
                  >non mesuré</span
                >
                <span *ngIf="r.matches_expected === true" class="lco__badge lco__badge--ok"
                  >{{ r.source.width }} × {{ r.source.height }}</span
                >
                <span *ngIf="r.matches_expected === false" class="lco__badge lco__badge--warn"
                  >{{ r.source.width }} × {{ r.source.height }} ≠ attendu</span
                >
              </td>
              <td>
                <span class="lco__badge" [class]="'lco__badge--' + statusClass(r.canvas.status)">{{
                  statusLabel(r.canvas.status)
                }}</span>
              </td>
              <td>
                <video
                  *ngIf="r.canvas.url"
                  class="lco__thumb"
                  [src]="r.canvas.url"
                  muted
                  loop
                  autoplay
                  playsinline
                ></video>
                <span class="lco__none" *ngIf="!r.canvas.url">—</span>
              </td>
              <td>
                <button
                  type="button"
                  class="lco__del"
                  [attr.data-testid]="'lco-del-' + r.video_id"
                  *ngIf="r.has_variant"
                  title="Retirer cette vidéo du ruban (la vidéo elle-même n'est pas supprimée)"
                  [disabled]="busy[r.video_id]"
                  (click)="remove(r)"
                >
                  Retirer
                </button>
                <button
                  type="button"
                  class="lco__redo"
                  [attr.data-testid]="'lco-redo-' + r.video_id"
                  [disabled]="!r.has_variant || busy[r.video_id]"
                  (click)="redo(r)"
                >
                  {{ busy[r.video_id] ? '…' : 'Refaire' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <p class="lco__empty" *ngIf="!loading && !rows.length && !error">
          Aucune vidéo rattachée à ce club.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .lco { margin-top: 1rem; border-top: 1px dashed rgba(200,120,40,.4); padding-top: .75rem; }
    .lco__toggle { background: none; border: 0; font-weight: 600; cursor: pointer; color: #a35a10; }
    .lco__alert { margin-left: .5rem; font-weight: 500; color: #b45309; }
    .lco__expected { font-size: .85rem; color: #555; margin: .5rem 0; }
    .lco__table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .lco__table th { text-align: left; font-weight: 600; padding: .25rem .4rem; color: #666; }
    .lco__table td { padding: .3rem .4rem; border-top: 1px solid rgba(0,0,0,.06); vertical-align: middle; }
    .lco__name { max-width: 15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lco__badge { padding: .1rem .45rem; border-radius: 3px; font-size: .78rem; white-space: nowrap; }
    .lco__badge--ok { background: #dcfce7; color: #166534; }
    .lco__badge--warn { background: #fef3c7; color: #92400e; }
    .lco__badge--unknown { background: #f1f5f9; color: #64748b; }
    .lco__badge--fail { background: #fee2e2; color: #991b1b; }
    .lco__badge--wait { background: #e0e7ff; color: #3730a3; }
    /* Le canvas est un ruban très large et très plat : une vignette carrée le
       rendrait illisible. On garde son ratio et on le laisse petit. */
    .lco__thumb { width: 8rem; height: auto; background: #000; border-radius: 2px; display: block; }
    .lco__redo, .lco__del { font-size: .78rem; padding: .15rem .5rem; cursor: pointer; }
    .lco__del { margin-right: .3rem; color: #b91c1c; }
    .lco__none, .lco__empty, .lco__loading { color: #94a3b8; }
    .lco__error { color: #b91c1c; }
  `],
})
export class LedCanvasOverviewComponent {
  @Input() siteId: string | null = null;

  open = false;
  loading = false;
  error: string | null = null;
  rows: CanvasRow[] = [];
  expected: { width: number; height: number } | null = null;
  busy: Record<string, boolean> = {};

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  /** Compte ce qui mérite un coup d'œil : format inadapté OU canvas absent/en échec. */
  get problemCount(): number {
    return this.rows.filter(
      (r) => r.matches_expected === false || r.canvas.status === 'failed' || r.canvas.status === 'missing'
    ).length;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open && !this.rows.length) this.load();
  }

  load(): void {
    if (!this.siteId) return;
    this.loading = true;
    this.error = null;
    this.http
      .get<{ expected: { width: number; height: number } | null; videos: CanvasRow[] }>(
        `${environment.apiUrl}/sites/${this.siteId}/led-canvases`,
        { withCredentials: true }
      )
      .subscribe({
        next: (r) => {
          this.rows = r.videos ?? [];
          this.expected = r.expected;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.loading = false;
          // Message serveur d'abord : « ce site n'a pas de ruban configuré » est
          // autrement plus utile qu'un « erreur » générique.
          this.error = e?.error?.error ?? 'Lecture impossible';
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Relance la fabrication du canvas. Le bouton est désarmé sans variante :
   * le pliage n'a rien à quoi s'accrocher (cf. « Créer les variantes LED »).
   */
  redo(r: CanvasRow): void {
    if (!r.has_variant || this.busy[r.video_id]) return;
    this.busy = { ...this.busy, [r.video_id]: true };
    this.http
      .post(`${environment.apiUrl}/videos/${r.video_id}/variants/led-perimeter/export`, {}, { withCredentials: true })
      .subscribe({
        next: () => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.load();
        },
        error: () => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Retire la variante ruban — donc le canvas avec elle.
   *
   * Ne supprime PAS la vidéo : un clip TV (carton jaune, temps mort) reste dans la
   * boucle, il cesse simplement d'être déclaré comme contenu de ruban. C'est le
   * pendant de « Créer les variantes LED manquantes », qui les avait toutes
   * déclarées sans distinguer ruban et TV.
   */
  remove(r: CanvasRow): void {
    if (!r.has_variant || this.busy[r.video_id]) return;
    this.busy = { ...this.busy, [r.video_id]: true };
    this.http
      .delete(`${environment.apiUrl}/videos/${r.video_id}/variants/led-perimeter`, { withCredentials: true })
      .subscribe({
        next: () => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.load();
        },
        error: (e) => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.error = e?.error?.error ?? 'Suppression impossible';
          this.cdr.markForCheck();
        },
      });
  }

  statusClass(s: string): string {
    return s === 'ready' ? 'ok' : s === 'failed' ? 'fail' : s === 'missing' ? 'warn' : 'wait';
  }

  statusLabel(s: string): string {
    return { ready: 'prêt', failed: 'échec', missing: 'aucun', processing: 'en cours', queued: 'en file' }[s] ?? s;
  }
}
