import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AgencyPortalService, Agency } from '../../../core/services/agency-portal.service';
import { SitesService } from '../../../core/services/sites.service';
import { Site } from '../../../core/models';

export interface AgencyFormData {
  name: string;
  description?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface AgencySite {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AgenciesManagementDataService {
  private readonly agencyService = inject(AgencyPortalService);
  private readonly sitesService = inject(SitesService);

  listAgencies(): Observable<{ success: boolean; data: { agencies: Agency[] } }> {
    return this.agencyService.listAgencies();
  }

  createAgency(data: AgencyFormData): Observable<{ success: boolean }> {
    return this.agencyService.createAgency(data);
  }

  updateAgency(id: string, data: AgencyFormData): Observable<{ success: boolean }> {
    return this.agencyService.updateAgency(id, data);
  }

  deleteAgency(id: string): Observable<{ success: boolean }> {
    return this.agencyService.deleteAgency(id);
  }

  getAgencySites(agencyId: string): Observable<{ success: boolean; data: { sites: AgencySite[] } }> {
    return this.agencyService.getAgencySites(agencyId) as Observable<{ success: boolean; data: { sites: AgencySite[] } }>;
  }

  addSitesToAgency(agencyId: string, siteIds: string[]): Observable<{ success: boolean }> {
    return this.agencyService.addSitesToAgency(agencyId, siteIds);
  }

  removeSiteFromAgency(agencyId: string, siteId: string): Observable<{ success: boolean }> {
    return this.agencyService.removeSiteFromAgency(agencyId, siteId);
  }

  loadAllSites(): Observable<{ sites: Site[] }> {
    return this.sitesService.loadSites();
  }
}
