import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

type TabId = 'respcom' | 'operator';

interface ChecklistGroup {
  label: string;
  icon: string;
  keys: string[];
}

@Component({
  selector: 'app-club-guide',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './club-guide.component.html',
  styleUrl: './club-guide.component.scss'
})
export class ClubGuideComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  siteId = '';
  siteName = '';
  loading = true;

  activeTab: TabId = 'respcom';
  readonly openSections = new Set<string>(['saas', 'access', 'tv', 'op-remote', 'checklist']);
  copiedKey: string | null = null;

  readonly checklist: Record<string, boolean> = {
    loop_ok: false,
    categories_match: false,
    categories_action: false,
    screen_on: false,
    tv_open: false,
    connected: false,
    remote_shortcut: false,
    pin_known: false,
  };

  readonly checklistLabels: Record<string, string> = {
    loop_ok: 'Boucle à jour (sponsors actifs, vidéos activées)',
    categories_match: 'Catégories "Phase de match" configurées (mi-temps, après-match…)',
    categories_action: 'Catégories "Action" prêtes (but, temps fort…)',
    screen_on: 'PC / tablette du gymnase allumé et connecté à internet',
    tv_open: 'Page TV ouverte en plein écran (F11)',
    connected: '"Clients connectés" = 1+ affiché dans "Mon club"',
    remote_shortcut: 'Raccourci télécommande sur l\'écran d\'accueil smartphone',
    pin_known: 'PIN connu de l\'opérateur (ou partagé par QR code)',
  };

  readonly checklistGroups: ChecklistGroup[] = [
    { label: 'Contenu', icon: '🎬', keys: ['loop_ok', 'categories_match', 'categories_action'] },
    { label: 'Écran TV', icon: '📺', keys: ['screen_on', 'tv_open', 'connected'] },
    { label: 'Opérateur', icon: '📱', keys: ['remote_shortcut', 'pin_known'] },
  ];

  get tvUrl(): string {
    return this.siteId
      ? `${environment.saasBaseUrl}/tv?site=${encodeURIComponent(this.siteId)}`
      : '';
  }

  get remoteUrl(): string {
    return this.siteId
      ? `${environment.saasBaseUrl}/remote?site=${encodeURIComponent(this.siteId)}`
      : '';
  }

  get checklistKeys(): string[] {
    return Object.keys(this.checklist);
  }

  get checklistDoneCount(): number {
    return Object.values(this.checklist).filter(Boolean).length;
  }

  get checklistProgress(): number {
    const total = this.checklistKeys.length;
    return total > 0 ? Math.round((this.checklistDoneCount / total) * 100) : 0;
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.site_id) {
      this.siteId = user.site_id;
      this.loadSiteInfo();
    } else {
      this.loading = false;
    }
  }

  private loadSiteInfo(): void {
    this.api.get<{ site_name: string; club_name: string; site_type: string }>(
      `/sites/${this.siteId}`
    ).subscribe({
      next: (site) => {
        this.siteName = site.site_name || site.club_name;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  setTab(tab: TabId): void {
    this.activeTab = tab;
  }

  toggleSection(id: string): void {
    if (this.openSections.has(id)) {
      this.openSections.delete(id);
    } else {
      this.openSections.add(id);
    }
  }

  isOpen(id: string): boolean {
    return this.openSections.has(id);
  }

  async copyToClipboard(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedKey = key;
      setTimeout(() => {
        if (this.copiedKey === key) this.copiedKey = null;
      }, 2000);
    } catch {
      // Clipboard API indisponible
    }
  }

  toggleCheck(key: string): void {
    this.checklist[key] = !this.checklist[key];
  }

  groupDoneCount(group: ChecklistGroup): number {
    return group.keys.filter(k => this.checklist[k]).length;
  }
}
