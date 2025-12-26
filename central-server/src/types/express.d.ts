import 'express';

// Types de rôles disponibles dans le système
export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'sponsor' | 'agency';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
      sponsor_id?: string | null;  // Pour les utilisateurs sponsor
      agency_id?: string | null;   // Pour les utilisateurs agence
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};

