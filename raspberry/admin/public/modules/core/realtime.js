// ============================================================================
// Realtime - Socket.IO connection to Pi server (:3000)
// ============================================================================

/** @type {object|null} Socket.IO instance */
var _realtimeSocket = null;
var _realtimeConnected = false;

/**
 * Initialize Socket.IO connection to the Pi's TV server
 * Falls back gracefully if Socket.IO client library is not available
 */
function initRealtime() {
    if (typeof io === 'undefined') {
        console.warn('[realtime] Socket.IO client not available, skipping realtime');
        updateRealtimeIndicator(false);
        return;
    }

    try {
        var socketUrl = window.location.protocol + '//' + window.location.hostname + ':3000';
        _realtimeSocket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            timeout: 5000,
        });

        _realtimeSocket.on('connect', function () {
            console.log('[realtime] Connected to Pi server');
            _realtimeConnected = true;
            updateRealtimeIndicator(true);
        });

        _realtimeSocket.on('disconnect', function (reason) {
            console.log('[realtime] Disconnected:', reason);
            _realtimeConnected = false;
            updateRealtimeIndicator(false);
        });

        _realtimeSocket.on('connect_error', function () {
            _realtimeConnected = false;
            updateRealtimeIndicator(false);
        });

        // Listen for config updates (videos, sponsors, etc.)
        _realtimeSocket.on('config_updated', function () {
            console.log('[realtime] Config updated event received');
            if (currentTab === 'dashboard') {
                loadDashboard();
            }
            if (currentTab === 'videos') {
                if (typeof refreshVideos === 'function') refreshVideos();
            }
            if (currentTab === 'sponsors') {
                if (typeof loadSponsors === 'function') loadSponsors();
            }
        });

        // Listen for license/sync status changes
        _realtimeSocket.on('license_update', function () {
            console.log('[realtime] License update event received');
            if (currentTab === 'dashboard') {
                loadSyncStatus();
            }
        });

        // Listen for loop state changes (useful for dashboard current video info)
        _realtimeSocket.on('tv-loop-state', function (data) {
            // Could be used to show "Now playing" in dashboard
            // For now, just log
        });

    } catch (error) {
        console.warn('[realtime] Failed to initialize:', error.message);
        updateRealtimeIndicator(false);
    }
}

/**
 * Update the connection indicator in the header
 */
function updateRealtimeIndicator(connected) {
    var indicator = document.getElementById('realtime-indicator');
    if (!indicator) return;

    if (connected) {
        indicator.className = 'realtime-indicator realtime-connected';
        indicator.title = 'Temps réel actif';
        indicator.textContent = '\u25CF';
    } else {
        indicator.className = 'realtime-indicator realtime-disconnected';
        indicator.title = 'Temps réel inactif';
        indicator.textContent = '\u25CB';
    }
}
