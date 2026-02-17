// ============================================================================
// MODULE: Sponsors — Gestion des sponsors locaux
// ============================================================================

/**
 * Charge et affiche la liste des sponsors (locaux + NEOPRO).
 */
async function loadSponsors() {
    const container = document.getElementById('sponsors-list');
    if (!container) return;

    container.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        const response = await fetch('/api/sponsors');
        if (!response.ok) throw new Error('Erreur HTTP ' + response.status);

        const { sponsors } = await response.json();
        renderSponsorsList(container, sponsors);
    } catch (error) {
        console.error('[sponsors] Erreur:', error);
        container.innerHTML = '<div class="error-message">Erreur lors du chargement des sponsors.</div>';
    }
}

/**
 * Rend la liste des sponsors dans le container.
 */
function renderSponsorsList(container, sponsors) {
    if (!sponsors || sponsors.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: var(--neo-text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">🤝</div>
                <h3>Aucun sponsor</h3>
                <p>Ajoutez votre premier sponsor local pour commencer.</p>
            </div>
        `;
        return;
    }

    const localSponsors = sponsors.filter(s => s.source === 'local');
    const neoProSponsors = sponsors.filter(s => s.source === 'neopro');

    let html = '';

    if (localSponsors.length > 0) {
        html += '<div class="cards-grid">';
        for (const sponsor of localSponsors) {
            html += renderSponsorCard(sponsor);
        }
        html += '</div>';
    }

    if (neoProSponsors.length > 0) {
        html += `
            <h3 style="margin-top: 24px; color: var(--neo-text-secondary); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
                Sponsors NEOPRO (lecture seule)
            </h3>
            <div class="cards-grid">
        `;
        for (const sponsor of neoProSponsors) {
            html += renderNeoProSponsorCard(sponsor);
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Rend une carte pour un sponsor local.
 */
function renderSponsorCard(sponsor) {
    const videoCount = (sponsor.videoFilenames || []).length;
    const syncBadge = sponsor.centralId
        ? '<span class="badge badge-success" title="Synchronisé avec le central">✓ Sync</span>'
        : '<span class="badge badge-warning" title="En attente de synchronisation">⏳ Sync</span>';

    const loopBadge = sponsor.inLoop
        ? '<span class="badge badge-success">▶ Boucle</span>'
        : '<span class="badge badge-muted">⏸ Hors boucle</span>';

    const activeBadge = sponsor.isActive
        ? ''
        : '<span class="badge badge-danger">Inactif</span>';

    return `
        <div class="card sponsor-card" data-local-id="${sponsor.localId}">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px;">${escapeHtml(sponsor.name)}</h3>
                <div style="display: flex; gap: 4px;">
                    ${syncBadge}
                    ${loopBadge}
                    ${activeBadge}
                </div>
            </div>
            <div class="card-body">
                <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 14px; color: var(--neo-text-secondary);">
                    <span>🎬 ${videoCount} vidéo${videoCount !== 1 ? 's' : ''}</span>
                    ${sponsor.contactEmail ? '<span>✉ ' + escapeHtml(sponsor.contactEmail) + '</span>' : ''}
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-small" onclick="openSponsorModal('${sponsor.localId}')">
                        ✏️ Modifier
                    </button>
                    <button class="btn btn-small ${sponsor.inLoop ? 'btn-warning' : 'btn-success'}"
                            onclick="toggleSponsorLoop('${sponsor.localId}', ${sponsor.inLoop})">
                        ${sponsor.inLoop ? '⏸ Retirer boucle' : '▶ Ajouter boucle'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="confirmDeleteSponsor('${sponsor.localId}', '${escapeHtml(sponsor.name)}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Rend une carte pour un sponsor NEOPRO (lecture seule).
 */
function renderNeoProSponsorCard(sponsor) {
    const videoCount = (sponsor.videoFilenames || []).length;
    return `
        <div class="card sponsor-card" style="opacity: 0.7;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px;">${escapeHtml(sponsor.name)}</h3>
                <span class="badge badge-info">🔒 NEOPRO</span>
            </div>
            <div class="card-body">
                <div style="font-size: 14px; color: var(--neo-text-secondary);">
                    <span>🎬 ${videoCount} vidéo${videoCount !== 1 ? 's' : ''}</span>
                    <span style="margin-left: 8px;">▶ Boucle active</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Ouvre le modal de création/édition de sponsor.
 */
async function openSponsorModal(localId) {
    const modal = document.getElementById('sponsor-modal');
    const title = document.getElementById('sponsor-modal-title');
    const editIdInput = document.getElementById('sponsor-edit-id');
    const nameInput = document.getElementById('sponsor-name');
    const emailInput = document.getElementById('sponsor-email');
    const phoneInput = document.getElementById('sponsor-phone');
    const videosSelect = document.getElementById('sponsor-videos');
    const loopCheckbox = document.getElementById('sponsor-add-to-loop');

    // Peupler le select de vidéos
    await populateSponsorVideoSelect(videosSelect, []);

    if (localId) {
        // Mode édition
        title.textContent = 'Modifier le sponsor';
        try {
            const response = await fetch('/api/sponsors/' + localId);
            if (!response.ok) throw new Error('Erreur');
            const { sponsor } = await response.json();

            editIdInput.value = localId;
            nameInput.value = sponsor.name || '';
            emailInput.value = sponsor.contactEmail || '';
            phoneInput.value = sponsor.contactPhone || '';
            loopCheckbox.checked = sponsor.inLoop;

            // Sélectionner les vidéos liées
            await populateSponsorVideoSelect(videosSelect, sponsor.videoFilenames || []);
        } catch (error) {
            console.error('[sponsors] Erreur chargement sponsor:', error);
            return;
        }
    } else {
        // Mode création
        title.textContent = 'Ajouter un sponsor';
        editIdInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        phoneInput.value = '';
        loopCheckbox.checked = true;
    }

    modal.style.display = 'flex';
    nameInput.focus();
}

/**
 * Ferme le modal sponsor.
 */
function closeSponsorModal() {
    const modal = document.getElementById('sponsor-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Sauvegarde le sponsor (création ou mise à jour).
 */
async function saveSponsor() {
    const editId = document.getElementById('sponsor-edit-id').value;
    const name = document.getElementById('sponsor-name').value.trim();
    const contactEmail = document.getElementById('sponsor-email').value.trim();
    const contactPhone = document.getElementById('sponsor-phone').value.trim();
    const videosSelect = document.getElementById('sponsor-videos');
    const addToLoop = document.getElementById('sponsor-add-to-loop').checked;

    if (!name) {
        showNotification('Le nom du sponsor est requis', 'error');
        return;
    }

    const selectedVideos = Array.from(videosSelect.selectedOptions).map(o => o.value);

    try {
        let sponsor;

        if (editId) {
            // Mise à jour
            const response = await fetch('/api/sponsors/' + editId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la mise à jour');
            }
            const result = await response.json();
            sponsor = result.sponsor;

            // Synchroniser les vidéos liées
            await syncSponsorVideos(editId, selectedVideos);

            // Gérer la boucle
            if (addToLoop && !sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'POST' });
            } else if (!addToLoop && sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'DELETE' });
            }

            showNotification('Sponsor mis à jour', 'success');
        } else {
            // Création
            const response = await fetch('/api/sponsors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la création');
            }
            const result = await response.json();
            sponsor = result.sponsor;

            // Lier les vidéos sélectionnées
            for (const filename of selectedVideos) {
                await fetch('/api/sponsors/' + sponsor.localId + '/videos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename }),
                });
            }

            // Ajouter à la boucle si demandé
            if (addToLoop && selectedVideos.length > 0) {
                await fetch('/api/sponsors/' + sponsor.localId + '/loop', { method: 'POST' });
            }

            showNotification('Sponsor créé', 'success');
        }

        closeSponsorModal();
        loadSponsors();
    } catch (error) {
        console.error('[sponsors] Erreur sauvegarde:', error);
        showNotification(error.message, 'error');
    }
}

/**
 * Synchronise les vidéos liées à un sponsor (ajoute/retire).
 */
async function syncSponsorVideos(localId, newVideoFilenames) {
    try {
        const response = await fetch('/api/sponsors/' + localId);
        if (!response.ok) return;
        const { sponsor } = await response.json();
        const currentVideos = sponsor.videoFilenames || [];

        // Vidéos à ajouter
        const toAdd = newVideoFilenames.filter(f => !currentVideos.includes(f));
        // Vidéos à retirer
        const toRemove = currentVideos.filter(f => !newVideoFilenames.includes(f));

        for (const filename of toAdd) {
            await fetch('/api/sponsors/' + localId + '/videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename }),
            });
        }

        for (const filename of toRemove) {
            await fetch('/api/sponsors/' + localId + '/videos/' + encodeURIComponent(filename), {
                method: 'DELETE',
            });
        }
    } catch (error) {
        console.error('[sponsors] Erreur sync vidéos:', error);
    }
}

/**
 * Peuple le select de vidéos avec les fichiers disponibles.
 */
async function populateSponsorVideoSelect(selectEl, selectedFilenames) {
    if (!selectEl) return;

    selectEl.innerHTML = '';

    try {
        const response = await fetch('/api/videos');
        if (!response.ok) return;
        const { videos } = await response.json();

        for (const video of (videos || [])) {
            const option = document.createElement('option');
            option.value = video.name;
            option.textContent = video.displayName || video.name;
            if (selectedFilenames.includes(video.name)) {
                option.selected = true;
            }
            selectEl.appendChild(option);
        }
    } catch (error) {
        console.error('[sponsors] Erreur chargement vidéos:', error);
    }
}

/**
 * Ouvre le modal de confirmation de suppression.
 */
function confirmDeleteSponsor(localId, name) {
    const modal = document.getElementById('sponsor-delete-modal');
    const nameEl = document.getElementById('sponsor-delete-name');
    const confirmBtn = document.getElementById('sponsor-delete-confirm-btn');

    nameEl.textContent = name;
    confirmBtn.onclick = async () => {
        try {
            const response = await fetch('/api/sponsors/' + localId, { method: 'DELETE' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur');
            }
            closeSponsorDeleteModal();
            showNotification('Sponsor supprimé', 'success');
            loadSponsors();
        } catch (error) {
            console.error('[sponsors] Erreur suppression:', error);
            showNotification(error.message, 'error');
        }
    };

    modal.style.display = 'flex';
}

/**
 * Ferme le modal de suppression.
 */
function closeSponsorDeleteModal() {
    const modal = document.getElementById('sponsor-delete-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Toggle l'état boucle d'un sponsor.
 */
async function toggleSponsorLoop(localId, currentlyInLoop) {
    try {
        const method = currentlyInLoop ? 'DELETE' : 'POST';
        const response = await fetch('/api/sponsors/' + localId + '/loop', { method });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Erreur');
        }

        const action = currentlyInLoop ? 'retiré de' : 'ajouté à';
        showNotification('Sponsor ' + action + ' la boucle', 'success');
        loadSponsors();
    } catch (error) {
        console.error('[sponsors] Erreur toggle boucle:', error);
        showNotification(error.message, 'error');
    }
}

// escapeHtml is defined globally in modules/upload/index.js
