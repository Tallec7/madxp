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
};
