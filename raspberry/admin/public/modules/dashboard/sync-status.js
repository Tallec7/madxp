// ============================================================================
// Sync Status Widget - Dashboard
// ============================================================================

/** Track last notified content sync to avoid duplicate notifications */
let _lastNotifiedContentSync = null;

/**
 * Charge et affiche le widget de statut de synchronisation
 * Appelé depuis loadDashboard() à chaque cycle de rafraîchissement
 */
async function loadSyncStatus() {
    const container = document.getElementById('sync-status-widget');
    if (!container) return;

    try {
        const response = await fetch('/api/sync-status');

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();
        renderSyncStatus(container, data);

        // F-AUD-14: Show one-time notification for recent content sync
        checkContentSyncNotification(data);
    } catch (error) {
        console.warn('[admin-ui] Sync status unavailable:', error.message);
        renderSyncStatusError(container);
    }
}

/**
 * Affiche le widget sync status
 */
function renderSyncStatus(container, data) {
    const connectionDot = data.connected ? 'sync-dot-connected' : 'sync-dot-disconnected';
    const connectionText = data.connected ? 'Connecté au cloud' : 'Déconnecté du cloud';
    const connectionClass = data.connected ? 'sync-connected' : 'sync-disconnected';

    // Temps relatif de la dernière sync
    const lastSyncText = data.lastSyncAt
        ? formatRelativeTime(data.lastSyncAt)
        : 'Jamais synchronisé';

    // Badge commandes en attente
    const pendingBadge = data.pendingCommands > 0
        ? '<span class="sync-badge sync-badge-warning">' + data.pendingCommands + ' en attente</span>'
        : '';

    // Badge erreurs
    const deadLetterBadge = data.deadLetters > 0
        ? '<span class="sync-badge sync-badge-danger">' + data.deadLetters + ' erreur' + (data.deadLetters > 1 ? 's' : '') + '</span>'
        : '';

    // Mode tech : historique expandable
    const mode = getCurrentMode();
    let historySection = '';
    if (mode === MODE_TECH && data.recentHistory && data.recentHistory.length > 0) {
        const historyRows = data.recentHistory.map(function (entry) {
            const icon = entry.success ? '✅' : '❌';
            const time = formatRelativeTime(entry.timestamp);
            const errorInfo = entry.error ? ' — ' + escapeHtml(entry.error) : '';
            return '<div class="sync-history-row">'
                + '<span>' + icon + '</span>'
                + '<span class="sync-history-type">' + escapeHtml(entry.type) + '</span>'
                + '<span class="sync-history-time">' + time + '</span>'
                + '<span class="sync-history-error">' + errorInfo + '</span>'
                + '</div>';
        }).join('');

        historySection = ''
            + '<details class="sync-history-details tech-only">'
            + '<summary>Historique récent</summary>'
            + '<div class="sync-history-list">' + historyRows + '</div>'
            + '</details>';
    }

    // F-AUD-14: Contenu NEOPRO synchronisé banner
    let contentSyncBanner = '';
    if (data.lastContentSyncAt) {
        const contentSyncAge = Math.floor((Date.now() - new Date(data.lastContentSyncAt).getTime()) / 1000);
        const contentSyncText = formatRelativeTime(data.lastContentSyncAt);
        const details = data.lastContentSyncDetails || {};
        const detailParts = [];
        if (details.sponsorsCount) detailParts.push(details.sponsorsCount + ' sponsors');
        if (details.categoriesCount) detailParts.push(details.categoriesCount + ' catégories');
        if (details.siteSponsorsCount) detailParts.push(details.siteSponsorsCount + ' annonceurs');
        const detailText = detailParts.length > 0 ? ' (' + detailParts.join(', ') + ')' : '';

        const isRecent = contentSyncAge < 600; // < 10 minutes
        const bannerClass = isRecent ? 'content-sync-recent' : 'content-sync-old';

        contentSyncBanner = ''
            + '<div class="content-sync-banner ' + bannerClass + '">'
            + '  <span class="content-sync-icon">' + (isRecent ? '📡' : '📋') + '</span>'
            + '  <span>Contenu NEOPRO : ' + contentSyncText + detailText + '</span>'
            + '</div>';
    }

    container.innerHTML = ''
        + '<div class="sync-status-banner ' + connectionClass + '">'
        + '  <div class="sync-status-main">'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-dot ' + connectionDot + '"></span>'
        + '      <span class="sync-status-text">' + connectionText + '</span>'
        + '    </div>'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-status-label">Dernière sync :</span>'
        + '      <span class="sync-status-value">' + lastSyncText + '</span>'
        + '    </div>'
        + '    ' + pendingBadge
        + '    ' + deadLetterBadge
        + '  </div>'
        + '  ' + contentSyncBanner
        + '  ' + historySection
        + '</div>';
}

/**
 * F-AUD-14: Show a one-time toast notification when new NEOPRO content is synced.
 * Only fires once per unique content sync timestamp to avoid spamming.
 */
function checkContentSyncNotification(data) {
    if (!data.lastContentSyncAt) return;

    const syncTs = data.lastContentSyncAt;
    const syncAge = Date.now() - new Date(syncTs).getTime();

    // Only notify for syncs within the last 5 minutes
    if (syncAge > 5 * 60 * 1000) return;

    // Only notify once per sync event
    if (_lastNotifiedContentSync === syncTs) return;
    _lastNotifiedContentSync = syncTs;

    const details = data.lastContentSyncDetails || {};
    const parts = [];
    if (details.siteSponsorsCount) parts.push(details.siteSponsorsCount + ' annonceur(s)');
    if (details.categoriesCount) parts.push(details.categoriesCount + ' catégorie(s)');
    const suffix = parts.length > 0 ? ' — ' + parts.join(', ') : '';

    if (typeof showNotification === 'function') {
        showNotification('📡 Contenu NEOPRO mis à jour' + suffix, 'success');
    }
}

/**
 * Affiche l'état d'erreur / indisponible
 */
function renderSyncStatusError(container) {
    container.innerHTML = ''
        + '<div class="sync-status-banner sync-unavailable">'
        + '  <div class="sync-status-main">'
        + '    <div class="sync-status-item">'
        + '      <span class="sync-dot sync-dot-unknown"></span>'
        + '      <span class="sync-status-text">Statut sync indisponible</span>'
        + '    </div>'
        + '  </div>'
        + '</div>';
}

/**
 * Formate un timestamp ISO en temps relatif en français
 */
function formatRelativeTime(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now - date) / 1000);

        if (diffSeconds < 0) return "à l'instant";
        if (diffSeconds < 60) return 'il y a ' + diffSeconds + 's';
        if (diffSeconds < 3600) return 'il y a ' + Math.floor(diffSeconds / 60) + ' min';
        if (diffSeconds < 86400) return 'il y a ' + Math.floor(diffSeconds / 3600) + 'h';
        return 'il y a ' + Math.floor(diffSeconds / 86400) + ' jour(s)';
    } catch {
        return 'Inconnu';
    }
}

/**
 * Échappe le HTML pour éviter les injections XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
