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

        // Afficher le skeleton pendant le chargement
        const list = document.getElementById('videos-list');
        if (list) {
            list.innerHTML = `
                <div class="skeleton-row"><div class="skeleton skeleton-card"></div></div>
                <div class="skeleton-row"><div class="skeleton skeleton-card"></div></div>
                <div class="skeleton-row"><div class="skeleton skeleton-card"></div></div>
            `;
        }

        // Charger la configuration ET les vidéos orphelines en parallèle
        const [configResponse, orphansResponse] = await Promise.all([
            fetch('/api/configuration'),
            fetch('/api/videos/orphans')
        ]);

        const config = configResponse.ok ? await configResponse.json() : { categories: [] };
        const orphansData = orphansResponse.ok ? await orphansResponse.json() : { orphans: [] };

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

    // Wrapper carte pour séparer visuellement de la recherche
    const configWrapper = document.createElement('div');
    configWrapper.className = 'config-section-wrapper';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = '<h3>📁 Configuration télécommande</h3>';
    configWrapper.appendChild(header);

    // Message d'info sur le contenu verrouillé si présent
    const hasLockedContent = categories.some(cat => isLocked(cat));
    if (hasLockedContent) {
        const infoMsg = document.createElement('div');
        infoMsg.className = 'locked-info-message';
        infoMsg.innerHTML = `
            <span class="info-icon">🔒</span>
            <span>Les éléments avec un cadenas sont gérés par NEOPRO et ne peuvent pas être modifiés.</span>
        `;
        configWrapper.appendChild(infoMsg);
    }

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <div class="empty-state-icon">📁</div>
            <div class="empty-state-title">Aucune catégorie configurée</div>
            <div class="empty-state-text">La configuration vidéo n'a pas encore été initialisée depuis le dashboard central.</div>
        `;
        configWrapper.appendChild(empty);
        container.appendChild(configWrapper);
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
            const _subcatLocked = categoryLocked || isLocked(subcat);  
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
        configWrapper.appendChild(groupEl);
    });

    container.appendChild(configWrapper);
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
        row.tabIndex = 0;
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', video.name || video.path?.split('/').pop() || 'Vidéo');
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
                <div class="video-row-path tech-only">${video.path || ''}</div>
                ${video.duration ? `<div class="video-row-meta">${formatDuration(video.duration)}</div>` : ''}
            </div>
            <div class="video-row-actions">
                <button class="btn btn-secondary btn-sm preview-video-btn" data-video-url="${videoUrl}" title="Prévisualiser" aria-label="Prévisualiser la vidéo">👁️ Voir</button>
                <button class="btn btn-secondary btn-sm edit-video-btn${lockedBtnClass}" data-path="${video.path}" ${videoLocked ? 'disabled title="Contenu NEOPRO - Non modifiable"' : 'title="Modifier"'} aria-label="Modifier la vidéo">✏️ Modifier</button>
                <button class="btn btn-warning btn-sm remove-video-btn${lockedBtnClass}" data-path="${video.path}" ${videoLocked ? 'disabled title="Contenu NEOPRO - Non modifiable"' : ''} title="Retirer de la configuration" aria-label="Retirer de la configuration">✕ Retirer</button>
                <button class="btn btn-danger btn-sm delete-video-btn${lockedBtnClass}" data-path="${video.path}" data-category="${categoryId}" data-subcategory="${subcategoryId || ''}" ${videoLocked ? 'disabled title="Contenu NEOPRO - Non supprimable"' : ''} title="Supprimer le fichier" aria-label="Supprimer le fichier">🗑️ Suppr.</button>
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
        const removeBtn = row.querySelector('.remove-video-btn');
        const deleteBtn = row.querySelector('.delete-video-btn');

        // La sélection et prévisualisation sont toujours permises
        if (!videoLocked) {
            checkbox.addEventListener('change', (e) => handleVideoSelection(e, video.path));
        }
        thumbnail.addEventListener('click', () => openVideoPreview(videoUrl, video.name));
        previewBtn.addEventListener('click', () => openVideoPreview(videoUrl, video.name));

        // Édition, retrait et suppression uniquement si non verrouillé
        if (!videoLocked) {
            editBtn.addEventListener('click', () => openEditModal(video.path));
            removeBtn.addEventListener('click', () => removeConfigVideo(video.path));
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
    row.tabIndex = 0;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', video.displayLabel || video.name || 'Vidéo');

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
    pathInfo.className = 'video-row-path tech-only';
    pathInfo.textContent = video.fullPath;

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(pathInfo);

    const actions = document.createElement('div');
    actions.className = 'video-row-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.textContent = '✏️ Modifier';
    editBtn.setAttribute('aria-label', 'Modifier la vidéo');
    editBtn.addEventListener('click', () => openEditModal(video.path));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.textContent = '🗑️ Supprimer';
    deleteBtn.setAttribute('aria-label', 'Supprimer le fichier');
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
    openVideoDeleteModal(filename, 'Le fichier sera supprimé définitivement.', async () => {
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
        } catch (_error) {
            showNotification('Erreur lors de la suppression', 'error');
        }
    });
}

/**
 * Retirer une vidéo de la configuration (fichier reste sur disque)
 */
async function removeConfigVideo(videoPath) {
    const video = cachedVideos.find(v => v.path === videoPath);
    const videoName = video?.displayName || videoPath.split('/').pop();

    openVideoDeleteModal(videoName, 'Le fichier restera sur le disque.', async () => {
        try {
            const response = await fetch('/api/videos/remove-from-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoPath })
            });

            const data = await response.json();

            if (data.success) {
                showNotification('Vidéo retirée de la configuration', 'success');
                await loadConfiguration();
                loadVideos();
            } else {
                showNotification('Erreur: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error removing video from config:', error);
            showNotification('Erreur lors du retrait', 'error');
        }
    });
}

/**
 * Supprimer une vidéo de la configuration
 */
async function deleteConfigVideo(videoPath, categoryId, subcategoryId) {
    const video = cachedVideos.find(v => v.path === videoPath);
    const videoName = video?.displayName || videoPath.split('/').pop();

    openVideoDeleteModal(videoName, 'Cette action supprimera le fichier du disque.', async () => {
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
    });
}

/**
 * Ouvre la modale de confirmation de suppression vidéo
 */
let _videoDeleteEscapeHandler = null;

function openVideoDeleteModal(videoName, warningText, onConfirm) {
    const modal = document.getElementById('video-delete-modal');
    const nameEl = document.getElementById('video-delete-name');
    const warningEl = document.getElementById('video-delete-warning');
    const confirmBtn = document.getElementById('video-delete-confirm-btn');

    nameEl.textContent = videoName;
    warningEl.textContent = warningText;
    confirmBtn.onclick = async () => {
        closeVideoDeleteModal();
        await onConfirm();
    };

    _videoDeleteEscapeHandler = (e) => {
        if (e.key === 'Escape') closeVideoDeleteModal();
    };
    document.addEventListener('keydown', _videoDeleteEscapeHandler);

    modal.style.display = 'flex';
}

function closeVideoDeleteModal() {
    const modal = document.getElementById('video-delete-modal');
    modal.style.display = 'none';
    if (_videoDeleteEscapeHandler) {
        document.removeEventListener('keydown', _videoDeleteEscapeHandler);
        _videoDeleteEscapeHandler = null;
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

    const searchHint = document.querySelector('.search-hint');

    // Si pas de terme de recherche, tout afficher
    if (!searchTerm) {
        videoRows.forEach(row => row.style.display = '');
        videoSubgroups.forEach(sg => sg.style.display = '');
        videoGroups.forEach(g => g.style.display = '');
        if (searchHint) {
            searchHint.textContent = 'Filtre les vidéos ci-dessous';
            searchHint.classList.remove('no-results');
        }
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

    // Feedback compteur
    if (searchHint) {
        const visibleCount = document.querySelectorAll('#videos-list .video-row:not([style*="display: none"])').length;
        if (visibleCount === 0) {
            searchHint.textContent = 'Aucune vidéo trouvée';
            searchHint.classList.add('no-results');
        } else {
            searchHint.textContent = `${visibleCount} vidéo(s) trouvée(s)`;
            searchHint.classList.remove('no-results');
        }
    }
}
