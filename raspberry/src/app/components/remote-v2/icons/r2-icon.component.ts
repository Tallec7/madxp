import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { R2_ICONS, R2IconName } from './r2-icon-registry';

/**
 * Composant icône unique pour Remote V2 (SPEC-V2-ICONS-01).
 *
 *   <app-r2-icon name="camera"></app-r2-icon>
 *   <app-r2-icon name="check" [size]="14" label="Validé"></app-r2-icon>
 *
 * - currentColor : hérite la couleur du parent via CSS `color`.
 * - aria-label : annonce pour lecteurs d'écran si l'icône n'est pas déjà
 *   accompagnée d'un texte visible.
 * - aria-hidden auto si pas de label (icône décorative).
 */
@Component({
  selector: 'app-r2-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-label]="label || null"
      [attr.aria-hidden]="label ? null : true"
      [attr.role]="label ? 'img' : null"
      [innerHTML]="svg"
    ></svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        line-height: 0;
        flex-shrink: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class R2IconComponent {
  @Input({ required: true }) set name(value: R2IconName) {
    // Sécurité : les SVG viennent UNIQUEMENT du registre statique (R2_ICONS).
    // Ne jamais brancher un input qui injecterait du SVG dynamique (user/API).
    this.svg = this.sanitizer.bypassSecurityTrustHtml(R2_ICONS[value]);
  }
  @Input() size: number | string = 16;
  @Input() label?: string;

  svg: SafeHtml = '';

  private readonly sanitizer = inject(DomSanitizer);
}
