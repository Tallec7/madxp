import crypto from 'crypto';
import { query } from '../config/database';
import { uploadFileToFtp, isFtpConfigured, getFtpPublicUrl } from '../config/ftp-storage';
import { uploadFile, getPublicUrl } from '../config/supabase';
import logger from '../config/logger';

export interface ProofUploadResult {
  success: boolean;
  url: string;
  storagePath: string;
  checksum: string;
  fileSize: number;
}

export interface ProofOfBroadcast {
  id: string;
  site_id: string;
  screenshot_url: string;
  storage_path: string;
  checksum: string;
  timestamp_captured: Date;
  triggered_by: 'manual' | 'scheduled' | 'command';
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ProofWithSiteInfo extends ProofOfBroadcast {
  site_name: string;
  club_name: string;
}

class ProofService {
  private readonly STORAGE_FOLDER = 'screenshots';
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private tableExists: boolean | null = null;

  /**
   * Vérifie si la table proof_of_broadcasts existe
   * Cache le résultat pour éviter des requêtes répétées
   */
  private async checkTableExists(): Promise<boolean> {
    if (this.tableExists !== null) {
      return this.tableExists;
    }

    try {
      const result = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'proof_of_broadcasts'
        ) as exists
      `);
      this.tableExists = result.rows[0]?.exists === true;
      if (!this.tableExists) {
        logger.warn('[ProofService] Table proof_of_broadcasts does not exist - feature disabled');
      }
      return this.tableExists;
    } catch (error) {
      logger.error('[ProofService] Error checking table existence:', error);
      this.tableExists = false;
      return false;
    }
  }

  /**
   * Upload une capture d'écran vers le cloud storage
   */
  async uploadProof(
    siteId: string,
    buffer: Buffer,
    originalFilename: string,
    checksum?: string
  ): Promise<ProofUploadResult> {
    // Calculer le checksum si non fourni
    const actualChecksum = checksum || crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    // Vérifier la taille
    if (buffer.length > this.MAX_FILE_SIZE) {
      throw new Error(`Fichier trop volumineux (${Math.round(buffer.length / 1024 / 1024)}MB > 10MB)`);
    }

    // Générer un nom de fichier unique
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.getExtension(originalFilename);
    const sanitizedFilename = `proof_${siteId.substring(0, 8)}_${timestamp}${extension}`;
    const storagePath = `${this.STORAGE_FOLDER}/${sanitizedFilename}`;

    let url: string;

    // Upload vers FTP ou Supabase
    if (isFtpConfigured()) {
      logger.info('[ProofService] Uploading to FTP', { storagePath });
      await uploadFileToFtp(buffer, storagePath, this.getMimeType(extension));
      url = getFtpPublicUrl(storagePath);
    } else {
      logger.info('[ProofService] Uploading to Supabase', { storagePath });
      await uploadFile(buffer, storagePath, this.getMimeType(extension));
      url = getPublicUrl(storagePath);
    }

    logger.info('[ProofService] Upload successful', {
      siteId,
      url,
      size: buffer.length,
      checksum: actualChecksum.substring(0, 16) + '...'
    });

    return {
      success: true,
      url,
      storagePath,
      checksum: actualChecksum,
      fileSize: buffer.length,
    };
  }

  /**
   * Enregistre une preuve en base de données
   */
  async saveProofRecord(
    siteId: string,
    uploadResult: ProofUploadResult,
    triggeredBy: 'manual' | 'scheduled' | 'command',
    metadata: Record<string, unknown> = {}
  ): Promise<ProofOfBroadcast> {
    const result = await query(
      `INSERT INTO proof_of_broadcasts
       (site_id, screenshot_url, storage_path, checksum, timestamp_captured, triggered_by, metadata)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       RETURNING *`,
      [
        siteId,
        uploadResult.url,
        uploadResult.storagePath,
        uploadResult.checksum,
        triggeredBy,
        JSON.stringify({
          ...metadata,
          fileSize: uploadResult.fileSize,
        }),
      ]
    );

    return result.rows[0] as unknown as ProofOfBroadcast;
  }

  /**
   * Récupère les preuves pour un site
   */
  async getProofsForSite(
    siteId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ proofs: ProofOfBroadcast[]; total: number }> {
    // Vérifier si la table existe
    if (!(await this.checkTableExists())) {
      return { proofs: [], total: 0 };
    }

    const countResult = await query(
      'SELECT COUNT(*) as count FROM proof_of_broadcasts WHERE site_id = $1',
      [siteId]
    );
    const countRow = countResult.rows[0] as { count: string };
    const total = parseInt(countRow.count, 10);

    const result = await query(
      `SELECT * FROM proof_of_broadcasts
       WHERE site_id = $1
       ORDER BY timestamp_captured DESC
       LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );

    return {
      proofs: result.rows as unknown as ProofOfBroadcast[],
      total,
    };
  }

  /**
   * Récupère une preuve par ID
   */
  async getProofById(proofId: string): Promise<ProofWithSiteInfo | null> {
    // Vérifier si la table existe
    if (!(await this.checkTableExists())) {
      return null;
    }

    const result = await query(
      `SELECT p.*, s.site_name, s.club_name
       FROM proof_of_broadcasts p
       JOIN sites s ON s.id = p.site_id
       WHERE p.id = $1`,
      [proofId]
    );

    return (result.rows[0] as unknown as ProofWithSiteInfo) || null;
  }

  /**
   * Supprime les anciennes preuves (rétention 90 jours par défaut)
   */
  async cleanupOldProofs(retentionDays: number = 90): Promise<number> {
    // Vérifier si la table existe
    if (!(await this.checkTableExists())) {
      return 0;
    }

    const result = await query(
      `DELETE FROM proof_of_broadcasts
       WHERE timestamp_captured < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [retentionDays]
    );

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      logger.info('[ProofService] Cleaned up old proofs', { deletedCount, retentionDays });
    }

    return deletedCount;
  }

  /**
   * Récupère les stats de preuves pour tous les sites
   */
  async getProofStats(): Promise<Array<{
    site_id: string;
    site_name: string;
    club_name: string;
    total_proofs: number;
    last_proof_at: Date | null;
    proofs_last_7_days: number;
    proofs_last_30_days: number;
  }>> {
    // Vérifier si la table existe
    if (!(await this.checkTableExists())) {
      return [];
    }

    try {
      const result = await query('SELECT * FROM proof_stats_by_site ORDER BY last_proof_at DESC NULLS LAST');
      return result.rows as unknown as Array<{
        site_id: string;
        site_name: string;
        club_name: string;
        total_proofs: number;
        last_proof_at: Date | null;
        proofs_last_7_days: number;
        proofs_last_30_days: number;
      }>;
    } catch (error) {
      // La vue peut ne pas exister non plus
      logger.warn('[ProofService] proof_stats_by_site view does not exist');
      return [];
    }
  }

  private getExtension(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') return '.jpg';
    if (ext === 'png') return '.png';
    if (ext === 'webp') return '.webp';
    return '.jpg'; // Default
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    return mimeTypes[extension] || 'image/jpeg';
  }
}

export const proofService = new ProofService();
export default proofService;
