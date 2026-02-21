/**
 * Couche Repository — Abstraction de l'acces aux donnees.
 *
 * Usage:
 *   import { siteRepository, subscriptionRepository } from '../repositories';
 *
 * Chaque repository encapsule les requetes SQL pour un domaine specifique,
 * offrant une interface typee et testable.
 */
export {
  siteRepository,
  type SiteFilters,
  type PaginationParams,
  type PaginatedResult,
  type ExtendedSiteFilters,
  type UserContext,
  type SubscriptionFilter,
  type CreateSiteInput,
  type UpdateSiteInput,
  type SiteConnectionRow,
  type SiteStatsRow,
  type FleetHealthRow,
  type SiteLocalContentRow,
  type MatchRow,
  type MatchStatsRow,
  type SiteDashboardRow,
} from './site.repository';
export { subscriptionRepository, type SubscriptionUpdate, type HistoryInput } from './subscription.repository';
export {
  deploymentRepository,
  type DeploymentWithVideo,
  type CreateDeploymentInput,
  type VideoDeploymentRow,
  type DeploymentDetailRow,
  type CreateFullDeploymentInput,
  type UpdateDeploymentFields,
} from './deployment.repository';
export { alertRepository, type CreateAlertInput, type AlertThreshold, type AlertWithSite } from './alert.repository';
export {
  remoteCommandRepository,
  type RemoteCommand,
  type CreateCommandInput,
  type CommandStatusRow,
} from './remote-command.repository';
export {
  metricsRepository,
  type MetricRow,
  type MetricStatsRow,
  type FleetAveragesRow,
} from './metrics.repository';
export {
  timelineRepository,
  type DeploymentTimelineRow,
  type CommandTimelineRow,
  type ConfigTimelineRow,
  type AlertTimelineRow,
  type TimelineData,
  type CloudVideoRow,
} from './timeline.repository';
export {
  userRepository,
  type UserRow,
  type UserWithRelations,
  type UserListFilters,
  type CreateUserInput,
  type UpdateUserInput,
  type AuditLogRow,
  type PasswordResetTokenRow,
} from './user.repository';
export {
  groupRepository,
  type GroupRow,
  type CreateGroupInput,
  type UpdateGroupInput,
  type SiteGroupRow,
} from './group.repository';
export {
  analyticsRepository,
  type ClubHealthMetrics,
  type HeartbeatStats,
  type AlertStats,
  type AvgMetrics,
  type DailyHeartbeatRow,
  type ClubAlertRow,
  type UsageStatsRow,
  type DailyStatsRow,
  type CategoryStatsRow,
  type TopVideoRow,
  type SessionRow,
  type AnalyticsCategoryRow,
  type OverviewSiteCountRow,
  type OverviewPlaysRow,
  type OverviewAvailabilityRow,
  type OverviewSiteSummaryRow,
  type ComparisonSiteRow,
  type DashboardHealthRow,
  type DashboardUsageRow,
  type DashboardCategoryRow,
  type CreateCategoryInput,
  type VideoPlaysBatchItem,
} from './analytics.repository';
export {
  advertiserRepository,
  type AdvertiserRow,
  type CreateAdvertiserInput,
  type UpdateAdvertiserInput,
  type AdvertiserVideoRow,
  type AdvertiserStatsSummary,
  type AdvertiserVideoStatsRow,
  type AdvertiserSiteStatsRow,
  type AdvertiserPeriodRow,
  type AdvertiserEventTypeRow,
  type AdvertiserDailyTrendRow,
  type AdvertiserImpressionExportRow,
  type ImpressionBatchItem,
} from './advertiser.repository';
export {
  reportRepository,
  type GeneratedReportRow,
  type ReportWithEntityName,
  type ReportTypeStatusStats,
  type ReportMonthlyStats,
} from './report.repository';
export {
  configHistoryRepository,
  type ConfigHistoryRow,
  type ConfigHistoryWithUserRow,
  type ConfigVersionCompareRow,
  type SiteBasicRow,
  type SiteLocalConfigRow,
  type ConfigHistoryLastVersionRow,
  type ConfigHistoryConfigOnlyRow,
  type InsertConfigVersionInput,
} from './config-history.repository';
export {
  configProfileRepository,
  type ConfigProfileRow,
  type ConfigProfileMetadataRow,
  type CreateProfileInput,
  type UpdateProfileInput,
} from './config-profile.repository';
export {
  agencyRepository,
  type AgencyRow,
  type AgencyWithSiteCount,
  type AgencySiteRow,
  type AgencyDashboardStatsRow,
  type AgencyAlertRow,
  type SiteDetailRow,
  type SiteStatsRow as AgencySiteStatsRow,
  type SiteTrendRow,
  type AgencySummaryRow,
  type AgencyBySiteRow,
  type AgencyTrendRow,
  type AdminAgencySiteRow,
  type AgencyIdNameRow,
  type CreateAgencyInput,
  type UpdateAgencyInput,
} from './agency.repository';
export {
  playlistScheduleRepository,
  type PlaylistScheduleRow,
  type PlaylistScheduleWithJoins,
  type CreateScheduleInput,
  type UpdateScheduleFields,
  type CustomPlaylistRow,
  type CustomPlaylistWithJoins,
  type CreateCustomPlaylistInput,
  type UpdateCustomPlaylistFields,
  type ActivePlaylistRuleRow,
} from './playlist-schedule.repository';
export {
  objectiveRepository,
  type ClubObjectiveRow,
  type ObjectiveWithSiteRow,
  type ObjectiveWithProgressRow,
  type ObjectiveProgressRow,
  type ObjectiveAlertRow,
  type ObjectiveStatsRow,
  type ObjectiveListFilters,
  type CreateObjectiveInput,
  type UpdateObjectiveInput,
  type CalculateProgressRow,
  type UpdateAllProgressRow,
} from './objective.repository';
export {
  advertiserPortalRepository,
  type PortalDashboardStatsRow,
  type PortalReachStatsRow,
  type PortalTrendRow,
  type PortalSiteRow,
  type PortalVideoRow,
  type DailyStatsSummaryRow,
  type DailyStatsByVideoRow,
  type DailyStatsBySiteRow,
  type VideoStatsGlobalRow,
  type VideoStatsBySiteRow,
  type AdvertiserVideoOwnershipRow,
  type DuplicateVideoRow,
  type DeploymentCountRow,
  type InsertedVideoRow,
  type AdminAdvertiserSiteRow,
  type SiteAdvertiserRow as PortalSiteAdvertiserRow,
  type SiteIdRow,
  type AdvertiserSiteAssocRow,
} from './advertiser-portal.repository';
export {
  videoRepository,
  type VideoRow,
  type VideoFilters,
  type CreateVideoInput,
  type CreateVideoBulkResult,
  type UpdateVideoInput,
} from './video.repository';
export {
  softwareUpdateRepository,
  type SoftwareUpdateRow,
  type CreateSoftwareUpdateInput,
  type UpdateSoftwareUpdateInput,
  type PackageCheckRow,
  type UpdateDeploymentRow,
  type CreateUpdateDeploymentInput,
  type UpdateUpdateDeploymentFields,
} from './software-update.repository';
export {
  pitchDeckRepository,
  type TractionOverviewRow,
  type UserStatsRow,
  type FleetGrowthRow,
  type EngagementTotalsRow,
  type EngagementMonthlyRow,
  type SubscriptionStatusRow,
  type SubscriptionHistoryRow,
  type AdvertiserMetricsRow,
  type AdvertiserMonthlyRow,
  type ContentLibraryRow,
  type ContentGrowthRow,
  type DeploymentStatsRow,
  type ReliabilityRow,
  type AlertStatsRow as PitchDeckAlertStatsRow,
  type ProductVelocityRow,
  type ReleaseAdoptionRow,
  type RetentionCohortRow,
  type SportDistributionRow,
  type ContentMixRow,
} from './pitch-deck.repository';
export { siteSponsorRepository } from './site-sponsor.repository';
export {
  videoVariantRepository,
  type VideoVariantRow,
  type CreateVideoVariantInput,
  type DisplayType,
} from './video-variant.repository';
export { BaseRepository } from './base.repository';
