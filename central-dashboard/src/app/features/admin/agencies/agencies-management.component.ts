import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Agency } from '../../../core/services/agency-portal.service';
import { Site } from '../../../core/models';
import { AgenciesManagementDataService, AgencySite, AgencyFormData } from './agencies-management.data.service';

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
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './agencies-management.component.html',
  styleUrls: ['./agencies-management.component.scss'],
})
export class AgenciesManagementComponent implements OnInit {
  private readonly dataService = inject(AgenciesManagementDataService);

  agencies = signal<Agency[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  showCreateModal = false;
  editingAgency: Agency | null = null;
  deletingAgency: Agency | null = null;

  // Sites management
  managingSitesAgency: Agency | null = null;
  loadingSites = signal(false);
  agencySites = signal<AgencySite[]>([]);
  allSites = signal<Site[]>([]);
  filteredAvailableSites = signal<Site[]>([]);
  selectedSitesToAdd = signal<Set<string>>(new Set());
  siteSearchQuery = '';

  agencyForm: AgencyForm = {
    name: '',
    description: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  };

  ngOnInit(): void {
    this.loadAgencies();
  }

  loadAgencies(): void {
    this.loading.set(true);
    this.error.set(null);

    this.dataService.listAgencies().subscribe({
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
      },
    });
  }

  editAgency(agency: Agency): void {
    this.editingAgency = agency;
    this.agencyForm = {
      name: agency.name,
      description: agency.description || '',
      contact_name: agency.contact_name || '',
      contact_email: agency.contact_email || '',
      contact_phone: agency.contact_phone || '',
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
      contact_phone: '',
    };
  }

  saveAgency(): void {
    if (!this.agencyForm.name.trim()) return;

    this.saving.set(true);

    const data: AgencyFormData = {
      name: this.agencyForm.name.trim(),
      description: this.agencyForm.description.trim() || undefined,
      contact_name: this.agencyForm.contact_name.trim() || undefined,
      contact_email: this.agencyForm.contact_email.trim() || undefined,
      contact_phone: this.agencyForm.contact_phone.trim() || undefined,
    };

    const request = this.editingAgency
      ? this.dataService.updateAgency(this.editingAgency.id, data)
      : this.dataService.createAgency(data);

    request.subscribe({
      next: (response) => {
        if (response.success) {
          this.loadAgencies();
          this.cancelEdit();
        } else {
          this.error.set("Erreur lors de l'enregistrement");
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || "Erreur lors de l'enregistrement");
        this.saving.set(false);
      },
    });
  }

  confirmDelete(agency: Agency): void {
    this.deletingAgency = agency;
  }

  deleteAgency(): void {
    if (!this.deletingAgency) return;

    this.saving.set(true);

    this.dataService.deleteAgency(this.deletingAgency.id).subscribe({
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
      },
    });
  }

  manageSites(agency: Agency): void {
    this.managingSitesAgency = agency;
    this.loadingSites.set(true);
    this.selectedSitesToAdd.set(new Set());
    this.siteSearchQuery = '';

    this.dataService.getAgencySites(agency.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.agencySites.set(response.data.sites);
        }
        this.loadAllSites();
      },
      error: () => {
        this.error.set('Erreur lors du chargement des sites');
        this.loadingSites.set(false);
      },
    });
  }

  private loadAllSites(): void {
    this.dataService.loadAllSites().subscribe({
      next: (response) => {
        this.allSites.set(response.sites);
        this.filterAvailableSites();
        this.loadingSites.set(false);
      },
      error: () => {
        this.error.set('Erreur lors du chargement des sites');
        this.loadingSites.set(false);
      },
    });
  }

  filterAvailableSites(): void {
    const agencySiteIds = new Set(this.agencySites().map(s => s.id));
    const query = this.siteSearchQuery.toLowerCase();

    const available = this.allSites().filter(site => {
      if (agencySiteIds.has(site.id)) return false;

      if (query) {
        return (
          site.club_name?.toLowerCase().includes(query) ||
          site.site_name?.toLowerCase().includes(query)
        );
      }
      return true;
    });

    this.filteredAvailableSites.set(available);
  }

  toggleSiteSelection(siteId: string): void {
    const current = this.selectedSitesToAdd();
    const newSet = new Set(current);
    if (newSet.has(siteId)) {
      newSet.delete(siteId);
    } else {
      newSet.add(siteId);
    }
    this.selectedSitesToAdd.set(newSet);
  }

  addSelectedSites(): void {
    if (!this.managingSitesAgency || this.selectedSitesToAdd().size === 0) return;

    this.saving.set(true);
    const siteIds = Array.from(this.selectedSitesToAdd());

    this.dataService.addSitesToAgency(this.managingSitesAgency.id, siteIds).subscribe({
      next: (response) => {
        if (response.success) {
          this.refreshAgencySites();
          this.selectedSitesToAdd.set(new Set());
          this.loadAgencies();
        } else {
          this.error.set("Erreur lors de l'ajout des sites");
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || "Erreur lors de l'ajout des sites");
        this.saving.set(false);
      },
    });
  }

  removeSiteFromAgency(site: AgencySite): void {
    if (!this.managingSitesAgency) return;

    if (!confirm(`Retirer "${site.club_name}" de cette agence ?`)) return;

    this.saving.set(true);

    this.dataService.removeSiteFromAgency(this.managingSitesAgency.id, site.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.refreshAgencySites();
          this.loadAgencies();
        } else {
          this.error.set('Erreur lors du retrait du site');
        }
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Erreur lors du retrait du site');
        this.saving.set(false);
      },
    });
  }

  private refreshAgencySites(): void {
    if (!this.managingSitesAgency) return;

    this.dataService.getAgencySites(this.managingSitesAgency.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.agencySites.set(response.data.sites);
          this.filterAvailableSites();
        }
      },
    });
  }

  closeSitesModal(): void {
    this.managingSitesAgency = null;
    this.agencySites.set([]);
    this.allSites.set([]);
    this.filteredAvailableSites.set([]);
    this.selectedSitesToAdd.set(new Set());
    this.siteSearchQuery = '';
  }
}
