import 'express';

// Types de rôles disponibles dans le système
// Note: 'advertiser' remplace 'sponsor' - 'sponsor' gardé pour rétrocompatibilité
export type UserRole = 'super_admin' | 'superadmin' | 'admin' | 'operator' | 'viewer' | 'advertiser' | 'sponsor' | 'agency' | 'club';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
      advertiser_id?: string | null;  // Pour les utilisateurs annonceurs
      sponsor_id?: string | null;     // @deprecated - Utiliser advertiser_id
      agency_id?: string | null;      // Pour les utilisateurs agence
      site_id?: string | null;        // Pour les utilisateurs club
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};

