import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { AuthRequest, User, UserRole } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';

// ============================================================================
// USERS CONTROLLER
// Gestion CRUD des utilisateurs (super_admin only pour creation/modification)
// ============================================================================

interface UserRow {
  [key: string]: unknown;
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  sponsor_id: string | null;
  agency_id: string | null;
  mfa_enabled: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

interface UserWithRelations extends UserRow {
  sponsor_name?: string | null;
  agency_name?: string | null;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * GET /api/users
 * Liste tous les utilisateurs (admin/super_admin only)
 */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, status, search } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: (string | boolean)[] = [];
    let paramIndex = 1;

    // Filtre par role
    if (role && typeof role === 'string') {
      whereClause += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    // Filtre par statut
    if (status && typeof status === 'string') {
      whereClause += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Recherche par email ou nom
    if (search && typeof search === 'string') {
      whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const result = await query<UserWithRelations>(
      `SELECT
        u.id, u.email, u.full_name, u.role, u.sponsor_id, u.agency_id,
        u.mfa_enabled, u.status, u.created_at, u.updated_at, u.last_login_at,
        s.name as sponsor_name,
        a.name as agency_name
       FROM users u
       LEFT JOIN sponsors s ON s.id = u.sponsor_id
       LEFT JOIN agencies a ON a.id = u.agency_id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: {
        users: result.rows.map(u => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          sponsor_id: u.sponsor_id,
          sponsor_name: u.sponsor_name,
          agency_id: u.agency_id,
          agency_name: u.agency_name,
          mfa_enabled: u.mfa_enabled,
          status: u.status,
          created_at: u.created_at,
          updated_at: u.updated_at,
          last_login_at: u.last_login_at,
        })),
        total: result.rowCount || 0,
      },
    });
  } catch (error) {
    logger.error('Error listing users:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des utilisateurs',
    });
  }
};

/**
 * GET /api/users/:id
 * Recuperer un utilisateur par ID
 */
export const getUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide',
      });
      return;
    }

    const result = await query<UserWithRelations>(
      `SELECT
        u.id, u.email, u.full_name, u.role, u.sponsor_id, u.agency_id,
        u.mfa_enabled, u.status, u.created_at, u.updated_at, u.last_login_at,
        s.name as sponsor_name,
        a.name as agency_name
       FROM users u
       LEFT JOIN sponsors s ON s.id = u.sponsor_id
       LEFT JOIN agencies a ON a.id = u.agency_id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    const u = result.rows[0];
    res.json({
      success: true,
      data: {
        user: {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          sponsor_id: u.sponsor_id,
          sponsor_name: u.sponsor_name,
          agency_id: u.agency_id,
          agency_name: u.agency_name,
          mfa_enabled: u.mfa_enabled,
          status: u.status,
          created_at: u.created_at,
          updated_at: u.updated_at,
          last_login_at: u.last_login_at,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'utilisateur',
    });
  }
};

/**
 * POST /api/users
 * Creer un nouvel utilisateur (super_admin only)
 */
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, role, sponsor_id, agency_id } = req.body;

    // Verifier que l'email n'existe pas deja
    const existingUser = await query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rowCount && existingUser.rowCount > 0) {
      res.status(409).json({
        success: false,
        error: 'Un utilisateur avec cet email existe deja',
      });
      return;
    }

    // Valider les relations sponsor/agency selon le role
    if (role === 'sponsor' && !sponsor_id) {
      res.status(400).json({
        success: false,
        error: 'sponsor_id est requis pour le role sponsor',
      });
      return;
    }

    if (role === 'agency' && !agency_id) {
      res.status(400).json({
        success: false,
        error: 'agency_id est requis pour le role agency',
      });
      return;
    }

    // Hasher le mot de passe
    const password_hash = await bcrypt.hash(password, 10);

    const result = await query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, role, sponsor_id, agency_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, email, full_name, role, sponsor_id, agency_id, mfa_enabled, status, created_at, updated_at`,
      [email, password_hash, full_name || null, role, sponsor_id || null, agency_id || null]
    );

    logger.info('User created', { userId: result.rows[0].id, email, role, by: req.user?.email });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la creation de l\'utilisateur',
    });
  }
};

/**
 * PUT /api/users/:id
 * Mettre a jour un utilisateur (super_admin only)
 * Note: Ne met pas a jour le mot de passe (utiliser une route separee)
 */
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, full_name, role, sponsor_id, agency_id, status } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide',
      });
      return;
    }

    // Empecher la modification de son propre compte (sauf full_name)
    if (id === req.user?.id && (role || status)) {
      res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas modifier votre propre role ou statut',
      });
      return;
    }

    // Si changement d'email, verifier qu'il n'existe pas deja
    if (email) {
      const existingUser = await query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );

      if (existingUser.rowCount && existingUser.rowCount > 0) {
        res.status(409).json({
          success: false,
          error: 'Un utilisateur avec cet email existe deja',
        });
        return;
      }
    }

    const result = await query<UserRow>(
      `UPDATE users
       SET email = COALESCE($1, email),
           full_name = COALESCE($2, full_name),
           role = COALESCE($3, role),
           sponsor_id = CASE WHEN $4::text = 'null' THEN NULL ELSE COALESCE($4::uuid, sponsor_id) END,
           agency_id = CASE WHEN $5::text = 'null' THEN NULL ELSE COALESCE($5::uuid, agency_id) END,
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, full_name, role, sponsor_id, agency_id, mfa_enabled, status, created_at, updated_at, last_login_at`,
      [email, full_name, role, sponsor_id === null ? 'null' : sponsor_id, agency_id === null ? 'null' : agency_id, status, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User updated', { userId: id, by: req.user?.email });

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise a jour de l\'utilisateur',
    });
  }
};

/**
 * DELETE /api/users/:id
 * Supprimer un utilisateur (super_admin only)
 */
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide',
      });
      return;
    }

    // Empecher la suppression de son propre compte
    if (id === req.user?.id) {
      res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas supprimer votre propre compte',
      });
      return;
    }

    const result = await query(`DELETE FROM users WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User deleted', { userId: id, by: req.user?.email });

    res.json({
      success: true,
      message: 'Utilisateur supprime',
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de l\'utilisateur',
    });
  }
};

/**
 * PATCH /api/users/:id/status
 * Activer/desactiver un utilisateur (super_admin only)
 */
export const toggleUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide',
      });
      return;
    }

    if (!status || !['active', 'inactive', 'suspended'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Statut invalide. Valeurs acceptees: active, inactive, suspended',
      });
      return;
    }

    // Empecher la desactivation de son propre compte
    if (id === req.user?.id) {
      res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas modifier votre propre statut',
      });
      return;
    }

    const result = await query<UserRow>(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, role, status, updated_at`,
      [status, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User status changed', { userId: id, status, by: req.user?.email });

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de statut',
    });
  }
};

/**
 * POST /api/users/:id/reset-password
 * Reset le mot de passe d'un utilisateur (super_admin only)
 * Genere un nouveau mot de passe temporaire
 */
export const adminResetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!validateUuid(id)) {
      res.status(400).json({
        success: false,
        error: 'ID utilisateur invalide',
      });
      return;
    }

    if (!new_password || new_password.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 8 caracteres',
      });
      return;
    }

    const password_hash = await bcrypt.hash(new_password, 10);

    const result = await query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email`,
      [password_hash, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User password reset by admin', { userId: id, by: req.user?.email });

    res.json({
      success: true,
      message: 'Mot de passe reinitialise avec succes',
    });
  } catch (error) {
    logger.error('Error resetting user password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la reinitialisation du mot de passe',
    });
  }
};
