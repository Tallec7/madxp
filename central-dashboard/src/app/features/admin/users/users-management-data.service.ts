import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  UsersService,
  User,
  UserStatus,
  CreateUserData,
  UpdateUserData,
} from '../../../core/services/users.service';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';
import { ApiService } from '../../../core/services/api.service';
import { LoggerService } from '../../../core/services/logger.service';
import { ErrorExtractor } from '../../../core/utils/error-extractor';

export interface Advertiser {
  id: string;
  name: string;
  status: string;
}

@Injectable()
export class UsersManagementDataService {
  readonly usersService = inject(UsersService);
  private readonly agencyService = inject(AgencyPortalService);
  private readonly api = inject(ApiService);
  private readonly logger = inject(LoggerService);

  readonly users = signal<User[]>([]);
  readonly agencies = signal<Agency[]>([]);
  readonly advertisers = signal<Advertiser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  loadUsers(filters: Record<string, string>): void {
    this.loading.set(true);
    this.error.set(null);

    this.usersService.list(filters).subscribe({
      next: (response) => {
        if (response.success) {
          this.users.set(response.data.users);
        } else {
          this.error.set('Erreur lors du chargement des utilisateurs');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const message = ErrorExtractor.getMessage(err);
        this.logger.error('Failed to load users', { error: message });
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }

  loadAgencies(): void {
    this.agencyService.listAgencies().subscribe({
      next: (response) => {
        if (response.success) {
          this.agencies.set(response.data.agencies);
        }
      },
    });
  }

  loadAdvertisers(): void {
    this.api
      .get<{ success: boolean; data: { advertisers: Advertiser[] } }>('/analytics/advertisers')
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.advertisers.set(response.data.advertisers);
          }
        },
        error: () => {
          // Advertisers list may not be available, silently ignore
        },
      });
  }

  createUser(data: CreateUserData): Observable<{ success: boolean; data: User }> {
    return this.usersService.create(data);
  }

  updateUser(id: string, data: UpdateUserData): Observable<{ success: boolean; data: User }> {
    return this.usersService.update(id, data);
  }

  deleteUser(id: string): Observable<{ success: boolean }> {
    return this.usersService.delete(id);
  }

  toggleUserStatus(userId: string, newStatus: UserStatus): Observable<{ success: boolean }> {
    return this.usersService.toggleStatus(userId, newStatus);
  }
}
