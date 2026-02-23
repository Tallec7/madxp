import { Observable, ReplaySubject, Subscription, interval } from 'rxjs';

export interface CommandPollOptions {
  siteId: string;
  commandName: string;
  params?: Record<string, unknown>;
  timeoutSeconds?: number;
  sendCommand: (siteId: string, command: string, params: Record<string, unknown>) => Observable<{ commandId?: string; success?: boolean }>;
  getCommandStatus: (siteId: string, commandId: string) => Observable<{ status: string; result?: Record<string, unknown>; error_message?: string }>;
}

export interface CommandPollResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * Factorized command-polling pattern:
 * sendCommand() → poll getCommandStatus() every 1s → return result on completed/failed/timeout
 *
 * Replaces the duplicated ~40 lines of polling logic in BufferStatus and Wizard step 4.
 */
export function pollCommand<T>(options: CommandPollOptions): { result$: Observable<CommandPollResult<T>>; cancel: () => void } {
  const subject = new ReplaySubject<CommandPollResult<T>>(1);
  let pollSub: Subscription | null = null;
  const timeoutSec = options.timeoutSeconds ?? 15;

  const cancel = (): void => {
    pollSub?.unsubscribe();
    subject.complete();
  };

  options.sendCommand(options.siteId, options.commandName, options.params ?? {}).subscribe({
    next: (response) => {
      if (!response.commandId) {
        subject.next({ success: false, data: null, error: 'Pas de commandId reçu' });
        subject.complete();
        return;
      }

      const commandId = response.commandId;
      let pollCount = 0;
      let isPolling = false;

      pollSub = interval(1000).subscribe(() => {
        pollCount++;

        if (pollCount > timeoutSec) {
          pollSub?.unsubscribe();
          subject.next({ success: false, data: null, error: 'Timeout: le boîtier ne répond pas' });
          subject.complete();
          return;
        }

        if (isPolling) return;
        isPolling = true;

        options.getCommandStatus(options.siteId, commandId).subscribe({
          next: (status) => {
            isPolling = false;
            if (status.status === 'completed') {
              pollSub?.unsubscribe();
              subject.next({ success: true, data: status.result as unknown as T, error: null });
              subject.complete();
            } else if (status.status === 'failed') {
              pollSub?.unsubscribe();
              subject.next({ success: false, data: null, error: status.error_message || 'Commande échouée' });
              subject.complete();
            }
          },
          error: () => {
            isPolling = false;
          }
        });
      });
    },
    error: (error) => {
      subject.next({ success: false, data: null, error: error?.message || 'Erreur de communication' });
      subject.complete();
    }
  });

  return { result$: subject.asObservable(), cancel };
}
