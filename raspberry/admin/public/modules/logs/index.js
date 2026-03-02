// ============================================================================
// Visionneuse de logs - avec coloration et filtre
// ============================================================================

/** @type {string[]} Raw log lines from last fetch */
var _rawLogLines = [];

function initLogButtons() {
    var buttons = document.querySelectorAll('[data-log]');
    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            buttons.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            currentLogService = btn.dataset.log;
            loadLogs(currentLogService);
        });
    });
}

async function loadLogs(service) {
    var linesSelect = document.getElementById('logs-lines');
    var lines = linesSelect ? linesSelect.value : '100';

    try {
        var response = await fetch('/api/logs/' + service + '?lines=' + lines);
        var data = await response.json();

        var rawText = data.logs || 'Aucun log disponible';
        _rawLogLines = rawText.split('\n');

        renderLogLines();
    } catch (error) {
        console.error('Error loading logs:', error);
        var container = document.getElementById('logs-content');
        if (container) {
            container.innerHTML = '<span class="log-line log-error">Erreur de chargement des logs</span>';
        }
    }
}

/**
 * Render log lines with colorization and filter applied
 */
function renderLogLines() {
    var container = document.getElementById('logs-content');
    if (!container) return;

    var filterInput = document.getElementById('logs-filter');
    var filter = filterInput ? filterInput.value.toLowerCase() : '';

    var visibleLines = _rawLogLines;
    if (filter) {
        visibleLines = _rawLogLines.filter(function (line) {
            return line.toLowerCase().includes(filter);
        });
    }

    var html = visibleLines.map(function (line) {
        var cssClass = getLogLineClass(line);
        var escaped = escapeHtml(line);
        if (filter && escaped) {
            var regex = new RegExp('(' + escapeRegex(filter) + ')', 'gi');
            escaped = escaped.replace(regex, '<mark>$1</mark>');
        }
        return '<div class="log-line ' + cssClass + '">' + escaped + '</div>';
    }).join('');

    container.innerHTML = html || '<div class="log-line">Aucun résultat</div>';
    container.scrollTop = container.scrollHeight;

    var countLabel = document.getElementById('logs-count');
    if (countLabel) {
        if (filter) {
            countLabel.textContent = visibleLines.length + ' / ' + _rawLogLines.length + ' lignes';
        } else {
            countLabel.textContent = _rawLogLines.length + ' lignes';
        }
    }
}

/**
 * Determine CSS class for a log line based on content
 */
function getLogLineClass(line) {
    var upper = line.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('ERR]') || upper.includes('FATAL') || upper.includes('CRIT')) {
        return 'log-error';
    }
    if (upper.includes('WARN') || upper.includes('WARNING')) {
        return 'log-warn';
    }
    if (upper.includes('DEBUG') || upper.includes('TRACE')) {
        return 'log-debug';
    }
    return 'log-info';
}

function filterLogs() {
    renderLogLines();
}

function refreshLogs() {
    loadLogs(currentLogService);
}

/**
 * Escape regex special characters for highlight matching
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
