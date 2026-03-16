// ============================================================================
// MODE DEMO - Données mockées pour fonctionnement sans backend
// ============================================================================
// Detect if we're running on a real Pi or in demo mode
// Real Pi: neopro.local, 192.168.4.1 (hotspot), localhost, or any private IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
const isPrivateIP = (hostname) => {
    // Check for private IP ranges
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
};

const DEMO_MODE = !window.location.hostname.includes('neopro.local') &&
                  !window.location.hostname.includes('localhost') &&
                  !isPrivateIP(window.location.hostname);

const DEMO_DATA = {
    system: {
        hostname: 'neopro-demo',
        platform: 'linux',
        arch: 'arm64',
        uptime: '3 jours, 14 heures',
        cpu: {
            cores: 4,
            model: 'ARM Cortex-A72',
            usage: '32%'
        },
        memory: {
            total: '4.0 GB',
            free: '2.5 GB',
            used: '1.5 GB',
            percent: '38'
        },
        temperature: '48.5°C',
        disk: {
            filesystem: '/dev/mmcblk0p2',
            size: '32G',
            used: '12G',
            available: '18G',
            total: '32G',
            percent: '40'
        },
        services: {
            'neopro-app': 'running',
            'neopro-admin': 'running',
            'nginx': 'running',
            'hostapd': 'running',
            'dnsmasq': 'running'
        }
    },
    configuration: {
        clubName: 'Club Démo',
        ssid: 'NEOPRO-DEMO',
        version: '1.0.0',
        categories: [
            { id: 'focus-partenaires', name: 'Focus Partenaires', locked: false, subcategories: [] },
            { id: 'info-club', name: 'Info Club', locked: false, subcategories: [] },
            { id: 'match', name: 'Match', locked: false, subcategories: [
                { id: 'sm1', name: 'SM1' },
                { id: 'sm2', name: 'SM2' }
            ]},
            { id: 'jingles', name: 'Jingles', locked: true, subcategories: [] }
        ],
        timeCategories: [
            { id: 'avant-match', name: 'Avant-match', categories: ['focus-partenaires', 'info-club'] },
            { id: 'match', name: 'Match', categories: ['match', 'jingles'] },
            { id: 'apres-match', name: 'Après-match', categories: ['focus-partenaires'] }
        ],
        videos: [
            { category: 'focus-partenaires', filename: 'sponsor-principal.mp4', displayName: 'Sponsor Principal' },
            { category: 'focus-partenaires', filename: 'partenaire-local.mp4', displayName: 'Partenaire Local' },
            { category: 'info-club', filename: 'prochains-matchs.mp4', displayName: 'Prochains Matchs' },
            { category: 'info-club', filename: 'recrutement.mp4', displayName: 'Recrutement' },
            { category: 'match', subcategory: 'sm1', filename: 'but-1.mp4', displayName: 'But n°1' },
            { category: 'match', subcategory: 'sm1', filename: 'but-2.mp4', displayName: 'But n°2' },
            { category: 'jingles', filename: 'celebration.mp4', displayName: 'Célébration' },
            { category: 'jingles', filename: 'intro.mp4', displayName: 'Intro' }
        ]
    },
    network: {
        interfaces: {
            wlan0: [{ address: '192.168.4.1', netmask: '255.255.255.0', mac: 'dc:a6:32:xx:xx:xx', family: 'IPv4' }],
            wlan1: [{ address: '192.168.1.50', netmask: '255.255.255.0', mac: '00:e0:4c:xx:xx:xx', family: 'IPv4' }],
            eth0: []
        },
        wlan1: { ssid: 'ClubWifi-Demo', signal: -45, frequency: 2437 },
        hostname: 'neopro-demo'
    },
    logs: {
        app: `[2024-12-04 14:30:15] Server Socket.IO started on port 3000
[2024-12-04 14:30:16] Configuration loaded successfully
[2024-12-04 14:32:45] Client connected: remote-abc123
[2024-12-04 14:35:20] Video played: sponsor-principal.mp4
[2024-12-04 14:38:10] Video played: but-1.mp4
[2024-12-04 14:40:05] Client disconnected: remote-abc123
[2024-12-04 14:42:30] Client connected: tv-def456
[2024-12-04 14:45:00] Video played: partenaire-local.mp4`,
        nginx: `192.168.4.10 - - [04/Dec/2024:14:30:00 +0000] "GET /tv HTTP/1.1" 200 1234
192.168.4.10 - - [04/Dec/2024:14:30:02 +0000] "GET /remote HTTP/1.1" 200 2345
192.168.4.15 - - [04/Dec/2024:14:35:10 +0000] "GET /remote HTTP/1.1" 200 2345
192.168.4.15 - - [04/Dec/2024:14:35:15 +0000] "GET /socket.io/ HTTP/1.1" 101 0`,
        system: `Dec 04 14:30:00 neopro systemd[1]: Started Neopro Application
Dec 04 14:30:01 neopro systemd[1]: Started Neopro Admin Interface
Dec 04 14:30:02 neopro systemd[1]: Started nginx.service
Dec 04 14:30:03 neopro hostapd[1234]: wlan0: AP-ENABLED`
    }
};

// Intercepteur fetch pour le mode démo
if (DEMO_MODE) {
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        console.log('[DEMO] Intercepted fetch:', url);

        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        // Router vers les données mockées
        if (url.includes('/api/sync-status')) {
            return new Response(JSON.stringify({
                connected: true,
                lastSyncAt: new Date(Date.now() - 300000).toISOString(),
                pendingCommands: 0,
                deadLetters: 0,
                recentHistory: [
                    { type: 'central_to_local', timestamp: new Date(Date.now() - 300000).toISOString(), success: true, error: null },
                    { type: 'connection', timestamp: new Date(Date.now() - 600000).toISOString(), success: true, error: null },
                    { type: 'local_to_central', timestamp: new Date(Date.now() - 900000).toISOString(), success: true, error: null },
                ],
                error: null,
                lastErrorAt: null,
            }), { status: 200 });
        }

        if (url.includes('/api/system')) {
            // Varier légèrement les valeurs à chaque appel
            const data = JSON.parse(JSON.stringify(DEMO_DATA.system));
            data.cpu.usage = (25 + Math.random() * 20).toFixed(0) + '%';
            data.memory.percent = (35 + Math.random() * 10).toFixed(0);
            data.temperature = (45 + Math.random() * 10).toFixed(1) + '°C';
            return new Response(JSON.stringify(data), { status: 200 });
        }

        if (url.includes('/api/version')) {
            return new Response(JSON.stringify({
                version: DEMO_DATA.configuration.version,
                commit: 'demo',
                buildDate: new Date().toISOString(),
                source: 'demo-mode'
            }), { status: 200 });
        }

        if (url.includes('/api/configuration/time-categories')) {
            if (options.method === 'POST') {
                return new Response(JSON.stringify({ success: true, message: 'Configuration sauvegardée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify(DEMO_DATA.configuration.timeCategories), { status: 200 });
        }

        if (url.includes('/api/configuration/categories')) {
            if (options.method === 'POST') {
                return new Response(JSON.stringify({ success: true, message: 'Catégorie ajoutée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify(DEMO_DATA.configuration.categories), { status: 200 });
        }

        if (url.includes('/api/configuration')) {
            return new Response(JSON.stringify(DEMO_DATA.configuration), { status: 200 });
        }

        if (url.includes('/api/videos/orphans')) {
            return new Response(JSON.stringify({ orphans: [] }), { status: 200 });
        }

        if (url.includes('/api/videos/upload')) {
            return new Response(JSON.stringify({ success: true, message: 'Upload simulé (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/videos')) {
            if (options.method === 'DELETE') {
                return new Response(JSON.stringify({ success: true, message: 'Vidéo supprimée (mode démo)' }), { status: 200 });
            }
            return new Response(JSON.stringify({ videos: DEMO_DATA.configuration.videos }), { status: 200 });
        }

        if (url.includes('/api/network')) {
            return new Response(JSON.stringify(DEMO_DATA.network), { status: 200 });
        }

        if (url.includes('/api/logs/')) {
            const service = url.split('/api/logs/')[1].split('?')[0];
            const logs = DEMO_DATA.logs[service] || DEMO_DATA.logs.app;
            return new Response(JSON.stringify({ service, lines: logs }), { status: 200 });
        }

        if (url.includes('/api/services/') && url.includes('/restart')) {
            return new Response(JSON.stringify({ success: true, message: 'Service redémarré (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/system/reboot') || url.includes('/api/system/shutdown')) {
            return new Response(JSON.stringify({ success: true, message: 'Action simulée (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/update')) {
            return new Response(JSON.stringify({ success: true, message: 'Mise à jour simulée (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/thumbnails/regenerate')) {
            return new Response(JSON.stringify({ success: true, message: 'Régénération simulée (mode démo)' }), { status: 200 });
        }

        if (url.includes('/api/sponsors/stats')) {
            return new Response(JSON.stringify({ totalSponsors: 3, activeSponsors: 2, totalImpressions: 1250 }), { status: 200 });
        }

        if (url.includes('/api/sponsors')) {
            return new Response(JSON.stringify({ sponsors: [] }), { status: 200 });
        }

        if (url.includes('/api/backup')) {
            return new Response(JSON.stringify({ backups: [], lastBackup: null }), { status: 200 });
        }

        if (url.includes('/api/cache')) {
            return new Response(JSON.stringify({ size: '0 MB', entries: 0 }), { status: 200 });
        }

        if (url.includes('/api/email')) {
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        if (url.includes('/api/auth/')) {
            return new Response(JSON.stringify({ authenticated: true, user: 'demo' }), { status: 200 });
        }

        // Catch-all for any unhandled /api/ route — return safe JSON instead of HTML
        if (typeof url === 'string' && url.includes('/api/')) {
            console.warn('[DEMO] Unhandled API route:', url, '— returning empty JSON');
            return new Response(JSON.stringify({}), { status: 200 });
        }

        // Fallback: appel original (non-API calls)
        return originalFetch(url, options);
    };

    console.log('🎭 NEOPRO ADMIN - MODE DEMO ACTIVÉ');
}
