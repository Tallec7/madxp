/**
 * Benchmark Routes
 *
 * Routes pour les benchmarks anonymisés
 */

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as benchmarkController from '../controllers/benchmark.controller';

const router = Router();

// Get global benchmark summary (admin only)
router.get('/global', authenticate, requireRole('admin'), benchmarkController.getGlobalBenchmark);

// Compare multiple sites (admin only)
router.get('/compare', authenticate, requireRole('admin'), benchmarkController.compareSites);

// Get benchmark for a specific site
router.get('/sites/:siteId', authenticate, requireRole('operator'), benchmarkController.getSiteBenchmark);

export default router;
