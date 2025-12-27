import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type UserRole = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'sponsor' | 'agency';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  sponsor_id: string | null;
  sponsor_name?: string | null;
  agency_id: string | null;
  agency_name?: string | null;
  mfa_enabled: boolean;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

export interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  sponsor_id?: string | null;
  agency_id?: string | null;
}

export interface UpdateUserData {
  email?: string;
  full_name?: string;
  role?: UserRole;
  sponsor_id?: string | null;
  agency_id?: string | null;
  status?: UserStatus;
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly api = inject(ApiService);

  /**
   * List all users with optional filters
   */
  list(filters?: { role?: string; status?: string; search?: string }): Observable<{ success: boolean; data: { users: User[]; total: number } }> {
    const params: Record<string, string> = {};
    if (filters?.role) params['role'] = filters.role;
    if (filters?.status) params['status'] = filters.status;
    if (filters?.search) params['search'] = filters.search;
    return this.api.get('/users', params);
  }

  /**
   * Get a single user by ID
   */
  get(id: string): Observable<{ success: boolean; data: { user: User } }> {
    return this.api.get(`/users/${id}`);
  }

  /**
   * Create a new user
   */
  create(data: CreateUserData): Observable<{ success: boolean; data: User }> {
    return this.api.post('/users', data);
  }

  /**
   * Update a user
   */
  update(id: string, data: UpdateUserData): Observable<{ success: boolean; data: User }> {
    return this.api.put(`/users/${id}`, data);
  }

  /**
   * Delete a user
   */
  delete(id: string): Observable<{ success: boolean; message: string }> {
    return this.api.delete(`/users/${id}`);
  }

  /**
   * Toggle user status (activate/deactivate)
   */
  toggleStatus(id: string, status: UserStatus): Observable<{ success: boolean; data: User }> {
    return this.api.patch(`/users/${id}/status`, { status });
  }

  /**
   * Admin reset password for a user
   */
  adminResetPassword(id: string, newPassword: string): Observable<{ success: boolean; message: string }> {
    return this.api.post(`/users/${id}/reset-password`, { new_password: newPassword });
  }

  /**
   * Get role display name (for UI)
   */
  getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrateur',
      operator: 'Operateur',
      viewer: 'Observateur',
      sponsor: 'Sponsor',
      agency: 'Agence',
    };
    return labels[role] || role;
  }

  /**
   * Get status display class (for badges)
   */
  getStatusClass(status: UserStatus): string {
    const classes: Record<UserStatus, string> = {
      active: 'badge-success',
      inactive: 'badge-warning',
      suspended: 'badge-danger',
    };
    return classes[status] || 'badge-secondary';
  }
}
