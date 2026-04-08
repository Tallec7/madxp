import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-club-help-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-backdrop" *ngIf="visible" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()">
        <button class="close-btn" (click)="close()" aria-label="Fermer">&times;</button>
        <h2>📘 {{ (isSaas ? 'clubPortal.helpSaasTitle' : 'clubPortal.helpTitle') | translate }}</h2>

        <ng-container *ngIf="isSaas">
          <section>
            <h3>📺 1. Ouvrir l'écran sur votre TV</h3>
            <p>Cliquez sur <strong>« Ouvrir l'écran »</strong> dans le bandeau en haut de la page. Scannez le QR code avec votre TV ou tablette pour lancer l'affichage. L'écran tourne en continu sur n'importe quel navigateur connecté à Internet — aucun matériel spécifique requis.</p>
            <p class="tip">💡 Conseil : sur Android TV / tablette, ajoutez l'URL à l'écran d'accueil pour lancer l'app en plein écran (PWA).</p>
          </section>

          <section>
            <h3>🎮 2. Piloter depuis votre smartphone</h3>
            <p>Cliquez sur <strong>« Ouvrir la télécommande »</strong> ou scannez le QR code correspondant. Changez de phase de match (avant / pendant / après) et déclenchez des vidéos manuelles en un tap.</p>
          </section>

          <section>
            <h3>📂 3. Organiser votre boucle</h3>
            <p>Dans la section principale, glissez-déposez vos vidéos pour modifier l'ordre, ajustez leur <strong>poids</strong> (fréquence d'affichage) et épinglez celles qui doivent rester en position fixe (ex : générique d'intro).</p>
            <p>Cliquez sur <strong>« Enregistrer »</strong> pour appliquer les changements — ils sont visibles immédiatement sur tous les écrans connectés.</p>
          </section>

          <section>
            <h3>🎬 4. Ajouter des vidéos</h3>
            <p>Utilisez le bouton d'upload pour importer vos vidéos (MP4 recommandé). Sur mobile, vous pouvez filmer directement avec <strong>« Enregistrer depuis la caméra »</strong>.</p>
            <p>Les vidéos sont stockées dans le cloud et servies en streaming — elles apparaissent instantanément dans votre bibliothèque.</p>
          </section>

          <section>
            <h3>📊 5. Suivre votre activité</h3>
            <p>L'onglet <strong>« Mon club »</strong> affiche en temps réel : le nombre d'écrans connectés, les sessions du jour, le temps d'écran et les impressions sponsors de la semaine.</p>
          </section>

          <section>
            <h3>❓ Questions fréquentes</h3>
            <ul>
              <li [innerHTML]="'clubPortal.faq.screens' | translate"></li>
              <li [innerHTML]="'clubPortal.faq.live' | translate"></li>
              <li [innerHTML]="'clubPortal.faq.offline' | translate"></li>
            </ul>
          </section>
        </ng-container>

        <ng-container *ngIf="!isSaas">
          <section>
            <h3>📂 Gérer votre boucle</h3>
            <p>Glissez-déposez vos vidéos pour organiser l'ordre, ajustez les poids et cliquez sur <strong>« Déployer »</strong> pour envoyer la configuration à votre boîtier Raspberry Pi.</p>
          </section>
          <section>
            <h3>🎬 Ajouter des vidéos</h3>
            <p>Uploadez vos vidéos (format MP4 recommandé), puis déployez-les sur votre boîtier. Elles seront copiées localement et jouées même sans Internet.</p>
          </section>
          <section>
            <h3>❓ Besoin d'aide ?</h3>
            <p>Contactez le support Neopro : <a href="mailto:support@neopro.bzh">support&#64;neopro.bzh</a></p>
          </section>
        </ng-container>

        <footer>
          <button class="btn-primary" (click)="close()">{{ 'common.close' | translate }}</button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.5);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .modal {
      background: white; border-radius: 16px;
      max-width: 720px; width: 100%;
      max-height: 90vh; overflow-y: auto;
      padding: 2rem; position: relative;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
    }
    .close-btn {
      position: absolute; top: 1rem; right: 1rem;
      background: none; border: none; font-size: 1.75rem;
      color: #64748b; cursor: pointer;
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .close-btn:hover { background: #f1f5f9; }
    h2 { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1e293b; }
    section {
      padding: 1rem 0;
      border-bottom: 1px solid #f1f5f9;
    }
    section:last-of-type { border-bottom: none; }
    h3 { margin: 0 0 0.5rem; font-size: 1rem; color: #1e293b; }
    p { margin: 0 0 0.5rem; font-size: 0.9375rem; color: #475569; line-height: 1.6; }
    p.tip {
      background: #eff6ff; border-left: 3px solid #3b82f6;
      padding: 0.5rem 0.75rem; border-radius: 4px;
      font-size: 0.875rem;
    }
    ul { margin: 0; padding-left: 1.25rem; }
    li { font-size: 0.9375rem; color: #475569; line-height: 1.7; }
    strong { color: #1e293b; }
    a { color: var(--neo-hockey-dark, #2022E9); text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer {
      margin-top: 1.5rem; padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
      display: flex; justify-content: flex-end;
    }
    .btn-primary {
      padding: 0.625rem 1.25rem; border-radius: 8px;
      background: var(--neo-hockey-dark, #2022E9); color: white;
      border: none; font-size: 0.875rem; font-weight: 500; cursor: pointer;
    }
    .btn-primary:hover { opacity: 0.9; }
  `]
})
export class ClubHelpModalComponent {
  @Input() visible = false;
  @Input() isSaas = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }
}
