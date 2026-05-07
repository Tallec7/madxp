import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import logger from '../config/logger';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.warn('Validation error:', { errors, body: req.body });

      return res.status(400).json({
        error: 'Données invalides',
        details: errors,
      });
    }

    req.body = value;
    return next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: false,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.warn('Validation error (query):', { errors, path: req.path });

      return res.status(400).json({
        error: 'Paramètres de requête invalides',
        details: errors,
      });
    }

    for (const key of Object.keys(value)) {
      (req.query as Record<string, unknown>)[key] = value[key];
    }
    return next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.params, {
      abortEarly: false,
      allowUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      logger.warn('Validation error (params):', { errors, path: req.path });

      return res.status(400).json({
        error: 'Paramètres de route invalides',
        details: errors,
      });
    }

    return next();
  };
};

export const schemas = {
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    mfaCode: Joi.string().length(6).pattern(/^\d+$/).optional(), // 6 digits TOTP code
  }),

  mfaCode: Joi.object({
    code: Joi.string().min(6).max(10).required(), // TOTP (6 digits) or backup code (XXXX-XXXX)
  }),

  copyConfig: Joi.object({
    target_site_id: Joi.string().uuid().required(),
    profile_ids: Joi.array().items(Joi.string().uuid()).optional(),
  }),

  createSite: Joi.object({
    site_name: Joi.string().required(),
    club_name: Joi.string().required(),
    location: Joi.object({
      city: Joi.string().optional(),
      region: Joi.string().optional(),
      country: Joi.string().optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).optional(),
    }).optional(),
    sports: Joi.array().items(Joi.string()).optional(),
    hardware_model: Joi.string().allow('').optional(),
    site_type: Joi.string().valid('pi', 'saas', 'demo').default('pi'),
  }),

  updateSite: Joi.object({
    site_name: Joi.string().optional(),
    club_name: Joi.string().optional(),
    location: Joi.object({
      city: Joi.string().optional(),
      region: Joi.string().optional(),
      country: Joi.string().optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).optional(),
    }).optional(),
    sports: Joi.array().items(Joi.string()).optional(),
    status: Joi.string().valid('online', 'offline', 'maintenance', 'error').optional(),
    live_score_enabled: Joi.boolean().optional(),
    avg_spectators: Joi.number().integer().min(0).max(100000).optional(),
    secondary_display_enabled: Joi.boolean().optional(),
    secondary_display_resolution: Joi.string().pattern(/^\d{1,5}x\d{1,5}$/).max(20).optional().allow(null),
    site_type: Joi.string().valid('pi', 'saas', 'demo').optional(),
    feature_overrides: Joi.object().pattern(Joi.string(), Joi.boolean()).optional(),
  }),

  updateDisplays: Joi.object({
    displays: Joi.array().items(
      Joi.object({
        index: Joi.number().integer().min(0).required(),
        name: Joi.string().max(100).required(),
        type: Joi.string().pattern(/^[a-z0-9-]+$/).max(50).required(),
        resolution: Joi.string().pattern(/^\d{1,5}x\d{1,5}$/).max(20).optional(),
        receiver: Joi.object({
          kind: Joi.string().valid('pi_native', 'firestick', 'browser').required(),
          mac: Joi.string().pattern(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/).optional(),
          last_seen_at: Joi.string().isoDate().optional(),
        }).optional().allow(null),
      })
    ).min(1).max(20).required(),
  }),

  createGroup: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional().allow(''),
    type: Joi.string().valid('sport', 'geography', 'version', 'custom').required(),
    filters: Joi.object().optional(),
  }),

  updateGroup: Joi.object({
    name: Joi.string().optional(),
    description: Joi.string().optional().allow(''),
    type: Joi.string().valid('sport', 'geography', 'version', 'custom').optional(),
    filters: Joi.object().optional(),
  }),

  addSitesToGroup: Joi.object({
    site_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),

  deployContent: Joi.object({
    video_id: Joi.string().uuid().required(),
    target_type: Joi.string().valid('site', 'group').required(),
    target_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),

  deployUpdate: Joi.object({
    update_id: Joi.string().uuid().required(),
    target_type: Joi.string().valid('site', 'group').required(),
    target_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),

  executeCommand: Joi.object({
    site_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
    command_type: Joi.string().required(),
    command_data: Joi.object().optional(),
  }),

  // User management schemas
  createUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    full_name: Joi.string().required(),
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency', 'club').required(),
    advertiser_id: Joi.string().uuid().optional().allow(null),
    sponsor_id: Joi.string().uuid().optional().allow(null),
    agency_id: Joi.string().uuid().optional().allow(null),
    site_id: Joi.string().uuid().optional().allow(null),
  }),

  updateUser: Joi.object({
    email: Joi.string().email().optional(),
    full_name: Joi.string().optional(),
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency', 'club').optional(),
    advertiser_id: Joi.string().uuid().optional().allow(null),
    sponsor_id: Joi.string().uuid().optional().allow(null),
    agency_id: Joi.string().uuid().optional().allow(null),
    site_id: Joi.string().uuid().optional().allow(null),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
  }),

  // Password reset schemas
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).required(),
    password_confirm: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Les mots de passe ne correspondent pas',
    }),
  }),

  // Remote command schema (PUBLIC endpoint - validation critique)
  remoteCommand: Joi.object({
    type: Joi.string().valid(
      'score-update', 'score-reset', 'phase-change', 'play-video',
      'play-sponsors', 'play-web-page', 'play-livestream', 'stop-manual',
      'timer-update', 'breaking-news', 'match-config',
      'recording-toggle', 'screenshot',
      // ADR-059 granular match commands
      'command/increment_home', 'command/decrement_home',
      'command/increment_away', 'command/decrement_away',
      'command/score_reset', 'command/set_phase',
      'command/timer_start', 'command/timer_pause', 'command/timer_reset'
    ).required(),
    data: Joi.object().optional().default({}),
    // ADR-081 Phase 0 — commandId optionnel (UUID généré par le remote)
    commandId: Joi.string().uuid().optional(),
  }),

  // Remote PIN verification (public endpoint)
  remotePin: Joi.object({
    pin: Joi.string().pattern(/^\d{4,6}$/).required().messages({
      'string.pattern.base': 'Le PIN doit contenir entre 4 et 6 chiffres',
      'any.required': 'Le PIN est requis',
    }),
  }),

  // Set remote PIN (admin/operator endpoint)
  setRemotePin: Joi.object({
    pin: Joi.string().pattern(/^\d{4,6}$/).required().messages({
      'string.pattern.base': 'Le PIN doit contenir entre 4 et 6 chiffres',
      'any.required': 'Le PIN est requis',
    }),
  }),

  // ADR-058 — Set / clear PIN per profile (super_admin endpoint).
  // `pin: null` removes the PIN. `pin: string` (4-6 digits) sets it.
  setProfileRemotePin: Joi.object({
    pin: Joi.string().pattern(/^\d{4,6}$/).allow(null).required().messages({
      'string.pattern.base': 'Le PIN doit contenir entre 4 et 6 chiffres',
    }),
  }),

  // ADR-058 — verify PIN + issue device token (public endpoint, scoped to profile)
  verifyProfilePin: Joi.object({
    pin: Joi.string().pattern(/^\d{4,6}$/).required().messages({
      'string.pattern.base': 'Le PIN doit contenir entre 4 et 6 chiffres',
      'any.required': 'Le PIN est requis',
    }),
    deviceId: Joi.string().min(8).max(128).required(),
    label: Joi.string().max(128).allow('', null).optional(),
  }),

  // ADR-102 — Remote preferences upsert (PUT /api/saas/:siteId/profiles/:profileId/preferences).
  // Au moins un des deux objets doit être fourni. Whitelist stricte sur les
  // clés pour éviter qu'un client malveillant pollue le JSONB avec des champs
  // arbitraires.
  remotePreferencesUpsert: Joi.object({
    prefs: Joi.object({
      haptics: Joi.boolean(),
      highContrast: Joi.boolean(),
      lockRotation: Joi.boolean(),
      fontSize: Joi.string().valid('normal', 'large'),
      layoutMobile: Joi.string().valid('classic', 'grid', 'compact'),
      layoutDesktop: Joi.string().valid('centered', 'sidebar', 'pro'),
    }).min(1),
    widgets: Joi.object({
      score: Joi.boolean(),
      chrono: Joi.boolean(),
      breaking: Joi.boolean(),
    }).min(1),
  }).or('prefs', 'widgets'),

  // ADR-058 — revoke all devices (super_admin endpoint, no body required)
  revokeAllDevices: Joi.object({
    reason: Joi.string().max(64).allow('', null).optional(),
  }),

  // Subscription schemas
  extendSubscription: Joi.object({
    new_end_date: Joi.string().isoDate().required(),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  suspendSite: Joi.object({
    reason: Joi.string().valid(
      'unpaid', 'expired', 'abuse', 'maintenance',
      'request', 'hardware', 'trial_ended', 'connection'
    ).required(),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  reactivateSite: Joi.object({
    new_end_date: Joi.string().isoDate().optional().allow(null),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  changePlan: Joi.object({
    // Legacy: trial|standard|premium — Nouveaux: play|club|pro|premium (ADR-039)
    plan: Joi.string().valid('trial', 'standard', 'premium', 'play', 'club', 'pro').required(),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  updateSubscription: Joi.object({
    subscription_start: Joi.string().isoDate().optional().allow(null, ''),
    subscription_end: Joi.string().isoDate().optional().allow(null, ''),
    // Legacy: trial|standard|premium — Nouveaux: play|club|pro|premium (ADR-039)
    subscription_plan: Joi.string().valid('trial', 'standard', 'premium', 'play', 'club', 'pro').optional().allow(null),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  // ============================================================================
  // Admin schemas
  // ============================================================================

  triggerJob: Joi.object({
    action: Joi.string().valid(
      'build:central', 'build:raspberry', 'deploy:raspberry',
      'tests:full', 'sync:clients', 'maintenance:restart'
    ).required(),
    parameters: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    note: Joi.string().max(500).optional(),
  }),

  createClient: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    code: Joi.string().min(1).max(100).required(),
    contactEmail: Joi.string().email().optional().allow(null, ''),
    timezone: Joi.string().max(100).optional(),
    siteCount: Joi.number().integer().min(0).optional(),
  }),

  // ============================================================================
  // Agency schemas
  // ============================================================================

  createAgency: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    logo_url: Joi.string().uri().optional().allow(null, ''),
    contact_name: Joi.string().max(255).optional().allow(null, ''),
    contact_email: Joi.string().email().optional().allow(null, ''),
    contact_phone: Joi.string().max(50).optional().allow(null, ''),
    address: Joi.string().max(500).optional().allow(null, ''),
    metadata: Joi.object().optional().allow(null),
  }),

  updateAgency: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    logo_url: Joi.string().uri().optional().allow(null, ''),
    contact_name: Joi.string().max(255).optional().allow(null, ''),
    contact_email: Joi.string().email().optional().allow(null, ''),
    contact_phone: Joi.string().max(50).optional().allow(null, ''),
    address: Joi.string().max(500).optional().allow(null, ''),
    status: Joi.string().valid('active', 'inactive', 'paused').optional(),
    metadata: Joi.object().optional().allow(null),
  }),

  addSitesToAgency: Joi.object({
    site_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),

  // ============================================================================
  // Campaign schemas
  // ============================================================================

  createCampaign: Joi.object({
    advertiser_id: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(255).required(),
    campaign_type: Joi.string().max(100).optional().allow(null, ''),
    target_impressions: Joi.number().integer().min(0).optional().allow(null),
    target_criteria: Joi.object().optional().allow(null),
    budget_cents: Joi.number().integer().min(0).optional().allow(null),
    target_cpm_cents: Joi.number().integer().min(0).optional().allow(null),
    start_date: Joi.string().isoDate().optional().allow(null, ''),
    end_date: Joi.string().isoDate().optional().allow(null, ''),
  }),

  updateCampaign: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    campaign_type: Joi.string().max(100).optional().allow(null, ''),
    target_impressions: Joi.number().integer().min(0).optional().allow(null),
    target_criteria: Joi.object().optional().allow(null),
    budget_cents: Joi.number().integer().min(0).optional().allow(null),
    target_cpm_cents: Joi.number().integer().min(0).optional().allow(null),
    status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'cancelled').optional(),
    start_date: Joi.string().isoDate().optional().allow(null, ''),
    end_date: Joi.string().isoDate().optional().allow(null, ''),
  }),

  addCampaignVideo: Joi.object({
    video_id: Joi.string().uuid().required(),
    weight: Joi.number().integer().min(1).optional(),
  }),

  addCampaignSite: Joi.object({
    site_id: Joi.string().uuid().optional(),
    resolve: Joi.boolean().optional(),
  }).or('site_id', 'resolve'),

  resolveSites: Joi.object({
    target_criteria: Joi.object().required(),
  }),

  // ============================================================================
  // Updates schemas
  // ============================================================================

  createUpdate: Joi.object({
    version: Joi.string().min(1).max(100).required(),
    release_notes: Joi.string().max(5000).optional().allow(null, ''),
    description: Joi.string().max(2000).optional().allow(null, ''),
    is_critical: Joi.alternatives().try(
      Joi.boolean(),
      Joi.string().valid('true', 'false')
    ).optional(),
  }),

  updateUpdate: Joi.object({
    version: Joi.string().min(1).max(100).optional(),
    changelog: Joi.string().max(5000).optional().allow(null, ''),
    description: Joi.string().max(2000).optional().allow(null, ''),
    is_critical: Joi.boolean().optional(),
    package_url: Joi.string().uri().optional().allow(null, ''),
    package_size: Joi.number().integer().min(0).optional().allow(null),
    checksum: Joi.string().max(128).optional().allow(null, ''),
  }),

  createUpdateDeployment: Joi.object({
    update_id: Joi.string().uuid().required(),
    target_type: Joi.string().valid('site', 'group').optional().default('site'),
    target_id: Joi.string().uuid().required(),
    schedule_reboot: Joi.boolean().optional(),
    auto_rollback: Joi.boolean().optional(),
  }),

  updateUpdateDeployment: Joi.object({
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'failed', 'rolled_back').optional(),
    progress: Joi.number().integer().min(0).max(100).optional(),
    error_message: Joi.string().max(2000).optional().allow(null, ''),
    backup_path: Joi.string().max(500).optional().allow(null, ''),
  }),

  // ============================================================================
  // Analytics schemas
  // ============================================================================

  // site_id optionnel : dérivé de l'auth (authenticateSiteApiKeyOptional → req.siteId)
  // quand disponible, sinon lu depuis le body. Le controller refuse si aucun des deux.
  // plays / events : accepte les deux clés (alias — le client SaaS envoie parfois
  // `{ events }` avant que setSiteId() soit appelé, race documentée).
  recordVideoPlays: Joi.object({
    site_id: Joi.string().uuid().optional(),
    plays: Joi.array().items(Joi.object({
      video_path: Joi.string().max(500).optional().allow(null, ''),
      video_filename: Joi.string().max(500).optional().allow(null, ''),
      video_id: Joi.string().uuid().optional().allow(null),
      advertiser_id: Joi.string().uuid().optional().allow(null),
      site_sponsor_id: Joi.string().uuid().optional().allow(null),
      analytics_category: Joi.string().max(100).optional().allow(null, ''),
      category: Joi.string().max(100).optional().allow(null, ''),
      duration_played: Joi.number().min(0).required(),
      video_duration: Joi.number().min(0).optional().allow(null),
      completed: Joi.boolean().optional(),
      played_at: Joi.string().isoDate().optional(),
      interrupted_at: Joi.string().isoDate().optional().allow(null),
      interruption_reason: Joi.string().max(100).optional().allow(null, ''),
      trigger_type: Joi.string().valid('auto', 'manual', 'scheduled').optional(),
      position_in_loop: Joi.number().integer().min(0).optional().allow(null),
      audience_estimate: Joi.number().integer().min(0).optional().allow(null),
      display_type: Joi.string().max(50).optional().allow(null, ''),
      source: Joi.string().max(50).optional().allow(null, ''),
    }).unknown(true)).min(1).optional(),
    events: Joi.array().items(Joi.object({
      video_path: Joi.string().max(500).optional().allow(null, ''),
      video_filename: Joi.string().max(500).optional().allow(null, ''),
      video_id: Joi.string().uuid().optional().allow(null),
      advertiser_id: Joi.string().uuid().optional().allow(null),
      site_sponsor_id: Joi.string().uuid().optional().allow(null),
      analytics_category: Joi.string().max(100).optional().allow(null, ''),
      category: Joi.string().max(100).optional().allow(null, ''),
      duration_played: Joi.number().min(0).required(),
      video_duration: Joi.number().min(0).optional().allow(null),
      completed: Joi.boolean().optional(),
      played_at: Joi.string().isoDate().optional(),
      interrupted_at: Joi.string().isoDate().optional().allow(null),
      interruption_reason: Joi.string().max(100).optional().allow(null, ''),
      trigger_type: Joi.string().valid('auto', 'manual', 'scheduled').optional(),
      position_in_loop: Joi.number().integer().min(0).optional().allow(null),
      audience_estimate: Joi.number().integer().min(0).optional().allow(null),
      display_type: Joi.string().max(50).optional().allow(null, ''),
      source: Joi.string().max(50).optional().allow(null, ''),
    }).unknown(true)).min(1).optional(),
  }).or('plays', 'events'),

  // site_id optionnel : dérivé de l'auth quand disponible, fallback body.
  // Le controller refuse si aucun des deux n'est fourni.
  manageSession: Joi.object({
    site_id: Joi.string().uuid().optional(),
    action: Joi.string().valid('start', 'end').required(),
    session_id: Joi.string().uuid().optional().allow(null),
  }),

  calculateDailyStats: Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),

  createAnalyticsCategory: Joi.object({
    id: Joi.string().min(1).max(100).required(),
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional().allow(null, ''),
  }),

  updateAnalyticsCategory: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional().allow(null, ''),
  }),

  // ============================================================================
  // Assets schemas
  // ============================================================================

  validateWatermarkConfig: Joi.object({
    position: Joi.string().valid('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center').optional(),
    opacity: Joi.number().min(0).max(1).optional(),
    scale: Joi.number().min(0.01).max(2).optional(),
    enabled: Joi.boolean().optional(),
  }).unknown(true),

  deployAsset: Joi.object({
    assetUrl: Joi.string().uri().required(),
    filename: Joi.string().min(1).max(255).required(),
    targetPath: Joi.string().min(1).max(500).required(),
    checksum: Joi.string().max(128).optional().allow(null, ''),
    assetType: Joi.string().valid('watermark', 'logo', 'splash', 'overlay').optional(),
  }),

  // ============================================================================
  // Drafts schemas
  // ============================================================================

  saveDraft: Joi.object({
    name: Joi.string().max(255).optional().allow(null, ''),
    configuration: Joi.object().required(),
  }),

  // ============================================================================
  // Config History schemas
  // ============================================================================

  saveConfigVersion: Joi.object({
    configuration: Joi.object().required(),
    comment: Joi.string().max(500).optional().allow(null, ''),
  }),

  previewConfigRestore: Joi.object({
    newConfiguration: Joi.object().required(),
  }),

  saveConfigDirect: Joi.object({
    configuration: Joi.object().required(),
    mode: Joi.string().valid('replace', 'merge').optional(),
  }),

  // ============================================================================
  // Logs schemas
  // ============================================================================

  frontendLog: Joi.object({
    level: Joi.string().valid('debug', 'info', 'warn', 'error').required(),
    message: Joi.string().max(2000).required(),
    context: Joi.object().optional().allow(null),
    timestamp: Joi.string().isoDate().optional(),
    userAgent: Joi.string().max(500).optional().allow(null, ''),
    url: Joi.string().max(2000).optional().allow(null, ''),
    breadcrumbs: Joi.array().items(Joi.object().unknown(true)).optional(),
  }),

  // ============================================================================
  // Objectives schemas
  // ============================================================================

  createObjective: Joi.object({
    site_id: Joi.string().uuid().required(),
    metric_type: Joi.string().min(1).max(100).required(),
    target_value: Joi.number().required(),
    target_date: Joi.string().isoDate().required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional().default('medium'),
    description: Joi.string().max(1000).optional().allow(null, ''),
    comparison_period: Joi.string().max(100).optional().allow(null, ''),
    auto_calculate: Joi.boolean().optional().default(true),
  }),

  updateObjective: Joi.object({
    target_value: Joi.number().optional(),
    target_date: Joi.string().isoDate().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    comparison_period: Joi.string().max(100).optional().allow(null, ''),
    auto_calculate: Joi.boolean().optional(),
  }),

  updateObjectiveStatus: Joi.object({
    status: Joi.string().valid('active', 'paused', 'completed', 'cancelled', 'failed').required(),
  }),

  // ============================================================================
  // Playlist Schedule schemas
  // ============================================================================

  createSchedule: Joi.object({
    site_id: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    schedule_type: Joi.string().valid('time_based', 'day_based', 'match_phase', 'event', 'manual').required(),
    priority: Joi.number().integer().min(0).max(100).optional().default(0),
    playlist_config: Joi.object().required(),
    time_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    day_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    match_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    start_date: Joi.string().isoDate().optional().allow(null, ''),
    end_date: Joi.string().isoDate().optional().allow(null, ''),
    is_active: Joi.boolean().optional().default(true),
  }),

  updateSchedule: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    schedule_type: Joi.string().valid('time_based', 'day_based', 'match_phase', 'event', 'manual').optional(),
    priority: Joi.number().integer().min(0).max(100).optional(),
    playlist_config: Joi.object().optional(),
    time_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    day_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    match_rules: Joi.array().items(Joi.object().unknown(true)).optional(),
    start_date: Joi.string().isoDate().optional().allow(null, ''),
    end_date: Joi.string().isoDate().optional().allow(null, ''),
    is_active: Joi.boolean().optional(),
  }),

  createCustomPlaylist: Joi.object({
    site_id: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    video_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
    loop_mode: Joi.string().valid('sequential', 'shuffle', 'weighted').optional(),
    transition_duration: Joi.number().integer().min(0).max(10000).optional(),
    is_public: Joi.boolean().optional(),
  }),

  updateCustomPlaylist: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    video_ids: Joi.array().items(Joi.string().uuid()).optional(),
    loop_mode: Joi.string().valid('sequential', 'shuffle', 'weighted').optional(),
    transition_duration: Joi.number().integer().min(0).max(10000).optional(),
    is_public: Joi.boolean().optional(),
  }),

  // ============================================================================
  // Reports schemas
  // ============================================================================

  generateReport: Joi.object({
    type: Joi.string().valid('club', 'advertiser', 'site_sponsor', 'global').required(),
    entityId: Joi.string().uuid().required(),
    periodStart: Joi.string().isoDate().required(),
    periodEnd: Joi.string().isoDate().required(),
  }),

  // ============================================================================
  // SAFe schemas
  // ============================================================================

  updateEpicStatus: Joi.object({
    status: Joi.string().valid('todo', 'in_progress', 'done', 'blocked').required(),
  }),

  updateEpic: Joi.object({
    status: Joi.string().valid('todo', 'in_progress', 'done', 'blocked').optional(),
    name: Joi.string().min(1).max(255).optional(),
  }),

  updateStoryStatus: Joi.object({
    status: Joi.string().valid('todo', 'in_progress', 'done', 'blocked', 'removed').required(),
  }),

  updateStoryFields: Joi.object({
    storyPoints: Joi.number().integer().min(0).max(100).optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  }),

  createProposal: Joi.object({
    title: Joi.string().min(1).max(500).required(),
    type: Joi.string().valid('feature', 'improvement', 'bug', 'tech-debt').required(),
    relatedEpic: Joi.string().max(100).optional().allow(null, ''),
    content: Joi.string().max(50000).required(),
  }),

  updateProposalStatus: Joi.object({
    status: Joi.string().valid('draft', 'in-review', 'approved', 'implementing', 'done').required(),
  }),

  updateProposalContent: Joi.object({
    title: Joi.string().min(1).max(500).optional(),
    content: Joi.string().max(50000).optional(),
  }),

  updateRiskRoamStatus: Joi.object({
    status: Joi.string().valid('resolved', 'owned', 'accepted', 'mitigated').required(),
  }),

  // ============================================================================
  // Config Profiles schemas
  // ============================================================================

  createProfile: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    display_name: Joi.string().max(255).optional().allow(null, ''),
    city: Joi.string().max(255).optional().allow(null, ''),
    sport: Joi.string().max(100).optional().allow(null, ''),
    sort_order: Joi.number().integer().min(0).default(0),
    is_default: Joi.boolean().default(false),
    configuration: Joi.object().optional(),
  }),

  updateProfile: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    display_name: Joi.string().max(255).optional().allow(null, ''),
    city: Joi.string().max(255).optional().allow(null, ''),
    sport: Joi.string().max(100).optional().allow(null, ''),
    sort_order: Joi.number().integer().min(0).optional(),
    is_default: Joi.boolean().optional(),
  }),

  updateProfileConfiguration: Joi.object({
    configuration: Joi.object().required(),
    mode: Joi.string().valid('replace', 'merge').optional(),
  }),

  // ============================================================================
  // Advertiser Portal schemas
  // ============================================================================

  uploadAdvertiserVideo: Joi.object({
    title: Joi.string().max(255).optional().allow(null, ''),
    category: Joi.string().max(100).optional().allow(null, ''),
  }),

  updateAdvertiserVideo: Joi.object({
    title: Joi.string().max(255).optional().allow(null, ''),
    category: Joi.string().max(100).optional().allow(null, ''),
  }),

  // ============================================================================
  // Advertiser Sites schemas
  // ============================================================================

  addSitesToAdvertiser: Joi.object({
    site_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
    contract_start: Joi.string().isoDate().optional().allow(null, ''),
    contract_end: Joi.string().isoDate().optional().allow(null, ''),
  }),

  updateAdvertiserSite: Joi.object({
    contract_start: Joi.string().isoDate().optional().allow(null),
    contract_end: Joi.string().isoDate().optional().allow(null),
    is_active: Joi.boolean().optional(),
  }),

  // ============================================================================
  // Users extra schemas (changeStatus, resetPassword)
  // ============================================================================

  changeUserStatus: Joi.object({
    status: Joi.string().valid('active', 'inactive', 'suspended').required(),
  }),

  adminResetPassword: Joi.object({
    new_password: Joi.string().min(8).required(),
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).required(),
  }),

  duplicateSite: Joi.object({
    site_name: Joi.string().max(255).optional(),
  }),

  // ── Remotion templates (admin) ─────────────────────────────────────────────
  templateUpdateSchema: Joi.object({
    props_schema: Joi.array().items(Joi.object()).optional(),
    default_props: Joi.object().optional(),
    name: Joi.string().max(255).optional(),
    description: Joi.string().allow(null, '').max(2000).optional(),
    // ADR-075 V2 — scope un template legacy à un club (super_admin only)
    site_id: Joi.string().uuid().allow(null).optional(),
    // ADR-075 — dimensions canvas Remotion (16:9, 9:16, 1:1…)
    canvas_width: Joi.number().integer().min(240).max(7680).optional(),
    canvas_height: Joi.number().integer().min(240).max(7680).optional(),
  }).min(1),

  // ADR-075 V2 — create template avec scope club optionnel (super_admin)
  templateCreateSchema: Joi.object({
    name: Joi.string().max(255).required(),
    composition_id: Joi.string().max(255).required(),
    description: Joi.string().allow(null, '').max(2000).optional(),
    props_schema: Joi.array().items(Joi.object()).optional(),
    default_props: Joi.object().optional(),
    site_id: Joi.string().uuid().allow(null).optional(),
  }),

  templateDuplicate: Joi.object({
    name: Joi.string().max(255).optional(),
  }),

  // ADR-075 — toggle schema_version 1 ↔ 2 (super_admin UI)
  templateSchemaVersionUpdate: Joi.object({
    schema_version: Joi.number().valid(1, 2).required(),
  }),

  // ADR-077 — body pour POST /:id/user-uploads (image slot / prop user-fillable)
  templateUserUploadBody: Joi.object({
    slot_key: Joi.string().pattern(/^[a-zA-Z0-9_-]{1,64}$/).required(),
  }),

  templateRestoreVersion: Joi.object({
    // Pas de body requis, l'ID de la version est dans l'URL.
  }),

  // ADR-108 — fork une version published pour créer une draft v+1
  templateFork: Joi.object({
    next_version: Joi.string()
      .pattern(/^\d+\.\d+$/)
      .required()
      .description("Version semver MAJOR.MINOR (ex '1.1', '2.0')"),
  }),

  // ADR-108 — set default_version (rollback ou promote)
  templateSetDefaultVersion: Joi.object({
    version: Joi.string()
      .pattern(/^\d+\.\d+$/)
      .required(),
  }),

  // ADR-109 — création d'un background couleur (super_admin upload).
  // Le WebM lui-même passe en multipart/form-data (multer), les autres
  // champs sont validés via ce schema.
  templateBackgroundCreate: Joi.object({
    name: Joi.string().min(1).max(80).required(),
    hex_color: Joi.string()
      .pattern(/^#[0-9A-Fa-f]{6}$/)
      .required(),
    is_public: Joi.boolean().optional(),
  }),

  // ADR-109 — patch background (rename, toggle public, archiver).
  templateBackgroundUpdate: Joi.object({
    name: Joi.string().min(1).max(80).optional(),
    is_public: Joi.boolean().optional(),
    archived: Joi.boolean().optional(),
  }).min(1),

  // ADR-109 — bulk grant : ajout d'un grant à plusieurs users.
  templateBackgroundBulkGrant: Joi.object({
    user_ids: Joi.array()
      .items(Joi.string().uuid())
      .min(1)
      .max(500)
      .required(),
  }),

  // PDF JOUEUR §démarrage — création option template-level.
  templateOptionCreate: Joi.object({
    key: Joi.string()
      .pattern(/^[a-z_][a-z0-9_]{0,63}$/)
      .required()
      .description('Identifiant snake_case (max 64 char)'),
    label: Joi.string().min(1).max(200).required(),
    type: Joi.string().valid('enum', 'boolean').default('enum'),
    values: Joi.array().items(Joi.string().max(80)).min(1).required(),
    default_value: Joi.string().max(200).required(),
    user_editable: Joi.boolean().default(true),
    sort_order: Joi.number().integer().min(0).default(0),
  }),

  // PDF JOUEUR §démarrage — patch partiel option.
  templateOptionUpdate: Joi.object({
    label: Joi.string().min(1).max(200).optional(),
    values: Joi.array().items(Joi.string().max(80)).min(1).optional(),
    default_value: Joi.string().max(200).optional(),
    user_editable: Joi.boolean().optional(),
    sort_order: Joi.number().integer().min(0).optional(),
  }).min(1),

  // PDF JOUEUR — création packshot ref (mappe option_value → packshot_template_id).
  templatePackshotRefCreate: Joi.object({
    option_key: Joi.string()
      .pattern(/^[a-z_][a-z0-9_]{0,63}$/)
      .required(),
    option_value: Joi.string().max(200).required(),
    packshot_template_id: Joi.string().uuid().required(),
    start_at_ms: Joi.number().integer().min(0).max(600000).default(0),
    z_index_offset: Joi.number().integer().min(0).max(10000).default(100),
  }),

  // ADR-074 — hotspot config
  hotspotConfigBootstrap: Joi.object({
    ssid: Joi.string().min(1).max(32).required(),
    psk: Joi.string().min(8).max(63).required(),
  }),
  hotspotConfigRotate: Joi.object({
    psk: Joi.string().min(8).max(63).optional(),
    ssid: Joi.string().min(1).max(32).optional(),
  }),

  // ── Template Studio v2 (ADR-075) ───────────────────────────────────────────
  templateStudioVariantCreate: Joi.object({
    name: Joi.string().max(100).required(),
    backgroundVideoUrl: Joi.string().uri().max(2000).required(),
    thumbnailUrl: Joi.string().uri().max(2000).allow(null, '').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
  }),
  templateStudioVariantUpdate: Joi.object({
    name: Joi.string().max(100).optional(),
    backgroundVideoUrl: Joi.string().uri().max(2000).optional(),
    thumbnailUrl: Joi.string().uri().max(2000).allow(null, '').optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
  }).min(1),

  templateStudioLayerCreate: Joi.object({
    name: Joi.string().max(100).required(),
    videoUrl: Joi.string().uri().max(2000).required(),
    zIndex: Joi.number().integer().required(),
    mask: Joi.object({
      top: Joi.number().min(0).max(1).optional(),
      bottom: Joi.number().min(0).max(1).optional(),
      left: Joi.number().min(0).max(1).optional(),
      right: Joi.number().min(0).max(1).optional(),
    }).optional(),
    durationMs: Joi.number().integer().min(0).max(600000).optional(),
  }),

  // ADR-110 / Plan 04 — single transactional reorder of all layers of a
  // template. Repository wraps the N updates in BEGIN/COMMIT and returns
  // the new ordered list. Ownership check on the repo side rejects layerIds
  // that don't belong to :id.
  templateStudioLayersReorder: Joi.object({
    orderedLayerIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),
  templateStudioLayerUpdate: Joi.object({
    name: Joi.string().max(100).optional(),
    videoUrl: Joi.string().uri().max(2000).optional(),
    zIndex: Joi.number().integer().optional(),
    mask: Joi.object({
      top: Joi.number().min(0).max(1).optional(),
      bottom: Joi.number().min(0).max(1).optional(),
      left: Joi.number().min(0).max(1).optional(),
      right: Joi.number().min(0).max(1).optional(),
    }).optional(),
    durationMs: Joi.number().integer().min(0).max(600000).optional(),
  }).min(1),

  templateStudioTextFieldCreate: Joi.object({
    slotKey: Joi.string().max(64).pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).required(),
    label: Joi.string().max(200).required(),
    positionX: Joi.number().min(0).max(1).required(),
    positionY: Joi.number().min(0).max(1).required(),
    maxWidth: Joi.number().min(0).max(1).optional(),
    fontFamily: Joi.string().max(80).optional(),
    fontSize: Joi.number().integer().min(8).max(800).required(),
    color: Joi.string().max(16).optional(),
    align: Joi.string().valid('left', 'center', 'right').optional(),
    appearAt: Joi.number().min(0).max(300).required(),
    appearDuration: Joi.number().min(0).max(10).optional(),
    animation: Joi.string()
      .valid('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in', 'zoom', 'logo-pop')
      .optional(),
    defaultValue: Joi.string().allow('').max(500).optional(),
    maxChars: Joi.number().integer().min(1).max(500).allow(null).optional(),
    multiline: Joi.boolean().optional(),
    required: Joi.boolean().optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    alwaysVisible: Joi.boolean().optional(),
    scaleFrom: Joi.number().min(0).max(5).optional(),
    scaleTo: Joi.number().min(0).max(5).optional(),
    layerId: Joi.string().uuid().allow(null).optional(),
    respectAlpha: Joi.boolean().optional(),
    animationDirection: Joi.string().valid('in', 'out').optional(),
    visibleIf: Joi.string().max(200).allow(null, '').optional(),
  }),
  templateStudioTextFieldUpdate: Joi.object({
    slotKey: Joi.string().max(64).pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).optional(),
    label: Joi.string().max(200).optional(),
    positionX: Joi.number().min(0).max(1).optional(),
    positionY: Joi.number().min(0).max(1).optional(),
    maxWidth: Joi.number().min(0).max(1).optional(),
    fontFamily: Joi.string().max(80).optional(),
    fontSize: Joi.number().integer().min(8).max(800).optional(),
    color: Joi.string().max(16).optional(),
    align: Joi.string().valid('left', 'center', 'right').optional(),
    appearAt: Joi.number().min(0).max(300).optional(),
    appearDuration: Joi.number().min(0).max(10).optional(),
    animation: Joi.string()
      .valid('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in', 'zoom', 'logo-pop')
      .optional(),
    defaultValue: Joi.string().allow('').max(500).optional(),
    maxChars: Joi.number().integer().min(1).max(500).allow(null).optional(),
    multiline: Joi.boolean().optional(),
    required: Joi.boolean().optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    alwaysVisible: Joi.boolean().optional(),
    scaleFrom: Joi.number().min(0).max(5).optional(),
    scaleTo: Joi.number().min(0).max(5).optional(),
    layerId: Joi.string().uuid().optional(),
    respectAlpha: Joi.boolean().optional(),
    animationDirection: Joi.string().valid('in', 'out').optional(),
  }).min(1),

  templateStudioImageSlotCreate: Joi.object({
    slotKey: Joi.string().max(64).pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).required(),
    label: Joi.string().max(200).required(),
    positionX: Joi.number().min(0).max(1).required(),
    positionY: Joi.number().min(0).max(1).required(),
    width: Joi.number().min(0).max(1).required(),
    height: Joi.number().min(0).max(1).required(),
    appearAt: Joi.number().min(0).max(300).required(),
    appearDuration: Joi.number().min(0).max(10).optional(),
    animation: Joi.string()
      .valid('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in', 'zoom', 'logo-pop')
      .optional(),
    aspectRatio: Joi.string().max(16).allow(null, '').optional(),
    required: Joi.boolean().optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    layerId: Joi.string().uuid().allow(null).optional(),
    anchor: Joi.string()
      .valid(
        'top-left', 'top-center', 'top-right',
        'center-left', 'center', 'center-right',
        'bottom-left', 'bottom-center', 'bottom-right'
      )
      .optional(),
    fitMode: Joi.string()
      .valid('contain', 'cover', 'fill-width-anchor-top', 'fill-height-anchor-left')
      .optional(),
    safeTopPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeLeftPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeWidthPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeHeightPct: Joi.number().min(0).max(100).allow(null).optional(),
    overflow: Joi.string()
      .valid('hidden', 'visible', 'top', 'bottom', 'left', 'right')
      .optional(),
    animationDirection: Joi.string().valid('in', 'out').optional(),
    scaleFrom: Joi.number().min(0).max(5).allow(null).optional(),
    scaleTo: Joi.number().min(0).max(5).allow(null).optional(),
    visibleIf: Joi.string().max(200).allow(null, '').optional(),
  }),
  templateStudioImageSlotUpdate: Joi.object({
    slotKey: Joi.string().max(64).pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/).optional(),
    label: Joi.string().max(200).optional(),
    positionX: Joi.number().min(0).max(1).optional(),
    positionY: Joi.number().min(0).max(1).optional(),
    width: Joi.number().min(0).max(1).optional(),
    height: Joi.number().min(0).max(1).optional(),
    appearAt: Joi.number().min(0).max(300).optional(),
    appearDuration: Joi.number().min(0).max(10).optional(),
    animation: Joi.string()
      .valid('none', 'fade', 'slide-up', 'slide-down', 'scale-in', 'blur-in', 'zoom', 'logo-pop')
      .optional(),
    aspectRatio: Joi.string().max(16).allow(null, '').optional(),
    required: Joi.boolean().optional(),
    sortOrder: Joi.number().integer().min(0).optional(),
    layerId: Joi.string().uuid().allow(null).optional(),
    anchor: Joi.string()
      .valid(
        'top-left', 'top-center', 'top-right',
        'center-left', 'center', 'center-right',
        'bottom-left', 'bottom-center', 'bottom-right'
      )
      .optional(),
    fitMode: Joi.string()
      .valid('contain', 'cover', 'fill-width-anchor-top', 'fill-height-anchor-left')
      .optional(),
    safeTopPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeLeftPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeWidthPct: Joi.number().min(0).max(100).allow(null).optional(),
    safeHeightPct: Joi.number().min(0).max(100).allow(null).optional(),
    overflow: Joi.string()
      .valid('hidden', 'visible', 'top', 'bottom', 'left', 'right')
      .optional(),
    animationDirection: Joi.string().valid('in', 'out').optional(),
    scaleFrom: Joi.number().min(0).max(5).allow(null).optional(),
    scaleTo: Joi.number().min(0).max(5).allow(null).optional(),
  }).min(1),
  // ADR-110 / Plan 02-04 / UX-03 — atomic rename of an option key.
  // Validates the body of POST /:id/options/:optionId/rename. The repo
  // handles transactional propagation across template_options, packshot_refs,
  // text_fields.visible_if, image_slots.visible_if (BEGIN/COMMIT/ROLLBACK).
  templateStudioOptionRename: Joi.object({
    newKey: Joi.string()
      .pattern(/^[a-z][a-z0-9_]*$/)
      .min(1)
      .max(64)
      .required()
      .messages({
        'string.pattern.base':
          'newKey must be snake_case ASCII (start with letter, then [a-z0-9_]).',
      }),
  }),

  // ADR-082 — Video club grants
  addVideoClubGrant: Joi.object({
    site_id: Joi.string().uuid().required(),
  }),
  // ADR-089 — Web page / livestream content
  createWebContent: Joi.object({
    contentType: Joi.string().valid('web_page', 'livestream').required(),
    name: Joi.string().min(1).max(255).required(),
    url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).required(),
    category: Joi.string().allow(null, '').optional(),
    subcategory: Joi.string().allow(null, '').optional(),
    durationSeconds: Joi.number().integer().min(1).max(86400).allow(null).optional(),
    thumbnailUrl: Joi.string().uri().allow(null, '').optional(),
    uploadedForSiteId: Joi.string().uuid().allow(null).optional(),
  }),
};

// ============================================================================
// ADR-110 / Phase 03 / Plan 03 / PUB-02 — Test render endpoint schemas
// ============================================================================
// Body is sealed (`unknown(false)`) — fixtures are injected server-side, no
// user input is ever accepted on POST /api/remotion-templates/:id/test-render.

export const testRenderSchemas = {
  params: Joi.object({ id: Joi.string().uuid().required() }),
  body: Joi.object({}).unknown(false),
};

// ============================================================================
// Reusable param schemas
// ============================================================================

export const paramSchemas = {
  id: Joi.object({ id: Joi.string().uuid().required() }),
  idString: Joi.object({ id: Joi.string().min(1).required() }),
  siteId: Joi.object({ siteId: Joi.string().uuid().required() }),
  idAndSiteId: Joi.object({
    id: Joi.string().uuid().required(),
    siteId: Joi.string().uuid().required(),
  }),
  idAndVideoId: Joi.object({
    id: Joi.string().uuid().required(),
    videoId: Joi.string().uuid().required(),
  }),
  advertiserIdAndSiteId: Joi.object({
    advertiserId: Joi.string().uuid().required(),
    siteId: Joi.string().uuid().required(),
  }),
  sprintIdAndStoryId: Joi.object({
    sprintId: Joi.string().min(1).required(),
    storyId: Joi.string().min(1).required(),
  }),
  siteIdAndVersionId: Joi.object({
    id: Joi.string().uuid().required(),
    versionId: Joi.string().uuid().required(),
  }),
  videoId: Joi.object({ videoId: Joi.string().uuid().required() }),
  reportId: Joi.object({ reportId: Joi.string().uuid().required() }),
  advertiserId: Joi.object({ advertiserId: Joi.string().uuid().required() }),
  siteSponsorId: Joi.object({ siteSponsorId: Joi.string().uuid().required() }),
  campaignId: Joi.object({ campaignId: Joi.string().uuid().required() }),
  deploymentId: Joi.object({ deploymentId: Joi.string().uuid().required() }),
  siteIdAndDeploymentId: Joi.object({
    siteId: Joi.string().uuid().required(),
    deploymentId: Joi.string().uuid().required(),
  }),
  sponsorIdAndSiteId: Joi.object({
    sponsorId: Joi.string().uuid().required(),
    siteId: Joi.string().uuid().required(),
  }),
  idAndCommandId: Joi.object({
    id: Joi.string().uuid().required(),
    commandId: Joi.string().uuid().required(),
  }),
  siteIdAndProfileId: Joi.object({
    siteId: Joi.string().uuid().required(),
    profileId: Joi.string().uuid().required(),
  }),
  jobId: Joi.object({ jobId: Joi.string().uuid().required() }),
  // ADR-075 — Template Studio v2 compound params
  idAndVariantId: Joi.object({
    id: Joi.string().uuid().required(),
    variantId: Joi.string().uuid().required(),
  }),
  idAndLayerId: Joi.object({
    id: Joi.string().uuid().required(),
    layerId: Joi.string().uuid().required(),
  }),
  idAndFieldId: Joi.object({
    id: Joi.string().uuid().required(),
    fieldId: Joi.string().uuid().required(),
  }),
  idAndSlotId: Joi.object({
    id: Joi.string().uuid().required(),
    slotId: Joi.string().uuid().required(),
  }),
  // ADR-058
  siteIdProfileIdTokenId: Joi.object({
    siteId: Joi.string().uuid().required(),
    profileId: Joi.string().uuid().required(),
    tokenId: Joi.string().uuid().required(),
  }),
  // ADR-109 — revoke d'un grant background pour un user
  backgroundIdAndUserId: Joi.object({
    backgroundId: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required(),
  }),
  // PDF JOUEUR §démarrage — option / packshot ref par template
  idAndOptionId: Joi.object({
    id: Joi.string().uuid().required(),
    optionId: Joi.string().uuid().required(),
  }),
  idAndPackshotRefId: Joi.object({
    id: Joi.string().uuid().required(),
    packshotRefId: Joi.string().uuid().required(),
  }),
};

// ============================================================================
// Reusable query schemas
// ============================================================================

export const querySchemas = {
  dateRange: Joi.object({
    from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: Joi.number().integer().min(1).max(365).optional(),
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(500).optional(),
    offset: Joi.number().integer().min(0).optional(),
  }),

  listCampaigns: Joi.object({
    status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'cancelled').optional(),
    advertiser_id: Joi.string().uuid().optional(),
  }),

  listObjectives: Joi.object({
    site_id: Joi.string().uuid().optional(),
    status: Joi.string().valid('active', 'paused', 'completed', 'cancelled', 'failed').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    metric_type: Joi.string().max(100).optional(),
  }),

  analyticsClub: Joi.object({
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }),

  analyticsAlerts: Joi.object({
    days: Joi.number().integer().min(1).max(365).optional().default(30),
    status: Joi.string().optional(),
    severity: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(500).optional().default(50),
  }),

  analyticsExport: Joi.object({
    from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    type: Joi.string().max(100).optional(),
  }),

  matchHistory: Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional(),
    from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),

  multiSiteComparison: Joi.object({
    site_ids: Joi.string().optional(),
    days: Joi.string().optional().default('30'),
  }),

  listSchedules: Joi.object({
    active_only: Joi.string().valid('true', 'false').optional(),
  }),

  activeRules: Joi.object({
    time: Joi.string().optional(),
    day: Joi.string().optional(),
    match_phase: Joi.string().optional(),
  }),

  listReports: Joi.object({
    limit: Joi.number().integer().min(1).max(200).optional(),
    offset: Joi.number().integer().min(0).optional(),
    type: Joi.string().valid('club', 'advertiser', 'site_sponsor', 'global').optional(),
  }),

  listUsers: Joi.object({
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency', 'club').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    search: Joi.string().max(255).optional(),
    site_id: Joi.string().uuid().optional(),
  }),

  configHistory: Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    offset: Joi.number().integer().min(0).optional().default(0),
  }),

  configDiff: Joi.object({
    version1: Joi.string().uuid().required(),
    version2: Joi.string().uuid().required(),
  }),

  verifyResetToken: Joi.object({
    token: Joi.string().min(1).max(500).required(),
  }),
};

// ============================================================================
// Quick task 260507-gxd — DELETE /api/remotion-templates/:id (P0 #1 + #2)
// ============================================================================

/**
 * Joi schema for DELETE /api/remotion-templates/:id params validation.
 * Aliased to `paramSchemas.id` for clarity at the route declaration site
 * (the smoke test greps for `remotionTemplateIdParam` to enforce wiring).
 */
export const remotionTemplateIdParam = Joi.object({
  id: Joi.string().uuid().required(),
});

/**
 * Joi schema for DELETE /api/remotion-templates/:id query validation.
 * `force=true` bypasses the 409 guard for published / in-use templates
 * (super_admin escape hatch — audited via metric `reason='admin_force'`).
 */
export const remotionTemplateDeleteQuery = Joi.object({
  force: Joi.string().valid('true', 'false').optional(),
});
