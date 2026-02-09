/**
 * Tests unitaires pour le service d'abonnement
 *
 * Ce service gère:
 * - Le calcul du statut de licence (7 cas de priorité)
 * - L'auto-déblocage des sites suspendus
 * - La prolongation, suspension, réactivation
 * - L'historique des changements
 *
 * @module subscription.service.test
 */

// Mock dependencies before importing the service
const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

const mockAuditLog = jest.fn();
jest.mock('./audit.service', () => ({
  auditService: {
    log: (...args: any[]) => mockAuditLog(...args),
  },
}));

// Import after mocks
import { subscriptionService } from './subscription.service';
import { SiteSubscriptionInfo, SubscriptionPlan, SuspensionReason } from '../types';

// Helper: create a site subscription info object (matches SiteSubscriptionInfo)
function makeSite(overrides: Partial<SiteSubscriptionInfo> = {}): SiteSubscriptionInfo {
  return {
    id: 'site-001',
    site_name: 'Club Test',
    suspended: false,
    suspension_reason: null as SuspensionReason | null,
    subscription_start: null,
    subscription_end: null,
    subscription_plan: 'standard' as SubscriptionPlan,
    suspension_date: null,
    suspension_note: null,
    last_seen_at: null,
    ...overrides,
  };
}

// Helper: create a future date string
function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Helper: create a past date string
function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // computeLicenseStatus
  // ============================================
  describe('computeLicenseStatus', () => {
    it('should return BLOCKED for manually suspended site (non auto-unblock)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: false, message_tv: 'Service suspendu', message_remote: 'Contactez le support' }],
      });

      const site = makeSite({ suspended: true, suspension_reason: 'abuse' });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('abuse');
      expect(result.can_auto_unblock).toBe(false);
      expect(result.message_tv).toBe('Service suspendu');
    });

    it('should return VALID when suspended for payment but subscription renewed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true, message_tv: '', message_remote: '' }],
      });

      const site = makeSite({
        suspended: true,
        suspension_reason: 'unpaid',
        subscription_end: futureDate(60),
      });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('VALID');
      expect(result.can_auto_unblock).toBe(true);
      expect(result.days_left).toBeGreaterThan(30);
    });

    it('should return WARNING when suspended for payment and renewed but expiring soon', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true, message_tv: '', message_remote: '' }],
      });

      const site = makeSite({
        suspended: true,
        suspension_reason: 'unpaid',
        subscription_end: futureDate(15),
      });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('WARNING');
      expect(result.days_left).toBeLessThanOrEqual(30);
    });

    it('should return BLOCKED when suspended for payment and NOT renewed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true, message_tv: 'Impayé', message_remote: 'Renouvelez' }],
      });

      const site = makeSite({
        suspended: true,
        suspension_reason: 'unpaid',
        subscription_end: pastDate(5),
      });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('BLOCKED');
      expect(result.can_auto_unblock).toBe(true);
    });

    it('should return VALID when no subscription_end is set', async () => {
      const site = makeSite({ subscription_end: null });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('VALID');
      expect(result.cache_valid_until).toBeDefined();
    });

    it('should return BLOCKED when expired more than 7 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true, message_tv: 'Expiré', message_remote: 'Renouvelez' }],
      });

      const site = makeSite({ subscription_end: pastDate(10) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('expired');
      expect(result.days_expired).toBeGreaterThanOrEqual(10);
    });

    it('should return GRACE_PERIOD when expired within 7 days', async () => {
      const site = makeSite({ subscription_end: pastDate(3) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('GRACE_PERIOD');
      expect(result.reason).toBe('expired');
      expect(result.days_left).toBeLessThanOrEqual(7);
      expect(result.days_left).toBeGreaterThan(0);
    });

    it('should return WARNING (urgent) when expiring in <= 7 days', async () => {
      const site = makeSite({ subscription_end: futureDate(5) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('WARNING');
      expect(result.reason).toBe('expiring_soon');
      expect(result.days_left).toBeLessThanOrEqual(7);
    });

    it('should return WARNING when expiring in <= 30 days', async () => {
      const site = makeSite({ subscription_end: futureDate(20) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('WARNING');
      expect(result.reason).toBe('expiring_soon');
      expect(result.days_left).toBeLessThanOrEqual(30);
    });

    it('should return VALID when subscription is far from expiring', async () => {
      const site = makeSite({ subscription_end: futureDate(90) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.status).toBe('VALID');
      expect(result.days_left).toBeGreaterThan(30);
    });

    it('should always include cache_valid_until and server_timestamp', async () => {
      const site = makeSite({ subscription_end: futureDate(90) });
      const result = await subscriptionService.computeLicenseStatus(site);

      expect(result.cache_valid_until).toBeDefined();
      expect(result.server_timestamp).toBeDefined();

      const cacheDate = new Date(result.cache_valid_until as string);
      const now = new Date();
      const diffDays = Math.round((cacheDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7); // LICENSE_CACHE_TTL_DAYS
    });
  });

  // ============================================
  // checkAutoUnblock
  // ============================================
  describe('checkAutoUnblock', () => {
    it('should return false if site is not suspended', async () => {
      const site = makeSite({ suspended: false });
      const result = await subscriptionService.checkAutoUnblock(site);
      expect(result).toBe(false);
    });

    it('should return false if suspension reason does not allow auto-unblock', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: false }],
      });

      const site = makeSite({ suspended: true, suspension_reason: 'abuse' });
      const result = await subscriptionService.checkAutoUnblock(site);
      expect(result).toBe(false);
    });

    it('should return false if subscription not renewed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true }],
      });

      const site = makeSite({
        suspended: true,
        suspension_reason: 'unpaid',
        subscription_end: pastDate(5),
      });
      const result = await subscriptionService.checkAutoUnblock(site);
      expect(result).toBe(false);
    });

    it('should auto-unblock when conditions are met', async () => {
      // Mock getSuspensionReasonInfo
      mockQuery.mockResolvedValueOnce({
        rows: [{ auto_unblock: true }],
      });
      // Mock UPDATE sites
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT subscription_history
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const site = makeSite({
        suspended: true,
        suspension_reason: 'unpaid',
        subscription_end: futureDate(30),
      });
      const result = await subscriptionService.checkAutoUnblock(site);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites'),
        expect.arrayContaining([site.id])
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_AUTO_UNBLOCKED',
          targetId: site.id,
        })
      );
    });
  });

  // ============================================
  // extendSubscription
  // ============================================
  describe('extendSubscription', () => {
    it('should throw if site not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        subscriptionService.extendSubscription('unknown-id', new Date(), null, 'admin-1')
      ).rejects.toThrow('Site not found');
    });

    it('should update subscription end date and record history', async () => {
      // Mock SELECT current state
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_end: '2026-03-01', subscription_plan: 'standard' }],
      });
      // Mock UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT history
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const newDate = new Date('2026-06-01');
      await subscriptionService.extendSubscription('site-001', newDate, 'Prolongation', 'admin-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites'),
        expect.arrayContaining(['2026-06-01', 'site-001'])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscription_history'),
        expect.any(Array)
      );
    });
  });

  // ============================================
  // suspendSite
  // ============================================
  describe('suspendSite', () => {
    it('should set suspended flags and record history', async () => {
      // Mock UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT history
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await subscriptionService.suspendSite('site-001', 'unpaid', 'Facture impayée', 'admin-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('suspended = true'),
        expect.arrayContaining(['unpaid', 'Facture impayée', 'site-001'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Site suspended',
        expect.objectContaining({ siteId: 'site-001', reason: 'unpaid' })
      );
    });
  });

  // ============================================
  // reactivateSite
  // ============================================
  describe('reactivateSite', () => {
    it('should throw if site not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        subscriptionService.reactivateSite('unknown-id', null, null, 'admin-1')
      ).rejects.toThrow('Site not found');
    });

    it('should clear suspension and optionally set new end date', async () => {
      // Mock SELECT
      mockQuery.mockResolvedValueOnce({
        rows: [{ suspension_reason: 'maintenance', subscription_end: '2026-02-01' }],
      });
      // Mock UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT history
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const newDate = new Date('2026-12-31');
      await subscriptionService.reactivateSite('site-001', newDate, 'Maintenance terminée', 'admin-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('suspended = false'),
        expect.any(Array)
      );
    });
  });

  // ============================================
  // getSubscriptionStats
  // ============================================
  describe('getSubscriptionStats', () => {
    it('should return zero stats when no data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const stats = await subscriptionService.getSubscriptionStats();

      expect(stats.active_count).toBe(0);
      expect(stats.total_count).toBe(0);
    });

    it('should parse string values to numbers', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          active_count: '42',
          expiring_soon_count: '3',
          grace_period_count: '1',
          blocked_count: '2',
          suspended_count: '0',
          trial_count: '5',
          standard_count: '30',
          premium_count: '7',
          total_count: '50',
        }],
      });

      const stats = await subscriptionService.getSubscriptionStats();

      expect(stats.active_count).toBe(42);
      expect(stats.total_count).toBe(50);
      expect(typeof stats.active_count).toBe('number');
    });
  });
});
