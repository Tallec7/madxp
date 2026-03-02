// ============================================================================
// Upload video (dropzone, progress)
// ============================================================================

function initForms() {
    // Upload form
    const uploadForm = document.getElementById('upload-form');
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await uploadVideo();
    });

    // Populate sponsor select
    populateUploadSponsorSelect();

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

    // WiFi connect form
    const wifiConnectForm = document.getElementById('wifi-connect-form');
    if (wifiConnectForm) {
        wifiConnectForm.addEventListener('submit', connectToWifi);
    }

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

// Variables pour l'upload multiple
let selectedFilesForUpload = [];

function initDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('video-file');

    if (!dropZone || !fileInput) return;

    // Click to select files
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & drop events
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
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
        if (files.length > 0) {
            addFilesToSelection(files);
        }
    });

    // File input change
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            addFilesToSelection(files);
        }
    });
}

function addFilesToSelection(files) {
    selectedFilesForUpload = [...selectedFilesForUpload, ...files];
    updateSelectedFilesUI();
}

// Stockage des URLs de preview pour nettoyage
let previewObjectUrls = [];

function updateSelectedFilesUI() {
    const container = document.getElementById('selected-files');
    const countSpan = document.getElementById('files-count');
    const listUl = document.getElementById('files-list');

    // Nettoyer les anciennes URLs de preview
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    previewObjectUrls = [];

    if (selectedFilesForUpload.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const totalSize = selectedFilesForUpload.reduce((sum, f) => sum + f.size, 0);
    countSpan.textContent = `${selectedFilesForUpload.length} fichier(s) - ${formatBytes(totalSize)}`;

    listUl.innerHTML = selectedFilesForUpload.map((file, index) => {
        // Créer une URL de preview pour la vidéo
        const previewUrl = URL.createObjectURL(file);
        previewObjectUrls.push(previewUrl);

        return `
        <li class="file-item file-item-with-preview">
            <div class="file-preview-thumb" onclick="previewUploadFile(${index})">
                <video src="${previewUrl}" muted preload="metadata" class="file-preview-video"></video>
                <span class="file-preview-play">▶</span>
            </div>
            <div class="file-info-container">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatBytes(file.size)}</span>
            </div>
            <div class="file-actions">
                <button type="button" class="btn btn-small btn-secondary" onclick="previewUploadFile(${index})" title="Prévisualiser">👁️</button>
                <button type="button" class="btn btn-small btn-danger" onclick="removeFileFromSelection(${index})" title="Retirer">✕</button>
            </div>
        </li>`;
    }).join('');

    // Charger les métadonnées pour afficher la durée
    listUl.querySelectorAll('.file-preview-video').forEach((video, index) => {
        video.addEventListener('loadedmetadata', () => {
            const duration = formatDuration(video.duration);
            const fileItem = listUl.querySelectorAll('.file-item')[index];
            const sizeSpan = fileItem.querySelector('.file-size');
            if (sizeSpan && duration) {
                sizeSpan.textContent += ` • ${duration}`;
            }
        });
    });
}

/**
 * Prévisualiser un fichier avant upload
 */
function previewUploadFile(index) {
    const file = selectedFilesForUpload[index];
    if (!file) return;

    const url = URL.createObjectURL(file);
    openVideoPreview(url, file.name);

    // Nettoyer l'URL quand la modale est fermée
    const modal = document.getElementById('video-preview-modal');
    const cleanup = () => {
        URL.revokeObjectURL(url);
        modal.removeEventListener('click', cleanup);
    };
    modal.addEventListener('click', cleanup, { once: true });
}

function removeFileFromSelection(index) {
    selectedFilesForUpload.splice(index, 1);
    updateSelectedFilesUI();
}

function clearSelectedFiles() {
    selectedFilesForUpload = [];
    document.getElementById('video-file').value = '';
    updateSelectedFilesUI();
}

/**
 * Upload avec progression réelle en pourcentage via XMLHttpRequest
 */
function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                onProgress(percentComplete, event.loaded, event.total);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch {
                    resolve({ success: true, message: 'Upload terminé' });
                }
            } else {
                reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
        xhr.addEventListener('abort', () => reject(new Error('Upload annulé')));

        xhr.open('POST', url);
        xhr.send(formData);
    });
}

async function uploadVideo() {
    const form = document.getElementById('upload-form');
    const fileInput = document.getElementById('video-file');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status');
    const currentFileSpan = document.getElementById('upload-current-file');
    const fileCountSpan = document.getElementById('upload-file-count');
    const resultsDiv = document.getElementById('upload-results');
    const resultsList = document.getElementById('upload-results-list');
    const uploadBtn = document.getElementById('upload-btn');

    // Use selectedFilesForUpload if available, otherwise fallback to fileInput
    const filesToUpload = selectedFilesForUpload.length > 0
        ? selectedFilesForUpload
        : Array.from(fileInput.files);

    if (filesToUpload.length === 0) {
        showNotification('Sélectionnez au moins un fichier', 'error');
        return;
    }

    const category = document.getElementById('video-category').value;
    const subcategory = document.getElementById('video-subcategory').value;
    const sponsorLocalId = document.getElementById('upload-sponsor')?.value || '';
    const addToLoop = document.getElementById('upload-add-to-loop')?.checked || false;

    if (!category) {
        showNotification('Sélectionnez une catégorie', 'error');
        return;
    }

    // Disable upload button
    uploadBtn.disabled = true;
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    resultsList.innerHTML = '';

    // Calculer la taille totale
    const totalSize = filesToUpload.reduce((sum, file) => sum + file.size, 0);

    console.log('[admin-ui] Upload multiple videos request', {
        category,
        subcategory,
        filesCount: filesToUpload.length,
        totalSize: formatBytes(totalSize)
    });

    // Upload multiple files
    if (filesToUpload.length > 1) {
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);
        if (sponsorLocalId) formData.append('sponsorLocalId', sponsorLocalId);
        if (sponsorLocalId && addToLoop) formData.append('addToLoop', 'true');

        filesToUpload.forEach(file => {
            formData.append('videos', file);
        });

        currentFileSpan.textContent = `${filesToUpload.length} fichiers (${formatBytes(totalSize)})`;
        fileCountSpan.textContent = '';
        progressBar.style.width = '0%';
        statusText.textContent = 'Préparation...';

        try {
            const data = await uploadWithProgress('/api/videos/upload-multiple', formData, (percent, loaded, total) => {
                progressBar.style.width = percent + '%';
                statusText.textContent = `Upload en cours... ${percent}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
            });

            console.log('[admin-ui] /api/videos/upload-multiple response', data);

            progressBar.style.width = '100%';

            if (data.success) {
                statusText.textContent = data.message || 'Upload terminé !';
                showNotification(data.message || 'Upload terminé avec succès', 'success');
            } else {
                statusText.textContent = data.message || 'Upload terminé avec des erreurs';
                showNotification(data.message || 'Certains fichiers ont échoué', 'warning');
            }

            // Show results
            if (data.files || data.errors) {
                resultsDiv.style.display = 'block';
                resultsList.innerHTML = '';

                if (data.files) {
                    data.files.forEach(file => {
                        resultsList.innerHTML += `<li class="result-success">✅ ${file.name} (${file.size})</li>`;
                    });
                }
                if (data.errors) {
                    data.errors.forEach(err => {
                        resultsList.innerHTML += `<li class="result-error">❌ ${err.name}: ${err.error}</li>`;
                    });
                }
            }

            // Reset form after success
            clearSelectedFiles();
            form.reset();
            populateCategorySelects();
            setTimeout(() => {
                loadVideos();
            }, 2000);

        } catch (error) {
            console.error('[admin-ui] Upload error:', error);
            showNotification('Erreur lors de l\'upload: ' + error.message, 'error');
            statusText.textContent = 'Erreur: ' + error.message;
        }
    } else {
        // Single file upload with progress
        const file = filesToUpload[0];
        const formData = new FormData();
        formData.append('category', category);
        if (subcategory) formData.append('subcategory', subcategory);
        if (sponsorLocalId) formData.append('sponsorLocalId', sponsorLocalId);
        if (sponsorLocalId && addToLoop) formData.append('addToLoop', 'true');
        formData.append('video', file);

        currentFileSpan.textContent = `${file.name} (${formatBytes(file.size)})`;
        fileCountSpan.textContent = '';
        progressBar.style.width = '0%';
        statusText.textContent = 'Préparation...';

        try {
            const data = await uploadWithProgress('/api/videos/upload', formData, (percent, loaded, total) => {
                progressBar.style.width = percent + '%';
                statusText.textContent = `Upload en cours... ${percent}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
            });

            console.log('[admin-ui] /api/videos/upload response', data);

            if (data.success) {
                progressBar.style.width = '100%';
                statusText.textContent = 'Upload terminé !';
                showNotification('Vidéo uploadée avec succès', 'success');
                clearSelectedFiles();
                form.reset();
                populateCategorySelects();
                setTimeout(() => {
                    progressDiv.style.display = 'none';
                    loadVideos();
                }, 2000);
            } else {
                showNotification('Erreur: ' + (data.error || 'Erreur inconnue'), 'error');
                statusText.textContent = 'Erreur: ' + (data.error || 'Erreur inconnue');
            }
        } catch (error) {
            showNotification('Erreur lors de l\'upload: ' + error.message, 'error');
            statusText.textContent = 'Erreur: ' + error.message;
        }
    }

    // Re-enable upload button
    uploadBtn.disabled = false;
}

/**
 * Peuple le select de sponsors dans le formulaire d'upload.
 */
async function populateUploadSponsorSelect() {
    const sponsorSelect = document.getElementById('upload-sponsor');
    if (!sponsorSelect) return;

    try {
        const response = await fetch('/api/sponsors');
        if (!response.ok) return;
        const { sponsors } = await response.json();

        // Garder seulement les sponsors locaux
        const localSponsors = (sponsors || []).filter(s => s.source === 'local');
        sponsorSelect.innerHTML = '<option value="">-- Aucun sponsor --</option>';
        for (const sponsor of localSponsors) {
            const option = document.createElement('option');
            option.value = sponsor.localId;
            option.textContent = sponsor.name;
            sponsorSelect.appendChild(option);
        }
    } catch (error) {
        console.warn('[upload] Could not load sponsors for upload select:', error);
    }
}

// Note: configureWifi() has been replaced by the new WiFi scanner UI
// See loadWifiCurrent(), scanWifiNetworks(), connectToWifi()

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
    } catch (_error) {
        showNotification('Erreur lors de la mise à jour', 'error');
    }
}
