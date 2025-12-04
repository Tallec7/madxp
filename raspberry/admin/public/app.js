/**
 * Neopro Admin Panel - JavaScript
 */

// État global
let currentTab = 'dashboard';
let currentLogService = 'app';
let refreshInterval = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initForms();
    initLogButtons();
    updateTime();
    loadDashboard();

    // Rafraîchissement automatique toutes les 5 secondes
    refreshInterval = setInterval(() => {
        if (currentTab === 'dashboard') {
            loadDashboard();
        }
    }, 5000);
});

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
        const response = await fetch('/api/videos');
        console.log('[admin-ui] GET /api/videos -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/videos payload', data);

        const list = document.getElementById('videos-list');
        list.innerHTML = '';

        // L'API retourne directement un tableau, pas un objet avec videos
        const videos = Array.isArray(data) ? data : (data.videos || []);

        if (videos.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Aucune vidéo trouvée</p>';
            return;
        }

        videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-item';
            item.innerHTML = `
                <div class="video-info">
                    <div class="video-name">${video.name}</div>
                    <div class="video-meta">
                        ${video.category} • ${video.size}
                    </div>
                </div>
                <div class="video-actions">
                    <button class="btn btn-danger btn-sm" onclick="deleteVideo('${video.category}', '${video.name}')">
                        🗑️ Supprimer
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading videos:', error);
    }
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
        const category = e.target.value;

        // Show subcategories only for Match_SM1 and Match_SF
        if (category === 'Match_SM1' || category === 'Match_SF') {
            subcategoryGroup.style.display = 'block';
            subcategorySelect.required = true;

            // Populate subcategories
            subcategorySelect.innerHTML = `
                <option value="">-- Sélectionner --</option>
                <option value="But">But</option>
                <option value="Jingle">Jingle</option>
            `;
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
}

async function uploadVideo() {
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('video-file');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status');

    if (!fileInput.files[0]) {
        showNotification('Sélectionnez un fichier', 'error');
        return;
    }

    const formData = new FormData(form);
    console.log('[admin-ui] Upload video request', {
        category: formData.get('category'),
        subcategory: formData.get('subcategory'),
        file: fileInput.files[0]?.name
    });

    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = 'Upload en cours...';

    try {
        const response = await fetch('/api/videos/upload', {
            method: 'POST',
            body: formData
        });

        console.log('[admin-ui] POST /api/videos/upload -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/videos/upload payload', data);

        if (data.success) {
            progressBar.style.width = '100%';
            statusText.textContent = 'Upload terminé !';
            showNotification('Vidéo uploadée avec succès', 'success');
            form.reset();
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
    // Simple alert for now - could be enhanced with toast notifications
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    alert(`${icons[type]} ${message}`);
}
