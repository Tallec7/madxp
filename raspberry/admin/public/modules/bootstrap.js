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
