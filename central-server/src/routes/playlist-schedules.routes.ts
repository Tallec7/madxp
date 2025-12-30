/**
 * Routes API pour la gestion des programmations de playlists
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as playlistScheduleController from '../controllers/playlist-schedule.controller';

const router = Router();

// Routes des programmations par site
router.get('/sites/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), playlistScheduleController.listSchedules);
router.get('/sites/:siteId/active', authenticate, requireRole('admin', 'super_admin', 'operator'), playlistScheduleController.getActiveRules);

// Routes des programmations individuelles
router.get('/:id', authenticate, requireRole('admin', 'super_admin', 'operator'), playlistScheduleController.getSchedule);
router.post('/', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.createSchedule);
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.updateSchedule);
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.deleteSchedule);

// Routes des playlists personnalisées
router.get('/playlists/site/:siteId', authenticate, requireRole('admin', 'super_admin', 'operator'), playlistScheduleController.listCustomPlaylists);
router.post('/playlists', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.createCustomPlaylist);
router.put('/playlists/:id', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.updateCustomPlaylist);
router.delete('/playlists/:id', authenticate, requireRole('admin', 'super_admin'), playlistScheduleController.deleteCustomPlaylist);

export default router;
