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
                <div class="orphan-path tech-only">videos/${video.path}</div>
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
            } catch (_error) {
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
    } catch (_error) {
        showNotification('Erreur lors de l\'ajout groupé', 'error');
    }
}
