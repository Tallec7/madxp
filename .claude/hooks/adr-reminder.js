#!/usr/bin/env node
/**
 * ADR Reminder Hook (Stop)
 *
 * Rappelle de créer un ADR si la session a touché 2+ composants majeurs.
 * Basé sur `git diff` (déterministe, pas de LLM, pas de boucle).
 *
 * Composants trackés : central-server, central-dashboard, raspberry
 */

const { execSync } = require('child_process');

const COMPONENTS = ['central-server/', 'central-dashboard/', 'raspberry/'];

try {
  const diff = execSync('git diff --name-only HEAD', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const untracked = execSync('git ls-files --others --exclude-standard', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const files = (diff + untracked).split('\n').filter(Boolean);

  const touched = new Set();
  for (const file of files) {
    for (const comp of COMPONENTS) {
      if (file.startsWith(comp)) touched.add(comp);
    }
  }

  if (touched.size >= 2) {
    const list = [...touched].map((c) => c.replace('/', '')).join(' + ');
    console.log(
      `Cette session modifie ${list}. Pense à créer un ADR (docs/adr/) — template léger : docs/templates/TEMPLATE_ADR_LIGHT.md`
    );
  }
} catch {
  // git absent ou pas dans un repo — silencieux
}

process.exit(0);
