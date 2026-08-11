/**
 * Téléchargement d'une URL vers un fichier disque.
 *
 * Extrait de `led-export-worker.service.ts` (PROP-015) : le détecteur de marges a
 * besoin exactement du même geste — récupérer un MP4 du FTP pour le passer à
 * ffmpeg. Deux copies de la même boucle de redirects auraient divergé au premier
 * correctif.
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';

/** Télécharge une URL (http/https) vers `dest`. Suit jusqu'à `redirects` redirections. */
export function downloadToFile(url: string, dest: string, redirects = 3): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('too many redirects'));
        return resolve(downloadToFile(res.headers.location, dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`download failed: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => reject(err));
    });
    req.on('error', (err) => reject(err));
  });
}

export default downloadToFile;
