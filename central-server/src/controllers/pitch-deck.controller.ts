import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { pitchDeckRepository } from '../repositories';

export const getTractionMetrics = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      overview,
      userStats,
      fleetGrowth,
      engagementTotals,
      engagementMonthly,
      subscriptionStatus,
      subscriptionHistory,
      advertiserMetrics,
      advertiserMonthly,
      contentLibrary,
      contentGrowth,
      deploymentStats,
      reliability,
      alertStats,
      productVelocity,
      releaseAdoption,
      retentionCohorts,
      sportDistribution,
      contentMix,
    ] = await Promise.all([
      pitchDeckRepository.getOverview(),
      pitchDeckRepository.getUserStats(),
      pitchDeckRepository.getFleetGrowth(),
      pitchDeckRepository.getEngagementTotals(),
      pitchDeckRepository.getEngagementMonthly(),
      pitchDeckRepository.getSubscriptionStatus(),
      pitchDeckRepository.getSubscriptionHistory(),
      pitchDeckRepository.getAdvertiserMetrics(),
      pitchDeckRepository.getAdvertiserMonthly(),
      pitchDeckRepository.getContentLibrary(),
      pitchDeckRepository.getContentGrowth(),
      pitchDeckRepository.getDeploymentStats(),
      pitchDeckRepository.getReliability(),
      pitchDeckRepository.getAlertStats(),
      pitchDeckRepository.getProductVelocity(),
      pitchDeckRepository.getReleaseAdoption(),
      pitchDeckRepository.getRetentionCohorts(),
      pitchDeckRepository.getSportDistribution(),
      pitchDeckRepository.getContentMix(),
    ]);

    res.json({
      overview,
      userStats,
      fleetGrowth,
      engagementTotals,
      engagementMonthly,
      subscriptionStatus,
      subscriptionHistory,
      advertiserMetrics,
      advertiserMonthly,
      contentLibrary,
      contentGrowth,
      deploymentStats,
      reliability,
      alertStats,
      productVelocity,
      releaseAdoption,
      retentionCohorts,
      sportDistribution,
      contentMix,
    });
  } catch (error) {
    logger.error('Get traction metrics error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des métriques de traction' });
  }
};
