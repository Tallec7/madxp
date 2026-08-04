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

    // Incident 2026-08-04 : une bannière 1200x150 était scalée en 5760x720 puis
    // rognée par l'overlay → rendu en zoom avec le texte coupé. La largeur `-1`
    // ne laisse aucune boîte englobante à `force_original_aspect_ratio=decrease`.
    it('fond flou : le foreground est borné par les DEUX dimensions du canvas', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/banner.gif', OUT, 10, 'libx264', true);
      const filter = args[args.indexOf('-filter_complex') + 1];
      const fg = filter.split(';').find(chain => chain.endsWith('[fg]'));

      expect(fg).toBeDefined();
      expect(fg).toContain('scale=1280:720:force_original_aspect_ratio=decrease');
      // Toute largeur libre (-1 / -2 / iw*…) laisserait le foreground déborder
      expect(fg).not.toMatch(/scale=-\d/);
    });

    it('fond flou : le background couvre le canvas puis est recadré', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/banner.gif', OUT, 10, 'libx264', true);
      const filter = args[args.indexOf('-filter_complex') + 1];
      const bg = filter.split(';').find(chain => chain.endsWith('[bg]'));

      // `increase` + crop pour le fond (il DOIT déborder puis être rogné),
      // à ne pas confondre avec le `decrease` du foreground.
      expect(bg).toContain('force_original_aspect_ratio=increase');
      expect(bg).toContain('crop=1280:720');
    });

    // Décision produit 2026-08-04 : un bandeau sponsor doit rester un bandeau.
    // Le player TV applique déjà `object-fit: contain` — cuire un canvas 16:9
    // dans le fichier cadrait deux fois et gâchait la définition du visuel.
    describe('sortie par défaut : ratio source préservé', () => {
      const filterOf = (input: string): string => {
        const args = imageToVideoService.buildFfmpegArgs(input, OUT, 10, 'libx264', false);
        return args[args.indexOf('-filter_complex') + 1];
      };

      it('ne force aucune dimension fixe (ni pad, ni canvas 1280x720)', () => {
        const filter = filterOf('/tmp/banner.gif');
        expect(filter).not.toContain('pad=');
        expect(filter).not.toContain('1280:720');
      });

      it('plafonne le plus grand côté à 1920 sans jamais agrandir', () => {
        // `min(1920,iw)` : la boîte vaut la source quand elle est plus petite
        // que le plafond → pas d'upscale d'un petit GIF.
        const filter = filterOf('/tmp/banner.gif');
        expect(filter).toContain("scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease");
      });

      it('force des dimensions paires (exigence yuv420p/H.264)', () => {
        // Sans ça une source 1201x151 casse l'encodage.
        expect(filterOf('/tmp/banner.gif')).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
      });

      it('force des pixels carrés', () => {
        expect(filterOf('/tmp/banner.gif')).toContain('setsar=1');
      });

      it('s\'applique aux images fixes comme aux GIF', () => {
        expect(filterOf('/tmp/photo.png')).toBe(filterOf('/tmp/anim.gif'));
      });
    });

    it('habillage 16:9 : uniquement quand blurBackground est explicitement demandé', () => {
      const withBlur = imageToVideoService.buildFfmpegArgs('/tmp/anim.gif', OUT, 10, 'libx264', true);
      const withoutBlur = imageToVideoService.buildFfmpegArgs('/tmp/anim.gif', OUT, 10, 'libx264', false);
      expect(withBlur[withBlur.indexOf('-filter_complex') + 1]).toContain('1280:720');
      expect(withoutBlur[withoutBlur.indexOf('-filter_complex') + 1]).not.toContain('1280:720');
    });

    it('utilise -q:v pour les codecs non-libx264', () => {
      const args = imageToVideoService.buildFfmpegArgs('/tmp/photo.png', OUT, 10, 'mpeg4');
      expect(args).toContain('-q:v');
      expect(args).not.toContain('-crf');
    });
  });
});
