import { ResolveFn, Routes } from '@angular/router';
import { TvComponent } from './components/tv/tv.component';
import { RemoteComponent } from './components/remote/remote.component';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './components/home/home.component';
import { Configuration } from './interfaces/configuration.interface';
import { Category } from './interfaces/category.interface';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap, catchError, of } from 'rxjs';
import { authGuard } from './guards/auth.guard';
import { DemoConfigService } from './services/demo-config.service';
import { ProfileConfigService } from './services/profile-config.service';
import { SaasConfigService } from './services/saas-config.service';

/**
 * Enrichit les vidéos avec le categoryId de leur catégorie parente
 * pour permettre le mapping vers les catégories analytics
 */
function enrichVideosWithCategoryId(config: Configuration): Configuration {
  const enrichCategory = (category: Category): Category => ({
    ...category,
    videos: category.videos?.map(video => ({
      ...video,
      categoryId: category.id
    })),
    subCategories: category.subCategories?.map(sub => enrichCategory(sub))
  });

  return {
    ...config,
    categories: config.categories?.map(cat => enrichCategory(cat)) || []
  };
}

const getConfiguration: ResolveFn<Configuration> = () => {
  const http = inject(HttpClient);
  const demoConfigService = inject(DemoConfigService);
  const profileConfigService = inject(ProfileConfigService);
  const saasConfigService = inject(SaasConfigService);

  console.log('start loading configuration');

  // En mode démo
  if (demoConfigService.isDemoMode()) {
    // Utiliser la config du club sélectionné si disponible
    const selectedConfig$ = demoConfigService.getSelectedConfiguration();
    if (selectedConfig$) {
      return selectedConfig$.pipe(
        map(enrichVideosWithCategoryId),
        tap(data => console.log('load configuration (demo club)', data))
      );
    }
    // Sinon, charger la config démo par défaut
    return http.get<Configuration>('/demo-configs/default.json').pipe(
      map(enrichVideosWithCategoryId),
      tap(data => console.log('load configuration (demo default)', data))
    );
  }

  // En mode SaaS : charger la config depuis l'API centrale
  if (saasConfigService.isSaasMode()) {
    const selectedConfig$ = saasConfigService.getSelectedConfiguration();
    if (selectedConfig$) {
      return selectedConfig$.pipe(
        map(enrichVideosWithCategoryId),
        tap(data => console.log('load configuration (saas)', data)),
        catchError(err => {
          console.error('SaaS config load failed:', err);
          saasConfigService.clearSelection();
          // Retry with default profile (no selected profile)
          const siteId = saasConfigService.getSiteId();
          if (siteId) {
            return saasConfigService.loadConfiguration(siteId).pipe(
              map(enrichVideosWithCategoryId),
              tap(data => console.log('load configuration (saas fallback)', data)),
              catchError(() => {
                console.warn('SaaS fallback also failed, using minimal config');
                return of({
                  remote: { title: 'Neopro SaaS' },
                  version: '1.0',
                  sponsors: [],
                  categories: [],
                } as Configuration);
              })
            );
          }
          return of({
            remote: { title: 'Neopro SaaS' },
            version: '1.0',
            sponsors: [],
            categories: [],
          } as Configuration);
        })
      );
    }
    // No siteId available — return minimal config
    console.warn('SaaS mode: no siteId available');
    return of({
      remote: { title: 'Neopro SaaS' },
      version: '1.0',
      sponsors: [],
      categories: [],
    } as Configuration);
  }

  // En mode production : si un profil est selectionne, le charger
  const selectedProfile$ = profileConfigService.getSelectedConfiguration();
  if (selectedProfile$) {
    return selectedProfile$.pipe(
      map(enrichVideosWithCategoryId),
      tap(data => console.log('load configuration (profile)', data)),
      catchError(() => {
        console.warn('Profile load failed, clearing selection and falling back to default config');
        profileConfigService.clearSelection();
        return http.get<Configuration>('/configuration.json').pipe(
          map(enrichVideosWithCategoryId),
          tap(data => console.log('load configuration (fallback)', data))
        );
      })
    );
  }

  // Sinon, charger la config standard du Raspberry
  return http.get<Configuration>('/configuration.json').pipe(
    map(enrichVideosWithCategoryId),
    tap(data => console.log('load configuration', data))
  );
};

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'login', component: LoginComponent },
    { path: 'tv', component: TvComponent, resolve: { configuration: getConfiguration } },
    { path: 'secondary', component: TvComponent, resolve: { configuration: getConfiguration }, data: { displayType: 'secondary' } },
    { path: 'remote', component: RemoteComponent, resolve: { configuration: getConfiguration }, canActivate: [authGuard] },
    { path: '**', redirectTo: 'tv' }
];
