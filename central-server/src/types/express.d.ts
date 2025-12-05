import 'express';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: 'admin' | 'operator' | 'viewer';
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};

