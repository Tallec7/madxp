import { Router } from 'express';
import { exportBillingMonth, getBillingSummary } from '../controllers/billing.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { adminRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// All billing routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('super_admin', 'admin'));

/**
 * GET /api/billing/monthly?month=2026-01&format=csv|json
 * Export billing data for a specific month
 */
router.get('/monthly', adminRateLimit, exportBillingMonth);

/**
 * GET /api/billing/summary?start=2026-01&end=2026-06
 * Get billing summary for multiple months
 */
router.get('/summary', adminRateLimit, getBillingSummary);

export default router;
