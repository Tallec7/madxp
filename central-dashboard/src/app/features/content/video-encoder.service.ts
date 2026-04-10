import { Injectable } from '@angular/core';

export interface EncoderResult {
  recorder: MediaRecorder;
  chunks: Blob[];
  stopPromise: Promise<Blob>;
}

@Injectable({ providedIn: 'root' })
export class VideoEncoderService {

  private fontsLoadedPromise: Promise<void> | null = null;

  ensureFontsLoaded(): Promise<void> {
    if (this.fontsLoadedPromise) return this.fontsLoadedPromise;

    this.fontsLoadedPromise = new Promise<void>((resolve) => {
      const id = 'neopro-template-fonts';
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@500;700;900&family=Anton&display=swap';
        document.head.appendChild(link);
      }

      const fontsApi = (document as unknown as { fonts?: { load: (s: string) => Promise<unknown>; ready: Promise<unknown> } }).fonts;
      if (fontsApi) {
        Promise.all([
          fontsApi.load("900 280px 'Bebas Neue'"),
          fontsApi.load("500 30px 'Barlow Condensed'"),
        ])
          .then(() => fontsApi.ready)
          .then(() => resolve())
          .catch(() => resolve());
      } else {
        setTimeout(resolve, 500);
      }
    });

    return this.fontsLoadedPromise;
  }

  encode(canvas: HTMLCanvasElement): EncoderResult {
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => {
        reject(new Error('MediaRecorder error'));
      };
    });

    recorder.start(100);

    return { recorder, chunks, stopPromise };
  }
}
