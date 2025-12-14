import { Response } from 'express';
import { AuthRequest } from '../types';
import { adminOpsService } from '../services/admin-ops.service';
import { AdminActionRequest, LocalClientInput } from '../types/admin';
import logger from '../config/logger';
import { PassThrough } from 'stream';

export const listJobs = (_req: AuthRequest, res: Response) => {
  return res.json({ jobs: adminOpsService.listJobs() });
};

export const triggerJob = (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as AdminActionRequest;
    const requestedBy = req.user?.email || 'unknown';
    const job = adminOpsService.triggerAction(payload, requestedBy);
    return res.status(201).json({ job });
  } catch (error) {
    logger.warn('Invalid job request', { error });
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const listClients = (_req: AuthRequest, res: Response) => {
  return res.json({ clients: adminOpsService.listClients() });
};

export const createClient = (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body as LocalClientInput;
    const client = adminOpsService.createClient(payload);
    return res.status(201).json({ client });
  } catch (error) {
    logger.warn('Invalid client payload', { error });
    return res.status(400).json({ error: (error as Error).message });
  }
};

export const syncClient = (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = adminOpsService.syncClient(id);
    return res.json({ client });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
};

export const streamJobs = (req: AuthRequest, res: Response) => {
  const stream = new PassThrough();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = adminOpsService.subscribeToJobs(job => send('job-update', job));
  const heartbeat = setInterval(() => send('keep-alive', 'ping'), 15000);

  send('seed', adminOpsService.listJobs());

  stream.pipe(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    stream.end();
  });
};
