import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { getNetworkSponsorStats } from '../controllers/site-sponsor.controller';

const router = express.Router();

// GET /api/network/advertisers/:advertiserId/stats
// Stats réseau agrégées pour un annonceur NEOPRO (tous clubs confondus)
router.get(
  '/advertisers/:advertiserId/stats',
  authenticate,
  requireRole('admin', 'operator', 'advertiser'),
  getNetworkSponsorStats
);

export default router;
