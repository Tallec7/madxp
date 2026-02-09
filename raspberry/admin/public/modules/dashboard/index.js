// ============================================================================
// Dashboard systeme + grille services
// ============================================================================

async function loadDashboard() {
    try {
        const response = await fetch('/api/system');
        console.log('[admin-ui] GET /api/system -> status', response.status);
        const data = await response.json();
        console.log('[admin-ui] /api/system payload', data);

        if (data.error) {
            console.error('Error loading system info:', data.error);
            return;
        }

        // Update hostname
        document.getElementById('hostname').textContent = data.hostname || 'neopro';

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

        // Update timestamp
        document.getElementById('last-update').textContent =
            'Dernière mise à jour: ' + new Date().toLocaleTimeString('fr-FR');

    } catch (error) {
        console.error('Error loading dashboard:', error);
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
