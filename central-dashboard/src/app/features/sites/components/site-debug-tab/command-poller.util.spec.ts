import { of, throwError } from 'rxjs';
import { pollCommand } from './command-poller.util';

describe('pollCommand', () => {
  const baseMocks = {
    siteId: 'site-1',
    commandName: 'test_command',
    timeoutSeconds: 3,
  };

  it('should return success when command completes', (done) => {
    const sendCommand = jasmine.createSpy('sendCommand').and.returnValue(of({ commandId: 'cmd-1', success: true }));
    const getCommandStatus = jasmine.createSpy('getCommandStatus').and.returnValue(of({ status: 'completed', result: { value: 42 } }));

    const { result$ } = pollCommand<{ value: number }>({
      ...baseMocks,
      sendCommand,
      getCommandStatus,
    });

    result$.subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 42 });
      expect(result.error).toBeNull();
      done();
    });
  });

  it('should return error when sendCommand fails', (done) => {
    const sendCommand = jasmine.createSpy('sendCommand').and.returnValue(throwError(() => new Error('Network error')));
    const getCommandStatus = jasmine.createSpy('getCommandStatus');

    const { result$ } = pollCommand<unknown>({
      ...baseMocks,
      sendCommand,
      getCommandStatus,
    });

    result$.subscribe((result) => {
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toContain('Network error');
      done();
    });
  });

  it('should return error when no commandId received', (done) => {
    const sendCommand = jasmine.createSpy('sendCommand').and.returnValue(of({ success: true }));
    const getCommandStatus = jasmine.createSpy('getCommandStatus');

    const { result$ } = pollCommand<unknown>({
      ...baseMocks,
      sendCommand,
      getCommandStatus,
    });

    result$.subscribe((result) => {
      expect(result.success).toBe(false);
      expect(result.error).toBe('Pas de commandId reçu');
      done();
    });
  });

  it('should return error when command fails', (done) => {
    const sendCommand = jasmine.createSpy('sendCommand').and.returnValue(of({ commandId: 'cmd-2', success: true }));
    const getCommandStatus = jasmine.createSpy('getCommandStatus').and.returnValue(of({ status: 'failed', error_message: 'Pi crashed' }));

    const { result$ } = pollCommand<unknown>({
      ...baseMocks,
      sendCommand,
      getCommandStatus,
    });

    result$.subscribe((result) => {
      expect(result.success).toBe(false);
      expect(result.error).toBe('Pi crashed');
      done();
    });
  });

  it('should cancel polling when cancel is called', () => {
    const sendCommand = jasmine.createSpy('sendCommand').and.returnValue(of({ commandId: 'cmd-3', success: true }));
    const getCommandStatus = jasmine.createSpy('getCommandStatus').and.returnValue(of({ status: 'pending' }));

    const { cancel } = pollCommand<unknown>({
      ...baseMocks,
      sendCommand,
      getCommandStatus,
    });

    // Should not throw
    cancel();
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });
});
