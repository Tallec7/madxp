#!/usr/bin/env node
/**
 * spec-autoload.js — Claude Code UserPromptSubmit hook
 *
 * Détecte le scope dans le prompt utilisateur et injecte automatiquement
 * l'en-tête de la SPEC correspondante (20 lignes max) comme contexte.
 *
 * Impacte uniquement les prompts qui mentionnent un domaine sensible.
 * Cap : 2 SPECs max par prompt pour éviter l'explosion de contexte.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MAX_LINES = 20;
const MAX_SPECS = 2;

const ROUTING = [
  {
    patterns: ['nlf', 'nantes loire', 'nantes-loire'],
    file: 'docs/clients/NLF.md',
    label: 'NLF (client critique)',
  },
  {
    patterns: ['saas', 'displays', 'resolvedconfig', 'site_type', 'club portal', 'portail club'],
    file: 'docs/specs/features/saas-mode.spec.md',
    label: 'SaaS & Club Portal',
  },
  {
    patterns: ['video-cycle', 'cycle vidéo', 'cycle video', 'ftp upload', 'uploaded_for_site'],
    file: 'docs/specs/features/video-cycle.spec.md',
    label: 'Vidéo cycle',
  },
  {
    patterns: ['sponsor', 'advertiser', 'agency', 'annonceur'],
    file: 'docs/specs/features/sponsors.spec.md',
    label: 'Sponsors & Pubs',
  },
  {
    patterns: ['template-studio', 'template studio', 'remotion', 'template_layers', 'templateruntime'],
    file: 'docs/specs/features/templates-studio.spec.md',
    label: 'Template Studio',
  },
  {
    patterns: ['match-session', 'match session', 'scoreboard', 'score update', 'club_session'],
    file: 'docs/specs/features/match-sessions.spec.md',
    label: 'Match sessions',
  },
  {
    patterns: ['hotspot', 'psk', 'hostapd', 'wifi_psk'],
    file: 'docs/specs/features/hotspot-psk.spec.md',
    label: 'Hotspot PSK',
  },
  {
    patterns: ['cron-scheduler', 'cron scheduler', 'recurring_schedule', 'executeSchedule'],
    file: 'docs/specs/services/cron-scheduler.spec.md',
    label: 'CRON scheduler',
  },
  {
    patterns: ['alerting', 'alert-repository', 'alertrepository', 'dedup alerte'],
    file: 'docs/specs/services/alert-repository.spec.md',
    label: 'Alerting & dédup',
  },
  {
    patterns: ['sync-agent', 'write-through', 'configuration.json', 'command-dispatch'],
    file: 'docs/specs/services/sync-agent-displays-write-through.spec.md',
    label: 'Sync-agent displays',
  },
  {
    patterns: ['socket.service', 'socket-service', 'saas-relay', 'socketio handler'],
    file: 'docs/specs/services/socket-service.spec.md',
    label: 'Socket service',
  },
];

function readSpecHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').slice(0, MAX_LINES).join('\n');
  } catch {
    return null;
  }
}

let raw = '';
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let prompt = '';
  try {
    const data = JSON.parse(raw);
    prompt = (data.prompt || '').toLowerCase();
  } catch {
    process.exit(0);
  }

  if (!prompt) process.exit(0);

  const matched = [];
  for (const route of ROUTING) {
    if (route.patterns.some((p) => prompt.includes(p))) {
      const fullPath = path.join(ROOT, route.file);
      const content = readSpecHeader(fullPath);
      if (content) matched.push({ label: route.label, file: route.file, content });
    }
  }

  if (matched.length === 0) process.exit(0);

  const toInject = matched.slice(0, MAX_SPECS);
  const output = toInject
    .map((m) => `⚡ SPEC auto-chargée [${m.label}] — ${m.file}\n${m.content}`)
    .join('\n\n---\n\n');

  console.log(output);
  process.exit(0);
});
