/**
 * Reports Service
 *
 * Gère les rapports PDF générés automatiquement
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface GeneratedReport {
  id: string;
  report_type: 'club' | 'advertiser' | 'fleet';
  site_id: string | null;
  advertiser_id: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
  storage_path: string;
  storage_url: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  summary_data: Record<string, unknown>;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  entity_name?: string; // From join with sites/advertisers
}

export interface ReportGenerationRequest {
  type: 'club' | 'advertiser';
  entityId: string;
  periodStart: string;
  periodEnd: string;
}

interface ReportsListResponse {
  success: boolean;
  data: GeneratedReport[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}

interface ReportResponse {
  success: boolean;
  data: GeneratedReport;
}

interface GenerateResponse {
  success: boolean;
  data: {
    reportId: string;
    url: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private readonly apiUrl = `${environment.apiUrl}/reports`;

  constructor(private http: HttpClient) {}

  /**
   * Liste les rapports d'un club
   */
  getClubReports(siteId: string, limit = 12): Observable<GeneratedReport[]> {
    return this.http.get<ReportsListResponse>(`${this.apiUrl}/clubs/${siteId}?limit=${limit}`)
      .pipe(map(response => response.data));
  }

  /**
   * Liste les rapports d'un annonceur
   */
  getAdvertiserReports(advertiserId: string, limit = 12): Observable<GeneratedReport[]> {
    return this.http.get<ReportsListResponse>(`${this.apiUrl}/advertisers/${advertiserId}?limit=${limit}`)
      .pipe(map(response => response.data));
  }

  /**
   * Récupère un rapport par son ID
   */
  getReport(reportId: string): Observable<GeneratedReport> {
    return this.http.get<ReportResponse>(`${this.apiUrl}/${reportId}`)
      .pipe(map(response => response.data));
  }

  /**
   * Génère un rapport à la demande
   */
  generateReport(request: ReportGenerationRequest): Observable<{ reportId: string; url: string }> {
    return this.http.post<GenerateResponse>(`${this.apiUrl}/generate`, request)
      .pipe(map(response => response.data));
  }

  /**
   * Liste tous les rapports (admin)
   */
  getAllReports(limit = 50, offset = 0, type?: 'club' | 'advertiser'): Observable<{
    data: GeneratedReport[];
    pagination: { total: number; limit: number; offset: number };
  }> {
    let url = `${this.apiUrl}?limit=${limit}&offset=${offset}`;
    if (type) {
      url += `&type=${type}`;
    }
    return this.http.get<ReportsListResponse>(url)
      .pipe(map(response => ({
        data: response.data,
        pagination: response.pagination!
      })));
  }

  /**
   * Statistiques des rapports (admin)
   */
  getReportStats(): Observable<{
    byTypeAndStatus: Array<{ report_type: string; status: string; count: number; total_size: number }>;
    monthly: Array<{ month: string; count: number; completed: number; failed: number }>;
  }> {
    return this.http.get<{ success: boolean; data: any }>(`${this.apiUrl}/stats`)
      .pipe(map(response => response.data));
  }

  /**
   * Formate la taille du fichier
   */
  formatFileSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Formate la période
   */
  formatPeriod(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);

    // Si même mois
    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
      return startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }

    // Sinon plage
    return `${startDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
  }
}
