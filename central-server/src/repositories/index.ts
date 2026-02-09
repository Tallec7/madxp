/**
 * Couche Repository — Abstraction de l'acces aux donnees.
 *
 * Usage:
 *   import { siteRepository, subscriptionRepository } from '../repositories';
 *
 * Chaque repository encapsule les requetes SQL pour un domaine specifique,
 * offrant une interface typee et testable.
 */
export { siteRepository, type SiteFilters, type PaginationParams, type PaginatedResult } from './site.repository';
export { subscriptionRepository, type SubscriptionUpdate, type HistoryInput } from './subscription.repository';
export { deploymentRepository, type DeploymentWithVideo, type CreateDeploymentInput } from './deployment.repository';
export { alertRepository, type CreateAlertInput, type AlertThreshold, type AlertWithSite } from './alert.repository';
export { BaseRepository } from './base.repository';
