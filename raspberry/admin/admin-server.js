#!/usr/bin/env node

/**
 * Serveur Web Admin pour Neopro Raspberry Pi
 * Interface d'administration accessible sur http://neopro.local:8080
 *
 * Fonctionnalités:
 * - Dashboard système (CPU, mémoire, température, stockage)
 * - Upload de vidéos
 * - Configuration WiFi client
 * - Visualisation des logs
 * - Gestion des mises à jour
 * - Redémarrage des services
 */

const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');
const fsCore = require('fs');
const fs = fsCore.promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Configuration
const app = express();
const PORT = process.env.ADMIN_PORT || 8080;
const DEFAULT_NEOPRO_DIR = path.resolve(__dirname, '..');
const NEOPRO_DIR = process.env.NEOPRO_DIR || DEFAULT_NEOPRO_DIR;
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const TEMP_UPLOAD_DIR = path.join(NEOPRO_DIR, 'uploads-temp');
const LOGS_DIR = path.join(NEOPRO_DIR, 'logs');
// Single source of truth: webapp/configuration.json
const CONFIG_FILE_CANDIDATES = [
  process.env.CONFIG_PATH,
  path.join(NEOPRO_DIR, 'webapp', 'configuration.json'),
].filter((value, index, self) => value && self.indexOf(value) === index);
const VIDEO_MAPPING_CACHE_DURATION = 60 * 1000; // 1 minute cache pour limiter les lectures disque
let videoMappingCache = null;
let videoMappingCacheTime = 0;
const VIDEO_METADATA_CACHE_DURATION = 60 * 1000;
let videoMetadataCache = null;
let videoMetadataCacheTime = 0;
const CONFIG_JSON_INDENT = 4;

console.log(`[admin] NEOPRO_DIR resolved to ${NEOPRO_DIR}`);
console.log(`[admin] Videos directory: ${VIDEOS_DIR}`);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(VIDEOS_DIR));

async function resolveConfigurationPath() {
  for (const candidate of CONFIG_FILE_CANDIDATES) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        console.log('[admin] configuration.json detected at', candidate);
        return candidate;
      }
    } catch (error) {
      // Ignorer et tester la suivante
    }
  }
  console.warn('[admin] Aucun configuration.json trouvé parmi', CONFIG_FILE_CANDIDATES);
  return null;
}

function sanitizeSegment(value, fallback) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();
}

function sanitizeFilename(value, fallback) {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const cleaned = trimmed
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
  return cleaned || fallback;
}

function extractPathSegments(videoPath) {
  if (!videoPath) {
    return null;
  }
  const normalized = videoPath.replace(/\\/g, '/');
  const withoutPrefix = normalized.startsWith('videos/')
    ? normalized.slice('videos/'.length)
    : normalized;

  const segments = withoutPrefix.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return {
    category: segments[0],
    subcategory: segments.length > 1 ? segments[1] : null
  };
}

async function loadVideoPathMapping() {
  if (videoMappingCache && Date.now() - videoMappingCacheTime < VIDEO_MAPPING_CACHE_DURATION) {
    return videoMappingCache;
  }

  const mapping = { categories: {}, subcategories: {} };

  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      console.warn('[admin] Impossible de localiser configuration.json pour déterminer les dossiers vidéo');
    } else {
      const configRaw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configRaw);
      const categories = config.categories || [];

      for (const category of categories) {
        if (!category || !category.id) continue;
        const categoryKey = category.id.trim().toLowerCase();
        let categoryDir = null;

        const directVideos = category.videos || [];
        for (const video of directVideos) {
          const parsed = extractPathSegments(video.path);
          if (parsed?.category) {
            categoryDir = parsed.category;
            break;
          }
        }

        const subcategories = category.subCategories || [];
        for (const sub of subcategories) {
          if (!sub || !sub.id) continue;
          const subKey = `${categoryKey}::${sub.id.trim().toLowerCase()}`;
          let subDir = null;

          const subVideos = sub.videos || [];
          for (const video of subVideos) {
            const parsed = extractPathSegments(video.path);
            if (parsed?.subcategory) {
              subDir = parsed.subcategory;
            }
            if (parsed?.category && !categoryDir) {
              categoryDir = parsed.category;
            }
            if (subDir && categoryDir) {
              break;
            }
          }

          if (subDir) {
            mapping.subcategories[subKey] = subDir;
          }
        }

        if (categoryDir) {
          mapping.categories[categoryKey] = categoryDir;
        }
      }
    }
  } catch (error) {
    console.warn('[admin] Erreur lors du chargement de configuration.json:', error.message);
  }

  videoMappingCache = mapping;
  videoMappingCacheTime = Date.now();
  return mapping;
}

function invalidateVideoCaches() {
  videoMappingCache = null;
  videoMappingCacheTime = 0;
  videoMetadataCache = null;
  videoMetadataCacheTime = 0;
}

/**
 * Vérifie si un élément est verrouillé (contenu NEOPRO)
 * @param {Object} item - Catégorie, sous-catégorie ou vidéo
 * @returns {boolean} true si verrouillé
 */
function isLocked(item) {
  return item && (item.locked === true || item.owner === 'neopro');
}

/**
 * Vérifie si une catégorie peut être modifiée
 * @param {Object} category - Catégorie à vérifier
 * @returns {Object} { allowed: boolean, reason?: string }
 */
function canModifyCategory(category) {
  if (isLocked(category)) {
    return {
      allowed: false,
      reason: 'Cette catégorie est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

/**
 * Vérifie si une vidéo peut être modifiée/supprimée
 * @param {Object} video - Vidéo à vérifier
 * @param {Object} category - Catégorie parente
 * @param {Object} subcategory - Sous-catégorie parente (optionnelle)
 * @returns {Object} { allowed: boolean, reason?: string }
 */
function canModifyVideo(video, category, subcategory = null) {
  if (isLocked(video)) {
    return {
      allowed: false,
      reason: 'Cette vidéo est gérée par NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (isLocked(category)) {
    return {
      allowed: false,
      reason: 'Cette vidéo appartient à une catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  if (subcategory && isLocked(subcategory)) {
    return {
      allowed: false,
      reason: 'Cette vidéo appartient à une sous-catégorie NEOPRO et ne peut pas être modifiée.',
    };
  }
  return { allowed: true };
}

/**
 * Trouve une catégorie et optionnellement une vidéo/sous-catégorie dans la config
 * @param {Object} config - Configuration complète
 * @param {string} categoryId - ID de la catégorie
 * @param {string} subcategoryId - ID de la sous-catégorie (optionnel)
 * @param {string} videoPath - Chemin de la vidéo (optionnel)
 * @returns {Object} { category, subcategory?, video? }
 */
function findInConfig(config, categoryId, subcategoryId = null, videoPath = null) {
  const category = (config.categories || []).find(
    (c) => c.id === categoryId || c.name === categoryId
  );
  if (!category) {
    return { category: null };
  }

  let subcategory = null;
  if (subcategoryId) {
    subcategory = (category.subCategories || []).find(
      (s) => s.id === subcategoryId || s.name === subcategoryId
    );
  }

  let video = null;
  if (videoPath) {
    const normalizedPath = videoPath.replace(/\\/g, '/');
    if (subcategory) {
      video = (subcategory.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    } else {
      video = (category.videos || []).find(
        (v) => v.path && v.path.replace(/\\/g, '/') === normalizedPath
      );
    }
  }

  return { category, subcategory, video };
}

async function getVideoMetadataFromConfig() {
  if (videoMetadataCache && Date.now() - videoMetadataCacheTime < VIDEO_METADATA_CACHE_DURATION) {
    return videoMetadataCache;
  }

  const metadata = {};
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      videoMetadataCache = metadata;
      videoMetadataCacheTime = Date.now();
      return metadata;
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    for (const category of config.categories || []) {
      if (!category) continue;
      const categoryId = (category.id || category.name || '').trim();

      (category.videos || []).forEach(video => {
        if (!video?.path) {
          return;
        }
        metadata[video.path.replace(/\\/g, '/')] = {
          displayName: video.name,
          categoryId: categoryId,
          subcategoryId: null
        };
      });

      for (const sub of category.subCategories || []) {
        if (!sub) {
          continue;
        }
        const subId = (sub.id || sub.name || '').trim();
        (sub.videos || []).forEach(video => {
          if (!video?.path) {
            return;
          }
          metadata[video.path.replace(/\\/g, '/')] = {
            displayName: video.name,
            categoryId: categoryId,
            subcategoryId: subId || null
          };
        });
      }
    }
  } catch (error) {
    console.warn('[admin] Unable to build configuration video metadata map:', error.message);
  }

  videoMetadataCache = metadata;
  videoMetadataCacheTime = Date.now();
  return metadata;
}

async function resolveUploadDirectories(categoryId, subcategoryId) {
  const mapping = await loadVideoPathMapping();
  const normalizedCategoryKey = (categoryId || '').trim().toLowerCase();
  const fallbackCategory = sanitizeSegment(categoryId, 'AUTRES');
  const resolvedCategory = mapping.categories[normalizedCategoryKey] || fallbackCategory;

  let resolvedSubcategory = null;
  if (subcategoryId) {
    const normalizedSubKey = `${normalizedCategoryKey}::${subcategoryId.trim().toLowerCase()}`;
    resolvedSubcategory = mapping.subcategories[normalizedSubKey]
      || sanitizeSegment(subcategoryId, null);
  }

  return {
    category: resolvedCategory || 'AUTRES',
    subcategory: resolvedSubcategory
  };
}

function buildDisplayNameFromFilename(filename) {
  const baseName = path.basename(filename, path.extname(filename));
  return baseName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDisplayName(filename, providedName) {
  const fallback = buildDisplayNameFromFilename(filename);
  const cleaned = (providedName || '').trim();
  return cleaned || fallback || filename;
}

function guessMimeFromExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  switch (ext) {
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    default:
      return 'video/mp4';
  }
}

function createVideoEntry(filename, relativePath, mimeType, displayName) {
  const resolvedName = resolveDisplayName(filename, displayName);

  return {
    name: resolvedName,
    path: relativePath,
    type: mimeType || 'video/mp4'
  };
}

async function ensureCategoryStructure(
  config,
  categoryId,
  subcategoryId,
  resolvedCategoryDir,
  resolvedSubcategoryDir
) {
  config.categories = config.categories || [];
  const normalizedCategoryId = (categoryId || resolvedCategoryDir || 'Autres').trim();
  const normalizedCategoryKey = normalizedCategoryId.toLowerCase();

  let category = config.categories.find(
    cat => (cat.id || '').trim().toLowerCase() === normalizedCategoryKey
  );

  if (!category) {
    category = {
      id: normalizedCategoryId,
      name: normalizedCategoryId,
      videos: []
    };
    config.categories.push(category);
  }

  if (subcategoryId || resolvedSubcategoryDir) {
    category.subCategories = category.subCategories || [];
    const normalizedSubId = (subcategoryId || resolvedSubcategoryDir).trim();
    const normalizedSubKey = normalizedSubId.toLowerCase();

    let subCategory = category.subCategories.find(
      sub => (sub.id || '').trim().toLowerCase() === normalizedSubKey
    );

    if (!subCategory) {
      subCategory = {
        id: normalizedSubId,
        name: normalizedSubId,
        videos: []
      };
      category.subCategories.push(subCategory);
    }

    subCategory.videos = subCategory.videos || [];
    return subCategory.videos;
  }

  category.videos = category.videos || [];
  return category.videos;
}

async function updateConfigurationWithVideo(
  categoryId,
  subcategoryId,
  resolvedCategory,
  resolvedSubcategory,
  filename,
  mimeType,
  displayName
) {
  const configPath = await resolveConfigurationPath();
  if (!configPath) {
    throw new Error('Impossible de localiser configuration.json pour mettre à jour la télécommande');
  }

  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);

  const targetVideos = await ensureCategoryStructure(
    config,
    categoryId,
    subcategoryId,
    resolvedCategory,
    resolvedSubcategory
  );
  const relativePath = ['videos', resolvedCategory || sanitizeSegment(categoryId, 'AUTRES')];
  if (resolvedSubcategory) {
    relativePath.push(resolvedSubcategory);
  }
  relativePath.push(filename);
  const finalPath = relativePath.filter(Boolean).join('/');

  const alreadyExists = targetVideos.some(video => video.path === finalPath);

  if (!alreadyExists) {
    const newEntry = createVideoEntry(filename, finalPath, mimeType, displayName);
    targetVideos.push(newEntry);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();
    console.log('[admin] configuration.json updated with new video entry', newEntry);
  } else {
    console.log('[admin] configuration.json already references video path', finalPath);
  }
}

async function removeVideoFromConfig(relativePath) {
  const configPath = await resolveConfigurationPath();
  if (!configPath) {
    console.warn('[admin] Impossible de localiser configuration.json pour supprimer la vidéo', relativePath);
    return;
  }

  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);
  let updated = false;

  const removeFromList = (videos = []) => {
    const index = videos.findIndex(video => video.path === relativePath);
    if (index !== -1) {
      videos.splice(index, 1);
      updated = true;
    }
  };

  for (const category of config.categories || []) {
    removeFromList(category.videos);
    for (const sub of category.subCategories || []) {
      removeFromList(sub.videos);
    }
  }

  if (updated) {
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();
    console.log('[admin] configuration.json cleaned from video path', relativePath);
  }
}

async function cleanupEmptyDirs(dirPath, stopAt) {
  const resolvedStop = path.resolve(stopAt);
  let current = path.resolve(dirPath);

  while (current.startsWith(resolvedStop) && current !== resolvedStop) {
    const entries = await fs.readdir(current);
    if (entries.length === 0) {
      await fs.rmdir(current);
      current = path.dirname(current);
    } else {
      break;
    }
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
      cb(null, TEMP_UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const cleanName = sanitizeFilename(file.originalname, file.originalname);
    cb(null, cleanName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter seulement les vidéos
    const allowedMimes = ['video/mp4', 'video/x-matroska', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format vidéo non supporté. Utilisez MP4, MKV ou MOV.'));
    }
  }
});

/**
 * Utilitaires
 */

// Exécuter une commande shell de manière sécurisée
async function execCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { success: true, output: stdout, error: stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// S'assurer qu'un dossier existe (utile en dev local)
async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

// Obtenir les informations système
async function getSystemInfo() {
  try {
    // CPU
    const cpuUsage = await getCpuUsage();

    // Mémoire
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Température (Raspberry Pi)
    const tempResult = await execCommand('cat /sys/class/thermal/thermal_zone0/temp');
    const temperature = tempResult.success
      ? (parseInt(tempResult.output) / 1000).toFixed(1)
      : 'N/A';

    // Stockage
    const diskResult = await execCommand(`df -h ${NEOPRO_DIR} | tail -1`);
    const diskInfo = diskResult.success ? parseDiskInfo(diskResult.output) : null;

    // Uptime
    const uptimeSeconds = os.uptime();
    const uptime = formatUptime(uptimeSeconds);

    // Status des services
    const services = await getServicesStatus();

    return {
      cpu: cpuUsage,
      memory: {
        total: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        used: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        free: (freeMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
        percent: ((usedMem / totalMem) * 100).toFixed(1) + '%'
      },
      temperature: temperature + '°C',
      disk: diskInfo,
      uptime: uptime,
      services: services,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return { error: error.message };
  }
}

// Calculer l'usage CPU
async function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const usage = 100 - (100 * idle / total);

  return {
    usage: usage.toFixed(1) + '%',
    cores: cpus.length
  };
}

// Parser les informations de disque
function parseDiskInfo(output) {
  const parts = output.split(/\s+/);
  return {
    total: parts[1],
    used: parts[2],
    available: parts[3],
    percent: parts[4]
  };
}

// Formater l'uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Vérifier le status des services
async function getServicesStatus() {
  const services = ['neopro-app', 'nginx', 'hostapd', 'dnsmasq', 'avahi-daemon'];
  const statuses = {};

  if (os.platform() !== 'linux') {
    services.forEach(service => {
      statuses[service] = 'unavailable';
    });
    return statuses;
  }

  for (const service of services) {
    const result = await execCommand(`systemctl is-active ${service}`);
    if (!result.success || !result.output) {
      statuses[service] = 'unknown';
    } else {
      statuses[service] = result.output.trim() === 'active' ? 'running' : 'stopped';
    }
  }

  return statuses;
}

/**
 * Routes API
 */

// Page d'accueil (dashboard)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Informations système
app.get('/api/system', async (req, res) => {
  const info = await getSystemInfo();
  res.json(info);
});

// API: Configuration du club
app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(NEOPRO_DIR, 'club-config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    res.json(JSON.parse(configData));
  } catch (error) {
    res.status(500).json({ error: 'Configuration non trouvée' });
  }
});

// API: Liste des vidéos
app.get('/api/videos', async (req, res) => {
  try {
    await ensureDirectory(VIDEOS_DIR);
    console.log('[admin] GET /api/videos - listing directory:', VIDEOS_DIR);
    const metadata = await getVideoMetadataFromConfig();
    const videos = await listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);
    res.json({ videos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function listVideosRecursive(dir, baseDir = dir, metadata = {}) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const videos = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      const subVideos = await listVideosRecursive(fullPath, baseDir, metadata);
      videos.push(...subVideos);
    } else if (file.name.match(/\.(mp4|mkv|mov|avi)$/i)) {
      const stats = await fs.stat(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      const normalizedRelative = relativePath.replace(/\\/g, '/');
      const relativeDir = path.dirname(normalizedRelative);
      const configurationPath = ['videos', normalizedRelative].filter(Boolean).join('/');
      const configEntry = metadata[configurationPath];

      videos.push({
        name: file.name,
        path: normalizedRelative,
        category: relativeDir,
        displayName: configEntry?.displayName || buildDisplayNameFromFilename(file.name),
        configCategory: configEntry?.categoryId || null,
        configSubcategory: configEntry?.subcategoryId || null,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        modified: stats.mtime
      });
    }
  }

  return videos;
}

// API: Upload de vidéo (single)
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { category, subcategory } = await resolveUploadDirectories(
      req.body.category,
      req.body.subcategory
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, req.file.filename);
    await fs.rename(req.file.path, targetPath);
    await updateConfigurationWithVideo(
      req.body.category,
      req.body.subcategory,
      category,
      subcategory,
      req.file.filename,
      req.file.mimetype,
      req.body.displayName
    );

    console.log('[admin] Upload directory resolved', {
      requestedCategory: req.body.category,
      requestedSubcategory: req.body.subcategory,
      resolvedCategory: category,
      resolvedSubcategory: subcategory,
      targetPath
    });

    console.log('[admin] POST /api/videos/upload', {
      filename: req.file.filename,
      tempPath: req.file.path,
      finalPath: targetPath,
      size: req.file.size,
      category: req.body.category,
      subcategory: req.body.subcategory
    });

    res.json({
      success: true,
      message: 'Vidéo uploadée avec succès',
      file: {
        name: req.file.filename,
        size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
        path: targetPath
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Upload multiple de vidéos
app.post('/api/videos/upload-multiple', upload.array('videos', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { category, subcategory } = await resolveUploadDirectories(
      req.body.category,
      req.body.subcategory
    );
    const targetDir = subcategory
      ? path.join(VIDEOS_DIR, category, subcategory)
      : path.join(VIDEOS_DIR, category);
    await fs.mkdir(targetDir, { recursive: true });

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const targetPath = path.join(targetDir, file.filename);
        await fs.rename(file.path, targetPath);
        await updateConfigurationWithVideo(
          req.body.category,
          req.body.subcategory,
          category,
          subcategory,
          file.filename,
          file.mimetype,
          null // pas de displayName pour upload multiple
        );

        results.push({
          name: file.filename,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          path: targetPath,
          success: true
        });

        console.log('[admin] POST /api/videos/upload-multiple - file uploaded', {
          filename: file.filename,
          size: file.size,
          category,
          subcategory
        });
      } catch (fileError) {
        errors.push({
          name: file.filename,
          error: fileError.message
        });
        console.error('[admin] Error uploading file:', file.filename, fileError);
      }
    }

    console.log('[admin] POST /api/videos/upload-multiple complete', {
      total: req.files.length,
      success: results.length,
      failed: errors.length
    });

    res.json({
      success: errors.length === 0,
      message: `${results.length}/${req.files.length} vidéo(s) uploadée(s) avec succès`,
      files: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[admin] Error in upload-multiple:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une vidéo
app.delete('/api/videos/:category/:filename', async (req, res) => {
  try {
    const { category, filename } = req.params;
    const normalizedCategory = (category || '').replace(/\\/g, '/');
    const filePath = path.join(VIDEOS_DIR, normalizedCategory, filename);
    const relativePath = ['videos', normalizedCategory, filename]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');

    // Vérifier si la vidéo est verrouillée (NEOPRO)
    const configPath = await resolveConfigurationPath();
    if (configPath) {
      const configRaw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configRaw);
      for (const cat of config.categories || []) {
        // Chercher la vidéo dans les vidéos directes
        const video = (cat.videos || []).find(v => v.path === relativePath);
        if (video) {
          const canModify = canModifyVideo(video, cat);
          if (!canModify.allowed) {
            return res.status(403).json({ error: canModify.reason, locked: true });
          }
          break;
        }
        // Chercher dans les sous-catégories
        for (const sub of cat.subCategories || []) {
          const subVideo = (sub.videos || []).find(v => v.path === relativePath);
          if (subVideo) {
            const canModify = canModifyVideo(subVideo, cat, sub);
            if (!canModify.allowed) {
              return res.status(403).json({ error: canModify.reason, locked: true });
            }
            break;
          }
        }
      }
    }

    await fs.access(filePath);
    await fs.unlink(filePath);
    await cleanupEmptyDirs(path.dirname(filePath), VIDEOS_DIR);
    await removeVideoFromConfig(relativePath);

    res.json({ success: true, message: 'Vidéo supprimée', path: relativePath });
  } catch (error) {
    console.error('[admin] Error deleting video:', error);
    res.status(500).json({ error: 'Impossible de supprimer la vidéo' });
  }
});

app.put('/api/videos/edit', async (req, res) => {
  try {
    const {
      originalPath,
      categoryId,
      subcategoryId,
      displayName,
      newFilename
    } = req.body || {};

    const normalizedOriginal = (originalPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^videos\//i, '');
    const cleanCategoryId = (categoryId || '').trim();
    const cleanSubcategoryId = (subcategoryId || '').trim();
    const requestedFilename = sanitizeFilename(newFilename, null);

    if (!normalizedOriginal || normalizedOriginal.includes('..')) {
      return res.status(400).json({ error: 'Chemin de fichier invalide' });
    }

    if (!cleanCategoryId) {
      return res.status(400).json({ error: 'Catégorie requise' });
    }

    const sourcePath = path.join(VIDEOS_DIR, normalizedOriginal);
    await fs.access(sourcePath);

    const currentFilename = path.basename(normalizedOriginal);
    const currentExt = path.extname(currentFilename);
    let finalFilename = requestedFilename || currentFilename;
    if (!path.extname(finalFilename) && currentExt) {
      finalFilename = `${finalFilename}${currentExt}`;
    }

    const { category: resolvedCategory, subcategory: resolvedSubcategory } =
      await resolveUploadDirectories(cleanCategoryId, cleanSubcategoryId || null);

    const destinationDir = resolvedSubcategory
      ? path.join(VIDEOS_DIR, resolvedCategory, resolvedSubcategory)
      : path.join(VIDEOS_DIR, resolvedCategory);
    await fs.mkdir(destinationDir, { recursive: true });

    const destinationPath = path.join(destinationDir, finalFilename);
    const shouldMove = path.resolve(destinationPath) !== path.resolve(sourcePath);

    if (shouldMove) {
      await fs.rename(sourcePath, destinationPath);
      await cleanupEmptyDirs(path.dirname(sourcePath), VIDEOS_DIR);
    }

    const originalConfigPath = ['videos', normalizedOriginal]
      .filter(Boolean)
      .join('/')
      .replace(/\\/g, '/');
    const relativeDestinationPath = path
      .relative(VIDEOS_DIR, destinationPath)
      .replace(/\\/g, '/');

    await removeVideoFromConfig(originalConfigPath);
    await updateConfigurationWithVideo(
      cleanCategoryId,
      cleanSubcategoryId || null,
      resolvedCategory,
      resolvedSubcategory,
      finalFilename,
      guessMimeFromExtension(finalFilename),
      displayName
    );

    res.json({
      success: true,
      message: 'Vidéo mise à jour',
      video: {
        path: relativeDestinationPath,
        displayName: resolveDisplayName(finalFilename, displayName),
        category: path.dirname(relativeDestinationPath),
        configCategory: cleanCategoryId,
        configSubcategory: cleanSubcategoryId || null
      }
    });
  } catch (error) {
    console.error('[admin] Error editing video:', error);
    res.status(500).json({ error: 'Impossible de modifier la vidéo' });
  }
});

// API: Configuration complète (configuration.json)
app.get('/api/configuration', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Vidéos orphelines (sur disque mais pas dans config)
app.get('/api/videos/orphans', async (req, res) => {
  try {
    await ensureDirectory(VIDEOS_DIR);
    const metadata = await getVideoMetadataFromConfig();
    const allVideos = await listVideosRecursive(VIDEOS_DIR, VIDEOS_DIR, metadata);

    // Filtrer les vidéos non référencées dans la config
    const orphans = allVideos.filter(video => !video.configCategory);

    res.json({ orphans });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Ajouter une vidéo orpheline à la configuration
app.post('/api/videos/add-to-config', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId, displayName } = req.body;

    if (!videoPath || !categoryId) {
      return res.status(400).json({ error: 'videoPath et categoryId requis' });
    }

    // Vérifier que le fichier existe
    const fullPath = path.join(VIDEOS_DIR, videoPath);
    try {
      await fs.access(fullPath);
    } catch {
      return res.status(404).json({ error: 'Fichier vidéo non trouvé' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Trouver ou créer la catégorie
    config.categories = config.categories || [];
    let category = config.categories.find(
      cat => (cat.id || '').toLowerCase() === categoryId.toLowerCase()
    );

    if (!category) {
      category = {
        id: categoryId,
        name: categoryId,
        videos: [],
        subCategories: []
      };
      config.categories.push(category);
    }

    // Préparer l'entrée vidéo
    const filename = path.basename(videoPath);
    const fullVideoPath = `videos/${videoPath}`;
    const mimeType = guessMimeFromExtension(filename);
    const newEntry = createVideoEntry(
      filename,
      fullVideoPath,
      mimeType,
      displayName || buildDisplayNameFromFilename(filename)
    );

    // Ajouter à la bonne sous-catégorie ou directement à la catégorie
    if (subcategoryId) {
      category.subCategories = category.subCategories || [];
      let subCategory = category.subCategories.find(
        sub => (sub.id || '').toLowerCase() === subcategoryId.toLowerCase()
      );

      if (!subCategory) {
        subCategory = {
          id: subcategoryId,
          name: subcategoryId,
          videos: []
        };
        category.subCategories.push(subCategory);
      }

      subCategory.videos = subCategory.videos || [];
      const alreadyExists = subCategory.videos.some(v => v.path === fullVideoPath);
      if (!alreadyExists) {
        subCategory.videos.push(newEntry);
      }
    } else {
      category.videos = category.videos || [];
      const alreadyExists = category.videos.some(v => v.path === fullVideoPath);
      if (!alreadyExists) {
        category.videos.push(newEntry);
      }
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    res.json({
      success: true,
      message: 'Vidéo ajoutée à la configuration',
      entry: newEntry
    });
  } catch (error) {
    console.error('[admin] Error adding video to config:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une vidéo de la configuration et du disque
app.delete('/api/videos/delete-from-config', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId } = req.body;

    if (!videoPath) {
      return res.status(400).json({ error: 'videoPath requis' });
    }

    // Normaliser le chemin
    const normalizedPath = videoPath.replace(/\\/g, '/').replace(/^videos\//, '');
    const fullPath = path.join(VIDEOS_DIR, normalizedPath);

    // Supprimer le fichier du disque
    try {
      await fs.access(fullPath);
      await fs.unlink(fullPath);
      console.log('[admin] File deleted:', fullPath);

      // Nettoyer les dossiers vides
      await cleanupEmptyDirs(path.dirname(fullPath), VIDEOS_DIR);
    } catch (err) {
      console.warn('[admin] File not found or already deleted:', fullPath);
    }

    // Supprimer de la configuration
    const configVideoPath = videoPath.startsWith('videos/')
      ? videoPath
      : `videos/${normalizedPath}`;
    await removeVideoFromConfig(configVideoPath);

    res.json({
      success: true,
      message: 'Vidéo supprimée',
      path: videoPath
    });
  } catch (error) {
    console.error('[admin] Error deleting video from config:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Récupérer les timeCategories
app.get('/api/configuration/time-categories', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json({
      timeCategories: config.timeCategories || [],
      categories: (config.categories || []).map(cat => ({
        id: cat.id,
        name: cat.name
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Mettre à jour les timeCategories
app.put('/api/configuration/time-categories', async (req, res) => {
  try {
    const { timeCategories } = req.body;

    if (!Array.isArray(timeCategories)) {
      return res.status(400).json({ error: 'timeCategories doit être un tableau' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Valider chaque timeCategory
    for (const tc of timeCategories) {
      if (!tc.id || !tc.name) {
        return res.status(400).json({ error: 'Chaque timeCategory doit avoir un id et un name' });
      }
      if (!Array.isArray(tc.categoryIds)) {
        tc.categoryIds = [];
      }
    }

    config.timeCategories = timeCategories;
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] timeCategories updated:', timeCategories.length, 'entries');

    res.json({
      success: true,
      message: 'TimeCategories mis à jour',
      timeCategories: config.timeCategories
    });
  } catch (error) {
    console.error('[admin] Error updating timeCategories:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Récupérer toutes les catégories
app.get('/api/configuration/categories', async (req, res) => {
  try {
    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    res.json({
      categories: config.categories || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Créer une nouvelle catégorie
app.post('/api/configuration/categories', async (req, res) => {
  try {
    const { id, name, videos, subCategories } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];

    // Vérifier si l'ID existe déjà
    if (config.categories.some(c => c.id === id)) {
      return res.status(400).json({ error: 'Une catégorie avec cet ID existe déjà' });
    }

    const newCategory = {
      id,
      name,
      videos: videos || [],
      subCategories: subCategories || []
    };

    config.categories.push(newCategory);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category created:', id);

    res.json({
      success: true,
      message: 'Catégorie créée',
      category: newCategory
    });
  } catch (error) {
    console.error('[admin] Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Mettre à jour une catégorie
app.put('/api/configuration/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const updates = req.body;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie est verrouillée (NEOPRO)
    const canModify = canModifyCategory(config.categories[categoryIndex]);
    if (!canModify.allowed) {
      return res.status(403).json({ error: canModify.reason, locked: true });
    }

    // Mettre à jour les champs autorisés
    if (updates.name) config.categories[categoryIndex].name = updates.name;

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category updated:', categoryId);

    res.json({
      success: true,
      message: 'Catégorie mise à jour',
      category: config.categories[categoryIndex]
    });
  } catch (error) {
    console.error('[admin] Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une catégorie
app.delete('/api/configuration/categories/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const categoryIndex = config.categories.findIndex(c => c.id === categoryId);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie est verrouillée (NEOPRO)
    const category = config.categories[categoryIndex];
    const canModify = canModifyCategory(category);
    if (!canModify.allowed) {
      return res.status(403).json({ error: canModify.reason, locked: true });
    }

    // Supprimer la catégorie
    config.categories.splice(categoryIndex, 1);

    // Supprimer également des timeCategories
    if (config.timeCategories) {
      config.timeCategories.forEach(tc => {
        tc.categoryIds = (tc.categoryIds || []).filter(id => id !== categoryId);
      });
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Category deleted:', categoryId);

    res.json({
      success: true,
      message: 'Catégorie supprimée'
    });
  } catch (error) {
    console.error('[admin] Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Ajouter une sous-catégorie
app.post('/api/configuration/categories/:categoryId/subcategories', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { id, name, videos } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const category = config.categories.find(c => c.id === categoryId);

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    category.subCategories = category.subCategories || [];

    // Vérifier si l'ID existe déjà
    if (category.subCategories.some(s => s.id === id)) {
      return res.status(400).json({ error: 'Une sous-catégorie avec cet ID existe déjà' });
    }

    const newSubCategory = {
      id,
      name,
      videos: videos || []
    };

    category.subCategories.push(newSubCategory);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] SubCategory created:', categoryId, '/', id);

    res.json({
      success: true,
      message: 'Sous-catégorie créée',
      subCategory: newSubCategory
    });
  } catch (error) {
    console.error('[admin] Error creating subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Réorganiser une vidéo dans la même liste
app.put('/api/videos/reorder', async (req, res) => {
  try {
    const { videoPath, categoryId, subcategoryId, newIndex } = req.body;

    if (!videoPath || !categoryId || newIndex === undefined) {
      return res.status(400).json({ error: 'videoPath, categoryId et newIndex sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Find the category
    const category = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === categoryId.toLowerCase()
    );

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Get the target video list
    let videoList;
    if (subcategoryId) {
      const subCategory = (category.subCategories || []).find(
        s => (s.id || '').toLowerCase() === subcategoryId.toLowerCase()
      );
      if (!subCategory) {
        return res.status(404).json({ error: 'Sous-catégorie non trouvée' });
      }
      videoList = subCategory.videos || [];
      subCategory.videos = videoList;
    } else {
      videoList = category.videos || [];
      category.videos = videoList;
    }

    // Find video index
    const currentIndex = videoList.findIndex(v => v.path === videoPath);
    if (currentIndex === -1) {
      return res.status(404).json({ error: 'Vidéo non trouvée dans la liste' });
    }

    // Remove from current position and insert at new position
    const [video] = videoList.splice(currentIndex, 1);
    const adjustedIndex = newIndex > currentIndex ? newIndex - 1 : newIndex;
    videoList.splice(Math.min(adjustedIndex, videoList.length), 0, video);

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Video reordered:', videoPath, 'to index', newIndex);

    res.json({
      success: true,
      message: 'Vidéo réorganisée',
      newIndex: adjustedIndex
    });
  } catch (error) {
    console.error('[admin] Error reordering video:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Déplacer une vidéo vers une autre catégorie/sous-catégorie
app.put('/api/videos/move', async (req, res) => {
  try {
    const {
      videoPath,
      fromCategoryId,
      fromSubcategoryId,
      toCategoryId,
      toSubcategoryId,
      newIndex
    } = req.body;

    if (!videoPath || !fromCategoryId || !toCategoryId) {
      return res.status(400).json({ error: 'videoPath, fromCategoryId et toCategoryId sont requis' });
    }

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    // Find source category
    const fromCategory = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === fromCategoryId.toLowerCase()
    );
    if (!fromCategory) {
      return res.status(404).json({ error: 'Catégorie source non trouvée' });
    }

    // Get source video list
    let sourceList;
    if (fromSubcategoryId) {
      const fromSubCategory = (fromCategory.subCategories || []).find(
        s => (s.id || '').toLowerCase() === fromSubcategoryId.toLowerCase()
      );
      if (!fromSubCategory) {
        return res.status(404).json({ error: 'Sous-catégorie source non trouvée' });
      }
      sourceList = fromSubCategory.videos || [];
    } else {
      sourceList = fromCategory.videos || [];
    }

    // Find and remove video from source
    const videoIndex = sourceList.findIndex(v => v.path === videoPath);
    if (videoIndex === -1) {
      return res.status(404).json({ error: 'Vidéo non trouvée dans la source' });
    }
    const [video] = sourceList.splice(videoIndex, 1);

    // Find target category
    const toCategory = (config.categories || []).find(
      c => (c.id || '').toLowerCase() === toCategoryId.toLowerCase()
    );
    if (!toCategory) {
      return res.status(404).json({ error: 'Catégorie cible non trouvée' });
    }

    // Get target video list
    let targetList;
    if (toSubcategoryId) {
      const toSubCategory = (toCategory.subCategories || []).find(
        s => (s.id || '').toLowerCase() === toSubcategoryId.toLowerCase()
      );
      if (!toSubCategory) {
        return res.status(404).json({ error: 'Sous-catégorie cible non trouvée' });
      }
      targetList = toSubCategory.videos || [];
      toSubCategory.videos = targetList;
    } else {
      targetList = toCategory.videos || [];
      toCategory.videos = targetList;
    }

    // Insert at new position
    const insertIndex = newIndex !== undefined ? Math.min(newIndex, targetList.length) : targetList.length;
    targetList.splice(insertIndex, 0, video);

    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] Video moved:', videoPath, 'from', fromCategoryId, '/', fromSubcategoryId, 'to', toCategoryId, '/', toSubcategoryId);

    res.json({
      success: true,
      message: 'Vidéo déplacée',
      newIndex: insertIndex
    });
  } catch (error) {
    console.error('[admin] Error moving video:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Supprimer une sous-catégorie
app.delete('/api/configuration/categories/:categoryId/subcategories/:subCategoryId', async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;

    const configPath = await resolveConfigurationPath();
    if (!configPath) {
      return res.status(500).json({ error: 'Impossible de localiser configuration.json' });
    }

    const configRaw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configRaw);

    config.categories = config.categories || [];
    const category = config.categories.find(c => c.id === categoryId);

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Vérifier si la catégorie parente est verrouillée
    const canModifyCat = canModifyCategory(category);
    if (!canModifyCat.allowed) {
      return res.status(403).json({ error: canModifyCat.reason, locked: true });
    }

    category.subCategories = category.subCategories || [];
    const subIndex = category.subCategories.findIndex(s => s.id === subCategoryId);

    if (subIndex === -1) {
      return res.status(404).json({ error: 'Sous-catégorie non trouvée' });
    }

    // Vérifier si la sous-catégorie est verrouillée
    const subcategory = category.subCategories[subIndex];
    if (isLocked(subcategory)) {
      return res.status(403).json({
        error: 'Cette sous-catégorie est gérée par NEOPRO et ne peut pas être supprimée.',
        locked: true
      });
    }

    category.subCategories.splice(subIndex, 1);
    await fs.writeFile(configPath, JSON.stringify(config, null, CONFIG_JSON_INDENT));
    invalidateVideoCaches();

    console.log('[admin] SubCategory deleted:', categoryId, '/', subCategoryId);

    res.json({
      success: true,
      message: 'Sous-catégorie supprimée'
    });
  } catch (error) {
    console.error('[admin] Error deleting subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Logs
app.get('/api/logs/:service', async (req, res) => {
  const { service } = req.params;
  const lines = req.query.lines || 100;

  const serviceMap = {
    'app': 'neopro-app',
    'nginx': 'nginx',
    'system': ''
  };

  const serviceName = serviceMap[service];
  if (serviceName === undefined) {
    return res.status(400).json({ error: 'Service invalide' });
  }

  const command = serviceName
    ? `journalctl -u ${serviceName} -n ${lines} --no-pager`
    : `journalctl -n ${lines} --no-pager`;

  const result = await execCommand(command);

  if (result.success) {
    res.json({ logs: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Configuration WiFi client
app.post('/api/wifi/client', async (req, res) => {
  const { ssid, password } = req.body;

  if (!ssid || !password) {
    return res.status(400).json({ error: 'SSID et mot de passe requis' });
  }

  try {
    // Exécuter le script de configuration WiFi
    const scriptPath = path.join(__dirname, '..', 'scripts', 'setup-wifi-client.sh');
    const result = await execCommand(`sudo ${scriptPath} "${ssid}" "${password}"`);

    if (result.success) {
      res.json({ success: true, message: 'WiFi client configuré', output: result.output });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Redémarrer un service
app.post('/api/services/:service/restart', async (req, res) => {
  const { service } = req.params;
  const allowedServices = ['neopro-app', 'nginx', 'neopro-kiosk'];

  if (!allowedServices.includes(service)) {
    return res.status(400).json({ error: 'Service non autorisé' });
  }

  const result = await execCommand(`sudo systemctl restart ${service}`);

  if (result.success) {
    res.json({ success: true, message: `Service ${service} redémarré` });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// API: Redémarrer le système
app.post('/api/system/reboot', async (req, res) => {
  res.json({ success: true, message: 'Redémarrage du système dans 5 secondes...' });

  // Redémarrage différé pour avoir le temps de répondre
  setTimeout(() => {
    exec('sudo reboot');
  }, 5000);
});

// API: Arrêter le système
app.post('/api/system/shutdown', async (req, res) => {
  res.json({ success: true, message: 'Arrêt du système dans 5 secondes...' });

  setTimeout(() => {
    exec('sudo shutdown -h now');
  }, 5000);
});

// API: Mise à jour de l'application
app.post('/api/update', upload.single('package'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Créer un backup
    const backupName = `backup-${Date.now()}.tar.gz`;
    await execCommand(`tar -czf ${NEOPRO_DIR}/backups/${backupName} -C ${NEOPRO_DIR} webapp server`);

    // Extraire le nouveau package
    const extractDir = '/tmp/neopro-update';
    await execCommand(`rm -rf ${extractDir} && mkdir -p ${extractDir}`);
    await execCommand(`tar -xzf ${req.file.path} -C ${extractDir}`);

    // Copier les nouveaux fichiers
    await execCommand(`cp -r ${extractDir}/deploy/webapp/* ${NEOPRO_DIR}/webapp/`);
    await execCommand(`cp -r ${extractDir}/deploy/server/* ${NEOPRO_DIR}/server/`);

    // Installer les dépendances
    await execCommand(`cd ${NEOPRO_DIR}/server && npm install --production`);

    // Redémarrer les services
    await execCommand('sudo systemctl restart neopro-app');
    await execCommand('sudo systemctl restart nginx');

    // Nettoyage
    await fs.unlink(req.file.path);
    await execCommand(`rm -rf ${extractDir}`);

    res.json({
      success: true,
      message: 'Mise à jour appliquée avec succès',
      backup: backupName
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Informations réseau
app.get('/api/network', async (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    const networkInfo = {};

    for (const [name, addrs] of Object.entries(interfaces)) {
      networkInfo[name] = addrs
        .filter(addr => addr.family === 'IPv4')
        .map(addr => ({
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        }));
    }

    // WiFi info
    const wifiResult = await execCommand('iwconfig wlan0 2>/dev/null');
    const ssidMatch = wifiResult.output.match(/ESSID:"([^"]+)"/);
    const currentSSID = ssidMatch ? ssidMatch[1] : null;

    res.json({
      interfaces: networkInfo,
      wifi: {
        currentSSID: currentSSID
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lancement du serveur
 */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Serveur Web Admin Neopro lancé sur le port ${PORT}`);
  console.log(`  Accessible sur:`);
  console.log(`  - http://neopro.local:${PORT}`);
  console.log(`  - http://192.168.4.1:${PORT}`);
  console.log(`  - http://localhost:${PORT}`);
});

// Gestion des erreurs
process.on('uncaughtException', (error) => {
  console.error('Erreur non gérée:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesse rejetée:', error);
});
