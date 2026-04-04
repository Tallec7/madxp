import { Injectable, signal } from '@angular/core';
import { Sponsor } from './advertiser-detail.models';

@Injectable()
export class AdvertiserModalService {
  readonly showEditModal = signal(false);
  readonly showDeleteModal = signal(false);

  openEditModal(): void {
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
  }

  openDeleteModal(): void {
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
  }

  closeAll(): void {
    this.showEditModal.set(false);
    this.showDeleteModal.set(false);
  }
}
