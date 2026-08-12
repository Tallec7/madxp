import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../../environments/environment';
import { DisplayConfig } from '../../../../../core/models';

/** Rectangle de détourage, en pixels de la source (PROP-015). */
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasRow {
  video_id: string;
  filename: string;
  source: { width: number; height: number };
  source_url: string | null;
  expected: { width: number; height: number } | null;
  matches_expected: boolean | null;
  has_variant: boolean;
  layout: string | null;
  /** Détourage VALIDÉ par un opérateur. `null` = on plie le fichier entier. */
  crop: CropRect | null;
  canvas: { status: string; url: string | null; updated_at: string | null };
}

/** Réponse de l'analyse des marges — une proposition, jamais une action. */
interface CropProposal {
  crop: CropRect | null;
  source?: { width: number; height: number };
  target?: { width: number; height: number };
  recommended: boolean;
  reason: string;
  marginFraction?: number;
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

        <!-- Scale façon B2B (scène 1920px) — opt-in, jamais par défaut. Un scale != 1
             réintroduit un flou d'interpolation sur toute fenêtre PC != 1920px de large ;
             à activer seulement après validation terrain (cf. .claude/rules/led.md).
             Un toggle PAR display : un site peut avoir plusieurs rubans LED (ADR-143),
             chacun avec son propre état — jamais un seul toggle partagé qui refléterait
             silencieusement le premier display trouvé. -->
        <label
          class="lco__toggle-row"
          *ngFor="let d of ledDisplays"
          [attr.data-testid]="'lco-scene-scaling-row-' + d.index"
        >
          <input
            type="checkbox"
            [attr.data-testid]="'lco-scene-scaling-checkbox-' + d.index"
            [checked]="!!d.led?.canvas_in?.scene_scaling"
            [disabled]="savingSceneScaling === d.index"
            (change)="toggleSceneScaling(d.index)"
          />
          <span
            >Scaler le rendu sur la largeur de fenêtre (façon B2B, scène 1920px) — {{ d.name }} — expérimental,
            désactivé par défaut. Peut introduire un flou si la fenêtre PC ne fait pas 1920px de large.</span
          >
        </label>

        <table class="lco__table" *ngIf="!loading && rows.length">
          <thead>
            <tr><th>Vidéo</th><th>Livré</th><th>Marges</th><th>Canvas</th><th>Aperçu</th><th></th></tr>
          </thead>
          <tbody>
            <ng-container *ngFor="let r of rows">
            <tr [attr.data-testid]="'lco-row-' + r.video_id">
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
                <!-- Le détourage n'est JAMAIS automatique : on propose, l'opérateur
                     tranche. Un visuel volontairement sur fond noir est
                     indistinguable d'un export mal cadré (PROP-015). -->
                <span
                  *ngIf="r.crop"
                  class="lco__badge lco__badge--ok"
                  [attr.data-testid]="'lco-crop-badge-' + r.video_id"
                  >détouré {{ r.crop.w }} × {{ r.crop.h }}</span
                >
                <button
                  *ngIf="r.crop"
                  type="button"
                  class="lco__del"
                  [attr.data-testid]="'lco-crop-clear-' + r.video_id"
                  title="Revenir au fichier entier, marges comprises"
                  [disabled]="busy[r.video_id]"
                  (click)="clearCrop(r)"
                >
                  Annuler
                </button>
                <button
                  *ngIf="!r.crop"
                  type="button"
                  class="lco__redo"
                  [attr.data-testid]="'lco-crop-detect-' + r.video_id"
                  title="Mesurer les marges noires — rien ne sera appliqué sans ta validation"
                  [disabled]="!r.has_variant || busy[r.video_id]"
                  (click)="detectCrop(r)"
                >
                  {{ busy[r.video_id] ? 'Analyse…' : 'Analyser' }}
                </button>
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

            <!-- Proposition de détourage : visible seulement après une analyse
                 explicite, et refermable sans rien appliquer. -->
            <tr *ngIf="proposals[r.video_id] as p" [attr.data-testid]="'lco-crop-panel-' + r.video_id">
              <td colspan="6" class="lco__crop">
                <p class="lco__crop-reason" [class.lco__crop-reason--no]="!p.recommended">
                  {{ p.recommended ? '✂️' : 'ℹ️' }} {{ p.reason }}
                </p>

                <div class="lco__crop-preview" *ngIf="p.recommended && p.crop && r.source_url">
                  <figure>
                    <figcaption>Aujourd'hui</figcaption>
                    <div class="lco__frame" [style.aspectRatio]="frameRatio(r)">
                      <video [src]="r.source_url" muted loop autoplay playsinline class="lco__fit"></video>
                    </div>
                  </figure>
                  <figure>
                    <figcaption>Après détourage</figcaption>
                    <div class="lco__frame" [style.aspectRatio]="frameRatio(r)">
                      <video
                        [src]="r.source_url"
                        muted
                        loop
                        autoplay
                        playsinline
                        class="lco__crop-video"
                        [ngStyle]="cropStyle(r, p.crop)"
                      ></video>
                    </div>
                  </figure>
                </div>

                <div class="lco__crop-actions">
                  <button
                    type="button"
                    *ngIf="p.recommended && p.crop"
                    class="lco__apply"
                    [attr.data-testid]="'lco-crop-apply-' + r.video_id"
                    [disabled]="busy[r.video_id]"
                    (click)="applyCrop(r, p.crop)"
                  >
                    Appliquer ce détourage
                  </button>
                  <button
                    type="button"
                    class="lco__redo"
                    [attr.data-testid]="'lco-crop-dismiss-' + r.video_id"
                    (click)="dismissProposal(r)"
                  >
                    Fermer
                  </button>
                </div>
              </td>
            </tr>
            </ng-container>
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
    .lco__toggle-row { display: flex; align-items: flex-start; gap: .4rem; font-size: .8rem; color: #666; margin: .5rem 0 .75rem; cursor: pointer; }
    .lco__toggle-row input { margin-top: .15rem; flex-shrink: 0; }
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
    .lco__redo, .lco__del, .lco__apply { font-size: .78rem; padding: .15rem .5rem; cursor: pointer; }
    .lco__del { margin-right: .3rem; color: #b91c1c; }
    .lco__apply { margin-right: .4rem; font-weight: 600; color: #166534; }
    .lco__crop { background: rgba(200,120,40,.05); }
    .lco__crop-reason { margin: 0 0 .5rem; font-size: .82rem; color: #92400e; }
    .lco__crop-reason--no { color: #475569; }
    .lco__crop-preview { display: flex; gap: 1rem; margin-bottom: .5rem; }
    .lco__crop-preview figure { margin: 0; flex: 1; min-width: 0; }
    .lco__crop-preview figcaption { font-size: .75rem; color: #64748b; margin-bottom: .2rem; }
    /* Le cadre reproduit le format d'UN CÔTÉ du ruban : c'est dans ce cadre-là que
       le pliage va faire tenir la vidéo, donc c'est le seul aperçu honnête. */
    .lco__frame { position: relative; overflow: hidden; background: #000; border-radius: 2px; }
    .lco__fit { width: 100%; height: 100%; object-fit: contain; display: block; }
    .lco__crop-video { position: absolute; object-fit: fill; }
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
  /** Propositions de détourage en attente d'arbitrage — jamais appliquées seules. */
  proposals: Record<string, CropProposal | null> = {};

  /** Displays du site — chargés uniquement pour localiser les led-perimeter et leur
   * toggle scene_scaling (pas d'écran dédié à la config displays pour l'instant).
   * Un site peut avoir plusieurs rubans LED (ADR-143) : `ledDisplays` liste TOUS les
   * displays `type === 'led-perimeter'`, chacun édité individuellement par son `index`
   * — jamais un seul état partagé qui refléterait silencieusement le premier trouvé. */
  private displays: DisplayConfig[] = [];
  ledDisplays: DisplayConfig[] = [];
  /** Index du display dont le PATCH est en cours, ou `null` si aucun. */
  savingSceneScaling: number | null = null;

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
    if (this.open && !this.displays.length) this.loadDisplays();
  }

  /** Localise TOUS les displays led-perimeter du site pour afficher/piloter leur
   * `scene_scaling` individuellement. */
  private loadDisplays(): void {
    if (!this.siteId) return;
    this.http
      .get<{ displays: DisplayConfig[] }>(`${environment.apiUrl}/sites/${this.siteId}/displays`, {
        withCredentials: true,
      })
      .subscribe({
        next: (r) => {
          this.displays = r.displays ?? [];
          this.ledDisplays = this.displays.filter((d) => d.type === 'led-perimeter');
          this.cdr.markForCheck();
        },
        // Silencieux : ce toggle est secondaire, l'écran Canvas reste utilisable sans lui.
        error: () => this.cdr.markForCheck(),
      });
  }

  /**
   * Écrit `scene_scaling` sur le display led-perimeter d'index `displayIndex`. Le
   * PATCH `/displays` remplace le tableau ENTIER (Joi `updateDisplays` — pas de patch
   * partiel côté API) : on renvoie donc tous les displays chargés, avec un seul champ
   * modifié sur le display ciblé — les autres restent inchangés.
   */
  toggleSceneScaling(displayIndex: number): void {
    if (this.savingSceneScaling !== null || !this.siteId) return;
    const target = this.displays.find((d) => d.index === displayIndex);
    if (!target?.led) return;
    const next = !target.led.canvas_in?.scene_scaling;
    const displays = this.displays.map((d) => {
      if (d.index !== displayIndex || !d.led) return d;
      return { ...d, led: { ...d.led, canvas_in: { ...d.led.canvas_in, scene_scaling: next } } } as DisplayConfig;
    });
    this.savingSceneScaling = displayIndex;
    this.http
      .patch(`${environment.apiUrl}/sites/${this.siteId}/displays`, { displays }, { withCredentials: true })
      .subscribe({
        next: () => {
          this.displays = displays;
          this.ledDisplays = displays.filter((d) => d.type === 'led-perimeter');
          this.savingSceneScaling = null;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.savingSceneScaling = null;
          this.error = e?.error?.error ?? 'Enregistrement impossible';
          this.cdr.markForCheck();
        },
      });
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

  /**
   * Mesure les marges de la vidéo. **Aucune écriture** : le serveur rend un
   * rectangle et son argumentaire, l'opérateur décide ensuite.
   *
   * Le club cible est passé explicitement : le format visé dépend du ruban du club
   * consulté, pas du propriétaire de la vidéo (une source partagée se plie
   * différemment d'un club à l'autre).
   */
  detectCrop(r: CanvasRow): void {
    if (!r.has_variant || this.busy[r.video_id]) return;
    this.busy = { ...this.busy, [r.video_id]: true };
    this.http
      .post<CropProposal>(
        `${environment.apiUrl}/videos/${r.video_id}/variants/led-perimeter/crop/detect`,
        { target_site_id: this.siteId },
        { withCredentials: true }
      )
      .subscribe({
        next: (p) => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.proposals = { ...this.proposals, [r.video_id]: p };
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.error = e?.error?.error ?? 'Analyse impossible';
          this.cdr.markForCheck();
        },
      });
  }

  /** Enregistre le détourage validé. C'est ce geste-là, et lui seul, qui détoure. */
  applyCrop(r: CanvasRow, crop: CropRect): void {
    this.writeCrop(r, crop);
  }

  /** Revient au fichier entier, marges comprises. */
  clearCrop(r: CanvasRow): void {
    this.writeCrop(r, null);
  }

  dismissProposal(r: CanvasRow): void {
    this.proposals = { ...this.proposals, [r.video_id]: null };
    this.cdr.markForCheck();
  }

  /**
   * Format d'UN CÔTÉ du ruban — le cadre dans lequel le pliage fera tenir la vidéo.
   * Repli `16 / 9` quand le profil est illisible : mieux vaut un aperçu approximatif
   * qu'une division par zéro qui masque tout le panneau.
   */
  frameRatio(r: CanvasRow): string {
    const e = r.expected ?? this.expected;
    return e && e.width > 0 && e.height > 0 ? `${e.width} / ${e.height}` : '16 / 9';
  }

  /**
   * Positionne la vidéo pour que SEUL le rectangle détouré remplisse le cadre.
   *
   * La vidéo est agrandie du facteur source/crop puis décalée de l'origine du
   * rectangle — c'est l'équivalent CSS exact du `crop=w:h:x:y` que ffmpeg
   * appliquera. L'aperçu montre donc ce qui sera diffusé, pas une approximation.
   */
  cropStyle(r: CanvasRow, crop: CropRect): Record<string, string> {
    const sw = r.source?.width || 0;
    const sh = r.source?.height || 0;
    if (!sw || !sh || !crop.w || !crop.h) return {};
    return {
      width: `${(sw / crop.w) * 100}%`,
      height: `${(sh / crop.h) * 100}%`,
      left: `${(-crop.x / crop.w) * 100}%`,
      top: `${(-crop.y / crop.h) * 100}%`,
    };
  }

  private writeCrop(r: CanvasRow, crop: CropRect | null): void {
    if (this.busy[r.video_id]) return;
    this.busy = { ...this.busy, [r.video_id]: true };
    this.http
      .put(
        `${environment.apiUrl}/videos/${r.video_id}/variants/led-perimeter/crop`,
        { crop },
        { withCredentials: true }
      )
      .subscribe({
        next: () => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.proposals = { ...this.proposals, [r.video_id]: null };
          // Le canvas déjà fabriqué l'a été sur le fichier entier : son empreinte
          // change avec le `crop`, il redeviendra donc « aucun » puis sera refait
          // au prochain déploiement. On relit pour montrer cet état réel.
          this.load();
        },
        error: (e) => {
          this.busy = { ...this.busy, [r.video_id]: false };
          this.error = e?.error?.error ?? 'Enregistrement impossible';
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
