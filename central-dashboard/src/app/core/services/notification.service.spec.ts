import { TestBed } from '@angular/core/testing';
import { NotificationService, Notification } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationService]
    });
    service = TestBed.inject(NotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('notification$', () => {
    it('should be an observable', () => {
      expect(service.notification$).toBeTruthy();
      expect(typeof service.notification$.subscribe).toBe('function');
    });
  });

  describe('success', () => {
    it('should emit a success notification', (done) => {
      const testMessage = 'Operation successful';

      service.notification$.subscribe((notification: Notification) => {
        expect(notification.type).toBe('success');
        expect(notification.message).toBe(testMessage);
        expect(typeof notification.id).toBe('number');
        done();
      });

      service.success(testMessage);
    });
  });

  describe('error', () => {
    it('should emit an error notification', (done) => {
      const testMessage = 'Something went wrong';

      service.notification$.subscribe((notification: Notification) => {
        expect(notification.type).toBe('error');
        expect(notification.message).toBe(testMessage);
        done();
      });

      service.error(testMessage);
    });
  });

  describe('warning', () => {
    it('should emit a warning notification', (done) => {
      const testMessage = 'Warning: check this';

      service.notification$.subscribe((notification: Notification) => {
        expect(notification.type).toBe('warning');
        expect(notification.message).toBe(testMessage);
        done();
      });

      service.warning(testMessage);
    });
  });

  describe('info', () => {
    it('should emit an info notification', (done) => {
      const testMessage = 'FYI: something happened';

      service.notification$.subscribe((notification: Notification) => {
        expect(notification.type).toBe('info');
        expect(notification.message).toBe(testMessage);
        done();
      });

      service.info(testMessage);
    });
  });

  describe('notification IDs', () => {
    it('should increment notification IDs', (done) => {
      const notifications: Notification[] = [];

      const subscription = service.notification$.subscribe((notification: Notification) => {
        notifications.push(notification);

        if (notifications.length === 3) {
          expect(notifications[1].id).toBeGreaterThan(notifications[0].id);
          expect(notifications[2].id).toBeGreaterThan(notifications[1].id);
          subscription.unsubscribe();
          done();
        }
      });

      service.success('First');
      service.error('Second');
      service.info('Third');
    });
  });
});
