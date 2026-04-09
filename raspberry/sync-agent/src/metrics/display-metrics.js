/**
 * Display Metrics — EDID parsing, display info, CEC status.
 * Extracted from metrics.js (ADR-044).
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const logger = require('../logger');

const execAsync = util.promisify(exec);

// =============================================================================
// DISPLAY INFO CACHE
// =============================================================================

let _displayInfoCache = null;
let _displayInfoCacheTime = 0;
let _secondaryDisplayInfoCache = null;
let _secondaryDisplayInfoCacheTime = 0;
const _DISPLAY_CACHE_TTL = 300000; // 5 minutes

// =============================================================================
// EDID HELPERS
// =============================================================================

/**
 * Trouve le chemin du fichier EDID de l'écran HDMI connecté.
 * Cherche dans /sys/class/drm/ les connecteurs HDMI avec un EDID non vide.
 * @param {string} [portFilter] - Filtre optionnel sur le port (ex: 'HDMI-A-2' pour le secondaire)
 * @returns {string|null} Chemin vers le fichier EDID ou null
 */
function findEdidPath(portFilter) {
  try {
    const drmDir = '/sys/class/drm';
    if (!fs.existsSync(drmDir)) return null;

    const entries = fs.readdirSync(drmDir);
    const hdmiEntries = portFilter
      ? entries.filter(e => e.includes(portFilter))
      : entries.filter(e => e.includes('HDMI'));

    for (const entry of hdmiEntries) {
      const edidPath = `${drmDir}/${entry}/edid`;
      try {
        // sysfs virtual files report stat.size=0 even when they have content.
        // Read the file and check buffer length instead.
        const buf = fs.readFileSync(edidPath);
        if (buf.length > 0) {
          return edidPath;
        }
      } catch {
        // Fichier n'existe pas ou pas accessible
      }
    }
  } catch (error) {
    logger.debug('Could not scan DRM directory for EDID:', error.message);
  }
  return null;
}

/**
 * Parse un buffer EDID brut (128+ bytes) pour extraire les informations d'affichage.
 * @param {Buffer} edidBuffer - Buffer EDID brut lu depuis /sys/class/drm/
 * @returns {{manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, hasCeaExtension: boolean}}
 */
function parseEdid(edidBuffer) {
  const result = {
    manufacturer: null,
    model: null,
    serial: null,
    resolution: null,
    hasCeaExtension: false,
  };

  if (!edidBuffer || edidBuffer.length < 128) return result;

  // Vérifier le header EDID (bytes 0-7: 00 FF FF FF FF FF FF 00)
  const header = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];
  if (!header.every((b, i) => edidBuffer[i] === b)) return result;

  try {
    // Manufacturer ID (bytes 8-9, big-endian, 3 lettres sur 15 bits)
    const mfgCode = (edidBuffer[8] << 8) | edidBuffer[9];
    const char1 = String.fromCharCode(((mfgCode >> 10) & 0x1F) + 64);
    const char2 = String.fromCharCode(((mfgCode >> 5) & 0x1F) + 64);
    const char3 = String.fromCharCode((mfgCode & 0x1F) + 64);
    result.manufacturer = char1 + char2 + char3;
  } catch {
    // Parsing fabricant échoué
  }

  // Résolution native depuis le premier Detailed Timing Descriptor (bytes 54-71)
  try {
    const hActive = ((edidBuffer[58] & 0xF0) << 4) | edidBuffer[56];
    const vActive = ((edidBuffer[61] & 0xF0) << 4) | edidBuffer[59];
    if (hActive > 0 && vActive > 0) {
      result.resolution = `${hActive}x${vActive}`;
    }
  } catch {
    // Parsing résolution échoué
  }

  // Parcourir les 4 descriptor blocks (18 bytes chacun, à partir de byte 54)
  for (let i = 0; i < 4; i++) {
    const offset = 54 + (i * 18);
    if (offset + 18 > edidBuffer.length) break;

    if (edidBuffer[offset] === 0 && edidBuffer[offset + 1] === 0) {
      const tag = edidBuffer[offset + 3];

      if (tag === 0xFC) {
        // Monitor Name descriptor
        try {
          result.model = edidBuffer.slice(offset + 5, offset + 18)
            .toString('ascii').replace(/[\n\r\0]/g, '').trim();
        } catch {
          // Parsing nom échoué
        }
      } else if (tag === 0xFF) {
        // Serial Number descriptor
        try {
          result.serial = edidBuffer.slice(offset + 5, offset + 18)
            .toString('ascii').replace(/[\n\r\0]/g, '').trim();
        } catch {
          // Parsing serial échoué
        }
      }
    }
  }

  // CEA Extension Block (indice que c'est une TV)
  if (edidBuffer[126] > 0 && edidBuffer.length >= 256 && edidBuffer[128] === 0x02) {
    result.hasCeaExtension = true;
  }

  return result;
}

/**
 * Exécute edid-decode sur le fichier EDID et parse la sortie.
 * @param {string} edidPath - Chemin vers le fichier EDID binaire
 * @returns {Promise<object|null>} Infos détaillées ou null si edid-decode indisponible
 */
async function runEdidDecode(edidPath) {
  const { stdout } = await execAsync(`edid-decode "${edidPath}" 2>/dev/null`, { timeout: 5000 });
  return parseEdidDecodeOutput(stdout);
}

/**
 * Parse la sortie texte de edid-decode.
 * @param {string} output - Sortie stdout de edid-decode
 * @returns {object} Infos structurées extraites
 */
function parseEdidDecodeOutput(output) {
  const result = {
    screen_size: null,
    year_of_manufacture: null,
    input_type: null,
    color_depth: null,
    supported_resolutions: [],
    audio_supported: false,
    native_resolution: null,
    max_refresh_rate: null,
    hdmi_version: null,
    hdr_supported: false,
    color_spaces: [],
    standby_supported: false,
    display_product_type: null,
    diagonal_inches: null,
  };

  const lines = output.split('\n');
  let maxRefresh = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Taille physique : "Maximum image size: 53 cm x 30 cm"
    const sizeMatch = trimmed.match(/Maximum image size:\s*(\d+)\s*cm\s*x\s*(\d+)\s*cm/i);
    if (sizeMatch) {
      result.screen_size = `${sizeMatch[1]}x${sizeMatch[2]}cm`;
    }

    // Année : "Made in week 51 of 2018" ou "Model year 2020"
    const yearMatch = trimmed.match(/(?:Made in week \d+ of|Model year)\s+(\d{4})/);
    if (yearMatch) {
      result.year_of_manufacture = parseInt(yearMatch[1], 10);
    }

    // Type d'entrée : "Digital display" ou "Analog display"
    if (/Digital display/i.test(trimmed)) {
      result.input_type = 'digital';
    } else if (/Analog display/i.test(trimmed)) {
      result.input_type = 'analog';
    }

    // Profondeur couleur : "Color depth: 8 bits" ou "8 bpc"
    const depthMatch = trimmed.match(/(?:Color depth|Maximum):\s*(\d+)\s*(?:bits|bpc)/i)
      || trimmed.match(/(\d+)\s*bpc/i);
    if (depthMatch && !result.color_depth) {
      result.color_depth = `${depthMatch[1]}bpc`;
    }

    // Résolutions depuis les detailed timings et standard timings
    const resMatch = trimmed.match(/(\d{3,5})x(\d{3,5})[pi]?\s/);
    if (resMatch) {
      const res = `${resMatch[1]}x${resMatch[2]}`;
      if (!result.supported_resolutions.includes(res)) {
        result.supported_resolutions.push(res);
      }
    }

    // Audio : "Audio:" ou "Basic audio support"
    if (/(?:Basic audio support|Audio:)/i.test(trimmed)) {
      result.audio_supported = true;
    }

    // Résolution native : premier DTD (Detailed Timing Descriptor)
    if (!result.native_resolution) {
      const nativeMatch = trimmed.match(/DTD\s+1:\s+(\d{3,5})x(\d{3,5})\s+[\d.]+\s*Hz/);
      if (nativeMatch) {
        result.native_resolution = `${nativeMatch[1]}x${nativeMatch[2]}`;
      }
    }

    // Refresh rate max depuis tous les DTDs et timings
    const hzMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*Hz/);
    if (hzMatch) {
      const hz = parseFloat(hzMatch[1]);
      if (hz > maxRefresh && hz < 500) {
        maxRefresh = hz;
      }
    }

    // Version HDMI déduite du TMDS clock max
    const tmdsMatch = trimmed.match(/Maximum TMDS clock:\s*(\d+)\s*MHz/i);
    if (tmdsMatch) {
      const tmds = parseInt(tmdsMatch[1], 10);
      if (tmds >= 600) result.hdmi_version = '2.1';
      else if (tmds >= 300) result.hdmi_version = '2.0';
      else result.hdmi_version = '1.4';
    }

    // HDR : "HDR Static Metadata", "SMPTE ST2084", "Hybrid Log-Gamma"
    if (/HDR Static Metadata|SMPTE ST2084|HDR10|Hybrid Log-Gamma|HLG/i.test(trimmed)) {
      result.hdr_supported = true;
    }

    // Espaces couleur
    if (/BT2020RGB/i.test(trimmed) && !result.color_spaces.includes('BT2020_RGB')) {
      result.color_spaces.push('BT2020_RGB');
    }
    if (/BT2020YCC/i.test(trimmed) && !result.color_spaces.includes('BT2020_YCC')) {
      result.color_spaces.push('BT2020_YCC');
    }
    if (/DC_Y444|YCbCr\s*4:4:4/i.test(trimmed) && !result.color_spaces.includes('YCbCr_444')) {
      result.color_spaces.push('YCbCr_444');
    }
    if (/YCbCr\s*4:2:2/i.test(trimmed) && !result.color_spaces.includes('YCbCr_422')) {
      result.color_spaces.push('YCbCr_422');
    }
    if (/YCbCr\s*4:2:0/i.test(trimmed) && !result.color_spaces.includes('YCbCr_420')) {
      result.color_spaces.push('YCbCr_420');
    }

    // Gestion de l'alimentation (DPMS)
    if (/DPMS levels:/i.test(trimmed)) {
      result.standby_supported = true;
    }

    // Type de produit : "Display Product Type: ..."
    const productTypeMatch = trimmed.match(/Display Product Type:\s*(.+)/i);
    if (productTypeMatch) {
      result.display_product_type = productTypeMatch[1].trim().toLowerCase();
    }
  }

  if (maxRefresh > 0) {
    result.max_refresh_rate = Math.round(maxRefresh);
  }

  // Diagonale en pouces calculée depuis la taille physique
  if (result.screen_size) {
    const sizeDigMatch = result.screen_size.match(/(\d+)x(\d+)cm/);
    if (sizeDigMatch) {
      const w = parseInt(sizeDigMatch[1], 10);
      const h = parseInt(sizeDigMatch[2], 10);
      result.diagonal_inches = Math.round(Math.sqrt(w * w + h * h) / 2.54);
    }
  }

  return result;
}

/**
 * Infère la catégorie d'écran en croisant nom de modèle, taille, audio et type détecté.
 * @param {string|null} model - Nom du modèle EDID
 * @param {string} displayType - 'tv' | 'monitor' | 'unknown'
 * @param {object|null} edidDetailed - Données edid-decode enrichies
 * @param {string|null} manufacturer - Code fabricant EDID (3 lettres)
 * @returns {string} 'tv_oled' | 'tv_qled' | 'tv_qned' | 'tv_led' | 'tv_lcd' | 'tv_plasma' | 'tv' | 'monitor' | 'projector' | 'unknown'
 */
function inferDisplayCategory(model, displayType, edidDetailed, manufacturer) {
  const modelUpper = (model || '').toUpperCase();
  const detailed = edidDetailed || {};

  // Fabricants exclusivement moniteur — toujours classifier comme 'monitor'
  const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
  if (monitorOnlyMfg.test((manufacturer || '').toUpperCase())) {
    return 'monitor';
  }

  // Projecteur détecté via EDID
  if (detailed.display_product_type && /projector/i.test(detailed.display_product_type)) {
    return 'projector';
  }

  // Technologie de dalle détectée depuis le nom de modèle
  let panelTech = null;
  if (/OLED/.test(modelUpper)) {
    panelTech = 'oled';
  } else if (/QNED/.test(modelUpper)) {
    panelTech = 'qned';
  } else if (/QLED/.test(modelUpper)) {
    panelTech = 'qled';
  } else if (/NANO(?:CELL)?/.test(modelUpper)) {
    panelTech = 'led';
  } else if (/\bLED\b/.test(modelUpper)) {
    panelTech = 'led';
  } else if (/\bLCD\b/.test(modelUpper)) {
    panelTech = 'lcd';
  } else if (/PLASMA|PDP/.test(modelUpper)) {
    panelTech = 'plasma';
  }

  // Déterminer TV vs moniteur en croisant tous les signaux
  const diag = detailed.diagonal_inches;
  const isTV = displayType === 'tv' ||
               detailed.audio_supported === true ||
               (diag && diag >= 32);
  const isMonitor = displayType === 'monitor' ||
                    (diag && diag < 28 && !detailed.audio_supported);

  if (isTV && panelTech) return `tv_${panelTech}`;
  if (isTV) return 'tv';
  if (isMonitor) return 'monitor';

  return 'unknown';
}

// =============================================================================
// DISPLAY INFO
// =============================================================================

/**
 * Récupère les informations de l'écran connecté via EDID.
 * @returns {Promise<{connected: boolean, manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, display_type: string, detection_method: string, edid_detailed: object|null}>}
 */
async function getDisplayInfo() {
  const now = Date.now();
  if (_displayInfoCache && (now - _displayInfoCacheTime) < _DISPLAY_CACHE_TTL) {
    return _displayInfoCache;
  }

  const displayInfo = {
    connected: false,
    manufacturer: null,
    model: null,
    serial: null,
    resolution: null,
    display_type: 'unknown',
    display_category: null,
    detection_method: 'none',
    edid_detailed: null,
  };

  try {
    const edidPath = findEdidPath();

    if (edidPath) {
      displayInfo.connected = true;
      try {
        const edidBuffer = fs.readFileSync(edidPath);
        const parsed = parseEdid(edidBuffer);
        displayInfo.manufacturer = parsed.manufacturer;
        displayInfo.model = parsed.model;
        displayInfo.serial = parsed.serial;
        displayInfo.resolution = parsed.resolution;
        displayInfo.detection_method = 'edid_raw';

        const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
        if (parsed.hasCeaExtension && !monitorOnlyMfg.test((parsed.manufacturer || '').toUpperCase())) {
          displayInfo.display_type = 'tv';
        }
      } catch (error) {
        logger.debug('Could not parse EDID file:', error.message);
      }

      // Enrichir avec edid-decode si disponible
      try {
        const detailed = await runEdidDecode(edidPath);
        if (detailed) {
          displayInfo.edid_detailed = detailed;
        }
      } catch {
        // edid-decode non disponible ou erreur
      }
    } else {
      try {
        const drmDir = '/sys/class/drm';
        if (fs.existsSync(drmDir)) {
          const entries = fs.readdirSync(drmDir);
          const hdmiEntry = entries.find(e => e.includes('HDMI'));
          if (hdmiEntry) {
            displayInfo.detection_method = 'drm_status';
            const statusPath = `${drmDir}/${hdmiEntry}/status`;
            try {
              const status = fs.readFileSync(statusPath, 'utf8').trim();
              if (status === 'connected') {
                displayInfo.connected = true;
              }
            } catch {
              // Fichier status inaccessible
            }
          }
        }
      } catch {
        // Pas de DRM disponible
      }
    }
  } catch (error) {
    logger.warn('Error getting display info:', error.message);
  }

  _displayInfoCache = displayInfo;
  _displayInfoCacheTime = now;
  return displayInfo;
}

/**
 * Récupère les informations EDID de l'écran secondaire (HDMI-A-2).
 * @returns {Promise<{connected: boolean, manufacturer: string|null, model: string|null, serial: string|null, resolution: string|null, display_type: string, detection_method: string, edid_detailed: object|null}>}
 */
async function getSecondaryDisplayInfo() {
  const now = Date.now();
  if (_secondaryDisplayInfoCache && (now - _secondaryDisplayInfoCacheTime) < _DISPLAY_CACHE_TTL) {
    return _secondaryDisplayInfoCache;
  }

  const displayInfo = {
    connected: false,
    manufacturer: null,
    model: null,
    serial: null,
    resolution: null,
    display_type: 'unknown',
    display_category: null,
    detection_method: 'none',
    edid_detailed: null,
  };

  try {
    const edidPath = findEdidPath('HDMI-A-2');

    if (edidPath) {
      displayInfo.connected = true;
      try {
        const edidBuffer = fs.readFileSync(edidPath);
        const parsed = parseEdid(edidBuffer);
        displayInfo.manufacturer = parsed.manufacturer;
        displayInfo.model = parsed.model;
        displayInfo.serial = parsed.serial;
        displayInfo.resolution = parsed.resolution;
        displayInfo.detection_method = 'edid_raw';

        const monitorOnlyMfg = /^(LEN|DEL|ACI|HWP|BNQ|ACR|EIZ|NEC|AOC)$/;
        if (parsed.hasCeaExtension && !monitorOnlyMfg.test((parsed.manufacturer || '').toUpperCase())) {
          displayInfo.display_type = 'tv';
        }
      } catch (error) {
        logger.debug('Could not parse secondary EDID file:', error.message);
      }

      try {
        const detailed = await runEdidDecode(edidPath);
        if (detailed) {
          displayInfo.edid_detailed = detailed;
        }
      } catch {
        // edid-decode non disponible ou erreur
      }
    } else {
      try {
        const drmDir = '/sys/class/drm';
        if (fs.existsSync(drmDir)) {
          const entries = fs.readdirSync(drmDir);
          const hdmiEntry = entries.find(e => e.includes('HDMI-A-2'));
          if (hdmiEntry) {
            displayInfo.detection_method = 'drm_status';
            const statusPath = `${drmDir}/${hdmiEntry}/status`;
            try {
              const status = fs.readFileSync(statusPath, 'utf8').trim();
              if (status === 'connected') {
                displayInfo.connected = true;
              }
            } catch {
              // Fichier status inaccessible
            }
          }
        }
      } catch {
        // Pas de DRM disponible
      }
    }
  } catch (error) {
    logger.warn('Error getting secondary display info:', error.message);
  }

  _secondaryDisplayInfoCache = displayInfo;
  _secondaryDisplayInfoCacheTime = now;
  return displayInfo;
}

// =============================================================================
// HDMI-CEC
// =============================================================================

/**
 * Récupère l'état de la TV via HDMI-CEC
 * Permet de savoir si la TV est allumée, en veille, ou déconnectée
 */
async function getHdmiCecStatus() {
  const cecStatus = {
    tv_power: null,
    tv_connected: false,
    devices_found: 0,
    cec_available: false,
    last_check_at: null,
    error: null,
  };

  try {
    // Vérifier si cec-client est installé
    try {
      await execAsync('which cec-client', { timeout: 2000 });
      cecStatus.cec_available = true;
    } catch {
      cecStatus.cec_available = false;
      cecStatus.error = 'cec-client not installed';
      return cecStatus;
    }

    // Récupérer l'état de la TV (device 0 = TV)
    const { stdout } = await execAsync(
      'echo "pow 0" | timeout 5 cec-client -s -d 1 2>/dev/null',
      { timeout: 8000 }
    );

    cecStatus.last_check_at = new Date().toISOString();

    // Parser la réponse
    if (stdout.includes('power status: on')) {
      cecStatus.tv_power = 'on';
      cecStatus.tv_connected = true;
    } else if (stdout.includes('power status: standby')) {
      cecStatus.tv_power = 'standby';
      cecStatus.tv_connected = true;
    } else if (stdout.includes('power status: in transition')) {
      cecStatus.tv_power = 'transitioning';
      cecStatus.tv_connected = true;
    } else if (stdout.includes('power status:')) {
      cecStatus.tv_power = 'unknown';
      cecStatus.tv_connected = true;
    } else {
      cecStatus.tv_power = null;
      cecStatus.tv_connected = false;
      cecStatus.error = 'TV not responding to CEC';
    }

    // Compter les appareils CEC détectés
    const devicesMatch = stdout.match(/device #(\d+):/g);
    if (devicesMatch) {
      cecStatus.devices_found = devicesMatch.length;
    }

  } catch (error) {
    cecStatus.error = error.message;
    cecStatus.tv_connected = false;
    logger.warn('HDMI-CEC check failed:', error.message);
  }

  return cecStatus;
}

module.exports = {
  findEdidPath,
  parseEdid,
  runEdidDecode,
  parseEdidDecodeOutput,
  inferDisplayCategory,
  getDisplayInfo,
  getSecondaryDisplayInfo,
  getHdmiCecStatus,
};
