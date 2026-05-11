// ============================================================================
// Profils multi-clubs — switch offline
// ============================================================================

/**
 * Charge et affiche la liste des profils disponibles sur ce Pi.
 * Affiche le bouton de navigation seulement si >1 profil.
 */
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        if (!response.ok) {
            renderProfilesError('Impossible de charger les profils');
            return;
        }
        const data = await response.json();
        const profiles = data.profiles || [];

        // Afficher l'onglet nav uniquement si >1 profil (multi-clubs)
        const navBtn = document.getElementById('nav-profiles-btn');
        if (navBtn) {
            navBtn.style.display = profiles.length > 1 ? '' : 'none';
        }

        renderActiveProfileCard(profiles);
        renderProfilesList(profiles);
    } catch (error) {
        console.error('[admin-ui] Erreur chargement profils:', error);
        renderProfilesError('Erreur de connexion');
    }
}

/**
 * Affiche la carte du profil actif dans le dashboard et dans l'onglet Profils.
 */
function renderActiveProfileCard(profiles) {
    const active = profiles.find((p) => p.isActive);
    const body = document.getElementById('profiles-active-body');
    if (!body) return;

    if (!active) {
        body.innerHTML = '<span style="opacity:0.6">Aucun profil actif</span>';
        return;
    }

    body.innerHTML = `
        <div class="metric">
            <span class="metric-label">Club</span>
            <strong class="metric-value">${escapeHtml(active.name)}</strong>
        </div>
        ${active.city ? `<div class="metric"><span class="metric-label">Ville</span><span class="metric-value">${escapeHtml(active.city)}</span></div>` : ''}
        ${active.sport ? `<div class="metric"><span class="metric-label">Sport</span><span class="metric-value">${escapeHtml(active.sport)}</span></div>` : ''}
    `;
}

/**
 * Affiche la liste des profils avec boutons de switch.
 */
function renderProfilesList(profiles) {
    const body = document.getElementById('profiles-list-body');
    if (!body) return;

    if (profiles.length === 0) {
        body.innerHTML = '<p style="opacity:0.6;font-size:13px">Aucun profil disponible. Ce Pi n\'a pas encore reçu de sync depuis le cloud.</p>';
        return;
    }

    const items = profiles.map((p) => `
        <div class="service-control-item" style="align-items:center;gap:12px" id="profile-item-${escapeHtml(p.id)}">
            <div style="flex:1">
                <strong>${escapeHtml(p.name)}</strong>
                ${p.city ? `<span style="opacity:0.6;font-size:12px;margin-left:8px">${escapeHtml(p.city)}</span>` : ''}
                ${p.sport ? `<span style="opacity:0.6;font-size:12px;margin-left:4px">· ${escapeHtml(p.sport)}</span>` : ''}
            </div>
            ${p.isActive
                ? '<span class="badge badge-success" style="flex-shrink:0">Actif</span>'
                : `<button class="btn btn-primary" style="flex-shrink:0" onclick="switchProfile('${escapeHtml(p.id)}')">Activer</button>`
            }
        </div>
    `).join('');

    body.innerHTML = `<div class="services-control">${items}</div>`;
}

/**
 * Active un profil localement (offline-safe).
 * @param {string} profileId
 */
async function switchProfile(profileId) {
    const btn = document.querySelector(`#profile-item-${CSS.escape(profileId)} button`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = '…';
    }

    try {
        const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/switch`, {
            method: 'POST',
            headers: { 'X-CSRF-Token': getCsrfToken() },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Erreur lors du switch de profil', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Activer';
            }
            return;
        }

        showNotification('Profil activé. Redémarrez le kiosk pour appliquer les changements.', 'success');
        // Recharger la liste pour mettre à jour les badges
        await loadProfiles();
    } catch (error) {
        console.error('[admin-ui] Erreur switch profil:', error);
        showNotification('Erreur de connexion', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Activer';
        }
    }
}

function renderProfilesError(message) {
    const body = document.getElementById('profiles-list-body');
    if (body) {
        body.innerHTML = `<p style="color:var(--neo-danger,#ef4444)">${escapeHtml(message)}</p>`;
    }
}

// getCsrfToken, escapeHtml, showNotification sont définis globalement dans d'autres modules.
