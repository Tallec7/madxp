import { QueryResultRow } from 'pg';
import { query } from '../config/database';
import { BaseRepository } from './base.repository';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: string;
  advertiser_id: string | null;
  sponsor_id: string | null;
  agency_id: string | null;
  site_id: string | null;
  mfa_enabled: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface UserWithRelations extends QueryResultRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  advertiser_id: string | null;
  agency_id: string | null;
  site_id: string | null;
  mfa_enabled: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  advertiser_name: string | null;
  agency_name: string | null;
  site_name: string | null;
}

export interface UserListFilters {
  role?: string;
  status?: string;
  search?: string;
  siteId?: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string | null;
  role: string;
  advertiserId: string | null;
  agencyId: string | null;
  siteId: string | null;
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  role?: string;
  advertiserId?: string | null;
  agencyId?: string | null;
  siteId?: string | null;
  status?: string;
}

export interface AuditLogRow extends QueryResultRow {
  action: string;
  ip_address: string;
  user_agent: string;
  accessed_at: Date;
}

export interface PasswordResetTokenRow extends QueryResultRow {
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

class UserRepositoryImpl extends BaseRepository<UserRow> {
  constructor() {
    super('users');
  }

  /**
   * Liste les utilisateurs avec filtres optionnels et jointures relations.
   */
  async listWithRelations(filters: UserListFilters = {}): Promise<{ users: UserWithRelations[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.role) {
      whereClause += ` AND u.role = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }

    if (filters.status) {
      whereClause += ` AND u.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.search) {
      whereClause += ` AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.siteId) {
      whereClause += ` AND u.site_id = $${paramIndex}`;
      params.push(filters.siteId);
      paramIndex++;
    }

    const result = await query<UserWithRelations>(
      `SELECT
        u.id, u.email, u.full_name, u.role, u.advertiser_id, u.agency_id, u.site_id,
        u.mfa_enabled, u.status, u.created_at, u.updated_at, u.last_login_at,
        adv.name as advertiser_name,
        a.name as agency_name,
        s.site_name as site_name
       FROM users u
       LEFT JOIN advertisers adv ON adv.id = u.advertiser_id
       LEFT JOIN agencies a ON a.id = u.agency_id
       LEFT JOIN sites s ON s.id = u.site_id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      params
    );

    return { users: result.rows, total: result.rowCount || 0 };
  }

  /**
   * Recupere un utilisateur par ID avec relations.
   */
  async findByIdWithRelations(id: string): Promise<UserWithRelations | null> {
    const result = await query<UserWithRelations>(
      `SELECT
        u.id, u.email, u.full_name, u.role, u.advertiser_id, u.agency_id, u.site_id,
        u.mfa_enabled, u.status, u.created_at, u.updated_at, u.last_login_at,
        adv.name as advertiser_name,
        a.name as agency_name,
        s.site_name as site_name
       FROM users u
       LEFT JOIN advertisers adv ON adv.id = u.advertiser_id
       LEFT JOIN agencies a ON a.id = u.agency_id
       LEFT JOIN sites s ON s.id = u.site_id
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recherche un utilisateur par email (pour auth).
   * Inclut le password_hash. Avec fallback sponsor_id pour compat.
   */
  async findByEmail(email: string): Promise<UserRow | null> {
    try {
      const result = await query<UserRow>(
        'SELECT id, email, password_hash, full_name, role, mfa_enabled, advertiser_id, agency_id, site_id FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code === '42703' && err?.message?.includes('"advertiser_id"')) {
        const result = await query<UserRow>(
          'SELECT id, email, password_hash, full_name, role, mfa_enabled, sponsor_id, agency_id FROM users WHERE email = $1',
          [email]
        );
        return result.rows[0] || null;
      }
      throw error;
    }
  }

  /**
   * Recherche un utilisateur par ID (pour auth /me).
   * Sans password_hash. Avec fallback sponsor_id.
   */
  async findForAuth(id: string): Promise<UserRow | null> {
    try {
      const result = await query<UserRow>(
        'SELECT id, email, full_name, role, advertiser_id, agency_id, site_id, created_at, last_login_at FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code === '42703' && err?.message?.includes('"advertiser_id"')) {
        const result = await query<UserRow>(
          'SELECT id, email, full_name, role, sponsor_id, agency_id, created_at, last_login_at FROM users WHERE id = $1',
          [id]
        );
        return result.rows[0] || null;
      }
      throw error;
    }
  }

  /**
   * Verifie si un email existe deja (pour validation unicite).
   */
  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    if (excludeId) {
      const result = await query(
        'SELECT 1 FROM users WHERE email = $1 AND id != $2 LIMIT 1',
        [email, excludeId]
      );
      return (result.rowCount ?? 0) > 0;
    }
    const result = await query(
      'SELECT 1 FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Cree un nouvel utilisateur.
   */
  async create(input: CreateUserInput): Promise<UserRow> {
    const result = await query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, role, advertiser_id, agency_id, site_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id, email, full_name, role, advertiser_id, agency_id, site_id, mfa_enabled, status, created_at, updated_at`,
      [input.email, input.passwordHash, input.fullName, input.role, input.advertiserId, input.agencyId, input.siteId]
    );
    return result.rows[0];
  }

  /**
   * Met a jour un utilisateur (avec COALESCE et gestion NULL pour advertiser/agency).
   */
  async update(id: string, data: UpdateUserInput): Promise<UserRow | null> {
    const advertiserId = data.advertiserId === null ? 'null' : data.advertiserId;
    const agencyId = data.agencyId === null ? 'null' : data.agencyId;
    const siteId = data.siteId === null ? 'null' : data.siteId;

    const result = await query<UserRow>(
      `UPDATE users
       SET email = COALESCE($1, email),
           full_name = COALESCE($2, full_name),
           role = COALESCE($3, role),
           advertiser_id = CASE WHEN $4::text = 'null' THEN NULL ELSE COALESCE($4::uuid, advertiser_id) END,
           agency_id = CASE WHEN $5::text = 'null' THEN NULL ELSE COALESCE($5::uuid, agency_id) END,
           site_id = CASE WHEN $6::text = 'null' THEN NULL ELSE COALESCE($6::uuid, site_id) END,
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, email, full_name, role, advertiser_id, agency_id, site_id, mfa_enabled, status, created_at, updated_at, last_login_at`,
      [data.email, data.fullName, data.role, advertiserId, agencyId, siteId, data.status, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Met a jour le statut d'un utilisateur.
   */
  async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended'): Promise<UserRow | null> {
    const result = await query<UserRow>(
      `UPDATE users
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, role, status, updated_at`,
      [status, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Met a jour le password hash.
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [passwordHash, id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Met a jour last_login_at.
   */
  async updateLastLogin(id: string): Promise<void> {
    await query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Recupere le password hash pour verification.
   */
  async getPasswordHash(id: string): Promise<string | null> {
    const result = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0]?.password_hash || null;
  }

  /**
   * Recupere le role d'un utilisateur.
   */
  async getRole(id: string): Promise<string | null> {
    const result = await query<{ role: string }>(
      'SELECT role FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0]?.role || null;
  }

  /**
   * Compte les super admins actifs (pour protection deletion).
   */
  async countActiveSuperAdmins(): Promise<number> {
    const result = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND status = 'active'",
      []
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Recupere les donnees utilisateur pour export RGPD.
   */
  async findForExport(id: string): Promise<UserRow | null> {
    const result = await query<UserRow>(
      `SELECT id, email, full_name, role, status, created_at, updated_at, last_login_at,
              advertiser_id, agency_id, mfa_enabled
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les logs d'audit d'un utilisateur.
   */
  async getAuditLogs(userId: string, limit = 100): Promise<AuditLogRow[]> {
    const result = await query<AuditLogRow>(
      `SELECT action, ip_address, user_agent, accessed_at
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY accessed_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  /**
   * Recupere l'historique des reset de mot de passe.
   */
  async getPasswordResetHistory(userId: string): Promise<PasswordResetTokenRow[]> {
    const result = await query<PasswordResetTokenRow>(
      `SELECT created_at, expires_at, used_at
       FROM password_reset_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }
}

export const userRepository = new UserRepositoryImpl();
