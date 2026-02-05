/**
 * Benchmark Controller
 *
 * Endpoints pour les benchmarks anonymisés
 */

import { Response } from 'express';
import { AuthRequest } from '../types';
import { benchmarkService } from '../services/benchmark.service';
import logger from '../config/logger';
import { memoryCache } from '../services/memory-cache.service';

/**
 * Calcule le benchmark pour un site
 * Résultat cachée pendant 60 secondes (les benchmarks changent lentement)
 */
export const getSiteBenchmark = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const {
      startDate,
      endDate,
      sport,
      region,
      sizeCategory,
    } = req.query;

    // Default: last 30 days
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate
      ? String(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check cache first (60 seconds TTL)
    const cacheKey = `benchmark:site:${siteId}:${start}:${end}:${sport || ''}:${region || ''}:${sizeCategory || ''}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const benchmark = await benchmarkService.calculateBenchmark(
      siteId,
      { start, end },
      {
        sport: sport ? String(sport) : undefined,
        region: region ? String(region) : undefined,
        sizeCategory: sizeCategory as 'small' | 'medium' | 'large' | undefined,
      }
    );

    const response = {
      success: true,
      data: benchmark,
    };

    // Cache for 60 seconds
    memoryCache.set(cacheKey, response, 60000);

    return res.json(response);
  } catch (error) {
    logger.error('Error calculating benchmark:', error);
    return res.status(500).json({ error: 'Failed to calculate benchmark' });
  }
};

/**
 * Récupère le résumé global des benchmarks (admin)
 */
export const getGlobalBenchmark = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    // Default: last 30 days
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate
      ? String(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const summary = await benchmarkService.getGlobalBenchmarkSummary({ start, end });

    return res.json({
      success: true,
      data: {
        period: { start, end },
        ...summary,
      },
    });
  } catch (error) {
    logger.error('Error getting global benchmark:', error);
    return res.status(500).json({ error: 'Failed to get global benchmark' });
  }
};

/**
 * Compare plusieurs sites entre eux (admin)
 */
export const compareSites = async (req: AuthRequest, res: Response) => {
  try {
    const { siteIds, startDate, endDate } = req.query;

    if (!siteIds) {
      return res.status(400).json({ error: 'siteIds parameter required' });
    }

    const ids = String(siteIds).split(',');
    if (ids.length < 2 || ids.length > 10) {
      return res.status(400).json({ error: 'Must compare between 2 and 10 sites' });
    }

    // Default: last 30 days
    const end = endDate ? String(endDate) : new Date().toISOString().split('T')[0];
    const start = startDate
      ? String(startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const comparisons = await Promise.all(
      ids.map(siteId => benchmarkService.calculateBenchmark(siteId, { start, end }))
    );

    return res.json({
      success: true,
      data: {
        period: { start, end },
        sites: comparisons,
      },
    });
  } catch (error) {
    logger.error('Error comparing sites:', error);
    return res.status(500).json({ error: 'Failed to compare sites' });
  }
};
