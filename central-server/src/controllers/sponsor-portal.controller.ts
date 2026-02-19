import { Request, Response } from 'express';
import logger from '../config/logger';
import { sponsorAccessService } from '../services/sponsor-access.service';
import { siteSponsorRepository } from '../repositories/site-sponsor.repository';
import { generateSiteSponsorReport } from '../services/pdf-report.service';

// =============================================================================
// SPONSOR PORTAL CONTROLLER
// Endpoints publics pour le portail sponsor (accès via magic link, pas d'auth JWT)
// Routes: /api/sponsor-portal/...
// =============================================================================

// =============================================================================
// GET /api/sponsor-portal/verify
// Verifie un token d'acces sponsor et retourne les infos
// =============================================================================

export const verifySponsorToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query as { token?: string };

    if (!token || typeof token !== 'string') {
      res.status(400).json({ valid: false, error: 'Token manquant' });
      return;
    }

    const result = await sponsorAccessService.verifyToken(token);

    if (!result) {
      res.status(401).json({
        valid: false,
        error: 'Lien invalide ou expire',
      });
      return;
    }

    res.json({
      valid: true,
      sponsor: {
        id: result.siteSponsorId,
        name: result.sponsorName,
        siteId: result.siteId,
        clubName: result.clubName,
      },
    });
  } catch (error) {
    logger.error('Error verifying sponsor access token:', error);
    res.status(500).json({ valid: false, error: 'Erreur lors de la verification' });
  }
};

// =============================================================================
// GET /api/sponsor-portal/stats
// Stats du sponsor (authentifie par token)
// =============================================================================

export const getSponsorPortalStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, from, to } = req.query as { token?: string; from?: string; to?: string };

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'Token manquant' });
      return;
    }

    const validation = await sponsorAccessService.verifyToken(token);
    if (!validation) {
      res.status(401).json({ success: false, error: 'Lien invalide ou expire' });
      return;
    }

    const periodFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const periodTo = to || new Date().toISOString().split('T')[0];

    const [summary, dailyTrends, videos] = await Promise.all([
      siteSponsorRepository.getStatsSummary(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getDailyTrends(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getVideos(validation.siteSponsorId),
    ]);

    res.json({
      success: true,
      data: {
        sponsor: {
          id: validation.siteSponsorId,
          name: validation.sponsorName,
          clubName: validation.clubName,
        },
        period: { from: periodFrom, to: periodTo },
        summary,
        daily_trends: dailyTrends,
        videos,
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor portal stats:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la recuperation des stats' });
  }
};

// =============================================================================
// GET /api/sponsor-portal/report
// Telecharger un rapport PDF (authentifie par token)
// =============================================================================

export const getSponsorPortalReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, from, to } = req.query as { token?: string; from?: string; to?: string };

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, error: 'Token manquant' });
      return;
    }

    const validation = await sponsorAccessService.verifyToken(token);
    if (!validation) {
      res.status(401).json({ success: false, error: 'Lien invalide ou expire' });
      return;
    }

    const periodFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const periodTo = to || new Date().toISOString().split('T')[0];

    const pdfBuffer = await generateSiteSponsorReport(
      validation.siteSponsorId,
      periodFrom,
      periodTo
    );

    const filename = `rapport-${validation.sponsorName.replace(/[^a-zA-Z0-9]/g, '-')}-${periodFrom}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating sponsor portal report:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la generation du rapport' });
  }
};
