import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SitesService } from '../../../../core/services/sites.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Subject, takeUntil, finalize } from 'rxjs';

interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  duration?: number;
  truncated?: boolean;
  timedOut?: boolean;
  error?: string;
}

interface HistoryEntry {
  command: string;
  timestamp: Date;
  success: boolean;
}

@Component({
  selector: 'app-command-executor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="command-executor">
      <div class="executor-header">
        <span class="role-badge" [class]="userRole">{{ getRoleLabel() }}</span>
      </div>

      <!-- Info sécurité -->
      <div class="security-info" *ngIf="userRole === 'operator'">
        <span class="info-icon">ℹ️</span>
        <span>Commandes limitées : ls, cat, df, journalctl, ps, ping, etc.</span>
      </div>

      <div class="security-info warning" *ngIf="userRole === 'super_admin' || userRole === 'superadmin'">
        <span class="info-icon">⚠️</span>
        <span>Mode super admin : commandes destructives bloquées (rm -rf, shutdown...)</span>
      </div>

      <!-- Input -->
      <div class="input-section">
        <div class="input-row">
          <textarea
            [(ngModel)]="command"
            (keydown.enter)="onEnterKey($event)"
            placeholder="Entrez une commande shell..."
            rows="2"
            [disabled]="executing || !isConnected"
            class="command-input"
          ></textarea>
          <button
            (click)="executeCommand()"
            [disabled]="executing || !command.trim() || !isConnected"
            class="execute-btn"
            [class.loading]="executing"
          >
            <span *ngIf="!executing">▶ Exécuter</span>
            <span *ngIf="executing" class="spinner"></span>
          </button>
        </div>

        <!-- Historique -->
        <div class="history-row" *ngIf="history.length > 0">
          <select (change)="selectFromHistory($event)" class="history-select">
            <option value="">📜 Historique ({{ history.length }})</option>
            <option *ngFor="let entry of history; let i = index" [value]="i">
              {{ entry.success ? '✓' : '✗' }} {{ entry.command | slice:0:50 }}{{ entry.command.length > 50 ? '...' : '' }}
            </option>
          </select>
          <button (click)="clearHistory()" class="clear-history-btn" title="Effacer l'historique">
            🗑️
          </button>
        </div>
      </div>

      <!-- Message si déconnecté -->
      <div class="disconnected-warning" *ngIf="!isConnected">
        <span class="warning-icon">⚠️</span>
        <span>Le site n'est pas connecté. Le terminal distant nécessite une connexion active.</span>
      </div>

      <!-- Résultat -->
      <div class="result-section" *ngIf="result || error">
        <div class="result-header" *ngIf="result">
          <span class="exit-code" [class.success]="result.exitCode === 0" [class.error]="result.exitCode !== 0 && result.exitCode !== null">
            Exit: {{ result.exitCode ?? 'N/A' }}
          </span>
          <span class="duration" *ngIf="result.duration">
            ⏱️ {{ result.duration }}ms
          </span>
          <span class="truncated-badge" *ngIf="result.truncated">
            ⚠️ Sortie tronquée
          </span>
          <span class="timeout-badge" *ngIf="result.timedOut">
            ⏰ Timeout
          </span>
          <button (click)="copyOutput()" class="copy-btn" title="Copier la sortie">
            📋
          </button>
        </div>

        <!-- Erreur API -->
        <div class="error-box" *ngIf="error">
          <span class="error-icon">❌</span>
          <span>{{ error }}</span>
        </div>

        <!-- Sortie stdout -->
        <div class="output-box" *ngIf="result?.stdout">
          <pre><code>{{ result!.stdout }}</code></pre>
        </div>

        <!-- Sortie stderr -->
        <div class="output-box stderr" *ngIf="result?.stderr">
          <div class="output-label">STDERR:</div>
          <pre><code>{{ result!.stderr }}</code></pre>
        </div>

        <!-- Pas de sortie -->
        <div class="no-output" *ngIf="result && !result.stdout && !result.stderr && !result.error">
          <span class="muted">(pas de sortie)</span>
        </div>
      </div>

      <!-- Commandes rapides -->
      <div class="quick-commands">
        <span class="quick-label">Commandes rapides :</span>
        <button *ngFor="let cmd of quickCommands" (click)="setCommand(cmd)" class="quick-btn" [disabled]="executing || !isConnected">
          {{ cmd }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .command-executor {
      background: var(--surface-card, #1e1e2e);
      border: 1px solid var(--surface-border, #313244);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
    }

    .executor-header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .role-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .role-badge.super_admin, .role-badge.superadmin { background: #f38ba8; color: #1e1e2e; }
    .role-badge.admin { background: #fab387; color: #1e1e2e; }
    .role-badge.operator { background: #a6e3a1; color: #1e1e2e; }

    .security-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-hover, #313244);
      border-radius: 4px;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    .security-info.warning {
      background: rgba(250, 179, 135, 0.15);
      border: 1px solid rgba(250, 179, 135, 0.3);
    }

    .input-section {
      margin-bottom: 0.75rem;
    }

    .input-row {
      display: flex;
      gap: 0.5rem;
    }

    .command-input {
      flex: 1;
      padding: 0.75rem;
      border: 1px solid var(--surface-border, #313244);
      border-radius: 4px;
      background: var(--surface-ground, #11111b);
      color: var(--text-color, #cdd6f4);
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      resize: vertical;
      min-height: 60px;
    }
    .command-input:focus {
      outline: none;
      border-color: var(--primary-color, #89b4fa);
    }
    .command-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .execute-btn {
      padding: 0.75rem 1.25rem;
      background: var(--primary-color, #89b4fa);
      color: var(--primary-color-text, #1e1e2e);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      white-space: nowrap;
      min-width: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .execute-btn:hover:not(:disabled) {
      background: var(--primary-600, #74c7ec);
    }
    .execute-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .execute-btn.loading {
      background: var(--surface-hover, #313244);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .history-row {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .history-select {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid var(--surface-border, #313244);
      border-radius: 4px;
      background: var(--surface-ground, #11111b);
      color: var(--text-color, #cdd6f4);
      font-size: 0.85rem;
    }

    .clear-history-btn {
      padding: 0.5rem;
      background: transparent;
      border: 1px solid var(--surface-border, #313244);
      border-radius: 4px;
      cursor: pointer;
    }
    .clear-history-btn:hover {
      background: var(--surface-hover, #313244);
    }

    .disconnected-warning {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(243, 139, 168, 0.15);
      border: 1px solid rgba(243, 139, 168, 0.3);
      border-radius: 4px;
      margin-bottom: 0.75rem;
      color: #f38ba8;
    }

    .result-section {
      margin-top: 1rem;
      border: 1px solid var(--surface-border, #313244);
      border-radius: 4px;
      overflow: hidden;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: var(--surface-hover, #313244);
      font-size: 0.85rem;
    }

    .exit-code {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
      font-family: monospace;
    }
    .exit-code.success { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }
    .exit-code.error { background: rgba(243, 139, 168, 0.2); color: #f38ba8; }

    .duration {
      color: var(--text-color-secondary, #a6adc8);
    }

    .truncated-badge, .timeout-badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      background: rgba(250, 179, 135, 0.2);
      color: #fab387;
    }

    .copy-btn {
      margin-left: auto;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    .copy-btn:hover {
      background: var(--surface-card, #1e1e2e);
    }

    .error-box {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(243, 139, 168, 0.1);
      color: #f38ba8;
    }

    .output-box {
      padding: 0.75rem;
      background: var(--surface-ground, #11111b);
    }
    .output-box.stderr {
      background: rgba(243, 139, 168, 0.05);
    }

    .output-label {
      font-size: 0.75rem;
      color: var(--text-color-secondary, #a6adc8);
      margin-bottom: 0.25rem;
      text-transform: uppercase;
    }
    .output-box.stderr .output-label {
      color: #f38ba8;
    }

    .output-box pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
      max-height: 500px;
      overflow-y: auto;
      padding: 0.5rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }

    .output-box pre code {
      color: #a6e3a1;
    }

    .output-box.stderr pre code {
      color: #f38ba8;
    }

    .no-output {
      padding: 0.75rem;
      text-align: center;
    }
    .muted {
      color: var(--text-color-secondary, #a6adc8);
      font-style: italic;
    }

    .quick-commands {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--surface-border, #313244);
    }

    .quick-label {
      font-size: 0.85rem;
      color: var(--text-color-secondary, #a6adc8);
    }

    .quick-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.8rem;
      font-family: monospace;
      background: var(--surface-hover, #313244);
      border: 1px solid var(--surface-border, #45475a);
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-color, #cdd6f4);
    }
    .quick-btn:hover:not(:disabled) {
      background: var(--surface-card, #1e1e2e);
      border-color: var(--primary-color, #89b4fa);
    }
    .quick-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class CommandExecutorComponent implements OnInit, OnDestroy {
  @Input() siteId!: string;
  @Input() isConnected = false;

  command = '';
  executing = false;
  result: CommandResult | null = null;
  error: string | null = null;
  userRole = '';
  history: HistoryEntry[] = [];

  quickCommands = [
    'df -h',
    'free -m',
    'uptime',
    'ps aux | head -20',
    'ls -la /home/pi/neopro/',
    'cat /home/pi/neopro/webapp/configuration.json | head -50',
    'journalctl -u neopro-app -n 50 --no-pager',
    'systemctl status neopro-*',
  ];

  private readonly destroy$ = new Subject<void>();
  private readonly HISTORY_KEY = 'neopro_shell_history';
  private readonly MAX_HISTORY = 20;

  private readonly sitesService = inject(SitesService);
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    this.userRole = this.authService.getCurrentUser()?.role || '';
    this.loadHistory();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getRoleLabel(): string {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      superadmin: 'Super Admin',
      admin: 'Admin',
      operator: 'Opérateur',
    };
    return labels[this.userRole] || this.userRole;
  }

  onEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    // Shift+Enter = nouvelle ligne, Enter seul = exécuter
    if (!keyEvent.shiftKey) {
      event.preventDefault();
      this.executeCommand();
    }
  }

  executeCommand(): void {
    if (!this.command.trim() || this.executing || !this.isConnected) {
      return;
    }

    this.executing = true;
    this.result = null;
    this.error = null;

    this.sitesService.sendCommand(this.siteId, 'remote_shell', { command: this.command.trim() })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.executing = false;
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Remote shell response:', response);
          const res = response as { success?: boolean; result?: CommandResult; error?: string };
          if (res.result) {
            this.result = res.result;
            this.addToHistory(this.command.trim(), res.result.success);
          } else if (res.error) {
            this.error = res.error;
            this.addToHistory(this.command.trim(), false);
          } else {
            // Fallback: si la réponse n'a pas le format attendu
            this.error = 'Réponse inattendue du serveur';
            console.warn('Unexpected response format:', response);
          }
        },
        error: (err) => {
          console.error('Remote shell error:', err);
          // Extraire le message d'erreur de la réponse HTTP
          if (err.status === 503) {
            this.error = err.error?.error || 'Le site n\'est pas connecté. Le terminal distant nécessite une connexion active.';
          } else if (err.status === 403) {
            this.error = err.error?.error || 'Commande non autorisée';
          } else if (err.status === 504) {
            this.error = err.error?.error || 'La commande a expiré (timeout)';
          } else {
            this.error = err.error?.error || err.message || 'Erreur lors de l\'exécution de la commande';
          }
          this.addToHistory(this.command.trim(), false);
        }
      });
  }

  setCommand(cmd: string): void {
    this.command = cmd;
  }

  selectFromHistory(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value, 10);
    if (!isNaN(index) && this.history[index]) {
      this.command = this.history[index].command;
    }
    select.value = '';
  }

  copyOutput(): void {
    if (!this.result) return;

    const text = [
      this.result.stdout || '',
      this.result.stderr ? `[STDERR]\n${this.result.stderr}` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text).catch(console.error);
  }

  clearHistory(): void {
    this.history = [];
    localStorage.removeItem(this.HISTORY_KEY);
  }

  private addToHistory(command: string, success: boolean): void {
    // Éviter les doublons consécutifs
    if (this.history.length > 0 && this.history[0].command === command) {
      this.history[0].timestamp = new Date();
      this.history[0].success = success;
    } else {
      this.history.unshift({
        command,
        timestamp: new Date(),
        success
      });
    }

    // Limiter la taille
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(0, this.MAX_HISTORY);
    }

    this.saveHistory();
  }

  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(this.HISTORY_KEY);
      if (stored) {
        this.history = JSON.parse(stored);
      }
    } catch {
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      // localStorage plein ou non disponible
    }
  }
}
