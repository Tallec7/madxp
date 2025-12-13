import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
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
