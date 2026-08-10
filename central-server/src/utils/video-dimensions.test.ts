/**
 * Dimensions à l'upload — le socle de tout diagnostic de format.
 *
 * Contrat critique : la sonde ne doit JAMAIS faire échouer un upload. Une vidéo
 * dont on ne sait pas lire les dimensions doit continuer à s'uploader — on perd
 * le diagnostic, pas le fichier.
 */

import { probeVideoDimensions, dimensionsMetadata } from './video-dimensions';
import { thumbnailService } from '../services/thumbnail.service';

jest.mock('../services/thumbnail.service', () => ({
  thumbnailService: { extractMetadata: jest.fn() },
}));

const mockExtract = thumbnailService.extractMetadata as jest.MockedFunction<
  typeof thumbnailService.extractMetadata
>;

const meta = (over: Partial<{ width: number; height: number; duration: number; fps: number }> = {}) => ({
  duration: 15.566667,
  width: 1600,
  height: 120,
  codec: 'h264',
  bitrate: 683_000,
  fps: 30,
  pixFmt: 'yuv420p',
  hasAlpha: false,
  ...over,
});

describe('probeVideoDimensions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renvoie les dimensions mesurées', async () => {
    mockExtract.mockResolvedValue(meta());
    // Cas réel : la vidéo sponsor SIEHR livrée pour un côté de Piraths.
    await expect(probeVideoDimensions('/tmp/siehr.mp4')).resolves.toEqual({
      width: 1600,
      height: 120,
      duration: 15.57,
      fps: 30,
    });
  });

  it('arrondit la durée au centième', async () => {
    mockExtract.mockResolvedValue(meta({ duration: 15.566667 }));
    const d = await probeVideoDimensions('/tmp/v.mp4');
    expect(d?.duration).toBe(15.57);
  });

  it('traite 0×0 comme INCONNU, pas comme une mesure', async () => {
    // Persister 0 serait pire que rien : ça ferait croire à une mesure.
    mockExtract.mockResolvedValue(meta({ width: 0, height: 0 }));
    await expect(probeVideoDimensions('/tmp/v.mp4')).resolves.toBeNull();
  });

  it('renvoie null sans chemin (upload en mémoire, pas de fichier disque)', async () => {
    await expect(probeVideoDimensions(undefined)).resolves.toBeNull();
    await expect(probeVideoDimensions(null)).resolves.toBeNull();
    await expect(probeVideoDimensions('')).resolves.toBeNull();
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('ne propage JAMAIS une erreur — un upload ne tombe pas à cause d’une sonde', async () => {
    mockExtract.mockRejectedValue(new Error('ffprobe introuvable'));
    await expect(probeVideoDimensions('/tmp/v.mp4')).resolves.toBeNull();
  });
});

describe('dimensionsMetadata', () => {
  it('produit le fragment à fusionner dans videos.metadata', () => {
    expect(dimensionsMetadata({ width: 1600, height: 120, duration: 15.57, fps: 30 })).toEqual({
      width: 1600,
      height: 120,
      duration: 15.57,
      fps: 30,
    });
  });

  it('n’écrit aucune clé quand la mesure a échoué', () => {
    // Des clés à null pollueraient le JSONB sans rien apprendre.
    expect(dimensionsMetadata(null)).toEqual({});
  });

  it('omet fps quand il est illisible', () => {
    const out = dimensionsMetadata({ width: 800, height: 600, duration: 10, fps: 0 });
    expect(out).toEqual({ width: 800, height: 600, duration: 10 });
    expect('fps' in out).toBe(false);
  });
});
