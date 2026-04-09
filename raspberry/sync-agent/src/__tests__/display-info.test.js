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
// Import display sub-module for spying on internal functions (ADR-044)
const displayMetrics = require('../metrics/display-metrics');

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
  const originalReadFileSync = fs.readFileSync;

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readdirSync = originalReaddirSync;
    fs.readFileSync = originalReadFileSync;
  });

  test('trouve un fichier EDID HDMI valide', () => {
    fs.existsSync = jest.fn((p) => p === '/sys/class/drm');
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1', 'card1-DP-1', 'version']);
    fs.readFileSync = jest.fn(() => Buffer.alloc(256));

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
    fs.readFileSync = jest.fn(() => Buffer.alloc(0));

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });

  test('ignore les fichiers EDID inaccessibles', () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => { throw new Error('Permission denied'); });

    const result = metricsCollector._findEdidPath();
    expect(result).toBeNull();
  });
});

describe('getDisplayInfo', () => {
  const originalExistsSync = fs.existsSync;
  const originalReaddirSync = fs.readdirSync;
  const originalReadFileSync = fs.readFileSync;

  let edidDecodeSpy;

  beforeEach(() => {
    // Réinitialiser le cache entre les tests
    metricsCollector._displayInfoCache = null;
    metricsCollector._displayInfoCacheTime = 0;
    // Mock runEdidDecode on the sub-module to avoid real edid-decode calls (ADR-044)
    edidDecodeSpy = jest.spyOn(displayMetrics, 'runEdidDecode')
      .mockRejectedValue(new Error('edid-decode not installed'));
  });

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readdirSync = originalReaddirSync;
    fs.readFileSync = originalReadFileSync;
    edidDecodeSpy.mockRestore();
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
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('SAM');
    expect(result.display_type).toBe('tv');
  });

  test('NE classifie PAS un moniteur Lenovo (LEN) comme TV malgré CEA extension', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'LEN',
      model: 'L27i-30',
      hActive: 1920,
      vActive: 1080,
      hasCeaExtension: true,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('LEN');
    // Le filtre monitorOnlyMfg doit bloquer la classification 'tv'
    expect(result.display_type).not.toBe('tv');
    expect(result.display_type).toBe('unknown');
  });

  test('NE classifie PAS un moniteur Dell (DEL) comme TV malgré CEA extension', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'DEL',
      model: 'DELL U2722D',
      hActive: 2560,
      vActive: 1440,
      hasCeaExtension: true,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('DEL');
    expect(result.display_type).not.toBe('tv');
  });

  test('enrichit avec edid-decode quand disponible', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'SAM',
      model: 'SAMSUNG',
      hActive: 3840,
      vActive: 2160,
      hasCeaExtension: true,
    });

    edidDecodeSpy.mockResolvedValue({
      screen_size: '120x68cm',
      year_of_manufacture: 2018,
      input_type: 'digital',
      color_depth: '8bpc',
      supported_resolutions: ['3840x2160', '1920x1080'],
      audio_supported: true,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.edid_detailed).not.toBeNull();
    expect(result.edid_detailed.screen_size).toBe('120x68cm');
    expect(result.edid_detailed.year_of_manufacture).toBe(2018);
    expect(result.edid_detailed.audio_supported).toBe(true);
  });

  test('continue sans edid_detailed si edid-decode indisponible', async () => {
    const edidBuf = createEdidBuffer({
      manufacturer: 'DEL',
      model: 'DELL P2419H',
      hActive: 1920,
      vActive: 1080,
    });

    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => edidBuf);

    const result = await metricsCollector.getDisplayInfo();

    expect(result.connected).toBe(true);
    expect(result.manufacturer).toBe('DEL');
    expect(result.edid_detailed).toBeNull();
  });

  test('retourne connected=false si aucun EDID trouvé', async () => {
    fs.existsSync = jest.fn(() => true);
    fs.readdirSync = jest.fn(() => ['card1-HDMI-A-1']);
    fs.readFileSync = jest.fn(() => Buffer.alloc(0));

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

describe('_parseEdidDecodeOutput', () => {
  test('parse une sortie edid-decode complète de TV Samsung', () => {
    const output = `edid-decode (hex):

Block 0, Base EDID:
  EDID Structure Version & Revision: 1.3
  Vendor & Product Identification:
    Manufacturer: SAM
    Model: 2795
    Serial Number: 1129531222
    Made in week 51 of 2018
  Basic Display Parameters & Features:
    Digital display
    Maximum image size: 120 cm x 68 cm
    Gamma: 2.20
    DPMS levels: Standby Suspend Off
  Color Characteristics:
    Red  : 0.6396, 0.3300
  Standard Timings:
    1920x1080i  50.000 Hz
    1280x720    60.000 Hz
  Detailed Timing Descriptors:
    DTD 1:  3840x2160   30.000000 Hz  16:9
    DTD 2:  1920x1080   60.000000 Hz  16:9
    Monitor name: SAMSUNG
    Monitor serial number: H4ZN500001

Block 1, CEC Extension:
  Audio:
    Linear PCM:
      Max channels: 2
      Supported sample rates (kHz): 48 44.1 32
      Supported sample sizes (bits): 24 20 16
  Color depth: 8 bits
  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 300 MHz
    DC_Y444
  HDR Static Metadata Data Block:
    SMPTE ST2084
  Colorimetry Data Block:
    BT2020RGB
    BT2020YCC
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);

    expect(result.screen_size).toBe('120x68cm');
    expect(result.year_of_manufacture).toBe(2018);
    expect(result.input_type).toBe('digital');
    expect(result.color_depth).toBe('8bpc');
    expect(result.audio_supported).toBe(true);
    expect(result.supported_resolutions).toContain('3840x2160');
    expect(result.supported_resolutions).toContain('1920x1080');
    expect(result.supported_resolutions).toContain('1280x720');
    // Nouveaux champs
    expect(result.native_resolution).toBe('3840x2160');
    expect(result.max_refresh_rate).toBe(60);
    expect(result.hdmi_version).toBe('2.0');
    expect(result.hdr_supported).toBe(true);
    expect(result.color_spaces).toContain('YCbCr_444');
    expect(result.color_spaces).toContain('BT2020_RGB');
    expect(result.color_spaces).toContain('BT2020_YCC');
    expect(result.standby_supported).toBe(true);
    expect(result.diagonal_inches).toBe(54);
  });

  test('parse un moniteur PC sans audio ni CEA', () => {
    const output = `Block 0, Base EDID:
  Vendor & Product Identification:
    Manufacturer: DEL
    Model: 16611
    Made in week 30 of 2022
  Basic Display Parameters & Features:
    Digital display
    Maximum image size: 60 cm x 34 cm
  Detailed Timing Descriptors:
    DTD 1:  2560x1440   59.951000 Hz  16:9
    Monitor name: DELL U2722D
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);

    expect(result.screen_size).toBe('60x34cm');
    expect(result.year_of_manufacture).toBe(2022);
    expect(result.input_type).toBe('digital');
    expect(result.audio_supported).toBe(false);
    expect(result.supported_resolutions).toContain('2560x1440');
    expect(result.native_resolution).toBe('2560x1440');
    expect(result.max_refresh_rate).toBe(60);
    expect(result.diagonal_inches).toBe(27);
    expect(result.hdr_supported).toBe(false);
  });

  test('parse un écran analogique ancien', () => {
    const output = `Block 0, Base EDID:
  Vendor & Product Identification:
    Manufacturer: LEN
    Model year 2015
  Basic Display Parameters & Features:
    Analog display
    Maximum image size: 47 cm x 30 cm
  Detailed Timing Descriptors:
    DTD 1:  1920x1200   59.950000 Hz  16:10
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);

    expect(result.input_type).toBe('analog');
    expect(result.year_of_manufacture).toBe(2015);
    expect(result.screen_size).toBe('47x30cm');
    expect(result.supported_resolutions).toContain('1920x1200');
    expect(result.native_resolution).toBe('1920x1200');
  });

  test('retourne des valeurs par défaut pour une sortie vide', () => {
    const result = metricsCollector._parseEdidDecodeOutput('');

    expect(result.screen_size).toBeNull();
    expect(result.year_of_manufacture).toBeNull();
    expect(result.input_type).toBeNull();
    expect(result.color_depth).toBeNull();
    expect(result.supported_resolutions).toEqual([]);
    expect(result.audio_supported).toBe(false);
    expect(result.native_resolution).toBeNull();
    expect(result.max_refresh_rate).toBeNull();
    expect(result.hdmi_version).toBeNull();
    expect(result.hdr_supported).toBe(false);
    expect(result.color_spaces).toEqual([]);
    expect(result.standby_supported).toBe(false);
    expect(result.display_product_type).toBeNull();
    expect(result.diagonal_inches).toBeNull();
  });

  test('ne duplique pas les résolutions identiques', () => {
    const output = `  DTD 1:  1920x1080   60.000000 Hz  16:9
  DTD 2:  1920x1080   50.000000 Hz  16:9
  DTD 3:  1280x720    60.000000 Hz  16:9
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);

    const count1080 = result.supported_resolutions.filter(r => r === '1920x1080').length;
    expect(count1080).toBe(1);
    expect(result.supported_resolutions).toHaveLength(2);
  });

  test('détecte Basic audio support', () => {
    const output = `  Basic Display Parameters & Features:
    Digital display
    Basic audio support
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.audio_supported).toBe(true);
  });

  test('détecte HDMI 2.1 depuis un TMDS clock élevé', () => {
    const output = `  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 600 MHz
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.hdmi_version).toBe('2.1');
  });

  test('détecte HDMI 1.4 depuis un TMDS clock bas', () => {
    const output = `  HDMI Vendor-Specific Data Block:
    Maximum TMDS clock: 165 MHz
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.hdmi_version).toBe('1.4');
  });

  test('détecte Display Product Type projecteur', () => {
    const output = `  Display Product Type: Projector
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.display_product_type).toBe('projector');
  });

  test('détecte HDR via HLG', () => {
    const output = `  HDR Static Metadata Data Block:
    Hybrid Log-Gamma
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.hdr_supported).toBe(true);
  });

  test('détecte les espaces couleur YCbCr 4:2:0', () => {
    const output = `  YCbCr 4:2:0 Capability Map Data Block:
    VIC  97:  3840x2160   60.000000 Hz  16:9
`;

    const result = metricsCollector._parseEdidDecodeOutput(output);
    expect(result.color_spaces).toContain('YCbCr_420');
  });
});

describe('_inferDisplayCategory', () => {
  test('détecte tv_oled depuis le nom de modèle', () => {
    const result = metricsCollector._inferDisplayCategory('LG OLED55C1', 'tv', {
      audio_supported: true,
      diagonal_inches: 55,
    }, 'LGD');
    expect(result).toBe('tv_oled');
  });

  test('détecte tv_qled depuis le nom de modèle', () => {
    const result = metricsCollector._inferDisplayCategory('SAMSUNG QLED', 'tv', {
      audio_supported: true,
      diagonal_inches: 65,
    }, 'SAM');
    expect(result).toBe('tv_qled');
  });

  test('détecte tv_led depuis le nom de modèle', () => {
    const result = metricsCollector._inferDisplayCategory('LED TV', 'tv', {
      audio_supported: true,
      diagonal_inches: 43,
    }, 'SAM');
    expect(result).toBe('tv_led');
  });

  test('préfère OLED sur LED quand le modèle contient OLED', () => {
    const result = metricsCollector._inferDisplayCategory('OLED65', 'tv', {
      audio_supported: true,
      diagonal_inches: 65,
    }, 'LGD');
    expect(result).toBe('tv_oled');
  });

  test('détecte monitor depuis petit écran sans audio', () => {
    const result = metricsCollector._inferDisplayCategory('DELL P2419H', 'monitor', {
      audio_supported: false,
      diagonal_inches: 24,
    }, 'DEL');
    expect(result).toBe('monitor');
  });

  test('détecte projector depuis display_product_type', () => {
    const result = metricsCollector._inferDisplayCategory('EPSON', 'unknown', {
      display_product_type: 'projector',
    }, 'EPS');
    expect(result).toBe('projector');
  });

  test('infère tv depuis un grand écran avec audio sans mot-clé modèle', () => {
    const result = metricsCollector._inferDisplayCategory('SAMSUNG', 'unknown', {
      audio_supported: true,
      diagonal_inches: 55,
    }, 'SAM');
    expect(result).toBe('tv');
  });

  test('infère tv depuis display_type seul', () => {
    const result = metricsCollector._inferDisplayCategory('SAMSUNG', 'tv', null, 'SAM');
    expect(result).toBe('tv');
  });

  test('retourne unknown quand aucun signal disponible', () => {
    const result = metricsCollector._inferDisplayCategory(null, 'unknown', null, null);
    expect(result).toBe('unknown');
  });

  test('détecte tv_plasma depuis le nom de modèle', () => {
    const result = metricsCollector._inferDisplayCategory('PLASMA TV', 'tv', {
      audio_supported: true,
      diagonal_inches: 50,
    }, 'SAM');
    expect(result).toBe('tv_plasma');
  });

  test('détecte tv_qned depuis le nom de modèle', () => {
    const result = metricsCollector._inferDisplayCategory('LG QNED81', 'tv', {
      audio_supported: true,
      diagonal_inches: 55,
    }, 'LGD');
    expect(result).toBe('tv_qned');
  });

  // Tests filtre manufacturer — moniteurs PC avec CEA audio classifiés correctement
  test('force monitor pour Lenovo (LEN) malgré audio_supported et 27 pouces', () => {
    const result = metricsCollector._inferDisplayCategory('L27i-30', 'unknown', {
      audio_supported: true,
      diagonal_inches: 27,
      color_spaces: ['YCbCr_444', 'YCbCr_422'],
    }, 'LEN');
    expect(result).toBe('monitor');
  });

  test('force monitor pour Dell (DEL) malgré audio_supported et grand écran', () => {
    const result = metricsCollector._inferDisplayCategory('DELL U3223QE', 'unknown', {
      audio_supported: true,
      diagonal_inches: 32,
    }, 'DEL');
    expect(result).toBe('monitor');
  });

  test('force monitor pour ASUS (ACI) avec CEA extension', () => {
    const result = metricsCollector._inferDisplayCategory('VG279Q', 'unknown', {
      audio_supported: true,
      diagonal_inches: 27,
    }, 'ACI');
    expect(result).toBe('monitor');
  });

  test('force monitor pour HP (HWP) avec CEA extension', () => {
    const result = metricsCollector._inferDisplayCategory('HP Z27', 'unknown', {
      audio_supported: true,
      diagonal_inches: 27,
    }, 'HWP');
    expect(result).toBe('monitor');
  });

  test('force monitor pour BenQ (BNQ) avec CEA extension', () => {
    const result = metricsCollector._inferDisplayCategory('BenQ PD2700U', 'unknown', {
      audio_supported: true,
      diagonal_inches: 27,
    }, 'BNQ');
    expect(result).toBe('monitor');
  });

  test('ne force PAS monitor pour LG (GSM) — fabrique aussi des TV', () => {
    const result = metricsCollector._inferDisplayCategory('LG 55NANO', 'unknown', {
      audio_supported: true,
      diagonal_inches: 55,
    }, 'GSM');
    expect(result).not.toBe('monitor');
  });

  test('ne force PAS monitor pour Samsung (SAM) — fabrique aussi des TV', () => {
    const result = metricsCollector._inferDisplayCategory('SAMSUNG', 'unknown', {
      audio_supported: true,
      diagonal_inches: 55,
    }, 'SAM');
    expect(result).not.toBe('monitor');
  });
});

describe('_runEdidDecode', () => {
  const { exec } = require('child_process');

  afterEach(() => {
    exec.mockReset();
  });

  test('appelle edid-decode avec le bon chemin', async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      if (typeof opts === 'function') {
        cb = opts;
      }
      cb(null, { stdout: 'Maximum image size: 53 cm x 30 cm\nDigital display\n', stderr: '' });
    });

    const result = await metricsCollector._runEdidDecode('/sys/class/drm/card1-HDMI-A-1/edid');

    expect(exec).toHaveBeenCalledWith(
      'edid-decode "/sys/class/drm/card1-HDMI-A-1/edid" 2>/dev/null',
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(result.screen_size).toBe('53x30cm');
    expect(result.input_type).toBe('digital');
  });

  test('propage l\'erreur si edid-decode n\'est pas installé', async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      if (typeof opts === 'function') {
        cb = opts;
      }
      cb(new Error('command not found: edid-decode'));
    });

    await expect(metricsCollector._runEdidDecode('/sys/class/drm/card1-HDMI-A-1/edid'))
      .rejects.toThrow('command not found');
  });
});
