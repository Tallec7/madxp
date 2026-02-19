// ============================================================================
// Mode Switcher - Club / Technicien
// ============================================================================

const MODE_STORAGE_KEY = 'neopro-admin-mode';
const MODE_CLUB = 'club';
const MODE_TECH = 'tech';

/**
 * Retourne le mode courant depuis localStorage (default: 'club')
 * @returns {'club'|'tech'}
 */
function getCurrentMode() {
    try {
        return localStorage.getItem(MODE_STORAGE_KEY) || MODE_CLUB;
    } catch {
        return MODE_CLUB;
    }
}

/**
 * Initialise le mode au chargement de la page :
 * - Lit localStorage
 * - Applique la classe CSS sur <body>
 * - Met à jour le toggle UI
 */
function initMode() {
    const mode = getCurrentMode();
    applyMode(mode);
}

/**
 * Bascule entre mode club et mode technicien
 */
function toggleMode() {
    const current = getCurrentMode();
    const next = current === MODE_CLUB ? MODE_TECH : MODE_CLUB;

    try {
        localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
        // localStorage indisponible (navigation privée, etc.)
    }

    applyMode(next);

    // Si l'utilisateur était sur un onglet tech-only en mode club, rediriger
    if (next === MODE_CLUB && (currentTab === 'logs' || currentTab === 'system')) {
        switchTab('dashboard');
    }

    // Re-render le dashboard pour basculer entre vue détaillée et simplifiée
    if (currentTab === 'dashboard') {
        loadDashboard();
    }
}

/**
 * Applique le mode : classe body, état du toggle, label
 * @param {'club'|'tech'} mode
 */
function applyMode(mode) {
    const body = document.body;
    body.classList.remove('mode-club', 'mode-tech');
    body.classList.add('mode-' + mode);

    // Mettre à jour le toggle switch
    const toggle = document.getElementById('mode-toggle');
    if (toggle) {
        toggle.checked = (mode === MODE_TECH);
    }

    const label = document.getElementById('mode-label');
    if (label) {
        label.textContent = mode === MODE_TECH ? 'Mode technicien' : 'Mode club';
    }
}
