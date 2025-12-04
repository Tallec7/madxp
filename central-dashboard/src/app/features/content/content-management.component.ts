import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-content-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <div class="card">
        <h1>Gestion du contenu</h1>
        <p class="subtitle">
          Cette section permettra bientôt d'uploader des vidéos, de gérer les bibliothèques
          et de déployer le contenu vers les sites ou groupes sélectionnés.
        </p>
        <div class="placeholder">
          <div class="placeholder-icon">🎬</div>
          <p>En construction... Les APIs et services sont prêts, il reste à finaliser l'UI.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 2rem; max-width: 960px; margin: 0 auto; }
    .card { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }
    .subtitle { color: #64748b; margin-bottom: 2rem; }
    .placeholder { text-align: center; border: 2px dashed #cbd5f5; border-radius: 16px; padding: 2rem; background: #f8fafc; }
    .placeholder-icon { font-size: 3rem; margin-bottom: 1rem; }
  `]
})
export class ContentManagementComponent {}
