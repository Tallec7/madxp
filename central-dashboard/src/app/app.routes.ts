import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent
  },
  // Pages juridiques (accessibles sans authentification)
  {
    path: 'legal/:page',
    loadComponent: () => import('./features/legal/legal.component').then(m => m.LegalComponent)
  },
  // Télécommande cloud (accessible SANS authentification pour les utilisateurs qui scannent le QR code)
  {
    path: 'remote/:siteId',
    loadComponent: () => import('./features/remote/cloud-remote.component').then(m => m.CloudRemoteComponent)
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
        path: 'analytics',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin', 'operator'] },
        loadComponent: () => import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent)
      },
      {
        path: 'analytics/comparison',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin'] },
        loadComponent: () => import('./features/analytics/analytics-comparison.component').then(m => m.AnalyticsComparisonComponent)
      },
      {
        path: 'analytics/realtime',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin'] },
        loadComponent: () => import('./features/analytics/realtime-dashboard.component').then(m => m.RealtimeDashboardComponent)
      },
      {
        path: 'sites/:id/analytics',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin', 'operator'] },
        loadComponent: () => import('./features/analytics/club-analytics.component').then(m => m.ClubAnalyticsComponent)
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
        data: { roles: ['super_admin', 'admin', 'operator'] },
        loadComponent: () => import('./features/content/content-management.component').then(m => m.ContentManagementComponent)
      },
      {
        path: 'updates',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin', 'operator'] },
        loadComponent: () => import('./features/updates/updates-management.component').then(m => m.UpdatesManagementComponent)
      },
      {
        path: 'admin/local',
        canActivate: [roleGuard],
        data: { roles: ['super_admin', 'admin'] },
        loadComponent: () => import('./features/admin/local-admin/local-admin.component').then(m => m.LocalAdminComponent)
      },
      // Annonceurs (nouveau terme pour Sponsors)
      {
        path: 'advertisers',
        loadComponent: () => import('./features/advertisers/advertisers-list.component').then(m => m.AdvertisersListComponent)
      },
      {
        path: 'advertisers/:id',
        loadComponent: () => import('./features/sponsors/sponsor-detail.component').then(m => m.SponsorDetailComponent)
      },
      {
        path: 'advertisers/:id/videos',
        loadComponent: () => import('./features/sponsors/sponsor-videos.component').then(m => m.SponsorVideosComponent)
      },
      // Routes legacy sponsors (redirection vers advertisers pour retrocompatibilite)
      {
        path: 'sponsors',
        redirectTo: 'advertisers',
        pathMatch: 'full'
      },
      {
        path: 'sponsors/:id',
        redirectTo: 'advertisers/:id',
        pathMatch: 'full'
      },
      // Portail Annonceur (pour utilisateurs avec role 'advertiser' ou legacy 'sponsor')
      {
        path: 'advertiser-portal',
        canActivate: [roleGuard],
        data: { roles: ['advertiser', 'sponsor', 'admin', 'super_admin'] },
        loadComponent: () => import('./features/sponsor-portal/sponsor-dashboard.component').then(m => m.SponsorDashboardComponent)
      },
      // Legacy sponsor-portal redirect
      {
        path: 'sponsor-portal',
        redirectTo: 'advertiser-portal',
        pathMatch: 'full'
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
      },
      // Admin: Gestion des utilisateurs
      {
        path: 'admin/users',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'] },
        loadComponent: () => import('./features/admin/users/users-management.component').then(m => m.UsersManagementComponent)
      },
      // Admin: Catégories analytics
      {
        path: 'admin/analytics-categories',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'] },
        loadComponent: () => import('./features/admin/analytics-categories/analytics-categories.component').then(m => m.AnalyticsCategoriesComponent)
      },
      // Admin: Gestion des abonnements
      {
        path: 'subscriptions',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'] },
        loadComponent: () => import('./features/subscriptions/subscriptions-management.component').then(m => m.SubscriptionsManagementComponent)
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
