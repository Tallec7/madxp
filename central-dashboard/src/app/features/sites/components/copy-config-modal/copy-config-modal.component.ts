import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Site } from '../../../../core/models';

@Component({
  selector: 'app-copy-config-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './copy-config-modal.component.html',
  styleUrls: ['./copy-config-modal.component.scss'],
})
export class CopyConfigModalComponent implements OnInit {
  @Input() sourceSite!: Site;
  @Output() closed = new EventEmitter<void>();
  @Output() copied = new EventEmitter<void>();

  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);

  sites: Site[] = [];
  filteredSites: Site[] = [];
  searchTerm = '';
  selectedTargetId: string | null = null;
  copying = false;

  ngOnInit(): void {
    this.sitesService.loadSites({ limit: 500 }).subscribe({
      next: (response) => {
        this.sites = response.sites.filter(s => s.id !== this.sourceSite.id);
        this.filteredSites = this.sites;
      },
    });
  }

  filterSites(): void {
    const term = this.searchTerm.toLowerCase();
    this.filteredSites = this.sites.filter(
      s =>
        s.site_name?.toLowerCase().includes(term) ||
        s.club_name?.toLowerCase().includes(term)
    );
  }

  selectTarget(siteId: string): void {
    this.selectedTargetId = this.selectedTargetId === siteId ? null : siteId;
  }

  getSiteTypeBadge(site: Site): string {
    switch (site.site_type) {
      case 'saas': return 'SaaS';
      case 'demo': return 'Demo';
      default: return 'Pi';
    }
  }

  confirmCopy(): void {
    if (!this.selectedTargetId || this.copying) return;

    this.copying = true;
    this.sitesService.copyConfig(this.sourceSite.id, this.selectedTargetId).subscribe({
      next: (result) => {
        this.notificationService.success(result.message);
        this.copying = false;
        this.copied.emit();
        this.closed.emit();
      },
      error: (err) => {
        const message = err?.error?.error || 'Erreur lors de la copie';
        this.notificationService.error(message);
        this.copying = false;
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
