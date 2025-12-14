import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminOpsService } from './admin-ops.service';
import { NotificationService } from './notification.service';
import { AdminActionType } from '../models/admin';
import { ApiService } from './api.service';

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  let httpMock: HttpTestingController;
  const notifications = jasmine.createSpyObj<NotificationService>('NotificationService', [
    'success',
    'error',
    'info'
  ]);
  const originalEventSource = (global as typeof globalThis).EventSource;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService, { provide: NotificationService, useValue: notifications }]
    });
    service = TestBed.inject(AdminOpsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    (global as typeof globalThis).EventSource = originalEventSource;
  });

  it('should load jobs and clients from the API', done => {
    service.refreshState().subscribe({
      next: () => {
        service.getJobs().subscribe(jobs => {
          expect(jobs.length).toBe(1);
        });
        service.getClients().subscribe(clients => {
          expect(clients.length).toBe(1);
          done();
        });
      }
    });

    const jobsRequest = httpMock.expectOne(req => req.url.endsWith('/admin/jobs'));
    expect(jobsRequest.request.method).toBe('GET');
    jobsRequest.flush({ jobs: [{ id: '1', action: 'build:central' as AdminActionType, status: 'queued', createdAt: '', updatedAt: '', requestedBy: 'me' }] });

    const clientsRequest = httpMock.expectOne(req => req.url.endsWith('/admin/clients'));
    expect(clientsRequest.request.method).toBe('GET');
    clientsRequest.flush({ clients: [{ id: '1', name: 'Demo', code: 'demo', status: 'active', createdAt: '' }] });
  });

  it('should enqueue a job via API', done => {
    service.triggerAction({ action: 'build:central' as AdminActionType }).subscribe(job => {
      expect(job.action).toBe('build:central');
      service.getJobs().subscribe(jobs => {
        expect(jobs[0].action).toBe('build:central');
        done();
      });
    });

    const request = httpMock.expectOne(req => req.url.endsWith('/admin/jobs'));
    expect(request.request.method).toBe('POST');
    request.flush({ job: { id: 'job-1', action: 'build:central', status: 'queued', createdAt: '', updatedAt: '', requestedBy: 'me' } });
  });

  it('should create and sync client via API', done => {
    service.createClient({ name: 'Test', code: 'test' }).subscribe(client => {
      expect(client.name).toBe('Test');
      service.syncClient(client.id).subscribe(updated => {
        expect(updated.id).toBe(client.id);
        done();
      });
    });

    const createRequest = httpMock.expectOne(req => req.url.endsWith('/admin/clients'));
    expect(createRequest.request.method).toBe('POST');
    createRequest.flush({ client: { id: 'client-1', name: 'Test', code: 'test', status: 'active', createdAt: '' } });

    const syncRequest = httpMock.expectOne(req => req.url.includes('/admin/clients/client-1/sync'));
    expect(syncRequest.request.method).toBe('POST');
    syncRequest.flush({ client: { id: 'client-1', name: 'Test', code: 'test', status: 'active', createdAt: '' } });
  });

  it('should hydrate jobs from SSE stream and close it on teardown', done => {
    const listeners: Record<string, Array<(event: MessageEvent<string>) => void>> = {};
    let closed = false;

    class MockEventSource {
      constructor(public url: string, public options?: EventSourceInit) {}
      addEventListener(type: string, callback: (event: MessageEvent<string>) => void) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(callback);
      }
      close() {
        closed = true;
      }
    }

    (global as typeof globalThis).EventSource = MockEventSource as unknown as typeof EventSource;

    service.initJobStream();

    listeners['seed'][0]({
      data: JSON.stringify([
        { id: 'job-1', action: 'build:central' as AdminActionType, status: 'queued', createdAt: '', updatedAt: '', requestedBy: 'me' }
      ]),
    } as MessageEvent<string>);

    listeners['job-update'][0]({
      data: JSON.stringify({
        id: 'job-1',
        action: 'build:central' as AdminActionType,
        status: 'running',
        createdAt: '',
        updatedAt: '',
        requestedBy: 'me',
      }),
    } as MessageEvent<string>);

    service.getJobs().subscribe(jobs => {
      expect(jobs[0].status).toBe('running');
      service.teardownStreams();
      expect(closed).toBeTrue();
      done();
    });
  });
});
