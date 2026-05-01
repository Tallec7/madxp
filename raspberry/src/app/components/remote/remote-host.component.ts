/**
 * RemoteHostComponent — Dispatcher V1 / V2 de la télécommande.
 *
 * Règle de décision (ordre de priorité) :
 * 1. Query param `?v2=1` ou `?v2=0` — override session-only (ne persiste pas).
 * 2. Feature flag `remote_v2` côté site (Pi config OU saasConfig) — source cloud.
 * 3. Fallback V1 (legacy) sinon.
 *
 * Note multi-tenant SaaS : les sites partagent le même domaine, donc le
 * localStorage est mutualisé entre tous les sites visités dans le même
 * navigateur. La clé legacy `neopro_remote_v2_override` (écrite par l'ancien
 * code à chaque `?v2=…`) faisait que tester V2 sur un site forçait V2 sur tous
 * les autres. La clé est désormais ignorée et nettoyée au démarrage.
 *
 * Rollback : décocher la feature `remote_v2` dans le dashboard.
 */
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RemoteComponent } from './remote.component';
import { RemoteV2Component } from '../remote-v2/remote-v2.component';
import { SaasConfigService } from '../../services/saas-config.service';
import { Configuration } from '../../interfaces/configuration.interface';

const LEGACY_OVERRIDE_STORAGE_KEY = 'neopro_remote_v2_override';

@Component({
  selector: 'app-remote-host',
  standalone: true,
  imports: [CommonModule, RemoteComponent, RemoteV2Component],
  template: `
    <ng-container *ngIf="useV2; else legacy">
      <app-remote-v2></app-remote-v2>
    </ng-container>
    <ng-template #legacy>
      <app-remote></app-remote>
    </ng-template>
  `,
})
export class RemoteHostComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly saasConfig = inject(SaasConfigService);

  useV2 = false;

  ngOnInit(): void {
    this.cleanupLegacyOverride();
    this.useV2 = this.resolveVariant();
  }

  /**
   * Nettoyage de la clé `neopro_remote_v2_override` héritée. En SaaS multi-tenant
   * elle forçait V2 sur tous les sites partageant le même domaine après un test
   * avec `?v2=1`. La clé n'est plus écrite ; on la supprime aussi pour les
   * navigateurs déjà contaminés.
   */
  private cleanupLegacyOverride(): void {
    try {
      localStorage.removeItem(LEGACY_OVERRIDE_STORAGE_KEY);
    } catch {
      /* localStorage indisponible — silent */
    }
  }

  /**
   * Décide V1 vs V2. Priorité : query param session-only > feature flag site.
   * Le query param ne persiste plus en localStorage (ADR-092 hotfix) pour ne
   * pas contaminer les autres sites SaaS du même navigateur.
   */
  private resolveVariant(): boolean {
    const qp = this.route.snapshot.queryParamMap.get('v2');
    if (qp === '1' || qp === 'true') return true;
    if (qp === '0' || qp === 'false') return false;

    // ADR-092: sur Pi, featureOverrides est écrit dans configuration.json par
    // feature-flags-sync.js. Sur SaaS, il est servi via /api/saas/:siteId/config.
    const configuration = this.route.snapshot.data['configuration'] as Configuration | undefined;
    const piOverrides = configuration?.featureOverrides;
    if (piOverrides && typeof piOverrides['remote_v2'] === 'boolean') {
      return piOverrides['remote_v2'];
    }

    return this.saasConfig.isFeatureEnabled('remote_v2');
  }
}
