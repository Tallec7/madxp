import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';
import { validate as validateUuid } from 'uuid';
import { userRepository } from '../repositories';

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * GET /api/users
 * Liste tous les utilisateurs (admin/super_admin only)
 */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, status, search, site_id } = req.query;

    const filters = {
      role: typeof role === 'string' ? role : undefined,
      status: typeof status === 'string' ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
      siteId: typeof site_id === 'string' ? site_id : undefined,
    };

    const { users, total } = await userRepository.listWithRelations(filters);

    res.json({
      success: true,
      data: {
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          advertiser_id: u.advertiser_id,
          advertiser_name: u.advertiser_name,
          agency_id: u.agency_id,
          agency_name: u.agency_name,
          mfa_enabled: u.mfa_enabled,
          status: u.status,
          created_at: u.created_at,
          updated_at: u.updated_at,
          last_login_at: u.last_login_at,
        })),
        total,
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

    const u = await userRepository.findByIdWithRelations(id);

    if (!u) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          advertiser_id: u.advertiser_id,
          advertiser_name: u.advertiser_name,
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
    const { email, password, full_name, role, advertiser_id, sponsor_id, agency_id, site_id } = req.body as {
      email: string;
      password: string;
      full_name: string;
      role: UserRole;
      advertiser_id?: string | null;
      sponsor_id?: string | null;
      agency_id?: string | null;
      site_id?: string | null;
    };
    const resolvedAdvertiserId = advertiser_id ?? sponsor_id ?? null;

    // Verifier que l'email n'existe pas deja
    const emailTaken = await userRepository.emailExists(email);

    if (emailTaken) {
      res.status(409).json({
        success: false,
        error: 'Un utilisateur avec cet email existe deja',
      });
      return;
    }

    // Valider les relations sponsor/agency selon le role
    if ((role === 'advertiser' || role === 'sponsor') && !resolvedAdvertiserId) {
      res.status(400).json({
        success: false,
        error: 'advertiser_id est requis pour le role advertiser',
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

    if (role === 'club' && !site_id) {
      res.status(400).json({
        success: false,
        error: 'site_id est requis pour le role club',
      });
      return;
    }

    // Hasher le mot de passe
    const password_hash = await bcrypt.hash(password, 10);

    const newUser = await userRepository.create({
      email,
      passwordHash: password_hash,
      fullName: full_name || null,
      role,
      advertiserId: resolvedAdvertiserId,
      agencyId: agency_id || null,
      siteId: site_id || null,
    });

    logger.info('User created', { userId: newUser.id, email, role, by: req.user?.email });

    res.status(201).json({
      success: true,
      data: newUser,
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
    const { email, full_name, role, advertiser_id, sponsor_id, agency_id, status } = req.body as {
      email?: string;
      full_name?: string;
      role?: UserRole;
      advertiser_id?: string | null;
      sponsor_id?: string | null;
      agency_id?: string | null;
      status?: string;
    };
    const resolvedAdvertiserId = advertiser_id ?? sponsor_id ?? null;

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
      const emailTaken = await userRepository.emailExists(email, id);

      if (emailTaken) {
        res.status(409).json({
          success: false,
          error: 'Un utilisateur avec cet email existe deja',
        });
        return;
      }
    }

    const updatedUser = await userRepository.update(id, {
      email,
      fullName: full_name,
      role,
      advertiserId: resolvedAdvertiserId === null ? null : resolvedAdvertiserId,
      agencyId: agency_id === null ? null : agency_id,
      status,
    });

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User updated', { userId: id, by: req.user?.email });

    res.json({
      success: true,
      data: updatedUser,
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

    const deleted = await userRepository.deleteById(id);

    if (!deleted) {
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

    const updatedUser = await userRepository.updateStatus(id, status as 'active' | 'inactive' | 'suspended');

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouve',
      });
      return;
    }

    logger.info('User status changed', { userId: id, status, by: req.user?.email });

    res.json({
      success: true,
      data: updatedUser,
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

    const passwordUpdated = await userRepository.updatePassword(id, password_hash);

    if (!passwordUpdated) {
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

// ============================================================================
// GDPR SELF-SERVICE ENDPOINTS
// ============================================================================

/**
 * DELETE /api/users/me
 * Suppression de son propre compte (RGPD Art. 17 - Droit à l'effacement)
 * Accessible à tout utilisateur authentifié
 */
export const deleteOwnAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Non authentifie',
      });
      return;
    }

    // Vérifier que l'utilisateur existe et n'est pas le seul super_admin
    const userRole = await userRepository.getRole(userId);

    if (!userRole) {
      res.status(404).json({
        success: false,
        error: 'Compte non trouve',
      });
      return;
    }

    // Si c'est un super_admin, vérifier qu'il n'est pas le seul
    if (userRole === 'super_admin') {
      const superAdminCount = await userRepository.countActiveSuperAdmins();

      if (superAdminCount <= 1) {
        res.status(400).json({
          success: false,
          error: 'Impossible de supprimer le dernier super administrateur. Nommez un autre super_admin avant de supprimer votre compte.',
        });
        return;
      }
    }

    // Supprimer le compte (les cascades s'occupent des données liées)
    await userRepository.deleteById(userId);

    logger.info('User deleted their own account (GDPR Art. 17)', {
      userId,
      email: req.user?.email,
    });

    // Invalider le cookie de session
    res.clearCookie('neopro_token');

    res.json({
      success: true,
      message: 'Votre compte a ete supprime avec succes. Conformement au RGPD Art. 17, toutes vos donnees personnelles ont ete effacees.',
    });
  } catch (error) {
    logger.error('Error deleting own account:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du compte',
    });
  }
};

/**
 * GET /api/users/me/export
 * Export de toutes les données personnelles (RGPD Art. 20 - Droit à la portabilité)
 * Retourne un JSON avec toutes les données de l'utilisateur
 */
export const exportOwnData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Non authentifie',
      });
      return;
    }

    // Récupérer les informations de base de l'utilisateur
    const user = await userRepository.findForExport(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Compte non trouve',
      });
      return;
    }

    // Récupérer l'historique d'audit de l'utilisateur
    const auditLogs = await userRepository.getAuditLogs(userId, 100);

    // Récupérer les tokens de reset de mot de passe (sans les hashs)
    const resetTokens = await userRepository.getPasswordResetHistory(userId);

    // Construire l'export RGPD
    const exportData = {
      _metadata: {
        export_date: new Date().toISOString(),
        format_version: '1.0',
        gdpr_article: 'Article 20 - Droit à la portabilité des données',
        controller: 'NEOPRO',
        contact: 'privacy@neopro.fr',
      },
      personal_data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        status: user.status,
        mfa_enabled: user.mfa_enabled,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
      },
      associations: {
        advertiser_id: user.advertiser_id,
        agency_id: user.agency_id,
      },
      activity_logs: auditLogs.map(log => ({
        action: log.action,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        timestamp: log.accessed_at,
      })),
      password_reset_history: resetTokens.map(token => ({
        requested_at: token.created_at,
        expires_at: token.expires_at,
        used_at: token.used_at,
      })),
    };

    logger.info('User exported their data (GDPR Art. 20)', {
      userId,
      email: req.user?.email,
    });

    // Envoyer en JSON avec headers appropriés pour le téléchargement
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="neopro-data-export-${new Date().toISOString().split('T')[0]}.json"`);

    res.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    logger.error('Error exporting user data:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'export des donnees',
    });
  }
};
