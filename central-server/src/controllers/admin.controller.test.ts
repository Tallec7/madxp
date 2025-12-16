/**
 * Tests unitaires pour le controller admin
 *
 * @module admin.controller.test
 */

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

const mockAdminOpsService = {
  listJobs: jest.fn(),
  triggerAction: jest.fn(),
  listClients: jest.fn(),
  createClient: jest.fn(),
  syncClient: jest.fn(),
  subscribeToJobs: jest.fn(),
};
jest.mock('../services/admin-ops.service', () => ({
  adminOpsService: mockAdminOpsService,
}));

import { Response } from 'express';
import { AuthRequest } from '../types';
import {
  listJobs,
  triggerJob,
  listClients,
  createClient,
  syncClient,
  streamJobs,
} from './admin.controller';

describe('Admin Controller', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
      body: {},
      params: {},
    };

    mockRes = {
      json: jsonMock,
      status: statusMock,
    };
  });

  describe('listJobs', () => {
    it('should return list of jobs', () => {
      const mockJobs = [
        { id: 'job-1', action: 'build:central', status: 'queued' },
        { id: 'job-2', action: 'deploy:staging', status: 'completed' },
      ];
      mockAdminOpsService.listJobs.mockReturnValue(mockJobs);

      listJobs(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.listJobs).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ jobs: mockJobs });
    });

    it('should return empty array when no jobs', () => {
      mockAdminOpsService.listJobs.mockReturnValue([]);

      listJobs(mockReq as AuthRequest, mockRes as Response);

      expect(jsonMock).toHaveBeenCalledWith({ jobs: [] });
    });
  });

  describe('triggerJob', () => {
    it('should trigger a valid job action', () => {
      mockReq.body = { action: 'build:central', parameters: { target: 'dev-local' } };
      const mockJob = { id: 'job-new', action: 'build:central', status: 'queued' };
      mockAdminOpsService.triggerAction.mockReturnValue(mockJob);

      triggerJob(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.triggerAction).toHaveBeenCalledWith(
        { action: 'build:central', parameters: { target: 'dev-local' } },
        'admin@example.com'
      );
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({ job: mockJob });
    });

    it('should use unknown for requestedBy when no user email', () => {
      mockReq.user = undefined;
      mockReq.body = { action: 'build:central' };
      mockAdminOpsService.triggerAction.mockReturnValue({ id: 'job-1' });

      triggerJob(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.triggerAction).toHaveBeenCalledWith(
        { action: 'build:central' },
        'unknown'
      );
    });

    it('should return 400 for invalid action', () => {
      mockReq.body = { action: 'invalid:action' };
      mockAdminOpsService.triggerAction.mockImplementation(() => {
        throw new Error('Unknown action: invalid:action');
      });

      triggerJob(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unknown action: invalid:action' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid job request',
        expect.any(Object)
      );
    });
  });

  describe('listClients', () => {
    it('should return list of clients', () => {
      const mockClients = [
        { id: 'client-1', name: 'Client A', code: 'client-a' },
        { id: 'client-2', name: 'Client B', code: 'client-b' },
      ];
      mockAdminOpsService.listClients.mockReturnValue(mockClients);

      listClients(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.listClients).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ clients: mockClients });
    });
  });

  describe('createClient', () => {
    it('should create a new client', () => {
      mockReq.body = { name: 'New Client', code: 'new-client', contactEmail: 'contact@new.com' };
      const mockClient = { id: 'client-new', ...mockReq.body };
      mockAdminOpsService.createClient.mockReturnValue(mockClient);

      createClient(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.createClient).toHaveBeenCalledWith(mockReq.body);
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({ client: mockClient });
    });

    it('should return 400 for invalid client payload', () => {
      mockReq.body = { name: '' }; // Invalid
      mockAdminOpsService.createClient.mockImplementation(() => {
        throw new Error('Client name is required');
      });

      createClient(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Client name is required' });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('syncClient', () => {
    it('should sync a client', () => {
      mockReq.params = { id: 'client-123' };
      const mockClient = { id: 'client-123', name: 'Test Client', synced: true };
      mockAdminOpsService.syncClient.mockReturnValue(mockClient);

      syncClient(mockReq as AuthRequest, mockRes as Response);

      expect(mockAdminOpsService.syncClient).toHaveBeenCalledWith('client-123');
      expect(jsonMock).toHaveBeenCalledWith({ client: mockClient });
    });

    it('should return 404 if client not found', () => {
      mockReq.params = { id: 'nonexistent' };
      mockAdminOpsService.syncClient.mockImplementation(() => {
        throw new Error('Client not found');
      });

      syncClient(mockReq as AuthRequest, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Client not found' });
    });
  });

  describe('streamJobs', () => {
    it('should setup SSE stream for job updates', () => {
      const setHeaderMock = jest.fn();
      const flushHeadersMock = jest.fn();
      const onMock = jest.fn();

      // Mock PassThrough stream behavior
      const unsubscribeMock = jest.fn();
      mockAdminOpsService.subscribeToJobs.mockReturnValue(unsubscribeMock);
      mockAdminOpsService.listJobs.mockReturnValue([]);

      // Response needs 'on' method for pipe()
      const mockStreamRes = {
        setHeader: setHeaderMock,
        flushHeaders: flushHeadersMock,
        on: jest.fn().mockReturnThis(),
        once: jest.fn().mockReturnThis(),
        emit: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockStreamReq = {
        ...mockReq,
        on: onMock,
      };

      streamJobs(mockStreamReq as unknown as AuthRequest, mockStreamRes as unknown as Response);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(setHeaderMock).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(setHeaderMock).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(flushHeadersMock).toHaveBeenCalled();
      expect(mockAdminOpsService.subscribeToJobs).toHaveBeenCalled();
    });

    it('should cleanup on connection close', () => {
      jest.useFakeTimers();

      const onMock = jest.fn();
      const unsubscribeMock = jest.fn();
      mockAdminOpsService.subscribeToJobs.mockReturnValue(unsubscribeMock);
      mockAdminOpsService.listJobs.mockReturnValue([]);

      // Response needs 'on' method for pipe()
      const mockStreamRes = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        on: jest.fn().mockReturnThis(),
        once: jest.fn().mockReturnThis(),
        emit: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
      };

      const mockStreamReq = {
        ...mockReq,
        on: onMock,
      };

      streamJobs(mockStreamReq as unknown as AuthRequest, mockStreamRes as unknown as Response);

      // Get the close handler
      const closeHandler = onMock.mock.calls.find(call => call[0] === 'close')?.[1];
      expect(closeHandler).toBeDefined();

      // Simulate close
      if (closeHandler) {
        closeHandler();
      }

      expect(unsubscribeMock).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
