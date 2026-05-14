import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import type {
  BrandKit,
  BrandKitUpsertInput,
  CreatePlayerInput,
  Player,
  PlayerGrant,
  RenderDistributionInput,
  RenderDistributionResult,
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

interface RenderDistributionResponse {
  success: boolean;
  data: RenderDistributionResult;
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

  /**
   * Upload multipart d'un logo (S3.1). Le serveur stocke sur FTP Hostinger
   * puis met à jour `logos_json.<slot>` via merge JSONB (préserve les autres
   * slots). `slot` accepte 'primary' | 'secondary' | 'monochrome' (défaut 'primary').
   */
  uploadBrandKitLogo(
    siteId: string,
    file: File,
    slot: 'primary' | 'secondary' | 'monochrome' = 'primary',
  ): Observable<BrandKit> {
    const form = new FormData();
    form.append('logo', file);
    form.append('slot', slot);
    return this.api
      .upload<BrandKitResponse>(
        `/templates-studio/sites/${siteId}/brand-kit/logo`,
        form,
      )
      .pipe(map((res) => res.data));
  }

  listTemplates(): Observable<TemplateSummary[]> {
    return this.api
      .get<TemplatesListResponse>('/templates-studio/templates')
      .pipe(map((res) => res.data.templates));
  }

  /**
   * Crée une demande de rendu.
   *
   * - Si `siteId` est fourni → POST /sites/:siteId/render-requests (route internal
   *   role : super_admin/admin/operator peut cibler n'importe quel site)
   * - Sinon → POST /render-requests (route club user, site_id pris du JWT serveur)
   */
  createRenderRequest(
    templateId: string,
    props: Record<string, unknown>,
    siteId: string | null = null,
  ): Observable<RenderRequestCreated> {
    const url = siteId
      ? `/templates-studio/sites/${siteId}/render-requests`
      : '/templates-studio/render-requests';
    return this.api
      .post<RenderRequestCreatedResponse>(url, {
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

  /**
   * Distribue un render `ready` vers la bibliothèque vidéo de N sites.
   *
   * Deux modes :
   *  - `'push'`  : crée 1 row `videos` par site cible (`uploaded_for_site_id = site_id`).
   *  - `'grant'` : crée 1 row globale + N grants ADR-082 (asset partagé sans dup).
   *
   * Idempotent côté backend : re-cliquer "Distribuer" avec les mêmes site_ids
   * ne crée pas de doublons.
   */
  distributeRender(
    renderId: string,
    payload: RenderDistributionInput,
  ): Observable<RenderDistributionResult> {
    return this.api
      .post<RenderDistributionResponse>(
        `/templates-studio/render-requests/${renderId}/distribute`,
        payload,
      )
      .pipe(map((res) => res.data));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Joueurs globaux + grants multi-sites (ADR-082 pattern, super_admin/operator)
  // ──────────────────────────────────────────────────────────────────────────

  listGlobalPlayers(): Observable<Player[]> {
    return this.api
      .get<PlayersListResponse>('/templates-studio/players/global')
      .pipe(map((res) => res.data.players));
  }

  createGlobalPlayer(input: CreatePlayerInput): Observable<Player> {
    return this.api
      .post<PlayerResponse>('/templates-studio/players/global', input)
      .pipe(map((res) => res.data));
  }

  listPlayerGrants(playerId: string): Observable<PlayerGrant[]> {
    interface GrantsResponse {
      success: boolean;
      data: { player_id: string; grants: PlayerGrant[]; total: number };
    }
    return this.api
      .get<GrantsResponse>(`/templates-studio/players/${playerId}/grants`)
      .pipe(map((res) => res.data.grants));
  }

  addPlayerGrant(playerId: string, siteId: string): Observable<void> {
    return this.api
      .post<{ success: boolean }>(`/templates-studio/players/${playerId}/grants`, {
        site_id: siteId,
      })
      .pipe(map(() => undefined));
  }

  removePlayerGrant(playerId: string, siteId: string): Observable<void> {
    return this.api
      .delete<void>(`/templates-studio/players/${playerId}/grants/${siteId}`)
      .pipe(map(() => undefined));
  }
}
