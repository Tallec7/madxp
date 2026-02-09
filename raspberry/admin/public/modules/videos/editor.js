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
