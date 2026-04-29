import { PiConfigVideoEntry } from './video.interface';
import { Configuration } from './configuration.interface';

export interface WebPagePayload {
    url: string;
    durationMs?: number | null;
    /** ADR-103 Phase 1 — display name (used for analytics + on-screen toasts) */
    name?: string;
}

export interface LivestreamPayload {
    url: string;
    mimeType?: string | null;
    /** ADR-103 Phase 1 — auto-close after this delay (livestreams are infinite) */
    durationMs?: number | null;
    /** ADR-103 Phase 1 — display name */
    name?: string;
}

export interface Command {
    type: 'video' | 'sponsors' | 'reload-config' | 'web-page' | 'livestream' | 'stop-manual';
    data?: PiConfigVideoEntry | Configuration | WebPagePayload | LivestreamPayload;
    target?: number[];
}
