// ============================================================================
// Dashboard hotspot local (ADR-073)
// - Liste clients WiFi associés (MAC, signal, trafic)
// - Journal événements hostapd (connect/disconnect/PSK mismatch)
// - Rotation PSK WiFi (génération ou valeur fournie)
// Auto-refresh 15s tant que l'onglet network est actif.
// ============================================================================

let _hotspotDashboardTimer = null;

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

function formatSignal(signal) {
    if (signal === undefined || signal === null || Number.isNaN(signal)) return '-';
    // Signal dBm typique: -30 (excellent) → -90 (faible)
    const label = signal >= -50 ? '📶📶📶' : signal >= -65 ? '📶📶' : signal >= -80 ? '📶' : '⚠️';
    return `${label} ${signal} dBm`;
}

function formatEventType(type) {
    switch (type) {
        case 'AP-STA-CONNECTED': return '✅ Connexion';
        case 'AP-STA-DISCONNECTED': return '🔌 Déconnexion';
        case 'AP-STA-POSSIBLE-PSK-MISMATCH': return '🔑 PSK mismatch';
        case 'CTRL-EVENT-EAP-FAILURE': return '❌ Auth échouée';
        default: return escapeHtml(type || '?');
    }
}

async function loadHotspotClients() {
    const tbody = document.getElementById('hotspot-clients-tbody');
    const countEl = document.getElementById('hotspot-clients-count');
    if (!tbody) return;
    try {
        const response = await fetch('/api/hotspot/clients');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const clients = data.clients || [];
        if (countEl) countEl.textContent = `${clients.length} client${clients.length > 1 ? 's' : ''}`;
        if (clients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Aucun client connecté</td></tr>';
            return;
        }
        tbody.innerHTML = clients.map(c => `
            <tr>
                <td><code>${escapeHtml(c.mac)}</code></td>
                <td>${formatDuration(c.connectedSec)}</td>
                <td>${formatSignal(c.signal)}</td>
                <td>${formatBytes(c.rxBytes)} / ${formatBytes(c.txBytes)}</td>
                <td>${(c.rxPackets || 0).toLocaleString('fr-FR')} / ${(c.txPackets || 0).toLocaleString('fr-FR')}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('[hotspot-dashboard] loadClients failed:', error);
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row text-danger">Erreur: ${escapeHtml(error.message)}</td></tr>`;
    }
}

async function loadHotspotEvents() {
    const tbody = document.getElementById('hotspot-events-tbody');
    const countEl = document.getElementById('hotspot-events-count');
    if (!tbody) return;
    try {
        const response = await fetch('/api/hotspot/events?limit=50');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const events = data.events || [];
        if (countEl) countEl.textContent = `${events.length} événement${events.length > 1 ? 's' : ''}`;
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Aucun événement récent</td></tr>';
            return;
        }
        tbody.innerHTML = events.map(ev => {
            const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString('fr-FR') : '-';
            const buffered = ev.buffered ? ' <span class="badge badge-warning" title="Événement bufferisé hors-ligne">offline</span>' : '';
            return `
                <tr>
                    <td><small>${escapeHtml(ts)}</small>${buffered}</td>
                    <td>${formatEventType(ev.eventType)}</td>
                    <td><code>${escapeHtml(ev.clientMac || '-')}</code></td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('[hotspot-dashboard] loadEvents failed:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="empty-row text-danger">Erreur: ${escapeHtml(error.message)}</td></tr>`;
    }
}

async function refreshHotspotDashboard() {
    await Promise.all([loadHotspotClients(), loadHotspotEvents()]);
}

function startHotspotDashboardAutoRefresh() {
    stopHotspotDashboardAutoRefresh();
    _hotspotDashboardTimer = setInterval(() => {
        if (currentTab === 'network') refreshHotspotDashboard();
    }, 15000);
}

function stopHotspotDashboardAutoRefresh() {
    if (_hotspotDashboardTimer) {
        clearInterval(_hotspotDashboardTimer);
        _hotspotDashboardTimer = null;
    }
}

function openRotatePskModal() {
    const modal = document.getElementById('rotate-psk-modal');
    const customInput = document.getElementById('rotate-psk-custom');
    const resultBlock = document.getElementById('rotate-psk-result');
    if (!modal) return;
    if (customInput) customInput.value = '';
    if (resultBlock) resultBlock.style.display = 'none';
    modal.style.display = 'flex';
}

function closeRotatePskModal() {
    const modal = document.getElementById('rotate-psk-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmRotatePsk() {
    if (typeof DEMO_MODE !== 'undefined' && DEMO_MODE) {
        showNotification('Mode démo : rotation PSK indisponible', 'warning');
        return;
    }
    const confirmBtn = document.getElementById('rotate-psk-confirm-btn');
    const customInput = document.getElementById('rotate-psk-custom');
    const resultBlock = document.getElementById('rotate-psk-result');
    const resultPsk = document.getElementById('rotate-psk-new-value');
    const newPsk = customInput && customInput.value.trim() ? customInput.value.trim() : undefined;

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⏳ Rotation en cours…';
    }
    try {
        const payload = newPsk ? { newPsk } : {};
        const response = await fetch('/api/hotspot/rotate-psk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        if (resultPsk) resultPsk.textContent = data.psk || '(inconnu)';
        if (resultBlock) resultBlock.style.display = 'block';
        showNotification('PSK WiFi renouvelée, hostapd redémarré', 'success');
    } catch (error) {
        console.error('[hotspot-dashboard] rotatePsk failed:', error);
        showNotification('Rotation PSK échouée : ' + error.message, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '🔄 Renouveler la PSK';
        }
    }
}

function copyNewPskToClipboard() {
    const el = document.getElementById('rotate-psk-new-value');
    if (!el) return;
    const value = el.textContent || '';
    if (!value || value === '(inconnu)') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value)
            .then(() => showNotification('PSK copiée dans le presse-papiers', 'success'))
            .catch(() => showNotification('Impossible de copier la PSK', 'warning'));
    }
}
