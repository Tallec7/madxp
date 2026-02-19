// ============================================================================
// Dashboard systeme + grille services
// ============================================================================

async function loadDashboard() {
    // Charger le sync status (indépendant des métriques système)
    loadSyncStatus();

    try {
        const response = await fetch('/api/system');
        console.log('[admin-ui] GET /api/system -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/system payload', data);

        if (data.error) {
            console.error('Error loading system info:', data.error);
            return;
        }

        // Update hostname (les deux modes)
        document.getElementById('hostname').textContent = data.hostname || 'neopro';

        const mode = getCurrentMode();

        if (mode === MODE_CLUB) {
            renderClubDashboard(data);
        } else {
            renderTechDashboard(data);
        }

        // Update timestamp (les deux modes)
        document.getElementById('last-update').textContent =
            'Dernière mise à jour: ' + new Date().toLocaleTimeString('fr-FR');

    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

/**
 * Dashboard simplifié pour le mode club :
 * Une seule carte "santé" avec indicateur vert/jaune/rouge
 */
function renderClubDashboard(data) {
    const cardsGrid = document.querySelector('#tab-dashboard .cards-grid');
    const healthCard = document.getElementById('health-status-card');

    if (cardsGrid) cardsGrid.style.display = 'none';
    if (healthCard) {
        healthCard.style.display = 'block';
        updateHealthStatus(data, healthCard);
    }
}

/**
 * Dashboard complet pour le mode technicien :
 * Toutes les cartes métriques détaillées
 */
function renderTechDashboard(data) {
    const cardsGrid = document.querySelector('#tab-dashboard .cards-grid');
    const healthCard = document.getElementById('health-status-card');

    if (cardsGrid) cardsGrid.style.display = '';
    if (healthCard) healthCard.style.display = 'none';

    // CPU
    document.getElementById('cpu-usage').textContent = data.cpu.usage;
    document.getElementById('cpu-cores').textContent = data.cpu.cores;
    const cpuPercent = parseFloat(data.cpu.usage);
    document.getElementById('cpu-progress').style.width = cpuPercent + '%';

    // Memory
    document.getElementById('mem-used').textContent = data.memory.used;
    document.getElementById('mem-total').textContent = data.memory.total;
    const memPercent = parseFloat(data.memory.percent);
    document.getElementById('mem-progress').style.width = memPercent + '%';

    // Temperature
    document.getElementById('temperature').textContent = data.temperature;
    const temp = parseFloat(data.temperature);
    const tempEl = document.getElementById('temperature');
    if (temp > 70) {
        tempEl.style.color = 'var(--danger)';
    } else if (temp > 60) {
        tempEl.style.color = 'var(--warning)';
    } else {
        tempEl.style.color = 'var(--success)';
    }

    // Disk
    if (data.disk) {
        document.getElementById('disk-used').textContent = data.disk.used;
        document.getElementById('disk-total').textContent = data.disk.total;
        const diskPercent = parseFloat(data.disk.percent);
        document.getElementById('disk-progress').style.width = diskPercent + '%';
    }

    // Uptime
    document.getElementById('uptime').textContent = data.uptime;

    // Services
    updateServicesGrid(data.services);
}

/**
 * Calcule et affiche l'état de santé global : vert / jaune / rouge
 */
function updateHealthStatus(data, card) {
    const cpu = parseFloat(data.cpu.usage);
    const mem = parseFloat(data.memory.percent);
    const temp = parseFloat(data.temperature);
    const disk = data.disk ? parseFloat(data.disk.percent) : 0;

    let status = 'green';
    let statusText = 'Système en bon état';
    let statusIcon = '✅';
    let details = [];

    // Seuils rouge (critique)
    if (cpu > 90) { status = 'red'; details.push('CPU très élevé'); }
    if (mem > 90) { status = 'red'; details.push('Mémoire critique'); }
    if (temp > 75) { status = 'red'; details.push('Température critique'); }
    if (disk > 95) { status = 'red'; details.push('Stockage quasi plein'); }

    // Seuils jaune (attention) — seulement si pas déjà rouge
    if (status !== 'red') {
        if (cpu > 70) { status = 'yellow'; details.push('CPU élevé'); }
        if (mem > 75) { status = 'yellow'; details.push('Mémoire élevée'); }
        if (temp > 60) { status = 'yellow'; details.push('Température élevée'); }
        if (disk > 80) { status = 'yellow'; details.push('Stockage limité'); }
    }

    if (status === 'red') {
        statusText = 'Problème détecté';
        statusIcon = '🔴';
    } else if (status === 'yellow') {
        statusText = 'Attention requise';
        statusIcon = '⚠️';
    }

    const detailsHtml = details.length > 0
        ? '<div class="health-details-list">' + details.join(' • ') + '</div>'
        : '';

    const bodyEl = card.querySelector('.health-body');
    if (bodyEl) {
        bodyEl.innerHTML = ''
            + '<div class="health-indicator health-' + status + '">'
            + '  <span class="health-icon">' + statusIcon + '</span>'
            + '  <div class="health-info">'
            + '    <span class="health-text">' + statusText + '</span>'
            + '    ' + detailsHtml
            + '  </div>'
            + '</div>'
            + '<div class="health-uptime">'
            + '  ⏱️ Uptime : <strong>' + (data.uptime || '--') + '</strong>'
            + '</div>';
    }
}

function updateServicesGrid(services) {
    if (!services || typeof services !== 'object') {
        console.warn('[admin-ui] Services data missing or invalid:', services);
        return;
    }

    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';

    for (const [name, status] of Object.entries(services)) {
        const item = document.createElement('div');
        item.className = 'service-item';
        item.innerHTML = `
            <span class="service-name">${name}</span>
            <span class="service-status ${status}">${status === 'running' ? '✓ Running' : '✗ Stopped'}</span>
        `;
        grid.appendChild(item);
    }
}
