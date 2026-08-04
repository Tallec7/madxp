import { imageToVideoService } from '../image-to-video.service';

/**
 * ADR/incident 2026-08-04 — un GIF doit être converti en vidéo en préservant
 * son animation. Le régime d'entrée ffmpeg n'est donc PAS le même que pour une
 * image fixe.
 */
describe('ImageToVideoService.buildFfmpegArgs', () => {
  const OUT = '/tmp/out.mp4';

  describe('image fixe (JPG/PNG/WEBP)', () => {
    const args = imageToVideoService.buildFfmpegArgs('/tmp/photo.jpg', OUT, 10);

    it('boucle une frame unique avec un framerate d\'entrée bas', () => {
      expect(args).toContain('-loop');
      expect(args[args.indexOf('-loop') + 1]).toBe('1');
      expect(args).toContain('-framerate');
      expect(args[args.indexOf('-framerate') + 1]).toBe('1');
    });

    it('n\'utilise pas -ignore_loop (option du démuxeur GIF)', () => {
      expect(args).not.toContain('-ignore_loop');
    });
  });

  describe('GIF', () => {
    const args = imageToVideoService.buildFfmpegArgs('/tmp/anim.gif', OUT, 8);

    it('rejoue le GIF en boucle via -ignore_loop 0', () => {
      expect(args).toContain('-ignore_loop');
      expect(args[args.indexOf('-ignore_loop') + 1]).toBe('0');
    });

    it('n\'applique NI -loop 1 NI -framerate 1 (fige la 1re frame → animation perdue)', () => {
      expect(args).not.toContain('-loop');
      expect(args).not.toContain('-framerate');
    });

    it('borne la durée de sortie à la durée demandée', () => {
      expect(args[args.indexOf('-t') + 1]).toBe('8');
      // -t doit rester une option d'ENTRÉE (avant -i), sinon le loop est infini
      expect(args.indexOf('-t')).toBeLessThan(args.indexOf('-i'));
    });

    it('détecte l\'extension quelle que soit la casse', () => {
      expect(imageToVideoService.isAnimatedSource('/tmp/ANIM.GIF')).toBe(true);
      expect(imageToVideoService.isAnimatedSource('/tmp/photo.png')).toBe(false);
    });
  });

  describe('options communes (préservées pour les deux régimes)', () => {
    it.each([['/tmp/photo.png'], ['/tmp/anim.gif']])('%s : sortie 25 fps, yuv420p, faststart', (input) => {
      const args = imageToVideoService.buildFfmpegArgs(input, OUT, 10);
      expect(args[args.indexOf('-r') + 1]).toBe('25');
      expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
      expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
      expect(args[args.length - 1]).toBe(OUT);
    });

    it('applique le filtre fond flou quand demandé', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/anim.gif', OUT, 10, 'libx264', true);
      expect(args[args.indexOf('-filter_complex') + 1]).toContain('boxblur');
    });

    it('applique le filtre bandes noires par défaut', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/anim.gif', OUT, 10, 'libx264', false);
      expect(args[args.indexOf('-filter_complex') + 1]).toContain('pad=1280:720');
    });

    it('utilise -q:v pour les codecs non-libx264', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/photo.png', OUT, 10, 'mpeg4');
      expect(args).toContain('-q:v');
      expect(args).not.toContain('-crf');
    });
  });
});
