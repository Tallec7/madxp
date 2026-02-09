// ============================================================================
// Scanner WiFi, connexion, BSSID
// ============================================================================

// Track if we're in a mesh environment (multiple APs with same SSID)
let isMeshEnvironment = false;
let meshApCount = 0;

// Load current WiFi connection status
async function loadWifiCurrent() {
    const container = document.getElementById('wifi-current-info');
    try {
        const response = await fetch('/api/wifi/current');
        const data = await response.json();

        if (data.connected) {
            const signalBars = getSignalBars(data.quality);
            const lockIcon = data.bssidLocked ? '🔒' : '';

            // Check if BSSID lock is problematic in mesh environment
            const bssidLockWarning = data.bssidLocked && isMeshEnvironment ? `
                <div class="mesh-warning">
                    <p>⚠️ <strong>Attention :</strong> Verrouillage BSSID actif en environnement mesh (${meshApCount} APs détectés)</p>
                    <p class="info-text">En mesh WiFi, le verrouillage BSSID peut causer des déconnexions si l'AP verrouillé devient inaccessible.</p>
                    <button class="btn btn-warning btn-sm" onclick="removeBssidLock()">🔓 Supprimer le verrouillage BSSID</button>
                </div>
            ` : '';

            container.innerHTML = `
                <div class="wifi-current-status connected">
                    <div class="wifi-status-row">
                        <span class="wifi-signal">${signalBars}</span>
                        <span class="wifi-ssid"><strong>${data.ssid}</strong></span>
                        <span class="wifi-connected-badge">✅ Connecté</span>
                    </div>
                    <div class="wifi-details">
                        <p><strong>IP:</strong> ${data.ipAddress || 'En attente...'}</p>
                        <p><strong>Signal:</strong> ${data.signal} dBm (${data.quality}%)</p>
                        <p><strong>Point d'accès:</strong> ${data.bssid} ${lockIcon}</p>
                        ${data.bssidLocked
                            ? `<p class="bssid-locked">🔒 BSSID fixé: ${data.bssidLocked}</p>`
                            : '<p class="bssid-unlocked">🔄 Roaming activé (bascule automatique entre APs)</p>'}
                    </div>
                    ${bssidLockWarning}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="wifi-current-status disconnected">
                    <p>❌ Non connecté</p>
                    <p class="info-text">Scannez les réseaux ci-dessous et connectez-vous.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading WiFi current:', error);
        container.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    }
}

// Remove BSSID lock from wpa_supplicant configuration
async function removeBssidLock() {
    if (!confirm('Supprimer le verrouillage BSSID ?\n\nLe dongle WiFi pourra basculer automatiquement entre les différents points d\'accès du réseau mesh.')) {
        return;
    }

    try {
        const response = await fetch('/api/wifi/bssid-lock', {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Verrouillage BSSID supprimé. Le dongle peut maintenant changer d\'AP automatiquement.', 'success');
            loadWifiCurrent();
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    }
}

function refreshWifiCurrent() {
    loadWifiCurrent();
}

// Scan WiFi networks
async function scanWifiNetworks() {
    const btn = document.getElementById('scan-btn');
    const container = document.getElementById('wifi-networks-list');

    btn.disabled = true;
    btn.textContent = '⏳ Scan...';
    container.innerHTML = '<p class="info-text">Scan en cours...</p>';

    try {
        const response = await fetch('/api/wifi/scan');
        const data = await response.json();

        if (!data.networks || data.networks.length === 0) {
            container.innerHTML = '<p class="info-text">Aucun réseau trouvé. Réessayez.</p>';
            return;
        }

        // Group networks by SSID to show multiple APs
        const networksBySSID = {};
        data.networks.forEach(net => {
            if (!networksBySSID[net.ssid]) {
                networksBySSID[net.ssid] = [];
            }
            networksBySSID[net.ssid].push(net);
        });

        // Detect mesh environment: check if the currently connected SSID has multiple APs
        if (data.currentSsid && networksBySSID[data.currentSsid]) {
            meshApCount = networksBySSID[data.currentSsid].length;
            isMeshEnvironment = meshApCount > 1;

            // Update the WiFi status display to show mesh warning if needed
            loadWifiCurrent();
        }

        let html = '<div class="wifi-networks">';

        for (const [ssid, aps] of Object.entries(networksBySSID)) {
            const hasMultipleAPs = aps.length > 1;
            const bestAP = aps[0]; // Already sorted by signal

            html += `<div class="wifi-network-group ${hasMultipleAPs ? 'multiple-aps' : ''}">`;
            html += `<div class="wifi-network-header">
                <span class="wifi-signal">${getSignalBars(bestAP.quality)}</span>
                <span class="wifi-ssid">${ssid}</span>
                <span class="wifi-security">${bestAP.encrypted ? '🔒 ' + bestAP.security : '🔓 Open'}</span>
                ${hasMultipleAPs ? `<span class="wifi-ap-count">📡 ${aps.length} APs (Mesh)</span>` : ''}
            </div>`;

            // Show mesh warning if multiple APs
            if (hasMultipleAPs) {
                html += `<div class="mesh-info-banner">
                    <span>ℹ️ Réseau mesh détecté - Le verrouillage BSSID n'est pas recommandé</span>
                </div>`;
            }

            // Show individual APs
            html += '<div class="wifi-aps-list">';
            aps.forEach((ap, index) => {
                const isCurrent = ap.bssid === data.currentBssid;
                html += `
                    <div class="wifi-ap ${isCurrent ? 'current' : ''}" data-ssid="${ap.ssid}" data-bssid="${ap.bssid}">
                        <div class="wifi-ap-info">
                            <span class="wifi-signal-small">${getSignalBars(ap.quality)}</span>
                            <span class="wifi-ap-bssid">${ap.bssid}</span>
                            <span class="wifi-ap-channel">CH ${ap.channel}</span>
                            <span class="wifi-ap-signal">${ap.signal} dBm</span>
                            ${isCurrent ? '<span class="wifi-current-badge">● Connecté</span>' : ''}
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="selectWifiNetwork('${ap.ssid}', '${ap.bssid}', ${ap.quality}, ${hasMultipleAPs})">
                            ${isCurrent ? '🔄 Reconnecter' : '📶 Connecter'}
                        </button>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error scanning WiFi:', error);
        container.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Scanner';
    }
}

// Select a network to connect
function selectWifiNetwork(ssid, bssid, quality, isMesh = false) {
    document.getElementById('wifi-connect-ssid').value = ssid;
    document.getElementById('wifi-connect-bssid').value = bssid;
    document.getElementById('wifi-connect-password').value = '';
    document.getElementById('wifi-connect-card').style.display = 'block';
    document.getElementById('wifi-connect-password').focus();

    // Handle BSSID lock checkbox based on mesh detection
    const lockCheckbox = document.getElementById('wifi-lock-bssid');
    const meshWarning = document.getElementById('wifi-mesh-warning');

    // Store mesh status for later validation
    window._currentNetworkIsMesh = isMesh;

    if (isMesh) {
        // In mesh environment: BLOCK BSSID lock completely
        lockCheckbox.checked = false;
        lockCheckbox.disabled = true;
        if (meshWarning) {
            meshWarning.style.display = 'block';
            meshWarning.innerHTML = `
                <div class="alert alert-danger">
                    <strong>⛔ Verrouillage BSSID interdit</strong><br>
                    <small>Réseau mesh détecté (plusieurs APs avec le même SSID).
                    Le verrouillage BSSID causerait des déconnexions si l'AP verrouillé devient inaccessible.</small>
                </div>
            `;
        }
    } else {
        // Single AP: allow BSSID lock (user choice)
        lockCheckbox.disabled = false;
        lockCheckbox.checked = false; // Default unchecked, let user decide
        if (meshWarning) {
            meshWarning.style.display = 'none';
        }
    }

    // Scroll to the form
    document.getElementById('wifi-connect-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelWifiConnect() {
    document.getElementById('wifi-connect-card').style.display = 'none';
}

// Connect to WiFi with optional BSSID lock
async function connectToWifi(event) {
    event.preventDefault();

    const ssid = document.getElementById('wifi-connect-ssid').value;
    const bssid = document.getElementById('wifi-connect-bssid').value;
    const password = document.getElementById('wifi-connect-password').value;
    let lockBssid = document.getElementById('wifi-lock-bssid').checked;

    // SAFETY: Block BSSID lock in mesh environments even if checkbox was manipulated
    if (lockBssid && window._currentNetworkIsMesh) {
        showNotification('⛔ Verrouillage BSSID interdit en environnement mesh', 'error');
        return;
    }

    const btn = document.getElementById('wifi-connect-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Connexion...';

    try {
        const response = await fetch('/api/wifi/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ssid, password, bssid, lockBssid })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            cancelWifiConnect();
            // Refresh after a delay to allow connection
            setTimeout(() => {
                loadWifiCurrent();
                scanWifiNetworks();
            }, 3000);
        } else {
            showNotification('Erreur: ' + data.error, 'error');
        }
    } catch (error) {
        showNotification('Erreur: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📶 Se connecter';
    }
}

// Helper: Get signal bars based on quality percentage
function getSignalBars(quality) {
    if (quality === null || quality === undefined) return '📶';
    if (quality >= 80) return '📶📶📶📶';
    if (quality >= 60) return '📶📶📶░';
    if (quality >= 40) return '📶📶░░';
    if (quality >= 20) return '📶░░░';
    return '░░░░';
}

// Load network interfaces info
async function loadNetwork() {
    try {
        const response = await fetch('/api/network');
        const data = await response.json();

        const container = document.getElementById('network-info');
        container.innerHTML = '';

        for (const [iface, addrs] of Object.entries(data.interfaces)) {
            if (addrs.length === 0) continue;

            const div = document.createElement('div');
            div.className = 'network-interface';

            let html = `<h4>${iface}</h4>`;
            addrs.forEach(addr => {
                html += `
                    <p><strong>IP:</strong> ${addr.address}</p>
                    <p><strong>Netmask:</strong> ${addr.netmask}</p>
                    <p><strong>MAC:</strong> ${addr.mac}</p>
                `;
            });

            div.innerHTML = html;
            container.appendChild(div);
        }

        // Show wlan1 (USB dongle) info if available
        if (data.wlan1 && data.wlan1.ssid) {
            const wifiDiv = document.createElement('div');
            wifiDiv.className = 'network-interface wifi-info';
            wifiDiv.innerHTML = `
                <h4>wlan1 (Clé WiFi USB)</h4>
                <p><strong>SSID:</strong> ${data.wlan1.ssid}</p>
                <p><strong>BSSID:</strong> ${data.wlan1.bssid || 'N/A'}</p>
                <p><strong>Signal:</strong> ${data.wlan1.signal} dBm (${data.wlan1.quality}%)</p>
            `;
            container.appendChild(wifiDiv);
        }

        // Show wlan0 (hotspot) info
        if (data.wlan0) {
            const hotspotDiv = document.createElement('div');
            hotspotDiv.className = 'network-interface hotspot-info';
            hotspotDiv.innerHTML = `
                <h4>wlan0 (Hotspot)</h4>
                <p><strong>Mode:</strong> ${data.wlan0.mode || 'N/A'}</p>
                <p><strong>SSID:</strong> ${data.wlan0.ssid || 'N/A'}</p>
            `;
            container.appendChild(hotspotDiv);
        }
    } catch (error) {
        console.error('Error loading network:', error);
    }
}

function refreshNetwork() {
    loadNetwork();
    loadWifiCurrent();
}
