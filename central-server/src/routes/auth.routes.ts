import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate, validateQuery, querySchemas, schemas } from '../middleware/validation';
import { authRateLimit, apiRateLimit, monitoringRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// Login has its own strict rate limit (anti-bruteforce)
router.post('/login', authRateLimit, validate(schemas.login), authController.login);

// Logout uses standard API rate limit
router.post('/logout', apiRateLimit, authenticate, authController.logout);

// /me uses monitoringRateLimit (300/min) instead of apiRateLimit (100/min)
// because it's called frequently by multiple components (guards, polling, etc.)
// and is not a security-sensitive operation (just reads current user)
router.get('/me', monitoringRateLimit, authenticate, authController.me);

router.post('/change-password', apiRateLimit, authenticate, validate(schemas.changePassword), authController.changePassword);

// Password reset routes (public - no auth required)
// These need strict rate limit to prevent email enumeration and abuse
router.post('/forgot-password', authRateLimit, validate(schemas.forgotPassword), authController.forgotPassword);
router.get('/verify-reset-token', apiRateLimit, validateQuery(querySchemas.verifyResetToken), authController.verifyResetToken);
router.post('/reset-password', authRateLimit, validate(schemas.resetPassword), authController.resetPassword);

export default router;
