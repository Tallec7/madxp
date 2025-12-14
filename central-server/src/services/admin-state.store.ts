import fs from 'fs';
import path from 'path';
import logger from '../config/logger';
import { AdminJob, LocalClient } from '../types/admin';

export interface AdminState {
  jobs: AdminJob[];
  clients: LocalClient[];
}

export class AdminStateStore {
  constructor(private readonly filePath = process.env.ADMIN_STATE_FILE || path.resolve(process.cwd(), 'data', 'admin-state.json')) {
    this.ensureDirectory();
  }

  load(initialState: AdminState): AdminState {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.persist(initialState);
        return initialState;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AdminState>;
      return {
        jobs: parsed.jobs ?? initialState.jobs,
        clients: parsed.clients ?? initialState.clients,
      };
    } catch (error) {
      logger.warn('Unable to read admin state from disk, falling back to defaults', { error });
      return initialState;
    }
  }

  persist(state: AdminState): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Unable to persist admin state', { error, filePath: this.filePath });
    }
  }

  reset(initialState: AdminState): void {
    this.persist(initialState);
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
