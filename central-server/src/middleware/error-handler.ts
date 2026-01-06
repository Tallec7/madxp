import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'joi';
import { CorrelationRequest } from './correlation';
import {
  AppError,
  ErrorCode,
  ErrorMessages,
  ApiErrorResponse,
  isAppError,
} from '../types/errors';
import logger from '../config/logger';

/**
 * Get logger context from request
 */
function getLogContext(req: CorrelationRequest): Record<string, unknown> {
  return {
    correlationId: req.correlationId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    userRole: req.user?.role,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Build standardized error response
 */
function buildErrorResponse(
  code: ErrorCode,
  message: string,
  correlationId: string,
  path: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      correlationId,
      path,
    },
  };
}

/**
 * Handle Joi validation errors
 */
function handleValidationError(
  error: ValidationError,
  req: CorrelationRequest,
  res: Response
): void {
  const fields = error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message,
    type: detail.type,
  }));

  const logContext = getLogContext(req);
  logger.warn('Validation error', {
    ...logContext,
    validationErrors: fields,
  });

  const response = buildErrorResponse(
    ErrorCode.VALIDATION_FAILED,
    ErrorMessages[ErrorCode.VALIDATION_FAILED],
    req.correlationId,
    req.path,
    { fields }
  );

  res.status(400).json(response);
}

/**
 * Handle AppError (our custom error class)
 */
function handleAppError(
  error: AppError,
  req: CorrelationRequest,
  res: Response
): void {
  const logContext = getLogContext(req);

  // Log level based on status code
  if (error.statusCode >= 500) {
    logger.error('Application error', {
      ...logContext,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      stack: error.stack,
    });
  } else {
    logger.warn('Client error', {
      ...logContext,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }

  const response = error.toResponse(req.correlationId, req.path);
  res.status(error.statusCode).json(response);
}

/**
 * Handle unknown/unexpected errors
 */
function handleUnknownError(
  error: Error,
  req: CorrelationRequest,
  res: Response
): void {
  const logContext = getLogContext(req);

  logger.error('Unhandled error', {
    ...logContext,
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  });

  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const response = buildErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    ErrorMessages[ErrorCode.INTERNAL_ERROR],
    req.correlationId,
    req.path,
    isProduction ? undefined : { originalError: error.message }
  );

  res.status(500).json(response);
}

/**
 * Global Error Handler Middleware
 *
 * Catches all errors and formats them consistently.
 * MUST be registered AFTER all routes.
 *
 * Handles:
 * - AppError (our custom errors)
 * - Joi ValidationError
 * - Generic Error objects
 * - Unknown error types
 *
 * @example
 * // In server.ts, after all routes:
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
   
  _next: NextFunction
): void => {
  const correlationReq = req as CorrelationRequest;

  // Ensure correlation ID exists (fallback for edge cases)
  if (!correlationReq.correlationId) {
    correlationReq.correlationId = 'unknown';
  }

  // Handle known error types
  if (isAppError(err)) {
    handleAppError(err, correlationReq, res);
    return;
  }

  if (err instanceof ValidationError || err.name === 'ValidationError') {
    handleValidationError(err as ValidationError, correlationReq, res);
    return;
  }

  // JWT errors from express-jwt or jsonwebtoken
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    const appError = new AppError(ErrorCode.AUTH_TOKEN_INVALID);
    handleAppError(appError, correlationReq, res);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    const appError = new AppError(ErrorCode.AUTH_TOKEN_EXPIRED);
    handleAppError(appError, correlationReq, res);
    return;
  }

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    const multerErr = err as Error & { code: string };
    let appError: AppError;

    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      appError = new AppError(ErrorCode.STORAGE_FILE_TOO_LARGE);
    } else {
      appError = new AppError(ErrorCode.STORAGE_UPLOAD_FAILED, {
        multerCode: multerErr.code,
      });
    }

    handleAppError(appError, correlationReq, res);
    return;
  }

  // PostgreSQL errors
  if ('code' in err && typeof (err as Record<string, unknown>).code === 'string') {
    const pgError = err as Error & { code: string; constraint?: string };

    // Unique constraint violation
    if (pgError.code === '23505') {
      const appError = new AppError(ErrorCode.RESOURCE_ALREADY_EXISTS, {
        constraint: pgError.constraint,
      });
      handleAppError(appError, correlationReq, res);
      return;
    }

    // Foreign key violation
    if (pgError.code === '23503') {
      const appError = new AppError(ErrorCode.DATABASE_CONSTRAINT_VIOLATION, {
        constraint: pgError.constraint,
      });
      handleAppError(appError, correlationReq, res);
      return;
    }
  }

  // Unknown error - handle generically
  handleUnknownError(err, correlationReq, res);
};

/**
 * 404 Not Found Handler
 *
 * Catches requests to unknown routes.
 * MUST be registered BEFORE errorHandler and AFTER all routes.
 *
 * @example
 * // In server.ts:
 * app.use('/api', routes);
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationReq = req as CorrelationRequest;

  // Skip Socket.IO requests
  if (req.path.startsWith('/socket.io')) {
    next();
    return;
  }

  // Ensure correlation ID exists
  if (!correlationReq.correlationId) {
    correlationReq.correlationId = 'unknown';
  }

  const logContext = getLogContext(correlationReq);
  logger.warn('Route not found', logContext);

  const response = buildErrorResponse(
    ErrorCode.RESOURCE_NOT_FOUND,
    `Route ${req.method} ${req.path} introuvable`,
    correlationReq.correlationId,
    req.path
  );

  res.status(404).json(response);
};

/**
 * Async handler wrapper
 *
 * Wraps async route handlers to automatically catch errors
 * and pass them to the error handler middleware.
 *
 * @example
 * router.get('/sites/:id', asyncHandler(async (req, res) => {
 *   const site = await getSite(req.params.id);
 *   if (!site) throw new AppError(ErrorCode.SITE_NOT_FOUND);
 *   res.json(site);
 * }));
 */
export const asyncHandler = <T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
