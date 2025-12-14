export type AdminActionType =
  | 'build:central'
  | 'build:raspberry'
  | 'deploy:raspberry'
  | 'tests:full'
  | 'sync:clients'
  | 'maintenance:restart';

export interface AdminJob {
  id: string;
  action: AdminActionType;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  parameters?: Record<string, string>;
  summary?: string;
  logs?: string[];
}

export interface AdminActionRequest {
  action: AdminActionType;
  parameters?: Record<string, string>;
  note?: string;
}

export interface LocalClientInput {
  name: string;
  code: string;
  contactEmail?: string;
  timezone?: string;
  siteCount?: number;
}

export interface LocalClient extends LocalClientInput {
  id: string;
  createdAt: string;
  lastSyncAt?: string;
  status: 'active' | 'paused' | 'error';
}
