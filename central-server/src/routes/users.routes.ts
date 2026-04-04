import express from 'express';
import { authenticate, requireRole, requireSuperAdmin } from '../middleware/auth';
import { validate, validateParams, validateQuery, paramSchemas, querySchemas, schemas } from '../middleware/validation';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  adminResetPassword,
  deleteOwnAccount,
  exportOwnData,
} from '../controllers/users.controller';

const router = express.Router();

// ============================================================================
// GDPR SELF-SERVICE ENDPOINTS (tous les utilisateurs authentifiés)
// Ces routes doivent être AVANT les routes avec :id pour éviter les conflits
// ============================================================================

// GET /api/users/me/export - Export de données personnelles (RGPD Art. 20)
router.get(
  '/me/export',
  authenticate,
  exportOwnData
);

// DELETE /api/users/me - Suppression de son propre compte (RGPD Art. 17)
router.delete(
  '/me',
  authenticate,
  deleteOwnAccount
);

// ============================================================================
// USERS CRUD (Admin/Super Admin only)
// ============================================================================

// Liste tous les utilisateurs (admin + super_admin via bypass)
router.get(
  '/',
  authenticate,
  requireRole('admin'),
  validateQuery(querySchemas.listUsers),
  listUsers
);

// Recuperer un utilisateur (admin + super_admin via bypass)
router.get(
  '/:id',
  authenticate,
  requireRole('admin'),
  validateParams(paramSchemas.id),
  getUser
);

// Creer un utilisateur (super_admin only)
router.post(
  '/',
  authenticate,
  requireSuperAdmin(),
  validate(schemas.createUser),
  createUser
);

// Mettre a jour un utilisateur (super_admin only)
router.put(
  '/:id',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  validate(schemas.updateUser),
  updateUser
);

// Supprimer un utilisateur (super_admin only)
router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  deleteUser
);

// Changer le statut d'un utilisateur (super_admin only)
router.patch(
  '/:id/status',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  validate(schemas.changeUserStatus),
  toggleUserStatus
);

// Reset le mot de passe d'un utilisateur (super_admin only)
router.post(
  '/:id/reset-password',
  authenticate,
  requireSuperAdmin(),
  validateParams(paramSchemas.id),
  validate(schemas.adminResetPassword),
  adminResetPassword
);

export default router;
