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
