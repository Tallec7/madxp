import { Injectable, signal } from '@angular/core';
import { Sponsor } from './advertiser-detail.models';

@Injectable()
export class AdvertiserFormService {
  readonly editForm = signal<Partial<Sponsor>>({});
  readonly saving = signal(false);
  readonly deleting = signal(false);

  initFromSponsor(sponsor: Sponsor): void {
    this.editForm.set({ ...sponsor });
  }

  resetForm(): void {
    this.editForm.set({});
  }

  updateField<K extends keyof Sponsor>(field: K, value: Sponsor[K]): void {
    this.editForm.update((form) => ({ ...form, [field]: value }));
  }

  validate(): boolean {
    const form = this.editForm();
    return !!form.name?.trim();
  }
}
