/**
 * Tests unitaires pour la détection EDID et getDisplayInfo()
 *
 * Teste le parsing EDID (fabricant, modèle, résolution, type d'écran)
 * et la détection du type d'affichage (TV vs moniteur PC).
 *
 * @module display-info.test
 */

jest.mock('systeminformation');
jest.mock('child_process', () => {
  const mockExec = jest.fn();
  return { exec: mockExec };
});

const fs = require('fs');
const path = require('path');

// Mock logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Import MetricsCollector après les mocks
const metricsCollector = require('../metrics');

describe('EDID Parser (_parseEdid)', () => {
  /**
   * Crée un buffer EDID valide avec les paramètres spécifiés.
   * @param {object} options - Options EDID
   * @returns {Buffer}
   */
  function createEdidBuffer(options = {}) {
    const {
      manufacturer = 'SAM',      // Samsung
      model = 'Test Monitor',
      serial = 'ABC123',
      hActive = 1920,
      vActive = 1080,
      hasCeaExtension = false,
    } = options;

    // Créer un buffer de 128 bytes (ou 256 si CEA extension)
    const size = hasCeaExtension ? 256 : 128;
    const buf = Buffer.alloc(size, 0);

    // Header EDID (bytes 0-7)
    buf[0] = 0x00;
    buf[1] = 0xFF;
    buf[2] = 0xFF;
    buf[3] = 0xFF;
    buf[4] = 0xFF;
    buf[5] = 0xFF;
    buf[6] = 0xFF;
    buf[7] = 0x00;

    // Manufacturer ID (bytes 8-9) — encoder 3 lettres sur 2 bytes
    const c1 = manufacturer.charCodeAt(0) - 64;
    const c2 = manufacturer.charCodeAt(1) - 64;
    const c3 = manufacturer.charCodeAt(2) - 64;
    const mfgCode = (c1 << 10) | (c2 << 5) | c3;
    buf[8] = (mfgCode >> 8) & 0xFF;
    buf[9] = mfgCode & 0xFF;

    // Detailed Timing Descriptor #1 (bytes 54-71) — résolution native
    // Pixel clock (non nul pour indiquer un timing valide)
    buf[54] = 0x01;
    buf[55] = 0x1D;
    // H Active
    buf[56] = hActive & 0xFF;
    buf[58] = ((hActive >> 4) & 0xF0) | (buf[58] & 0x0F);
    // V Active
    buf[59] = vActive & 0xFF;
    buf[61] = ((vActive >> 4) & 0xF0) | (buf[61] & 0x0F);

    // Monitor Name descriptor — DTD #3 (offset 90)
    const nameOffset = 90; // 54 + 2*18
    buf[nameOffset] = 0x00;     // Indique un display descriptor
    buf[nameOffset + 1] = 0x00;
    buf[nameOffset + 2] = 0x00;
    buf[nameOffset + 3] = 0xFC; // Tag = Monitor Name
    buf[nameOffset + 4] = 0x00;
    const nameStr = model.padEnd(13, '\n').substring(0, 13);
    for (let i = 0; i < 13; i++) {
      buf[nameOffset + 5 + i] = nameStr.charCodeAt(i);
    }

    // Serial Number descriptor — DTD #4 (offset 108)
    const serialOffset = 108; // 54 + 3*18
    buf[serialOffset] = 0x00;
    buf[serialOffset + 1] = 0x00;
    buf[serialOffset + 2] = 0x00;
    buf[serialOffset + 3] = 0xFF; // Tag = Serial
    buf[serialOffset + 4] = 0x00;
    const serialStr = serial.padEnd(13, '\n').substring(0, 13);
    for (let i = 0; i < 13; i++) {
      buf[serialOffset + 5 + i] = serialStr.charCodeAt(i);
    }

    // Extension count
    buf[126] = hasCeaExtension ? 1 : 0;

    // CEA Extension Block (byte 128)
    if (hasCeaExtension) {
      buf[128] = 0x02; // CEA extension tag
    }

    return buf;
  }

  test('parse un EDID Samsung 1080p correctement', () => {
    const edid = createEdidBuffer({
      manufacturer: 'SAM',
      model: 'S24E650',
      hActive: 1920,
      vActive: 1080,
    });

    const result = metricsCollector._parseEdid(edid);

    expect(result.manufacturer).toBe('SAM');
    expect(result.model).toBe('S24E650');
    expect(result.resolution).toBe('1920x1080');
    expect(result.hasCeaExtension).toBe(false);
  });

  test('parse un EDID LG TV avec CEA extension', () => {
    const edid = createEdidBuffer({
      manufacturer: 'LGD',
      model: 'LG TV SSCR2',
      hActive: 3840,
      vActive: 2160,
      hasCeaExtension: true,
    });

    const result = metricsCollector._parseEdid(edid);

    expect(result.manufacturer).toBe('LGD');
    expect(result.model).toBe('LG TV SSCR2');
    expect(result.resolution).toBe('3840x2160');
    expect(result.hasCeaExtension).toBe(true);
  });

  test('parse un EDID Dell moniteur PC', () => {
    const edid = createEdidBuffer({
      manufacturer: 'DEL',
      model: 'DELL U2722D',
      hActive: 2560,
      vActive: 1440,
      hasCeaExtension: false,
    });

    const result = metricsCollector._parseEdid(edid);

    expect(result.manufacturer).toBe('DEL');
    expect(result.model).toBe('DELL U2722D');
    expect(result.resolution).toBe('2560x1440');
    expect(result.hasCeaExtension).toBe(false);
  });

  test('retourne des valeurs null pour un buffer trop court', () => {
    const result = metricsCollector._parseEdid(Buffer.alloc(64));

    expect(result.manufacturer).toBeNull();
    expect(result.model).toBeNull();
    expect(result.resolution).toBeNull();
    expect(result.hasCeaExtension).toBe(false);
  });

  test('retourne des valeurs null pour un buffer null', () => {
    const result = metricsCollector._parseEdid(null);

    expect(result.manufacturer).toBeNull();
    expect(result.model).toBeNull();
  });

  test('retourne des valeurs null pour un header EDID invalide', () => {
    const buf = Buffer.alloc(128, 0x42); // Rempli de bytes aléatoires
    const result = metricsCollector._parseEdid(buf);

    expect(result.manufacturer).toBeNull();
    expect(result.model).toBeNull();
  });

  test('parse le serial number correctement', () => {
    const edid = createEdidBuffer({
      manufacturer: 'SAM',
      model: 'Test',
      serial: 'H4ZN500001',
    });

    const result = metricsCollector._parseEdid(edid);
    expect(result.serial).toBe('H4ZN500001');
  });

  test('gère un EDID sans descriptor de nom', () => {
    const buf = Buffer.alloc(128, 0);
    // Header valide
    buf[0] = 0x00; buf[1] = 0xFF; buf[2] = 0xFF; buf[3] = 0xFF;
    buf[4] = 0xFF; buf[5] = 0xFF; buf[6] = 0xFF; buf[7] = 0x00;
    // Manufacturer "LEN" (Lenovo)
    buf[8] = 0x30; buf[9] = 0xAE;

    const result = metricsCollector._parseEdid(buf);

    expect(result.manufacturer).toBe('LEN');
    expect(result.model).toBeNull();
  });
});

describe('_findEdidPath', () => {
  const originalExistsSync = fs.existsSync;
  const originalReaddirSync = fs.readdirSync;
  const originalStatSync = fs.statSync;

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readdirSync = originalReaddirSync;
    fs.statSync = originalStatSync;
  });

  test('trouve un fichier EDID HDMI valide', () => {
    fs.existsSync = jest.fn((p) => p === '/sys/class/drm');
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1', 'card1-DP-1', 'version']);
    fs.statSync = jest.fn(() => ({ size: 256 }));

    const result = metricsCollector._findEdidPath();
    expect(result).toBe('/sys/class/drm/card1-HDMI-A-1/edid');
  });

  test('retourne null si /sys/class/drm n\'existe pas', () => {
    fs.existsSync = jest.fn(() => false);

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });

  test('retourne null si aucun connecteur HDMI', () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-DP-1', 'card1-VGA-1']);

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });

  test('retourne null si le fichier EDID est vide (pas d\'écran)', () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.statSync = jest.fn(() => ({ size: 0 }));

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });

  test('ignore les fichiers EDID inaccessibles', () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.statSync = jest.fn(() => { throw new Error('Permission denied'); });

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });
});

describe('getDisplayInfo', () => {
  const originalExistsSync = fs.existsSync;
  const originalReaddirSync = fs.readdirSync;
  const originalStatSync = fs.statSync;
  const originalReadFileSync = fs.readFileSync;

  beforeEach(() => {
    // Réinitialiser le cache entre les tests
    metricsCollector._displayInfoCache = null;
    metricsCollector._displayInfoCacheTime = 0;
  });

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readdirSync = originalReaddirSync;
    fs.statSync = originalStatSync;
    fs.readFileSync = originalReadFileSync;
  });

  test('détecte un moniteur PC connecté via EDID', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'DEL',
      model: 'DELL P2419H',
      hActive: 1920,
      vActive: 1080,
      hasCeaExtension: false,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.statSync = jest.fn(() => ({ size: 128 }));
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('DEL');
    expect(result.model).toBe('DELL P2419H');
    expect(result.resolution).toBe('1920x1080');
    expect(result.detection_method).toBe('edid_raw');
    // Le type sera 'unknown' ici car il n'y a pas de CEA extension
    // Le croisement avec CEC se fait dans getHealthStatus()
  });

  test('détecte une TV avec CEA extension', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'SAM',
      model: 'SAMSUNG',
      hActive: 3840,
      vActive: 2160,
      hasCeaExtension: true,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.statSync = jest.fn(() => ({ size: 256 }));
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('SAM');
    expect(result.display_type).toBe('tv');
  });

  test('retourne connected=false si aucun EDID trouvé', async () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.statSync = jest.fn(() => ({ size: 0 }));

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(false);
    expect(result.detection_method).toBe('drm_status');
  });

  test('retourne detection_method=none si pas de DRM', async () => {
    fs.existsSync = jest.fn(() => false);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(false);
    expect(result.detection_method).toBe('none');
  });

  test('utilise le cache pour les appels répétés', async () => {
    // Premier appel
    fs.existsSync = jest.fn(() => false);
    const result1 = await metricsCollector.getDisplayInfo();

    // Deuxième appel — devrait utiliser le cache
    const mockExistsSync = jest.fn();
    fs.existsSync = mockExistsSync;
    const result2 = await metricsCollector.getDisplayInfo();

    expect(result1).toBe(result2); // Même référence (cache)
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  /**
   * Helper pour créer un buffer EDID valide dans le scope getDisplayInfo
   */
  function createEdidBuffer(options = {}) {
    const {
      manufacturer = 'SAM',
      model = 'Test Monitor',
      serial = 'ABC123',
      hActive = 1920,
      vActive = 1080,
      hasCeaExtension = false,
    } = options;

    const size = hasCeaExtension ? 256 : 128;
    const buf = Buffer.alloc(size, 0);

    buf[0] = 0x00; buf[1] = 0xFF; buf[2] = 0xFF; buf[3] = 0xFF;
    buf[4] = 0xFF; buf[5] = 0xFF; buf[6] = 0xFF; buf[7] = 0x00;

    const c1 = manufacturer.charCodeAt(0) - 64;
    const c2 = manufacturer.charCodeAt(1) - 64;
    const c3 = manufacturer.charCodeAt(2) - 64;
    const mfgCode = (c1 << 10) | (c2 << 5) | c3;
    buf[8] = (mfgCode >> 8) & 0xFF;
    buf[9] = mfgCode & 0xFF;

    buf[54] = 0x01; buf[55] = 0x1D;
    buf[56] = hActive & 0xFF;
    buf[58] = ((hActive >> 4) & 0xF0);
    buf[59] = vActive & 0xFF;
    buf[61] = ((vActive >> 4) & 0xF0);

    const nameOffset = 90;
    buf[nameOffset] = 0x00; buf[nameOffset + 1] = 0x00;
    buf[nameOffset + 3] = 0xFC;
    const nameStr = model.padEnd(13, '\n').substring(0, 13);
    for (let i = 0; i < 13; i++) {
      buf[nameOffset + 5 + i] = nameStr.charCodeAt(i);
    }

    buf[126] = hasCeaExtension ? 1 : 0;
    if (hasCeaExtension) buf[128] = 0x02;

    return buf;
  }
});
