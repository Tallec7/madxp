import { Injectable, signal } from '@angular/core';
import { UserRole, UserStatus } from '../../../core/services/users.service';

@Injectable()
export class UserFiltersService {
  readonly searchQuery = signal('');
  readonly filterRole = signal<UserRole | ''>('');
  readonly filterStatus = signal<UserStatus | ''>('');

  buildFilters(): Record<string, string> {
    const filters: Record<string, string> = {};
    const role = this.filterRole();
    const status = this.filterStatus();
    const search = this.searchQuery();

    if (role) filters['role'] = role;
    if (status) filters['status'] = status;
    if (search) filters['search'] = search;

    return filters;
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.filterRole.set('');
    this.filterStatus.set('');
  }
}
