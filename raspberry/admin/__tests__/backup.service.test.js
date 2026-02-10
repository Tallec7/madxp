/**
 * Tests for BackupService
 */

const BackupService = require('../services/backup.service');
const { NotFoundError, ValidationError } = require('../services/errors');

describe('BackupService', () => {
  let service;

  beforeEach(() => {
    service = new BackupService();
  });

  // ===========================================================================
  // isValidBackupFilename
  // ===========================================================================

  describe('isValidBackupFilename', () => {
    it('should accept valid backup filenames', () => {
      expect(service.isValidBackupFilename('backup-20240115-143022.tar.gz')).toBe(true);
      expect(service.isValidBackupFilename('backup-20231231-235959.tar.gz')).toBe(true);
    });

    it('should reject invalid filenames', () => {
      expect(service.isValidBackupFilename('backup.tar.gz')).toBe(false);
      expect(service.isValidBackupFilename('backup-2024-01-15.tar.gz')).toBe(false);
      expect(service.isValidBackupFilename('../../../etc/passwd')).toBe(false);
      expect(service.isValidBackupFilename('')).toBe(false);
      expect(service.isValidBackupFilename('backup-20240115-143022.zip')).toBe(false);
      expect(service.isValidBackupFilename('malicious; rm -rf /.tar.gz')).toBe(false);
    });
  });

  // ===========================================================================
  // getBackupPath (validation tests)
  // ===========================================================================

  describe('getBackupPath', () => {
    it('should throw ValidationError for invalid filename', async () => {
      await expect(service.getBackupPath('../../../etc/passwd')).rejects.toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError for non-matching pattern', async () => {
      await expect(service.getBackupPath('not-a-backup.tar.gz')).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // ===========================================================================
  // deleteBackup (validation tests)
  // ===========================================================================

  describe('deleteBackup', () => {
    it('should throw ValidationError for invalid filename', async () => {
      await expect(service.deleteBackup('../../hack.sh')).rejects.toThrow(
        ValidationError,
      );
    });
  });

  // ===========================================================================
  // toggleAutoBackup (validation tests)
  // ===========================================================================

  describe('toggleAutoBackup', () => {
    it('should throw ValidationError when enable is undefined', async () => {
      await expect(service.toggleAutoBackup(undefined)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
