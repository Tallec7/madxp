#!/usr/bin/env node
/**
 * churn-detector.js — Claude Code PreToolUse hook (Edit + Write)
 *
 * Avertit si un fichier a été modifié 3+ fois en 7 jours.
 * Signal : zone instable → vérifier la root cause avant d'éditer encore.
 * Mode warn-only (n'annule pas l'edit).
 */

const { execSync } = require('child_process');

const THRESHOLD = 3;
const DAYS = 7;

let raw = '';
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    const data = JSON.parse(raw);
    filePath = data.tool_input?.file_path || '';
  } catch {
    process.exit(0);
  }

  if (!filePath) process.exit(0);

  try {
    const result = execSync(
      `git log --since="${DAYS} days ago" --oneline -- "${filePath}" 2>/dev/null | wc -l`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const count = parseInt(result.trim(), 10);

    if (count >= THRESHOLD) {
      const shortPath = filePath.replace(process.cwd() + '/', '');
      console.log(
        `⚠️ ZONE INSTABLE : ${shortPath} — ${count} modifications en ${DAYS} jours.\n` +
        `   Vérifie la root cause avant d'éditer à nouveau (pattern cascade).`
      );
    }
  } catch {
    // silencieux si git absent ou fichier non tracké
  }

  process.exit(0);
});
