import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import logger from '../config/logger';

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate req.body with a Joi schema (same pattern as existing `validate`).
 */
const validateBody = (schema: Joi.ObjectSchema) => {
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

      logger.warn('Validation error (body):', { errors, path: req.path });

      return res.status(400).json({
        error: 'Données invalides',
        details: errors,
      });
    }

    req.body = value;
    return next();
  };
};

/**
 * Validate req.query with a Joi schema.
 */
const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: false, // Preserve unknown query params (pagination, etc.)
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

    // Replace validated values (coerced types)
    for (const key of Object.keys(value)) {
      (req.query as Record<string, unknown>)[key] = value[key];
    }
    return next();
  };
};

/**
 * Validate req.params with a Joi schema.
 */
const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.params, {
      abortEarly: false,
      allowUnknown: true, // Express may add other params
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

// =============================================================================
// REUSABLE FIELD SCHEMAS
// =============================================================================

const uuidParam = Joi.string().uuid().required().messages({
  'string.guid': 'L\'identifiant doit être un UUID valide',
  'any.required': 'L\'identifiant est requis',
  'string.empty': 'L\'identifiant ne peut pas être vide',
});

const isoDateString = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .messages({
    'string.pattern.base': 'La date doit être au format YYYY-MM-DD',
  });

/**
 * Shared query schema for date range endpoints (from/to).
 * Validates ISO date format and ensures from <= to when both provided.
 */
const dateRangeQuery = Joi.object({
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  days: Joi.number().integer().min(1).max(365).optional(),
}).custom((value, helpers) => {
  // Convert `days` shorthand → from/to date range
  if (value.days && !value.from && !value.to) {
    const to = new Date();
    const from = new Date(Date.now() - value.days * 24 * 60 * 60 * 1000);
    value.from = from.toISOString().split('T')[0];
    value.to = to.toISOString().split('T')[0];
    delete value.days;
  }
  if (value.from && value.to) {
    const fromDate = new Date(value.from as string);
    const toDate = new Date(value.to as string);
    if (isNaN(fromDate.getTime())) {
      return helpers.error('custom', { message: 'La date "from" est invalide' });
    }
    if (isNaN(toDate.getTime())) {
      return helpers.error('custom', { message: 'La date "to" est invalide' });
    }
    if (fromDate > toDate) {
      return helpers.error('custom', { message: 'La date "from" doit être antérieure ou égale à "to"' });
    }
  }
  return value;
}).messages({
  custom: '{{#message}}',
});

// =============================================================================
// PARAM SCHEMAS
// =============================================================================

const advertiserIdParams = Joi.object({
  id: uuidParam,
});

const advertiserVideoIdParams = Joi.object({
  id: uuidParam,
  videoId: uuidParam.messages({
    'string.guid': 'L\'identifiant vidéo doit être un UUID valide',
  }),
});

const advertiserIdExcelParams = Joi.object({
  advertiserId: uuidParam.messages({
    'string.guid': 'L\'identifiant annonceur doit être un UUID valide',
  }),
});

const clubSiteIdParams = Joi.object({
  siteId: uuidParam.messages({
    'string.guid': 'L\'identifiant du site doit être un UUID valide',
  }),
});

const siteSponsorIdParams = Joi.object({
  siteId: uuidParam.messages({
    'string.guid': 'L\'identifiant du site doit être un UUID valide',
  }),
  sponsorId: uuidParam.messages({
    'string.guid': 'L\'identifiant du sponsor doit être un UUID valide',
  }),
});

const siteSponsorVideoParams = Joi.object({
  siteId: uuidParam.messages({
    'string.guid': 'L\'identifiant du site doit être un UUID valide',
  }),
  sponsorId: uuidParam.messages({
    'string.guid': 'L\'identifiant du sponsor doit être un UUID valide',
  }),
  filename: Joi.string().min(1).required().messages({
    'string.empty': 'Le nom de fichier ne peut pas être vide',
    'any.required': 'Le nom de fichier est requis',
  }),
});

// =============================================================================
// BODY SCHEMAS
// =============================================================================

const createAdvertiserBody = Joi.object({
  name: Joi.string().trim().min(1).max(255).required().messages({
    'string.empty': 'Le nom de l\'annonceur est requis',
    'any.required': 'Le nom de l\'annonceur est requis',
    'string.max': 'Le nom ne peut pas dépasser 255 caractères',
  }),
  logo_url: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'URL du logo doit être une URL valide',
  }),
  contact_email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'L\'email de contact doit être une adresse email valide',
  }),
  contact_name: Joi.string().max(255).optional().allow(null, ''),
  contact_phone: Joi.string().max(50).optional().allow(null, ''),
  metadata: Joi.object().optional().allow(null),
});

const updateAdvertiserBody = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional().messages({
    'string.empty': 'Le nom de l\'annonceur ne peut pas être vide',
    'string.max': 'Le nom ne peut pas dépasser 255 caractères',
  }),
  logo_url: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'URL du logo doit être une URL valide',
  }),
  contact_email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'L\'email de contact doit être une adresse email valide',
  }),
  contact_name: Joi.string().max(255).optional().allow(null, ''),
  contact_phone: Joi.string().max(50).optional().allow(null, ''),
  status: Joi.string().valid('active', 'inactive', 'paused').optional().messages({
    'any.only': 'Le statut doit être "active", "inactive" ou "paused"',
  }),
  metadata: Joi.object().optional().allow(null),
});

const addVideosToAdvertiserBody = Joi.object({
  video_ids: Joi.array()
    .items(Joi.string().uuid().messages({
      'string.guid': 'Chaque identifiant vidéo doit être un UUID valide',
    }))
    .min(1)
    .required()
    .messages({
      'array.min': 'Au moins un identifiant vidéo est requis',
      'any.required': 'La liste des identifiants vidéo est requise',
      'array.base': 'video_ids doit être un tableau',
    }),
  is_primary: Joi.boolean().optional().default(true),
});

const recordImpressionsBody = Joi.object({
  impressions: Joi.array()
    .items(
      Joi.object({
        event_id: Joi.string().uuid().optional().allow(null).messages({
          'string.guid': 'event_id doit être un UUID valide',
        }),
        site_sponsor_id: Joi.string().uuid().optional().allow(null).messages({
          'string.guid': 'site_sponsor_id doit être un UUID valide',
        }),
        video_id: Joi.string().uuid().optional().allow(null).messages({
          'string.guid': 'video_id doit être un UUID valide',
        }),
        video_filename: Joi.string().max(500).optional().allow(null, ''),
        played_at: Joi.string().isoDate().required().messages({
          'any.required': 'played_at est requis',
          'string.isoDate': 'played_at doit être une date ISO valide',
        }),
        duration_played: Joi.number().min(0).required().messages({
          'any.required': 'duration_played est requis',
          'number.min': 'duration_played doit être positif',
          'number.base': 'duration_played doit être un nombre',
        }),
        video_duration: Joi.number().min(0).required().messages({
          'any.required': 'video_duration est requis',
          'number.min': 'video_duration doit être positif',
          'number.base': 'video_duration doit être un nombre',
        }),
        completed: Joi.boolean().optional().default(false),
        interrupted_at: Joi.string().isoDate().optional().allow(null),
        event_type: Joi.string().max(50).optional().allow(null, ''),
        period: Joi.string().max(50).optional().allow(null, ''),
        trigger_type: Joi.string().valid('auto', 'manual', 'scheduled').optional().default('auto').messages({
          'any.only': 'trigger_type doit être "auto", "manual" ou "scheduled"',
        }),
        position_in_loop: Joi.number().integer().min(0).optional().allow(null),
        audience_estimate: Joi.number().integer().min(0).optional().allow(null),
      }).unknown(false)
    )
    .min(1)
    .max(500)
    .required()
    .messages({
      'array.min': 'Au moins une impression est requise',
      'array.max': 'Le batch ne peut pas dépasser 500 impressions',
      'any.required': 'Le tableau d\'impressions est requis',
      'array.base': 'impressions doit être un tableau',
    }),
});

const calculateDailyStatsBody = Joi.object({
  date: isoDateString.optional().messages({
    'string.pattern.base': 'La date doit être au format YYYY-MM-DD',
  }),
});

const exportQueryWithFormat = Joi.object({
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  format: Joi.string().valid('csv', 'json').optional().default('csv').messages({
    'any.only': 'Le format doit être "csv" ou "json"',
  }),
}).custom((value, helpers) => {
  if (value.from && value.to) {
    const fromDate = new Date(value.from as string);
    const toDate = new Date(value.to as string);
    if (isNaN(fromDate.getTime())) {
      return helpers.error('custom', { message: 'La date "from" est invalide' });
    }
    if (isNaN(toDate.getTime())) {
      return helpers.error('custom', { message: 'La date "to" est invalide' });
    }
    if (fromDate > toDate) {
      return helpers.error('custom', { message: 'La date "from" doit être antérieure ou égale à "to"' });
    }
  }
  return value;
}).messages({
  custom: '{{#message}}',
});

// =============================================================================
// SITE-SPONSOR BODY SCHEMAS
// =============================================================================

const createSiteSponsorBody = Joi.object({
  name: Joi.string().trim().min(1).max(255).required().messages({
    'string.empty': 'Le nom du sponsor est requis',
    'any.required': 'Le nom du sponsor est requis',
    'string.max': 'Le nom ne peut pas dépasser 255 caractères',
  }),
  contact_name: Joi.string().max(255).optional().allow(null, ''),
  contact_email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'L\'email de contact doit être une adresse email valide',
  }),
  contact_phone: Joi.string().max(50).optional().allow(null, ''),
  logo_url: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'URL du logo doit être une URL valide',
  }),
  contract_amount: Joi.number().min(0).optional().allow(null).messages({
    'number.min': 'Le montant du contrat doit être positif',
    'number.base': 'Le montant du contrat doit être un nombre',
  }),
  contract_start: isoDateString.optional().allow(null, ''),
  contract_end: isoDateString.optional().allow(null, ''),
  metadata: Joi.object().optional().allow(null),
});

const updateSiteSponsorBody = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional().messages({
    'string.empty': 'Le nom du sponsor ne peut pas être vide',
    'string.max': 'Le nom ne peut pas dépasser 255 caractères',
  }),
  contact_name: Joi.string().max(255).optional().allow(null, ''),
  contact_email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'L\'email de contact doit être une adresse email valide',
  }),
  contact_phone: Joi.string().max(50).optional().allow(null, ''),
  logo_url: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'URL du logo doit être une URL valide',
  }),
  contract_amount: Joi.number().min(0).optional().allow(null).messages({
    'number.min': 'Le montant du contrat doit être positif',
    'number.base': 'Le montant du contrat doit être un nombre',
  }),
  contract_start: isoDateString.optional().allow(null, ''),
  contract_end: isoDateString.optional().allow(null, ''),
  status: Joi.string().valid('active', 'inactive', 'paused').optional().messages({
    'any.only': 'Le statut doit être "active", "inactive" ou "paused"',
  }),
  metadata: Joi.object().optional().allow(null),
});

const addVideoToSiteSponsorBody = Joi.object({
  video_id: Joi.string().uuid().optional().allow(null).messages({
    'string.guid': 'video_id doit être un UUID valide',
  }),
  video_filename: Joi.string().min(1).max(500).required().messages({
    'string.empty': 'Le nom de fichier vidéo est requis',
    'any.required': 'Le nom de fichier vidéo est requis',
    'string.max': 'Le nom de fichier ne peut pas dépasser 500 caractères',
  }),
  is_primary: Joi.boolean().optional().default(false),
});

const listSiteSponsorsQuery = Joi.object({
  include_inactive: Joi.string().valid('true', 'false').optional().messages({
    'any.only': 'include_inactive doit être "true" ou "false"',
  }),
});

// =============================================================================
// EXPORTED MIDDLEWARE FUNCTIONS
// =============================================================================

export const analyticsValidation = {
  // ---------- Advertiser CRUD ----------
  getAdvertiser: validateParams(advertiserIdParams),
  createAdvertiser: validateBody(createAdvertiserBody),
  updateAdvertiser: [
    validateParams(advertiserIdParams),
    validateBody(updateAdvertiserBody),
  ],
  deleteAdvertiser: validateParams(advertiserIdParams),

  // ---------- Advertiser-Video Association ----------
  getAdvertiserVideos: validateParams(advertiserIdParams),
  addVideosToAdvertiser: [
    validateParams(advertiserIdParams),
    validateBody(addVideosToAdvertiserBody),
  ],
  removeVideoFromAdvertiser: validateParams(advertiserVideoIdParams),

  // ---------- Analytics / Stats ----------
  getAdvertiserStats: [
    validateParams(advertiserIdParams),
    validateQuery(dateRangeQuery),
  ],
  getAdvertiserKpis: [
    validateParams(advertiserIdParams),
    validateQuery(dateRangeQuery),
  ],
  exportAdvertiserData: [
    validateParams(advertiserIdParams),
    validateQuery(exportQueryWithFormat),
  ],
  exportAdvertiserExcel: [
    validateParams(advertiserIdExcelParams),
    validateQuery(dateRangeQuery),
  ],
  generateAdvertiserPdfReport: [
    validateParams(advertiserIdParams),
    validateQuery(dateRangeQuery),
  ],
  generateClubPdfReport: [
    validateParams(clubSiteIdParams),
    validateQuery(dateRangeQuery),
  ],

  // ---------- Impressions (Pi endpoint) ----------
  recordImpressions: validateBody(recordImpressionsBody),

  // ---------- Daily Stats (Cron) ----------
  calculateDailyStats: validateBody(calculateDailyStatsBody),
};

export const siteSponsorValidation = {
  // ---------- Site Sponsor CRUD ----------
  listSiteSponsors: [
    validateParams(clubSiteIdParams),
    validateQuery(listSiteSponsorsQuery),
  ],
  getSiteSponsor: validateParams(siteSponsorIdParams),
  createSiteSponsor: [
    validateParams(clubSiteIdParams),
    validateBody(createSiteSponsorBody),
  ],
  updateSiteSponsor: [
    validateParams(siteSponsorIdParams),
    validateBody(updateSiteSponsorBody),
  ],
  deleteSiteSponsor: validateParams(siteSponsorIdParams),

  // ---------- Site Sponsor Stats ----------
  getSiteSponsorStats: [
    validateParams(siteSponsorIdParams),
    validateQuery(dateRangeQuery),
  ],
  getSiteSponsorBenchmark: [
    validateParams(clubSiteIdParams),
    validateQuery(dateRangeQuery),
  ],

  // ---------- Site Sponsor Videos ----------
  addVideoToSiteSponsor: [
    validateParams(siteSponsorIdParams),
    validateBody(addVideoToSiteSponsorBody),
  ],
  removeVideoFromSiteSponsor: validateParams(siteSponsorVideoParams),

  // ---------- Access Link ----------
  createAccessLink: validateParams(siteSponsorIdParams),
};
