import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { login, logout, me, changePassword } from './auth.controller';
import { query } from '../config/database';
import { AuthRequest } from '../types';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

describe('Auth Controller', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: 'hashed_password',
    full_name: 'Test User',
    role: 'admin' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return 401 if user not found', async () => {
      const req = {
        body: { email: 'notfound@example.com', password: 'password' },
      } as Request;
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email ou mot de passe incorrect' });
    });

    it('should return 401 if password is incorrect', async () => {
      const req = {
        body: { email: 'test@example.com', password: 'wrongpassword' },
      } as Request;
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email ou mot de passe incorrect' });
    });

    it('should return token and user on successful login', async () => {
      const req = {
        body: { email: 'test@example.com', password: 'correctpassword' },
      } as Request;
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] }) // SELECT user
        .mockResolvedValueOnce({ rows: [] }); // UPDATE last_login
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          user: expect.objectContaining({
            id: mockUser.id,
            email: mockUser.email,
            full_name: mockUser.full_name,
            role: mockUser.role,
          }),
        })
      );
    });

    it('should set HttpOnly cookie on successful login', async () => {
      const req = {
        body: { email: 'test@example.com', password: 'correctpassword' },
      } as Request;
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await login(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'neopro_token',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = {
        body: { email: 'test@example.com', password: 'password' },
      } as Request;
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la connexion' });
    });
  });

  describe('logout', () => {
    it('should return success message', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      await logout(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Déconnexion réussie' });
    });

    it('should clear the cookie on logout', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      await logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('neopro_token', { path: '/' });
    });
  });

  describe('me', () => {
    it('should return 401 if user not authenticated', async () => {
      const req = { user: undefined } as AuthRequest;
      const res = createMockResponse();

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Non authentifié' });
    });

    it('should return 404 if user not found in database', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Utilisateur non trouvé' });
    });

    it('should return user data on success', async () => {
      const req = {
        user: { id: 'user-123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      const userData = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'admin',
        created_at: new Date(),
        last_login_at: new Date(),
      };

      (query as jest.Mock).mockResolvedValueOnce({ rows: [userData] });

      await me(req, res);

      expect(res.json).toHaveBeenCalledWith(userData);
    });

    it('should return 500 on database error', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la récupération des informations' });
    });
  });

  describe('changePassword', () => {
    it('should return 401 if user not authenticated', async () => {
      const req = {
        user: undefined,
        body: { current_password: 'old', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Non authentifié' });
    });

    it('should return 404 if user not found', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'old', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Utilisateur non trouvé' });
    });

    it('should return 401 if current password is incorrect', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'wrong', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ password_hash: 'hashed_password' }],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Mot de passe actuel incorrect' });
    });

    it('should update password on success', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'correct', new_password: 'newpassword' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ password_hash: 'hashed_password' }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE query
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('new_hashed_password');

      await changePassword(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
      expect(query).toHaveBeenCalledWith(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        ['new_hashed_password', '123']
      );
      expect(res.json).toHaveBeenCalledWith({ message: 'Mot de passe modifié avec succès' });
    });

    it('should return 500 on database error', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'correct', new_password: 'newpassword' },
      } as AuthRequest;
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors du changement de mot de passe' });
    });
  });
});
