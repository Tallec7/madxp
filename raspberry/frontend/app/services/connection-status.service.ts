import { Injectable, signal, computed } from '@angular/core';

export interface ConnectionStatus {
  isOnline: boolean;
  lastSync: Date | null;
  centralConnected: boolean;
  localServerConnected: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConnectionStatusService {
  // Signaux pour l'état de connexion
  private _localServerConnected = signal<boolean>(false);
  private _centralConnected = signal<boolean>(false);
  private _lastSync = signal<Date | null>(null);

  // Computed pour l'état global
  public isOnline = computed(() => this._localServerConnected() && this._centralConnected());
  public localServerConnected = computed(() => this._localServerConnected());
  public centralConnected = computed(() => this._centralConnected());
  public lastSync = computed(() => this._lastSync());

  // Status complet
  public status = computed<ConnectionStatus>(() => ({
    isOnline: this.isOnline(),
    lastSync: this.lastSync(),
    centralConnected: this.centralConnected(),
    localServerConnected: this.localServerConnected(),
  }));

  constructor() {
    // Vérifier la connexion au démarrage
    this.checkConnections();

    // Vérifier périodiquement (toutes les 30 secondes)
    setInterval(() => this.checkConnections(), 30000);
  }

  /**
   * Met à jour l'état du serveur local
   */
  setLocalServerConnected(connected: boolean): void {
    this._localServerConnected.set(connected);
  }

  /**
   * Met à jour l'état de connexion au central
   */
  setCentralConnected(connected: boolean): void {
    this._centralConnected.set(connected);
    if (connected) {
      this._lastSync.set(new Date());
    }
  }

  /**
   * Enregistre une synchronisation réussie
   */
  recordSync(): void {
    this._lastSync.set(new Date());
  }

  /**
   * Vérifie les connexions
   */
  private async checkConnections(): Promise<void> {
    // Vérifier le serveur local
    try {
      const response = await fetch('/api/status', { method: 'GET' });
      this._localServerConnected.set(response.ok);

      if (response.ok) {
        const data = await response.json();
        // Si le serveur local nous donne l'info sur le central
        if (data.centralConnected !== undefined) {
          this._centralConnected.set(data.centralConnected);
        }
        if (data.lastSync) {
          this._lastSync.set(new Date(data.lastSync));
        }
      }
    } catch {
      this._localServerConnected.set(false);
    }
  }

  /**
   * Force une vérification des connexions
   */
  async refresh(): Promise<ConnectionStatus> {
    await this.checkConnections();
    return this.status();
  }
}
