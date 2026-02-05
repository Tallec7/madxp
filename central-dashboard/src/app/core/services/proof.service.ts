import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ProofOfBroadcast {
  id: string;
  site_id: string;
  screenshot_url: string;
  storage_path: string;
  checksum: string;
  timestamp_captured: Date;
  triggered_by: 'manual' | 'scheduled' | 'command';
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ProofsResponse {
  success: boolean;
  proofs: ProofOfBroadcast[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface CaptureResponse {
  success: boolean;
  message: string;
  commandId: string;
}

export interface ProofStats {
  site_id: string;
  site_name: string;
  club_name: string;
  total_proofs: number;
  last_proof_at: Date | null;
  proofs_last_7_days: number;
  proofs_last_30_days: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProofService {
  private readonly api = inject(ApiService);

  /**
   * Récupère les preuves pour un site
   */
  getProofsForSite(siteId: string, limit = 20, offset = 0): Observable<ProofsResponse> {
    return this.api.get<ProofsResponse>(`/proofs/${siteId}`, { limit, offset });
  }

  /**
   * Déclenche une capture d'écran sur un site
   */
  triggerCapture(siteId: string, options?: { format?: string; quality?: number }): Observable<CaptureResponse> {
    return this.api.post<CaptureResponse>(`/proofs/${siteId}/capture`, options || {});
  }

  /**
   * Récupère les stats de preuves globales
   */
  getProofStats(): Observable<{ success: boolean; stats: ProofStats[] }> {
    return this.api.get<{ success: boolean; stats: ProofStats[] }>('/proofs/stats');
  }
}
