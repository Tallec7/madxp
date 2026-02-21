/** 
 * Neopro Admin Panel - JavaScript
 * FICHIER GENERE - Ne pas editer directement
 * Editer les fichiers dans modules/ puis lancer: bash build-admin.sh
 * Build: 912996ae
 */


// ============================================================================
// MODULE: modules/demo/index.js
// ============================================================================

// ============================================================================
// MODE DEMO - Données mockées pour fonctionnement sans backend
// ============================================================================
// Detect if we're running on a real Pi or in demo mode
// Real Pi: neopro.local, 192.168.4.1 (hotspot), localhost, or any private IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const isPrivateIP = (hostname) => {
    // Check for private IP ranges
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
};

const DEMO_MODE = !window.location.hostname.includes('neopro.local') &&
                  !window.location.hostname.includes('localhost') &&
                  !isPrivateIP(window.location.hostname);

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
        if (url.includes('/api/sync-status')) {
            return new Response(JSON.stringify({
                connected: true,
                lastSyncAt: new Date(Date.now() - 300000).toISOString(),
                pendingCommands: 0,
                deadLetters: 0,
                recentHistory: [
                    { type: 'central_to_local', timestamp: new Date(Date.now() - 300000).toISOString(), success: true, error: null },
                    { type: 'connection', timestamp: new Date(Date.now() - 600000).toISOString(), success: true, error: null },
                    { type: 'local_to_central', timestamp: new Date(Date.now() - 900000).toISOString(), success: true, error: null },
                ],
                error: null,
                lastErrorAt: null,
            }), { status: 200 });
        }

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

        if (url.includes('/api/thumbnails/regenerate')) {
            return new Response(JSON.stringify({ success: true, message: 'Régénération simulée (mode démo)' }), { status: 200 });
        }

        // Fallback: appel original
        return originalFetch(url, options);
    };

    console.log('🎭 NEOPRO ADMIN - MODE DEMO ACTIVÉ');
}

// ============================================================================
// MODULE: modules/core/state.js
// ============================================================================

// ============================================================================
// AUTHENTIFICATION - Ajout automatique des credentials pour les appels API
// ============================================================================
// Les appels fetch vers /api/* doivent inclure les cookies d'authentification
{
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        // Pour les appels API, toujours inclure les credentials (cookies)
        // Vérifie à la fois les URLs relatives (/api/) et absolues (http://.../api/)
        if (typeof url === 'string' && (url.startsWith('/api/') || url.includes('/api/'))) {
            options = { ...options, credentials: 'include' };
        }
        const response = await originalFetch(url, options);

        // Si une requête API retourne 401, rediriger vers la page de login
        if (response.status === 401 && typeof url === 'string' && (url.startsWith('/api/') || url.includes('/api/'))) {
            // Éviter les redirections multiples
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }

        return response;
    };
}

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

// ============================================================================
// MODULE: modules/core/mode-switcher.js
// ============================================================================

// ============================================================================
// Mode Switcher - Club / Technicien
// ============================================================================

const MODE_STORAGE_KEY = 'neopro-admin-mode';
const MODE_CLUB = 'club';
const MODE_TECH = 'tech';

/**
 * Retourne le mode courant depuis localStorage (default: 'club')
 * @returns {'club'|'tech'}
 */
function getCurrentMode() {
    try {
        return localStorage.getItem(MODE_STORAGE_KEY) || MODE_CLUB;
    } catch {
        return MODE_CLUB;
    }
}

/**
 * Initialise le mode au chargement de la page :
 * - Lit localStorage
 * - Applique la classe CSS sur <body>
 * - Met à jour le toggle UI
 */
function initMode() {
    const mode = getCurrentMode();
    applyMode(mode);
}

/**
 * Bascule entre mode club et mode technicien
 */
function toggleMode() {
    const current = getCurrentMode();
    const next = current === MODE_CLUB ? MODE_TECH : MODE_CLUB;

    try {
        localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
        // localStorage indisponible (navigation privée, etc.)
    }

    applyMode(next);

    // Si l'utilisateur était sur un onglet tech-only en mode club, rediriger
    if (next === MODE_CLUB && (currentTab === 'logs' || currentTab === 'system')) {
        switchTab('dashboard');
    }

    // Re-render le dashboard pour basculer entre vue détaillée et simplifiée
    if (currentTab === 'dashboard') {
        loadDashboard();
    }
}

/**
 * Applique le mode : classe body, état du toggle, label
 * @param {'club'|'tech'} mode
 */
function applyMode(mode) {
    const body = document.body;
    body.classList.remove('mode-club', 'mode-tech');
    body.classList.add('mode-' + mode);

    // Mettre à jour le toggle switch
    const toggle = document.getElementById('mode-toggle');
    if (toggle) {
        toggle.checked = (mode === MODE_TECH);
    }

    const label = document.getElementById('mode-label');
    if (label) {
        label.textContent = mode === MODE_TECH ? 'Mode technicien' : 'Mode club';
    }
}

// ============================================================================
// MODULE: modules/core/connection.js
// ============================================================================

// ============================================================================
// Connection monitoring + fetch wrapper
// ============================================================================

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

// ============================================================================
// MODULE: modules/core/notifications.js
// ============================================================================

// ============================================================================
// Notifications, modals, system actions, utilitaires UI
// ============================================================================

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
 * Formater la taille en bytes en format lisible
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/**
 * Formater une durée en secondes en format mm:ss ou hh:mm:ss
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// MODULE: modules/dashboard/sync-status.js
// ============================================================================

// ============================================================================
// Sync Status Widget - Dashboard
// ============================================================================

/** Track last notified content sync to avoid duplicate notifications */
let _lastNotifiedContentSync = null;

/**
 * Charge et affiche le widget de statut de synchronisation
 * Appelé depuis loadDashboard() à chaque cycle de rafraîchissement
 */
async function loadSyncStatus() {
    const container = document.getElementById('sync-status-widget');
    if (!container) return;

    try {
        const response = await fetch('/api/sync-status');

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();
        renderSyncStatus(container, data);

        // F-AUD-14: Show one-time notification for recent content sync
        checkContentSyncNotification(data);
    } catch (error) {
        console.warn('[admin-ui] Sync status unavailable:', error.message);
        renderSyncStatusError(container);
    }
}

/**
 * Affiche le widget sync status
 */
function renderSyncStatus(container, data) {
    const connectionDot = data.connected ? 'sync-dot-connected' : 'sync-dot-disconnected';
    const connectionText = data.connected ? 'Connecté au cloud' : 'Déconnecté du cloud';
    const connectionClass = data.connected ? 'sync-connected' : 'sync-disconnected';

    // Temps relatif de la dernière sync
    const lastSyncText = data.lastSyncAt
        ? formatRelativeTime(data.lastSyncAt)
        : 'Jamais synchronisé';

    // Badge commandes en attente
    const pendingBadge = data.pendingCommands > 0
        ? '<span class="sync-badge sync-badge-warning">' + data.pendingCommands + ' en attente</span>'
        : '';

    // Badge erreurs
    const deadLetterBadge = data.deadLetters > 0
        ? '<span class="sync-badge sync-badge-danger">' + data.deadLetters + ' erreur' + (data.deadLetters > 1 ? 's' : '') + '</span>'
        : '';

    // Mode tech : historique expandable
    const mode = getCurrentMode();
    let historySection = '';
    if (mode === MODE_TECH && data.recentHistory && data.recentHistory.length > 0) {
        const historyRows = data.recentHistory.map(function (entry) {
            const icon = entry.success ? '✅' : '❌';
            const time = formatRelativeTime(entry.timestamp);
            const errorInfo = entry.error ? ' — ' + escapeHtml(entry.error) : '';
            return '<div class="sync-history-row">'
                + '<span>' + icon + '</span>'
                + '<span class="sync-history-type">' + escapeHtml(entry.type) + '</span>'
                + '<span class="sync-history-time">' + time + '</span>'
                + '<span class="sync-history-error">' + errorInfo + '</span>'
                + '</div>';
        }).join('');

        historySection = ''
            + '<details class="sync-history-details tech-only">'
            + '<summary>Historique récent</summary>'
            + '<div class="sync-history-list">' + historyRows + '</div>'
            + '</details>';
    }

    // F-AUD-14: Contenu NEOPRO synchronisé banner
    let contentSyncBanner = '';
    if (data.lastContentSyncAt) {
        const contentSyncAge = Math.floor((Date.now() - new Date(data.lastContentSyncAt).getTime()) / 1000);
        const contentSyncText = formatRelativeTime(data.lastContentSyncAt);
        const details = data.lastContentSyncDetails || {};
        const detailParts = [];
        if (details.sponsorsCount) detailParts.push(details.sponsorsCount + ' sponsors');
        if (details.categoriesCount) detailParts.push(details.categoriesCount + ' catégories');
        if (details.siteSponsorsCount) detailParts.push(details.siteSponsorsCount + ' annonceurs');
        const detailText = detailParts.length > 0 ? ' (' + detailParts.join(', ') + ')' : '';

        const isRecent = contentSyncAge < 600; // < 10 minutes
        const bannerClass = isRecent ? 'content-sync-recent' : 'content-sync-old';

        contentSyncBanner = ''
            + '<div class="content-sync-banner ' + bannerClass + '">'
            + '  <span class="content-sync-icon">' + (isRecent ? '📡' : '📋') + '</span>'
            + '  <span>Contenu NEOPRO : ' + contentSyncText + detailText + '</span>'
            + '</div>';
    }

    container.innerHTML = ''
        + '<div class="sync-status-banner ' + connectionClass + '">'
        + '  <div class="sync-status-main">'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-dot ' + connectionDot + '"></span>'
        + '      <span class="sync-status-text">' + connectionText + '</span>'
        + '    </div>'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-status-label">Dernière sync :</span>'
        + '      <span class="sync-status-value">' + lastSyncText + '</span>'
        + '    </div>'
        + '    ' + pendingBadge
        + '    ' + deadLetterBadge
        + '  </div>'
        + '  ' + contentSyncBanner
        + '  ' + historySection
        + '</div>';
}

/**
 * F-AUD-14: Show a one-time toast notification when new NEOPRO content is synced.
 * Only fires once per unique content sync timestamp to avoid spamming.
 */
function checkContentSyncNotification(data) {
    if (!data.lastContentSyncAt) return;

    const syncTs = data.lastContentSyncAt;
    const syncAge = Date.now() - new Date(syncTs).getTime();

    // Only notify for syncs within the last 5 minutes
    if (syncAge > 5 * 60 * 1000) return;

    // Only notify once per sync event
    if (_lastNotifiedContentSync === syncTs) return;
    _lastNotifiedContentSync = syncTs;

    const details = data.lastContentSyncDetails || {};
    const parts = [];
    if (details.siteSponsorsCount) parts.push(details.siteSponsorsCount + ' annonceur(s)');
    if (details.categoriesCount) parts.push(details.categoriesCount + ' catégorie(s)');
    const suffix = parts.length > 0 ? ' — ' + parts.join(', ') : '';

    if (typeof showNotification === 'function') {
        showNotification('📡 Contenu NEOPRO mis à jour' + suffix, 'success');
    }
}

/**
 * Affiche l'état d'erreur / indisponible
 */
function renderSyncStatusError(container) {
    container.innerHTML = ''
        + '<div class="sync-status-banner sync-unavailable">'
        + '  <div class="sync-status-main">'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-dot sync-dot-unknown"></span>'
        + '      <span class="sync-status-text">Statut sync indisponible</span>'
        + '    </div>'
        + '  </div>'
        + '</div>';
}

/**
 * Formate un timestamp ISO en temps relatif en français
 */
function formatRelativeTime(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now - date) / 1000);

        if (diffSeconds < 0) return "à l'instant";
        if (diffSeconds < 60) return 'il y a ' + diffSeconds + 's';
        if (diffSeconds < 3600) return 'il y a ' + Math.floor(diffSeconds / 60) + ' min';
        if (diffSeconds < 86400) return 'il y a ' + Math.floor(diffSeconds / 3600) + 'h';
        return 'il y a ' + Math.floor(diffSeconds / 86400) + ' jour(s)';
    } catch {
        return 'Inconnu';
    }
}

/**
 * Échappe le HTML pour éviter les injections XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// MODULE: modules/dashboard/index.js
// ============================================================================

// ============================================================================
// Dashboard systeme + grille services
// ============================================================================

async function loadDashboard() {
    // Charger le sync status (indépendant des métriques système)
    loadSyncStatus();

    try {
        const response = await fetch('/api/system');
        console.log('[admin-ui] GET /api/system -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/system payload', data);

        if (data.error) {
            console.error('Error loading system info:', data.error);
            return;
        }

        // Update hostname (les deux modes)
        document.getElementById('hostname').textContent = data.hostname || 'neopro';

        const mode = getCurrentMode();

        if (mode === MODE_CLUB) {
            renderClubDashboard(data);
        } else {
            renderTechDashboard(data);
        }

        // Update timestamp (les deux modes)
        document.getElementById('last-update').textContent =
            'Dernière mise à jour: ' + new Date().toLocaleTimeString('fr-FR');

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

/**
 * Dashboard simplifié pour le mode club :
 * Une seule carte "santé" avec indicateur vert/jaune/rouge
 */
function renderClubDashboard(data) {
    const cardsGrid = document.querySelector('#tab-dashboard .cards-grid');
    const healthCard = document.getElementById('health-status-card');

    if (cardsGrid) cardsGrid.style.display = 'none';
    if (healthCard) {
        healthCard.style.display = 'block';
        updateHealthStatus(data, healthCard);
    }
}

/**
 * Dashboard complet pour le mode technicien :
 * Toutes les cartes métriques détaillées
 */
function renderTechDashboard(data) {
    const cardsGrid = document.querySelector('#tab-dashboard .cards-grid');
    const healthCard = document.getElementById('health-status-card');

    if (cardsGrid) cardsGrid.style.display = '';
    if (healthCard) healthCard.style.display = 'none';

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
}

/**
 * Calcule et affiche l'état de santé global : vert / jaune / rouge
 */
function updateHealthStatus(data, card) {
    const cpu = parseFloat(data.cpu.usage);
    const mem = parseFloat(data.memory.percent);
    const temp = parseFloat(data.temperature);
    const disk = data.disk ? parseFloat(data.disk.percent) : 0;

    let status = 'green';
    let statusText = 'Système en bon état';
    let statusIcon = '✅';
    let details = [];

    // Seuils rouge (critique)
    if (cpu > 90) { status = 'red'; details.push('CPU très élevé'); }
    if (mem > 90) { status = 'red'; details.push('Mémoire critique'); }
    if (temp > 75) { status = 'red'; details.push('Température critique'); }
    if (disk > 95) { status = 'red'; details.push('Stockage quasi plein'); }

    // Seuils jaune (attention) — seulement si pas déjà rouge
    if (status !== 'red') {
        if (cpu > 70) { status = 'yellow'; details.push('CPU élevé'); }
        if (mem > 75) { status = 'yellow'; details.push('Mémoire élevée'); }
        if (temp > 60) { status = 'yellow'; details.push('Température élevée'); }
        if (disk > 80) { status = 'yellow'; details.push('Stockage limité'); }
    }

    if (status === 'red') {
        statusText = 'Problème détecté';
        statusIcon = '🔴';
    } else if (status === 'yellow') {
        statusText = 'Attention requise';
        statusIcon = '⚠️';
    }

    const detailsHtml = details.length > 0
        ? '<div class="health-details-list">' + details.join(' • ') + '</div>'
        : '';

    const bodyEl = card.querySelector('.health-body');
    if (bodyEl) {
        bodyEl.innerHTML = ''
            + '<div class="health-indicator health-' + status + '">'
            + '  <span class="health-icon">' + statusIcon + '</span>'
            + '  <div class="health-info">'
            + '    <span class="health-text">' + statusText + '</span>'
            + '    ' + detailsHtml
            + '  </div>'
            + '</div>'
            + '<div class="health-uptime">'
            + '  ⏱️ Uptime : <strong>' + (data.uptime || '--') + '</strong>'
            + '</div>';
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

// ============================================================================
// MODULE: modules/videos/loader.js
// ============================================================================

// ============================================================================
// Chargement + rendu videos config
// ============================================================================

/**
 * Cache-buster pour les miniatures (mis à jour après régénération)
 */
let thumbnailCacheBuster = Date.now();

/**
 * Générer l'URL de miniature à partir du chemin vidéo
 * Les miniatures sont générées par video-processor.js dans /thumbnails/
 */
function getThumbnailUrl(videoPath) {
    if (!videoPath) return null;
    // Le chemin vidéo est comme: videos/category/video.mp4
    // La miniature est dans: thumbnails/category/video.jpg
    const pathWithoutExt = videoPath.replace(/\.\w+$/, '');
    // Le chemin vidéo commence déjà par "videos/" donc on remplace
    const thumbnailPath = pathWithoutExt.replace(/^videos\//, 'thumbnails/') + '.jpg';
    // Ajouter cache-buster pour forcer le rechargement après régénération
    return '/' + thumbnailPath + '?t=' + thumbnailCacheBuster;
}

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

        // Générer l'URL de la miniature
        const thumbnailUrl = getThumbnailUrl(video.path);

        row.innerHTML = `
            <div class="video-row-checkbox">
                <input type="checkbox" class="video-select-checkbox" data-path="${video.path}" ${selectedVideos.has(video.path) ? 'checked' : ''}${videoLocked ? ' disabled' : ''}>
            </div>
            ${videoLocked ? '<div class="video-row-lock"><span class="video-lock-icon lock-tooltip" data-tooltip="Géré par NEOPRO">🔒</span></div>' : '<div class="video-row-drag-handle" title="Glisser pour réorganiser">⋮⋮</div>'}
            <div class="video-row-preview">
                <div class="video-thumbnail" data-video-url="${videoUrl}">
                    ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="Miniature" class="thumbnail-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
                    <span class="play-icon" ${thumbnailUrl ? 'style="display:none;"' : ''}>▶</span>
                </div>
            </div>
            <div class="video-row-info">
                <div class="video-row-title">${video.name || 'Sans nom'}</div>
                <div class="video-row-path">${video.path || ''}</div>
                ${video.duration ? `<div class="video-row-meta">${formatDuration(video.duration)}</div>` : ''}
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
 * Régénération des miniatures
 */
async function regenerateThumbnails(force = false) {
    const forceRegen = force || confirm('Régénérer uniquement les miniatures manquantes ?\n\nCliquez "Annuler" pour tout régénérer (plus long).');
    const actualForce = force ? true : !forceRegen;

    showNotification('Régénération des miniatures en cours... Veuillez patienter.', 'info');

    try {
        // Utiliser l'API synchrone pour attendre la fin de la génération
        const response = await fetch('/api/thumbnails/regenerate-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: actualForce })
        });

        const data = await response.json();
        if (data.success) {
            // Mettre à jour le cache-buster pour forcer le rechargement des images
            thumbnailCacheBuster = Date.now();

            // Rafraîchir l'affichage des vidéos
            await refreshVideos();

            const stats = data.stats || {};
            showNotification(`Miniatures régénérées : ${stats.generated || 0} nouvelles, ${stats.skipped || 0} existantes`, 'success');
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Erreur régénération miniatures:', error);
        showNotification('Erreur lors de la régénération', 'error');
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

// ============================================================================
// MODULE: modules/videos/orphans.js
// ============================================================================

// ============================================================================
// Gestion videos orphelines
// ============================================================================

// State for orphan video bulk selection
let selectedOrphanVideos = new Set();

function renderOrphanVideos(container, orphans, existingCategories) {
    selectedOrphanVideos.clear();

    const section = document.createElement('div');
    section.className = 'orphan-videos-section';

    const header = document.createElement('div');
    header.className = 'section-header orphan-header';
    header.innerHTML = `
        <div class="orphan-header-top">
            <h3>⚠️ Vidéos non référencées (${orphans.length})</h3>
            <label class="select-all-label">
                <input type="checkbox" id="orphan-select-all" onchange="toggleAllOrphanSelection(this.checked)">
                Tout sélectionner
            </label>
        </div>
        <p class="hint">Ces vidéos sont sur le disque mais pas dans la configuration</p>
    `;
    section.appendChild(header);

    // Barre d'action bulk (cachée par défaut)
    const bulkBar = document.createElement('div');
    bulkBar.id = 'orphan-bulk-bar';
    bulkBar.className = 'orphan-bulk-bar';
    bulkBar.style.display = 'none';
    bulkBar.innerHTML = `
        <span class="bulk-count"><strong id="orphan-selected-count">0</strong> vidéo(s) sélectionnée(s)</span>
        <select id="bulk-category-select" class="bulk-select">
            <option value="">-- Catégorie --</option>
            ${existingCategories.map(cat => `<option value="${cat.id}">${cat.name || cat.id}</option>`).join('')}
        </select>
        <select id="bulk-subcategory-select" class="bulk-select" style="display: none;">
            <option value="">-- Sous-catégorie --</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="addSelectedOrphansToConfig()">
            Ajouter la sélection
        </button>
        <button class="btn btn-secondary btn-sm" onclick="clearOrphanSelection()">
            Annuler
        </button>
    `;
    section.appendChild(bulkBar);

    // Event listener pour la catégorie bulk
    setTimeout(() => {
        const bulkCatSelect = document.getElementById('bulk-category-select');
        const bulkSubSelect = document.getElementById('bulk-subcategory-select');
        if (bulkCatSelect) {
            bulkCatSelect.addEventListener('change', (e) => {
                const catId = e.target.value;
                const category = existingCategories.find(c => c.id === catId);
                if (category && category.subCategories && category.subCategories.length > 0) {
                    bulkSubSelect.innerHTML = `
                        <option value="">-- Sans sous-cat. --</option>
                        ${category.subCategories.map(sub => `<option value="${sub.id}">${sub.name || sub.id}</option>`).join('')}
                    `;
                    bulkSubSelect.style.display = 'inline-block';
                } else {
                    bulkSubSelect.style.display = 'none';
                }
            });
        }
    }, 0);

    const list = document.createElement('div');
    list.className = 'orphan-list';

    orphans.forEach(video => {
        const row = document.createElement('div');
        row.className = 'orphan-row';
        row.dataset.path = video.path;

        row.innerHTML = `
            <label class="orphan-checkbox">
                <input type="checkbox" class="orphan-select-checkbox" data-path="${video.path}" onchange="updateOrphanSelection()">
            </label>
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

/**
 * Fonctions de sélection multiple des vidéos orphelines
 */
function toggleAllOrphanSelection(checked) {
    const checkboxes = document.querySelectorAll('.orphan-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checked;
    });
    updateOrphanSelection();
}

function updateOrphanSelection() {
    selectedOrphanVideos.clear();
    const checkboxes = document.querySelectorAll('.orphan-select-checkbox:checked');
    checkboxes.forEach(cb => {
        selectedOrphanVideos.add(cb.dataset.path);
    });

    // Mettre à jour le compteur et afficher/cacher la barre
    const bulkBar = document.getElementById('orphan-bulk-bar');
    const countEl = document.getElementById('orphan-selected-count');
    const selectAllCb = document.getElementById('orphan-select-all');
    const allCheckboxes = document.querySelectorAll('.orphan-select-checkbox');

    if (countEl) {
        countEl.textContent = selectedOrphanVideos.size;
    }

    if (bulkBar) {
        bulkBar.style.display = selectedOrphanVideos.size > 0 ? 'flex' : 'none';
    }

    // Mettre à jour l'état du "Tout sélectionner"
    if (selectAllCb && allCheckboxes.length > 0) {
        selectAllCb.checked = selectedOrphanVideos.size === allCheckboxes.length;
        selectAllCb.indeterminate = selectedOrphanVideos.size > 0 && selectedOrphanVideos.size < allCheckboxes.length;
    }
}

function clearOrphanSelection() {
    const checkboxes = document.querySelectorAll('.orphan-select-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    const selectAllCb = document.getElementById('orphan-select-all');
    if (selectAllCb) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
    }
    updateOrphanSelection();
}

async function addSelectedOrphansToConfig() {
    if (selectedOrphanVideos.size === 0) {
        showNotification('Aucune vidéo sélectionnée', 'error');
        return;
    }

    const categoryId = document.getElementById('bulk-category-select')?.value;
    const subcategoryId = document.getElementById('bulk-subcategory-select')?.value;

    if (!categoryId) {
        showNotification('Sélectionnez une catégorie', 'error');
        return;
    }

    // Préparer les vidéos à ajouter
    const videos = [];
    selectedOrphanVideos.forEach(path => {
        const orphan = cachedOrphanVideos.find(v => v.path === path);
        if (orphan) {
            videos.push({
                path: orphan.path,
                displayName: orphan.displayName || orphan.name
            });
        }
    });

    try {
        const response = await fetch('/api/videos/add-to-config-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videos,
                categoryId,
                subcategoryId: subcategoryId || null
            })
        });

        const data = await response.json();
        if (data.success) {
            const msg = `${data.results.added.length} vidéo(s) ajoutée(s)`;
            if (data.results.skipped.length > 0) {
                showNotification(`${msg} (${data.results.skipped.length} déjà présente(s))`, 'success');
            } else {
                showNotification(msg, 'success');
            }
            loadVideos(); // Recharger
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de l\'ajout groupé', 'error');
    }
}

// ============================================================================
// MODULE: modules/videos/editor.js
// ============================================================================

// ============================================================================
// Modal edition video
// ============================================================================

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

// ============================================================================
// MODULE: modules/videos/bulk.js
// ============================================================================

// ============================================================================
// Selection/actions groupees
// ============================================================================

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

// ============================================================================
// MODULE: modules/videos/drag-drop.js
// ============================================================================

// ============================================================================
// Drag & drop reordonnancement
// ============================================================================

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

// ============================================================================
// MODULE: modules/sponsors/index.js
// ============================================================================

// ============================================================================
// MODULE: Sponsors — Gestion des sponsors locaux
// ============================================================================

// ============================================================================
// SPONSOR STATS — Statistiques locales des passages sponsors
// ============================================================================

/**
 * Charge et affiche les statistiques sponsors depuis les buffers locaux.
 */
async function loadSponsorStats() {
    const container = document.getElementById('sponsor-stats-container');
    if (!container) return;

    try {
        const response = await fetch('/api/sponsors/stats?days=30');
        if (!response.ok) throw new Error('Erreur HTTP ' + response.status);

        const data = await response.json();
        renderSponsorStats(container, data);
    } catch (error) {
        console.error('[sponsors] Erreur stats:', error);
        container.innerHTML = '';
    }
}

/**
 * Affiche les stats : KPI cards + tableau par sponsor + mini chart.
 */
function renderSponsorStats(container, data) {
    const { summary, sponsors, daily } = data;

    if (summary.total_impressions === 0) {
        container.innerHTML = `
            <div class="card" style="padding: 20px; text-align: center; color: var(--neo-text-secondary); margin-bottom: 16px;">
                <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
                <p style="margin: 0; font-size: 14px;">
                    Aucune impression sponsor enregistrée pour le moment.<br>
                    Les stats apparaîtront ici dès que des vidéos sponsors seront diffusées.
                </p>
            </div>
        `;
        return;
    }

    let html = '';

    // KPI Cards
    html += '<div class="sponsor-stats-kpis">';
    html += renderKpiCard('📺', summary.total_impressions, 'Passages');
    html += renderKpiCard('⏱️', formatScreenTime(summary.total_screen_time_seconds), 'Temps écran');
    html += renderKpiCard('✅', summary.avg_completion_rate + '%', 'Complétion');
    html += renderKpiCard('📅', summary.active_days, 'Jours actifs');
    html += '</div>';

    // Mini chart (barres quotidiennes)
    if (daily && daily.length > 0) {
        html += renderDailyBars(daily);
    }

    // Tableau par sponsor
    if (sponsors && sponsors.length > 0) {
        html += '<div class="card" style="padding: 16px; margin-top: 12px;">';
        html += '<h4 style="margin: 0 0 12px; font-size: 14px; color: var(--neo-text-secondary); text-transform: uppercase; letter-spacing: 1px;">Détail par sponsor</h4>';
        html += '<table class="sponsor-stats-table">';
        html += '<thead><tr><th>Sponsor</th><th>Passages</th><th>Temps</th><th>Complétion</th></tr></thead>';
        html += '<tbody>';

        for (const s of sponsors) {
            const sourceBadge = s.source === 'neopro'
                ? '<span class="badge badge-info" style="font-size: 10px; margin-left: 4px;">NEOPRO</span>'
                : '';
            html += `<tr>
                <td><strong>${escapeHtml(s.name)}</strong>${sourceBadge}</td>
                <td>${s.impressions}</td>
                <td>${formatScreenTime(s.screen_time_seconds)}</td>
                <td>${s.completion_rate}%</td>
            </tr>`;
        }

        html += '</tbody></table></div>';
    }

    container.innerHTML = html;
}

/**
 * Rend une carte KPI.
 */
function renderKpiCard(icon, value, label) {
    return `
        <div class="card sponsor-kpi-card">
            <div style="font-size: 20px; margin-bottom: 4px;">${icon}</div>
            <div style="font-size: 22px; font-weight: 700; color: var(--neo-text-primary);">${value}</div>
            <div style="font-size: 12px; color: var(--neo-text-secondary);">${label}</div>
        </div>
    `;
}

/**
 * Mini barres quotidiennes (sparkline simplifiée).
 */
function renderDailyBars(daily) {
    // Prendre les 14 derniers jours pour lisibilité
    const recent = daily.slice(-14);
    const maxVal = Math.max(...recent.map(d => d.impressions), 1);

    let barsHtml = '';
    for (const day of recent) {
        const height = Math.max(2, Math.round((day.impressions / maxVal) * 40));
        const label = day.date.slice(5); // MM-DD
        const title = `${label}: ${day.impressions} passages`;
        barsHtml += `
            <div class="daily-bar-col" title="${title}">
                <div class="daily-bar" style="height: ${height}px;"></div>
                <div class="daily-bar-label">${label.replace('-', '/')}</div>
            </div>
        `;
    }

    return `
        <div class="card" style="padding: 12px; margin-top: 12px;">
            <h4 style="margin: 0 0 8px; font-size: 14px; color: var(--neo-text-secondary); text-transform: uppercase; letter-spacing: 1px;">
                14 derniers jours
            </h4>
            <div class="daily-bars-container">${barsHtml}</div>
        </div>
    `;
}

/**
 * Formate des secondes en durée lisible.
 */
function formatScreenTime(seconds) {
    if (!seconds || seconds <= 0) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return hrs + 'h ' + mins + 'm';
    return mins + ' min';
}

// ============================================================================
// SPONSOR LIST — CRUD sponsors locaux
// ============================================================================

/**
 * Charge et affiche la liste des sponsors (locaux + NEOPRO).
 */
async function loadSponsors() {
    const container = document.getElementById('sponsors-list');
    if (!container) return;

    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const response = await fetch('/api/sponsors');
        if (!response.ok) throw new Error('Erreur HTTP ' + response.status);

        const { sponsors } = await response.json();
        renderSponsorsList(container, sponsors);
    } catch (error) {
        console.error('[sponsors] Erreur:', error);
        container.innerHTML = '<div class="error-message">Erreur lors du chargement des sponsors.</div>';
    }
}

/**
 * Rend la liste des sponsors dans le container.
 */
function renderSponsorsList(container, sponsors) {
    if (!sponsors || sponsors.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--neo-text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">🤝</div>
                <h3>Aucun sponsor</h3>
                <p>Ajoutez votre premier sponsor local pour commencer.</p>
            </div>
        `;
        return;
    }

    const localSponsors = sponsors.filter(s => s.source === 'local');
    const neoProSponsors = sponsors.filter(s => s.source === 'neopro');

    let html = '';

    if (localSponsors.length > 0) {
        html += '<div class="cards-grid">';
        for (const sponsor of localSponsors) {
            html += renderSponsorCard(sponsor);
        }
        html += '</div>';
    }

    if (neoProSponsors.length > 0) {
        html += `
            <h3 style="margin-top: 24px; color: var(--neo-text-secondary); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Sponsors NEOPRO (lecture seule)
            </h3>
            <div class="cards-grid">
        `;
        for (const sponsor of neoProSponsors) {
            html += renderNeoProSponsorCard(sponsor);
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Rend une carte pour un sponsor local.
 */
function renderSponsorCard(sponsor) {
    const videoCount = (sponsor.videoFilenames || []).length;
    const syncBadge = sponsor.centralId
        ? '<span class="badge badge-success" title="Synchronisé avec le central">✓ Sync</span>'
        : '<span class="badge badge-warning" title="En attente de synchronisation">⏳ Sync</span>';

    const loopBadge = sponsor.inLoop
        ? '<span class="badge badge-success">▶ Boucle</span>'
        : '<span class="badge badge-muted">⏸ Hors boucle</span>';

    const activeBadge = sponsor.isActive
        ? ''
        : '<span class="badge badge-danger">Inactif</span>';

    const freq = sponsor.frequency || 2;
    const freqLabels = { 1: 'Basse', 2: 'Normale', 3: 'Haute', 4: 'Maximum' };
    const freqClasses = { 1: 'freq-low', 2: 'freq-normal', 3: 'freq-high', 4: 'freq-max' };
    const freqBadge = `<span class="frequency-badge ${freqClasses[freq] || 'freq-normal'}" title="Fréquence: ${freqLabels[freq] || 'Normale'}">${freq}x ${freqLabels[freq] || 'Normale'}</span>`;

    return `
        <div class="card sponsor-card" data-local-id="${sponsor.localId}">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px;">${escapeHtml(sponsor.name)}</h3>
                <div style="display: flex; gap: 4px;">
                    ${freqBadge}
                    ${syncBadge}
                    ${loopBadge}
                    ${activeBadge}
                </div>
            </div>
            <div class="card-body">
                <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 14px; color: var(--neo-text-secondary);">
                    <span>🎬 ${videoCount} vidéo${videoCount !== 1 ? 's' : ''}</span>
                    ${sponsor.contactEmail ? '<span>✉ ' + escapeHtml(sponsor.contactEmail) + '</span>' : ''}
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-small" onclick="openSponsorModal('${sponsor.localId}')">
                        ✏️ Modifier
                    </button>
                    <button class="btn btn-small ${sponsor.inLoop ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleSponsorLoop('${sponsor.localId}', ${sponsor.inLoop})">
                        ${sponsor.inLoop ? '⏸ Retirer boucle' : '▶ Ajouter boucle'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="confirmDeleteSponsor('${sponsor.localId}', '${escapeHtml(sponsor.name)}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Rend une carte pour un sponsor NEOPRO (lecture seule).
 */
function renderNeoProSponsorCard(sponsor) {
    const videoCount = (sponsor.videoFilenames || []).length;
    return `
        <div class="card sponsor-card" style="opacity: 0.7;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px;">${escapeHtml(sponsor.name)}</h3>
                <span class="badge badge-info">🔒 NEOPRO</span>
            </div>
            <div class="card-body">
                <div style="font-size: 14px; color: var(--neo-text-secondary);">
                    <span>🎬 ${videoCount} vidéo${videoCount !== 1 ? 's' : ''}</span>
                    <span style="margin-left: 8px;">▶ Boucle active</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// WIZARD STATE
// ============================================================================

let currentWizardStep = 1;
let wizardUploadedFile = null; // File object selected for upload in wizard
let wizardUploadedFilename = null; // Filename returned after upload
let wizardIsEditMode = false;

/**
 * Ouvre le modal de création/édition de sponsor.
 * - Create mode (localId falsy): shows 3-step wizard
 * - Edit mode (localId truthy): shows single-page form
 */
async function openSponsorModal(localId) {
    const modal = document.getElementById('sponsor-modal');
    const modalInner = document.getElementById('sponsor-modal-inner');
    const title = document.getElementById('sponsor-modal-title');
    const editIdInput = document.getElementById('sponsor-edit-id');

    // Reset wizard state
    currentWizardStep = 1;
    wizardUploadedFile = null;
    wizardUploadedFilename = null;

    if (localId) {
        // ── EDIT MODE: single-page form ──
        wizardIsEditMode = true;
        modalInner.classList.add('sponsor-modal-edit');
        title.textContent = 'Modifier le sponsor';
        editIdInput.value = localId;

        // Hide wizard steps, show edit fields
        document.getElementById('wizard-indicator').style.display = 'none';
        document.getElementById('wizard-step-1').style.display = 'none';
        document.getElementById('wizard-step-2').style.display = 'none';
        document.getElementById('wizard-step-3').style.display = 'none';
        document.getElementById('wizard-success').style.display = 'none';
        document.getElementById('sponsor-edit-fields').style.display = 'block';

        const editVideosSelect = document.getElementById('sponsor-edit-videos');

        try {
            const response = await fetch('/api/sponsors/' + localId);
            if (!response.ok) throw new Error('Erreur');
            const { sponsor } = await response.json();

            document.getElementById('sponsor-edit-name').value = sponsor.name || '';
            document.getElementById('sponsor-edit-email').value = sponsor.contactEmail || '';
            document.getElementById('sponsor-edit-phone').value = sponsor.contactPhone || '';
            document.getElementById('sponsor-edit-loop').checked = sponsor.inLoop;
            const editFreqEl = document.getElementById('sponsor-edit-frequency');
            if (editFreqEl) editFreqEl.value = String(sponsor.frequency || 2);

            await populateSponsorVideoSelect(editVideosSelect, sponsor.videoFilenames || []);
        } catch (error) {
            console.error('[sponsors] Erreur chargement sponsor:', error);
            return;
        }

        modal.style.display = 'flex';
        document.getElementById('sponsor-edit-name').focus();
    } else {
        // ── CREATE MODE: 3-step wizard ──
        wizardIsEditMode = false;
        modalInner.classList.remove('sponsor-modal-edit');
        title.textContent = 'Ajouter un sponsor';
        editIdInput.value = '';

        // Show wizard, hide edit fields
        document.getElementById('wizard-indicator').style.display = 'flex';
        document.getElementById('sponsor-edit-fields').style.display = 'none';
        document.getElementById('wizard-success').style.display = 'none';

        // Reset form fields
        document.getElementById('sponsor-name').value = '';
        document.getElementById('sponsor-email').value = '';
        document.getElementById('sponsor-phone').value = '';
        const loopCheckbox = document.getElementById('sponsor-add-to-loop');
        if (loopCheckbox) loopCheckbox.checked = true;
        const frequencySelect = document.getElementById('sponsor-frequency');
        if (frequencySelect) frequencySelect.value = '2';

        // Reset wizard video state
        clearWizardUpload();
        selectWizardVideoOption('existing');

        // Populate video select
        const videosSelect = document.getElementById('sponsor-videos');
        await populateSponsorVideoSelect(videosSelect, []);

        // Show step 1
        goToWizardStep(1);

        modal.style.display = 'flex';
        document.getElementById('sponsor-name').focus();
    }
}

/**
 * Navigate to a wizard step (1, 2, or 3).
 */
function goToWizardStep(step) {
    // Validate current step before advancing
    if (step > currentWizardStep) {
        if (currentWizardStep === 1) {
            const name = document.getElementById('sponsor-name').value.trim();
            if (!name) {
                showNotification('Le nom du sponsor est requis', 'error');
                document.getElementById('sponsor-name').focus();
                return;
            }
        }
        if (currentWizardStep === 2 && step === 3) {
            // Upload the file first if user selected upload option and has a file
            if (wizardUploadedFile && !wizardUploadedFilename) {
                wizardUploadVideo().then(() => {
                    if (wizardUploadedFilename) {
                        showWizardStep(3);
                    }
                });
                return;
            }
        }
    }

    // If going to step 3, update summary
    if (step === 3) {
        updateWizardSummary();
    }

    showWizardStep(step);
}

/**
 * Actually show a wizard step and update indicators.
 */
function showWizardStep(step) {
    currentWizardStep = step;

    // Update step panels
    for (let i = 1; i <= 3; i++) {
        const panel = document.getElementById('wizard-step-' + i);
        if (panel) {
            panel.classList.toggle('active', i === step);
        }
    }

    // Update dots
    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById('wizard-dot-' + i);
        if (dot) {
            dot.classList.remove('active', 'completed');
            if (i === step) dot.classList.add('active');
            else if (i < step) dot.classList.add('completed');
        }
    }

    // Update lines
    for (let i = 1; i <= 2; i++) {
        const line = document.getElementById('wizard-line-' + i);
        if (line) {
            line.classList.toggle('completed', i < step);
        }
    }
}

/**
 * Switch between "existing video" and "upload video" option in step 2.
 */
function selectWizardVideoOption(option) {
    const optExisting = document.getElementById('wizard-opt-existing');
    const optUpload = document.getElementById('wizard-opt-upload');
    const panelExisting = document.getElementById('wizard-panel-existing');
    const panelUpload = document.getElementById('wizard-panel-upload');

    if (option === 'existing') {
        optExisting.classList.add('active');
        optUpload.classList.remove('active');
        panelExisting.classList.add('active');
        panelUpload.classList.remove('active');
    } else {
        optExisting.classList.remove('active');
        optUpload.classList.add('active');
        panelExisting.classList.remove('active');
        panelUpload.classList.add('active');
        initWizardDropzone();
    }
}

/**
 * Initialize drag-and-drop for wizard upload zone.
 */
function initWizardDropzone() {
    const dropZone = document.getElementById('wizard-drop-zone');
    const fileInput = document.getElementById('wizard-video-file');
    if (!dropZone || dropZone._wizardInitDone) return;

    dropZone._wizardInitDone = true;

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
        if (e.dataTransfer.files.length > 0) {
            handleWizardFileSelect(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleWizardFileSelect(fileInput.files[0]);
        }
    });
}

/**
 * Handle a file selected in the wizard upload.
 */
function handleWizardFileSelect(file) {
    wizardUploadedFile = file;
    wizardUploadedFilename = null; // Not uploaded yet

    const preview = document.getElementById('wizard-video-preview');
    document.getElementById('wizard-preview-name').textContent = file.name;
    document.getElementById('wizard-preview-size').textContent = formatWizardFileSize(file.size);
    preview.style.display = 'flex';
}

/**
 * Clear the wizard upload selection.
 */
function clearWizardUpload() {
    wizardUploadedFile = null;
    wizardUploadedFilename = null;
    const preview = document.getElementById('wizard-video-preview');
    if (preview) preview.style.display = 'none';
    const progress = document.getElementById('wizard-upload-progress');
    if (progress) progress.style.display = 'none';
    const fileInput = document.getElementById('wizard-video-file');
    if (fileInput) fileInput.value = '';
}

/**
 * Upload the selected video file from the wizard (step 2).
 */
async function wizardUploadVideo() {
    if (!wizardUploadedFile) return;

    const progressDiv = document.getElementById('wizard-upload-progress');
    const progressBar = document.getElementById('wizard-upload-bar');
    const statusText = document.getElementById('wizard-upload-status');

    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = 'Upload en cours...';

    const formData = new FormData();
    formData.append('video', wizardUploadedFile);
    formData.append('category', 'sponsors');

    try {
        const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const pct = Math.round((event.loaded / event.total) * 100);
                    progressBar.style.width = pct + '%';
                    statusText.textContent = 'Upload en cours... ' + pct + '%';
                }
            });
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { resolve({ success: true }); }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
            xhr.open('POST', '/api/videos/upload');
            xhr.send(formData);
        });

        if (data.success) {
            wizardUploadedFilename = data.filename || wizardUploadedFile.name;
            progressBar.style.width = '100%';
            statusText.textContent = 'Upload terminé !';
            showWizardStep(3);
            updateWizardSummary();
        } else {
            throw new Error(data.error || 'Erreur lors de l\'upload');
        }
    } catch (error) {
        console.error('[sponsors] Wizard upload error:', error);
        showNotification('Erreur upload: ' + error.message, 'error');
        statusText.textContent = 'Erreur: ' + error.message;
    }
}

/**
 * Update the summary card on step 3.
 */
function updateWizardSummary() {
    const nameVal = document.getElementById('sponsor-name').value.trim();
    document.getElementById('wizard-sum-name').textContent = nameVal || '--';

    // Determine video name(s)
    let videoLabel = '--';
    if (wizardUploadedFilename) {
        videoLabel = wizardUploadedFilename;
    } else {
        const videosSelect = document.getElementById('sponsor-videos');
        const selected = Array.from(videosSelect.selectedOptions).map(o => o.textContent);
        if (selected.length > 0) {
            videoLabel = selected.length === 1 ? selected[0] : selected.length + ' vidéos';
        }
    }
    document.getElementById('wizard-sum-video').textContent = videoLabel;

    // Frequency
    const freqEl = document.getElementById('sponsor-frequency');
    const freqLabels = { '1': 'Basse (1x)', '2': 'Normale (2x)', '3': 'Haute (3x)', '4': 'Maximum (4x)' };
    document.getElementById('wizard-sum-freq').textContent = freqLabels[freqEl.value] || 'Normale (2x)';

    // Live-update when frequency changes
    freqEl.onchange = function () {
        document.getElementById('wizard-sum-freq').textContent = freqLabels[freqEl.value] || 'Normale (2x)';
    };
}

/**
 * Format file size for wizard preview.
 */
function formatWizardFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Ferme le modal sponsor et réinitialise l'état.
 */
function closeSponsorModal() {
    const modal = document.getElementById('sponsor-modal');
    if (modal) modal.style.display = 'none';

    // Reset wizard state
    wizardUploadedFile = null;
    wizardUploadedFilename = null;
    wizardIsEditMode = false;

    // Reset dropzone init flag so it can be re-initialized
    const dropZone = document.getElementById('wizard-drop-zone');
    if (dropZone) dropZone._wizardInitDone = false;
}

/**
 * Sauvegarde le sponsor (création via wizard OU mise à jour via edit form).
 */
async function saveSponsor() {
    const editId = document.getElementById('sponsor-edit-id').value;

    if (editId) {
        // ── EDIT MODE ──
        const name = document.getElementById('sponsor-edit-name').value.trim();
        const contactEmail = document.getElementById('sponsor-edit-email').value.trim();
        const contactPhone = document.getElementById('sponsor-edit-phone').value.trim();
        const videosSelect = document.getElementById('sponsor-edit-videos');
        const addToLoop = document.getElementById('sponsor-edit-loop').checked;
        const frequencyEl = document.getElementById('sponsor-edit-frequency');
        const frequency = frequencyEl ? parseInt(frequencyEl.value, 10) : 2;

        if (!name) {
            showNotification('Le nom du sponsor est requis', 'error');
            return;
        }

        const selectedVideos = Array.from(videosSelect.selectedOptions).map(o => o.value);

        try {
            const response = await fetch('/api/sponsors/' + editId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone, frequency }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la mise à jour');
            }
            const result = await response.json();
            const sponsor = result.sponsor;

            // Synchroniser les vidéos liées
            await syncSponsorVideos(editId, selectedVideos);

            // Gérer la boucle
            if (addToLoop && !sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'POST' });
            } else if (!addToLoop && sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'DELETE' });
            }

            showNotification('Sponsor mis à jour', 'success');
            closeSponsorModal();
            loadSponsors();
        } catch (error) {
            console.error('[sponsors] Erreur sauvegarde:', error);
            showNotification(error.message, 'error');
        }
    } else {
        // ── CREATE MODE (wizard) ──
        const name = document.getElementById('sponsor-name').value.trim();
        const contactEmail = document.getElementById('sponsor-email').value.trim();
        const contactPhone = document.getElementById('sponsor-phone').value.trim();
        const addToLoop = document.getElementById('sponsor-add-to-loop').checked;
        const frequencyEl = document.getElementById('sponsor-frequency');
        const frequency = frequencyEl ? parseInt(frequencyEl.value, 10) : 2;

        if (!name) {
            showNotification('Le nom du sponsor est requis', 'error');
            return;
        }

        // Collect selected videos (existing selection + wizard uploaded)
        const videosSelect = document.getElementById('sponsor-videos');
        const selectedVideos = Array.from(videosSelect.selectedOptions).map(o => o.value);
        if (wizardUploadedFilename && !selectedVideos.includes(wizardUploadedFilename)) {
            selectedVideos.push(wizardUploadedFilename);
        }

        try {
            // Create sponsor
            const response = await fetch('/api/sponsors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone, frequency }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la création');
            }
            const result = await response.json();
            const sponsor = result.sponsor;

            // Link videos
            for (const filename of selectedVideos) {
                await fetch('/api/sponsors/' + sponsor.localId + '/videos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename }),
                });
            }

            // Add to loop if requested and has videos
            if (addToLoop && selectedVideos.length > 0) {
                await fetch('/api/sponsors/' + sponsor.localId + '/loop', { method: 'POST' });
            }

            // Show success screen
            document.getElementById('wizard-step-3').classList.remove('active');
            document.getElementById('wizard-indicator').style.display = 'none';
            const successDiv = document.getElementById('wizard-success');
            successDiv.style.display = 'block';
            successDiv.classList.add('active');
            document.getElementById('wizard-success-text').textContent =
                'Sponsor "' + name + '" créé !';

            showNotification('Sponsor créé avec succès', 'success');
        } catch (error) {
            console.error('[sponsors] Erreur sauvegarde:', error);
            showNotification(error.message, 'error');
        }
    }
}

/**
 * Synchronise les vidéos liées à un sponsor (ajoute/retire).
 */
async function syncSponsorVideos(localId, newVideoFilenames) {
    try {
        const response = await fetch('/api/sponsors/' + localId);
        if (!response.ok) return;
        const { sponsor } = await response.json();
        const currentVideos = sponsor.videoFilenames || [];

        // Vidéos à ajouter
        const toAdd = newVideoFilenames.filter(f => !currentVideos.includes(f));
        // Vidéos à retirer
        const toRemove = currentVideos.filter(f => !newVideoFilenames.includes(f));

        for (const filename of toAdd) {
            await fetch('/api/sponsors/' + localId + '/videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename }),
            });
        }

        for (const filename of toRemove) {
            await fetch('/api/sponsors/' + localId + '/videos/' + encodeURIComponent(filename), {
                method: 'DELETE',
            });
        }
    } catch (error) {
        console.error('[sponsors] Erreur sync vidéos:', error);
    }
}

/**
 * Peuple le select de vidéos avec les fichiers disponibles.
 */
async function populateSponsorVideoSelect(selectEl, selectedFilenames) {
    if (!selectEl) return;

    selectEl.innerHTML = '';

    try {
        const response = await fetch('/api/videos');
        if (!response.ok) return;
        const { videos } = await response.json();

        for (const video of (videos || [])) {
            const option = document.createElement('option');
            option.value = video.name;
            option.textContent = video.displayName || video.name;
            if (selectedFilenames.includes(video.name)) {
                option.selected = true;
            }
            selectEl.appendChild(option);
        }
    } catch (error) {
        console.error('[sponsors] Erreur chargement vidéos:', error);
    }
}

/**
 * Ouvre le modal de confirmation de suppression.
 */
function confirmDeleteSponsor(localId, name) {
    const modal = document.getElementById('sponsor-delete-modal');
    const nameEl = document.getElementById('sponsor-delete-name');
    const confirmBtn = document.getElementById('sponsor-delete-confirm-btn');

    nameEl.textContent = name;
    confirmBtn.onclick = async () => {
        try {
            const response = await fetch('/api/sponsors/' + localId, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur');
            }
            closeSponsorDeleteModal();
            showNotification('Sponsor supprimé', 'success');
            loadSponsors();
        } catch (error) {
            console.error('[sponsors] Erreur suppression:', error);
            showNotification(error.message, 'error');
        }
    };

    modal.style.display = 'flex';
}

/**
 * Ferme le modal de suppression.
 */
function closeSponsorDeleteModal() {
    const modal = document.getElementById('sponsor-delete-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Toggle l'état boucle d'un sponsor.
 */
async function toggleSponsorLoop(localId, currentlyInLoop) {
    try {
        const method = currentlyInLoop ? 'DELETE' : 'POST';
        const response = await fetch('/api/sponsors/' + localId + '/loop', { method });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Erreur');
        }

        const action = currentlyInLoop ? 'retiré de' : 'ajouté à';
        showNotification('Sponsor ' + action + ' la boucle', 'success');
        loadSponsors();
    } catch (error) {
        console.error('[sponsors] Erreur toggle boucle:', error);
        showNotification(error.message, 'error');
    }
}

// escapeHtml is defined globally in modules/upload/index.js

// ============================================================================
// MODULE: modules/network/wifi.js
// ============================================================================

// ============================================================================
// Scanner WiFi, connexion, BSSID
// ============================================================================

// Track if we're in a mesh environment (multiple APs with same SSID)
let isMeshEnvironment = false;
let meshApCount = 0;

// Load current WiFi connection status
async function loadWifiCurrent() {
    const container = document.getElementById('wifi-current-info');
    try {
        const response = await fetch('/api/wifi/current');
        const data = await response.json();

        if (data.connected) {
            const signalBars = getSignalBars(data.quality);
            const lockIcon = data.bssidLocked ? '🔒' : '';

            // Check if BSSID lock is problematic in mesh environment
            const bssidLockWarning = data.bssidLocked && isMeshEnvironment ? `
                <div class="mesh-warning">
                    <p>⚠️ <strong>Attention :</strong> Verrouillage BSSID actif en environnement mesh (${meshApCount} APs détectés)</p>
                    <p class="info-text">En mesh WiFi, le verrouillage BSSID peut causer des déconnexions si l'AP verrouillé devient inaccessible.</p>
                    <button class="btn btn-warning btn-sm" onclick="removeBssidLock()">🔓 Supprimer le verrouillage BSSID</button>
                </div>
            ` : '';

            container.innerHTML = `
                <div class="wifi-current-status connected">
                    <div class="wifi-status-row">
                        <span class="wifi-signal">${signalBars}</span>
                        <span class="wifi-ssid"><strong>${data.ssid}</strong></span>
                        <span class="wifi-connected-badge">✅ Connecté</span>
                    </div>
                    <div class="wifi-details">
                        <p><strong>IP:</strong> ${data.ipAddress || 'En attente...'}</p>
                        <p><strong>Signal:</strong> ${data.signal} dBm (${data.quality}%)</p>
                        <p><strong>Point d'accès:</strong> ${data.bssid} ${lockIcon}</p>
                        ${data.bssidLocked
                            ? `<p class="bssid-locked">🔒 BSSID fixé: ${data.bssidLocked}</p>`
                            : '<p class="bssid-unlocked">🔄 Roaming activé (bascule automatique entre APs)</p>'}
                    </div>
                    ${bssidLockWarning}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="wifi-current-status disconnected">
                    <p>❌ Non connecté</p>
                    <p class="info-text">Scannez les réseaux ci-dessous et connectez-vous.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading WiFi current:', error);
        container.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    }
}

// Remove BSSID lock from wpa_supplicant configuration
async function removeBssidLock() {
    if (!confirm('Supprimer le verrouillage BSSID ?\n\nLe dongle WiFi pourra basculer automatiquement entre les différents points d\'accès du réseau mesh.')) {
        return;
    }

    try {
        const response = await fetch('/api/wifi/bssid-lock', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Verrouillage BSSID supprimé. Le dongle peut maintenant changer d\'AP automatiquement.', 'success');
            loadWifiCurrent();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

function refreshWifiCurrent() {
    loadWifiCurrent();
}

// Scan WiFi networks
async function scanWifiNetworks() {
    const btn = document.getElementById('scan-btn');
    const container = document.getElementById('wifi-networks-list');

    btn.disabled = true;
    btn.textContent = '⏳ Scan...';
    container.innerHTML = '<p class="info-text">Scan en cours...</p>';

    try {
        const response = await fetch('/api/wifi/scan');
        const data = await response.json();

        if (!data.networks || data.networks.length === 0) {
            container.innerHTML = '<p class="info-text">Aucun réseau trouvé. Réessayez.</p>';
            return;
        }

        // Group networks by SSID to show multiple APs
        const networksBySSID = {};
        data.networks.forEach(net => {
            if (!networksBySSID[net.ssid]) {
                networksBySSID[net.ssid] = [];
            }
            networksBySSID[net.ssid].push(net);
        });

        // Detect mesh environment: check if the currently connected SSID has multiple APs
        if (data.currentSsid && networksBySSID[data.currentSsid]) {
            meshApCount = networksBySSID[data.currentSsid].length;
            isMeshEnvironment = meshApCount > 1;

            // Update the WiFi status display to show mesh warning if needed
            loadWifiCurrent();
        }

        let html = '<div class="wifi-networks">';

        for (const [ssid, aps] of Object.entries(networksBySSID)) {
            const hasMultipleAPs = aps.length > 1;
            const bestAP = aps[0]; // Already sorted by signal

            html += `<div class="wifi-network-group ${hasMultipleAPs ? 'multiple-aps' : ''}">`;
            html += `<div class="wifi-network-header">
                <span class="wifi-signal">${getSignalBars(bestAP.quality)}</span>
                <span class="wifi-ssid">${ssid}</span>
                <span class="wifi-security">${bestAP.encrypted ? '🔒 ' + bestAP.security : '🔓 Open'}</span>
                ${hasMultipleAPs ? `<span class="wifi-ap-count">📡 ${aps.length} APs (Mesh)</span>` : ''}
            </div>`;

            // Show mesh warning if multiple APs
            if (hasMultipleAPs) {
                html += `<div class="mesh-info-banner">
                    <span>ℹ️ Réseau mesh détecté - Le verrouillage BSSID n'est pas recommandé</span>
                </div>`;
            }

            // Show individual APs
            html += '<div class="wifi-aps-list">';
            aps.forEach((ap, index) => {
                const isCurrent = ap.bssid === data.currentBssid;
                html += `
                    <div class="wifi-ap ${isCurrent ? 'current' : ''}" data-ssid="${ap.ssid}" data-bssid="${ap.bssid}">
                        <div class="wifi-ap-info">
                            <span class="wifi-signal-small">${getSignalBars(ap.quality)}</span>
                            <span class="wifi-ap-bssid">${ap.bssid}</span>
                            <span class="wifi-ap-channel">CH ${ap.channel}</span>
                            <span class="wifi-ap-signal">${ap.signal} dBm</span>
                            ${isCurrent ? '<span class="wifi-current-badge">● Connecté</span>' : ''}
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="selectWifiNetwork('${ap.ssid}', '${ap.bssid}', ${ap.quality}, ${hasMultipleAPs})">
                            ${isCurrent ? '🔄 Reconnecter' : '📶 Connecter'}
                        </button>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error scanning WiFi:', error);
        container.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Scanner';
    }
}

// Select a network to connect
function selectWifiNetwork(ssid, bssid, quality, isMesh = false) {
    document.getElementById('wifi-connect-ssid').value = ssid;
    document.getElementById('wifi-connect-bssid').value = bssid;
    document.getElementById('wifi-connect-password').value = '';
    document.getElementById('wifi-connect-card').style.display = 'block';
    document.getElementById('wifi-connect-password').focus();

    // Handle BSSID lock checkbox based on mesh detection
    const lockCheckbox = document.getElementById('wifi-lock-bssid');
    const meshWarning = document.getElementById('wifi-mesh-warning');

    // Store mesh status for later validation
    window._currentNetworkIsMesh = isMesh;

    if (isMesh) {
        // In mesh environment: BLOCK BSSID lock completely
        lockCheckbox.checked = false;
        lockCheckbox.disabled = true;
        if (meshWarning) {
            meshWarning.style.display = 'block';
            meshWarning.innerHTML = `
                <div class="alert alert-danger">
                    <strong>⛔ Verrouillage BSSID interdit</strong><br>
                    <small>Réseau mesh détecté (plusieurs APs avec le même SSID).
                    Le verrouillage BSSID causerait des déconnexions si l'AP verrouillé devient inaccessible.</small>
                </div>
            `;
        }
    } else {
        // Single AP: allow BSSID lock (user choice)
        lockCheckbox.disabled = false;
        lockCheckbox.checked = false; // Default unchecked, let user decide
        if (meshWarning) {
            meshWarning.style.display = 'none';
        }
    }

    // Scroll to the form
    document.getElementById('wifi-connect-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelWifiConnect() {
    document.getElementById('wifi-connect-card').style.display = 'none';
}

// Connect to WiFi with optional BSSID lock
async function connectToWifi(event) {
    event.preventDefault();

    const ssid = document.getElementById('wifi-connect-ssid').value;
    const bssid = document.getElementById('wifi-connect-bssid').value;
    const password = document.getElementById('wifi-connect-password').value;
    let lockBssid = document.getElementById('wifi-lock-bssid').checked;

    // SAFETY: Block BSSID lock in mesh environments even if checkbox was manipulated
    if (lockBssid && window._currentNetworkIsMesh) {
        showNotification('⛔ Verrouillage BSSID interdit en environnement mesh', 'error');
        return;
    }

    const btn = document.getElementById('wifi-connect-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Connexion...';

    try {
        const response = await fetch('/api/wifi/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssid, password, bssid, lockBssid })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            cancelWifiConnect();
            // Refresh after a delay to allow connection
            setTimeout(() => {
                loadWifiCurrent();
                scanWifiNetworks();
            }, 3000);
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📶 Se connecter';
    }
}

// Helper: Get signal bars based on quality percentage
function getSignalBars(quality) {
    if (quality === null || quality === undefined) return '📶';
    if (quality >= 80) return '📶📶📶📶';
    if (quality >= 60) return '📶📶📶░';
    if (quality >= 40) return '📶📶░░';
    if (quality >= 20) return '📶░░░';
    return '░░░░';
}

// Load network interfaces info
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

        // Show wlan1 (USB dongle) info if available
        if (data.wlan1 && data.wlan1.ssid) {
            const wifiDiv = document.createElement('div');
            wifiDiv.className = 'network-interface wifi-info';
            wifiDiv.innerHTML = `
                <h4>wlan1 (Clé WiFi USB)</h4>
                <p><strong>SSID:</strong> ${data.wlan1.ssid}</p>
                <p><strong>BSSID:</strong> ${data.wlan1.bssid || 'N/A'}</p>
                <p><strong>Signal:</strong> ${data.wlan1.signal} dBm (${data.wlan1.quality}%)</p>
            `;
            container.appendChild(wifiDiv);
        }

        // Show wlan0 (hotspot) info
        if (data.wlan0) {
            const hotspotDiv = document.createElement('div');
            hotspotDiv.className = 'network-interface hotspot-info';
            hotspotDiv.innerHTML = `
                <h4>wlan0 (Hotspot)</h4>
                <p><strong>Mode:</strong> ${data.wlan0.mode || 'N/A'}</p>
                <p><strong>SSID:</strong> ${data.wlan0.ssid || 'N/A'}</p>
            `;
            container.appendChild(hotspotDiv);
        }
    } catch (error) {
        console.error('Error loading network:', error);
    }
}

function refreshNetwork() {
    loadNetwork();
    loadWifiCurrent();
}

// ============================================================================
// MODULE: modules/network/hotspot.js
// ============================================================================

// ============================================================================
// Diagnostic hotspot
// ============================================================================

let lastHotspotResult = null;

async function runHotspotDiagnostic(autoFix) {
    if (DEMO_MODE) {
        showNotification('Mode démo : fonctionnalité non disponible', 'warning');
        return;
    }

    const loadingDiv = document.getElementById('hotspot-loading');
    const resultDiv = document.getElementById('hotspot-result');
    const diagBtn = document.getElementById('hotspot-diag-btn');
    const fixBtn = document.getElementById('hotspot-fix-btn');

    // Show loading
    loadingDiv.style.display = 'flex';
    resultDiv.style.display = 'none';
    diagBtn.disabled = true;
    fixBtn.disabled = true;

    try {
        const response = await fetch('/api/hotspot/fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoFix })
        });

        const result = await response.json();
        lastHotspotResult = result;

        loadingDiv.style.display = 'none';
        diagBtn.disabled = false;
        fixBtn.disabled = false;

        // Display the result
        displayHotspotResult(result, autoFix);

        // If channel was changed and needs reboot, show confirmation modal
        if (autoFix && result.fix?.channelChanged && result.fix?.needsReboot) {
            showRebootModal(result.fix.oldChannel, result.fix.newChannel);
        } else if (result.success) {
            showNotification(autoFix ? 'Diagnostic et réparation terminés' : 'Diagnostic terminé', 'success');
        }
    } catch (error) {
        console.error('Hotspot diagnostic error:', error);
        loadingDiv.style.display = 'none';
        diagBtn.disabled = false;
        fixBtn.disabled = false;
        showNotification('Erreur lors du diagnostic: ' + error.message, 'error');
    }
}

function displayHotspotResult(result, wasAutoFix) {
    const resultDiv = document.getElementById('hotspot-result');
    resultDiv.style.display = 'block';

    let html = '';

    // New JSON format from fix-hotspot.sh
    if (result.diagnostic) {
        html += '<div class="diagnostic-grid">';
        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">Canal actuel</span>
            <span class="diagnostic-value">${result.diagnostic.currentChannel}</span>
        </div>`;

        if (result.diagnostic.recommendedChannel !== result.diagnostic.currentChannel) {
            html += `<div class="diagnostic-item">
                <span class="diagnostic-label">Canal recommandé</span>
                <span class="diagnostic-value recommended">${result.diagnostic.recommendedChannel}</span>
            </div>`;
        }

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">SSID</span>
            <span class="diagnostic-value">${result.diagnostic.ssid || 'N/A'}</span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">hostapd</span>
            <span class="diagnostic-value ${result.diagnostic.hostapdActive ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.hostapdActive ? '✅ Actif' : '❌ Inactif'}
            </span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">dnsmasq</span>
            <span class="diagnostic-value ${result.diagnostic.dnsmasqActive ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.dnsmasqActive ? '✅ Actif' : '❌ Inactif'}
            </span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">Alimentation</span>
            <span class="diagnostic-value ${result.diagnostic.powerOk ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.powerOk ? '✅ OK' : '❌ Problème'}
            </span>
        </div>`;
        html += '</div>';

        // Show channel change pending message
        if (result.fix?.channelChanged && result.fix?.needsReboot) {
            html += `<div class="pending-reboot-info">
                <p>✅ Canal changé de ${result.fix.oldChannel} à ${result.fix.newChannel}.</p>
                <p>ℹ️ Le changement sera appliqué au prochain redémarrage du boîtier.</p>
            </div>`;
        }

        // Show message from script
        if (result.message) {
            html += `<div class="diagnostic-message">${result.message}</div>`;
        }
    }
    // Fallback: old format with checks array
    else if (result.checks) {
        html += '<div class="hotspot-checks">';
        result.checks.forEach(check => {
            const icon = check.status === 'ok' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
            const statusClass = `check-${check.status}`;
            html += `<div class="hotspot-check ${statusClass}">
                <span class="check-icon">${icon}</span>
                <span class="check-name">${check.name}</span>
                <span class="check-value">${check.value}</span>
            </div>`;
        });
        html += '</div>';
    }
    // Fallback: raw output
    else if (result.output) {
        html += `<pre class="output-viewer">${result.output}</pre>`;
    }

    resultDiv.innerHTML = html;
}

function showRebootModal(oldChannel, newChannel) {
    const modal = document.getElementById('reboot-modal');
    const message = document.getElementById('reboot-modal-message');
    message.innerHTML = `Le canal WiFi a été changé de <strong>${oldChannel}</strong> à <strong>${newChannel}</strong>.
        Pour appliquer ce changement, le boîtier doit redémarrer (~1 minute d'interruption).`;
    modal.style.display = 'flex';
}

function cancelHotspotReboot() {
    const modal = document.getElementById('reboot-modal');
    modal.style.display = 'none';
    showNotification('Le changement de canal sera appliqué au prochain redémarrage', 'info');
}

async function confirmHotspotReboot() {
    const modal = document.getElementById('reboot-modal');
    const confirmBtn = document.getElementById('reboot-confirm-btn');

    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Redémarrage...';

    try {
        const response = await fetch('/api/system/reboot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            modal.style.display = 'none';
            showNotification('Redémarrage en cours... Le boîtier sera de nouveau en ligne dans ~1 minute', 'success');
        } else {
            throw new Error('Erreur lors du redémarrage');
        }
    } catch (error) {
        console.error('Reboot error:', error);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🔄 Redémarrer maintenant';
        showNotification('Erreur lors du redémarrage: ' + error.message, 'error');
    }
}

// ============================================================================
// MODULE: modules/logs/index.js
// ============================================================================

// ============================================================================
// Visionneuse de logs
// ============================================================================

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

// ============================================================================
// MODULE: modules/upload/index.js
// ============================================================================

// ============================================================================
// Upload video (dropzone, progress)
// ============================================================================

function initForms() {
    // Upload form
    const uploadForm = document.getElementById('upload-form');
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await uploadVideo();
    });

    // Populate sponsor select
    populateUploadSponsorSelect();

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

    // WiFi connect form
    const wifiConnectForm = document.getElementById('wifi-connect-form');
    if (wifiConnectForm) {
        wifiConnectForm.addEventListener('submit', connectToWifi);
    }

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

// Stockage des URLs de preview pour nettoyage
let previewObjectUrls = [];

function updateSelectedFilesUI() {
    const container = document.getElementById('selected-files');
    const countSpan = document.getElementById('files-count');
    const listUl = document.getElementById('files-list');

    // Nettoyer les anciennes URLs de preview
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    previewObjectUrls = [];

    if (selectedFilesForUpload.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const totalSize = selectedFilesForUpload.reduce((sum, f) => sum + f.size, 0);
    countSpan.textContent = `${selectedFilesForUpload.length} fichier(s) - ${formatBytes(totalSize)}`;

    listUl.innerHTML = selectedFilesForUpload.map((file, index) => {
        // Créer une URL de preview pour la vidéo
        const previewUrl = URL.createObjectURL(file);
        previewObjectUrls.push(previewUrl);

        return `
        <li class="file-item file-item-with-preview">
            <div class="file-preview-thumb" onclick="previewUploadFile(${index})">
                <video src="${previewUrl}" muted preload="metadata" class="file-preview-video"></video>
                <span class="file-preview-play">▶</span>
            </div>
            <div class="file-info-container">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatBytes(file.size)}</span>
            </div>
            <div class="file-actions">
                <button type="button" class="btn btn-small btn-secondary" onclick="previewUploadFile(${index})" title="Prévisualiser">👁️</button>
                <button type="button" class="btn btn-small btn-danger" onclick="removeFileFromSelection(${index})" title="Retirer">✕</button>
            </div>
        </li>`;
    }).join('');

    // Charger les métadonnées pour afficher la durée
    listUl.querySelectorAll('.file-preview-video').forEach((video, index) => {
        video.addEventListener('loadedmetadata', () => {
            const duration = formatDuration(video.duration);
            const fileItem = listUl.querySelectorAll('.file-item')[index];
            const sizeSpan = fileItem.querySelector('.file-size');
            if (sizeSpan && duration) {
                sizeSpan.textContent += ` • ${duration}`;
            }
        });
    });
}

/**
 * Prévisualiser un fichier avant upload
 */
function previewUploadFile(index) {
    const file = selectedFilesForUpload[index];
    if (!file) return;

    const url = URL.createObjectURL(file);
    openVideoPreview(url, file.name);

    // Nettoyer l'URL quand la modale est fermée
    const modal = document.getElementById('video-preview-modal');
    const cleanup = () => {
        URL.revokeObjectURL(url);
        modal.removeEventListener('click', cleanup);
    };
    modal.addEventListener('click', cleanup, { once: true });
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

/**
 * Upload avec progression réelle en pourcentage via XMLHttpRequest
 */
function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                onProgress(percentComplete, event.loaded, event.total);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    resolve({ success: true, message: 'Upload terminé' });
                }
            } else {
                reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
        xhr.addEventListener('abort', () => reject(new Error('Upload annulé')));

        xhr.open('POST', url);
        xhr.send(formData);
    });
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
    const sponsorLocalId = document.getElementById('upload-sponsor')?.value || '';
    const addToLoop = document.getElementById('upload-add-to-loop')?.checked || false;

    if (!category) {
        showNotification('Sélectionnez une catégorie', 'error');
        return;
    }

    // Disable upload button
    uploadBtn.disabled = true;
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    resultsList.innerHTML = '';

    // Calculer la taille totale
    const totalSize = filesToUpload.reduce((sum, file) => sum + file.size, 0);

    console.log('[admin-ui] Upload multiple videos request', {
        category,
        subcategory,
        filesCount: filesToUpload.length,
        totalSize: formatBytes(totalSize)
    });

    // Upload multiple files
    if (filesToUpload.length > 1) {
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);
        if (sponsorLocalId) formData.append('sponsorLocalId', sponsorLocalId);
        if (sponsorLocalId && addToLoop) formData.append('addToLoop', 'true');

        filesToUpload.forEach(file => {
            formData.append('videos', file);
        });

        currentFileSpan.textContent = `${filesToUpload.length} fichiers (${formatBytes(totalSize)})`;
        fileCountSpan.textContent = '';
        progressBar.style.width = '0%';
        statusText.textContent = 'Préparation...';

        try {
            const data = await uploadWithProgress('/api/videos/upload-multiple', formData, (percent, loaded, total) => {
                progressBar.style.width = percent + '%';
                statusText.textContent = `Upload en cours... ${percent}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
            });

            console.log('[admin-ui] /api/videos/upload-multiple response', data);

            progressBar.style.width = '100%';

            if (data.success) {
                statusText.textContent = data.message || 'Upload terminé !';
                showNotification(data.message || 'Upload terminé avec succès', 'success');
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
            showNotification('Erreur lors de l\'upload: ' + error.message, 'error');
            statusText.textContent = 'Erreur: ' + error.message;
        }
    } else {
        // Single file upload with progress
        const file = filesToUpload[0];
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);
        if (sponsorLocalId) formData.append('sponsorLocalId', sponsorLocalId);
        if (sponsorLocalId && addToLoop) formData.append('addToLoop', 'true');
        formData.append('video', file);

        currentFileSpan.textContent = `${file.name} (${formatBytes(file.size)})`;
        fileCountSpan.textContent = '';
        progressBar.style.width = '0%';
        statusText.textContent = 'Préparation...';

        try {
            const data = await uploadWithProgress('/api/videos/upload', formData, (percent, loaded, total) => {
                progressBar.style.width = percent + '%';
                statusText.textContent = `Upload en cours... ${percent}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
            });

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
                showNotification('Erreur: ' + (data.error || 'Erreur inconnue'), 'error');
                statusText.textContent = 'Erreur: ' + (data.error || 'Erreur inconnue');
            }
        } catch (error) {
            showNotification('Erreur lors de l\'upload: ' + error.message, 'error');
            statusText.textContent = 'Erreur: ' + error.message;
        }
    }

    // Re-enable upload button
    uploadBtn.disabled = false;
}

/**
 * Peuple le select de sponsors dans le formulaire d'upload.
 */
async function populateUploadSponsorSelect() {
    const sponsorSelect = document.getElementById('upload-sponsor');
    if (!sponsorSelect) return;

    try {
        const response = await fetch('/api/sponsors');
        if (!response.ok) return;
        const { sponsors } = await response.json();

        // Garder seulement les sponsors locaux
        const localSponsors = (sponsors || []).filter(s => s.source === 'local');
        sponsorSelect.innerHTML = '<option value="">-- Aucun sponsor --</option>';
        for (const sponsor of localSponsors) {
            const option = document.createElement('option');
            option.value = sponsor.localId;
            option.textContent = sponsor.name;
            sponsorSelect.appendChild(option);
        }
    } catch (error) {
        console.warn('[upload] Could not load sponsors for upload select:', error);
    }
}

// Note: configureWifi() has been replaced by the new WiFi scanner UI
// See loadWifiCurrent(), scanWifiNetworks(), connectToWifi()

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

// ============================================================================
// MODULE: modules/config/time-categories.js
// ============================================================================

// ============================================================================
// Blocs temps (avant/pendant/apres match)
// ============================================================================

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

// ============================================================================
// MODULE: modules/config/categories.js
// ============================================================================

// ============================================================================
// Gestionnaire categories/sous-categories
// ============================================================================

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

// ============================================================================
// MODULE: modules/bootstrap.js
// ============================================================================

// ============================================================================
// Navigation, init, DOMContentLoaded
// ============================================================================

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSubNavigation();
    initForms();
    initLogButtons();
    initDropZone();
    updateTime();
    startConnectionMonitoring(); // Start connection monitoring
    initMode(); // Initialize club/tech mode from localStorage
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

    const rawVersion = currentVersionInfo?.version || null;
    let versionLabel = null;

    if (rawVersion) {
        versionLabel = rawVersion.trim();
        if (versionLabel && !/^v/i.test(versionLabel)) {
            versionLabel = `v${versionLabel}`;
        }
    }

    const versionText = versionLabel ? `Neopro ${versionLabel}` : 'Neopro';
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
        case 'sponsors':
            loadSponsors();
            break;
        case 'network':
            loadNetwork();
            loadWifiCurrent();
            break;
        case 'logs':
            loadLogs(currentLogService);
            break;
    }
}

// ============================================================================
// EXPORTS GLOBAUX - Fonctions appelées depuis les handlers inline HTML
// ============================================================================
// Ces fonctions sont appelées via onclick="..." dans index.html
// Elles doivent être explicitement exposées sur window pour être accessibles
window.regenerateThumbnails = regenerateThumbnails;
window.refreshVideos = refreshVideos;
window.filterVideos = filterVideos;
window.openVideoPreview = openVideoPreview;
window.closeVideoPreview = closeVideoPreview;
window.confirmAction = confirmAction;
window.closeModal = closeModal;
window.closeEditModal = closeEditModal;
window.restartService = restartService;
window.refreshNetwork = refreshNetwork;
window.refreshLogs = refreshLogs;
window.refreshCategories = refreshCategories;
window.refreshTimeCategories = refreshTimeCategories;
window.addCategory = addCategory;
window.addTimeCategory = addTimeCategory;
window.clearSelectedFiles = clearSelectedFiles;

// Mode switcher
window.toggleMode = toggleMode;

// WiFi scanner functions
window.loadWifiCurrent = loadWifiCurrent;
window.refreshWifiCurrent = refreshWifiCurrent;
window.scanWifiNetworks = scanWifiNetworks;
window.selectWifiNetwork = selectWifiNetwork;
window.cancelWifiConnect = cancelWifiConnect;
window.connectToWifi = connectToWifi;
window.removeBssidLock = removeBssidLock;

// Sponsor functions
window.loadSponsors = loadSponsors;
window.openSponsorModal = openSponsorModal;
window.closeSponsorModal = closeSponsorModal;
window.saveSponsor = saveSponsor;
window.confirmDeleteSponsor = confirmDeleteSponsor;
window.closeSponsorDeleteModal = closeSponsorDeleteModal;
window.toggleSponsorLoop = toggleSponsorLoop;
