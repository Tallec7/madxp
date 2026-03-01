// ============================================================================
// AUTHENTIFICATION - Ajout automatique des credentials pour les appels API
// ============================================================================
// Les appels fetch vers /api/* doivent inclure les cookies d'authentification
{
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        // Pour les appels API, toujours inclure les credentials (cookies)
        // Vérifie à la fois les URLs relatives (/api/) et absolues (http://.../api/)
        const isApiCall = typeof url === 'string' && (url.startsWith('/api/') || url.includes('/api/'));
        if (isApiCall) {
            options = { ...options, credentials: 'include' };
        }
        const response = await originalFetch(url, options);

        // Protection: si une réponse API renvoie du HTML au lieu de JSON,
        // remplacer par une réponse d'erreur JSON pour éviter les SyntaxError
        if (isApiCall && response.ok) {
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('text/html')) {
                console.error('[fetch] API returned HTML instead of JSON:', url, '— returning error JSON');
                return new Response(
                    JSON.stringify({ error: 'Réponse HTML inattendue du serveur', code: 'HTML_RESPONSE' }),
                    { status: 502, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }

        // Si une requête API retourne 401, rediriger vers la page de login
        if (response.status === 401 && isApiCall) {
            // Éviter les redirections multiples
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }

        return response;
    };
}

// État global
let currentTab = 'dashboard';
let currentLogService = 'app';
let refreshInterval = null;
let cachedVideos = []; // Toutes les vidéos (config + orphelines)
let cachedOrphanVideos = []; // Vidéos orphelines uniquement
let cachedConfig = null;
let cachedTimeCategories = [];
let availableCategories = [];
let currentVersionInfo = null;

// Connection status management
let connectionStatus = 'checking'; // 'online', 'offline', 'reconnecting', 'checking'
let lastSuccessfulRequest = Date.now();
let connectionCheckInterval = null;

// Bulk selection state
let selectedVideos = new Set();
let bulkModeEnabled = false;
