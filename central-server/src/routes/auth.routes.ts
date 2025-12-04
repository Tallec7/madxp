import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

router.post('/login', validate(schemas.login), authController.login);

router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, authController.me);

router.post('/change-password', authenticate, authController.changePassword);

export default router;
