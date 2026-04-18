/**
 * PreferencesMenuComponent — ADR-062 famille UX/Préférences (Pi)
 * Menu ⚙️ Préférences de la télécommande Pi. Options per-device uniquement.
 * RÈGLE : aucune option sécurité ou feature métier dans ce composant.
 */
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RemotePreferencesService, RemotePreferences } from './remote-preferences.service';

@Component({
  selector: 'app-preferences-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="prefs-panel" role="dialog" aria-label="Préférences">
      <div class="prefs-header">
        <span>Préférences</span>
        <button (click)="dismissed.emit()" aria-label="Fermer">✕</button>
      </div>

      <ul class="prefs-list">
        <li>
          <label for="pref-haptics">Vibrations (haptique)</label>
          <input id="pref-haptics" type="checkbox" [checked]="prefs.haptics"
                 (change)="update('haptics', $any($event.target).checked)">
        </li>
        <li>
          <label for="pref-contrast">Contraste élevé</label>
          <input id="pref-contrast" type="checkbox" [checked]="prefs.highContrast"
                 (change)="update('highContrast', $any($event.target).checked)">
        </li>
        <li>
          <label for="pref-rotation">Bloquer rotation écran</label>
          <input id="pref-rotation" type="checkbox" [checked]="prefs.lockRotation"
                 (change)="update('lockRotation', $any($event.target).checked)">
        </li>
        <li>
          <label for="pref-fontsize">Taille du texte</label>
          <select id="pref-fontsize" [value]="prefs.fontSize"
                  (change)="update('fontSize', $any($event.target).value)">
            <option value="normal">Normal</option>
            <option value="large">Grand</option>
          </select>
        </li>
      </ul>

      <button class="prefs-reset" (click)="prefsService.reset()">Réinitialiser</button>
    </div>
  `,
  styles: [`
    .prefs-panel { background: var(--bg-secondary, #1a1a2e); color: var(--text-primary, #fff); border-radius: 12px; padding: 20px; min-width: 280px; max-width: 90vw; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    .prefs-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; }
    .prefs-header button { background: transparent; border: 0; color: inherit; font-size: 1.2rem; cursor: pointer; }
    .prefs-list { list-style: none; padding: 0; margin: 0 0 16px; }
    .prefs-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .prefs-reset { width: 100%; padding: 10px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 8px; cursor: pointer; }
  `],
})
export class PreferencesMenuComponent {
  @Input() siteId: string = '';
  @Output() dismissed = new EventEmitter<void>();

  readonly prefsService = inject(RemotePreferencesService);

  get prefs(): RemotePreferences {
    return this.prefsService.prefs;
  }

  update<K extends keyof RemotePreferences>(key: K, value: RemotePreferences[K]): void {
    this.prefsService.update(key, value);
  }
}
