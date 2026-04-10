/**
 * PDF Report Utilities — shared constants, types, and helper functions
 * used across all PDF report generators (advertiser, club, site-sponsor).
 */

import * as crypto from 'crypto';
import logger from '../../config/logger';

// chartjs-node-canvas is optional (requires native canvas module)
export let ChartJSNodeCanvas: typeof import('chartjs-node-canvas').ChartJSNodeCanvas | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ChartJSNodeCanvas = require('chartjs-node-canvas').ChartJSNodeCanvas;
} catch {
  logger.warn('chartjs-node-canvas not available — PDF charts will be skipped');
}

// ============================================================================
// Types
// ============================================================================

export interface ReportData {
  sponsor?: {
    id: string;
    name: string;
    logo_url?: string;
  };
  club?: {
    id: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
  };
  summary: {
    total_impressions: number;
    total_screen_time_seconds: number;
    completion_rate: number;
    estimated_reach: number;
    active_sites: number;
    active_days: number;
  };
  verified_impressions?: {
    verified_count: number;
    tv_on_rate: number;
    match_day_impressions: number;
    completion_rate: number;
  };
  by_video?: unknown[];
  by_site?: unknown[];
  by_period?: Record<string, number>;
  by_event_type?: Record<string, number>;
  trends: {
    daily: Array<{ date: string; impressions: number; screen_time: number }>;
  };
}

export interface PdfReportOptions {
  type: 'advertiser' | 'sponsor' | 'club';
  format?: 'a4' | 'letter';
  language?: 'fr' | 'en';
  includeSignature?: boolean;
}

// ============================================================================
// Brand colors constant (shared across all generators)
// ============================================================================

export const COLORS = {
  primary: '#1e3a8a', // Bleu fonce
  secondary: '#3b82f6', // Bleu clair
  accent: '#10b981', // Vert
  text: '#1f2937', // Gris fonce
  lightGray: '#f3f4f6',
  border: '#d1d5db',
};

// ============================================================================
// Formatting helpers
// ============================================================================

/**
 * Formate une date ISO en format francais lisible
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formate un nombre avec separateurs de milliers
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(num);
}

/**
 * Formate une duree en heures et minutes
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

// ============================================================================
// PDF drawing helpers
// ============================================================================

/**
 * Dessine une box KPI stylisee
 */
export function drawKPIBox(
  doc: typeof import('pdfkit').prototype,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  colors: any,
  subtitle?: string
): void {
  // Fond
  doc
    .rect(x, y, width, height)
    .fillAndStroke(colors.lightGray, colors.border);

  // Label
  doc
    .fontSize(10)
    .fillColor('#6b7280')
    .font('Helvetica')
    .text(label, x + 10, y + 15, { width: width - 20, align: 'left' });

  // Valeur
  doc
    .fontSize(24)
    .fillColor(colors.primary)
    .font('Helvetica-Bold')
    .text(value, x + 10, y + 40, { width: width - 20, align: 'left' });

  // Sous-titre optionnel
  if (subtitle) {
    doc
      .fontSize(9)
      .fillColor('#9ca3af')
      .font('Helvetica')
      .text(subtitle, x + 10, y + 72, { width: width - 20, align: 'left' });
  }
}

// ============================================================================
// Chart generation helpers
// ============================================================================

/**
 * Genere un graphique Chart.js des impressions quotidiennes
 */
export async function generateDailyImpressionsChart(
  dailyData: Array<{ date: string; impressions: number; screen_time: number }>,
  colors: any
): Promise<Buffer | null> {
  if (!ChartJSNodeCanvas) return null;
  const width = 800;
  const height = 400;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: 'white',
  });

  const configuration = {
    type: 'line' as const,
    data: {
      labels: dailyData.map(d => formatDate(d.date)),
      datasets: [
        {
          label: 'Impressions',
          data: dailyData.map(d => d.impressions),
          borderColor: colors.secondary,
          backgroundColor: `${colors.secondary}33`,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Évolution des impressions quotidiennes',
          font: {
            size: 16,
            weight: 'bold' as const,
          },
          color: colors.primary,
        },
        legend: {
          display: true,
          position: 'top' as const,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Nombre d\'impressions',
          },
        },
        x: {
          title: {
            display: true,
            text: 'Date',
          },
        },
      },
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration as any);
}

/**
 * Genere un graphique en camembert de la repartition par type d'evenement
 */
export async function generateEventTypePieChart(
  eventTypeData: Record<string, number>,
  colors: any
): Promise<Buffer | null> {
  if (!ChartJSNodeCanvas) return null;
  const width = 600;
  const height = 400;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: 'white',
  });

  const eventTypes = Object.keys(eventTypeData);
  const values = Object.values(eventTypeData);

  const chartColors = [
    '#3b82f6', // Bleu
    '#10b981', // Vert
    '#f59e0b', // Orange
    '#ef4444', // Rouge
    '#8b5cf6', // Violet
    '#ec4899', // Rose
  ];

  const configuration = {
    type: 'doughnut' as const,
    data: {
      labels: eventTypes.map(t => {
        const labels: Record<string, string> = {
          match: 'Match',
          training: 'Entraînement',
          tournament: 'Tournoi',
          other: 'Autre',
        };
        return labels[t] || t;
      }),
      datasets: [
        {
          data: values,
          backgroundColor: chartColors.slice(0, eventTypes.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Répartition par type d\'événement',
          font: {
            size: 16,
            weight: 'bold' as const,
          },
          color: colors.primary,
        },
        legend: {
          display: true,
          position: 'right' as const,
        },
      },
    },
  };

  return chartJSNodeCanvas.renderToBuffer(configuration as any);
}

// ============================================================================
// Digital signature
// ============================================================================

/**
 * Genere une signature numerique pour le certificat
 */
export function generateDigitalSignature(data: ReportData, _options: PdfReportOptions): string {
  const signatureData = {
    sponsor: data.sponsor?.id,
    period: `${data.period.from}_${data.period.to}`,
    impressions: data.summary?.total_impressions,
    timestamp: new Date().toISOString(),
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(signatureData))
    .digest('hex');

  // Format lisible (blocs de 8 caracteres)
  const formatted = hash.match(/.{1,8}/g)?.join('-') || hash;

  return `NEOPRO-CERT-${formatted.substring(0, 47).toUpperCase()}`;
}
