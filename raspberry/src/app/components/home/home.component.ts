import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { APP_VERSION } from '../../version';
import { SaasConfigService } from '../../services/saas-config.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgIf, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly saasConfigService = inject(SaasConfigService);
  readonly isSaasMode = environment.saasMode;
  readonly appVersion = APP_VERSION;
  readonly siteQueryParams = this.isSaasMode ? { site: this.saasConfigService.getSiteId() } : {};
}
