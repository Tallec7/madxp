import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { authRateLimit, apiRateLimit } from '../middleware/user-rate-limit';

const router = Router();

// Login has its own strict rate limit (anti-bruteforce)
router.post('/login', authRateLimit, validate(schemas.login), authController.login);

// Logout and me use standard API rate limit (not bruteforce targets)
router.post('/logout', apiRateLimit, authenticate, authController.logout);

router.get('/me', apiRateLimit, authenticate, authController.me);

router.post('/change-password', apiRateLimit, authenticate, authController.changePassword);

// Password reset routes (public - no auth required)
// These need strict rate limit to prevent email enumeration and abuse
router.post('/forgot-password', authRateLimit, validate(schemas.forgotPassword), authController.forgotPassword);
router.get('/verify-reset-token', apiRateLimit, authController.verifyResetToken);
router.post('/reset-password', authRateLimit, validate(schemas.resetPassword), authController.resetPassword);

export default router;
