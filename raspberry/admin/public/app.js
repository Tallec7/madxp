/**
 * Neopro Admin Panel - JavaScript
 */

// État global
let currentTab = 'dashboard';
let currentLogService = 'app';
let refreshInterval = null;
let cachedVideos = [];

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

        cachedVideos = Array.isArray(data) ? data : (data.videos || []);

        const list = document.getElementById('videos-list');
        if (!list) {
            return;
        }
        list.innerHTML = '';

        if (cachedVideos.length === 0) {
            list.innerHTML = '<p class="video-empty-state">Aucune vidéo trouvée</p>';
            return;
        }

        const groupedVideos = groupVideosByCategory(cachedVideos);
        renderVideoGroups(list, groupedVideos);
        updateVideoSuggestions(cachedVideos);
    } catch (error) {
        console.error('Error loading videos:', error);
    }
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

    const editForm = document.getElementById('edit-video-form');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitVideoEdition();
        });
    }
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
    document.getElementById('edit-display-name').value = video.displayName || formatVideoName(video.name);
    document.getElementById('edit-filename').value = video.name;

    const { categoryLabel, subcategoryLabel } = parseVideoCategory(video);
    document.getElementById('edit-category').value = categoryLabel || '';
    document.getElementById('edit-subcategory').value = subcategoryLabel || '';

    const pathLabel = document.getElementById('edit-current-path');
    if (pathLabel) {
        pathLabel.textContent = `Chemin actuel : videos/${video.path}`;
    }

    modal.classList.add('active');
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
    const category = document.getElementById('edit-category').value.trim();
    const subcategory = document.getElementById('edit-subcategory').value.trim();
    const displayName = document.getElementById('edit-display-name').value.trim();
    const filename = document.getElementById('edit-filename').value.trim();

    if (!originalPath || !category || !filename) {
        showNotification('Catégorie et nom de fichier requis', 'error');
        return;
    }

    try {
        const response = await fetch('/api/videos/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originalPath,
                categoryId: category,
                subcategoryId: subcategory,
                displayName,
                newFilename: filename
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Vidéo mise à jour', 'success');
            closeEditModal();
            loadVideos();
        } else {
            showNotification('Erreur: ' + (data.error || 'Impossible de modifier la vidéo'), 'error');
        }
    } catch (error) {
        console.error('Error editing video:', error);
        showNotification('Erreur lors de la modification', 'error');
    }
}
