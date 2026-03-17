/**
 * Service d'export Excel avancé pour les analytics
 * Génère des fichiers Excel multi-feuilles avec graphiques et mise en forme conditionnelle
 */
import ExcelJS from 'exceljs';
import { query } from '../config/database';
import { ALL_SPONSOR_CATEGORIES } from '../utils/sponsor-categories';


export interface ExcelExportOptions {
  siteId?: string;
  advertiserId?: string;
  startDate: string;
  endDate: string;
  includeCharts?: boolean;
  type: 'club' | 'advertiser' | 'overview';
}

interface DailyStats {
  date: string;
  videos_played: number;
  screen_time_seconds: number;
  unique_videos: number;
  avg_completion_rate: number;
}

interface CategoryStats {
  category: string;
  total_plays: number;
  total_screen_time: number;
  percentage: number;
}

interface SiteStats {
  site_id: string;
  site_name: string;
  club_name: string;
  total_videos: number;
  total_screen_time: number;
  days_active: number;
  avg_daily_videos: number;
}

class ExcelExportService {
  private readonly COLORS = {
    primary: '2563EB',
    success: '16A34A',
    warning: 'F59E0B',
    danger: 'DC2626',
    gray: '6B7280',
    lightGray: 'F3F4F6',
    white: 'FFFFFF',
  };

  /**
   * Génère un export Excel complet pour un club
   */
  async generateClubExport(options: ExcelExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Neopro Analytics';
    workbook.created = new Date();

    const { siteId, startDate, endDate } = options;

    // Récupérer les données
    const [siteInfo, dailyStats, categoryStats, topVideos] = await Promise.all([
      this.getSiteInfo(siteId!),
      this.getDailyStats(siteId!, startDate, endDate),
      this.getCategoryStats(siteId!, startDate, endDate),
      this.getTopVideos(siteId!, startDate, endDate),
    ]);

    // Feuille 1: Résumé
    this.createSummarySheet(workbook, siteInfo, dailyStats, startDate, endDate);

    // Feuille 2: Détail journalier
    this.createDailyStatsSheet(workbook, dailyStats);

    // Feuille 3: Catégories
    this.createCategoriesSheet(workbook, categoryStats);

    // Feuille 4: Top vidéos
    this.createTopVideosSheet(workbook, topVideos);

    // Générer le buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Génère un export Excel complet pour un annonceur
   */
  async generateAdvertiserExport(options: ExcelExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Neopro Analytics';
    workbook.created = new Date();

    const { advertiserId, startDate, endDate } = options;

    // Récupérer les données
    const [advertiserInfo, dailyStats, siteStats, videoStats] = await Promise.all([
      this.getAdvertiserInfo(advertiserId!),
      this.getAdvertiserDailyStats(advertiserId!, startDate, endDate),
      this.getAdvertiserSiteStats(advertiserId!, startDate, endDate),
      this.getAdvertiserVideoStats(advertiserId!, startDate, endDate),
    ]);

    // Feuille 1: Résumé annonceur
    this.createAdvertiserSummarySheet(workbook, advertiserInfo, dailyStats, startDate, endDate);

    // Feuille 2: Performance par site
    this.createSitePerformanceSheet(workbook, siteStats);

    // Feuille 3: Performance par vidéo
    this.createVideoPerformanceSheet(workbook, videoStats);

    // Feuille 4: Évolution journalière
    this.createAdvertiserDailySheet(workbook, dailyStats);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Génère un export Excel overview multi-sites
   */
  async generateOverviewExport(options: ExcelExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Neopro Analytics';
    workbook.created = new Date();

    const { startDate, endDate } = options;

    // Récupérer les données
    const [allSites, globalStats, topSites] = await Promise.all([
      this.getAllSitesStats(startDate, endDate),
      this.getGlobalStats(startDate, endDate),
      this.getTopSites(startDate, endDate),
    ]);

    // Feuille 1: Vue d'ensemble
    this.createOverviewSummarySheet(workbook, globalStats, startDate, endDate);

    // Feuille 2: Tous les sites
    this.createAllSitesSheet(workbook, allSites);

    // Feuille 3: Top performers
    this.createTopPerformersSheet(workbook, topSites);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ============================================================================
  // Création des feuilles
  // ============================================================================

  private createSummarySheet(
    workbook: ExcelJS.Workbook,
    siteInfo: any,
    dailyStats: DailyStats[],
    startDate: string,
    endDate: string
  ): void {
    const sheet = workbook.addWorksheet('Résumé', {
      properties: { tabColor: { argb: this.COLORS.primary } },
    });

    // Titre
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Rapport Analytics - ${siteInfo?.club_name || 'Club'}`;
    titleCell.font = { size: 18, bold: true, color: { argb: this.COLORS.primary } };
    titleCell.alignment = { horizontal: 'center' };

    // Période
    sheet.mergeCells('A2:F2');
    const periodCell = sheet.getCell('A2');
    periodCell.value = `Période: ${startDate} au ${endDate}`;
    periodCell.font = { size: 12, italic: true, color: { argb: this.COLORS.gray } };
    periodCell.alignment = { horizontal: 'center' };

    // Calculs
    const totalVideos = dailyStats.reduce((sum, d) => sum + (d.videos_played || 0), 0);
    const totalScreenTime = dailyStats.reduce((sum, d) => sum + (d.screen_time_seconds || 0), 0);
    const avgCompletion = dailyStats.length > 0
      ? dailyStats.reduce((sum, d) => sum + (d.avg_completion_rate || 0), 0) / dailyStats.length
      : 0;
    const daysActive = dailyStats.filter(d => d.videos_played > 0).length;

    // KPIs
    const kpis = [
      { label: 'Total lectures', value: totalVideos, format: '#,##0' },
      { label: 'Temps écran total', value: this.formatDuration(totalScreenTime), format: '@' },
      { label: 'Jours actifs', value: daysActive, format: '#,##0' },
      { label: 'Taux de complétion moyen', value: avgCompletion / 100, format: '0.0%' },
    ];

    const row = 4;
    kpis.forEach((kpi, i) => {
      const labelCell = sheet.getCell(`B${row + i}`);
      labelCell.value = kpi.label;
      labelCell.font = { bold: true };
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.lightGray },
      };

      const valueCell = sheet.getCell(`C${row + i}`);
      valueCell.value = kpi.value;
      valueCell.numFmt = kpi.format;
      valueCell.font = { size: 14, bold: true, color: { argb: this.COLORS.primary } };
      valueCell.alignment = { horizontal: 'center' };
    });

    // Ajuster les largeurs
    sheet.columns = [
      { width: 5 },
      { width: 25 },
      { width: 20 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];
  }

  private createDailyStatsSheet(workbook: ExcelJS.Workbook, dailyStats: DailyStats[]): void {
    const sheet = workbook.addWorksheet('Évolution journalière', {
      properties: { tabColor: { argb: this.COLORS.success } },
    });

    // En-têtes
    const headers = ['Date', 'Lectures', 'Temps écran', 'Vidéos uniques', 'Taux complétion'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.primary },
      };
      cell.alignment = { horizontal: 'center' };
    });

    // Données avec mise en forme conditionnelle
    dailyStats.forEach((day) => {
      const row = sheet.addRow([
        day.date,
        day.videos_played || 0,
        this.formatDuration(day.screen_time_seconds || 0),
        day.unique_videos || 0,
        (day.avg_completion_rate || 0) / 100,
      ]);

      // Mise en forme conditionnelle sur les lectures
      const videosCell = row.getCell(2);
      if ((day.videos_played || 0) >= 100) {
        videosCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'DCFCE7' }, // Vert clair
        };
      } else if ((day.videos_played || 0) < 20) {
        videosCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FEE2E2' }, // Rouge clair
        };
      }

      // Format pourcentage
      row.getCell(5).numFmt = '0.0%';
    });

    // Ligne de totaux
    const totalRow = sheet.addRow([
      'TOTAL',
      dailyStats.reduce((sum, d) => sum + (d.videos_played || 0), 0),
      this.formatDuration(dailyStats.reduce((sum, d) => sum + (d.screen_time_seconds || 0), 0)),
      '-',
      dailyStats.length > 0
        ? dailyStats.reduce((sum, d) => sum + (d.avg_completion_rate || 0), 0) / dailyStats.length / 100
        : 0,
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(5).numFmt = '0.0%';

    // Ajuster les largeurs
    sheet.columns = [
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    // Filtre automatique
    sheet.autoFilter = {
      from: 'A1',
      to: `E${dailyStats.length + 1}`,
    };
  }

  private createCategoriesSheet(workbook: ExcelJS.Workbook, categoryStats: CategoryStats[]): void {
    const sheet = workbook.addWorksheet('Catégories', {
      properties: { tabColor: { argb: this.COLORS.warning } },
    });

    // En-têtes
    const headers = ['Catégorie', 'Lectures', 'Temps écran', 'Part (%)'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.warning },
      };
      cell.alignment = { horizontal: 'center' };
    });

    // Données
    categoryStats.forEach((cat) => {
      const row = sheet.addRow([
        cat.category,
        cat.total_plays,
        this.formatDuration(cat.total_screen_time),
        cat.percentage / 100,
      ]);
      row.getCell(4).numFmt = '0.0%';

      // Barre de données pour le pourcentage
      const percentCell = row.getCell(4);
      percentCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FEF3C7' },
      };
    });

    sheet.columns = [
      { width: 20 },
      { width: 12 },
      { width: 15 },
      { width: 12 },
    ];
  }

  private createTopVideosSheet(workbook: ExcelJS.Workbook, topVideos: any[]): void {
    const sheet = workbook.addWorksheet('Top Vidéos', {
      properties: { tabColor: { argb: this.COLORS.danger } },
    });

    // En-têtes
    const headers = ['Rang', 'Vidéo', 'Catégorie', 'Lectures', 'Temps écran'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.danger },
      };
      cell.alignment = { horizontal: 'center' };
    });

    // Données
    topVideos.forEach((video, index) => {
      const row = sheet.addRow([
        index + 1,
        video.video_name || video.video_filename,
        video.category || 'N/A',
        video.play_count,
        this.formatDuration(video.total_screen_time || 0),
      ]);

      // Médailles pour le top 3
      const rankCell = row.getCell(1);
      if (index === 0) {
        rankCell.value = '🥇 1';
        rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
      } else if (index === 1) {
        rankCell.value = '🥈 2';
        rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5E7EB' } };
      } else if (index === 2) {
        rankCell.value = '🥉 3';
        rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FED7AA' } };
      }
    });

    sheet.columns = [
      { width: 8 },
      { width: 40 },
      { width: 15 },
      { width: 12 },
      { width: 15 },
    ];
  }

  private createAdvertiserSummarySheet(
    workbook: ExcelJS.Workbook,
    advertiserInfo: any,
    dailyStats: any[],
    startDate: string,
    endDate: string
  ): void {
    const sheet = workbook.addWorksheet('Résumé', {
      properties: { tabColor: { argb: this.COLORS.primary } },
    });

    // Titre
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Rapport Annonceur - ${advertiserInfo?.name || 'Annonceur'}`;
    titleCell.font = { size: 18, bold: true, color: { argb: this.COLORS.primary } };
    titleCell.alignment = { horizontal: 'center' };

    // Période
    sheet.mergeCells('A2:F2');
    const periodCell = sheet.getCell('A2');
    periodCell.value = `Période: ${startDate} au ${endDate}`;
    periodCell.font = { size: 12, italic: true };
    periodCell.alignment = { horizontal: 'center' };

    // Calculs
    const totalImpressions = dailyStats.reduce((sum, d) => sum + (d.impressions || 0), 0);
    const totalScreenTime = dailyStats.reduce((sum, d) => sum + (d.screen_time_seconds || 0), 0);
    const uniqueSites = new Set(dailyStats.map(d => d.site_id)).size;

    // KPIs
    const kpis = [
      { label: 'Total impressions', value: totalImpressions },
      { label: 'Temps écran total', value: this.formatDuration(totalScreenTime) },
      { label: 'Sites diffuseurs', value: uniqueSites },
      { label: 'Moyenne/jour', value: Math.round(totalImpressions / Math.max(dailyStats.length, 1)) },
    ];

    const row = 4;
    kpis.forEach((kpi, i) => {
      sheet.getCell(`B${row + i}`).value = kpi.label;
      sheet.getCell(`B${row + i}`).font = { bold: true };
      sheet.getCell(`C${row + i}`).value = kpi.value;
      sheet.getCell(`C${row + i}`).font = { size: 14, bold: true, color: { argb: this.COLORS.primary } };
    });

    sheet.columns = [
      { width: 5 },
      { width: 25 },
      { width: 20 },
    ];
  }

  private createSitePerformanceSheet(workbook: ExcelJS.Workbook, siteStats: SiteStats[]): void {
    const sheet = workbook.addWorksheet('Performance par site', {
      properties: { tabColor: { argb: this.COLORS.success } },
    });

    const headers = ['Site', 'Club', 'Impressions', 'Temps écran', 'Jours actifs', 'Moy./jour'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.success },
      };
    });

    siteStats.forEach((site) => {
      sheet.addRow([
        site.site_name,
        site.club_name,
        site.total_videos,
        this.formatDuration(site.total_screen_time),
        site.days_active,
        Math.round(site.avg_daily_videos * 10) / 10,
      ]);
    });

    sheet.columns = [
      { width: 25 },
      { width: 25 },
      { width: 12 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];
  }

  private createVideoPerformanceSheet(workbook: ExcelJS.Workbook, videoStats: any[]): void {
    const sheet = workbook.addWorksheet('Performance par vidéo', {
      properties: { tabColor: { argb: this.COLORS.warning } },
    });

    const headers = ['Vidéo', 'Impressions', 'Temps écran', 'Sites diffuseurs'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.warning },
      };
    });

    videoStats.forEach((video) => {
      sheet.addRow([
        video.video_name || video.filename,
        video.impressions,
        this.formatDuration(video.screen_time_seconds || 0),
        video.site_count,
      ]);
    });

    sheet.columns = [
      { width: 40 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
    ];
  }

  private createAdvertiserDailySheet(workbook: ExcelJS.Workbook, dailyStats: any[]): void {
    const sheet = workbook.addWorksheet('Évolution journalière', {
      properties: { tabColor: { argb: this.COLORS.gray } },
    });

    const headers = ['Date', 'Impressions', 'Temps écran'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.gray },
      };
    });

    // Grouper par date
    const byDate = new Map<string, { impressions: number; screen_time: number }>();
    dailyStats.forEach((d) => {
      const existing = byDate.get(d.date) || { impressions: 0, screen_time: 0 };
      existing.impressions += d.impressions || 0;
      existing.screen_time += d.screen_time_seconds || 0;
      byDate.set(d.date, existing);
    });

    Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([date, data]) => {
        sheet.addRow([date, data.impressions, this.formatDuration(data.screen_time)]);
      });

    sheet.columns = [
      { width: 12 },
      { width: 12 },
      { width: 15 },
    ];
  }

  private createOverviewSummarySheet(
    workbook: ExcelJS.Workbook,
    globalStats: any,
    startDate: string,
    endDate: string
  ): void {
    const sheet = workbook.addWorksheet('Vue d\'ensemble', {
      properties: { tabColor: { argb: this.COLORS.primary } },
    });

    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Rapport Global - Tous les Sites';
    titleCell.font = { size: 18, bold: true, color: { argb: this.COLORS.primary } };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:F2');
    sheet.getCell('A2').value = `Période: ${startDate} au ${endDate}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    const kpis = [
      { label: 'Sites actifs', value: globalStats.active_sites },
      { label: 'Total lectures', value: globalStats.total_videos },
      { label: 'Temps écran total', value: this.formatDuration(globalStats.total_screen_time) },
      { label: 'Moyenne lectures/site', value: Math.round(globalStats.avg_videos_per_site) },
    ];

    const row = 4;
    kpis.forEach((kpi, i) => {
      sheet.getCell(`B${row + i}`).value = kpi.label;
      sheet.getCell(`B${row + i}`).font = { bold: true };
      sheet.getCell(`C${row + i}`).value = kpi.value;
      sheet.getCell(`C${row + i}`).font = { size: 14, bold: true };
    });

    sheet.columns = [{ width: 5 }, { width: 25 }, { width: 20 }];
  }

  private createAllSitesSheet(workbook: ExcelJS.Workbook, allSites: SiteStats[]): void {
    const sheet = workbook.addWorksheet('Tous les sites', {
      properties: { tabColor: { argb: this.COLORS.success } },
    });

    const headers = ['Site', 'Club', 'Lectures', 'Temps écran', 'Jours actifs', 'Moy./jour'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.success },
      };
    });

    allSites.forEach((site) => {
      const row = sheet.addRow([
        site.site_name,
        site.club_name,
        site.total_videos,
        this.formatDuration(site.total_screen_time),
        site.days_active,
        Math.round(site.avg_daily_videos * 10) / 10,
      ]);

      // Mise en forme conditionnelle
      if (site.days_active === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FEE2E2' },
          };
        });
      }
    });

    sheet.columns = [
      { width: 25 },
      { width: 25 },
      { width: 12 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];

    sheet.autoFilter = { from: 'A1', to: `F${allSites.length + 1}` };
  }

  private createTopPerformersSheet(workbook: ExcelJS.Workbook, topSites: SiteStats[]): void {
    const sheet = workbook.addWorksheet('Top Performers', {
      properties: { tabColor: { argb: this.COLORS.warning } },
    });

    const headers = ['Rang', 'Club', 'Lectures', 'Temps écran'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.COLORS.warning },
      };
    });

    topSites.slice(0, 10).forEach((site, index) => {
      const row = sheet.addRow([
        index + 1,
        site.club_name,
        site.total_videos,
        this.formatDuration(site.total_screen_time),
      ]);

      if (index < 3) {
        const medals = ['🥇', '🥈', '🥉'];
        row.getCell(1).value = `${medals[index]} ${index + 1}`;
      }
    });

    sheet.columns = [{ width: 8 }, { width: 30 }, { width: 12 }, { width: 15 }];
  }

  // ============================================================================
  // Requêtes de données
  // ============================================================================

  private async getSiteInfo(siteId: string): Promise<any> {
    const result = await query(
      'SELECT id, site_name, club_name FROM sites WHERE id = $1',
      [siteId]
    );
    return result.rows[0];
  }

  private async getDailyStats(siteId: string, startDate: string, endDate: string): Promise<DailyStats[]> {
    const result = await query(
      `SELECT
        date::text,
        videos_played,
        screen_time_seconds,
        unique_videos,
        COALESCE(completion_rate, 0) as avg_completion_rate
      FROM club_daily_stats_live
      WHERE site_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date`,
      [siteId, startDate, endDate]
    );
    return result.rows.map(row => ({
      date: String(row.date),
      videos_played: Number(row.videos_played) || 0,
      screen_time_seconds: Number(row.screen_time_seconds) || 0,
      unique_videos: Number(row.unique_videos) || 0,
      avg_completion_rate: Number(row.avg_completion_rate) || 0,
    }));
  }

  private async getCategoryStats(siteId: string, startDate: string, endDate: string): Promise<CategoryStats[]> {
    const result = await query(
      `SELECT
        COALESCE(category, 'Autre') as category,
        COUNT(*) as total_plays,
        COALESCE(SUM(duration_seconds), 0) as total_screen_time
      FROM video_plays
      WHERE site_id = $1 AND played_at >= $2 AND played_at <= $3::date + 1
      GROUP BY category
      ORDER BY total_plays DESC`,
      [siteId, startDate, endDate]
    );

    const total = result.rows.reduce((sum, r) => sum + parseInt(String(r.total_plays)), 0);
    return result.rows.map((r) => ({
      category: String(r.category),
      total_plays: parseInt(String(r.total_plays)),
      total_screen_time: parseInt(String(r.total_screen_time)) || 0,
      percentage: total > 0 ? (parseInt(String(r.total_plays)) / total) * 100 : 0,
    }));
  }

  private async getTopVideos(siteId: string, startDate: string, endDate: string): Promise<any[]> {
    const result = await query(
      `SELECT
        video_filename as video_name,
        category,
        COUNT(*) as play_count,
        COALESCE(SUM(duration_seconds), 0) as total_screen_time
      FROM video_plays
      WHERE site_id = $1 AND played_at >= $2 AND played_at <= $3::date + 1
      GROUP BY video_filename, category
      ORDER BY play_count DESC
      LIMIT 20`,
      [siteId, startDate, endDate]
    );
    return result.rows;
  }

  private async getAdvertiserInfo(advertiserId: string): Promise<any> {
    const result = await query(
      'SELECT id, name FROM advertisers WHERE id = $1',
      [advertiserId]
    );
    return result.rows[0];
  }

  private async getAdvertiserDailyStats(advertiserId: string, startDate: string, endDate: string): Promise<any[]> {
    // advertiser_daily_stats_live is keyed by (video_id, site_id, date)
    // We need to join through advertiser_videos to get stats for a specific advertiser
    const result = await query(
      `SELECT
        ads.date::text,
        ads.site_id,
        ads.total_impressions as impressions,
        ads.total_duration_seconds as screen_time_seconds
      FROM advertiser_daily_stats_live ads
      JOIN advertiser_videos av ON av.video_id = ads.video_id
      WHERE av.advertiser_id = $1 AND ads.date >= $2 AND ads.date <= $3
      ORDER BY ads.date`,
      [advertiserId, startDate, endDate]
    );
    return result.rows;
  }

  private async getAdvertiserSiteStats(advertiserId: string, startDate: string, endDate: string): Promise<SiteStats[]> {
    // advertiser_daily_stats_live is keyed by (video_id, site_id, date)
    // Join through advertiser_videos to resolve the advertiser
    const result = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COALESCE(SUM(ads.total_impressions), 0) as total_videos,
        COALESCE(SUM(ads.total_duration_seconds), 0) as total_screen_time,
        COUNT(DISTINCT ads.date) as days_active,
        COALESCE(AVG(ads.total_impressions), 0) as avg_daily_videos
      FROM sites s
      LEFT JOIN advertiser_daily_stats_live ads ON ads.site_id = s.id
        AND ads.date >= $2
        AND ads.date <= $3
      LEFT JOIN advertiser_videos av ON av.video_id = ads.video_id
        AND av.advertiser_id = $1
      WHERE EXISTS (
        SELECT 1 FROM advertiser_sites asites
        WHERE asites.site_id = s.id AND asites.advertiser_id = $1
      )
        AND (ads.video_id IS NULL OR av.video_id IS NOT NULL)
      GROUP BY s.id
      ORDER BY total_videos DESC`,
      [advertiserId, startDate, endDate]
    );
    return result.rows.map(row => ({
      site_id: String(row.site_id),
      site_name: String(row.site_name || ''),
      club_name: String(row.club_name || ''),
      total_videos: Number(row.total_videos) || 0,
      total_screen_time: Number(row.total_screen_time) || 0,
      days_active: Number(row.days_active) || 0,
      avg_daily_videos: Number(row.avg_daily_videos) || 0,
    }));
  }

  private async getAdvertiserVideoStats(advertiserId: string, startDate: string, endDate: string): Promise<any[]> {
    const result = await query(
      `SELECT
        v.filename as video_name,
        COUNT(vp.id) as impressions,
        COALESCE(SUM(vp.duration_played), 0) as screen_time_seconds,
        COUNT(DISTINCT vp.site_id) as site_count
      FROM videos v
      JOIN advertiser_videos av ON av.video_id = v.id AND av.advertiser_id = $1
      LEFT JOIN video_plays vp ON vp.video_id = v.id
        AND vp.category IN ${ALL_SPONSOR_CATEGORIES}
        AND vp.played_at >= $2
        AND vp.played_at <= $3::date + 1
      GROUP BY v.id, v.filename
      ORDER BY impressions DESC`,
      [advertiserId, startDate, endDate]
    );
    return result.rows;
  }

  private async getAllSitesStats(startDate: string, endDate: string): Promise<SiteStats[]> {
    const result = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COALESCE(SUM(cds.videos_played), 0) as total_videos,
        COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time,
        COUNT(DISTINCT CASE WHEN cds.videos_played > 0 THEN cds.date END) as days_active,
        COALESCE(AVG(cds.videos_played), 0) as avg_daily_videos
      FROM sites s
      LEFT JOIN club_daily_stats_live cds ON cds.site_id = s.id
        AND cds.date >= $1
        AND cds.date <= $2
      GROUP BY s.id
      ORDER BY total_videos DESC`,
      [startDate, endDate]
    );
    return result.rows.map(row => ({
      site_id: String(row.site_id),
      site_name: String(row.site_name || ''),
      club_name: String(row.club_name || ''),
      total_videos: Number(row.total_videos) || 0,
      total_screen_time: Number(row.total_screen_time) || 0,
      days_active: Number(row.days_active) || 0,
      avg_daily_videos: Number(row.avg_daily_videos) || 0,
    }));
  }

  private async getGlobalStats(startDate: string, endDate: string): Promise<any> {
    const result = await query(
      `SELECT
        COUNT(DISTINCT CASE WHEN cds.videos_played > 0 THEN cds.site_id END) as active_sites,
        COALESCE(SUM(cds.videos_played), 0) as total_videos,
        COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time,
        COALESCE(AVG(cds.videos_played), 0) as avg_videos_per_site
      FROM club_daily_stats_live cds
      WHERE cds.date >= $1 AND cds.date <= $2`,
      [startDate, endDate]
    );
    return result.rows[0];
  }

  private async getTopSites(startDate: string, endDate: string): Promise<SiteStats[]> {
    const result = await query(
      `SELECT
        s.id as site_id,
        s.site_name,
        s.club_name,
        COALESCE(SUM(cds.videos_played), 0) as total_videos,
        COALESCE(SUM(cds.screen_time_seconds), 0) as total_screen_time,
        COUNT(DISTINCT cds.date) as days_active,
        COALESCE(AVG(cds.videos_played), 0) as avg_daily_videos
      FROM sites s
      JOIN club_daily_stats_live cds ON cds.site_id = s.id
        AND cds.date >= $1
        AND cds.date <= $2
      GROUP BY s.id
      ORDER BY total_videos DESC
      LIMIT 10`,
      [startDate, endDate]
    );
    return result.rows.map(row => ({
      site_id: String(row.site_id),
      site_name: String(row.site_name || ''),
      club_name: String(row.club_name || ''),
      total_videos: Number(row.total_videos) || 0,
      total_screen_time: Number(row.total_screen_time) || 0,
      days_active: Number(row.days_active) || 0,
      avg_daily_videos: Number(row.avg_daily_videos) || 0,
    }));
  }

  // ============================================================================
  // Utilitaires
  // ============================================================================

  private formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0h00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
}

export const excelExportService = new ExcelExportService();
export default excelExportService;
