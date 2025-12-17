import { ResolveFn, Routes } from '@angular/router';
import { TvComponent } from './components/tv/tv.component';
import { RemoteComponent } from './components/remote/remote.component';
import { LoginComponent } from './components/login/login.component';
import { Configuration } from './interfaces/configuration.interface';
import { Category } from './interfaces/category.interface';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { authGuard } from './guards/auth.guard';
import { DemoConfigService } from './services/demo-config.service';

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

  // En mode normal, charger la config du Raspberry
  return http.get<Configuration>('/configuration.json').pipe(
    map(enrichVideosWithCategoryId),
    tap(data => console.log('load configuration', data))
  );
};

export const routes: Routes = [
    { path: '', redirectTo: 'tv', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'tv', component: TvComponent, resolve: { configuration: getConfiguration } },
    { path: 'remote', component: RemoteComponent, resolve: { configuration: getConfiguration }, canActivate: [authGuard] },
    { path: '**', redirectTo: 'tv' }
];
