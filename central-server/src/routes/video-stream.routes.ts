/**
 * Video streaming proxy routes (ADR-068).
 *
 * Public endpoint gated by a short-lived JWT passed in the query string.
 * Shares the SaaS rate limit since this is the primary SaaS consumer.
 */

import { Router } from 'express';
import { remoteRateLimit } from '../middleware/user-rate-limit';
import { streamVideo } from '../controllers/video-stream.controller';

const router = Router();

router.get('/stream', remoteRateLimit, streamVideo);

export default router;
