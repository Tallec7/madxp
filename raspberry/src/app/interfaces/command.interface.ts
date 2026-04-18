import { PiConfigVideoEntry } from './video.interface';
import { Configuration } from './configuration.interface';

export interface Command {
    type: 'video' | 'sponsors' | 'reload-config';
    data?: PiConfigVideoEntry | Configuration;
    target?: number[];
}