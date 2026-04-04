import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-users-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="filters">
      <input
        type="text"
        [(ngModel)]="searchQuery"
        (ngModelChange)="searchChange.emit($event)"
        [placeholder]="'common.search' | translate"
        class="search-input"
      />
      <select [(ngModel)]="filterRole" (ngModelChange)="roleChange.emit($event)" class="filter-select">
        <option value="">{{ 'users.allRoles' | translate }}</option>
        <option value="super_admin">Super Admin</option>
        <option value="admin">{{ 'roles.admin' | translate }}</option>
        <option value="operator">{{ 'roles.operator' | translate }}</option>
        <option value="viewer">{{ 'roles.viewer' | translate }}</option>
        <option value="advertiser">Annonceur</option>
        <option value="agency">Agence</option>
      </select>
      <select [(ngModel)]="filterStatus" (ngModelChange)="statusChange.emit($event)" class="filter-select">
        <option value="">{{ 'status.all' | translate }}</option>
        <option value="active">{{ 'users.active' | translate }}</option>
        <option value="inactive">{{ 'users.inactive' | translate }}</option>
        <option value="suspended">Suspendu</option>
      </select>
    </div>
  `,
  styles: [
    `
      .filters {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }

      .search-input {
        flex: 1;
        min-width: 200px;
        padding: 0.625rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
      }

      .search-input:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .filter-select {
        padding: 0.625rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        background: white;
        cursor: pointer;
      }

      .filter-select:focus {
        outline: none;
        border-color: #2563eb;
      }
    `,
  ],
})
export class UsersFiltersComponent {
  @Output() searchChange = new EventEmitter<string>();
  @Output() roleChange = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<string>();

  searchQuery = '';
  filterRole = '';
  filterStatus = '';
}
