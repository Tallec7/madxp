// ============================================================================
// Connection monitoring + fetch wrapper
// ============================================================================

/**
 * Update connection status badge
 */
function updateConnectionStatus(status) {
    connectionStatus = status;
    const badge = document.getElementById('connection-status');
    const textElement = badge.querySelector('.connection-text');

    // Remove all status classes
    badge.classList.remove('online', 'offline', 'reconnecting');

    // Add current status class
    badge.classList.add(status);

    // Update text
    const statusTexts = {
        'online': 'En ligne',
        'offline': 'Hors ligne',
        'reconnecting': 'Reconnexion...',
        'checking': 'Vérification...'
    };

    textElement.textContent = statusTexts[status] || 'Inconnu';

    // Update aria-label for accessibility
    badge.setAttribute('aria-label', `État de la connexion: ${statusTexts[status]}`);
}

/**
 * Check connection status by making a lightweight API call
 */
async function checkConnection() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch('/api/system', {
            signal: controller.signal,
            method: 'HEAD', // Use HEAD for lightweight check
            cache: 'no-cache'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            lastSuccessfulRequest = Date.now();
            if (connectionStatus !== 'online') {
                updateConnectionStatus('online');
            }
            return true;
        } else {
            throw new Error('Server returned error status');
        }
    } catch (error) {
        // If we were online, try to reconnect
        if (connectionStatus === 'online') {
            updateConnectionStatus('reconnecting');
        } else if (connectionStatus === 'reconnecting') {
            // After some time in reconnecting, mark as offline
            const timeSinceLastSuccess = Date.now() - lastSuccessfulRequest;
            if (timeSinceLastSuccess > 30000) { // 30 seconds
                updateConnectionStatus('offline');
            }
        } else {
            updateConnectionStatus('offline');
        }
        return false;
    }
}

/**
 * Start connection monitoring
 */
function startConnectionMonitoring() {
    // Initial check
    checkConnection();

    // Check every 10 seconds
    connectionCheckInterval = setInterval(checkConnection, 10000);

    // Also check on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkConnection();
        }
    });

    // Check on online/offline events
    window.addEventListener('online', () => {
        console.log('[Connection] Browser online event');
        checkConnection();
    });

    window.addEventListener('offline', () => {
        console.log('[Connection] Browser offline event');
        updateConnectionStatus('offline');
    });
}

/**
 * Wrap fetch to track successful requests
 */
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    try {
        const response = await originalFetch(...args);
        if (response.ok) {
            lastSuccessfulRequest = Date.now();
            if (connectionStatus !== 'online') {
                updateConnectionStatus('online');
            }
        }
        return response;
    } catch (error) {
        // Let the connection check handle status updates
        throw error;
    }
};
