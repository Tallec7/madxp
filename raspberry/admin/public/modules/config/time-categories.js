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

        await renderTimeCategories();
    } catch (error) {
        console.error('Erreur lors du chargement des timeCategories:', error);
    }
}

function refreshTimeCategories() {
    loadTimeCategories();
}

async function renderTimeCategories() {
    const container = document.getElementById('time-categories-list');
    if (!container) return;

    // Fetch phase recap (loopVideos per phase)
    let phaseRecapMap = {};
    try {
        const recapResp = await fetch('/api/configuration/phase-recap');
        if (recapResp.ok) {
            const recapData = await recapResp.json();
            (recapData.phases || []).forEach(p => {
                phaseRecapMap[p.id] = p;
            });
        }
    } catch (err) {
        console.warn('[time-categories] Could not load phase recap:', err);
    }

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

        // Build loopVideos section from phase recap
        const recap = phaseRecapMap[tc.id];
        let loopVideosHtml = '';
        if (recap && recap.loopVideos && recap.loopVideos.length > 0) {
            // Group by sponsor name for cleaner display
            const byName = {};
            recap.loopVideos.forEach((v, vIdx) => {
                const name = v.sponsorName || 'Sponsor';
                if (!byName[name]) byName[name] = [];
                byName[name].push(vIdx);
            });
            const pills = Object.entries(byName).map(([name, indices]) => {
                const count = indices.length > 1 ? ` (×${indices.length})` : '';
                // Remove all entries for this sponsor (highest index first to avoid shift)
                const sortedIndices = [...indices].sort((a, b) => b - a);
                const removeCall = sortedIndices.map(i => `removeLoopVideo('${tc.id}', ${i})`).join('; ');
                return `<span class="phase-sponsor-pill">
                    <span class="pill-name">${escapeHtml(name)}${count}</span>
                    <button class="pill-remove" onclick="event.stopPropagation(); ${removeCall}" title="Retirer ${escapeHtml(name)} de cette phase">&times;</button>
                </span>`;
            }).join('');
            loopVideosHtml = `
                <div class="phase-sponsors-section">
                    <span class="phase-sponsors-label">🎬 Sponsors boucle <span class="phase-sponsors-count">${recap.loopVideoCount}</span></span>
                    <div class="phase-sponsors-pills">${pills}</div>
                </div>`;
        } else {
            loopVideosHtml = `
                <div class="phase-sponsors-section phase-sponsors-empty">
                    <span class="phase-sponsors-label">🎬 Sponsors boucle</span>
                    <span class="phase-sponsors-none">Aucun sponsor assigné</span>
                </div>`;
        }

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
            ${loopVideosHtml}
        `;

        container.appendChild(item);
    });

    if (cachedTimeCategories.length === 0) {
        container.innerHTML = '<p class="info-text">Aucun bloc temps configuré. Cliquez sur "Ajouter un bloc temps" pour commencer.</p>';
    }
}

/**
 * Retirer une vidéo sponsor d'une phase (par index dans loopVideos)
 */
async function removeLoopVideo(phaseId, videoIndex) {
    if (!confirm('Retirer cette vidéo sponsor de la phase ?')) return;

    try {
        const response = await fetch(`/api/configuration/phase-recap/${phaseId}/loop-videos/${videoIndex}`, {
            method: 'DELETE',
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Vidéo retirée de la phase', 'success');
            renderTimeCategories();
        } else {
            showNotification('Erreur: ' + (data.error || 'Inconnue'), 'error');
        }
    } catch (error) {
        console.error('[time-categories] Erreur suppression loopVideo:', error);
        showNotification('Erreur lors de la suppression', 'error');
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
