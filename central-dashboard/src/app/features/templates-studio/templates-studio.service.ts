import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import type {
  BrandKit,
  BrandKitUpsertInput,
  CreatePlayerInput,
  Player,
  RenderRequestCreated,
  RenderRequestSnapshot,
  TemplateSummary,
  UpdatePlayerInput,
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

interface RenderRequestCreatedResponse {
  success: boolean;
  data: RenderRequestCreated;
}

interface RenderRequestSnapshotResponse {
  success: boolean;
  data: RenderRequestSnapshot;
}

interface PlayersListResponse {
  success: boolean;
  data: { players: Player[]; total: number };
}

interface PlayerResponse {
  success: boolean;
  data: Player;
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

  createRenderRequest(
    templateId: string,
    props: Record<string, unknown>,
  ): Observable<RenderRequestCreated> {
    return this.api
      .post<RenderRequestCreatedResponse>('/templates-studio/render-requests', {
        template_id: templateId,
        props,
      })
      .pipe(map((res) => res.data));
  }

  getRenderRequest(id: string): Observable<RenderRequestSnapshot> {
    return this.api
      .get<RenderRequestSnapshotResponse>(`/templates-studio/render-requests/${id}`)
      .pipe(map((res) => res.data));
  }

  // Roster joueurs (S4-A backend, S4-D UI).
  listPlayers(siteId: string): Observable<Player[]> {
    return this.api
      .get<PlayersListResponse>(`/templates-studio/sites/${siteId}/players`)
      .pipe(map((res) => res.data.players));
  }

  createPlayer(siteId: string, input: CreatePlayerInput): Observable<Player> {
    return this.api
      .post<PlayerResponse>(`/templates-studio/sites/${siteId}/players`, input)
      .pipe(map((res) => res.data));
  }

  updatePlayer(
    siteId: string,
    playerId: string,
    input: UpdatePlayerInput,
  ): Observable<Player> {
    return this.api
      .put<PlayerResponse>(
        `/templates-studio/sites/${siteId}/players/${playerId}`,
        input,
      )
      .pipe(map((res) => res.data));
  }

  deletePlayer(siteId: string, playerId: string): Observable<void> {
    return this.api
      .delete<void>(`/templates-studio/sites/${siteId}/players/${playerId}`)
      .pipe(map(() => undefined));
  }

  /**
   * Upload multipart photo brute (S4-B). Met à jour `photo_raw_url` côté DB +
   * bump `cutout_status='pending'` (réveille worker rembg S4-C).
   * Le format multipart est porté par `FormData` côté client.
   */
  uploadPlayerPhoto(siteId: string, playerId: string, file: File): Observable<Player> {
    const form = new FormData();
    form.append('photo', file);
    return this.api
      .upload<PlayerResponse>(
        `/templates-studio/sites/${siteId}/players/${playerId}/photo`,
        form,
      )
      .pipe(map((res) => res.data));
  }
}
