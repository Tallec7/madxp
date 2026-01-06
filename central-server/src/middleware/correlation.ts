import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../types';

/**
 * Extended Request interface with correlation ID
 */
export interface CorrelationRequest extends AuthRequest {
  correlationId: string;
}

/**
 * Correlation ID Middleware
 *
 * Adds a unique correlation ID to each request for tracing across:
 * - Frontend → Backend logs
 * - Multiple service calls
 * - Error tracking
 *
 * The correlation ID is:
 * 1. Accepted from client via X-Correlation-ID header (if provided)
 * 2. Generated as UUID v4 if not provided
 * 3. Added to response headers for client tracking
 */
export const correlationMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const correlationRequest = req as CorrelationRequest;

  // Accept correlation ID from client or generate new one
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    uuidv4();

  // Attach to request for use in handlers
  correlationRequest.correlationId = correlationId;

  // Add to response headers for client tracking
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};
