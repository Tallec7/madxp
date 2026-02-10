/**
 * BackupService
 *
 * Logique m\u00e9tier pour la gestion des backups : lister, cr\u00e9er,
 * t\u00e9l\u00e9charger, supprimer et g\u00e9rer le backup automatique (timer systemd).
 */

const fs = require('fs').promises;
const path = require('path');

const { NEOPRO_DIR, execCommand } = require('../helpers');
const { NotFoundError, ValidationError, CommandError } = require('./errors');

const BACKUP_DIR = '/home/pi/neopro-backups';
const BACKUP_FILENAME_REGEX = /^backup-\d{8}-\d{6}\.tar\.gz$/;

class BackupService {
  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate that a filename matches the expected backup pattern `backup-YYYYMMDD-HHMMSS.tar.gz`.
   * @param {string} filename
   * @returns {boolean} True if the filename is a valid backup archive name
   */
  isValidBackupFilename(filename) {
    return BACKUP_FILENAME_REGEX.test(filename);
  }

  // ---------------------------------------------------------------------------
  // List backups
  // ---------------------------------------------------------------------------

  /**
   * List all backup archives in BACKUP_DIR, sorted newest-first.
   *
   * Also reads `last-backup-status.json` for the most recent backup outcome.
   *
   * @returns {Promise<{backups: Array<{name: string, size: string, sizeBytes: number, date: string|null, created: Date, age: string}>, status: object|null, total: number, totalSize: number}>}
   */
  async listBackups() {
    try {
      await fs.access(BACKUP_DIR);
    } catch {
      return { backups: [], status: null, total: 0, totalSize: 0 };
    }

    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files.filter((f) => this.isValidBackupFilename(f));

    const backups = await Promise.all(
      backupFiles.map(async (filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = await fs.stat(filePath);
        const timestampMatch = filename.match(/backup-(\d{8})-(\d{6})\.tar\.gz/);

        let date = null;
        if (timestampMatch) {
          const dateStr = timestampMatch[1];
          const timeStr = timestampMatch[2];
          date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
        }

        return {
          name: filename,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          sizeBytes: stats.size,
          date,
          created: stats.mtime,
          age:
            Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)) + ' jours',
        };
      }),
    );

    // Sort newest first
    backups.sort((a, b) => b.created.getTime() - a.created.getTime());

    // Read last backup status
    let lastBackupStatus = null;
    try {
      const statusFile = path.join(BACKUP_DIR, 'last-backup-status.json');
      const statusData = await fs.readFile(statusFile, 'utf8');
      lastBackupStatus = JSON.parse(statusData);
    } catch {
      // Pas de statut disponible
    }

    return {
      backups,
      status: lastBackupStatus,
      total: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
    };
  }

  // ---------------------------------------------------------------------------
  // Create backup
  // ---------------------------------------------------------------------------

  /**
   * Create a new backup by executing the `auto-backup.sh` script.
   *
   * @returns {Promise<{output: string}>} Shell output from the backup script
   * @throws {NotFoundError} If the backup script is not found
   * @throws {CommandError} If the script execution fails
   */
  async createBackup() {
    const scriptPath = path.join(NEOPRO_DIR, 'scripts', 'auto-backup.sh');

    try {
      await fs.access(scriptPath);
    } catch {
      throw new NotFoundError('Script de backup non trouv\u00e9');
    }

    const result = await execCommand(`sudo bash ${scriptPath}`);
    if (!result.success) {
      throw new CommandError('\u00c9chec de la cr\u00e9ation du backup: ' + (result.error || ''));
    }

    return { output: result.output };
  }

  // ---------------------------------------------------------------------------
  // Get backup path (for download)
  // ---------------------------------------------------------------------------

  /**
   * Resolve and validate the full path to a backup file (for download).
   *
   * @param {string} filename — Backup file name (e.g. `backup-20260210-143000.tar.gz`)
   * @returns {Promise<string>} Absolute path to the backup file
   * @throws {ValidationError} If the filename format is invalid
   * @throws {NotFoundError} If the backup file does not exist
   */
  async getBackupPath(filename) {
    if (!this.isValidBackupFilename(filename)) {
      throw new ValidationError('Nom de fichier invalide');
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    try {
      await fs.access(backupPath);
    } catch {
      throw new NotFoundError('Backup non trouv\u00e9');
    }

    return backupPath;
  }

  // ---------------------------------------------------------------------------
  // Delete backup
  // ---------------------------------------------------------------------------

  /**
   * Delete a backup archive from disk.
   *
   * @param {string} filename — Backup file name
   * @throws {ValidationError} If the filename format is invalid
   * @throws {NotFoundError} If the backup file does not exist
   */
  async deleteBackup(filename) {
    if (!this.isValidBackupFilename(filename)) {
      throw new ValidationError('Nom de fichier invalide');
    }

    const backupPath = path.join(BACKUP_DIR, filename);
    try {
      await fs.access(backupPath);
    } catch {
      throw new NotFoundError('Backup non trouv\u00e9');
    }

    await fs.unlink(backupPath);
  }

  // ---------------------------------------------------------------------------
  // Auto-backup status
  // ---------------------------------------------------------------------------

  /**
   * Get the auto-backup systemd timer status.
   *
   * Checks whether `neopro-backup.timer` is enabled and active,
   * reads the next scheduled run time, and fetches recent journal logs.
   *
   * @returns {Promise<{enabled: boolean, active: boolean, nextRun: string|null, logs: string|null}>}
   */
  async getAutoBackupStatus() {
    // Is timer enabled?
    const timerResult = await execCommand(
      'systemctl is-enabled neopro-backup.timer 2>/dev/null',
    );
    const isEnabled = timerResult.success && timerResult.output.trim() === 'enabled';

    // Is timer active?
    const activeResult = await execCommand(
      'systemctl is-active neopro-backup.timer 2>/dev/null',
    );
    const isActive = activeResult.success && activeResult.output.trim() === 'active';

    // Next run
    let nextRun = null;
    if (isActive) {
      const nextRunResult = await execCommand(
        'systemctl status neopro-backup.timer 2>/dev/null | grep "Trigger:"',
      );
      if (nextRunResult.success) {
        const match = nextRunResult.output.match(/Trigger:\s*(.+)/);
        if (match) nextRun = match[1].trim();
      }
    }

    // Recent logs
    const logsResult = await execCommand(
      'journalctl -u neopro-backup.service -n 20 --no-pager 2>/dev/null',
    );
    const logs = logsResult.success ? logsResult.output : null;

    return { enabled: isEnabled, active: isActive, nextRun, logs };
  }

  // ---------------------------------------------------------------------------
  // Toggle auto-backup
  // ---------------------------------------------------------------------------

  /**
   * Enable or disable the auto-backup systemd timer.
   *
   * @param {boolean} enable — `true` to enable, `false` to disable
   * @returns {Promise<{enabled: boolean}>}
   * @throws {ValidationError} If the `enable` parameter is missing
   * @throws {CommandError} If the systemctl command fails
   */
  async toggleAutoBackup(enable) {
    if (enable === undefined) {
      throw new ValidationError('Param\u00e8tre "enable" requis');
    }

    const command = enable
      ? 'sudo systemctl enable --now neopro-backup.timer'
      : 'sudo systemctl disable --now neopro-backup.timer';

    const result = await execCommand(command);
    if (!result.success) {
      throw new CommandError(result.error);
    }

    return { enabled: !!enable };
  }
}

module.exports = BackupService;
