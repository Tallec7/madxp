/**
 * ADR-088 + ADR-090 — Joi schema for scoreboard live state push (F-15.2).
 *
 * Basketball = tous les champs sensibles renseignés (fouls, shot clock).
 * Football = fouls/shotClock/timeoutRemainingMs optionnels (défaut 0).
 * Vendor `remote` = push émis par la Remote SaaS via socket (ADR-090).
 */

import Joi from 'joi';

export const scoreboardStateSchema = Joi.object({
  vendor: Joi.string().valid('bodet', 'stramatel', 'manual', 'remote').required(),
  sport: Joi.string().valid('basketball', 'football').required(),
  period: Joi.number().integer().min(0).max(20).required(),
  chronoMs: Joi.number().integer().min(0).max(60 * 60 * 1000).required(),
  clockRunning: Joi.boolean().required(),
  homeScore: Joi.number().integer().min(0).max(999).required(),
  guestScore: Joi.number().integer().min(0).max(999).required(),
  homeTeamFouls: Joi.number().integer().min(0).max(99).default(0),
  guestTeamFouls: Joi.number().integer().min(0).max(99).default(0),
  shotClockMs: Joi.number().integer().min(0).max(60 * 1000).default(0),
  timeoutActive: Joi.string().valid('home', 'guest').allow(null).default(null),
  timeoutRemainingMs: Joi.number().integer().min(0).max(10 * 60 * 1000).default(0),
  homeTeamName: Joi.string().max(80).allow('').default(''),
  guestTeamName: Joi.string().max(80).allow('').default(''),
});

/**
 * Valide un payload scoreboard-state-push (socket, pas de middleware Express).
 * Retourne l'objet normalisé (avec défauts appliqués) ou null si invalide.
 */
export function validateScoreboardStatePush(payload: unknown): Record<string, unknown> | null {
  const { error, value } = scoreboardStateSchema.validate(payload, {
    stripUnknown: true,
    abortEarly: true,
  });
  if (error) return null;
  return value as Record<string, unknown>;
}
