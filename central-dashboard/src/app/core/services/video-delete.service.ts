import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Réponse de `GET /api/videos/:id/usage` — sites qui référencent une vidéo.
 */
export interface VideoUsage {
  videoId: string;
  totalSites: number;
  sites: Array<{ id: string; name: string; site_type: string }>;
}

/**
 * Payload du 409 `VIDEO_IN_USE` retourné par DELETE /api/videos/:id quand la
 * vidéo est référencée par ≥1 site sans `?cascade=true` (cf. content.controller.ts).
 */
interface VideoInUseError {
  status?: number;
  error?: {
    code?: string;
    usage?: { sites?: Array<{ id: string; name: string; site_type: string }>; totalSites?: number };
  };
}

/**
 * Centralise la logique de suppression d'une vidéo avec fallback cascade.
 *
 * Deux entrées :
 * - `deleteVideoWithCascade()` : pré-fetch usage + confirm + DELETE. Pour les
 *   boutons de suppression standalone (content-management, lottie-templates)
 *   où l'utilisateur n'a pas encore confirmé l'intention de supprimer.
 * - `deleteCloudWithCascadeFallback()` : DELETE direct, modal cascade émise
 *   uniquement si le backend retourne 409. Pour les flows qui ont déjà un
 *   modal de choix amont (video-manager : Pi / cloud / both / unlink) — évite
 *   le double-confirm.
 *
 * Garantit qu'aucun caller ne peut court-circuiter le guard PR#613 sans
 * confirmation utilisateur explicite (sinon : vidéo orpheline → TV figée).
 */
@Injectable({ providedIn: 'root' })
export class VideoDeleteService {
  private readonly api = inject(ApiService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  /**
   * Pré-fetch `/usage`, demande confirmation, puis DELETE. Si 409 sur le DELETE
   * (race condition pré-fetch ↔ delete), réutilise la modal cascade.
   *
   * @returns `true` si supprimée, `false` si l'utilisateur a annulé. Erreurs
   *          autres que 409 (réseau, 500…) sont propagées.
   */
  deleteVideoWithCascade(videoId: string, videoLabel: string): Observable<boolean> {
    return this.fetchUsageBestEffort(videoId).pipe(
      switchMap(usage => from(this.askConfirm(videoLabel, usage)).pipe(
        switchMap(ok => {
          if (!ok) return of(false);
          const cascade = (usage?.totalSites ?? 0) > 0;
          return this.deleteWithFallback(videoId, videoLabel, cascade);
        })
      ))
    );
  }

  /**
   * DELETE direct. Si le backend retourne 409 `VIDEO_IN_USE`, ouvre la modal
   * cascade avec le payload du 409 et retry avec `?cascade=true`. Pas de
   * pré-fetch — l'appelant a déjà confirmé l'intention.
   *
   * @returns void si supprimée. `error` propagé si l'utilisateur annule la
   *          modal cascade ou si le DELETE échoue pour une autre raison.
   */
  deleteCloudWithCascadeFallback(videoId: string, videoLabel: string): Observable<void> {
    return this.api.delete<void>(`/videos/${videoId}`).pipe(
      catchError((err: VideoInUseError) => this.handleInUseOrThrow(err, videoId, videoLabel))
    );
  }

  private fetchUsageBestEffort(videoId: string): Observable<VideoUsage | null> {
    return this.api.get<VideoUsage>(`/videos/${videoId}/usage`).pipe(
      catchError(() => of(null))
    );
  }

  private deleteWithFallback(videoId: string, label: string, cascade: boolean): Observable<boolean> {
    const qs = cascade ? '?cascade=true' : '';
    return this.api.delete<void>(`/videos/${videoId}${qs}`).pipe(
      switchMap(() => of(true)),
      catchError((err: VideoInUseError) => {
        if (cascade) return throwError(() => err);
        return this.handleInUseOrThrow(err, videoId, label).pipe(switchMap(() => of(true)));
      })
    );
  }

  private handleInUseOrThrow(
    err: VideoInUseError,
    videoId: string,
    label: string,
  ): Observable<void> {
    const isInUse = err?.status === 409 && err?.error?.code === 'VIDEO_IN_USE';
    if (!isInUse) return throwError(() => err);
    const fallbackUsage: VideoUsage = {
      videoId,
      totalSites: err.error?.usage?.totalSites ?? (err.error?.usage?.sites?.length ?? 0),
      sites: err.error?.usage?.sites ?? [],
    };
    return from(this.askConfirm(label, fallbackUsage)).pipe(
      switchMap(ok => {
        if (!ok) return throwError(() => err);
        return this.api.delete<void>(`/videos/${videoId}?cascade=true`);
      })
    );
  }

  private askConfirm(label: string, usage: VideoUsage | null): Promise<boolean> {
    const cascade = (usage?.totalSites ?? 0) > 0;
    const message = cascade && usage
      ? `Supprimer la vidéo "${label}" ?\n\nElle est utilisée par ${usage.totalSites} site(s) :\n${usage.sites.map(s => `• ${s.name} (${s.site_type})`).join('\n')}\n\nLes TVs concernées rechargeront leur configuration sans cette vidéo.`
      : `Supprimer la vidéo "${label}" ?`;
    return this.confirmDialog.confirm(message, {
      title: cascade ? 'Suppression cascade' : 'Suppression',
      confirmLabel: cascade ? 'Supprimer (cascade)' : 'Supprimer',
    });
  }
}
