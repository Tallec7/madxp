import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { login, logout, me, changePassword } from './auth.controller';
import { AuthRequest } from '../types';
import { userRepository, UserRow } from '../repositories';
import { generateToken } from '../middleware/auth';
import { mfaService } from '../services/mfa.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Mock logger (Winston) — avoid console output during tests
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock repositories
jest.mock('../repositories', () => ({
  userRepository: {
    findByEmail: jest.fn(),
    updateLastLogin: jest.fn(),
    findForAuth: jest.fn(),
    getPasswordHash: jest.fn(),
    updatePassword: jest.fn(),
  },
}));

// Mock middleware/auth
jest.mock('../middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
}));

// Mock mfaService
jest.mock('../services/mfa.service', () => ({
  mfaService: {
    verifyMfaLogin: jest.fn(),
  },
}));

// Mock password-reset and email services (imported by controller but not tested here)
jest.mock('../services/password-reset.service', () => ({
  passwordResetService: {
    requestReset: jest.fn(),
    verifyToken: jest.fn(),
    resetPassword: jest.fn(),
  },
}));
jest.mock('../services/email.service', () => ({
  emailService: {
    sendPasswordResetEmail: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;
const mockGenerateToken = generateToken as jest.MockedFunction<typeof generateToken>;
const mockMfaService = mfaService as jest.Mocked<typeof mfaService>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth Controller', () => {
  const mockUser: Pick<
    UserRow,
    'id' | 'email' | 'password_hash' | 'full_name' | 'role' | 'mfa_enabled' | 'advertiser_id' | 'sponsor_id' | 'agency_id'
  > = {
    id: 'user-123',
    email: 'test@example.com',
    password_hash: 'hashed_password',
    full_name: 'Test User',
    role: 'admin',
    mfa_enabled: false,
    advertiser_id: null,
    sponsor_id: null,
    agency_id: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateToken.mockReturnValue('mock-jwt-token');
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login', () => {
    it('should return 401 if user not found', async () => {
      const req = {
        body: { email: 'notfound@example.com', password: 'password' },
      } as Request;
      const res = createMockResponse();

      mockUserRepository.findByEmail.mockResolvedValueOnce(null);

      await login(req, res);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('notfound@example.com');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email ou mot de passe incorrect' });
    });

    it('should return 401 if password is incorrect', async () => {
      const req = {
        body: { email: 'test@example.com', password: 'wrongpassword' },
      } as Request;
      const res = createMockResponse();

      mockUserRepository.findByEmail.mockResolvedValueOnce(mockUser as UserRow);
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

      mockUserRepository.findByEmail.mockResolvedValueOnce(mockUser as UserRow);
      mockUserRepository.updateLastLogin.mockResolvedValueOnce(undefined);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await login(req, res);

      expect(mockUserRepository.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
      expect(mockGenerateToken).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mock-jwt-token',
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

      mockUserRepository.findByEmail.mockResolvedValueOnce(mockUser as UserRow);
      mockUserRepository.updateLastLogin.mockResolvedValueOnce(undefined);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await login(req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'neopro_token',
        'mock-jwt-token',
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

      mockUserRepository.findByEmail.mockRejectedValueOnce(new Error('DB Error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la connexion' });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('should return success message', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      await logout(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'D\u00e9connexion r\u00e9ussie' });
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

  // -------------------------------------------------------------------------
  // me
  // -------------------------------------------------------------------------
  describe('me', () => {
    it('should return 401 if user not authenticated', async () => {
      const req = { user: undefined } as AuthRequest;
      const res = createMockResponse();

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Non authentifi\u00e9' });
    });

    it('should return 404 if user not found in database', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.findForAuth.mockResolvedValueOnce(null);

      await me(req, res);

      expect(mockUserRepository.findForAuth).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Utilisateur non trouv\u00e9' });
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
        advertiser_id: null,
        sponsor_id: null,
        agency_id: null,
      };

      mockUserRepository.findForAuth.mockResolvedValueOnce(userData as UserRow);

      await me(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-123',
          email: 'test@example.com',
          role: 'admin',
        })
      );
    });

    it('should return 500 on database error', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.findForAuth.mockRejectedValueOnce(new Error('DB Error'));

      await me(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors de la r\u00e9cup\u00e9ration des informations' });
    });
  });

  // -------------------------------------------------------------------------
  // changePassword
  // -------------------------------------------------------------------------
  describe('changePassword', () => {
    it('should return 401 if user not authenticated', async () => {
      const req = {
        user: undefined,
        body: { current_password: 'old', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Non authentifi\u00e9' });
    });

    it('should return 404 if user not found', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'old', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.getPasswordHash.mockResolvedValueOnce(null);

      await changePassword(req, res);

      expect(mockUserRepository.getPasswordHash).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Utilisateur non trouv\u00e9' });
    });

    it('should return 401 if current password is incorrect', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'wrong', new_password: 'new' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.getPasswordHash.mockResolvedValueOnce('hashed_password');
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await changePassword(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrong', 'hashed_password');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Mot de passe actuel incorrect' });
    });

    it('should update password on success', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'correct', new_password: 'newpassword' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.getPasswordHash.mockResolvedValueOnce('hashed_password');
      mockUserRepository.updatePassword.mockResolvedValueOnce(true);
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
      (bcrypt.hash as jest.Mock).mockResolvedValueOnce('new_hashed_password');

      await changePassword(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith('123', 'new_hashed_password');
      expect(res.json).toHaveBeenCalledWith({ message: 'Mot de passe modifi\u00e9 avec succ\u00e8s' });
    });

    it('should return 500 on database error', async () => {
      const req = {
        user: { id: '123', email: 'test@example.com', role: 'admin' },
        body: { current_password: 'correct', new_password: 'newpassword' },
      } as AuthRequest;
      const res = createMockResponse();

      mockUserRepository.getPasswordHash.mockRejectedValueOnce(new Error('DB Error'));

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erreur lors du changement de mot de passe' });
    });
  });
});
