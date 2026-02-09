// ============================================================================
// Diagnostic hotspot
// ============================================================================

let lastHotspotResult = null;

async function runHotspotDiagnostic(autoFix) {
    if (DEMO_MODE) {
        showNotification('Mode démo : fonctionnalité non disponible', 'warning');
        return;
    }

    const loadingDiv = document.getElementById('hotspot-loading');
    const resultDiv = document.getElementById('hotspot-result');
    const diagBtn = document.getElementById('hotspot-diag-btn');
    const fixBtn = document.getElementById('hotspot-fix-btn');

    // Show loading
    loadingDiv.style.display = 'flex';
    resultDiv.style.display = 'none';
    diagBtn.disabled = true;
    fixBtn.disabled = true;

    try {
        const response = await fetch('/api/hotspot/fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoFix })
        });

        const result = await response.json();
        lastHotspotResult = result;

        loadingDiv.style.display = 'none';
        diagBtn.disabled = false;
        fixBtn.disabled = false;

        // Display the result
        displayHotspotResult(result, autoFix);

        // If channel was changed and needs reboot, show confirmation modal
        if (autoFix && result.fix?.channelChanged && result.fix?.needsReboot) {
            showRebootModal(result.fix.oldChannel, result.fix.newChannel);
        } else if (result.success) {
            showNotification(autoFix ? 'Diagnostic et réparation terminés' : 'Diagnostic terminé', 'success');
        }
    } catch (error) {
        console.error('Hotspot diagnostic error:', error);
        loadingDiv.style.display = 'none';
        diagBtn.disabled = false;
        fixBtn.disabled = false;
        showNotification('Erreur lors du diagnostic: ' + error.message, 'error');
    }
}

function displayHotspotResult(result, wasAutoFix) {
    const resultDiv = document.getElementById('hotspot-result');
    resultDiv.style.display = 'block';

    let html = '';

    // New JSON format from fix-hotspot.sh
    if (result.diagnostic) {
        html += '<div class="diagnostic-grid">';
        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">Canal actuel</span>
            <span class="diagnostic-value">${result.diagnostic.currentChannel}</span>
        </div>`;

        if (result.diagnostic.recommendedChannel !== result.diagnostic.currentChannel) {
            html += `<div class="diagnostic-item">
                <span class="diagnostic-label">Canal recommandé</span>
                <span class="diagnostic-value recommended">${result.diagnostic.recommendedChannel}</span>
            </div>`;
        }

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">SSID</span>
            <span class="diagnostic-value">${result.diagnostic.ssid || 'N/A'}</span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">hostapd</span>
            <span class="diagnostic-value ${result.diagnostic.hostapdActive ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.hostapdActive ? '✅ Actif' : '❌ Inactif'}
            </span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">dnsmasq</span>
            <span class="diagnostic-value ${result.diagnostic.dnsmasqActive ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.dnsmasqActive ? '✅ Actif' : '❌ Inactif'}
            </span>
        </div>`;

        html += `<div class="diagnostic-item">
            <span class="diagnostic-label">Alimentation</span>
            <span class="diagnostic-value ${result.diagnostic.powerOk ? 'text-success' : 'text-danger'}">
                ${result.diagnostic.powerOk ? '✅ OK' : '❌ Problème'}
            </span>
        </div>`;
        html += '</div>';

        // Show channel change pending message
        if (result.fix?.channelChanged && result.fix?.needsReboot) {
            html += `<div class="pending-reboot-info">
                <p>✅ Canal changé de ${result.fix.oldChannel} à ${result.fix.newChannel}.</p>
                <p>ℹ️ Le changement sera appliqué au prochain redémarrage du boîtier.</p>
            </div>`;
        }

        // Show message from script
        if (result.message) {
            html += `<div class="diagnostic-message">${result.message}</div>`;
        }
    }
    // Fallback: old format with checks array
    else if (result.checks) {
        html += '<div class="hotspot-checks">';
        result.checks.forEach(check => {
            const icon = check.status === 'ok' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
            const statusClass = `check-${check.status}`;
            html += `<div class="hotspot-check ${statusClass}">
                <span class="check-icon">${icon}</span>
                <span class="check-name">${check.name}</span>
                <span class="check-value">${check.value}</span>
            </div>`;
        });
        html += '</div>';
    }
    // Fallback: raw output
    else if (result.output) {
        html += `<pre class="output-viewer">${result.output}</pre>`;
    }

    resultDiv.innerHTML = html;
}

function showRebootModal(oldChannel, newChannel) {
    const modal = document.getElementById('reboot-modal');
    const message = document.getElementById('reboot-modal-message');
    message.innerHTML = `Le canal WiFi a été changé de <strong>${oldChannel}</strong> à <strong>${newChannel}</strong>.
        Pour appliquer ce changement, le boîtier doit redémarrer (~1 minute d'interruption).`;
    modal.style.display = 'flex';
}

function cancelHotspotReboot() {
    const modal = document.getElementById('reboot-modal');
    modal.style.display = 'none';
    showNotification('Le changement de canal sera appliqué au prochain redémarrage', 'info');
}

async function confirmHotspotReboot() {
    const modal = document.getElementById('reboot-modal');
    const confirmBtn = document.getElementById('reboot-confirm-btn');

    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ Redémarrage...';

    try {
        const response = await fetch('/api/system/reboot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            modal.style.display = 'none';
            showNotification('Redémarrage en cours... Le boîtier sera de nouveau en ligne dans ~1 minute', 'success');
        } else {
            throw new Error('Erreur lors du redémarrage');
        }
    } catch (error) {
        console.error('Reboot error:', error);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '🔄 Redémarrer maintenant';
        showNotification('Erreur lors du redémarrage: ' + error.message, 'error');
    }
}
