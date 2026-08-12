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
        // Profil LED périmétrique (PROP-014 §3, §12) — présent uniquement pour les
        // displays de type 'led-perimeter'. `stripUnknown` retirerait cette clé si elle
        // n'était pas déclarée ici. `canvas_in` = config processeur, défauts provisoires
        // jusqu'au SPIKE matériel (SPIKE-003) ; `order` réutilise l'enum de fold().
        led: Joi.object({
          // Longueurs des côtés du périmètre, en mètres (topologie 1 à 8 côtés).
          sides: Joi.array().items(Joi.number().positive().max(500)).min(1).max(8).required(),
          // Pas de pixel (slug constructeur), ex. 'P6' = 6 mm.
          pitch: Joi.string().pattern(/^P\d+(\.\d+)?$/).max(8).required(),
          // Hauteur de dalle en px.
          height: Joi.number().integer().positive().max(2000).required(),
          // Cadence de répétition du motif, en mètres (dropdown contraint côté UI).
          spacing_m: Joi.number().positive().max(500).required(),
          // `zones` (PROP-014 §5) est RETIRÉ du schéma : champ mort, aucun lecteur en
          // production (vérifié 2026-08-10). Il n'est pas déclaré ici volontairement —
          // `stripUnknown: true` le retire silencieusement des payloads legacy, sans
          // 400, ce qui le fait disparaître de la DB à la première réécriture.
          // Le « contenu par côté » vit sur la variante d'une vidéo (révision ADR-135).
          // ⏳ Config processeur LED — lue à l'install (SPIKE), défauts provisoires.
          canvas_in: Joi.object({
            // PAS de défaut : 1920 se réinjectait à chaque sauvegarde et écrasait le
            // dérivé du terrain. Absent = « dérive-le du plus long côté ».
            band_width: Joi.number().integer().positive().max(7680).optional(),
            band_count: Joi.number().integer().positive().max(64).optional(), // dérivé
            order: Joi.string().valid('top-to-bottom', 'bottom-to-top').default('top-to-bottom'),
            mode: Joi.string().valid('A', 'B').default('B'),
            // ADR-139 étape D — servir le canvas PLIÉ au lieu du fichier brut.
            // PAS de `.default(true)` : l'activation doit être un geste délibéré,
            // posé après avoir observé le montage réel du club (cf. `npm run
            // led:mire`). `mode` ne pouvait pas servir de bascule — il vaut 'B'
            // par défaut sur tout le parc sans que personne l'ait choisi.
            serve_folded: Joi.boolean().optional(),
            // Mode d'affichage écran SaaS (PC classique, pas de kiosk-watchdog) :
            // scale le rendu sur une largeur de fenêtre réelle vs une "scène" de
            // référence 1920px, comme B2B Alive. PAS de `.default()` — activation
            // délibérée par site : un scale non-1:1 réintroduit un flou
            // d'interpolation sur le ruban si la fenêtre PC n'est pas exactement
            // 1920px de large (risque que le rendu pixel-exact par défaut évite
            // justement — cf. tv.component.scss). Off = comportement actuel
            // (taille fixe, marges noires, jamais de flou).
            scene_scaling: Joi.boolean().optional(),
          }).optional(),
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

  // PROP-014 §6 / ADR-134 — banc d'essai LED : plie une vidéo au choix pour le
  // profil LED du club dans la mise en page demandée.
  ledTestExport: Joi.object({
    video_id: Joi.string().uuid().required(),
    layout: Joi.string().valid('repeated', 'scrolling', 'stretched', 'centered').required(),
  }),

  // PROP-015 — analyse des marges d'une variante ruban. Lecture seule : le club
  // cible sert uniquement à connaître le format visé.
  ledVariantCropDetect: Joi.object({
    target_site_id: Joi.string().uuid().optional(),
  }),

  // PROP-015 — enregistrement du détourage VALIDÉ. `crop: null` le retire.
  // Aucun défaut : un corps vide ne détoure rien, il ne peut pas en activer un.
  ledVariantCrop: Joi.object({
    crop: Joi.object({
      x: Joi.number().integer().min(0).required(),
      y: Joi.number().integer().min(0).required(),
      w: Joi.number().integer().positive().required(),
      h: Joi.number().integer().positive().required(),
    })
      .allow(null)
      .required(),
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
    profileId: Joi.string().uuid().optional(),
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

  // ADR-132 — Rotation OTA du mot de passe système `pi`
  rotatePiPassword: Joi.object({
    password: Joi.string().min(8).max(128).required(),
  }),

  // Template Studio V2 (ADR-075) Joi schemas supprimés — cf. ADR-129.

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
// Templates Studio V1 — POST /render-requests body schema
// ============================================================================
// Système code-driven parallèle (cf STUDIO_V1.md). `site_id` est injecté
// serveur-side depuis req.user.site_id — JAMAIS dans le body (pattern aligné
// sur `uploaded_for_site_id` côté upload vidéo, cf .claude/rules/security.md).
// `props` est passé tel quel au moteur — sa validation fine se fait via le
// `inputSchema` du manifest côté worker.

export const templatesStudioSchemas = {
  createRenderRequest: Joi.object({
    template_id: Joi.string().uuid().required(),
    props: Joi.object().unknown(true).required(),
  }),

  // PUT /sites/:siteId/brand-kit body. Tous les champs sont optionnels — l'upsert
  // côté repo coalesce avec la valeur existante, donc un PUT partiel ne wipe pas
  // les autres sections. Les hex colors sont validés par regex pour éviter de
  // stocker des chaînes random qui casseraient les compositions Remotion.
  upsertBrandKit: Joi.object({
    club_name: Joi.string().max(120).allow(null, '').optional(),
    colors: Joi.object({
      primary: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
      secondary: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
      accent: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
    }).optional(),
    logos: Joi.object({
      primary: Joi.string().uri().optional(),
      mono_light: Joi.string().uri().optional(),
      mono_dark: Joi.string().uri().optional(),
    }).optional(),
    fonts: Joi.object({
      display: Joi.string().max(80).optional(),
      body: Joi.string().max(80).optional(),
    }).optional(),
  }).min(1),

  // POST /sites/:siteId/players body. site_id NE doit pas être dans le body
  // (injecté serveur-side depuis req.params, après tenant guard).
  // S4-A : photo URL externe acceptée (upload multipart via storage.service viendra
  // en S4-B). Le worker rembg Python (S4-C) consommera `photo_raw_url` en pending.
  createPlayer: Joi.object({
    prenom: Joi.string().min(1).max(80).required(),
    nom: Joi.string().min(1).max(80).required(),
    numero: Joi.number().integer().min(0).max(999).optional().allow(null),
    poste: Joi.string().max(60).optional().allow(null, ''),
    photo_raw_url: Joi.string().uri().optional().allow(null, ''),
    // ADR-082 pattern : si true ET role interne, joueur créé en global (site_id NULL)
    // + auto-grant vers le site courant. Ignoré pour les users club (toujours site-local).
    is_global: Joi.boolean().optional(),
  }),

  // PUT /sites/:siteId/players/:playerId body — tous champs optionnels.
  updatePlayer: Joi.object({
    prenom: Joi.string().min(1).max(80).optional(),
    nom: Joi.string().min(1).max(80).optional(),
    numero: Joi.number().integer().min(0).max(999).optional().allow(null),
    poste: Joi.string().max(60).optional().allow(null, ''),
    photo_raw_url: Joi.string().uri().optional().allow(null, ''),
    photo_cutout_url: Joi.string().uri().optional().allow(null, ''),
  }).min(1),

  // POST /api/templates-studio/players/global — création d'un joueur global
  // (réservé super_admin/operator). Pas de site_id : par définition NULL.
  createGlobalPlayer: Joi.object({
    prenom: Joi.string().min(1).max(80).required(),
    nom: Joi.string().min(1).max(80).required(),
    numero: Joi.number().integer().min(0).max(999).optional().allow(null),
    poste: Joi.string().max(60).optional().allow(null, ''),
    photo_raw_url: Joi.string().uri().optional().allow(null, ''),
  }),

  // POST /api/templates-studio/players/:playerId/grants — octroi d'un joueur
  // global vers un site spécifique (ADR-082 pattern, super_admin/operator).
  addPlayerGrant: Joi.object({
    site_id: Joi.string().uuid().required(),
  }),

  // POST /render-requests/:id/distribute body.
  // Distribution multi-sites des renders : `mode='push'` crée une row `videos`
  // par site cible (1 row par site, `uploaded_for_site_id = site_id`) ; `mode='grant'`
  // crée 1 row globale (`uploaded_for_site_id = NULL`) + N grants ADR-082.
  // `category` est optionnelle (défaut côté controller : 'STUDIO_RENDER').
  distributeRender: Joi.object({
    mode: Joi.string().valid('push', 'grant').required(),
    site_ids: Joi.array().items(Joi.string().uuid()).min(1).max(200).required(),
    category: Joi.string().max(80).optional(),
  }),

  // ──────────────────────────────────────────────────────────────────────────
  // ADR-125 — Asset library + bindings (Phase 1.5)
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/templates-studio/assets — multipart, file dans `asset`.
  // `tags` accepté en body comme JSON-string OU array (FormData appendable).
  uploadAsset: Joi.object({
    tags: Joi.alternatives()
      .try(
        Joi.array().items(Joi.string().max(60)).max(20),
        Joi.string().max(2000),
      )
      .optional(),
    filename: Joi.string().max(160).optional(),
  }).unknown(true), // multer parse multipart text fields outside .body

  // ADR-128 — POST /api/templates-studio/assets/directory — multipart ZIP
  // dans `asset`. Le serveur décompresse en mémoire, push frame par frame
  // sur FTP, INSERT 1 row `studio_assets` avec `asset_kind='directory'`.
  // `frame_pattern` est optionnel : si absent, auto-détecté depuis le tri
  // alpha des fichiers PNG.
  uploadAssetDirectory: Joi.object({
    tags: Joi.alternatives()
      .try(
        Joi.array().items(Joi.string().max(60)).max(20),
        Joi.string().max(2000),
      )
      .optional(),
    filename: Joi.string().max(160).optional(),
    frame_pattern: Joi.string().max(160).optional(),
  }).unknown(true),

  // GET /api/templates-studio/assets query.
  listAssetsQuery: Joi.object({
    tag: Joi.string().max(60).optional(),
    mime: Joi.string().max(120).optional(),
    search: Joi.string().max(160).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    offset: Joi.number().integer().min(0).optional(),
  }),

  // PATCH /api/templates-studio/assets/:assetId
  updateAssetMetadata: Joi.object({
    filename: Joi.string().min(1).max(160).optional(),
    tags: Joi.array().items(Joi.string().max(60)).max(20).optional(),
  }).min(1),

  // PUT /api/templates-studio/templates/:slug/asset-bindings/:assetKey
  bindAsset: Joi.object({
    asset_id: Joi.string().uuid().required(),
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
  siteIdAndPlayerId: Joi.object({
    siteId: Joi.string().uuid().required(),
    playerId: Joi.string().uuid().required(),
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
  // Templates Studio V1 — players globaux + grants (ADR-082 pattern)
  playerId: Joi.object({ playerId: Joi.string().uuid().required() }),
  playerIdAndSiteId: Joi.object({
    playerId: Joi.string().uuid().required(),
    siteId: Joi.string().uuid().required(),
  }),
  // ADR-125 — Templates Studio asset library + bindings.
  assetId: Joi.object({ assetId: Joi.string().uuid().required() }),
  templateSlug: Joi.object({ slug: Joi.string().min(1).max(80).required() }),
  templateSlugAndAssetKey: Joi.object({
    slug: Joi.string().min(1).max(80).required(),
    assetKey: Joi.string().min(1).max(80).required(),
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

// proxyAssetQuerySchema (V2 HMAC-signed proxy ADR-113-bis) supprimé — cf. ADR-129.
