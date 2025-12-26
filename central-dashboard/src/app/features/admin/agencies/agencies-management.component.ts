import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';

interface AgencyForm {
  name: string;
  description: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

@Component({
  selector: 'app-agencies-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Gestion des Agences</h1>
        <button
          (click)="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nouvelle Agence
        </button>
      </div>

      <!-- Loading state -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }

      <!-- Error state -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {{ error() }}
        </div>
      }

      <!-- Agencies list -->
      @if (!loading() && agencies().length > 0) {
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agence
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sites
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              @for (agency of agencies(); track agency.id) {
                <tr class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      @if (agency.logo_url) {
                        <img [src]="agency.logo_url" class="h-10 w-10 rounded-full mr-3" alt="">
                      } @else {
                        <div class="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                          <span class="text-purple-600 font-medium">{{ agency.name.charAt(0) }}</span>
                        </div>
                      }
                      <div>
                        <div class="text-sm font-medium text-gray-900">{{ agency.name }}</div>
                        @if (agency.description) {
                          <div class="text-sm text-gray-500 truncate max-w-xs">{{ agency.description }}</div>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-900">{{ agency.contact_name || '-' }}</div>
                    <div class="text-sm text-gray-500">{{ agency.contact_email || '-' }}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                      {{ agency.site_count || 0 }} sites
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span [class]="getStatusClass(agency.status)">
                      {{ agency.status === 'active' ? 'Actif' : 'Inactif' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      (click)="editAgency(agency)"
                      class="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Modifier
                    </button>
                    <button
                      (click)="manageSites(agency)"
                      class="text-green-600 hover:text-green-900 mr-4"
                    >
                      Sites
                    </button>
                    <button
                      (click)="confirmDelete(agency)"
                      class="text-red-600 hover:text-red-900"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && agencies().length === 0) {
        <div class="text-center py-12 bg-white rounded-lg shadow">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">Aucune agence</h3>
          <p class="mt-1 text-sm text-gray-500">Commencez par creer une nouvelle agence.</p>
          <div class="mt-6">
            <button
              (click)="showCreateModal = true"
              class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              + Nouvelle Agence
            </button>
          </div>
        </div>
      }

      <!-- Create/Edit Modal -->
      @if (showCreateModal || editingAgency) {
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div class="px-6 py-4 border-b border-gray-200">
              <h3 class="text-lg font-medium text-gray-900">
                {{ editingAgency ? 'Modifier l\'agence' : 'Nouvelle agence' }}
              </h3>
            </div>
            <form (ngSubmit)="saveAgency()" class="px-6 py-4 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Nom *</label>
                <input
                  type="text"
                  [(ngModel)]="agencyForm.name"
                  name="name"
                  required
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  [(ngModel)]="agencyForm.description"
                  name="description"
                  rows="2"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                ></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Nom du contact</label>
                <input
                  type="text"
                  [(ngModel)]="agencyForm.contact_name"
                  name="contact_name"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  [(ngModel)]="agencyForm.contact_email"
                  name="contact_email"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Telephone</label>
                <input
                  type="tel"
                  [(ngModel)]="agencyForm.contact_phone"
                  name="contact_phone"
                  class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
              </div>
              <div class="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  (click)="cancelEdit()"
                  class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  [disabled]="saving()"
                  class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {{ saving() ? 'Enregistrement...' : 'Enregistrer' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (deletingAgency) {
        <div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Confirmer la suppression</h3>
            <p class="text-sm text-gray-500 mb-6">
              Etes-vous sur de vouloir supprimer l'agence "{{ deletingAgency.name }}" ?
              Cette action est irreversible.
            </p>
            <div class="flex justify-end space-x-3">
              <button
                (click)="deletingAgency = null"
                class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                (click)="deleteAgency()"
                [disabled]="saving()"
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {{ saving() ? 'Suppression...' : 'Supprimer' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class AgenciesManagementComponent implements OnInit {
  private readonly agencyService = inject(AgencyPortalService);

  agencies = signal<Agency[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  showCreateModal = false;
  editingAgency: Agency | null = null;
  deletingAgency: Agency | null = null;

  agencyForm: AgencyForm = {
    name: '',
    description: '',
    contact_name: '',
    contact_email: '',
    contact_phone: ''
  };

  ngOnInit(): void {
    this.loadAgencies();
  }

  loadAgencies(): void {
    this.loading.set(true);
    this.error.set(null);

    this.agencyService.listAgencies().subscribe({
      next: (response) => {
        if (response.success) {
          this.agencies.set(response.data.agencies);
        } else {
          this.error.set('Erreur lors du chargement des agences');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur de connexion');
        this.loading.set(false);
      }
    });
  }

  editAgency(agency: Agency): void {
    this.editingAgency = agency;
    this.agencyForm = {
      name: agency.name,
      description: agency.description || '',
      contact_name: agency.contact_name || '',
      contact_email: agency.contact_email || '',
      contact_phone: agency.contact_phone || ''
    };
  }

  cancelEdit(): void {
    this.showCreateModal = false;
    this.editingAgency = null;
    this.resetForm();
  }

  resetForm(): void {
    this.agencyForm = {
      name: '',
      description: '',
      contact_name: '',
      contact_email: '',
      contact_phone: ''
    };
  }

  saveAgency(): void {
    if (!this.agencyForm.name.trim()) return;

    this.saving.set(true);

    const data = {
      name: this.agencyForm.name.trim(),
      description: this.agencyForm.description.trim() || undefined,
      contact_name: this.agencyForm.contact_name.trim() || undefined,
      contact_email: this.agencyForm.contact_email.trim() || undefined,
      contact_phone: this.agencyForm.contact_phone.trim() || undefined
    };

    const request = this.editingAgency
      ? this.agencyService.updateAgency(this.editingAgency.id, data)
      : this.agencyService.createAgency(data);

    request.subscribe({
      next: (response) => {
        if (response.success) {
          this.loadAgencies();
          this.cancelEdit();
        } else {
          this.error.set('Erreur lors de l\'enregistrement');
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur lors de l\'enregistrement');
        this.saving.set(false);
      }
    });
  }

  confirmDelete(agency: Agency): void {
    this.deletingAgency = agency;
  }

  deleteAgency(): void {
    if (!this.deletingAgency) return;

    this.saving.set(true);

    this.agencyService.deleteAgency(this.deletingAgency.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadAgencies();
          this.deletingAgency = null;
        } else {
          this.error.set('Erreur lors de la suppression');
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur lors de la suppression');
        this.saving.set(false);
      }
    });
  }

  manageSites(_agency: Agency): void {
    // TODO: Implement site management modal
    alert('Fonctionnalité en cours de développement');
  }

  getStatusClass(status: string): string {
    return status === 'active'
      ? 'px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full'
      : 'px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full';
  }
}
