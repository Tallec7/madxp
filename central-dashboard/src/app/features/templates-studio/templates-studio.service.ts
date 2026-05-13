import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import type {
  BrandKit,
  BrandKitUpsertInput,
  TemplateSummary,
} from './templates-studio.types';

interface BrandKitResponse {
  success: boolean;
  data: BrandKit;
}

interface TemplatesListResponse {
  success: boolean;
  data: {
    templates: TemplateSummary[];
    total: number;
  };
}

/**
 * Data service du Templates Studio V1 côté dashboard.
 *
 * Toutes les requêtes passent par `ApiService` (cookies HttpOnly + intercepteur
 * d'erreurs). Jamais de `fetch()` direct — invariant dashboard rule.
 */
@Injectable({ providedIn: 'root' })
export class TemplatesStudioService {
  private api = inject(ApiService);

  getBrandKit(siteId: string): Observable<BrandKit> {
    return this.api
      .get<BrandKitResponse>(`/templates-studio/sites/${siteId}/brand-kit`)
      .pipe(map((res) => res.data));
  }

  upsertBrandKit(siteId: string, input: BrandKitUpsertInput): Observable<BrandKit> {
    return this.api
      .put<BrandKitResponse>(`/templates-studio/sites/${siteId}/brand-kit`, input)
      .pipe(map((res) => res.data));
  }

  listTemplates(): Observable<TemplateSummary[]> {
    return this.api
      .get<TemplatesListResponse>('/templates-studio/templates')
      .pipe(map((res) => res.data.templates));
  }
}
