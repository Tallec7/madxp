import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-updates-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <div class="card">
        <h1>Mises à jour logicielles</h1>
        <p class="subtitle">
          Planifiez et pilotez les mises à jour NEOPRO depuis ce tableau de bord.
          Les fonctionnalités détaillées (upload, déploiement, suivi, rollback) seront ajoutées prochainement.
        </p>
        <div class="placeholder">
          <div class="placeholder-icon">⬆️</div>
          <p>Module en préparation. Utilisez pour l'instant les scripts Raspberry pour déployer les nouvelles versions.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container { padding: 2rem; max-width: 960px; margin: 0 auto; }
    .card { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }
    .subtitle { color: #64748b; margin-bottom: 2rem; }
    .placeholder { text-align: center; border: 2px dashed #fde047; border-radius: 16px; padding: 2rem; background: #fffbeb; }
    .placeholder-icon { font-size: 3rem; margin-bottom: 1rem; }
  `]
})
export class UpdatesManagementComponent {}
