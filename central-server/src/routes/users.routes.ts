import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
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

// Liste tous les utilisateurs
router.get(
  '/',
  authenticate,
  requireRole('admin', 'super_admin'),
  listUsers
);

// Recuperer un utilisateur
router.get(
  '/:id',
  authenticate,
  requireRole('admin', 'super_admin'),
  getUser
);

// Creer un utilisateur (super_admin only)
router.post(
  '/',
  authenticate,
  requireRole('super_admin'),
  validate(schemas.createUser),
  createUser
);

// Mettre a jour un utilisateur (super_admin only)
router.put(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validate(schemas.updateUser),
  updateUser
);

// Supprimer un utilisateur (super_admin only)
router.delete(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  deleteUser
);

// Changer le statut d'un utilisateur (super_admin only)
router.patch(
  '/:id/status',
  authenticate,
  requireRole('super_admin'),
  toggleUserStatus
);

// Reset le mot de passe d'un utilisateur (super_admin only)
router.post(
  '/:id/reset-password',
  authenticate,
  requireRole('super_admin'),
  adminResetPassword
);

export default router;
