import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { SitesService } from '../../../../../core/services/sites.service';
import { SiteCommandService } from '../../../../../core/services/site-command.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { ErrorExtractor } from '../../../../../core/utils/error-extractor';
import { LocalVideo, CloudVideo, LocalStorage, SiteSponsor, DisplayConfig } from '../../../../../core/models';
import { VideoLibraryComponent, VideoItem, VideoDeployState, AddToTarget } from '../../video-library/video-library.component';
import { VideoUploadZoneComponent, UploadedVideo } from '../../../../../shared/components/video-upload-zone/video-upload-zone.component';
import { VideoVariantPanelComponent } from '../../../../content/video-variant-panel.component';

@Component({
  selector: 'app-video-manager',
  standalone: true,
  imports: [CommonModule, VideoLibraryComponent, VideoUploadZoneComponent, VideoVariantPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Upload Zone -->
    <div class="section">
      <app-video-upload-zone
        [siteId]="siteId"
        [siteName]="siteName"
        (uploadComplete)="onVideoUploaded($event)"
        (allUploadsComplete)="onAllVideosUploaded($event)"
      ></app-video-upload-zone>
    </div>

    <!-- Video Library -->
    <div class="section" id="section-library">
      <app-video-library
        [videos]="localVideos"
        [cloudVideos]="cloudVideos"
        [storage]="localStorage"
        [selectedPath]="selectedVideoPath"
        [deployStates]="videoDeployStates"
        [siteId]="siteId"
        [siteType]="siteType"
        [configVideoRoles]="configVideoRoles"
        [configVideoLabels]="configVideoLabels"
        [pendingDeploymentVideoIds]="pendingDeploymentVideoIds"
        [secondaryVariantVideoIds]="secondaryVariantVideoIds"
        [subscriptionPlan]="subscriptionPlan"
        [featureOverrides]="featureOverrides"
        [siteSponsors]="siteSponsors"
        [configTargets]="configTargets"
        (videoSelect)="onVideoSelect($event)"
        (videoPreview)="onVideoPreview($event)"
        (videoDeploy)="videoDeploy.emit($event)"
        (videoDelete)="onVideoDelete($event)"
        (videoVariant)="onVideoVariant($event)"
        (addToTarget)="addToTarget.emit($event)"
      ></app-video-library>
    </div>

    <!-- Multi-display Variant Modal (Premium only) -->
    <div class="modal" *ngIf="variantTarget" (click)="closeVariantModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Variantes multi-ecran</h2>
          <button class="modal-close" (click)="closeVariantModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="delete-filename">"{{ variantTarget.displayName || variantTarget.filename }}"</p>
          <app-video-variant-panel
            [videoId]="variantTarget.id!"
            [siteDisplays]="siteDisplays"
            [availableVideos]="cloudVideos"
            [autoOpen]="true"
            (variantChanged)="onVariantChanged($event)"
          ></app-video-variant-panel>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="closeVariantModal()">Fermer</button>
        </div>
      </div>
    </div>

    <!-- Delete Video Modal -->
    <div class="modal" *ngIf="showDeleteModal" (click)="showDeleteModal = false">
      <div class="modal-content modal-delete" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Supprimer une vidéo</h2>
          <button class="modal-close" (click)="showDeleteModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="delete-filename">"{{ deleteTarget?.displayName || deleteTarget?.filename }}"</p>
          <div *ngIf="siteType === 'saas' && deleteCanCloud && !isSuperAdmin">
            <p class="delete-description">Cette vidéo sera supprimée du <strong>site</strong> et du <strong>cloud</strong>.</p>
          </div>
          <div *ngIf="siteType === 'saas' && deleteCanCloud && isSuperAdmin">
            <p class="delete-description">Que souhaitez-vous faire avec cette vidéo ?</p>
          </div>
          <div *ngIf="siteType !== 'saas' && deleteCanPi && !deleteCanCloud">
            <p class="delete-description">Cette vidéo est uniquement sur le <strong>Pi</strong>.</p>
          </div>
          <div *ngIf="siteType !== 'saas' && !deleteCanPi && deleteCanCloud">
            <p class="delete-description">Cette vidéo est uniquement dans le <strong>cloud</strong>.</p>
          </div>
          <div *ngIf="siteType !== 'saas' && deleteCanPi && deleteCanCloud" class="delete-choices">
            <p class="delete-description">Cette vidéo est sur le <strong>Pi</strong> et dans le <strong>cloud</strong>. Que souhaitez-vous supprimer ?</p>
          </div>
        </div>
        <div class="modal-footer delete-actions">
          <button class="btn btn-secondary" (click)="showDeleteModal = false">Annuler</button>
          <button *ngIf="siteType === 'saas' && deleteCanCloud && isSuperAdmin" class="btn btn-delete-pi" (click)="executeDelete('unlink')">
            Retirer du site
          </button>
          <button *ngIf="siteType === 'saas' && deleteCanCloud && isSuperAdmin" class="btn btn-delete-cloud" (click)="executeDelete('cloud')">
            Supprimer du cloud
          </button>
          <button *ngIf="siteType === 'saas' && deleteCanCloud && !isSuperAdmin" class="btn btn-delete-both" (click)="executeDelete('cloud')">
            Supprimer
          </button>
          <button *ngIf="siteType !== 'saas' && deleteCanPi" class="btn btn-delete-pi" (click)="executeDelete('pi')">
            Supprimer du Pi
          </button>
          <button *ngIf="siteType !== 'saas' && deleteCanCloud" class="btn btn-delete-cloud" (click)="executeDelete('cloud')">
            Supprimer du cloud
          </button>
          <button *ngIf="siteType !== 'saas' && deleteCanPi && deleteCanCloud" class="btn btn-delete-both" (click)="executeDelete('both')">
            Supprimer des deux
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .section { margin-bottom: 0; }

    .modal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); display: flex; align-items: center;
      justify-content: center; z-index: 1000; padding: 2rem;
    }

    .modal-content {
      background: white; border-radius: 12px; max-width: 600px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }

    .modal-delete { max-width: 480px; }

    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.5rem; border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 { margin: 0; font-size: 1.25rem; }

    .modal-close {
      background: none; border: none; font-size: 2rem; color: #94a3b8;
      cursor: pointer; padding: 0; width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center; border-radius: 4px;
    }

    .modal-close:hover { background: #f1f5f9; color: #64748b; }

    .modal-body { padding: 1.5rem; }

    .modal-footer {
      display: flex; justify-content: flex-end; gap: 1rem;
      padding: 1.5rem; border-top: 1px solid #e2e8f0;
    }

    .delete-filename {
      font-weight: 600; font-size: 1.05rem; color: #1e293b;
      margin: 0 0 0.75rem; word-break: break-all;
    }

    .delete-description { color: #64748b; margin: 0; line-height: 1.5; }
    .delete-actions { flex-wrap: wrap; gap: 0.5rem; }

    .btn {
      padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem;
      font-weight: 500; cursor: pointer; transition: all 0.15s;
    }

    .btn-secondary { background: white; color: #475569; border: 1px solid #e2e8f0; }
    .btn-secondary:hover { background: #f8fafc; }

    .btn-delete-pi {
      background: #f59e0b; color: white; border: none;
      padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500;
    }
    .btn-delete-pi:hover { background: #d97706; }

    .btn-delete-cloud {
      background: #3b82f6; color: white; border: none;
      padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500;
    }
    .btn-delete-cloud:hover { background: #2563eb; }

    .btn-delete-both {
      background: #ef4444; color: white; border: none;
      padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500;
    }
    .btn-delete-both:hover { background: #dc2626; }
  `]
})
export class VideoManagerComponent {
  @Input() siteId!: string;
  @Input() siteName = '';
  @Input() siteType: string = '';
  @Input() localVideos: LocalVideo[] = [];
  @Input() cloudVideos: CloudVideo[] = [];
  @Input() localStorage: LocalStorage | null = null;
  @Input() videoDeployStates: Map<string, VideoDeployState> = new Map();
  @Input() configVideoRoles: Map<string, Set<string>> = new Map();
  @Input() configVideoLabels: Map<string, string[]> = new Map();
  @Input() pendingDeploymentVideoIds: Set<string> = new Set();
  @Input() secondaryVariantVideoIds: Set<string> = new Set();
  @Input() videoVariantInfo: Map<string, { count: number; types: string[] }> = new Map();
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;
  @Input() siteSponsors: SiteSponsor[] = []; // ADR-050
  @Input() configTargets: AddToTarget[] = []; // ADR-050 Phase 2: available config targets
  @Input() siteDisplays: DisplayConfig[] = [];
  @Input() isSuperAdmin = false;

  @Output() videoUploaded = new EventEmitter<UploadedVideo>();
  @Output() allVideosUploaded = new EventEmitter<UploadedVideo[]>();
  @Output() videoDeploy = new EventEmitter<VideoItem>();
  @Output() videoDeleted = new EventEmitter<void>();
  @Output() secondaryVariantChanged = new EventEmitter<void>();
  @Output() variantChanged = new EventEmitter<{ videoId: string; count: number; types: string[] }>();
  @Output() addToTarget = new EventEmitter<{ video: VideoItem; target: AddToTarget }>(); // ADR-050 Phase 2

  selectedVideoPath = '';
  showDeleteModal = false;
  deleteTarget: VideoItem | null = null;
  deleteCanPi = false;
  deleteCanCloud = false;
  variantTarget: VideoItem | null = null;

  onVideoVariant(video: VideoItem): void {
    if (!video.id) return;
    this.variantTarget = video;
  }

  closeVariantModal(): void {
    this.variantTarget = null;
    this.secondaryVariantChanged.emit();
  }

  onVariantChanged(event: { videoId: string; count: number; types: string[] }): void {
    this.variantChanged.emit(event);
  }

  constructor(
    private sitesService: SitesService,
    private commandService: SiteCommandService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {}

  onVideoUploaded(video: UploadedVideo): void {
    this.videoUploaded.emit(video);
  }

  onAllVideosUploaded(videos: UploadedVideo[]): void {
    this.allVideosUploaded.emit(videos);
  }

  onVideoSelect(video: VideoItem): void {
    this.selectedVideoPath = video.path;
  }

  onVideoPreview(_video: VideoItem): void {
    // Preview handled by video-library inline popup
  }

  onVideoDelete(video: VideoItem): void {
    this.deleteTarget = video;
    this.deleteCanPi = video.isOnPi;
    this.deleteCanCloud = !!video.id;
    this.showDeleteModal = true;
  }

  executeDelete(choice: 'pi' | 'cloud' | 'both' | 'unlink'): void {
    const video = this.deleteTarget;
    if (!video) return;
    this.showDeleteModal = false;

    const piCat = video.piCategory ?? video.category;
    const piSubcat = video.piSubcategory ?? video.subcategory;
    const deletePi$ = this.commandService.sendCommand(this.siteId, 'delete_video', {
      filename: video.filename,
      category: piCat || undefined,
      subcategory: piSubcat || undefined
    });
    const deleteCloud$ = this.sitesService.deleteCloudVideo(video.id!);
    const unlink$ = this.sitesService.unlinkVideoFromSite(video.id!, this.siteId);

    const onSuccess = (msg: string) => {
      this.notificationService.success(msg);
      this.videoDeleted.emit();
    };
    const onError = (error: unknown) => {
      const message = ErrorExtractor.getMessage(error);
      this.notificationService.error(`Erreur: ${message}`);
    };

    if (choice === 'unlink') {
      unlink$.subscribe({
        next: () => onSuccess(`"${video.filename}" retiré du site`),
        error: onError
      });
    } else if (choice === 'both') {
      forkJoin([deletePi$, deleteCloud$]).subscribe({
        next: () => onSuccess(`"${video.filename}" supprimé du Pi et du cloud`),
        error: onError
      });
    } else if (choice === 'pi') {
      deletePi$.subscribe({
        next: () => onSuccess(`"${video.filename}" supprimé du Pi`),
        error: onError
      });
    } else {
      deleteCloud$.subscribe({
        next: () => onSuccess(`"${video.filename}" supprimé du cloud`),
        error: onError
      });
    }
  }
}
