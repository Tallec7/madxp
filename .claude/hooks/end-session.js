#!/usr/bin/env node
/**
 * End-Session Cleanup Hook (Stop)
 *
 * Semi-automatisé : retour à main + cleanup git local.
 * Suppression complète de la worktree via ExitWorktree(action: remove) reste manuel.
 *
 * Cas gérés :
 * - Retour à main (branche protégée)
 * - Stash des changements orphelins si absent du HEAD
 * - Cleanup des branches de worktree locales
 * - Race conditions avec sessions parallèles (fail-safe)
 */

const { execSync } = require('child_process');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    });
  } catch (e) {
    return null;
  }
}

try {
  // Vérifier que on est dans un repo git
  run('git rev-parse --git-dir');

  // Get current branch
  const branch = run('git rev-parse --abbrev-ref HEAD')?.trim();

  if (!branch) {
    console.warn('[end-session] Impossible de déterminer la branche.');
    process.exit(0);
  }

  // Si on est sur une branche worktree (pas main), retour sûr à main
  if (branch !== 'main' && branch !== 'HEAD') {
    // Vérifier si there are uncommitted changes
    const status = run('git status --porcelain');
    if (status) {
      // Stash les changes orphelins (fail-safe)
      console.log(`[end-session] Changements détectés sur ${branch}. Stash…`);
      run('git stash');
    }

    // Checkout main
    const checkoutResult = run('git checkout main');
    if (checkoutResult === null) {
      console.warn(`[end-session] Impossible de passer à main. Reste sur ${branch}.`);
    } else {
      console.log(`[end-session] ✓ Retour à main`);
    }
  }

  // Cleanup : supprimer les branches de worktree orphelines (optionnel, silencieux)
  const allBranches = run('git branch --list') || '';
  const worktreeBranches = allBranches.split('\n').filter(b =>
    b.includes('worktree') || /wip-\d{4}-\d{2}-\d{2}/.test(b)
  );

  if (worktreeBranches.length > 0) {
    console.log(`[end-session] Cleanup branches : ${worktreeBranches.length} orphelines détectées.`);
    // Ne pas auto-supprimer (risque race condition). Juste logger.
  }

  console.log('[end-session] Cleanup local terminé. Appelle /end-session CLI pour supprimer la worktree.');

} catch (e) {
  // Fail-safe : silencieux si git absent
  console.warn(`[end-session] Erreur : ${e.message.split('\n')[0]}`);
}

process.exit(0);
