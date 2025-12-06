import { Video } from './video.interface';

export interface Command {
    type: 'video' | 'sponsors';
    data?: Video;
}