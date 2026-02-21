// ============================================================================
// MODULE: Sponsors — Gestion des sponsors locaux
// ============================================================================

// ============================================================================
// SPONSOR STATS — Statistiques locales des passages sponsors
// ============================================================================

/**
 * Charge et affiche les statistiques sponsors depuis les buffers locaux.
 */
async function loadSponsorStats() {
    const container = document.getElementById('sponsor-stats-container');
    if (!container) return;

    try {
        const response = await fetch('/api/sponsors/stats?days=30');
        if (!response.ok) throw new Error('Erreur HTTP ' + response.status);

        const data = await response.json();
        renderSponsorStats(container, data);
    } catch (error) {
        console.error('[sponsors] Erreur stats:', error);
        container.innerHTML = '';
    }
}

/**
 * Affiche les stats : KPI cards + tableau par sponsor + mini chart.
 */
function renderSponsorStats(container, data) {
    const { summary, sponsors, daily } = data;

    if (summary.total_impressions === 0) {
        container.innerHTML = `
            <div class="card" style="padding: 20px; text-align: center; color: var(--neo-text-secondary); margin-bottom: 16px;">
                <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
                <p style="margin: 0; font-size: 14px;">
                    Aucune impression sponsor enregistrée pour le moment.<br>
                    Les stats apparaîtront ici dès que des vidéos sponsors seront diffusées.
                </p>
            </div>
        `;
        return;
    }

    let html = '';

    // KPI Cards
    html += '<div class="sponsor-stats-kpis">';
    html += renderKpiCard('📺', summary.total_impressions, 'Passages');
    html += renderKpiCard('⏱️', formatScreenTime(summary.total_screen_time_seconds), 'Temps écran');
    html += renderKpiCard('✅', summary.avg_completion_rate + '%', 'Complétion');
    html += renderKpiCard('📅', summary.active_days, 'Jours actifs');
    html += '</div>';

    // Mini chart (barres quotidiennes)
    if (daily && daily.length > 0) {
        html += renderDailyBars(daily);
    }

    // Tableau par sponsor
    if (sponsors && sponsors.length > 0) {
        html += '<div class="card" style="padding: 16px; margin-top: 12px;">';
        html += '<h4 style="margin: 0 0 12px; font-size: 14px; color: var(--neo-text-secondary); text-transform: uppercase; letter-spacing: 1px;">Détail par sponsor</h4>';
        html += '<table class="sponsor-stats-table">';
        html += '<thead><tr><th>Sponsor</th><th>Passages</th><th>Temps</th><th>Complétion</th></tr></thead>';
        html += '<tbody>';

        for (const s of sponsors) {
            const sourceBadge = s.source === 'neopro'
                ? '<span class="badge badge-info" style="font-size: 10px; margin-left: 4px;">NEOPRO</span>'
                : '';
            html += `<tr>
                <td><strong>${escapeHtml(s.name)}</strong>${sourceBadge}</td>
                <td>${s.impressions}</td>
                <td>${formatScreenTime(s.screen_time_seconds)}</td>
                <td>${s.completion_rate}%</td>
            </tr>`;
        }

        html += '</tbody></table></div>';
    }

    container.innerHTML = html;
}

/**
 * Rend une carte KPI.
 */
function renderKpiCard(icon, value, label) {
    return `
        <div class="card sponsor-kpi-card">
            <div style="font-size: 20px; margin-bottom: 4px;">${icon}</div>
            <div style="font-size: 22px; font-weight: 700; color: var(--neo-text-primary);">${value}</div>
            <div style="font-size: 12px; color: var(--neo-text-secondary);">${label}</div>
        </div>
    `;
}

/**
 * Mini barres quotidiennes (sparkline simplifiée).
 */
function renderDailyBars(daily) {
    // Prendre les 14 derniers jours pour lisibilité
    const recent = daily.slice(-14);
    const maxVal = Math.max(...recent.map(d => d.impressions), 1);

    let barsHtml = '';
    for (const day of recent) {
        const height = Math.max(2, Math.round((day.impressions / maxVal) * 40));
        const label = day.date.slice(5); // MM-DD
        const title = `${label}: ${day.impressions} passages`;
        barsHtml += `
            <div class="daily-bar-col" title="${title}">
                <div class="daily-bar" style="height: ${height}px;"></div>
                <div class="daily-bar-label">${label.replace('-', '/')}</div>
            </div>
        `;
    }

    return `
        <div class="card" style="padding: 12px; margin-top: 12px;">
            <h4 style="margin: 0 0 8px; font-size: 14px; color: var(--neo-text-secondary); text-transform: uppercase; letter-spacing: 1px;">
                14 derniers jours
            </h4>
            <div class="daily-bars-container">${barsHtml}</div>
        </div>
    `;
}

/**
 * Formate des secondes en durée lisible.
 */
function formatScreenTime(seconds) {
    if (!seconds || seconds <= 0) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return hrs + 'h ' + mins + 'm';
    return mins + ' min';
}

// ============================================================================
// SPONSOR LIST — CRUD sponsors locaux
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

    const freq = sponsor.frequency || 2;
    const freqLabels = { 1: 'Basse', 2: 'Normale', 3: 'Haute', 4: 'Maximum' };
    const freqClasses = { 1: 'freq-low', 2: 'freq-normal', 3: 'freq-high', 4: 'freq-max' };
    const freqBadge = `<span class="frequency-badge ${freqClasses[freq] || 'freq-normal'}" title="Fréquence: ${freqLabels[freq] || 'Normale'}">${freq}x ${freqLabels[freq] || 'Normale'}</span>`;

    return `
        <div class="card sponsor-card" data-local-id="${sponsor.localId}">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px;">${escapeHtml(sponsor.name)}</h3>
                <div style="display: flex; gap: 4px;">
                    ${freqBadge}
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

// ============================================================================
// WIZARD STATE
// ============================================================================

let currentWizardStep = 1;
let wizardUploadedFile = null; // File object selected for upload in wizard
let wizardUploadedFilename = null; // Filename returned after upload
let wizardIsEditMode = false;

/**
 * Ouvre le modal de création/édition de sponsor.
 * - Create mode (localId falsy): shows 3-step wizard
 * - Edit mode (localId truthy): shows single-page form
 */
async function openSponsorModal(localId) {
    const modal = document.getElementById('sponsor-modal');
    const modalInner = document.getElementById('sponsor-modal-inner');
    const title = document.getElementById('sponsor-modal-title');
    const editIdInput = document.getElementById('sponsor-edit-id');

    // Reset wizard state
    currentWizardStep = 1;
    wizardUploadedFile = null;
    wizardUploadedFilename = null;

    if (localId) {
        // ── EDIT MODE: single-page form ──
        wizardIsEditMode = true;
        modalInner.classList.add('sponsor-modal-edit');
        title.textContent = 'Modifier le sponsor';
        editIdInput.value = localId;

        // Hide wizard steps, show edit fields
        document.getElementById('wizard-indicator').style.display = 'none';
        document.getElementById('wizard-step-1').style.display = 'none';
        document.getElementById('wizard-step-2').style.display = 'none';
        document.getElementById('wizard-step-3').style.display = 'none';
        document.getElementById('wizard-success').style.display = 'none';
        document.getElementById('sponsor-edit-fields').style.display = 'block';

        const editVideosSelect = document.getElementById('sponsor-edit-videos');

        try {
            const response = await fetch('/api/sponsors/' + localId);
            if (!response.ok) throw new Error('Erreur');
            const { sponsor } = await response.json();

            document.getElementById('sponsor-edit-name').value = sponsor.name || '';
            document.getElementById('sponsor-edit-email').value = sponsor.contactEmail || '';
            document.getElementById('sponsor-edit-phone').value = sponsor.contactPhone || '';
            document.getElementById('sponsor-edit-loop').checked = sponsor.inLoop;
            const editFreqEl = document.getElementById('sponsor-edit-frequency');
            if (editFreqEl) editFreqEl.value = String(sponsor.frequency || 2);

            await populateSponsorVideoSelect(editVideosSelect, sponsor.videoFilenames || []);
        } catch (error) {
            console.error('[sponsors] Erreur chargement sponsor:', error);
            return;
        }

        modal.style.display = 'flex';
        document.getElementById('sponsor-edit-name').focus();
    } else {
        // ── CREATE MODE: 3-step wizard ──
        wizardIsEditMode = false;
        modalInner.classList.remove('sponsor-modal-edit');
        title.textContent = 'Ajouter un sponsor';
        editIdInput.value = '';

        // Show wizard, hide edit fields
        document.getElementById('wizard-indicator').style.display = 'flex';
        document.getElementById('sponsor-edit-fields').style.display = 'none';
        document.getElementById('wizard-success').style.display = 'none';

        // Reset form fields
        document.getElementById('sponsor-name').value = '';
        document.getElementById('sponsor-email').value = '';
        document.getElementById('sponsor-phone').value = '';
        const loopCheckbox = document.getElementById('sponsor-add-to-loop');
        if (loopCheckbox) loopCheckbox.checked = true;
        const frequencySelect = document.getElementById('sponsor-frequency');
        if (frequencySelect) frequencySelect.value = '2';

        // Reset wizard video state
        clearWizardUpload();
        selectWizardVideoOption('existing');

        // Populate video select
        const videosSelect = document.getElementById('sponsor-videos');
        await populateSponsorVideoSelect(videosSelect, []);

        // Show step 1
        goToWizardStep(1);

        modal.style.display = 'flex';
        document.getElementById('sponsor-name').focus();
    }
}

/**
 * Navigate to a wizard step (1, 2, or 3).
 */
function goToWizardStep(step) {
    // Validate current step before advancing
    if (step > currentWizardStep) {
        if (currentWizardStep === 1) {
            const name = document.getElementById('sponsor-name').value.trim();
            if (!name) {
                showNotification('Le nom du sponsor est requis', 'error');
                document.getElementById('sponsor-name').focus();
                return;
            }
        }
        if (currentWizardStep === 2 && step === 3) {
            // Upload the file first if user selected upload option and has a file
            if (wizardUploadedFile && !wizardUploadedFilename) {
                wizardUploadVideo().then(() => {
                    if (wizardUploadedFilename) {
                        showWizardStep(3);
                    }
                });
                return;
            }
        }
    }

    // If going to step 3, update summary
    if (step === 3) {
        updateWizardSummary();
    }

    showWizardStep(step);
}

/**
 * Actually show a wizard step and update indicators.
 */
function showWizardStep(step) {
    currentWizardStep = step;

    // Update step panels
    for (let i = 1; i <= 3; i++) {
        const panel = document.getElementById('wizard-step-' + i);
        if (panel) {
            panel.classList.toggle('active', i === step);
        }
    }

    // Update dots
    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById('wizard-dot-' + i);
        if (dot) {
            dot.classList.remove('active', 'completed');
            if (i === step) dot.classList.add('active');
            else if (i < step) dot.classList.add('completed');
        }
    }

    // Update lines
    for (let i = 1; i <= 2; i++) {
        const line = document.getElementById('wizard-line-' + i);
        if (line) {
            line.classList.toggle('completed', i < step);
        }
    }
}

/**
 * Switch between "existing video" and "upload video" option in step 2.
 */
function selectWizardVideoOption(option) {
    const optExisting = document.getElementById('wizard-opt-existing');
    const optUpload = document.getElementById('wizard-opt-upload');
    const panelExisting = document.getElementById('wizard-panel-existing');
    const panelUpload = document.getElementById('wizard-panel-upload');

    if (option === 'existing') {
        optExisting.classList.add('active');
        optUpload.classList.remove('active');
        panelExisting.classList.add('active');
        panelUpload.classList.remove('active');
    } else {
        optExisting.classList.remove('active');
        optUpload.classList.add('active');
        panelExisting.classList.remove('active');
        panelUpload.classList.add('active');
        initWizardDropzone();
    }
}

/**
 * Initialize drag-and-drop for wizard upload zone.
 */
function initWizardDropzone() {
    const dropZone = document.getElementById('wizard-drop-zone');
    const fileInput = document.getElementById('wizard-video-file');
    if (!dropZone || dropZone._wizardInitDone) return;

    dropZone._wizardInitDone = true;

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleWizardFileSelect(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleWizardFileSelect(fileInput.files[0]);
        }
    });
}

/**
 * Handle a file selected in the wizard upload.
 */
function handleWizardFileSelect(file) {
    wizardUploadedFile = file;
    wizardUploadedFilename = null; // Not uploaded yet

    const preview = document.getElementById('wizard-video-preview');
    document.getElementById('wizard-preview-name').textContent = file.name;
    document.getElementById('wizard-preview-size').textContent = formatWizardFileSize(file.size);
    preview.style.display = 'flex';
}

/**
 * Clear the wizard upload selection.
 */
function clearWizardUpload() {
    wizardUploadedFile = null;
    wizardUploadedFilename = null;
    const preview = document.getElementById('wizard-video-preview');
    if (preview) preview.style.display = 'none';
    const progress = document.getElementById('wizard-upload-progress');
    if (progress) progress.style.display = 'none';
    const fileInput = document.getElementById('wizard-video-file');
    if (fileInput) fileInput.value = '';
}

/**
 * Upload the selected video file from the wizard (step 2).
 */
async function wizardUploadVideo() {
    if (!wizardUploadedFile) return;

    const progressDiv = document.getElementById('wizard-upload-progress');
    const progressBar = document.getElementById('wizard-upload-bar');
    const statusText = document.getElementById('wizard-upload-status');

    progressDiv.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.textContent = 'Upload en cours...';

    const formData = new FormData();
    formData.append('video', wizardUploadedFile);
    formData.append('category', 'sponsors');

    try {
        const data = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const pct = Math.round((event.loaded / event.total) * 100);
                    progressBar.style.width = pct + '%';
                    statusText.textContent = 'Upload en cours... ' + pct + '%';
                }
            });
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { resolve({ success: true }); }
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
            xhr.open('POST', '/api/videos/upload');
            xhr.send(formData);
        });

        if (data.success) {
            wizardUploadedFilename = data.filename || wizardUploadedFile.name;
            progressBar.style.width = '100%';
            statusText.textContent = 'Upload terminé !';
            showWizardStep(3);
            updateWizardSummary();
        } else {
            throw new Error(data.error || 'Erreur lors de l\'upload');
        }
    } catch (error) {
        console.error('[sponsors] Wizard upload error:', error);
        showNotification('Erreur upload: ' + error.message, 'error');
        statusText.textContent = 'Erreur: ' + error.message;
    }
}

/**
 * Update the summary card on step 3.
 */
function updateWizardSummary() {
    const nameVal = document.getElementById('sponsor-name').value.trim();
    document.getElementById('wizard-sum-name').textContent = nameVal || '--';

    // Determine video name(s)
    let videoLabel = '--';
    if (wizardUploadedFilename) {
        videoLabel = wizardUploadedFilename;
    } else {
        const videosSelect = document.getElementById('sponsor-videos');
        const selected = Array.from(videosSelect.selectedOptions).map(o => o.textContent);
        if (selected.length > 0) {
            videoLabel = selected.length === 1 ? selected[0] : selected.length + ' vidéos';
        }
    }
    document.getElementById('wizard-sum-video').textContent = videoLabel;

    // Frequency
    const freqEl = document.getElementById('sponsor-frequency');
    const freqLabels = { '1': 'Basse (1x)', '2': 'Normale (2x)', '3': 'Haute (3x)', '4': 'Maximum (4x)' };
    document.getElementById('wizard-sum-freq').textContent = freqLabels[freqEl.value] || 'Normale (2x)';

    // Live-update when frequency changes
    freqEl.onchange = function () {
        document.getElementById('wizard-sum-freq').textContent = freqLabels[freqEl.value] || 'Normale (2x)';
    };
}

/**
 * Format file size for wizard preview.
 */
function formatWizardFileSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Ferme le modal sponsor et réinitialise l'état.
 */
function closeSponsorModal() {
    const modal = document.getElementById('sponsor-modal');
    if (modal) modal.style.display = 'none';

    // Reset wizard state
    wizardUploadedFile = null;
    wizardUploadedFilename = null;
    wizardIsEditMode = false;

    // Reset dropzone init flag so it can be re-initialized
    const dropZone = document.getElementById('wizard-drop-zone');
    if (dropZone) dropZone._wizardInitDone = false;
}

/**
 * Sauvegarde le sponsor (création via wizard OU mise à jour via edit form).
 */
async function saveSponsor() {
    const editId = document.getElementById('sponsor-edit-id').value;

    if (editId) {
        // ── EDIT MODE ──
        const name = document.getElementById('sponsor-edit-name').value.trim();
        const contactEmail = document.getElementById('sponsor-edit-email').value.trim();
        const contactPhone = document.getElementById('sponsor-edit-phone').value.trim();
        const videosSelect = document.getElementById('sponsor-edit-videos');
        const addToLoop = document.getElementById('sponsor-edit-loop').checked;
        const frequencyEl = document.getElementById('sponsor-edit-frequency');
        const frequency = frequencyEl ? parseInt(frequencyEl.value, 10) : 2;

        if (!name) {
            showNotification('Le nom du sponsor est requis', 'error');
            return;
        }

        const selectedVideos = Array.from(videosSelect.selectedOptions).map(o => o.value);

        try {
            const response = await fetch('/api/sponsors/' + editId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone, frequency }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la mise à jour');
            }
            const result = await response.json();
            const sponsor = result.sponsor;

            // Synchroniser les vidéos liées
            await syncSponsorVideos(editId, selectedVideos);

            // Gérer la boucle
            if (addToLoop && !sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'POST' });
            } else if (!addToLoop && sponsor.inLoop) {
                await fetch('/api/sponsors/' + editId + '/loop', { method: 'DELETE' });
            }

            showNotification('Sponsor mis à jour', 'success');
            closeSponsorModal();
            loadSponsors();
        } catch (error) {
            console.error('[sponsors] Erreur sauvegarde:', error);
            showNotification(error.message, 'error');
        }
    } else {
        // ── CREATE MODE (wizard) ──
        const name = document.getElementById('sponsor-name').value.trim();
        const contactEmail = document.getElementById('sponsor-email').value.trim();
        const contactPhone = document.getElementById('sponsor-phone').value.trim();
        const addToLoop = document.getElementById('sponsor-add-to-loop').checked;
        const frequencyEl = document.getElementById('sponsor-frequency');
        const frequency = frequencyEl ? parseInt(frequencyEl.value, 10) : 2;

        if (!name) {
            showNotification('Le nom du sponsor est requis', 'error');
            return;
        }

        // Collect selected videos (existing selection + wizard uploaded)
        const videosSelect = document.getElementById('sponsor-videos');
        const selectedVideos = Array.from(videosSelect.selectedOptions).map(o => o.value);
        if (wizardUploadedFilename && !selectedVideos.includes(wizardUploadedFilename)) {
            selectedVideos.push(wizardUploadedFilename);
        }

        try {
            // Create sponsor
            const response = await fetch('/api/sponsors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, contactEmail, contactPhone, frequency }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erreur lors de la création');
            }
            const result = await response.json();
            const sponsor = result.sponsor;

            // Link videos
            for (const filename of selectedVideos) {
                await fetch('/api/sponsors/' + sponsor.localId + '/videos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename }),
                });
            }

            // Add to loop if requested and has videos
            if (addToLoop && selectedVideos.length > 0) {
                await fetch('/api/sponsors/' + sponsor.localId + '/loop', { method: 'POST' });
            }

            // Show success screen
            document.getElementById('wizard-step-3').classList.remove('active');
            document.getElementById('wizard-indicator').style.display = 'none';
            const successDiv = document.getElementById('wizard-success');
            successDiv.style.display = 'block';
            successDiv.classList.add('active');
            document.getElementById('wizard-success-text').textContent =
                'Sponsor "' + name + '" créé !';

            showNotification('Sponsor créé avec succès', 'success');
        } catch (error) {
            console.error('[sponsors] Erreur sauvegarde:', error);
            showNotification(error.message, 'error');
        }
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
