import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoUploadZoneComponent, UploadedVideo } from '../video-upload-zone/video-upload-zone.component';
import {
  WebContentCreateModalComponent,
  WebContentCreatedPayload,
  WebContentType,
} from '../web-content-create-modal/web-content-create-modal.component';

type AddContentTab = 'upload' | 'web_page' | 'livestream';

@Component({
  selector: 'app-add-content-modal',
  standalone: true,
  imports: [CommonModule, VideoUploadZoneComponent, WebContentCreateModalComponent],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Ajouter du contenu</h2>
          <button class="btn-close" (click)="close()" aria-label="Fermer">×</button>
        </div>

        <div class="tabs" role="tablist">
          <button
            type="button"
            class="tab"
            role="tab"
            [class.active]="activeTab === 'upload'"
            [attr.aria-selected]="activeTab === 'upload'"
            (click)="activeTab = 'upload'"
          >📁 Fichier</button>
          <button
            type="button"
            class="tab"
            role="tab"
            [class.active]="activeTab === 'web_page'"
            [attr.aria-selected]="activeTab === 'web_page'"
            (click)="activeTab = 'web_page'"
          >🌐 Page web</button>
          <button
            type="button"
            class="tab"
            role="tab"
            [class.active]="activeTab === 'livestream'"
            [attr.aria-selected]="activeTab === 'livestream'"
            (click)="activeTab = 'livestream'"
          >📡 Livestream</button>
        </div>

        <div class="tab-panel" *ngIf="activeTab === 'upload'">
          <p class="scope-hint" *ngIf="siteName">
            Ajouté à <strong>{{ siteName }}</strong>. Vidéo MP4/WebM · Image JPG/PNG.
          </p>
          <app-video-upload-zone
            [siteId]="siteId"
            [siteName]="siteName"
            [pendingFiles]="pendingFiles"
            (uploadComplete)="uploadComplete.emit($event)"
            (allUploadsComplete)="onAllUploadsComplete($event)"
          ></app-video-upload-zone>
        </div>

        <div class="tab-panel" *ngIf="activeTab === 'web_page' && siteId">
          <app-web-content-create-modal
            [embedded]="true"
            contentType="web_page"
            [lockedSiteId]="siteId"
            [lockedSiteName]="siteName"
            (created)="onWebContentCreated($event)"
          ></app-web-content-create-modal>
        </div>

        <div class="tab-panel" *ngIf="activeTab === 'livestream' && siteId">
          <app-web-content-create-modal
            [embedded]="true"
            contentType="livestream"
            [lockedSiteId]="siteId"
            [lockedSiteName]="siteName"
            (created)="onWebContentCreated($event)"
          ></app-web-content-create-modal>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 2rem;
    }
    .modal-content {
      background: white; border-radius: 12px; max-width: 640px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      display: flex; flex-direction: column;
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0;
    }
    .modal-header h2 { margin: 0; font-size: 1.15rem; }
    .btn-close {
      background: none; border: none; font-size: 1.75rem; line-height: 1;
      color: #94a3b8; cursor: pointer; padding: 0; width: 32px; height: 32px;
    }
    .btn-close:hover { color: #475569; }

    .tabs {
      display: flex; gap: 0; padding: 0 1rem; border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .tab {
      background: none; border: none; padding: 0.75rem 1rem;
      font-size: 0.875rem; font-weight: 500; color: #64748b; cursor: pointer;
      border-bottom: 2px solid transparent; transition: all 0.15s;
    }
    .tab:hover { color: #334155; }
    .tab.active { color: #2563eb; border-bottom-color: #2563eb; }

    .tab-panel { padding: 1.25rem 1.5rem; }
    .scope-hint {
      background: #f1f5f9; border-left: 3px solid #3b82f6;
      padding: 0.625rem 0.875rem; border-radius: 4px; margin: 0 0 1rem;
      font-size: 0.875rem; color: #475569;
    }

    @media (max-width: 640px) {
      .modal-backdrop { padding: 0.5rem; }
      .tabs { padding: 0 0.5rem; }
      .tab { padding: 0.625rem 0.625rem; font-size: 0.8125rem; }
      .tab-panel { padding: 1rem; }
    }
  `],
})
export class AddContentModalComponent {
  @Input() siteId: string | null = null;
  @Input() siteName = '';
  /** Files pre-injected when the modal is opened via a global drop. */
  @Input() pendingFiles: File[] | null = null;
  /** Initial tab to show (default: 'upload'). */
  @Input() set initialTab(tab: AddContentTab | null) {
    if (tab) this.activeTab = tab;
  }

  @Output() closed = new EventEmitter<void>();
  @Output() uploadComplete = new EventEmitter<UploadedVideo>();
  @Output() allUploadsComplete = new EventEmitter<UploadedVideo[]>();
  @Output() webContentCreated = new EventEmitter<WebContentCreatedPayload>();

  activeTab: AddContentTab = 'upload';

  onBackdropClick(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  onAllUploadsComplete(videos: UploadedVideo[]): void {
    this.allUploadsComplete.emit(videos);
    this.close();
  }

  onWebContentCreated(payload: WebContentCreatedPayload): void {
    this.webContentCreated.emit(payload);
    this.close();
  }
}
