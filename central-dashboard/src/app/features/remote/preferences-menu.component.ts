/**
 * PreferencesMenuComponent — ADR-062 famille UX/Préférences
 * Menu ⚙️ Préférences de la télécommande. Options per-device uniquement.
 * RÈGLE : aucune option sécurité ou feature métier dans ce composant.
 */
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RemotePreferencesService, RemotePreferences } from './services/remote-preferences.service';

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
