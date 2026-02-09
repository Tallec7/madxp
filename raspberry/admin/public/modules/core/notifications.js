// ============================================================================
// Notifications, modals, system actions, utilitaires UI
// ============================================================================

/**
 * System Actions
 */
async function restartService(service) {
    if (!confirm(`Redémarrer le service ${service} ?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/services/${service}/restart`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Service ${service} redémarré`, 'success');
            setTimeout(() => loadDashboard(), 2000);
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors du redémarrage', 'error');
    }
}

function confirmAction(action) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const message = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');

    if (action === 'reboot') {
        title.textContent = 'Redémarrer le système';
        message.textContent = 'Êtes-vous sûr de vouloir redémarrer le Raspberry Pi ? L\'opération prendra environ 1 minute.';
        confirmBtn.onclick = () => executeAction('reboot');
    } else if (action === 'shutdown') {
        title.textContent = 'Éteindre le système';
        message.textContent = 'Êtes-vous sûr de vouloir éteindre le Raspberry Pi ? Vous devrez le rallumer physiquement.';
        confirmBtn.onclick = () => executeAction('shutdown');
    }

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

async function executeAction(action) {
    closeModal();

    try {
        const response = await fetch(`/api/system/${action}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur lors de l\'opération', 'error');
    }
}

/**
 * Utilities
 */
function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR');
    document.getElementById('current-time').textContent = timeStr;

    setTimeout(updateTime, 1000);
}

function showNotification(message, type = 'info') {
    // Toast notification system
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    // Créer le container si nécessaire
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Créer le toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Animation d'entrée
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-suppression après 4 secondes
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Prévisualisation vidéo
 */
function openVideoPreview(videoUrl, videoName) {
    if (!videoUrl) {
        showNotification('URL de vidéo manquante', 'error');
        return;
    }

    const modal = document.getElementById('video-preview-modal');
    const video = document.getElementById('preview-video');
    const title = document.getElementById('preview-video-title');

    if (!modal || !video) {
        showNotification('Modal de prévisualisation non disponible', 'error');
        return;
    }

    title.textContent = videoName || 'Prévisualisation';
    video.src = videoUrl;
    modal.classList.add('active');

    // Lancer la lecture automatiquement
    video.play().catch(() => {
        // Ignorer l'erreur si autoplay est bloqué
    });
}

function closeVideoPreview() {
    const modal = document.getElementById('video-preview-modal');
    const video = document.getElementById('preview-video');

    if (video) {
        video.pause();
        video.src = '';
    }

    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Formater la taille en bytes en format lisible
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/**
 * Formater une durée en secondes en format mm:ss ou hh:mm:ss
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
