/**
 * @file Types JSDoc partagés pour le sync-agent.
 *
 * Ce fichier n'exporte rien ; il sert uniquement de référence de types
 * pour l'autocomplétion et la vérification @ts-check dans l'IDE.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SyncAgentConfig
 * @property {{ url: string, enabled: boolean }} central
 * @property {{ id: string|undefined, apiKey: string|undefined, name: string|undefined, clubName: string|undefined, location: { city: string|undefined, region: string|undefined, country: string|undefined }, sports: string[] }} site
 * @property {{ root: string, videos: string, config: string, backup: string }} paths
 * @property {{ heartbeatInterval: number, metricsInterval: number }} monitoring
 * @property {{ level: string, path: string }} logging
 * @property {{ autoUpdateEnabled: boolean, autoUpdateHour: number }} updates
 * @property {{ maxDownloadSize: number, allowedCommands: string[] }} security
 */

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SystemMetrics
 * @property {number} cpu_usage
 * @property {number} memory_total
 * @property {number} memory_used
 * @property {number} memory_percent
 * @property {number|null} temperature
 * @property {number} disk_total
 * @property {number} disk_used
 * @property {number} disk_percent
 * @property {string|null} local_ip
 * @property {number} uptime
 * @property {string} pi_model
 * @property {boolean} is_pi5
 * @property {{present: boolean, type: string|null, curState: number|null, maxState: number|null, speedPercent: number|null, is_pi5: boolean}|null} fanStatus
 */

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CommandData
 * @property {string} commandId
 * @property {string} command
 * @property {Record<string, unknown>} [params]
 */

/**
 * @typedef {Object} CommandResult
 * @property {boolean} success
 * @property {string} [error]
 * @property {Record<string, unknown>} [data]
 */

/**
 * Callback de progression pour les commandes longues.
 * @callback ProgressCallback
 * @param {number} percent - Pourcentage de progression (0-100)
 * @param {string} [message] - Message optionnel
 * @returns {void}
 */

// ---------------------------------------------------------------------------
// License
// ---------------------------------------------------------------------------

/**
 * @typedef {'VALID'|'WARNING'|'GRACE_PERIOD'|'CONNECTION_WARNING'|'BLOCKED'} LicenseStatus
 */

/**
 * @typedef {Object} LicenseCache
 * @property {LicenseStatus} status
 * @property {string} [reason]
 * @property {string} [subscription_end]
 * @property {number} [days_left]
 * @property {number} [days_expired]
 * @property {boolean} [can_auto_unblock]
 * @property {string} [message_tv]
 * @property {string} [message_remote]
 * @property {string} cache_valid_until
 * @property {string} last_server_check
 * @property {string} last_updated
 */

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} VideoPlayEvent
 * @property {string} video_filename
 * @property {string} [video_id]
 * @property {string} [sponsor_id]
 * @property {string} category
 * @property {string} played_at
 * @property {number} duration_played
 * @property {number} [video_duration]
 * @property {boolean} completed
 * @property {string} trigger_type
 * @property {string} [tv_status]
 * @property {string} [session_id]
 */

/**
 * @typedef {Object} SponsorImpression
 * @property {string} video_filename
 * @property {string} [video_id]
 * @property {string} played_at
 * @property {number} duration_played
 * @property {number} [video_duration]
 * @property {boolean} completed
 * @property {string} [event_type]
 * @property {string} [period]
 * @property {string} trigger_type
 * @property {string} [site_id]
 * @property {number} [audience_estimate]
 */

// ---------------------------------------------------------------------------
// Offline Queue
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} QueuedCommand
 * @property {string} id
 * @property {string} command
 * @property {Record<string, unknown>} params
 * @property {string} queuedAt
 * @property {number} retries
 * @property {string} [lastError]
 */

// ---------------------------------------------------------------------------
// Connection Status
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ConnectionStatusInfo
 * @property {boolean} isConnected
 * @property {string|null} lastConnectedAt
 * @property {string|null} lastDisconnectedAt
 * @property {string|null} lastSyncAt
 * @property {number} reconnectAttempts
 * @property {string} uptime
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/**
 * @typedef {'wifi'|'ethernet'|'hotspot'|'unknown'} NetworkType
 */

/**
 * @typedef {Object} NetworkProfile
 * @property {NetworkType} type
 * @property {boolean} internetAccess
 * @property {boolean} cloudAccess
 * @property {string|null} ssid
 * @property {number|null} signalStrength
 * @property {string|null} ip
 */

module.exports = {};
