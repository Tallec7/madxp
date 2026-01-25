/**
 * LicenseService
 *
 * Service Angular pour la gestion du statut de licence Neopro sur le Raspberry Pi.
 * Écoute les mises à jour de licence depuis le sync-agent via le serveur local Socket.IO.
 */
import { Injectable, inject, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { SocketService } from './socket.service';

/**
 * États possibles de la licence
 */
export type LicenseStatus = 'VALID' | 'WARNING' | 'GRACE_PERIOD' | 'CONNECTION_WARNING' | 'BLOCKED';

/**
 * Raisons de blocage ou d'avertissement
 */
export type LicenseReason =
  | 'unpaid'
  | 'expired'
  | 'abuse'
  | 'maintenance'
  | 'request'
  | 'hardware'
  | 'trial_ended'
  | 'connection'
  | 'connection_required'
  | 'connection_grace'
  | 'expiring_soon'
  | 'no_cache'
  | 'server_blocked'
  | null;

/**
 * Statut de licence complet
 */
export interface LicenseState {
  status: LicenseStatus;
  reason: LicenseReason;
  subscriptionEnd?: string;
  daysLeft?: number;
  daysExpired?: number;
  daysSinceCheck?: number;
  canAutoUnblock?: boolean;
  messageTv?: string;
  messageRemote?: string;
  needsConnection?: boolean;
  lastUpdated?: string;
}

/**
 * Valeurs par défaut - licence valide
 */
const DEFAULT_LICENSE_STATE: LicenseState = {
  status: 'VALID',
  reason: null,
  needsConnection: false
};

@Injectable({
  providedIn: 'root'
})
export class LicenseService implements OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly ngZone = inject(NgZone);
  private subscriptions = new Subscription();

  /**
   * État actuel de la licence
   */
  private licenseState$ = new BehaviorSubject<LicenseState>(DEFAULT_LICENSE_STATE);

  /**
   * Observable pour les composants
   */
  readonly state$: Observable<LicenseState> = this.licenseState$.asObservable();

  constructor() {
    this.listenForLicenseUpdates();
    this.loadInitialState();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * Écoute les mises à jour de licence depuis le serveur local
   */
  private listenForLicenseUpdates(): void {
    // Écouter les mises à jour de statut de licence
    this.socketService.on<any>('license_update', (status) => {
      this.ngZone.run(() => {
        this.updateFromServer(status);
      });
    });

    // Écouter aussi l'événement de blocage direct
    this.socketService.on<any>('license_blocked', (status) => {
      this.ngZone.run(() => {
        this.updateFromServer(status);
      });
    });
  }

  /**
   * Charge l'état initial depuis le cache local via une requête au serveur
   */
  private loadInitialState(): void {
    // Le serveur local expose un endpoint pour récupérer le statut de licence
    fetch('/api/license-status')
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('License status not available');
      })
      .then(status => {
        this.updateFromServer(status);
      })
      .catch(() => {
        // Si le serveur local n'a pas de statut, on garde la valeur par défaut
        console.debug('[LicenseService] No initial license status available');
      });
  }

  /**
   * Met à jour l'état depuis les données du serveur
   * @param serverStatus - Statut reçu du sync-agent
   */
  updateFromServer(serverStatus: any): void {
    if (!serverStatus || !serverStatus.status) {
      return;
    }

    const state: LicenseState = {
      status: serverStatus.status,
      reason: serverStatus.reason || null,
      subscriptionEnd: serverStatus.subscription_end,
      daysLeft: serverStatus.days_left,
      daysExpired: serverStatus.days_expired,
      daysSinceCheck: serverStatus.days_since_check,
      canAutoUnblock: serverStatus.can_auto_unblock,
      messageTv: serverStatus.message_tv,
      messageRemote: serverStatus.message_remote,
      needsConnection: serverStatus.needs_connection,
      lastUpdated: new Date().toISOString()
    };

    console.log('[LicenseService] License state updated:', state);
    this.licenseState$.next(state);
  }

  /**
   * Retourne l'état actuel de la licence (snapshot)
   */
  getCurrentState(): LicenseState {
    return this.licenseState$.getValue();
  }

  /**
   * Vérifie si l'accès est bloqué
   */
  isBlocked(): boolean {
    return this.licenseState$.getValue().status === 'BLOCKED';
  }

  /**
   * Vérifie si un avertissement doit être affiché
   */
  hasWarning(): boolean {
    const status = this.licenseState$.getValue().status;
    return status === 'WARNING' || status === 'GRACE_PERIOD' || status === 'CONNECTION_WARNING';
  }

  /**
   * Vérifie si la licence est valide (pas de blocage)
   */
  isValid(): boolean {
    return this.licenseState$.getValue().status === 'VALID';
  }

  /**
   * Retourne le message à afficher sur la TV (écran de blocage)
   */
  getTvMessage(): string {
    const state = this.licenseState$.getValue();
    return state.messageTv || 'Service temporairement indisponible';
  }

  /**
   * Retourne le message à afficher sur la télécommande (bannière/popup)
   */
  getRemoteMessage(): string {
    const state = this.licenseState$.getValue();
    return state.messageRemote || 'Veuillez contacter votre administrateur.';
  }

  /**
   * Retourne la classe CSS appropriée pour le statut
   */
  getStatusClass(): string {
    const status = this.licenseState$.getValue().status;
    switch (status) {
      case 'VALID':
        return 'license-valid';
      case 'WARNING':
        return 'license-warning';
      case 'GRACE_PERIOD':
        return 'license-grace';
      case 'CONNECTION_WARNING':
        return 'license-connection-warning';
      case 'BLOCKED':
        return 'license-blocked';
      default:
        return 'license-unknown';
    }
  }

  /**
   * Retourne le nombre de jours restants avant expiration
   */
  getDaysLeft(): number | null {
    return this.licenseState$.getValue().daysLeft ?? null;
  }

  /**
   * Retourne le nombre de jours depuis l'expiration
   */
  getDaysExpired(): number | null {
    return this.licenseState$.getValue().daysExpired ?? null;
  }

  /**
   * Vérifie si le déblocage automatique est possible
   */
  canAutoUnblock(): boolean {
    return this.licenseState$.getValue().canAutoUnblock || false;
  }

  /**
   * Retourne la raison du statut actuel
   */
  getReason(): LicenseReason {
    return this.licenseState$.getValue().reason;
  }

  /**
   * Retourne un libellé lisible pour la raison
   */
  getReasonLabel(): string {
    const reason = this.getReason();
    const labels: Record<string, string> = {
      'unpaid': 'Facture impayée',
      'expired': 'Abonnement expiré',
      'abuse': 'Utilisation abusive',
      'maintenance': 'Maintenance',
      'request': 'Demande client',
      'hardware': 'Problème matériel',
      'trial_ended': 'Période d\'essai terminée',
      'connection': 'Connexion requise',
      'connection_required': 'Connexion Internet requise',
      'connection_grace': 'Connexion requise bientôt',
      'expiring_soon': 'Expiration imminente',
      'no_cache': 'Première connexion requise',
      'server_blocked': 'Bloqué par l\'administrateur'
    };
    return labels[reason || ''] || reason || '';
  }
}
