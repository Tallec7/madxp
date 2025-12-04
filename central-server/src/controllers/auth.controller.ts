import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateToken } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../config/logger';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at?: Date;
  last_login_at?: Date;
};

type PasswordRow = {
  password_hash: string;
};

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const result = await query<UserRow>(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info('User logged in', { email: user.email, role: user.role });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  logger.info('User logged out', { email: req.user?.email });
  return res.json({ message: 'Déconnexion réussie' });
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const result = await query<UserRow>(
      'SELECT id, email, full_name, role, created_at, last_login_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get current user error:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération des informations' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const { current_password, new_password } = req.body as { current_password: string; new_password: string };

    const result = await query<PasswordRow>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(current_password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    logger.info('Password changed', { userId: req.user.id });

    return res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    logger.error('Change password error:', error);
    return res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
  }
};
