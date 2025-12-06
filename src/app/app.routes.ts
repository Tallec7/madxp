import { ResolveFn, Routes } from '@angular/router';
import { TvComponent } from './components/tv/tv.component';
import { RemoteComponent } from './components/remote/remote.component';
import { LoginComponent } from './components/login/login.component';
import { Configuration } from './interfaces/configuration.interface';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { authGuard } from './guards/auth.guard';

const getConfiguration: ResolveFn<Configuration> = () => {
  const http = inject(HttpClient);
  console.log('start loading configuration');
  return http.get<Configuration>('/configuration.json').pipe(tap(((data) => console.log('load configuration', data))));
};

export const routes: Routes = [
    { path: '', redirectTo: 'tv', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'tv', component: TvComponent, resolve: { configuration: getConfiguration } },
    { path: 'remote', component: RemoteComponent, resolve: { configuration: getConfiguration }, canActivate: [authGuard] },
    { path: '**', redirectTo: 'tv' }
];
