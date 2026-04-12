import path from 'path';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import logger from '../config/logger';
import { videoRepository } from '../repositories';
import { v4 as uuidv4 } from 'uuid';
import metricsService from '../services/metrics.service';

/**
 * Calcule le checksum SHA256 d'un buffer
 */
export function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calcule le checksum SHA256 d'un fichier en streaming (sans le charger en mémoire)
 */
export function calculateChecksumFromFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Corrige l'encodage latin1 de multer pour les noms de fichiers UTF-8.
 * Multer 1.4.x décode le header Content-Disposition en latin1 au lieu d'UTF-8,
 * ce qui corrompt les caractères accentués (ex: "Soirée" → "SoirÃ©e").
 */
export function fixMulterEncoding(filename: string): string {
  try {
    const fixed = Buffer.from(filename, 'latin1').toString('utf8');
    if (!fixed.includes('\ufffd') && fixed !== filename) {
      metricsService.recordFilenameEncodingCorrection();
      logger.info('Fixed multer latin1 encoding', { original: filename, fixed });
      return fixed;
    }
  } catch {
    // En cas d'erreur, retourner l'original
  }
  return filename;
}

/**
 * Sanitize un nom de fichier pour le stockage.
 * Utilise la normalisation Unicode NFD pour gérer correctement tous les accents.
 */
export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);

  const sanitized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Supprime les diacritiques (accents)
    .replace(/\s+/g, '_')             // Espaces → underscores
    .replace(/[^a-zA-Z0-9_-]/g, '')   // Supprime les caractères spéciaux
    .replace(/_+/g, '_')              // Évite les underscores multiples
    .substring(0, 100);               // Limiter la longueur

  return sanitized + ext.toLowerCase();
}

/**
 * Génère un nom de fichier unique basé sur le nom original
 * Si le fichier existe déjà, ajoute un suffixe numérique (ex: video_1.mp4, video_2.mp4)
 */
export async function generateUniqueFilename(originalName: string): Promise<string> {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized);
  const baseName = path.basename(sanitized, ext);

  // Vérifier si le nom existe déjà en base
  let filename = sanitized;
  let counter = 0;

  for (;;) {
    const exists = await videoRepository.filenameExists(filename);

    if (!exists) {
      // Nom disponible
      return filename;
    }

    // Nom pris, incrémenter le compteur
    counter++;
    filename = `${baseName}_${counter}${ext}`;

    // Sécurité: éviter boucle infinie
    if (counter > 1000) {
      // Fallback vers UUID si trop de collisions
      logger.warn('Too many filename collisions, falling back to UUID', { originalName });
      return `${baseName}_${uuidv4().substring(0, 8)}${ext}`;
    }
  }
}
