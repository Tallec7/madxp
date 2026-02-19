import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

// Dossier temporaire pour les uploads (disk storage au lieu de memory storage)
// Évite de charger les fichiers volumineux en mémoire (500MB vidéo = OOM sur 256MB heap)
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'neopro-uploads');

// Créer le dossier temp au démarrage
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
  logger.info('Created upload temp directory', { path: UPLOAD_TEMP_DIR });
}

// Disk storage : les fichiers sont écrits sur disque au lieu de rester en RAM
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (_req, file, cb) => {
    // Nom unique pour éviter les collisions
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Storage mémoire conservé pour les petits fichiers (images < 50MB)
const memoryStorage = multer.memoryStorage();

// Filtre pour n'accepter que les vidéos
const videoFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Formats acceptés: MP4, WebM, OGG, MOV, AVI, MKV`));
  }
};

const updatePackageFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/gzip',
    'application/x-gzip',
    'application/zip',
    'application/x-tar',
    'application/x-gtar',
    'application/octet-stream'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Formats acceptés: .gz, .zip, .tar`));
  }
};

// Filtre pour n'accepter que les images
const imageFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Formats acceptés: JPG, PNG, WEBP`));
  }
};

// Configuration multer pour les vidéos — DISK STORAGE (évite OOM)
export const uploadVideo = multer({
  storage: diskStorage,
  fileFilter: videoFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  }
});

// Configuration multer pour les images (conversion en vidéo) — Memory OK (max 50MB)
export const uploadImage = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max pour les images
  }
});

// Configuration multer pour les paquets de mise à jour — DISK STORAGE (jusqu'à 1GB)
export const uploadUpdatePackage = multer({
  storage: diskStorage,
  fileFilter: updatePackageFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max
  }
});

/**
 * Supprime un fichier temporaire après upload.
 * À appeler dans les controllers après traitement du fichier.
 */
export function cleanupTempFile(filePath: string): void {
  if (!filePath || !filePath.startsWith(UPLOAD_TEMP_DIR)) {
    return;
  }
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.warn('Failed to cleanup temp upload file', { path: filePath, error: err.message });
    }
  });
}

/**
 * Nettoyage périodique des fichiers temporaires abandonnés (> 1h)
 */
export function cleanupStaleTempFiles(): void {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(UPLOAD_TEMP_DIR);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(UPLOAD_TEMP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > ONE_HOUR_MS) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // Fichier déjà supprimé ou inaccessible
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale temp upload files', { count: cleaned });
    }
  } catch (error) {
    logger.warn('Error during temp upload cleanup', { error });
  }
}
