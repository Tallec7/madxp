/**
 * SAFe Product Overview — Features & Roadmap
 *
 * Page vitrine des fonctionnalités et de la roadmap produit,
 * accessible depuis l'onglet "Produit" du pilotage SAFe.
 * Données statiques (pas d'API) — contenu marketing/site web.
 */

import {
  Component,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

interface ProductFeature {
  icon: string;
  title: string;
  description: string;
}

interface FeatureSection {
  id: string;
  audience: string;
  color: string;
  features: ProductFeature[];
}

interface RoadmapPhase {
  id: string;
  label: string;
  period: string;
  status: 'done' | 'in-progress' | 'planned';
  items: string[];
}

interface Milestone {
  date: string;
  label: string;
  target: string;
}

@Component({
  selector: 'app-safe-product',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="safe-product">

      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1>Produit Neopro</h1>
          <span class="subtitle">Fonctionnalités & Roadmap</span>
        </div>
        <div class="header-actions">
          <a routerLink="/safe" class="btn btn-secondary">Portfolio SAFe</a>
          <a routerLink="/safe/sprints" class="btn btn-secondary">Sprints</a>
        </div>
      </div>

      <!-- Navigation rapide -->
      <div class="nav-pills">
        <button
          *ngFor="let section of sections; trackBy: trackBySectionId"
          class="pill"
          [class.active]="activeSection === section.id"
          [style.--pill-color]="section.color"
          (click)="activeSection = section.id"
        >
          {{ section.audience }}
        </button>
        <button
          class="pill"
          [class.active]="activeSection === 'roadmap'"
          style="--pill-color: #6366f1"
          (click)="activeSection = 'roadmap'"
        >
          Roadmap 2026
        </button>
      </div>

      <!-- Feature Sections -->
      <ng-container *ngFor="let section of sections; trackBy: trackBySectionId">
        <div class="section-card feature-section" *ngIf="activeSection === 'all' || activeSection === section.id">
          <h2 [style.border-left-color]="section.color">{{ section.audience }}</h2>
          <div class="features-grid">
            <div class="feature-card" *ngFor="let f of section.features; trackBy: trackByTitle">
              <div class="feature-icon">{{ f.icon }}</div>
              <div class="feature-content">
                <h3>{{ f.title }}</h3>
                <p>{{ f.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- Roadmap -->
      <div class="section-card" *ngIf="activeSection === 'all' || activeSection === 'roadmap'">
        <h2 style="border-left-color: #6366f1">Roadmap 2026</h2>

        <div class="roadmap-timeline">
          <div
            class="roadmap-phase"
            *ngFor="let phase of roadmap; trackBy: trackByPhaseId"
            [class]="'phase-' + phase.status"
          >
            <div class="phase-header">
              <div class="phase-status-dot"></div>
              <div class="phase-info">
                <span class="phase-label">{{ phase.label }}</span>
                <span class="phase-period">{{ phase.period }}</span>
              </div>
              <span class="phase-badge" [class]="phase.status">
                {{ 'safe.product.phase.' + phase.status | translate }}
              </span>
            </div>
            <div class="phase-items">
              <div class="phase-item" *ngFor="let item of phase.items">{{ item }}</div>
            </div>
          </div>
        </div>

        <!-- Milestones -->
        <div class="milestones-section">
          <h3>Jalons business</h3>
          <div class="milestones-track">
            <div class="milestone" *ngFor="let m of milestones; trackBy: trackByMilestoneDate">
              <div class="milestone-dot"></div>
              <div class="milestone-date">{{ m.date }}</div>
              <div class="milestone-label">{{ m.label }}</div>
              <div class="milestone-target">{{ m.target }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }

    .safe-product {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .header-left h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
    }

    .subtitle {
      font-size: 0.85rem;
      color: #64748b;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
      border: none;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    /* Navigation pills */
    .nav-pills {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .pill {
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      border: 1px solid #e2e8f0;
      background: #fff;
      color: #475569;
      cursor: pointer;
      transition: all 0.2s;
    }

    .pill:hover {
      border-color: var(--pill-color, #6366f1);
      color: var(--pill-color, #6366f1);
    }

    .pill.active {
      background: var(--pill-color, #6366f1);
      color: #fff;
      border-color: var(--pill-color, #6366f1);
    }

    /* Section cards */
    .section-card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .section-card h2 {
      margin: 0 0 20px;
      font-size: 1.15rem;
      font-weight: 600;
      padding-left: 12px;
      border-left: 3px solid #6366f1;
    }

    /* Features grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .feature-card {
      display: flex;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      transition: box-shadow 0.2s;
    }

    .feature-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .feature-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .feature-content h3 {
      margin: 0 0 4px;
      font-size: 0.9rem;
      font-weight: 600;
      color: #1e293b;
    }

    .feature-content p {
      margin: 0;
      font-size: 0.82rem;
      color: #64748b;
      line-height: 1.4;
    }

    /* Roadmap timeline */
    .roadmap-timeline {
      position: relative;
      padding-left: 24px;
    }

    .roadmap-timeline::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #e2e8f0;
    }

    .roadmap-phase {
      position: relative;
      margin-bottom: 24px;
    }

    .phase-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .phase-status-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      position: absolute;
      left: -24px;
      top: 4px;
      border: 2px solid #fff;
      box-shadow: 0 0 0 2px #e2e8f0;
    }

    .phase-done .phase-status-dot {
      background: #22c55e;
      box-shadow: 0 0 0 2px #22c55e;
    }

    .phase-in-progress .phase-status-dot {
      background: #f59e0b;
      box-shadow: 0 0 0 2px #f59e0b;
      animation: pulse 2s infinite;
    }

    .phase-planned .phase-status-dot {
      background: #94a3b8;
      box-shadow: 0 0 0 2px #94a3b8;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .phase-info {
      display: flex;
      flex-direction: column;
    }

    .phase-label {
      font-weight: 600;
      font-size: 0.95rem;
      color: #1e293b;
    }

    .phase-period {
      font-size: 0.8rem;
      color: #64748b;
    }

    .phase-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .phase-badge.done {
      background: #dcfce7;
      color: #166534;
    }

    .phase-badge.in-progress {
      background: #fef3c7;
      color: #92400e;
    }

    .phase-badge.planned {
      background: #f1f5f9;
      color: #475569;
    }

    .phase-items {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-left: 4px;
    }

    .phase-item {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.82rem;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #e2e8f0;
    }

    .phase-done .phase-item {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #166534;
    }

    .phase-in-progress .phase-item {
      background: #fffbeb;
      border-color: #fde68a;
      color: #92400e;
    }

    /* Milestones */
    .milestones-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .milestones-section h3 {
      margin: 0 0 16px;
      font-size: 1rem;
      font-weight: 600;
    }

    .milestones-track {
      display: flex;
      gap: 0;
      overflow-x: auto;
      padding-bottom: 8px;
    }

    .milestone {
      flex: 1;
      min-width: 140px;
      text-align: center;
      position: relative;
      padding-top: 20px;
    }

    .milestone::before {
      content: '';
      position: absolute;
      top: 6px;
      left: 0;
      right: 0;
      height: 2px;
      background: #e2e8f0;
    }

    .milestone:first-child::before {
      left: 50%;
    }

    .milestone:last-child::before {
      right: 50%;
    }

    .milestone-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #6366f1;
      margin: 0 auto 8px;
      position: relative;
      z-index: 1;
    }

    .milestone-date {
      font-size: 0.75rem;
      color: #6366f1;
      font-weight: 600;
    }

    .milestone-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: #1e293b;
      margin: 4px 0 2px;
    }

    .milestone-target {
      font-size: 0.75rem;
      color: #64748b;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .features-grid {
        grid-template-columns: 1fr;
      }

      .milestones-track {
        flex-direction: column;
      }

      .milestone::before {
        display: none;
      }
    }
  `]
})
export class SafeProductComponent {
  activeSection = 'all';

  readonly sections: FeatureSection[] = [
    {
      id: 'clubs',
      audience: 'Pour les clubs sportifs',
      color: '#22c55e',
      features: [
        { icon: '\ud83d\udcfa', title: 'Diffusion TV automatis\u00e9e', description: 'Boucle vid\u00e9o continue avec transitions fluides, filigrane personnalis\u00e9 et branding aux couleurs de votre club.' },
        { icon: '\u26bd', title: 'Profils par phase de match', description: '3 ambiances automatiques (avant-match, pendant, apr\u00e8s-match) avec bascule en un clic ou depuis la t\u00e9l\u00e9commande.' },
        { icon: '\ud83c\udfc6', title: 'Score en direct multi-sport', description: 'Overlay en temps r\u00e9el pour 6 sports, 9 positions, chronom\u00e8tre int\u00e9gr\u00e9, animations de but, bandeau d\u00e9filant.' },
        { icon: '\ud83d\udcf1', title: 'T\u00e9l\u00e9commande cloud', description: 'Pilotez votre \u00e9cran depuis n\'importe quel smartphone via QR code. Vue live, capture \u00e9cran, changement de profil.' },
        { icon: '\ud83d\udcca', title: 'Analytics et rapports', description: 'Tableau de bord engagement, rapports PDF mensuels automatiques, benchmark entre clubs, export Excel.' },
        { icon: '\ud83d\udcf6', title: 'Mode hors-ligne garanti', description: 'Fonctionne m\u00eame sans internet (cache 48h). Hotspot WiFi int\u00e9gr\u00e9 pour la t\u00e9l\u00e9commande locale.' },
        { icon: '\ud83d\udda5\ufe0f', title: 'Double \u00e9cran (TV + LED)', description: 'Contenus diff\u00e9renci\u00e9s sur chaque sortie HDMI. D\u00e9tection automatique du type d\'\u00e9cran branch\u00e9.' },
        { icon: '\ud83d\udcc1', title: 'Gestion de contenu simple', description: 'Upload vid\u00e9os/images, conversion auto image\u2192vid\u00e9o, compression, miniatures, historique, cat\u00e9gories.' },
        { icon: '\ud83d\udcbb', title: 'Mode SaaS (sans mat\u00e9riel)', description: 'Utilisez Neopro directement depuis un navigateur web. Id\u00e9al pour d\u00e9marrer sans investissement.' },
        { icon: '\ud83c\udf10', title: 'Portail club autonome', description: 'G\u00e9rez vos vid\u00e9os, sponsors et boucle en autonomie depuis votre espace d\u00e9di\u00e9.' },
        { icon: '\ud83d\udee0\ufe0f', title: 'Panneau admin local', description: 'Interface web sur le bo\u00eetier : gestion WiFi, diagnostic guid\u00e9, logs, upload direct.' },
        { icon: '\ud83d\udce5', title: 'Playlists et programmation', description: 'Playlists personnalis\u00e9es (fixe, al\u00e9atoire, pond\u00e9r\u00e9), programmation horaire et r\u00e9currente.' },
      ]
    },
    {
      id: 'sponsors',
      audience: 'Pour les annonceurs et sponsors',
      color: '#f59e0b',
      features: [
        { icon: '\ud83d\ude80', title: 'Portail sponsor self-service', description: 'Acc\u00e8s par lien s\u00e9curis\u00e9, upload de spots (15-30s), s\u00e9lection des gymnases, suivi de validation en temps r\u00e9el.' },
        { icon: '\u2696\ufe0f', title: 'Rotation \u00e9quitable', description: 'Algorithme intelligent de r\u00e9partition, pond\u00e9ration par priorit\u00e9 (1-10), \u00e9pinglage de spots, pr\u00e9visualisation.' },
        { icon: '\ud83d\udcce', title: 'Preuves de diffusion', description: 'Captures d\'\u00e9cran horodat\u00e9es + certificat num\u00e9rique. Tra\u00e7abilit\u00e9 compl\u00e8te de chaque impression.' },
        { icon: '\ud83d\udcc8', title: 'Analytics sponsors', description: 'KPIs impressions, tendances, couverture r\u00e9seau, graphiques, export CSV, alertes si baisse anormale.' },
        { icon: '\ud83c\udf10', title: 'Stats cross-r\u00e9seau', description: 'Performances agr\u00e9g\u00e9es sur tous les clubs d\'un coup. Vue r\u00e9seau pour les agences multi-annonceurs.' },
        { icon: '\ud83d\udcc4', title: 'Rapports PDF professionnels', description: 'Rapports sponsors avec graphiques Chart.js. G\u00e9n\u00e9ration automatique ou \u00e0 la demande.' },
        { icon: '\ud83c\udfe2', title: 'Portail agence', description: 'G\u00e9rez plusieurs annonceurs depuis un seul compte avec vue consolid\u00e9e des performances.' },
        { icon: '\ud83d\udd14', title: 'Alertes proactives', description: 'Notifications automatiques si les impressions baissent. Matrice sant\u00e9 annonceurs sur le dashboard.' },
      ]
    },
    {
      id: 'ops',
      audience: 'Pour les op\u00e9rateurs / administrateurs',
      color: '#8b5cf6',
      features: [
        { icon: '\ud83d\uddfa\ufe0f', title: 'Carte de la flotte', description: 'Vue Leaflet de tous vos sites avec statut temps r\u00e9el (en ligne, hors ligne, alerte). Dashboard sant\u00e9 flotte.' },
        { icon: '\ud83d\ude80', title: 'D\u00e9ploiement multi-sites', description: 'D\u00e9ploiement vid\u00e9o simultan\u00e9, canary progressif (10\u2192100%), planifi\u00e9, avec file d\'attente pour Pi hors-ligne.' },
        { icon: '\u2b06\ufe0f', title: 'Mises \u00e0 jour OTA', description: 'Mise \u00e0 jour de tout le parc \u00e0 distance. Rollback automatique, v\u00e9rification int\u00e9grit\u00e9, planification red\u00e9marrage.' },
        { icon: '\u26a0\ufe0f', title: 'Alertes pr\u00e9dictives', description: '9 r\u00e8gles (disque, temp\u00e9rature, WiFi, inactivit\u00e9, vid\u00e9os orphelines\u2026). Notifications Slack + webhooks.' },
        { icon: '\ud83d\udc65', title: 'Gestion utilisateurs multi-tenant', description: 'Hi\u00e9rarchie Super Admin \u2192 Admin \u2192 Op\u00e9rateur \u2192 Viewer. R\u00f4les sp\u00e9cialis\u00e9s Annonceur, Agence, Club.' },
        { icon: '\ud83d\udcb3', title: 'Abonnements et facturation', description: '3 formules (Essentiel, Autonomie, Premium). Facturation mensuelle, export CSV/JSON, pouss\u00e9e licence temps r\u00e9el.' },
        { icon: '\ud83d\udd12', title: 'S\u00e9curit\u00e9 et conformit\u00e9', description: 'MFA/2FA, isolation donn\u00e9es (RLS), RGPD complet, audit trail, sauvegardes chiffr\u00e9es, pages l\u00e9gales int\u00e9gr\u00e9es.' },
        { icon: '\ud83d\udcca', title: 'Monitoring Grafana + Prometheus', description: 'M\u00e9triques temps r\u00e9el, dashboards Grafana Cloud, journalisation centralis\u00e9e Logtail.' },
        { icon: '\ud83d\udccb', title: 'Groupes de sites', description: 'Regroupement logique par r\u00e9gion, sport ou r\u00e9seau. Op\u00e9rations en lot sur les groupes.' },
        { icon: '\ud83d\udcd6', title: 'Documentation API (Swagger)', description: '30+ endpoints document\u00e9s en OpenAPI. M\u00e9triques pitch-deck pour investisseurs.' },
        { icon: '\ud83d\udd04', title: 'Copie de configuration', description: 'Dupliquez la config d\'un site vers un autre en un clic (vid\u00e9os, sponsors, profils).' },
        { icon: '\ud83e\ude7a', title: 'Diagnostic \u00e0 distance', description: 'Diagnostic complet du Pi depuis le dashboard. Bundle de logs, capture \u00e9cran, \u00e9tat syst\u00e8me.' },
      ]
    },
  ];

  readonly roadmap: RoadmapPhase[] = [
    {
      id: 'q1',
      label: 'Fondations',
      period: 'Q1 2026 (Janvier \u2014 Mars)',
      status: 'done',
      items: [
        'Diffusion TV multi-\u00e9crans',
        'Score en direct 6 sports',
        'Portail sponsor self-service',
        'Rotation pondérée Bresenham',
        'Analytics clubs + sponsors',
        'Télécommande cloud QR',
        'Carte de la flotte Leaflet',
        'Alertes prédictives (9 règles)',
        'Mode SaaS navigateur',
        'WiFi USB + résilience réseau',
        'OTA + canary deployment',
        'Profils config match',
        'Double écran HDMI',
        'Portail club + agence',
        'MFA, RGPD, audit',
      ]
    },
    {
      id: 'q2',
      label: 'R\u00e9gie & Score Live',
      period: 'Q2 2026 (Avril \u2014 Mai)',
      status: 'in-progress',
      items: [
        'R\u00e9gie publicitaire r\u00e9gionale',
        'Score live multi-fournisseurs',
        'API publique scores',
        'Motion design personnalis\u00e9',
        'Rapports email automatiques',
        'A/B testing cr\u00e9as',
        'Contenus TV + LED diff\u00e9renci\u00e9s',
        'R\u00e9silience HDMI avanc\u00e9e',
      ]
    },
    {
      id: 'q3',
      label: '\u00c9cosyst\u00e8me & Upsells',
      period: 'Q3 2026 (Juin \u2014 Juillet)',
      status: 'planned',
      items: [
        'Multi-\u00e9crans synchronis\u00e9s',
        'Marque blanche club',
        'Fonds de solidarit\u00e9',
        'Int\u00e9grations billetterie',
        'Capteurs de pr\u00e9sence',
        'Analytics pr\u00e9dictifs (IA)',
        'API partenaires OAuth',
      ]
    },
  ];

  readonly milestones: Milestone[] = [
    { date: 'Mars 2026', label: 'Premier palier', target: '5 clubs payants' },
    { date: 'Mai 2026', label: 'Lancement r\u00e9gie', target: '15 clubs \u00e9quip\u00e9s' },
    { date: 'Juil. 2026', label: 'Acc\u00e9l\u00e9ration', target: '20 clubs + annonceurs r\u00e9gionaux' },
    { date: 'D\u00e9c. 2026', label: 'Fin d\'ann\u00e9e', target: '~24K\u20ac ARR' },
    { date: '2028', label: 'Scale', target: '100+ clubs \u2022 400K\u20ac ARR' },
  ];

  trackBySectionId(_: number, s: FeatureSection): string { return s.id; }
  trackByTitle(_: number, f: ProductFeature): string { return f.title; }
  trackByPhaseId(_: number, p: RoadmapPhase): string { return p.id; }
  trackByMilestoneDate(_: number, m: Milestone): string { return m.date; }
}
