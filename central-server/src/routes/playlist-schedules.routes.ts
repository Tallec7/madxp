/**
 * Routes API pour la gestion des programmations de playlists
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import * as playlistScheduleController from '../controllers/playlist-schedule.controller';

const router = Router();

// Routes des programmations par site
router.get('/sites/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.siteId), validateQuery(querySchemas.listSchedules), playlistScheduleController.listSchedules);
router.get('/sites/:siteId/active', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.siteId), validateQuery(querySchemas.activeRules), playlistScheduleController.getActiveRules);

// Routes des programmations individuelles
router.get('/:id', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.id), playlistScheduleController.getSchedule);
router.post('/', authenticate, requireRole('admin', 'super_admin'), validate(schemas.createSchedule), playlistScheduleController.createSchedule);
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), validate(schemas.updateSchedule), playlistScheduleController.updateSchedule);
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), playlistScheduleController.deleteSchedule);

// Routes des playlists personnalisées
router.get('/playlists/site/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), validateParams(paramSchemas.siteId), playlistScheduleController.listCustomPlaylists);
router.post('/playlists', authenticate, requireRole('admin', 'super_admin'), validate(schemas.createCustomPlaylist), playlistScheduleController.createCustomPlaylist);
router.put('/playlists/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), validate(schemas.updateCustomPlaylist), playlistScheduleController.updateCustomPlaylist);
router.delete('/playlists/:id', authenticate, requireRole('admin', 'super_admin'), validateParams(paramSchemas.id), playlistScheduleController.deleteCustomPlaylist);

export default router;
