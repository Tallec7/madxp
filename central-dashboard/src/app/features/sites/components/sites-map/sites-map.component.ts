import { Component, OnInit, OnDestroy, AfterViewInit, Input, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import * as L from 'leaflet';
import { Site, SiteConnectionSummary } from '../../../../core/models';

// Fix for default marker icons in Leaflet with Webpack
const iconRetinaUrl = 'assets/marker-icon-2x.png';
const iconUrl = 'assets/marker-icon.png';
const shadowUrl = 'assets/marker-shadow.png';

@Component({
  selector: 'app-sites-map',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="map-container">
      <div class="map-header">
        <h3>Carte des sites</h3>
        <div class="map-legend">
          <span class="legend-item online"><span class="legend-dot"></span> Online ({{ onlineCount }})</span>
          <span class="legend-item offline"><span class="legend-dot"></span> Offline ({{ offlineCount }})</span>
          <span class="legend-item warning"><span class="legend-dot"></span> Instable ({{ warningCount }})</span>
        </div>
      </div>
      <div #mapContainer id="sites-map" class="map"></div>
      <div *ngIf="sitesWithoutCoordinates.length > 0" class="no-coords-warning">
        <span>{{ sitesWithoutCoordinates.length }} site(s) sans coordonnées GPS</span>
        <button class="btn btn-sm" (click)="showMissingSites = !showMissingSites">
          {{ showMissingSites ? 'Masquer' : 'Afficher' }}
        </button>
        <ul *ngIf="showMissingSites" class="missing-sites-list">
          <li *ngFor="let site of sitesWithoutCoordinates">
            <a [routerLink]="['/sites', site.id]">{{ site.club_name }}</a>
            <span class="location-hint">{{ site.location?.city || 'Ville non renseignée' }}</span>
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .map-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .map-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .map-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #0f172a;
    }

    .map-legend {
      display: flex;
      gap: 1rem;
      font-size: 0.8125rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: #64748b;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-item.online .legend-dot {
      background: #22c55e;
    }

    .legend-item.offline .legend-dot {
      background: #ef4444;
    }

    .legend-item.warning .legend-dot {
      background: #f59e0b;
    }

    .map {
      height: 400px;
      width: 100%;
    }

    .no-coords-warning {
      padding: 0.75rem 1.5rem;
      background: #fef3c7;
      border-top: 1px solid #fcd34d;
      font-size: 0.8125rem;
      color: #92400e;
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      background: white;
      border: 1px solid #d97706;
      border-radius: 4px;
      color: #d97706;
      cursor: pointer;
    }

    .btn-sm:hover {
      background: #fff7ed;
    }

    .missing-sites-list {
      width: 100%;
      margin: 0.5rem 0 0 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.5rem;
    }

    .missing-sites-list li {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .missing-sites-list a {
      color: #2563eb;
      text-decoration: none;
    }

    .missing-sites-list a:hover {
      text-decoration: underline;
    }

    .location-hint {
      color: #78716c;
      font-size: 0.75rem;
    }

    /* Leaflet popup customization */
    :host ::ng-deep .leaflet-popup-content-wrapper {
      border-radius: 8px;
      padding: 0;
    }

    :host ::ng-deep .leaflet-popup-content {
      margin: 0;
      min-width: 180px;
    }

    :host ::ng-deep .site-popup {
      padding: 0.75rem;
    }

    :host ::ng-deep .site-popup h4 {
      margin: 0 0 0.25rem 0;
      font-size: 0.9375rem;
      color: #0f172a;
    }

    :host ::ng-deep .site-popup .site-name {
      font-size: 0.8125rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    :host ::ng-deep .site-popup .site-status {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      margin-bottom: 0.5rem;
    }

    :host ::ng-deep .site-popup .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    :host ::ng-deep .site-popup .status-dot.online {
      background: #22c55e;
    }

    :host ::ng-deep .site-popup .status-dot.offline {
      background: #ef4444;
    }

    :host ::ng-deep .site-popup .status-dot.warning {
      background: #f59e0b;
    }

    :host ::ng-deep .site-popup .popup-link {
      display: inline-block;
      margin-top: 0.5rem;
      color: #2563eb;
      font-size: 0.8125rem;
      text-decoration: none;
    }

    :host ::ng-deep .site-popup .popup-link:hover {
      text-decoration: underline;
    }
  `]
})
export class SitesMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;
  @Input() sites: Site[] = [];
  @Input() connectionStatus: Map<string, SiteConnectionSummary> = new Map();

  private map: L.Map | null = null;
  private markers: L.Marker[] = [];

  showMissingSites = false;
  sitesWithoutCoordinates: Site[] = [];
  onlineCount = 0;
  offlineCount = 0;
  warningCount = 0;

  ngOnInit(): void {
    this.updateCounts();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    // Default center on France
    const defaultCenter: L.LatLngExpression = [46.603354, 1.888334];
    const defaultZoom = 6;

    this.map = L.map('sites-map').setView(defaultCenter, defaultZoom);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(this.map);

    this.addMarkers();
  }

  private addMarkers(): void {
    if (!this.map) return;

    // Clear existing markers
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
    this.sitesWithoutCoordinates = [];

    const bounds: L.LatLngBounds = L.latLngBounds([]);

    for (const site of this.sites) {
      const coords = site.location?.coordinates;

      if (!coords?.lat || !coords?.lng) {
        this.sitesWithoutCoordinates.push(site);
        continue;
      }

      const status = this.getConnectionStatus(site);
      const color = this.getMarkerColor(status);

      // Create custom icon
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          background: ${color};
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([coords.lat, coords.lng], { icon })
        .addTo(this.map)
        .bindPopup(this.createPopupContent(site, status));

      this.markers.push(marker);
      bounds.extend([coords.lat, coords.lng]);
    }

    // Fit bounds if we have markers
    if (this.markers.length > 0) {
      this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }

  private getConnectionStatus(site: Site): 'online' | 'offline' | 'warning' {
    const status = this.connectionStatus.get(site.id);
    if (!status) {
      return site.status === 'online' ? 'online' : 'offline';
    }
    return status.displayStatus as 'online' | 'offline' | 'warning';
  }

  private getMarkerColor(status: 'online' | 'offline' | 'warning'): string {
    switch (status) {
      case 'online': return '#22c55e';
      case 'warning': return '#f59e0b';
      case 'offline': return '#ef4444';
      default: return '#94a3b8';
    }
  }

  private createPopupContent(site: Site, status: string): string {
    const statusText = status === 'online' ? 'Connecte' : status === 'warning' ? 'Instable' : 'Deconnecte';
    const location = [site.location?.city, site.location?.region].filter(Boolean).join(', ') || 'Non renseigne';

    return `
      <div class="site-popup">
        <h4>${this.escapeHtml(site.club_name)}</h4>
        <div class="site-name">${this.escapeHtml(site.site_name)}</div>
        <div class="site-status">
          <span class="status-dot ${status}"></span>
          ${statusText}
        </div>
        <div style="font-size: 0.8125rem; color: #64748b;">
          ${this.escapeHtml(location)}
        </div>
        <a href="/sites/${site.id}" class="popup-link">Voir les details</a>
      </div>
    `;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private updateCounts(): void {
    this.onlineCount = 0;
    this.offlineCount = 0;
    this.warningCount = 0;

    for (const site of this.sites) {
      const status = this.getConnectionStatus(site);
      switch (status) {
        case 'online': this.onlineCount++; break;
        case 'warning': this.warningCount++; break;
        case 'offline': this.offlineCount++; break;
      }
    }
  }

  // Public method to refresh markers when data changes
  refreshMarkers(): void {
    this.updateCounts();
    this.addMarkers();
  }
}
