import { TestBed } from '@angular/core/testing';
import { AdminOpsService } from './admin-ops.service';
import { NotificationService } from './notification.service';
import { take } from 'rxjs/operators';
import { AdminActionType } from '../models/admin';

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const notifications = jasmine.createSpyObj<NotificationService>('NotificationService', [
    'success',
    'error',
    'info'
  ]);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notifications }]
    });
    service = TestBed.inject(AdminOpsService);
  });

  it('should enqueue a job when triggering an action', done => {
    service
      .triggerAction({ action: 'build:central' as AdminActionType })
      .pipe(take(1))
      .subscribe(job => {
        expect(job.action).toBe('build:central');
        service
          .getJobs()
          .pipe(take(1))
          .subscribe(jobs => {
            expect(jobs[0].id).toBe(job.id);
            done();
          });
      });
  });

  it('should add a new client and emit it', done => {
    service
      .createClient({ name: 'Test', code: 'test' })
      .pipe(take(1))
      .subscribe(client => {
        expect(client.name).toBe('Test');
        service
          .getClients()
          .pipe(take(1))
          .subscribe(clients => {
            expect(clients.find(c => c.id === client.id)).toBeTruthy();
            done();
          });
      });
  });
});
