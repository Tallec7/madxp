/**
 * RemoteHostComponent — Dispatcher V1 / V2 de la télécommande.
 *
 * Règle de décision (ordre de priorité) :
 * 1. Query param `?v2=1` ou `?v2=0` — override local pour test (précède toujours).
 * 2. Feature flag `remote_v2` côté site (via SaasConfigService) — source cloud.
 * 3. Fallback V1 (legacy) sinon.
 *
 * Rollback : query param `?v2=0` OU décocher la feature dans le dashboard.
 */
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RemoteComponent } from './remote.component';
import { RemoteV2Component } from '../remote-v2/remote-v2.component';
import { SaasConfigService } from '../../services/saas-config.service';

const OVERRIDE_STORAGE_KEY = 'neopro_remote_v2_override';

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
    this.useV2 = this.resolveVariant();
  }

  /**
   * Décide V1 vs V2. Priorité : query param > localStorage > feature flag site.
   * L'override localStorage persiste entre sessions pour faciliter les tests.
   */
  private resolveVariant(): boolean {
    const qp = this.route.snapshot.queryParamMap.get('v2');
    if (qp === '1' || qp === 'true') {
      localStorage.setItem(OVERRIDE_STORAGE_KEY, '1');
      return true;
    }
    if (qp === '0' || qp === 'false') {
      localStorage.setItem(OVERRIDE_STORAGE_KEY, '0');
      return false;
    }

    const stored = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;

    return this.saasConfig.isFeatureEnabled('remote_v2');
  }
}
