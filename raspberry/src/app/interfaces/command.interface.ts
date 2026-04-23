import { PiConfigVideoEntry } from './video.interface';
import { Configuration } from './configuration.interface';

export interface WebPagePayload {
    url: string;
    durationMs?: number | null;
}

export interface LivestreamPayload {
    url: string;
    mimeType?: string | null;
}

export interface Command {
    type: 'video' | 'sponsors' | 'reload-config' | 'web-page' | 'livestream' | 'stop-manual';
    data?: PiConfigVideoEntry | Configuration | WebPagePayload | LivestreamPayload;
    target?: number[];
}
