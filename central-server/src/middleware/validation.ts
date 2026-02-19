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
};
