/**
 * Neopro Admin Panel - JavaScript
 */

// État global
let currentTab = 'dashboard';
let currentLogService = 'app';
let refreshInterval = null;
let cachedVideos = []; // Toutes les vidéos (config + orphelines)
let cachedOrphanVideos = []; // Vidéos orphelines uniquement
let cachedConfig = null;
let cachedTimeCategories = [];
let availableCategories = [];

// Bulk selection state
let selectedVideos = new Set();
let bulkModeEnabled = false;

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSubNavigation();
    initForms();
    initLogButtons();
    updateTime();
    loadDashboard();

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

/**
 * Peuple les selects de catégories avec les données de la configuration
 */
function populateCategorySelects() {
    const categorySelect = document.getElementById('video-category');
    if (!categorySelect || !cachedConfig) {
        return;
    }

    const categories = cachedConfig.categories || [];

    // Vider et repeupler le select
    categorySelect.innerHTML = '<option value="">-- Sélectionner --</option>';

    categories.forEach(cat => {
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

function renderConfigurationStructure(container, config) {
    const categories = config.categories || [];

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = '<h3>📁 Configuration télécommande</h3>';
    container.appendChild(header);

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'config-empty';
        empty.innerHTML = '<p class="video-empty-state">Aucune catégorie configurée</p>';
        container.appendChild(empty);
        return;
    }

    categories.forEach(category => {
        const groupEl = document.createElement('div');
        groupEl.className = 'video-group config-group';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'video-group-header';

        const videoCount = countVideosInCategory(category);
        const subCount = (category.subCategories || []).length;

        categoryHeader.innerHTML = `
            <div>
                <h4>${category.name || category.id || 'Sans nom'}</h4>
                <span class="video-count">${videoCount} vidéo(s)${subCount > 0 ? ` · ${subCount} sous-cat.` : ''}</span>
            </div>
        `;
        groupEl.appendChild(categoryHeader);

        const body = document.createElement('div');
        body.className = 'video-subgroups';

        // Vidéos directes de la catégorie
        if (category.videos && category.videos.length > 0) {
            body.appendChild(createConfigVideoList('Vidéos directes', category.videos, category.id, null));
        }

        // Sous-catégories
        (category.subCategories || []).forEach(subcat => {
            if (subcat.videos && subcat.videos.length > 0) {
                body.appendChild(createConfigVideoList(subcat.name || subcat.id, subcat.videos, category.id, subcat.id));
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

function createConfigVideoList(title, videos, categoryId, subcategoryId = null) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-subgroup';

    const header = document.createElement('div');
    header.className = 'video-subgroup-header';
    header.innerHTML = `
        <h5>${title}</h5>
        <span class="video-count">${videos.length} vidéo(s)</span>
    `;
    wrapper.appendChild(header);

    const list = document.createElement('div');
    list.className = 'video-rows';
    list.dataset.categoryId = categoryId;
    list.dataset.subcategoryId = subcategoryId || '';

    // Add drop zone listeners for drag & drop
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('drop', handleDrop);
    list.addEventListener('dragleave', handleDragLeave);

    // Empty state placeholder for drop zone
    if (videos.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'video-empty-drop-zone';
        emptyState.innerHTML = `
            <span class="empty-icon">📁</span>
            <span class="empty-text">Aucune vidéo - Glissez une vidéo ici</span>
        `;
        list.appendChild(emptyState);
    }

    videos.forEach((video, index) => {
        const row = document.createElement('div');
        row.className = 'video-row';
        row.draggable = true;
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
            configSubcategory: subcategoryId
        };

        // Ajouter au cache global pour l'édition
        if (!cachedVideos.find(v => v.path === videoData.path)) {
            cachedVideos.push(videoData);
        }

        // URL de la vidéo pour prévisualisation
        const videoUrl = video.path ? `/${video.path}` : '';

        row.innerHTML = `
            <div class="video-row-checkbox">
                <input type="checkbox" class="video-select-checkbox" data-path="${video.path}" ${selectedVideos.has(video.path) ? 'checked' : ''}>
            </div>
            <div class="video-row-drag-handle" title="Glisser pour réorganiser">⋮⋮</div>
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
                <button class="btn btn-secondary btn-sm edit-video-btn" data-path="${video.path}">✏️</button>
                <button class="btn btn-danger btn-sm delete-video-btn" data-path="${video.path}" data-category="${categoryId}" data-subcategory="${subcategoryId || ''}">🗑️</button>
            </div>
        `;

        // Drag & drop event listeners
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragend', handleDragEnd);

        // Ajouter les event listeners
        const checkbox = row.querySelector('.video-select-checkbox');
        const thumbnail = row.querySelector('.video-thumbnail');
        const previewBtn = row.querySelector('.preview-video-btn');
        const editBtn = row.querySelector('.edit-video-btn');
        const deleteBtn = row.querySelector('.delete-video-btn');

        checkbox.addEventListener('change', (e) => handleVideoSelection(e, video.path));
        thumbnail.addEventListener('click', () => openVideoPreview(videoUrl, video.name));
        previewBtn.addEventListener('click', () => openVideoPreview(videoUrl, video.name));
        editBtn.addEventListener('click', () => openEditModal(video.path));
        deleteBtn.addEventListener('click', () => deleteConfigVideo(video.path, categoryId, subcategoryId));

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
 */
function populateEditCategorySelect(selectedCategoryId) {
    const categorySelect = document.getElementById('edit-category');
    const subcategorySelect = document.getElementById('edit-subcategory');

    if (!categorySelect || !cachedConfig?.categories) {
        return;
    }

    // Peupler les catégories
    categorySelect.innerHTML = '<option value="">-- Sélectionner --</option>';
    cachedConfig.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
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

    if (cachedCategoriesForManager.length === 0) {
        container.innerHTML = '<div class="no-categories">Aucune catégorie. Cliquez sur "Nouvelle catégorie" pour commencer.</div>';
        return;
    }

    cachedCategoriesForManager.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item';
        item.dataset.index = index;

        const subCategories = cat.subCategories || [];
        const videoCount = (cat.videos?.length || 0) + subCategories.reduce((sum, sub) => sum + (sub.videos?.length || 0), 0);

        const subCategoriesHtml = subCategories.map((sub, subIndex) => `
            <span class="subcategory-tag">
                ${sub.name}
                <span class="video-count">(${sub.videos?.length || 0})</span>
                <button class="delete-sub" onclick="deleteSubCategory('${cat.id}', ${subIndex})" title="Supprimer">×</button>
            </span>
        `).join('');

        item.innerHTML = `
            <div class="category-header">
                <div class="category-info">
                    <strong>${cat.name}</strong>
                    <span class="category-id">${cat.id}</span>
                    <span class="video-count">${videoCount} vidéo${videoCount > 1 ? 's' : ''}</span>
                </div>
                <div class="category-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editCategory(${index})">✏️ Modifier</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}')">🗑️</button>
                </div>
            </div>
            <div class="subcategories-section">
                <div class="subcategories-header">
                    <span>Sous-catégories</span>
                </div>
                <div class="subcategories-list">
                    ${subCategoriesHtml}
                    <button class="add-subcategory-btn" onclick="addSubCategory('${cat.id}')">+ Ajouter</button>
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
