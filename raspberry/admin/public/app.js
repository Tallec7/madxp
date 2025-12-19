/**
 * Neopro Admin Panel - JavaScript
 */

// ============================================================================
// MODE DEMO - Données mockées pour fonctionnement sans backend
// ============================================================================
const DEMO_MODE = !window.location.hostname.includes('neopro.local') &&
                  !window.location.hostname.includes('192.168.4.1') &&
                  !window.location.hostname.includes('localhost');

const DEMO_DATA = {
    system: {
        hostname: 'neopro-demo',
        platform: 'linux',
        arch: 'arm64',
        uptime: '3 jours, 14 heures',
        cpu: {
            cores: 4,
            model: 'ARM Cortex-A72',
            usage: '32%'
        },
        memory: {
            total: '4.0 GB',
            free: '2.5 GB',
            used: '1.5 GB',
            percent: '38'
        },
        temperature: '48.5°C',
        disk: {
            filesystem: '/dev/mmcblk0p2',
            size: '32G',
            used: '12G',
            available: '18G',
            total: '32G',
            percent: '40'
        },
        services: {
            'neopro-app': 'running',
            'neopro-admin': 'running',
            'nginx': 'running',
            'hostapd': 'running',
            'dnsmasq': 'running'
        }
    },
    configuration: {
        clubName: 'Club Démo',
        ssid: 'NEOPRO-DEMO',
        version: '1.0.0',
        categories: [
            { id: 'focus-partenaires', name: 'Focus Partenaires', locked: false, subcategories: [] },
            { id: 'info-club', name: 'Info Club', locked: false, subcategories: [] },
            { id: 'match', name: 'Match', locked: false, subcategories: [
                { id: 'sm1', name: 'SM1' },
                { id: 'sm2', name: 'SM2' }
            ]},
            { id: 'jingles', name: 'Jingles', locked: true, subcategories: [] }
        ],
        timeCategories: [
            { id: 'avant-match', name: 'Avant-match', categories: ['focus-partenaires', 'info-club'] },
            { id: 'match', name: 'Match', categories: ['match', 'jingles'] },
            { id: 'apres-match', name: 'Après-match', categories: ['focus-partenaires'] }
        ],
        videos: [
            { category: 'focus-partenaires', filename: 'sponsor-principal.mp4', displayName: 'Sponsor Principal' },
            { category: 'focus-partenaires', filename: 'partenaire-local.mp4', displayName: 'Partenaire Local' },
            { category: 'info-club', filename: 'prochains-matchs.mp4', displayName: 'Prochains Matchs' },
            { category: 'info-club', filename: 'recrutement.mp4', displayName: 'Recrutement' },
            { category: 'match', subcategory: 'sm1', filename: 'but-1.mp4', displayName: 'But n°1' },
            { category: 'match', subcategory: 'sm1', filename: 'but-2.mp4', displayName: 'But n°2' },
            { category: 'jingles', filename: 'celebration.mp4', displayName: 'Célébration' },
            { category: 'jingles', filename: 'intro.mp4', displayName: 'Intro' }
        ]
    },
    network: {
        wlan0: [{ address: '192.168.4.1', netmask: '255.255.255.0', family: 'IPv4' }],
        wlan1: [{ address: '192.168.1.50', netmask: '255.255.255.0', family: 'IPv4' }],
        eth0: []
    },
    logs: {
        app: `[2024-12-04 14:30:15] Server Socket.IO started on port 3000
[2024-12-04 14:30:16] Configuration loaded successfully
[2024-12-04 14:32:45] Client connected: remote-abc123
[2024-12-04 14:35:20] Video played: sponsor-principal.mp4
[2024-12-04 14:38:10] Video played: but-1.mp4
[2024-12-04 14:40:05] Client disconnected: remote-abc123
[2024-12-04 14:42:30] Client connected: tv-def456
[2024-12-04 14:45:00] Video played: partenaire-local.mp4`,
        nginx: `192.168.4.10 - - [04/Dec/2024:14:30:00 +0000] "GET /tv HTTP/1.1" 200 1234
192.168.4.10 - - [04/Dec/2024:14:30:02 +0000] "GET /remote HTTP/1.1" 200 2345
192.168.4.15 - - [04/Dec/2024:14:35:10 +0000] "GET /remote HTTP/1.1" 200 2345
192.168.4.15 - - [04/Dec/2024:14:35:15 +0000] "GET /socket.io/ HTTP/1.1" 101 0`,
        system: `Dec 04 14:30:00 neopro systemd[1]: Started Neopro Application
Dec 04 14:30:01 neopro systemd[1]: Started Neopro Admin Interface
Dec 04 14:30:02 neopro systemd[1]: Started nginx.service
Dec 04 14:30:03 neopro hostapd[1234]: wlan0: AP-ENABLED`
    }
};

// Intercepteur fetch pour le mode démo
if (DEMO_MODE) {
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        console.log('[DEMO] Intercepted fetch:', url);

        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        // Router vers les données mockées
        if (url.includes('/api/system')) {
            // Varier légèrement les valeurs à chaque appel
            const data = JSON.parse(JSON.stringify(DEMO_DATA.system));
            data.cpu.usage = (25 + Math.random() * 20).toFixed(0) + '%';
            data.memory.percent = (35 + Math.random() * 10).toFixed(0);
            data.temperature = (45 + Math.random() * 10).toFixed(1) + '°C';
            return new Response(JSON.stringify(data), { status: 200 });
        }

        if (url.includes('/api/version')) {
            return new Response(JSON.stringify({
                version: DEMO_DATA.configuration.version,
                commit: 'demo',
                buildDate: new Date().toISOString(),
                source: 'demo-mode'
            }), { status: 200 });
        }

        if (url.includes('/api/configuration/time-categories')) {
            if (options.method === 'POST') {
                return new Response(JSON.stringify({ success: true, message: 'Configuration sauvegardée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify(DEMO_DATA.configuration.timeCategories), { status: 200 });
        }

        if (url.includes('/api/configuration/categories')) {
            if (options.method === 'POST') {
                return new Response(JSON.stringify({ success: true, message: 'Catégorie ajoutée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify(DEMO_DATA.configuration.categories), { status: 200 });
        }

        if (url.includes('/api/configuration')) {
            return new Response(JSON.stringify(DEMO_DATA.configuration), { status: 200 });
        }

        if (url.includes('/api/videos/orphans')) {
            return new Response(JSON.stringify({ orphans: [] }), { status: 200 });
        }

        if (url.includes('/api/videos/upload')) {
            return new Response(JSON.stringify({ success: true, message: 'Upload simulé (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/videos')) {
            if (options.method === 'DELETE') {
                return new Response(JSON.stringify({ success: true, message: 'Vidéo supprimée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify({ videos: DEMO_DATA.configuration.videos }), { status: 200 });
        }

        if (url.includes('/api/network')) {
            return new Response(JSON.stringify(DEMO_DATA.network), { status: 200 });
        }

        if (url.includes('/api/logs/')) {
            const service = url.split('/api/logs/')[1].split('?')[0];
            const logs = DEMO_DATA.logs[service] || DEMO_DATA.logs.app;
            return new Response(JSON.stringify({ service, lines: logs }), { status: 200 });
        }

        if (url.includes('/api/services/') && url.includes('/restart')) {
            return new Response(JSON.stringify({ success: true, message: 'Service redémarré (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/wifi/client')) {
            return new Response(JSON.stringify({ success: true, message: 'WiFi configuré (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/system/reboot') || url.includes('/api/system/shutdown')) {
            return new Response(JSON.stringify({ success: true, message: 'Action simulée (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/update')) {
            return new Response(JSON.stringify({ success: true, message: 'Mise à jour simulée (mode démo)' }), { status: 200 });
        }

        // Fallback: appel original
        return originalFetch(url, options);
    };

    console.log('🎭 NEOPRO ADMIN - MODE DEMO ACTIVÉ');
}

// ============================================================================
// FIN MODE DEMO
// ============================================================================

// État global
let currentTab = 'dashboard';
let currentLogService = 'app';
let refreshInterval = null;
let cachedVideos = []; // Toutes les vidéos (config + orphelines)
let cachedOrphanVideos = []; // Vidéos orphelines uniquement
let cachedConfig = null;
let cachedTimeCategories = [];
let availableCategories = [];
let currentVersionInfo = null;

// Connection status management
let connectionStatus = 'checking'; // 'online', 'offline', 'reconnecting', 'checking'
let lastSuccessfulRequest = Date.now();
let connectionCheckInterval = null;

// Bulk selection state
let selectedVideos = new Set();
let bulkModeEnabled = false;

/**
 * Update connection status badge
 */
function updateConnectionStatus(status) {
    connectionStatus = status;
    const badge = document.getElementById('connection-status');
    const textElement = badge.querySelector('.connection-text');

    // Remove all status classes
    badge.classList.remove('online', 'offline', 'reconnecting');

    // Add current status class
    badge.classList.add(status);

    // Update text
    const statusTexts = {
        'online': 'En ligne',
        'offline': 'Hors ligne',
        'reconnecting': 'Reconnexion...',
        'checking': 'Vérification...'
    };

    textElement.textContent = statusTexts[status] || 'Inconnu';

    // Update aria-label for accessibility
    badge.setAttribute('aria-label', `État de la connexion: ${statusTexts[status]}`);
}

/**
 * Check connection status by making a lightweight API call
 */
async function checkConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch('/api/system', {
            signal: controller.signal,
            method: 'HEAD', // Use HEAD for lightweight check
            cache: 'no-cache'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            lastSuccessfulRequest = Date.now();
            if (connectionStatus !== 'online') {
                updateConnectionStatus('online');
            }
            return true;
        } else {
            throw new Error('Server returned error status');
        }
    } catch (error) {
        // If we were online, try to reconnect
        if (connectionStatus === 'online') {
            updateConnectionStatus('reconnecting');
        } else if (connectionStatus === 'reconnecting') {
            // After some time in reconnecting, mark as offline
            const timeSinceLastSuccess = Date.now() - lastSuccessfulRequest;
            if (timeSinceLastSuccess > 30000) { // 30 seconds
                updateConnectionStatus('offline');
            }
        } else {
            updateConnectionStatus('offline');
        }
        return false;
    }
}

/**
 * Start connection monitoring
 */
function startConnectionMonitoring() {
    // Initial check
    checkConnection();

    // Check every 10 seconds
    connectionCheckInterval = setInterval(checkConnection, 10000);

    // Also check on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkConnection();
        }
    });

    // Check on online/offline events
    window.addEventListener('online', () => {
        console.log('[Connection] Browser online event');
        checkConnection();
    });

    window.addEventListener('offline', () => {
        console.log('[Connection] Browser offline event');
        updateConnectionStatus('offline');
    });
}

/**
 * Wrap fetch to track successful requests
 */
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    try {
        const response = await originalFetch(...args);
        if (response.ok) {
            lastSuccessfulRequest = Date.now();
            if (connectionStatus !== 'online') {
                updateConnectionStatus('online');
            }
        }
        return response;
    } catch (error) {
        // Let the connection check handle status updates
        throw error;
    }
};

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSubNavigation();
    initForms();
    initLogButtons();
    initDropZone();
    updateTime();
    startConnectionMonitoring(); // Start connection monitoring
    loadDashboard();
    loadVersionLabel();

    // Charger la configuration pour peupler les selects
    await loadConfiguration();

    // Rafraîchissement automatique toutes les 5 secondes
    refreshInterval = setInterval(() => {
        if (currentTab === 'dashboard') {
            loadDashboard();
        }
    }, 5000);
});

/**
 * Initialisation de la sous-navigation vidéos
 */
function initSubNavigation() {
    const subnavButtons = document.querySelectorAll('.subnav-btn');
    subnavButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const subtab = btn.dataset.subtab;

            // Update active button
            subnavButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active content
            document.querySelectorAll('.subtab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`subtab-${subtab}`).classList.add('active');
        });
    });
}

/**
 * Charge la configuration et peuple les selects de catégories
 */
async function loadConfiguration() {
    try {
        const response = await fetch('/api/configuration');
        if (!response.ok) {
            console.error('Erreur lors du chargement de la configuration');
            return;
        }
        cachedConfig = await response.json();
        populateCategorySelects();
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
    }
}

async function loadVersionLabel() {
    const label = document.getElementById('version-label');
    if (!label) {
        return;
    }

    try {
        const response = await fetch('/api/version');
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        currentVersionInfo = await response.json();
    } catch (error) {
        console.warn('[admin-ui] Impossible de charger la version:', error);
        currentVersionInfo = null;
    }

    updateVersionLabel();
}

function updateVersionLabel() {
    const label = document.getElementById('version-label');
    if (!label) {
        return;
    }

    const versionText = currentVersionInfo?.version
        ? `Neopro v${currentVersionInfo.version}`
        : 'Neopro';
    label.textContent = `${versionText} | Raspberry Pi Admin Panel`;

    const tooltip = [];
    if (currentVersionInfo?.commit) {
        tooltip.push(`commit ${currentVersionInfo.commit}`);
    }
    if (currentVersionInfo?.buildDate) {
        try {
            tooltip.push(
                `build ${new Date(currentVersionInfo.buildDate).toLocaleString('fr-FR')}`
            );
        } catch (error) {
            tooltip.push(`build ${currentVersionInfo.buildDate}`);
        }
    }
    if (currentVersionInfo?.source) {
        tooltip.push(`source ${currentVersionInfo.source}`);
    }

    if (tooltip.length) {
        label.title = tooltip.join(' • ');
    } else {
        label.removeAttribute('title');
    }
}

/**
 * Peuple les selects de catégories avec les données de la configuration
 * Les catégories verrouillées ne sont pas proposées pour l'upload
 */
function populateCategorySelects() {
    const categorySelect = document.getElementById('video-category');
    if (!categorySelect || !cachedConfig) {
        return;
    }

    const categories = cachedConfig.categories || [];

    // Vider et repeupler le select (exclure les catégories verrouillées)
    categorySelect.innerHTML = '<option value="">-- Sélectionner --</option>';

    categories.forEach(cat => {
        // Ne pas proposer les catégories verrouillées pour l'upload
        if (isLocked(cat)) {
            return;
        }
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name || cat.id;
        categorySelect.appendChild(option);
    });
}

/**
 * Navigation
 */
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    // Update buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    currentTab = tab;

    // Load data for specific tabs
    switch (tab) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'videos':
            loadVideos();
            loadTimeCategories();
            loadCategoriesForManager();
            break;
        case 'network':
            loadNetwork();
            break;
        case 'logs':
            loadLogs(currentLogService);
            break;
    }
}

/**
 * Dashboard
 */
async function loadDashboard() {
    try {
        const response = await fetch('/api/system');
        console.log('[admin-ui] GET /api/system -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/system payload', data);

        if (data.error) {
            console.error('Error loading system info:', data.error);
            return;
        }

        // Update hostname
        document.getElementById('hostname').textContent = data.hostname || 'neopro';

        // CPU
        document.getElementById('cpu-usage').textContent = data.cpu.usage;
        document.getElementById('cpu-cores').textContent = data.cpu.cores;
        const cpuPercent = parseFloat(data.cpu.usage);
        document.getElementById('cpu-progress').style.width = cpuPercent + '%';

        // Memory
        document.getElementById('mem-used').textContent = data.memory.used;
        document.getElementById('mem-total').textContent = data.memory.total;
        const memPercent = parseFloat(data.memory.percent);
        document.getElementById('mem-progress').style.width = memPercent + '%';

        // Temperature
        document.getElementById('temperature').textContent = data.temperature;
        const temp = parseFloat(data.temperature);
        const tempEl = document.getElementById('temperature');
        if (temp > 70) {
            tempEl.style.color = 'var(--danger)';
        } else if (temp > 60) {
            tempEl.style.color = 'var(--warning)';
        } else {
            tempEl.style.color = 'var(--success)';
        }

        // Disk
        if (data.disk) {
            document.getElementById('disk-used').textContent = data.disk.used;
            document.getElementById('disk-total').textContent = data.disk.total;
            const diskPercent = parseFloat(data.disk.percent);
            document.getElementById('disk-progress').style.width = diskPercent + '%';
        }

        // Uptime
        document.getElementById('uptime').textContent = data.uptime;

        // Services
        updateServicesGrid(data.services);

        // Update timestamp
        document.getElementById('last-update').textContent =
            'Dernière mise à jour: ' + new Date().toLocaleTimeString('fr-FR');

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateServicesGrid(services) {
    if (!services || typeof services !== 'object') {
        console.warn('[admin-ui] Services data missing or invalid:', services);
        return;
    }

    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';

    for (const [name, status] of Object.entries(services)) {
        const item = document.createElement('div');
        item.className = 'service-item';
        item.innerHTML = `
            <span class="service-name">${name}</span>
            <span class="service-status ${status}">${status === 'running' ? '✓ Running' : '✗ Stopped'}</span>
        `;
        grid.appendChild(item);
    }
}

/**
 * Videos
 */
async function loadVideos() {
    try {
        // Vider le cache des vidéos
        cachedVideos = [];
        cachedOrphanVideos = [];

        // Charger la configuration ET les vidéos orphelines en parallèle
        const [configResponse, orphansResponse] = await Promise.all([
            fetch('/api/configuration'),
            fetch('/api/videos/orphans')
        ]);

        const config = configResponse.ok ? await configResponse.json() : { categories: [] };
        const orphansData = orphansResponse.ok ? await orphansResponse.json() : { orphans: [] };

        const list = document.getElementById('videos-list');
        if (!list) {
            return;
        }
        list.innerHTML = '';

        // Mettre à jour le cache de config pour l'édition
        cachedConfig = config;

        // Afficher la structure de la configuration (ajoute aussi les vidéos au cache)
        renderConfigurationStructure(list, config);

        // Afficher les vidéos orphelines
        if (orphansData.orphans && orphansData.orphans.length > 0) {
            cachedOrphanVideos = orphansData.orphans;
            renderOrphanVideos(list, orphansData.orphans, config.categories || []);
        }

        updateVideoSuggestions(cachedVideos);
    } catch (error) {
        console.error('Error loading videos:', error);
    }
}

/**
 * Vérifie si un élément est verrouillé (géré par NEOPRO)
 */
function isLocked(item) {
    return item && (item.locked === true || item.owner === 'neopro');
}

/**
 * Génère le badge de verrouillage HTML
 */
function getLockBadgeHtml(item) {
    if (!isLocked(item)) return '';
    return `<span class="lock-badge lock-tooltip" data-tooltip="Géré par NEOPRO - Non modifiable"><span class="lock-icon">🔒</span> NEOPRO</span>`;
}

/**
 * Génère le badge de propriétaire HTML
 */
function getOwnerBadgeHtml(item) {
    if (!item) return '';
    const owner = item.owner || (isLocked(item) ? 'neopro' : 'club');
    if (owner === 'neopro') {
        return `<span class="owner-badge neopro">NEOPRO</span>`;
    }
    return `<span class="owner-badge club">Club</span>`;
}

function renderConfigurationStructure(container, config) {
    const categories = config.categories || [];

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = '<h3>📁 Configuration télécommande</h3>';
    container.appendChild(header);

    // Message d'info sur le contenu verrouillé si présent
    const hasLockedContent = categories.some(cat => isLocked(cat));
    if (hasLockedContent) {
        const infoMsg = document.createElement('div');
        infoMsg.className = 'locked-info-message';
        infoMsg.innerHTML = `
            <span class="info-icon">🔒</span>
            <span>Les éléments avec un cadenas sont gérés par NEOPRO et ne peuvent pas être modifiés.</span>
        `;
        container.appendChild(infoMsg);
    }

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'config-empty';
        empty.innerHTML = '<p class="video-empty-state">Aucune catégorie configurée</p>';
        container.appendChild(empty);
        return;
    }

    categories.forEach(category => {
        const categoryLocked = isLocked(category);
        const groupEl = document.createElement('div');
        groupEl.className = `video-group config-group${categoryLocked ? ' locked-category' : ''}`;

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'video-group-header';

        const videoCount = countVideosInCategory(category);
        const subCount = (category.subCategories || []).length;

        categoryHeader.innerHTML = `
            <div>
                <h4>${category.name || category.id || 'Sans nom'}${getLockBadgeHtml(category)}</h4>
                <span class="video-count">${videoCount} vidéo(s)${subCount > 0 ? ` · ${subCount} sous-cat.` : ''}</span>
            </div>
        `;
        groupEl.appendChild(categoryHeader);

        const body = document.createElement('div');
        body.className = 'video-subgroups';

        // Vidéos directes de la catégorie
        if (category.videos && category.videos.length > 0) {
            body.appendChild(createConfigVideoList('Vidéos directes', category.videos, category.id, null, categoryLocked, null));
        }

        // Sous-catégories
        (category.subCategories || []).forEach(subcat => {
            const subcatLocked = categoryLocked || isLocked(subcat);
            if (subcat.videos && subcat.videos.length > 0) {
                body.appendChild(createConfigVideoList(subcat.name || subcat.id, subcat.videos, category.id, subcat.id, categoryLocked, subcat));
            } else {
                const emptySubcat = document.createElement('div');
                emptySubcat.className = 'video-subgroup';
                emptySubcat.innerHTML = `
                    <div class="video-subgroup-header">
                        <h5>${subcat.name || subcat.id}</h5>
                        <span class="video-count">0 vidéo</span>
                    </div>
                    <p class="video-empty-state">Aucune vidéo</p>
                `;
                body.appendChild(emptySubcat);
            }
        });

        if (!category.videos?.length && !category.subCategories?.length) {
            const empty = document.createElement('p');
            empty.className = 'video-empty-state';
            empty.textContent = 'Aucune vidéo dans cette catégorie';
            body.appendChild(empty);
        }

        groupEl.appendChild(body);
        container.appendChild(groupEl);
    });
}

function createConfigVideoList(title, videos, categoryId, subcategoryId = null, parentLocked = false, subcategoryObj = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-subgroup';

    const subcatLocked = parentLocked || isLocked(subcategoryObj);
    const lockBadge = subcatLocked ? `<span class="lock-badge lock-tooltip" data-tooltip="Sous-catégorie NEOPRO"><span class="lock-icon">🔒</span></span>` : '';

    const header = document.createElement('div');
    header.className = 'video-subgroup-header';
    header.innerHTML = `
        <h5>${title}${lockBadge}</h5>
        <span class="video-count">${videos.length} vidéo(s)</span>
    `;
    wrapper.appendChild(header);

    const list = document.createElement('div');
    list.className = 'video-rows';
    list.dataset.categoryId = categoryId;
    list.dataset.subcategoryId = subcategoryId || '';

    // Add drop zone listeners for drag & drop (sauf si verrouillé)
    if (!subcatLocked) {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('drop', handleDrop);
        list.addEventListener('dragleave', handleDragLeave);
    }

    // Empty state placeholder for drop zone
    if (videos.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'video-empty-drop-zone';
        emptyState.innerHTML = subcatLocked
            ? `<span class="empty-icon">🔒</span><span class="empty-text">Aucune vidéo (catégorie NEOPRO)</span>`
            : `<span class="empty-icon">📁</span><span class="empty-text">Aucune vidéo - Glissez une vidéo ici</span>`;
        list.appendChild(emptyState);
    }

    videos.forEach((video, index) => {
        // Vérifier si la vidéo elle-même est verrouillée
        const videoLocked = subcatLocked || isLocked(video);

        const row = document.createElement('div');
        row.className = `video-row${videoLocked ? ' locked-video' : ''}`;
        row.draggable = !videoLocked;
        row.dataset.videoPath = video.path;
        row.dataset.videoIndex = index;
        row.dataset.categoryId = categoryId;
        row.dataset.subcategoryId = subcategoryId || '';

        // Créer un objet vidéo enrichi pour l'édition/suppression
        const videoData = {
            path: video.path,
            name: video.path ? video.path.split('/').pop() : video.name,
            displayName: video.name,
            configCategory: categoryId,
            configSubcategory: subcategoryId,
            locked: videoLocked
        };

        // Ajouter au cache global pour l'édition
        if (!cachedVideos.find(v => v.path === videoData.path)) {
            cachedVideos.push(videoData);
        }

        // URL de la vidéo pour prévisualisation
        const videoUrl = video.path ? `/${video.path}` : '';

        // Classes pour les boutons verrouillés
        const lockedBtnClass = videoLocked ? ' locked-btn' : '';

        row.innerHTML = `
            <div class="video-row-checkbox">
                <input type="checkbox" class="video-select-checkbox" data-path="${video.path}" ${selectedVideos.has(video.path) ? 'checked' : ''}${videoLocked ? ' disabled' : ''}>
            </div>
            ${videoLocked ? '<div class="video-row-lock"><span class="video-lock-icon lock-tooltip" data-tooltip="Géré par NEOPRO">🔒</span></div>' : '<div class="video-row-drag-handle" title="Glisser pour réorganiser">⋮⋮</div>'}
            <div class="video-row-preview">
                <div class="video-thumbnail" data-video-url="${videoUrl}">
                    <span class="play-icon">▶</span>
                </div>
            </div>
            <div class="video-row-info">
                <div class="video-row-title">${video.name || 'Sans nom'}</div>
                <div class="video-row-path">${video.path || ''}</div>
            </div>
            <div class="video-row-actions">
                <button class="btn btn-secondary btn-sm preview-video-btn" data-video-url="${videoUrl}" title="Prévisualiser">👁️</button>
                <button class="btn btn-secondary btn-sm edit-video-btn${lockedBtnClass}" data-path="${video.path}" ${videoLocked ? 'disabled title="Contenu NEOPRO - Non modifiable"' : ''}>✏️</button>
                <button class="btn btn-danger btn-sm delete-video-btn${lockedBtnClass}" data-path="${video.path}" data-category="${categoryId}" data-subcategory="${subcategoryId || ''}" ${videoLocked ? 'disabled title="Contenu NEOPRO - Non supprimable"' : ''}>🗑️</button>
            </div>
        `;

        // Drag & drop event listeners (sauf si verrouillé)
        if (!videoLocked) {
            row.addEventListener('dragstart', handleDragStart);
            row.addEventListener('dragend', handleDragEnd);
        }

        // Ajouter les event listeners
        const checkbox = row.querySelector('.video-select-checkbox');
        const thumbnail = row.querySelector('.video-thumbnail');
        const previewBtn = row.querySelector('.preview-video-btn');
        const editBtn = row.querySelector('.edit-video-btn');
        const deleteBtn = row.querySelector('.delete-video-btn');

        // La sélection et prévisualisation sont toujours permises
        if (!videoLocked) {
            checkbox.addEventListener('change', (e) => handleVideoSelection(e, video.path));
        }
        thumbnail.addEventListener('click', () => openVideoPreview(videoUrl, video.name));
        previewBtn.addEventListener('click', () => openVideoPreview(videoUrl, video.name));

        // Édition et suppression uniquement si non verrouillé
        if (!videoLocked) {
            editBtn.addEventListener('click', () => openEditModal(video.path));
            deleteBtn.addEventListener('click', () => deleteConfigVideo(video.path, categoryId, subcategoryId));
        }

        list.appendChild(row);
    });

    wrapper.appendChild(list);
    return wrapper;
}

function countVideosInCategory(category) {
    let count = (category.videos || []).length;
    (category.subCategories || []).forEach(sub => {
        count += (sub.videos || []).length;
    });
    return count;
}

function renderOrphanVideos(container, orphans, existingCategories) {
    const section = document.createElement('div');
    section.className = 'orphan-videos-section';

    const header = document.createElement('div');
    header.className = 'section-header orphan-header';
    header.innerHTML = `
        <h3>⚠️ Vidéos non référencées (${orphans.length})</h3>
        <p class="hint">Ces vidéos sont sur le disque mais pas dans la configuration</p>
    `;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'orphan-list';

    orphans.forEach(video => {
        const row = document.createElement('div');
        row.className = 'orphan-row';

        row.innerHTML = `
            <div class="orphan-info">
                <div class="orphan-title">${video.displayName || video.name}</div>
                <div class="orphan-meta">${video.size} • ${video.category || 'racine'}</div>
                <div class="orphan-path">videos/${video.path}</div>
            </div>
            <div class="orphan-actions">
                <select class="orphan-category-select" data-path="${video.path}">
                    <option value="">-- Catégorie --</option>
                    ${existingCategories.map(cat => `<option value="${cat.id}">${cat.name || cat.id}</option>`).join('')}
                    <option value="__new__">+ Nouvelle catégorie...</option>
                </select>
                <select class="orphan-subcategory-select" data-path="${video.path}" style="display: none;">
                    <option value="">-- Sous-catégorie (optionnel) --</option>
                </select>
                <button class="btn btn-primary btn-sm add-to-config-btn" data-path="${video.path}">
                    Ajouter
                </button>
            </div>
        `;

        // Event listeners
        const categorySelect = row.querySelector('.orphan-category-select');
        const subcategorySelect = row.querySelector('.orphan-subcategory-select');
        const addBtn = row.querySelector('.add-to-config-btn');

        categorySelect.addEventListener('change', (e) => {
            const catId = e.target.value;
            if (catId === '__new__') {
                const newCat = prompt('Nom de la nouvelle catégorie:');
                if (newCat) {
                    const option = document.createElement('option');
                    option.value = newCat;
                    option.textContent = newCat;
                    option.selected = true;
                    categorySelect.insertBefore(option, categorySelect.lastElementChild);
                } else {
                    categorySelect.value = '';
                }
                subcategorySelect.style.display = 'none';
                return;
            }

            // Afficher les sous-catégories si la catégorie en a
            const category = existingCategories.find(c => c.id === catId);
            if (category && category.subCategories && category.subCategories.length > 0) {
                subcategorySelect.innerHTML = `
                    <option value="">-- Sans sous-cat. --</option>
                    ${category.subCategories.map(sub => `<option value="${sub.id}">${sub.name || sub.id}</option>`).join('')}
                    <option value="__new__">+ Nouvelle sous-cat...</option>
                `;
                subcategorySelect.style.display = 'inline-block';
            } else {
                subcategorySelect.style.display = 'none';
            }
        });

        subcategorySelect.addEventListener('change', (e) => {
            if (e.target.value === '__new__') {
                const newSub = prompt('Nom de la nouvelle sous-catégorie:');
                if (newSub) {
                    const option = document.createElement('option');
                    option.value = newSub;
                    option.textContent = newSub;
                    option.selected = true;
                    subcategorySelect.insertBefore(option, subcategorySelect.lastElementChild);
                } else {
                    subcategorySelect.value = '';
                }
            }
        });

        addBtn.addEventListener('click', async () => {
            const videoPath = addBtn.dataset.path;
            const categoryId = categorySelect.value;
            const subcategoryId = subcategorySelect.value !== '__new__' ? subcategorySelect.value : '';

            if (!categoryId || categoryId === '__new__') {
                showNotification('Sélectionnez une catégorie', 'error');
                return;
            }

            try {
                const response = await fetch('/api/videos/add-to-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        videoPath,
                        categoryId,
                        subcategoryId: subcategoryId || null,
                        displayName: video.displayName
                    })
                });

                const data = await response.json();
                if (data.success) {
                    showNotification('Vidéo ajoutée à la configuration', 'success');
                    loadVideos(); // Recharger
                } else {
                    showNotification('Erreur: ' + data.error, 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de l\'ajout', 'error');
            }
        });

        list.appendChild(row);
    });

    section.appendChild(list);
    container.appendChild(section);
}

function groupVideosByCategory(videos) {
    const groups = new Map();

    videos.forEach(video => {
        const { categoryLabel, subcategoryLabel } = parseVideoCategory(video);
        const groupKey = categoryLabel || 'Autres';

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                name: groupKey,
                directVideos: [],
                subgroups: new Map()
            });
        }

        const group = groups.get(groupKey);
        const preparedVideo = {
            ...video,
            displayLabel: video.displayName || formatVideoName(video.name),
            fullPath: `videos/${video.path}`
        };

        if (subcategoryLabel) {
            if (!group.subgroups.has(subcategoryLabel)) {
                group.subgroups.set(subcategoryLabel, []);
            }
            group.subgroups.get(subcategoryLabel).push(preparedVideo);
        } else {
            group.directVideos.push(preparedVideo);
        }
    });

    return Array.from(groups.values()).map(group => {
        const subgroups = Array.from(group.subgroups.entries()).map(([name, items]) => ({
            name,
            videos: items.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'fr'))
        }));

        return {
            name: group.name,
            directVideos: group.directVideos.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, 'fr')),
            subgroups,
            total: group.directVideos.length + subgroups.reduce((sum, sg) => sum + sg.videos.length, 0)
        };
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function renderVideoGroups(container, groups) {
    groups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'video-group';

        const header = document.createElement('div');
        header.className = 'video-group-header';

        const titleWrapper = document.createElement('div');
        const title = document.createElement('h4');
        title.textContent = group.name;
        const count = document.createElement('span');
        count.className = 'video-count';
        count.textContent = `${group.total} vidéo${group.total > 1 ? 's' : ''}`;

        titleWrapper.appendChild(title);
        titleWrapper.appendChild(count);
        header.appendChild(titleWrapper);
        groupEl.appendChild(header);

        const body = document.createElement('div');
        body.className = 'video-subgroups';

        if (group.directVideos.length > 0) {
            body.appendChild(createVideoSubgroup('Vidéos directes', group.directVideos));
        }

        group.subgroups.forEach(subgroup => {
            body.appendChild(createVideoSubgroup(subgroup.name, subgroup.videos));
        });

        if (group.directVideos.length === 0 && group.subgroups.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'video-empty-state';
            empty.textContent = 'Aucune vidéo dans cette catégorie';
            body.appendChild(empty);
        }

        groupEl.appendChild(body);
        container.appendChild(groupEl);
    });
}

function createVideoSubgroup(name, videos) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-subgroup';

    const header = document.createElement('div');
    header.className = 'video-subgroup-header';
    const title = document.createElement('h5');
    title.textContent = name;
    const count = document.createElement('span');
    count.className = 'video-count';
    count.textContent = `${videos.length} vidéo${videos.length > 1 ? 's' : ''}`;
    header.appendChild(title);
    header.appendChild(count);
    wrapper.appendChild(header);

    const list = document.createElement('div');
    list.className = 'video-rows';

    videos.forEach(video => {
        list.appendChild(createVideoRow(video));
    });

    wrapper.appendChild(list);
    return wrapper;
}

function createVideoRow(video) {
    const row = document.createElement('div');
    row.className = 'video-row';

    const info = document.createElement('div');
    info.className = 'video-row-info';

    const title = document.createElement('div');
    title.className = 'video-row-title';
    title.textContent = video.displayLabel;

    const meta = document.createElement('div');
    meta.className = 'video-row-meta';
    const metaParts = [
        video.size,
        formatVideoDate(video.modified)
    ].filter(Boolean);
    meta.textContent = metaParts.join(' • ');

    const pathInfo = document.createElement('div');
    pathInfo.className = 'video-row-path';
    pathInfo.textContent = video.fullPath;

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(pathInfo);

    const actions = document.createElement('div');
    actions.className = 'video-row-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.textContent = '✏️ Modifier';
    editBtn.addEventListener('click', () => openEditModal(video.path));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = '🗑️ Supprimer';
    deleteBtn.addEventListener('click', () => deleteVideo(video.category, video.name));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(info);
    row.appendChild(actions);

    return row;
}

function parseVideoCategory(video) {
    const rawCategory = (video.category === '.' ? '' : (video.category || ''));
    const segments = rawCategory.split(/[/\\]/).filter(Boolean);

    const categoryLabel = video.configCategory || segments[0] || 'Autres';
    const subcategoryLabel = video.configSubcategory || (segments.length > 1 ? segments.slice(1).join(' / ') : '');

    return { categoryLabel, subcategoryLabel };
}

function formatVideoName(filename = '') {
    return filename
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatVideoDate(value) {
    if (!value) {
        return '';
    }
    try {
        const date = new Date(value);
        return date.toLocaleString('fr-FR');
    } catch {
        return '';
    }
}

function updateVideoSuggestions(videos) {
    const categories = new Set();
    const subcategories = new Set();

    videos.forEach(video => {
        const { categoryLabel, subcategoryLabel } = parseVideoCategory(video);
        if (categoryLabel) {
            categories.add(categoryLabel);
        }
        if (video.configCategory) {
            categories.add(video.configCategory);
        }
        if (subcategoryLabel) {
            subcategories.add(subcategoryLabel);
        }
        if (video.configSubcategory) {
            subcategories.add(video.configSubcategory);
        }
    });

    setDatalistOptions('edit-category-options', categories);
    setDatalistOptions('edit-subcategory-options', subcategories);
}

function setDatalistOptions(elementId, values) {
    const datalist = document.getElementById(elementId);
    if (!datalist) {
        return;
    }

    datalist.innerHTML = '';
    Array.from(values)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            datalist.appendChild(option);
        });
}

function refreshVideos() {
    loadVideos();
}

async function deleteVideo(category, filename) {
    if (!confirm(`Supprimer la vidéo "${filename}" ?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/videos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Vidéo supprimée avec succès', 'success');
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

/**
 * Supprimer une vidéo de la configuration
 */
async function deleteConfigVideo(videoPath, categoryId, subcategoryId) {
    const video = cachedVideos.find(v => v.path === videoPath);
    const videoName = video?.displayName || videoPath.split('/').pop();

    if (!confirm(`Supprimer la vidéo "${videoName}" ?\n\nCette action supprimera le fichier du disque.`)) {
        return;
    }

    try {
        const response = await fetch('/api/videos/delete-from-config', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath,
                categoryId,
                subcategoryId: subcategoryId || null
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Vidéo supprimée avec succès', 'success');
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting video:', error);
        showNotification('Erreur lors de la suppression', 'error');
    }
}

/**
 * Network
 */
async function loadNetwork() {
    try {
        const response = await fetch('/api/network');
        const data = await response.json();

        const container = document.getElementById('network-info');
        container.innerHTML = '';

        for (const [iface, addrs] of Object.entries(data.interfaces)) {
            if (addrs.length === 0) continue;

            const div = document.createElement('div');
            div.className = 'network-interface';

            let html = `<h4>${iface}</h4>`;
            addrs.forEach(addr => {
                html += `
                    <p><strong>IP:</strong> ${addr.address}</p>
                    <p><strong>Netmask:</strong> ${addr.netmask}</p>
                    <p><strong>MAC:</strong> ${addr.mac}</p>
                `;
            });

            div.innerHTML = html;
            container.appendChild(div);
        }

        if (data.wifi && data.wifi.currentSSID) {
            const wifiDiv = document.createElement('div');
            wifiDiv.className = 'network-interface';
            wifiDiv.innerHTML = `
                <h4>WiFi connecté</h4>
                <p><strong>SSID:</strong> ${data.wifi.currentSSID}</p>
            `;
            container.appendChild(wifiDiv);
        }
    } catch (error) {
        console.error('Error loading network:', error);
    }
}

function refreshNetwork() {
    loadNetwork();
}

/**
 * Logs
 */
function initLogButtons() {
    const buttons = document.querySelectorAll('[data-log]');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const service = btn.dataset.log;
            currentLogService = service;
            loadLogs(service);
        });
    });
}

async function loadLogs(service) {
    try {
        const response = await fetch(`/api/logs/${service}?lines=100`);
        const data = await response.json();

        const container = document.getElementById('logs-content');
        container.textContent = data.logs || 'Aucun log disponible';
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function refreshLogs() {
    loadLogs(currentLogService);
}

/**
 * Forms
 */
function initForms() {
    // Upload form
    const uploadForm = document.getElementById('upload-form');
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await uploadVideo();
    });

    // Category selector - show subcategories for Match categories
    const categorySelect = document.getElementById('video-category');
    const subcategoryGroup = document.getElementById('subcategory-group');
    const subcategorySelect = document.getElementById('video-subcategory');

    categorySelect.addEventListener('change', (e) => {
        const categoryId = e.target.value;

        // Trouver la catégorie dans la configuration
        const category = cachedConfig?.categories?.find(c => c.id === categoryId);
        const subCategories = category?.subCategories || [];

        // Afficher les sous-catégories si la catégorie en possède
        if (subCategories.length > 0) {
            subcategoryGroup.style.display = 'block';
            subcategorySelect.required = true;

            // Peupler les sous-catégories depuis la config
            subcategorySelect.innerHTML = '<option value="">-- Sélectionner --</option>';
            subCategories.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.id;
                option.textContent = sub.name || sub.id;
                subcategorySelect.appendChild(option);
            });
        } else {
            subcategoryGroup.style.display = 'none';
            subcategorySelect.required = false;
            subcategorySelect.value = '';
        }
    });

    // WiFi form
    const wifiForm = document.getElementById('wifi-form');
    wifiForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await configureWifi();
    });

    // Update form
    const updateForm = document.getElementById('update-form');
    updateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateSystem();
    });

    const editForm = document.getElementById('edit-video-form');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitVideoEdition();
        });
    }
}

// Variables pour l'upload multiple
let selectedFilesForUpload = [];

function initDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('video-file');

    if (!dropZone || !fileInput) return;

    // Click to select files
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
        if (files.length > 0) {
            addFilesToSelection(files);
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            addFilesToSelection(files);
        }
    });
}

function addFilesToSelection(files) {
    selectedFilesForUpload = [...selectedFilesForUpload, ...files];
    updateSelectedFilesUI();
}

function updateSelectedFilesUI() {
    const container = document.getElementById('selected-files');
    const countSpan = document.getElementById('files-count');
    const listUl = document.getElementById('files-list');

    if (selectedFilesForUpload.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    countSpan.textContent = `${selectedFilesForUpload.length} fichier(s) sélectionné(s)`;

    listUl.innerHTML = selectedFilesForUpload.map((file, index) => `
        <li class="file-item">
            <span class="file-name">🎬 ${file.name}</span>
            <span class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
            <button type="button" class="btn btn-small btn-danger" onclick="removeFileFromSelection(${index})">✕</button>
        </li>
    `).join('');
}

function removeFileFromSelection(index) {
    selectedFilesForUpload.splice(index, 1);
    updateSelectedFilesUI();
}

function clearSelectedFiles() {
    selectedFilesForUpload = [];
    document.getElementById('video-file').value = '';
    updateSelectedFilesUI();
}

async function uploadVideo() {
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('video-file');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status');
    const currentFileSpan = document.getElementById('upload-current-file');
    const fileCountSpan = document.getElementById('upload-file-count');
    const resultsDiv = document.getElementById('upload-results');
    const resultsList = document.getElementById('upload-results-list');
    const uploadBtn = document.getElementById('upload-btn');

    // Use selectedFilesForUpload if available, otherwise fallback to fileInput
    const filesToUpload = selectedFilesForUpload.length > 0
        ? selectedFilesForUpload
        : Array.from(fileInput.files);

    if (filesToUpload.length === 0) {
        showNotification('Sélectionnez au moins un fichier', 'error');
        return;
    }

    const category = document.getElementById('video-category').value;
    const subcategory = document.getElementById('video-subcategory').value;

    if (!category) {
        showNotification('Sélectionnez une catégorie', 'error');
        return;
    }

    // Disable upload button
    uploadBtn.disabled = true;
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    resultsList.innerHTML = '';

    console.log('[admin-ui] Upload multiple videos request', {
        category,
        subcategory,
        filesCount: filesToUpload.length
    });

    // Upload multiple files
    if (filesToUpload.length > 1) {
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);

        filesToUpload.forEach(file => {
            formData.append('videos', file);
        });

        currentFileSpan.textContent = 'Upload en cours...';
        fileCountSpan.textContent = `${filesToUpload.length} fichiers`;
        progressBar.style.width = '0%';
        statusText.textContent = 'Envoi des fichiers...';

        try {
            const response = await fetch('/api/videos/upload-multiple', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log('[admin-ui] /api/videos/upload-multiple response', data);

            progressBar.style.width = '100%';

            if (data.success) {
                statusText.textContent = data.message;
                showNotification(data.message, 'success');
            } else {
                statusText.textContent = data.message || 'Upload terminé avec des erreurs';
                showNotification(data.message || 'Certains fichiers ont échoué', 'warning');
            }

            // Show results
            if (data.files || data.errors) {
                resultsDiv.style.display = 'block';
                resultsList.innerHTML = '';

                if (data.files) {
                    data.files.forEach(file => {
                        resultsList.innerHTML += `<li class="result-success">✅ ${file.name} (${file.size})</li>`;
                    });
                }
                if (data.errors) {
                    data.errors.forEach(err => {
                        resultsList.innerHTML += `<li class="result-error">❌ ${err.name}: ${err.error}</li>`;
                    });
                }
            }

            // Reset form after success
            clearSelectedFiles();
            form.reset();
            populateCategorySelects();
            setTimeout(() => {
                loadVideos();
            }, 2000);

        } catch (error) {
            console.error('[admin-ui] Upload error:', error);
            showNotification('Erreur lors de l\'upload', 'error');
            statusText.textContent = 'Erreur';
        }
    } else {
        // Single file upload (original behavior)
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);
        formData.append('video', filesToUpload[0]);

        currentFileSpan.textContent = filesToUpload[0].name;
        fileCountSpan.textContent = '1 fichier';
        progressBar.style.width = '0%';
        statusText.textContent = 'Upload en cours...';

        try {
            const response = await fetch('/api/videos/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log('[admin-ui] /api/videos/upload response', data);

            if (data.success) {
                progressBar.style.width = '100%';
                statusText.textContent = 'Upload terminé !';
                showNotification('Vidéo uploadée avec succès', 'success');
                clearSelectedFiles();
                form.reset();
                populateCategorySelects();
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                    loadVideos();
                }, 2000);
            } else {
                showNotification('Erreur: ' + data.error, 'error');
                progressDiv.style.display = 'none';
            }
        } catch (error) {
            showNotification('Erreur lors de l\'upload', 'error');
            progressDiv.style.display = 'none';
        }
    }

    // Re-enable upload button
    uploadBtn.disabled = false;
}

async function configureWifi() {
    const ssid = document.getElementById('wifi-ssid').value;
    const password = document.getElementById('wifi-password').value;

    if (!ssid || !password) {
        showNotification('SSID et mot de passe requis', 'error');
        return;
    }

    try {
        const response = await fetch('/api/wifi/client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssid, password })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('WiFi configuré avec succès', 'success');
            document.getElementById('wifi-form').reset();
            setTimeout(() => loadNetwork(), 2000);
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la configuration', 'error');
    }
}

async function updateSystem() {
    const fileInput = document.getElementById('update-file');

    if (!fileInput.files[0]) {
        showNotification('Sélectionnez un fichier de mise à jour', 'error');
        return;
    }

    if (!confirm('Mettre à jour le système ? Un backup sera créé automatiquement.')) {
        return;
    }

    const formData = new FormData();
    formData.append('package', fileInput.files[0]);

    try {
        showNotification('Mise à jour en cours...', 'info');

        const response = await fetch('/api/update', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Mise à jour réussie ! Backup: ' + data.backup, 'success');
            document.getElementById('update-form').reset();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la mise à jour', 'error');
    }
}

/**
 * System Actions
 */
async function restartService(service) {
    if (!confirm(`Redémarrer le service ${service} ?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/services/${service}/restart`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Service ${service} redémarré`, 'success');
            setTimeout(() => loadDashboard(), 2000);
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors du redémarrage', 'error');
    }
}

function confirmAction(action) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const message = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');

    if (action === 'reboot') {
        title.textContent = 'Redémarrer le système';
        message.textContent = 'Êtes-vous sûr de vouloir redémarrer le Raspberry Pi ? L\'opération prendra environ 1 minute.';
        confirmBtn.onclick = () => executeAction('reboot');
    } else if (action === 'shutdown') {
        title.textContent = 'Éteindre le système';
        message.textContent = 'Êtes-vous sûr de vouloir éteindre le Raspberry Pi ? Vous devrez le rallumer physiquement.';
        confirmBtn.onclick = () => executeAction('shutdown');
    }

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

async function executeAction(action) {
    closeModal();

    try {
        const response = await fetch(`/api/system/${action}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de l\'opération', 'error');
    }
}

/**
 * Utilities
 */
function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR');
    document.getElementById('current-time').textContent = timeStr;

    setTimeout(updateTime, 1000);
}

function showNotification(message, type = 'info') {
    // Toast notification system
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    // Créer le container si nécessaire
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Créer le toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Animation d'entrée
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-suppression après 4 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Prévisualisation vidéo
 */
function openVideoPreview(videoUrl, videoName) {
    if (!videoUrl) {
        showNotification('URL de vidéo manquante', 'error');
        return;
    }

    const modal = document.getElementById('video-preview-modal');
    const video = document.getElementById('preview-video');
    const title = document.getElementById('preview-video-title');

    if (!modal || !video) {
        showNotification('Modal de prévisualisation non disponible', 'error');
        return;
    }

    title.textContent = videoName || 'Prévisualisation';
    video.src = videoUrl;
    modal.classList.add('active');

    // Lancer la lecture automatiquement
    video.play().catch(() => {
        // Ignorer l'erreur si autoplay est bloqué
    });
}

function closeVideoPreview() {
    const modal = document.getElementById('video-preview-modal');
    const video = document.getElementById('preview-video');

    if (video) {
        video.pause();
        video.src = '';
    }

    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Recherche/filtre dans la bibliothèque
 */
function filterVideos() {
    const searchTerm = document.getElementById('video-search')?.value.toLowerCase().trim() || '';
    const videoRows = document.querySelectorAll('#videos-list .video-row');
    const videoGroups = document.querySelectorAll('#videos-list .video-group');
    const videoSubgroups = document.querySelectorAll('#videos-list .video-subgroup');

    // Si pas de terme de recherche, tout afficher
    if (!searchTerm) {
        videoRows.forEach(row => row.style.display = '');
        videoSubgroups.forEach(sg => sg.style.display = '');
        videoGroups.forEach(g => g.style.display = '');
        return;
    }

    // Filtrer les lignes de vidéos
    videoRows.forEach(row => {
        const title = row.querySelector('.video-row-title')?.textContent.toLowerCase() || '';
        const path = row.querySelector('.video-row-path')?.textContent.toLowerCase() || '';
        const matches = title.includes(searchTerm) || path.includes(searchTerm);
        row.style.display = matches ? '' : 'none';
    });

    // Cacher les sous-groupes vides
    videoSubgroups.forEach(sg => {
        const visibleRows = sg.querySelectorAll('.video-row:not([style*="display: none"])');
        sg.style.display = visibleRows.length > 0 ? '' : 'none';
    });

    // Cacher les groupes vides
    videoGroups.forEach(g => {
        const visibleSubgroups = g.querySelectorAll('.video-subgroup:not([style*="display: none"])');
        g.style.display = visibleSubgroups.length > 0 ? '' : 'none';
    });
}

function openEditModal(videoPath) {
    const modal = document.getElementById('edit-modal');
    const form = document.getElementById('edit-video-form');
    if (!modal || !form) {
        return;
    }

    const video = cachedVideos.find(item => item.path === videoPath);
    if (!video) {
        showNotification('Vidéo introuvable', 'error');
        return;
    }

    document.getElementById('edit-original-path').value = video.path;
    document.getElementById('edit-display-name').value = video.displayName || '';

    // Extraire le nom de fichier depuis le path (plus fiable)
    const filename = video.path ? video.path.split('/').pop() : video.name;
    const extIndex = filename.lastIndexOf('.');
    const nameWithoutExt = extIndex > 0 ? filename.substring(0, extIndex) : filename;
    document.getElementById('edit-filename').value = nameWithoutExt;

    // Peupler le select des catégories
    populateEditCategorySelect(video.configCategory || '');

    // Pré-sélectionner la sous-catégorie si elle existe
    if (video.configSubcategory) {
        setTimeout(() => {
            updateEditSubcategorySelect(video.configCategory, video.configSubcategory);
        }, 50);
    }

    const pathLabel = document.getElementById('edit-current-path');
    if (pathLabel) {
        pathLabel.textContent = `Chemin actuel : videos/${video.path}`;
    }

    modal.classList.add('active');
}

/**
 * Peuple le select des catégories dans le modal d'édition
 * Les catégories verrouillées ne sont pas proposées (sauf si c'est la catégorie actuelle)
 */
function populateEditCategorySelect(selectedCategoryId) {
    const categorySelect = document.getElementById('edit-category');
    const subcategorySelect = document.getElementById('edit-subcategory');

    if (!categorySelect || !cachedConfig?.categories) {
        return;
    }

    // Peupler les catégories (exclure les verrouillées sauf si sélectionnée)
    categorySelect.innerHTML = '<option value="">-- Sélectionner --</option>';
    cachedConfig.categories.forEach(cat => {
        // Ne pas proposer les catégories verrouillées (sauf si c'est la catégorie actuelle)
        if (isLocked(cat) && cat.id !== selectedCategoryId) {
            return;
        }
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name + (isLocked(cat) ? ' 🔒' : '');
        if (cat.id === selectedCategoryId) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });

    // Ajouter l'écouteur pour les sous-catégories
    categorySelect.onchange = function() {
        updateEditSubcategorySelect(this.value);
    };

    // Peupler les sous-catégories si une catégorie est sélectionnée
    if (selectedCategoryId) {
        // Trouver la sous-catégorie actuelle de la vidéo
        const video = cachedVideos.find(v => v.path === document.getElementById('edit-original-path').value);
        updateEditSubcategorySelect(selectedCategoryId, video?.configSubcategory || '');
    } else {
        subcategorySelect.innerHTML = '<option value="">-- Aucune --</option>';
    }
}

/**
 * Met à jour le select des sous-catégories en fonction de la catégorie sélectionnée
 */
function updateEditSubcategorySelect(categoryId, selectedSubcategoryId = '') {
    const subcategorySelect = document.getElementById('edit-subcategory');
    if (!subcategorySelect) return;

    subcategorySelect.innerHTML = '<option value="">-- Aucune --</option>';

    if (!categoryId || !cachedConfig?.categories) {
        return;
    }

    const category = cachedConfig.categories.find(c => c.id === categoryId);
    if (!category || !category.subCategories || category.subCategories.length === 0) {
        return;
    }

    category.subCategories.forEach(sub => {
        const option = document.createElement('option');
        option.value = sub.id;
        option.textContent = sub.name;
        if (sub.id === selectedSubcategoryId) {
            option.selected = true;
        }
        subcategorySelect.appendChild(option);
    });
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetEditForm();
}

function resetEditForm() {
    const form = document.getElementById('edit-video-form');
    if (form) {
        form.reset();
    }

    const pathLabel = document.getElementById('edit-current-path');
    if (pathLabel) {
        pathLabel.textContent = '';
    }

    const originalInput = document.getElementById('edit-original-path');
    if (originalInput) {
        originalInput.value = '';
    }
}

async function submitVideoEdition() {
    const originalPath = document.getElementById('edit-original-path').value;
    const categoryId = document.getElementById('edit-category').value;
    const subcategoryId = document.getElementById('edit-subcategory').value;
    const displayName = document.getElementById('edit-display-name').value.trim();
    const filenameWithoutExt = document.getElementById('edit-filename').value.trim();

    if (!originalPath || !categoryId || !filenameWithoutExt) {
        showNotification('Catégorie et nom de fichier requis', 'error');
        return;
    }

    // Récupérer l'extension originale du fichier depuis le path
    const originalFilename = originalPath.split('/').pop();
    const extIndex = originalFilename.lastIndexOf('.');
    const ext = extIndex > 0 ? originalFilename.substring(extIndex) : '';

    // Reconstruire le nom complet avec l'extension
    const newFilename = filenameWithoutExt + ext;

    try {
        const response = await fetch('/api/videos/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalPath,
                categoryId,
                subcategoryId: subcategoryId || null,
                displayName: displayName || null,
                newFilename
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Vidéo mise à jour', 'success');
            closeEditModal();
            // Recharger la configuration pour avoir les données à jour
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + (data.error || 'Impossible de modifier la vidéo'), 'error');
        }
    } catch (error) {
        console.error('Error editing video:', error);
        showNotification('Erreur lors de la modification', 'error');
    }
}

/**
 * Time Categories Management
 */
const defaultTimeCategories = [
    {
        id: 'before',
        name: 'Avant-match',
        icon: '🏁',
        color: 'from-blue-500 to-blue-600',
        description: 'Échauffement & présentation',
        categoryIds: []
    },
    {
        id: 'during',
        name: 'Match',
        icon: '▶️',
        color: 'from-green-500 to-green-600',
        description: 'Live & animations',
        categoryIds: []
    },
    {
        id: 'after',
        name: 'Après-match',
        icon: '🏆',
        color: 'from-purple-500 to-purple-600',
        description: 'Résultats & remerciements',
        categoryIds: []
    }
];

async function loadTimeCategories() {
    try {
        const response = await fetch('/api/configuration/time-categories');
        if (!response.ok) {
            console.error('Erreur lors du chargement des timeCategories');
            return;
        }

        const data = await response.json();
        availableCategories = data.categories || [];
        cachedTimeCategories = data.timeCategories && data.timeCategories.length > 0
            ? data.timeCategories
            : [...defaultTimeCategories];

        renderTimeCategories();
    } catch (error) {
        console.error('Erreur lors du chargement des timeCategories:', error);
    }
}

function refreshTimeCategories() {
    loadTimeCategories();
}

function renderTimeCategories() {
    const container = document.getElementById('time-categories-list');
    if (!container) return;

    container.innerHTML = '';

    cachedTimeCategories.forEach((tc, index) => {
        const item = document.createElement('div');
        item.className = 'time-category-item';
        item.dataset.index = index;

        const assignedCategories = tc.categoryIds || [];
        const assignedNames = assignedCategories
            .map(id => {
                const cat = availableCategories.find(c => c.id === id);
                return cat ? cat.name : id;
            })
            .join(', ') || 'Aucune catégorie assignée';

        item.innerHTML = `
            <div class="time-category-header">
                <div class="time-category-info">
                    <span class="time-category-icon">${tc.icon || '📁'}</span>
                    <div>
                        <strong>${tc.name}</strong>
                        <div class="time-category-desc">${tc.description || ''}</div>
                    </div>
                </div>
                <div class="time-category-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editTimeCategory(${index})">✏️ Modifier</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTimeCategory(${index})">🗑️</button>
                </div>
            </div>
            <div class="time-category-categories">
                <span class="label">Catégories:</span> ${assignedNames}
            </div>
        `;

        container.appendChild(item);
    });

    if (cachedTimeCategories.length === 0) {
        container.innerHTML = '<p class="info-text">Aucun bloc temps configuré. Cliquez sur "Ajouter un bloc temps" pour commencer.</p>';
    }
}

function addTimeCategory() {
    const newTc = {
        id: 'new-' + Date.now(),
        name: 'Nouveau bloc',
        icon: '📁',
        color: 'from-gray-500 to-gray-600',
        description: '',
        categoryIds: []
    };

    cachedTimeCategories.push(newTc);
    renderTimeCategories();
    editTimeCategory(cachedTimeCategories.length - 1);
}

function editTimeCategory(index) {
    const tc = cachedTimeCategories[index];
    if (!tc) return;

    // Créer un modal d'édition inline
    const container = document.getElementById('time-categories-list');
    const item = container.querySelector(`[data-index="${index}"]`);
    if (!item) return;

    // Générer les checkboxes pour les catégories
    const categoryCheckboxes = availableCategories.map(cat => {
        const checked = (tc.categoryIds || []).includes(cat.id) ? 'checked' : '';
        return `
            <label class="checkbox-label">
                <input type="checkbox" value="${cat.id}" ${checked}>
                ${cat.name}
            </label>
        `;
    }).join('');

    item.innerHTML = `
        <div class="time-category-edit-form">
            <div class="form-row">
                <div class="form-group">
                    <label>Nom</label>
                    <input type="text" id="tc-edit-name-${index}" value="${tc.name}" placeholder="Ex: Avant-match">
                </div>
                <div class="form-group form-group-small">
                    <label>Icône</label>
                    <input type="text" id="tc-edit-icon-${index}" value="${tc.icon || ''}" placeholder="🏁">
                </div>
            </div>
            <div class="form-group">
                <label>Description</label>
                <input type="text" id="tc-edit-desc-${index}" value="${tc.description || ''}" placeholder="Ex: Échauffement & présentation">
            </div>
            <div class="form-group">
                <label>Catégories associées</label>
                <div class="checkbox-grid" id="tc-edit-cats-${index}">
                    ${categoryCheckboxes || '<p class="info-text">Aucune catégorie disponible. Ajoutez d\'abord des catégories de vidéos.</p>'}
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="cancelEditTimeCategory(${index})">Annuler</button>
                <button class="btn btn-primary" onclick="saveTimeCategory(${index})">💾 Enregistrer</button>
            </div>
        </div>
    `;
}

function cancelEditTimeCategory(index) {
    renderTimeCategories();
}

async function saveTimeCategory(index) {
    const tc = cachedTimeCategories[index];
    if (!tc) return;

    const name = document.getElementById(`tc-edit-name-${index}`).value.trim();
    const icon = document.getElementById(`tc-edit-icon-${index}`).value.trim();
    const desc = document.getElementById(`tc-edit-desc-${index}`).value.trim();

    if (!name) {
        showNotification('Le nom est requis', 'error');
        return;
    }

    // Récupérer les catégories cochées
    const checkboxContainer = document.getElementById(`tc-edit-cats-${index}`);
    const checkedBoxes = checkboxContainer.querySelectorAll('input[type="checkbox"]:checked');
    const categoryIds = Array.from(checkedBoxes).map(cb => cb.value);

    // Mettre à jour l'objet
    tc.name = name;
    tc.icon = icon || '📁';
    tc.description = desc;
    tc.categoryIds = categoryIds;

    // Si c'est un nouveau, générer un ID propre
    if (tc.id.startsWith('new-')) {
        tc.id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }

    // Sauvegarder sur le serveur
    await saveAllTimeCategories();
}

async function deleteTimeCategory(index) {
    if (!confirm('Supprimer ce bloc temps ?')) {
        return;
    }

    cachedTimeCategories.splice(index, 1);
    await saveAllTimeCategories();
}

async function saveAllTimeCategories() {
    try {
        const response = await fetch('/api/configuration/time-categories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeCategories: cachedTimeCategories })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Organisation par temps sauvegardée', 'success');
            renderTimeCategories();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        showNotification('Erreur lors de la sauvegarde', 'error');
    }
}

/**
 * Categories Manager
 */
let cachedCategoriesForManager = [];

async function loadCategoriesForManager() {
    try {
        const response = await fetch('/api/configuration/categories');
        if (!response.ok) {
            console.error('Erreur lors du chargement des catégories');
            return;
        }
        const data = await response.json();
        cachedCategoriesForManager = data.categories || [];
        renderCategoriesManager();
    } catch (error) {
        console.error('Erreur:', error);
    }
}

function refreshCategories() {
    loadCategoriesForManager();
}

function renderCategoriesManager() {
    const container = document.getElementById('categories-manager');
    if (!container) return;

    container.innerHTML = '';

    // Message d'info sur le contenu verrouillé si présent
    const hasLockedCategories = cachedCategoriesForManager.some(cat => isLocked(cat));
    if (hasLockedCategories) {
        const infoMsg = document.createElement('div');
        infoMsg.className = 'locked-info-message';
        infoMsg.innerHTML = `
            <span class="info-icon">🔒</span>
            <span>Les catégories avec un cadenas sont gérées par NEOPRO et ne peuvent pas être modifiées ou supprimées.</span>
        `;
        container.appendChild(infoMsg);
    }

    if (cachedCategoriesForManager.length === 0) {
        container.innerHTML = '<div class="no-categories">Aucune catégorie. Cliquez sur "Nouvelle catégorie" pour commencer.</div>';
        return;
    }

    cachedCategoriesForManager.forEach((cat, index) => {
        const categoryLocked = isLocked(cat);
        const item = document.createElement('div');
        item.className = `category-item${categoryLocked ? ' locked-category' : ''}`;
        item.dataset.index = index;

        const subCategories = cat.subCategories || [];
        const videoCount = (cat.videos?.length || 0) + subCategories.reduce((sum, sub) => sum + (sub.videos?.length || 0), 0);

        const subCategoriesHtml = subCategories.map((sub, subIndex) => {
            const subLocked = categoryLocked || isLocked(sub);
            return `
                <span class="subcategory-tag${subLocked ? ' locked-subcategory' : ''}">
                    ${subLocked ? '🔒 ' : ''}${sub.name}
                    <span class="video-count">(${sub.videos?.length || 0})</span>
                    ${!subLocked ? `<button class="delete-sub" onclick="deleteSubCategory('${cat.id}', ${subIndex})" title="Supprimer">×</button>` : ''}
                </span>
            `;
        }).join('');

        const lockBadge = categoryLocked ? `<span class="lock-badge"><span class="lock-icon">🔒</span> NEOPRO</span>` : '';
        const ownerBadge = getOwnerBadgeHtml(cat);

        item.innerHTML = `
            <div class="category-header">
                <div class="category-info">
                    <strong>${cat.name}</strong>${lockBadge}
                    <span class="category-id">${cat.id}</span>
                    ${ownerBadge}
                    <span class="video-count">${videoCount} vidéo${videoCount > 1 ? 's' : ''}</span>
                </div>
                <div class="category-actions">
                    <button class="btn btn-secondary btn-sm${categoryLocked ? ' locked-btn' : ''}" onclick="${categoryLocked ? '' : `editCategory(${index})`}" ${categoryLocked ? 'disabled title="Catégorie NEOPRO - Non modifiable"' : ''}>✏️ Modifier</button>
                    <button class="btn btn-danger btn-sm${categoryLocked ? ' locked-btn' : ''}" onclick="${categoryLocked ? '' : `deleteCategory('${cat.id}')`}" ${categoryLocked ? 'disabled title="Catégorie NEOPRO - Non supprimable"' : ''}>🗑️</button>
                </div>
            </div>
            <div class="subcategories-section">
                <div class="subcategories-header">
                    <span>Sous-catégories</span>
                </div>
                <div class="subcategories-list">
                    ${subCategoriesHtml}
                    ${!categoryLocked ? `<button class="add-subcategory-btn" onclick="addSubCategory('${cat.id}')">+ Ajouter</button>` : ''}
                </div>
            </div>
        `;

        container.appendChild(item);
    });
}

function addCategory() {
    const name = prompt('Nom de la nouvelle catégorie:');
    if (!name || !name.trim()) return;

    const id = name.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûç]/g, '-').replace(/-+/g, '-');

    saveCategoryToServer({
        id,
        name: name.trim(),
        videos: [],
        subCategories: []
    });
}

function editCategory(index) {
    const cat = cachedCategoriesForManager[index];
    if (!cat) return;

    const container = document.getElementById('categories-manager');
    const item = container.querySelector(`[data-index="${index}"]`);
    if (!item) return;

    item.innerHTML = `
        <div class="category-edit-form">
            <div class="form-row">
                <div class="form-group">
                    <label>Nom</label>
                    <input type="text" id="cat-edit-name-${index}" value="${cat.name}" placeholder="Nom de la catégorie">
                </div>
                <div class="form-group">
                    <label>ID (identifiant unique)</label>
                    <input type="text" id="cat-edit-id-${index}" value="${cat.id}" placeholder="identifiant-unique" readonly style="background: var(--bg-tertiary);">
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="renderCategoriesManager()">Annuler</button>
                <button class="btn btn-primary" onclick="saveCategoryEdit(${index})">💾 Enregistrer</button>
            </div>
        </div>
    `;
}

async function saveCategoryEdit(index) {
    const cat = cachedCategoriesForManager[index];
    if (!cat) return;

    const name = document.getElementById(`cat-edit-name-${index}`).value.trim();
    if (!name) {
        showNotification('Le nom est requis', 'error');
        return;
    }

    cat.name = name;

    try {
        const response = await fetch(`/api/configuration/categories/${cat.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cat)
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Catégorie mise à jour', 'success');
            loadCategoriesForManager();
            loadTimeCategories(); // Rafraîchir aussi les timeCategories
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la sauvegarde', 'error');
    }
}

async function saveCategoryToServer(category) {
    try {
        const response = await fetch('/api/configuration/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(category)
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Catégorie créée', 'success');
            loadCategoriesForManager();
            loadTimeCategories();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la création', 'error');
    }
}

async function deleteCategory(categoryId) {
    const cat = cachedCategoriesForManager.find(c => c.id === categoryId);
    if (!cat) return;

    const videoCount = (cat.videos?.length || 0) + (cat.subCategories || []).reduce((sum, sub) => sum + (sub.videos?.length || 0), 0);

    let message = `Supprimer la catégorie "${cat.name}" ?`;
    if (videoCount > 0) {
        message += `\n\n⚠️ Cette catégorie contient ${videoCount} vidéo(s) qui seront dissociées.`;
    }

    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/configuration/categories/${categoryId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Catégorie supprimée', 'success');
            loadCategoriesForManager();
            loadTimeCategories();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

function addSubCategory(categoryId) {
    const name = prompt('Nom de la sous-catégorie:');
    if (!name || !name.trim()) return;

    const id = name.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûç]/g, '-').replace(/-+/g, '-');

    saveSubCategoryToServer(categoryId, {
        id,
        name: name.trim(),
        videos: []
    });
}

async function saveSubCategoryToServer(categoryId, subCategory) {
    try {
        const response = await fetch(`/api/configuration/categories/${categoryId}/subcategories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subCategory)
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Sous-catégorie créée', 'success');
            loadCategoriesForManager();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la création', 'error');
    }
}

async function deleteSubCategory(categoryId, subIndex) {
    const cat = cachedCategoriesForManager.find(c => c.id === categoryId);
    if (!cat || !cat.subCategories || !cat.subCategories[subIndex]) return;

    const sub = cat.subCategories[subIndex];
    const videoCount = sub.videos?.length || 0;

    let message = `Supprimer la sous-catégorie "${sub.name}" ?`;
    if (videoCount > 0) {
        message += `\n\n⚠️ Cette sous-catégorie contient ${videoCount} vidéo(s) qui seront dissociées.`;
    }

    if (!confirm(message)) return;

    try {
        const response = await fetch(`/api/configuration/categories/${categoryId}/subcategories/${sub.id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Sous-catégorie supprimée', 'success');
            loadCategoriesForManager();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}

/**
 * Drag & Drop pour réorganiser les vidéos
 */
let draggedElement = null;
let draggedVideoPath = null;
let draggedCategoryId = null;
let draggedSubcategoryId = null;

function handleDragStart(e) {
    draggedElement = e.target.closest('.video-row');
    if (!draggedElement) return;

    draggedVideoPath = draggedElement.dataset.videoPath;
    draggedCategoryId = draggedElement.dataset.categoryId;
    draggedSubcategoryId = draggedElement.dataset.subcategoryId;

    draggedElement.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedVideoPath);
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    draggedElement = null;
    draggedVideoPath = null;
    draggedCategoryId = null;
    draggedSubcategoryId = null;

    // Remove all drag-over states
    document.querySelectorAll('.video-rows.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    document.querySelectorAll('.video-row.drag-over-above, .video-row.drag-over-below').forEach(el => {
        el.classList.remove('drag-over-above', 'drag-over-below');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const container = e.target.closest('.video-rows');
    if (!container) return;

    container.classList.add('drag-over');

    // Find the closest row and determine position
    const rows = [...container.querySelectorAll('.video-row:not(.dragging)')];
    const mouseY = e.clientY;

    // Remove previous indicators
    rows.forEach(row => row.classList.remove('drag-over-above', 'drag-over-below'));

    // Find closest row
    let closestRow = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    rows.forEach(row => {
        const box = row.getBoundingClientRect();
        const offset = mouseY - box.top - box.height / 2;

        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closestRow = row;
        }
    });

    if (closestRow) {
        closestRow.classList.add('drag-over-above');
    } else if (rows.length > 0) {
        rows[rows.length - 1].classList.add('drag-over-below');
    }
}

function handleDragLeave(e) {
    const container = e.target.closest('.video-rows');
    if (!container) return;

    // Only remove drag-over if we're actually leaving the container
    const relatedTarget = e.relatedTarget;
    if (!container.contains(relatedTarget)) {
        container.classList.remove('drag-over');
        container.querySelectorAll('.video-row').forEach(row => {
            row.classList.remove('drag-over-above', 'drag-over-below');
        });
    }
}

async function handleDrop(e) {
    e.preventDefault();

    const container = e.target.closest('.video-rows');
    if (!container || !draggedElement) return;

    container.classList.remove('drag-over');

    const targetCategoryId = container.dataset.categoryId;
    const targetSubcategoryId = container.dataset.subcategoryId || null;

    // Find drop position
    const rows = [...container.querySelectorAll('.video-row:not(.dragging)')];
    const mouseY = e.clientY;

    let insertBeforeIndex = rows.length; // Default: append at end

    for (let i = 0; i < rows.length; i++) {
        const box = rows[i].getBoundingClientRect();
        if (mouseY < box.top + box.height / 2) {
            insertBeforeIndex = i;
            break;
        }
    }

    // Remove visual indicators
    rows.forEach(row => row.classList.remove('drag-over-above', 'drag-over-below'));

    // Check if moving within same category/subcategory or to different one
    const sameCategoryAndSubcategory =
        draggedCategoryId === targetCategoryId &&
        draggedSubcategoryId === targetSubcategoryId;

    if (sameCategoryAndSubcategory) {
        // Reorder within the same list
        await reorderVideoInList(draggedVideoPath, targetCategoryId, targetSubcategoryId, insertBeforeIndex);
    } else {
        // Move to different category/subcategory
        await moveVideoToCategory(draggedVideoPath, draggedCategoryId, draggedSubcategoryId, targetCategoryId, targetSubcategoryId, insertBeforeIndex);
    }
}

async function reorderVideoInList(videoPath, categoryId, subcategoryId, newIndex) {
    try {
        const response = await fetch('/api/videos/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath,
                categoryId,
                subcategoryId: subcategoryId || null,
                newIndex
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Ordre des vidéos mis à jour', 'success');
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error reordering video:', error);
        showNotification('Erreur lors de la réorganisation', 'error');
    }
}

async function moveVideoToCategory(videoPath, fromCategoryId, fromSubcategoryId, toCategoryId, toSubcategoryId, newIndex) {
    try {
        const response = await fetch('/api/videos/move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoPath,
                fromCategoryId,
                fromSubcategoryId: fromSubcategoryId || null,
                toCategoryId,
                toSubcategoryId: toSubcategoryId || null,
                newIndex
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Vidéo déplacée', 'success');
            await loadConfiguration();
            loadVideos();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error moving video:', error);
        showNotification('Erreur lors du déplacement', 'error');
    }
}

/**
 * Bulk Selection / Actions
 */
function handleVideoSelection(e, videoPath) {
    if (e.target.checked) {
        selectedVideos.add(videoPath);
    } else {
        selectedVideos.delete(videoPath);
    }
    updateBulkActionsToolbar();
}

function updateBulkActionsToolbar() {
    let toolbar = document.getElementById('bulk-actions-toolbar');

    if (selectedVideos.size === 0) {
        if (toolbar) {
            toolbar.classList.remove('visible');
        }
        return;
    }

    if (!toolbar) {
        toolbar = createBulkActionsToolbar();
        document.getElementById('subtab-library').appendChild(toolbar);
    }

    toolbar.querySelector('.bulk-count').textContent = `${selectedVideos.size} vidéo${selectedVideos.size > 1 ? 's' : ''} sélectionnée${selectedVideos.size > 1 ? 's' : ''}`;
    toolbar.classList.add('visible');
}

function createBulkActionsToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'bulk-actions-toolbar';
    toolbar.className = 'bulk-actions-toolbar';

    toolbar.innerHTML = `
        <div class="bulk-toolbar-content">
            <span class="bulk-count">0 vidéos sélectionnées</span>
            <div class="bulk-actions-buttons">
                <button class="btn btn-secondary btn-sm" onclick="selectAllVideos()">☑ Tout</button>
                <button class="btn btn-secondary btn-sm" onclick="clearVideoSelection()">☐ Aucun</button>
                <button class="btn btn-primary btn-sm" onclick="openBulkMoveModal()">📁 Déplacer</button>
                <button class="btn btn-danger btn-sm" onclick="bulkDeleteVideos()">🗑️ Supprimer</button>
            </div>
        </div>
    `;

    return toolbar;
}

function selectAllVideos() {
    const checkboxes = document.querySelectorAll('.video-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = true;
        selectedVideos.add(cb.dataset.path);
    });
    updateBulkActionsToolbar();
}

function clearVideoSelection() {
    selectedVideos.clear();
    const checkboxes = document.querySelectorAll('.video-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    updateBulkActionsToolbar();
}

async function bulkDeleteVideos() {
    if (selectedVideos.size === 0) {
        showNotification('Aucune vidéo sélectionnée', 'info');
        return;
    }

    const count = selectedVideos.size;
    if (!confirm(`Supprimer ${count} vidéo${count > 1 ? 's' : ''} ?\n\nCette action est irréversible.`)) {
        return;
    }

    const pathsToDelete = [...selectedVideos];
    let successCount = 0;
    let errorCount = 0;

    for (const videoPath of pathsToDelete) {
        // Find video info from cache
        const video = cachedVideos.find(v => v.path === videoPath);
        if (!video) {
            errorCount++;
            continue;
        }

        try {
            const response = await fetch('/api/videos/delete-from-config', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoPath,
                    categoryId: video.configCategory,
                    subcategoryId: video.configSubcategory || null
                })
            });

            const data = await response.json();
            if (data.success) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
        }
    }

    // Clear selection and refresh
    selectedVideos.clear();
    await loadConfiguration();
    loadVideos();
    updateBulkActionsToolbar();

    if (errorCount === 0) {
        showNotification(`${successCount} vidéo${successCount > 1 ? 's' : ''} supprimée${successCount > 1 ? 's' : ''}`, 'success');
    } else {
        showNotification(`${successCount} supprimée(s), ${errorCount} erreur(s)`, 'error');
    }
}

/**
 * Bulk Move Modal
 */
function openBulkMoveModal() {
    if (selectedVideos.size === 0) {
        showNotification('Aucune vidéo sélectionnée', 'info');
        return;
    }

    // Create modal if not exists
    let modal = document.getElementById('bulk-move-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulk-move-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    // Build category options
    const categories = cachedConfig?.categories || [];
    let categoryOptions = categories.map(cat =>
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <h3>📁 Déplacer ${selectedVideos.size} vidéo${selectedVideos.size > 1 ? 's' : ''}</h3>
            <div class="form-group">
                <label>Catégorie de destination</label>
                <select id="bulk-move-category" onchange="updateBulkMoveSubcategories()">
                    <option value="">-- Sélectionner --</option>
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Sous-catégorie (optionnel)</label>
                <select id="bulk-move-subcategory">
                    <option value="">-- Racine de la catégorie --</option>
                </select>
            </div>
            <div class="modal-buttons">
                <button class="btn btn-secondary" onclick="closeBulkMoveModal()">Annuler</button>
                <button class="btn btn-primary" onclick="executeBulkMove()">Déplacer</button>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

function updateBulkMoveSubcategories() {
    const categoryId = document.getElementById('bulk-move-category').value;
    const subcategorySelect = document.getElementById('bulk-move-subcategory');

    subcategorySelect.innerHTML = '<option value="">-- Racine de la catégorie --</option>';

    if (!categoryId) return;

    const category = (cachedConfig?.categories || []).find(c => c.id === categoryId);
    if (category && category.subCategories) {
        category.subCategories.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.id;
            option.textContent = sub.name;
            subcategorySelect.appendChild(option);
        });
    }
}

function closeBulkMoveModal() {
    const modal = document.getElementById('bulk-move-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function executeBulkMove() {
    const categoryId = document.getElementById('bulk-move-category').value;
    const subcategoryId = document.getElementById('bulk-move-subcategory').value || null;

    if (!categoryId) {
        showNotification('Sélectionnez une catégorie', 'error');
        return;
    }

    const pathsToMove = [...selectedVideos];
    let successCount = 0;
    let errorCount = 0;

    closeBulkMoveModal();
    showNotification('Déplacement en cours...', 'info');

    for (const videoPath of pathsToMove) {
        const video = cachedVideos.find(v => v.path === videoPath);
        if (!video) {
            errorCount++;
            continue;
        }

        // Skip if already in target location
        if (video.configCategory === categoryId &&
            (video.configSubcategory || null) === subcategoryId) {
            successCount++;
            continue;
        }

        try {
            const response = await fetch('/api/videos/move', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoPath,
                    fromCategoryId: video.configCategory,
                    fromSubcategoryId: video.configSubcategory || null,
                    toCategoryId: categoryId,
                    toSubcategoryId: subcategoryId
                })
            });

            const data = await response.json();
            if (data.success) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
        }
    }

    // Clear selection and refresh
    selectedVideos.clear();
    await loadConfiguration();
    loadVideos();
    updateBulkActionsToolbar();

    if (errorCount === 0) {
        showNotification(`${successCount} vidéo${successCount > 1 ? 's' : ''} déplacée${successCount > 1 ? 's' : ''}`, 'success');
    } else {
        showNotification(`${successCount} déplacée(s), ${errorCount} erreur(s)`, 'error');
    }
}
