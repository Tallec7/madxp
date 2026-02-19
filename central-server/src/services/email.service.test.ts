export {};

// Mock nodemailer before importing the service
const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
});

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

// Save original env
const originalEnv = process.env;

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset env
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('initialization', () => {
    it('should disable service when SMTP config is missing', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;

      const { emailService } = await import('./email.service');

      expect(emailService.isEnabled()).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Email service disabled: SMTP configuration missing'
      );
    });

    it('should initialize when all SMTP config is provided', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';

      const { emailService } = await import('./email.service');

      expect(emailService.isEnabled()).toBe(true);
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          auth: {
            user: 'user@test.com',
            pass: 'password123',
          },
        })
      );
    });

    it('should use default port 587', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
      delete process.env.SMTP_PORT;

      await import('./email.service');

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        })
      );
    });

    it('should use custom port when provided', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
      process.env.SMTP_PORT = '465';

      await import('./email.service');

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        })
      );
    });

    it('should enable secure mode when SMTP_SECURE is true', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
      process.env.SMTP_SECURE = 'true';

      await import('./email.service');

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true,
        })
      );
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should return true when connection is successful', async () => {
      mockVerify.mockResolvedValueOnce(true);

      const { emailService } = await import('./email.service');
      const result = await emailService.testConnection();

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('SMTP connection verified');
    });

    it('should return false when connection fails', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Connection refused'));

      const { emailService } = await import('./email.service');
      const result = await emailService.testConnection();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'SMTP connection failed:',
        expect.any(Error)
      );
    });
  });

  describe('send', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should send email successfully', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      const result = await emailService.send({
        to: 'recipient@test.com',
        subject: 'Test Subject',
        text: 'Test body',
      });

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@test.com',
          subject: 'Test Subject',
          text: 'Test body',
        })
      );
    });

    it('should use default from address', async () => {
      delete process.env.SMTP_FROM;
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.send({
        to: 'recipient@test.com',
        subject: 'Test',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@neopro.fr',
        })
      );
    });

    it('should use custom from address when provided', async () => {
      process.env.SMTP_FROM = 'custom@neopro.fr';
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.send({
        to: 'recipient@test.com',
        subject: 'Test',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@neopro.fr',
        })
      );
    });

    it('should join multiple recipients', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.send({
        to: ['user1@test.com', 'user2@test.com'],
        subject: 'Test',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user1@test.com, user2@test.com',
        })
      );
    });

    it('should return false when sending fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      const { emailService } = await import('./email.service');
      const result = await emailService.send({
        to: 'recipient@test.com',
        subject: 'Test',
      });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send email:',
        expect.objectContaining({
          to: 'recipient@test.com',
        })
      );
    });

    it('should return false when service is disabled', async () => {
      delete process.env.SMTP_HOST;

      const { emailService } = await import('./email.service');
      const result = await emailService.send({
        to: 'recipient@test.com',
        subject: 'Test',
      });

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendAlertNotification', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should send critical alert with correct emoji and styling', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendAlertNotification('admin@test.com', {
        siteName: 'Club Test',
        siteId: 'site-123',
        alertType: 'Temperature High',
        severity: 'critical',
        message: 'Temperature exceeded 80C',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('CRITIQUE'),
          html: expect.stringContaining('alert-critical'),
        })
      );
    });

    it('should send warning alert with correct emoji', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendAlertNotification('admin@test.com', {
        siteName: 'Club Test',
        siteId: 'site-123',
        alertType: 'Disk Low',
        severity: 'warning',
        message: 'Disk usage above 80%',
        timestamp: new Date(),
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Avertissement'),
        })
      );
    });

    it('should include dashboard URL when provided', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendAlertNotification('admin@test.com', {
        siteName: 'Club Test',
        siteId: 'site-123',
        alertType: 'Test',
        severity: 'info',
        message: 'Test message',
        timestamp: new Date(),
        dashboardUrl: 'https://dashboard.neopro.fr/sites/site-123',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('https://dashboard.neopro.fr/sites/site-123'),
        })
      );
    });
  });

  describe('sendDeploymentNotification', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should send started notification', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendDeploymentNotification('user@test.com', {
        siteName: 'Club Test',
        videoName: 'promo.mp4',
        status: 'started',
        timestamp: new Date(),
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('demarre'),
        })
      );
    });

    it('should send completed notification with success styling', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendDeploymentNotification('user@test.com', {
        siteName: 'Club Test',
        videoName: 'promo.mp4',
        status: 'completed',
        timestamp: new Date(),
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('termine'),
          html: expect.stringContaining('success'),
        })
      );
    });

    it('should send failed notification with error details', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendDeploymentNotification('user@test.com', {
        siteName: 'Club Test',
        videoName: 'promo.mp4',
        status: 'failed',
        error: 'Connection timeout',
        timestamp: new Date(),
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('echoue'),
          html: expect.stringContaining('Connection timeout'),
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should send password reset email with correct link', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendPasswordResetEmail('user@test.com', {
        resetLink: 'https://dashboard.neopro.fr/reset?token=abc123',
        expiresAt: new Date('2024-01-16T10:00:00Z'),
        userEmail: 'user@test.com',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('Reinitialisation'),
          html: expect.stringContaining('https://dashboard.neopro.fr/reset?token=abc123'),
        })
      );
    });

    it('should include expiration date in email', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const expiresAt = new Date('2024-01-16T10:00:00Z');
      const { emailService } = await import('./email.service');
      await emailService.sendPasswordResetEmail('user@test.com', {
        resetLink: 'https://example.com/reset',
        expiresAt,
        userEmail: 'user@test.com',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(expiresAt.toLocaleString('fr-FR')),
        })
      );
    });

    it('should include user email in template', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendPasswordResetEmail('user@test.com', {
        resetLink: 'https://example.com/reset',
        expiresAt: new Date(),
        userEmail: 'user@test.com',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('user@test.com'),
        })
      );
    });
  });

  describe('sendSummaryReport', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASSWORD = 'password123';
    });

    it('should send summary report with stats', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendSummaryReport('admin@test.com', {
        period: 'Hebdomadaire',
        totalSites: 50,
        onlineSites: 45,
        alertsCount: 3,
        deploymentsCount: 12,
        highlights: ['5 nouveaux sites connectes', '2 deploiements en echec'],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Rapport Hebdomadaire'),
          html: expect.stringContaining('45/50'),
        })
      );
    });

    it('should include highlights in email', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendSummaryReport('admin@test.com', {
        period: 'Quotidien',
        totalSites: 10,
        onlineSites: 10,
        alertsCount: 0,
        deploymentsCount: 5,
        highlights: ['Tous les sites en ligne'],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Tous les sites en ligne'),
        })
      );
    });

    it('should handle empty highlights', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      const { emailService } = await import('./email.service');
      await emailService.sendSummaryReport('admin@test.com', {
        period: 'Quotidien',
        totalSites: 10,
        onlineSites: 10,
        alertsCount: 0,
        deploymentsCount: 0,
        highlights: [],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Aucun evenement notable'),
        })
      );
    });
  });
});
