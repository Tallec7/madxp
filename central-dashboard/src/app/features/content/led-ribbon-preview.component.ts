import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Aperçu du rendu d'une vidéo sur UN CÔTÉ de ruban LED.
 *
 * ## Pourquoi un côté, et pas le tour
 *
 * Le contenu est cadré par côté dans l'immense majorité des cas (une agence livre
 * un fichier à la taille d'un côté, dupliqué sur les panneaux). Montrer le tour
 * complet donnerait une vignette de 40:1 illisible ; montrer un côté, à la bonne
 * proportion, montre exactement ce que verra un spectateur devant ce panneau.
 *
 * ## Pourquoi la vraie vidéo
 *
 * Un schéma en aplats ne dit pas si un logo est écrasé. La vidéo réelle, rendue
 * avec la MÊME règle de remplissage que ffmpeg appliquera, le montre d'un coup
 * d'œil — bandes noires, déformation, ou motif répété.
 *
 * | Mise en page | Rendu CSS équivalent |
 * | ------------ | -------------------- |
 * | `centered`   | `object-fit: contain` — bandes noires si le ratio diffère |
 * | `stretched`  | `object-fit: fill` — déformation visible |
 * | `repeated`   | N copies `contain` côte à côte, N = largeur / cadence |
 * | `scrolling`  | idem, avec un défilement continu |
 *
 * ## Ce que ça n'est pas
 *
 * Pas le canvas plié envoyé au processeur : c'est le rendu LOGIQUE, ce que l'œil
 * verra sur le panneau. Le pliage est une couche de transport, invisible ici.
 */
@Component({
  selector: 'app-led-ribbon-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lrp" *ngIf="videoUrl" data-testid="led-ribbon-preview">
      <div class="lrp__head">
        <span class="lrp__title">Aperçu — un côté</span>
        <span class="lrp__dims">{{ targetWidth }}×{{ targetHeight }} px</span>
        <span class="lrp__repeat" *ngIf="sidesCount > 1">
          · identique sur {{ sidesCount }} côtés
        </span>
      </div>

      <!-- Boîte au ratio EXACT du côté : c'est elle qui rend les bandes noires
           et la déformation visibles sans avoir à les expliquer. -->
      <div
        class="lrp__ribbon"
        [style.aspect-ratio]="targetWidth + ' / ' + targetHeight"
        data-testid="led-ribbon-box"
      >
        <div class="lrp__track" [class.lrp__track--scroll]="layout === 'scrolling'">
          <video
            *ngFor="let i of copies"
            class="lrp__video"
            [style.object-fit]="objectFit"
            [style.width.%]="100 / copies.length"
            [src]="videoUrl"
            muted
            loop
            autoplay
            playsinline
            preload="metadata"
          ></video>
        </div>
      </div>

      <div class="lrp__foot" *ngIf="copies.length > 1">
        Motif répété {{ copies.length }} fois par côté
      </div>
    </div>
  `,
  styles: [
    `
      .lrp {
        margin-top: 0.5rem;
      }

      .lrp__head {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        flex-wrap: wrap;
        font-size: 0.75rem;
        color: #64748b;
        margin-bottom: 0.3rem;
      }

      .lrp__title {
        font-weight: 600;
        color: #334155;
      }

      .lrp__dims {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      /* Fond noir : sur un ruban LED, « vide » = éteint. Un fond blanc
         donnerait une fausse idée du rendu. */
      .lrp__ribbon {
        width: 100%;
        background: #000;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        overflow: hidden;
      }

      .lrp__track {
        display: flex;
        width: 100%;
        height: 100%;
      }

      .lrp__video {
        height: 100%;
        display: block;
        background: #000;
      }

      /* Défilement : la piste glisse d'une largeur puis reboucle. */
      .lrp__track--scroll {
        animation: lrp-scroll 8s linear infinite;
      }

      @keyframes lrp-scroll {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(-100%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .lrp__track--scroll {
          animation: none;
        }
      }

      .lrp__foot {
        margin-top: 0.25rem;
        font-size: 0.72rem;
        color: #64748b;
      }
    `,
  ],
})
export class LedRibbonPreviewComponent {
  /** URL de la vidéo à prévisualiser. Sans elle, rien n'est rendu. */
  @Input() videoUrl: string | null = null;
  /** Largeur du cadre visé (px) — un côté du ruban. */
  @Input() targetWidth = 1600;
  /** Hauteur du cadre visé (px). */
  @Input() targetHeight = 160;
  /** Mise en page appliquée. `undefined` accepté : une variante peut ne pas en avoir. */
  @Input() layout: string | null | undefined = 'centered';
  /** Nombre de côtés du ruban (pour la mention « identique sur N côtés »). */
  @Input() sidesCount = 1;
  /** Cadence du motif (px). `0` → pas de pavage, une seule copie. */
  @Input() cellPx = 0;

  /** Règle de remplissage CSS équivalente à ce que ffmpeg appliquera. */
  get objectFit(): string {
    return this.layout === 'stretched' ? 'fill' : 'contain';
  }

  /**
   * Nombre de copies à afficher. Borné à 8 : au-delà, chaque copie fait quelques
   * pixels et l'aperçu ne montre plus rien d'utile — mieux vaut un aperçu
   * approximatif qu'une bouillie illisible.
   */
  get copies(): number[] {
    const tiled = this.layout === 'repeated' || this.layout === 'scrolling';
    if (!tiled || this.cellPx <= 0) return [0];
    const n = Math.max(1, Math.min(8, Math.round(this.targetWidth / this.cellPx)));
    return Array.from({ length: n }, (_, i) => i);
  }
}
