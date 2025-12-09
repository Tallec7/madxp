import { ResolveFn, Routes } from '@angular/router';
import { TvComponent } from './components/tv/tv.component';
import { RemoteComponent } from './components/remote/remote.component';
import { LoginComponent } from './components/login/login.component';
import { Configuration } from './interfaces/configuration.interface';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { authGuard } from './guards/auth.guard';
import { DemoConfigService } from './services/demo-config.service';

const getConfiguration: ResolveFn<Configuration> = () => {
  const http = inject(HttpClient);
  const demoConfigService = inject(DemoConfigService);

  console.log('start loading configuration');

  // En mode démo
  if (demoConfigService.isDemoMode()) {
    // Utiliser la config du club sélectionné si disponible
    const selectedConfig$ = demoConfigService.getSelectedConfiguration();
    if (selectedConfig$) {
      return selectedConfig$.pipe(tap(data => console.log('load configuration (demo club)', data)));
    }
    // Sinon, charger la config démo par défaut
    return http.get<Configuration>('/demo-configs/default.json').pipe(tap(data => console.log('load configuration (demo default)', data)));
  }

  // En mode normal, charger la config du Raspberry
  return http.get<Configuration>('/configuration.json').pipe(tap(((data) => console.log('load configuration', data))));
};

export const routes: Routes = [
    { path: '', redirectTo: 'tv', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'tv', component: TvComponent, resolve: { configuration: getConfiguration } },
    { path: 'remote', component: RemoteComponent, resolve: { configuration: getConfiguration }, canActivate: [authGuard] },
    { path: '**', redirectTo: 'tv' }
];
