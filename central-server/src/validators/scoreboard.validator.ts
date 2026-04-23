/**
 * ADR-088 — Joi schema for scoreboard live state push (F-15.2 SaaS).
 */

import Joi from 'joi';

export const scoreboardStateSchema = Joi.object({
  vendor: Joi.string().valid('bodet', 'stramatel', 'manual').required(),
  sport: Joi.string().valid('basketball').required(),
  period: Joi.number().integer().min(0).max(20).required(),
  chronoMs: Joi.number().integer().min(0).max(60 * 60 * 1000).required(),
  clockRunning: Joi.boolean().required(),
  homeScore: Joi.number().integer().min(0).max(999).required(),
  guestScore: Joi.number().integer().min(0).max(999).required(),
  homeTeamFouls: Joi.number().integer().min(0).max(99).required(),
  guestTeamFouls: Joi.number().integer().min(0).max(99).required(),
  shotClockMs: Joi.number().integer().min(0).max(60 * 1000).required(),
  timeoutActive: Joi.string().valid('home', 'guest').allow(null).required(),
  timeoutRemainingMs: Joi.number().integer().min(0).max(10 * 60 * 1000).required(),
});
