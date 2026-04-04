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
    hardware_model: Joi.string().optional(),
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
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency').required(),
    advertiser_id: Joi.string().uuid().optional().allow(null),
    sponsor_id: Joi.string().uuid().optional().allow(null),
    agency_id: Joi.string().uuid().optional().allow(null),
  }),

  updateUser: Joi.object({
    email: Joi.string().email().optional(),
    full_name: Joi.string().optional(),
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency').optional(),
    advertiser_id: Joi.string().uuid().optional().allow(null),
    sponsor_id: Joi.string().uuid().optional().allow(null),
    agency_id: Joi.string().uuid().optional().allow(null),
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
      'play-sponsors', 'timer-update', 'breaking-news', 'match-config',
      'recording-toggle', 'screenshot'
    ).required(),
    data: Joi.object().optional().default({}),
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
    plan: Joi.string().valid('trial', 'standard', 'premium').required(),
    note: Joi.string().max(500).optional().allow('', null),
  }),

  updateSubscription: Joi.object({
    subscription_start: Joi.string().isoDate().optional().allow(null, ''),
    subscription_end: Joi.string().isoDate().optional().allow(null, ''),
    subscription_plan: Joi.string().valid('trial', 'standard', 'premium').optional().allow(null),
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

  recordVideoPlays: Joi.object({
    site_id: Joi.string().uuid().required(),
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
    }).unknown(true)).min(1).required(),
  }),

  manageSession: Joi.object({
    site_id: Joi.string().uuid().required(),
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
    status: Joi.string().valid('draft', 'review', 'approved', 'rejected', 'implemented').required(),
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
    description: Joi.string().max(1000).optional().allow(null, ''),
    configuration: Joi.object().optional(),
  }),

  updateProfile: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
  }),

  updateProfileConfiguration: Joi.object({
    configuration: Joi.object().required(),
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
    role: Joi.string().valid('super_admin', 'admin', 'operator', 'viewer', 'advertiser', 'sponsor', 'agency').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    search: Joi.string().max(255).optional(),
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
