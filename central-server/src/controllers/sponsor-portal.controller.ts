import { Request, Response } from 'express';
import logger from '../config/logger';
import { sponsorAccessService } from '../services/sponsor-access.service';
import { siteSponsorRepository, VideoStatsRow, PeriodBreakdownRow, SiteBenchmarkRow } from '../repositories/site-sponsor.repository';
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

    const [summary, dailyTrends, videos, videoStatsResult, periodBreakdownResult] = await Promise.all([
      siteSponsorRepository.getStatsSummary(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getDailyTrends(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getVideos(validation.siteSponsorId),
      siteSponsorRepository.getStatsByVideo(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getStatsByPeriod(validation.siteSponsorId, periodFrom, periodTo),
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
        video_stats: videoStatsResult.rows.map((r: VideoStatsRow) => ({
          video_filename: r.video_filename,
          impressions: Number(r.impressions) || 0,
          screen_time_seconds: Number(r.screen_time_seconds) || 0,
          completion_rate: Number(r.completion_rate) || 0,
          avg_duration_played: Number(r.avg_duration_played) || 0,
        })),
        period_breakdown: periodBreakdownResult.rows.map((r: PeriodBreakdownRow) => ({
          period: r.period,
          impressions: Number(r.impressions) || 0,
          screen_time_seconds: Number(r.screen_time_seconds) || 0,
          completion_rate: Number(r.completion_rate) || 0,
        })),
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

// =============================================================================
// GET /api/sponsor-portal/benchmark
// Benchmark intra-club (authentifie par token)
// =============================================================================

export const getSponsorPortalBenchmark = async (req: Request, res: Response): Promise<void> => {
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

    const result = await siteSponsorRepository.getBenchmark(validation.siteId, periodFrom, periodTo);
    const sponsors = result.rows.map((r: SiteBenchmarkRow, idx: number) => ({
      site_sponsor_id: r.site_sponsor_id,
      sponsor_name: r.sponsor_name,
      impressions: Number(r.impressions) || 0,
      screen_time_seconds: Number(r.screen_time_seconds) || 0,
      completion_rate: Number(r.completion_rate) || 0,
      active_days: Number(r.active_days) || 0,
      rank: idx + 1,
    }));

    type BenchmarkEntry = typeof sponsors[number];
    const total = sponsors.length || 1;
    const avgImpressions = sponsors.reduce((s: number, e: BenchmarkEntry) => s + e.impressions, 0) / total;
    const avgScreenTime = sponsors.reduce((s: number, e: BenchmarkEntry) => s + e.screen_time_seconds, 0) / total;
    const avgCompletion = sponsors.reduce((s: number, e: BenchmarkEntry) => s + e.completion_rate, 0) / total;
    const avgActiveDays = sponsors.reduce((s: number, e: BenchmarkEntry) => s + e.active_days, 0) / total;

    res.json({
      success: true,
      data: {
        current_sponsor_id: validation.siteSponsorId,
        period: { from: periodFrom, to: periodTo },
        sponsors,
        averages: {
          impressions: avgImpressions,
          screen_time_seconds: avgScreenTime,
          completion_rate: avgCompletion,
          active_days: avgActiveDays,
        },
        total_sponsors: sponsors.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching sponsor portal benchmark:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la recuperation du benchmark' });
  }
};

// =============================================================================
// GET /api/sponsor-portal/export-csv
// Export CSV des impressions (authentifie par token)
// =============================================================================

export const getSponsorPortalCsv = async (req: Request, res: Response): Promise<void> => {
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

    const [summary, dailyTrends, videoStatsResult, periodBreakdownResult] = await Promise.all([
      siteSponsorRepository.getStatsSummary(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getDailyTrends(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getStatsByVideo(validation.siteSponsorId, periodFrom, periodTo),
      siteSponsorRepository.getStatsByPeriod(validation.siteSponsorId, periodFrom, periodTo),
    ]);

    // Build CSV
    const lines: string[] = [];
    lines.push(`Rapport de visibilité — ${validation.sponsorName}`);
    lines.push(`Club: ${validation.clubName}`);
    lines.push(`Période: ${periodFrom} au ${periodTo}`);
    lines.push('');

    // Summary
    lines.push('=== RÉSUMÉ ===');
    lines.push('Métrique;Valeur');
    lines.push(`Passages;${summary.total_impressions}`);
    lines.push(`Temps d'écran (sec);${summary.total_screen_time_seconds}`);
    lines.push(`Taux de complétion (%);${summary.completion_rate}`);
    lines.push(`Spectateurs estimés;${summary.estimated_reach}`);
    lines.push(`Jours actifs;${summary.active_days}`);
    lines.push('');

    // Daily trends
    lines.push('=== TENDANCE QUOTIDIENNE ===');
    lines.push('Date;Passages;Temps écran (sec)');
    for (const t of dailyTrends) {
      lines.push(`${t.date};${t.impressions};${t.screen_time}`);
    }
    lines.push('');

    // Video stats
    lines.push('=== STATS PAR VIDÉO ===');
    lines.push('Vidéo;Passages;Temps écran (sec);Complétion (%);Durée moy. (sec)');
    for (const v of videoStatsResult.rows) {
      lines.push(`${v.video_filename};${v.impressions};${v.screen_time_seconds};${v.completion_rate};${v.avg_duration_played}`);
    }
    lines.push('');

    // Period breakdown
    lines.push('=== RÉPARTITION PAR PÉRIODE ===');
    lines.push('Période;Passages;Temps écran (sec);Complétion (%)');
    for (const p of periodBreakdownResult.rows) {
      lines.push(`${p.period};${p.impressions};${p.screen_time_seconds};${p.completion_rate}`);
    }

    const csv = lines.join('\n');
    const filename = `export-${validation.sponsorName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${periodFrom}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM for Excel UTF-8 compatibility
    res.send('\uFEFF' + csv);
  } catch (error) {
    logger.error('Error generating sponsor portal CSV:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la generation du CSV' });
  }
};
