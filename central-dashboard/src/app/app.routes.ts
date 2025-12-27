import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/layout.component').then(m => m.LayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'sites',
        loadComponent: () => import('./features/sites/sites-list.component').then(m => m.SitesListComponent)
      },
      {
        path: 'sites/:id',
        loadComponent: () => import('./features/sites/site-detail.component').then(m => m.SiteDetailComponent)
      },
      {
        path: 'sites/:id/analytics',
        loadComponent: () => import('./features/analytics/club-analytics.component').then(m => m.ClubAnalyticsComponent)
      },
      {
        path: 'groups',
        loadComponent: () => import('./features/groups/groups-list.component').then(m => m.GroupsListComponent)
      },
      {
        path: 'groups/:id',
        loadComponent: () => import('./features/groups/group-detail.component').then(m => m.GroupDetailComponent)
      },
      {
        path: 'content',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'operator'] },
        loadComponent: () => import('./features/content/content-management.component').then(m => m.ContentManagementComponent)
      },
      {
        path: 'updates',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'operator'] },
        loadComponent: () => import('./features/updates/updates-management.component').then(m => m.UpdatesManagementComponent)
      },
      {
        path: 'analytics',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'operator'] },
        loadComponent: () => import('./features/analytics/analytics-overview.component').then(m => m.AnalyticsOverviewComponent)
      },
      {
        path: 'admin/analytics-categories',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./features/admin/analytics-categories/analytics-categories.component').then(m => m.AnalyticsCategoriesComponent)
      },
      {
        path: 'admin/local',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./features/admin/local-admin/local-admin.component').then(m => m.LocalAdminComponent)
      },
      {
        path: 'sponsors',
        loadComponent: () => import('./features/sponsors/sponsors-list.component').then(m => m.SponsorsListComponent)
      },
      {
        path: 'sponsors/:id',
        loadComponent: () => import('./features/sponsors/sponsor-detail.component').then(m => m.SponsorDetailComponent)
      },
      {
        path: 'sponsors/:id/analytics',
        loadComponent: () => import('./features/sponsors/sponsor-analytics.component').then(m => m.SponsorAnalyticsComponent)
      },
      {
        path: 'sponsors/:id/videos',
        loadComponent: () => import('./features/sponsors/sponsor-videos.component').then(m => m.SponsorVideosComponent)
      },
      // Portail Sponsor (pour utilisateurs avec rôle 'sponsor')
      {
        path: 'sponsor-portal',
        canActivate: [roleGuard],
        data: { roles: ['sponsor', 'admin', 'super_admin'] },
        loadComponent: () => import('./features/sponsor-portal/sponsor-dashboard.component').then(m => m.SponsorDashboardComponent)
      },
      // Portail Agence (pour utilisateurs avec rôle 'agency')
      {
        path: 'agency-portal',
        canActivate: [roleGuard],
        data: { roles: ['agency', 'admin', 'super_admin'] },
        loadComponent: () => import('./features/agency-portal/agency-dashboard.component').then(m => m.AgencyDashboardComponent)
      },
      // Admin: Gestion des agences
      {
        path: 'admin/agencies',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'] },
        loadComponent: () => import('./features/admin/agencies/agencies-management.component').then(m => m.AgenciesManagementComponent)
      }
    ]
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/error/forbidden.component').then(m => m.ForbiddenComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
