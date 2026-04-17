/**
 * Types, interfaces et seuils par défaut pour le service d'alerting.
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'escalated';

export interface AlertThreshold {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  warningValue: number;
  criticalValue: number;
  duration: number; // Durée en secondes avant déclenchement
  enabled: boolean;
  cooldownMinutes: number; // Temps avant nouvelle alerte sur même métrique
  escalateAfterMinutes: number; // Temps avant escalade
  notifyChannels: string[]; // email, webhook, slack, etc.
}

export interface Alert {
  id: string;
  siteId?: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  metadata: Record<string, unknown>;
  thresholdId?: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  escalatedAt?: Date;
}

export interface MetricSnapshot {
  siteId?: string;
  metric: string;
  value: number;
  timestamp: Date;
}

// Seuils par défaut (incluant alertes prédictives)
export const DEFAULT_THRESHOLDS: Omit<AlertThreshold, 'id'>[] = [
  // === Alertes Réactives (existantes) ===
  {
    name: 'CPU élevé',
    metric: 'cpu_usage',
    condition: 'gt',
    warningValue: 70,
    criticalValue: 90,
    duration: 300, // 5 minutes
    enabled: true,
    cooldownMinutes: 15,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },
  {
    name: 'Mémoire élevée',
    metric: 'memory_usage',
    condition: 'gt',
    warningValue: 80,
    criticalValue: 95,
    duration: 300,
    enabled: true,
    cooldownMinutes: 15,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },
  {
    name: 'Température élevée',
    metric: 'temperature',
    condition: 'gt',
    warningValue: 65,
    criticalValue: 80,
    duration: 60, // 1 minute
    enabled: true,
    cooldownMinutes: 10,
    escalateAfterMinutes: 15,
    notifyChannels: ['email'],
  },
  {
    name: 'Disque presque plein',
    metric: 'disk_usage',
    condition: 'gt',
    warningValue: 80,
    criticalValue: 95,
    duration: 0, // Immédiat
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: 'Site hors ligne',
    metric: 'site_offline',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 300, // 5 minutes de déconnexion
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 60,
    notifyChannels: ['email'],
  },
  {
    name: 'Échec de déploiement',
    metric: 'deployment_failed',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 0,
    enabled: true,
    cooldownMinutes: 5,
    escalateAfterMinutes: 30,
    notifyChannels: ['email'],
  },

  // === Alertes Prédictives (nouvelles) ===
  {
    name: '[PRÉD] Inactivité prolongée',
    metric: 'days_since_last_video',
    condition: 'gt',
    warningValue: 7,
    criticalValue: 14,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 4320,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Espace disque en baisse',
    metric: 'disk_growth_rate',
    condition: 'gt',
    warningValue: 5,
    criticalValue: 10,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 2880,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Déconnexions fréquentes',
    metric: 'disconnections_24h',
    condition: 'gt',
    warningValue: 5,
    criticalValue: 10,
    duration: 0,
    enabled: true,
    cooldownMinutes: 360,
    escalateAfterMinutes: 720,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Signal WiFi dégradé',
    metric: 'wifi_signal_quality',
    condition: 'lt',
    warningValue: 50,
    criticalValue: 25,
    duration: 3600, // 1 heure continue
    enabled: true,
    cooldownMinutes: 720,
    escalateAfterMinutes: 1440,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Erreurs vidéo récurrentes',
    metric: 'video_errors_24h',
    condition: 'gt',
    warningValue: 5,
    criticalValue: 15,
    duration: 0,
    enabled: true,
    cooldownMinutes: 360,
    escalateAfterMinutes: 720,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Température en hausse',
    metric: 'temperature_trend',
    condition: 'gt',
    warningValue: 5,
    criticalValue: 10,
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Hotspot instable',
    metric: 'hotspot_restarts_24h',
    condition: 'gt',
    warningValue: 2,
    criticalValue: 5,
    duration: 0,
    enabled: true,
    cooldownMinutes: 720,
    escalateAfterMinutes: 1440,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Abonnement expire bientôt',
    metric: 'days_until_subscription_end',
    condition: 'lt',
    warningValue: 30,
    criticalValue: 7,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 4320,
    notifyChannels: ['email'],
  },
  {
    name: 'Déploiement bloqué',
    metric: 'deployment_stuck_minutes',
    condition: 'gt',
    warningValue: 30,
    criticalValue: 60,
    duration: 0,
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: 'Render Remotion bloqué',
    metric: 'render_job_stuck_minutes',
    condition: 'gt',
    warningValue: 15,
    criticalValue: 30,
    duration: 0,
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 120,
    notifyChannels: ['email'],
  },
  {
    name: 'Taux échec renders Remotion',
    metric: 'render_job_failure_rate_1h',
    condition: 'gt',
    warningValue: 30,
    criticalValue: 60,
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 180,
    notifyChannels: ['email'],
  },
  {
    name: 'Déconnexions WebSocket fréquentes',
    metric: 'websocket_disconnects_1h',
    condition: 'gt',
    warningValue: 10,
    criticalValue: 30,
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 180,
    notifyChannels: ['email'],
  },
  {
    name: 'Trous noirs vidéo (safety timeouts)',
    metric: 'video_safety_timeouts_1h',
    condition: 'gt',
    warningValue: 3,
    criticalValue: 10,
    duration: 0,
    enabled: true,
    cooldownMinutes: 60,
    escalateAfterMinutes: 180,
    notifyChannels: ['email'],
  },
  {
    name: 'Crash kiosk Chromium',
    metric: 'kiosk_crashes_1h',
    condition: 'gt',
    warningValue: 1,
    criticalValue: 3,
    duration: 0,
    enabled: true,
    cooldownMinutes: 30,
    escalateAfterMinutes: 60,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Références vidéo orphelines',
    metric: 'orphaned_video_references',
    condition: 'gt',
    warningValue: 1,
    criticalValue: 5,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 4320,
    notifyChannels: ['email'],
  },
  {
    name: '[PRÉD] Site mesh sans Ethernet',
    metric: 'mesh_without_ethernet',
    condition: 'eq',
    warningValue: 1,
    criticalValue: 1,
    duration: 0,
    enabled: true,
    cooldownMinutes: 1440,
    escalateAfterMinutes: 4320,
    notifyChannels: ['email'],
  },
];

// Memory safety limits for in-memory Maps (Railway Hobby plan: 256MB heap)
export const MAX_METRIC_HISTORY_KEYS = 200;
export const MAX_METRIC_HISTORY_PER_KEY = 60;
export const MAX_LAST_ALERT_TIME_ENTRIES = 500;
export const MAX_EVENT_ENTRIES_PER_SITE = 200;
export const MAX_EVENT_SITES = 100;
