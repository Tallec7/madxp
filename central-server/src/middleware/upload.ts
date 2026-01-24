import multer from 'multer';

// Configuration du stockage en mémoire (pour upload vers Supabase Storage)
const storage = multer.memoryStorage();

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

// Configuration multer pour les vidéos
export const uploadVideo = multer({
  storage,
  fileFilter: videoFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  }
});

// Configuration multer pour les images (conversion en vidéo)
export const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max pour les images
  }
});

export const uploadUpdatePackage = multer({
  storage,
  fileFilter: updatePackageFilter,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max
  }
});
