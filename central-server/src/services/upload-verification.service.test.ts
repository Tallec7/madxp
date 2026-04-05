// Mock database
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// Mock FTP
const mockGetFtpPublicUrl = jest.fn();
jest.mock('../config/ftp-storage', () => ({
  getFtpPublicUrl: (...args: unknown[]) => mockGetFtpPublicUrl(...args),
}));

// Mock logger
jest.mock('../config/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

import { uploadVerificationService } from './upload-verification.service';

beforeEach(() => {
  mockQuery.mockReset();
  mockGetFtpPublicUrl.mockReset();
});

describe('UploadVerificationService', () => {
  describe('getDeploymentBlockedMessage', () => {
    it('returns uploading message', () => {
      expect(uploadVerificationService.getDeploymentBlockedMessage('uploading')).toContain('en cours');
    });

    it('returns verifying message', () => {
      expect(uploadVerificationService.getDeploymentBlockedMessage('verifying')).toContain('vérification');
    });

    it('returns failed message', () => {
      expect(uploadVerificationService.getDeploymentBlockedMessage('failed')).toContain('échoué');
    });

    it('returns default message for null', () => {
      expect(uploadVerificationService.getDeploymentBlockedMessage(null)).toContain('pas prêt');
    });
  });

  describe('getPublicUrl', () => {
    it('delegates to getFtpPublicUrl', () => {
      mockGetFtpPublicUrl.mockReturnValue('https://cdn.example.com/videos/test.mp4');
      const result = uploadVerificationService.getPublicUrl('videos/test.mp4');
      expect(result).toBe('https://cdn.example.com/videos/test.mp4');
      expect(mockGetFtpPublicUrl).toHaveBeenCalledWith('videos/test.mp4');
    });
  });

  describe('markVideoUploading', () => {
    it('updates video upload_status to uploading', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await uploadVerificationService.markVideoUploading('vid-123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('uploading'),
        ['vid-123']
      );
    });
  });

  describe('markUpdateUploading', () => {
    it('updates software_updates upload_status to uploading', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await uploadVerificationService.markUpdateUploading('upd-456');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('uploading'),
        ['upd-456']
      );
    });
  });

  describe('isVideoReadyForDeployment', () => {
    it('returns ready true when status is ready', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ upload_status: 'ready', upload_error_message: null, checksum: 'abc123', file_size: 1024 }],
      });
      const result = await uploadVerificationService.isVideoReadyForDeployment('vid-1');
      expect(result.ready).toBe(true);
      expect(result.status).toBe('ready');
    });

    it('returns ready false when video not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await uploadVerificationService.isVideoReadyForDeployment('vid-999');
      expect(result.ready).toBe(false);
      expect(result.status).toBeNull();
      expect(result.error).toBe('Video not found');
    });

    it('returns ready false when status is uploading', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ upload_status: 'uploading', upload_error_message: null, checksum: 'abc123', file_size: 1024 }],
      });
      const result = await uploadVerificationService.isVideoReadyForDeployment('vid-2');
      expect(result.ready).toBe(false);
      expect(result.status).toBe('uploading');
    });

    it('returns ready false when checksum is missing (ghost video)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ upload_status: 'ready', upload_error_message: null, checksum: null, file_size: 0 }],
      });
      const result = await uploadVerificationService.isVideoReadyForDeployment('vid-ghost');
      expect(result.ready).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  describe('isUpdateReadyForDeployment', () => {
    it('returns ready true when status is ready', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ upload_status: 'ready', upload_error_message: null }],
      });
      const result = await uploadVerificationService.isUpdateReadyForDeployment('upd-1');
      expect(result.ready).toBe(true);
    });

    it('returns ready false when update not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await uploadVerificationService.isUpdateReadyForDeployment('upd-999');
      expect(result.ready).toBe(false);
      expect(result.error).toBe('Update not found');
    });
  });
});
