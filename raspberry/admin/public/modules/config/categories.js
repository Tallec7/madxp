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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
}
