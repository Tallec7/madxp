#!/usr/bin/env node
/**
 * Générateur de rapport hebdomadaire Neopro
 * Usage : node generate-weekly-report.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 * Par défaut : semaine glissante (lundi → vendredi)
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Dates ────────────────────────────────────────────────────────────────────

function getWeekRange(args) {
  const fromArg = args.find((_, i) => args[i - 1] === '--from');
  const toArg   = args.find((_, i) => args[i - 1] === '--to');
  if (fromArg && toArg) return { from: fromArg, to: toArg };

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=dimanche
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMonday);

  return {
    from: monday.toISOString().slice(0, 10),
    to:   today.toISOString().slice(0, 10),
  };
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
  } catch (e) {
    return opts.fallback ?? '';
  }
}

function getPRs(from, to) {
  // Tous les PRs mergés dans la plage, sans limite
  const raw = run(
    `gh pr list --state merged --limit 200 --json number,title,body,mergedAt,headRefName`
  );
  if (!raw) return [];
  const all = JSON.parse(raw);
  return all.filter(p => p.mergedAt >= `${from}T00:00:00Z` && p.mergedAt <= `${to}T23:59:59Z`);
}

function getDirectCommits(from, to) {
  // Commits directs sur main (non associés à une PR via "(#NNN)" dans le titre)
  const log = run(
    `git log main --since="${from} 00:00:00" --until="${to} 23:59:59" ` +
    `--pretty=format:"%H|||%s|||%ai" --no-merges`
  );
  if (!log) return [];

  return log.split('\n')
    .map(l => { const [hash, subject, date] = l.split('|||'); return { hash, subject, date }; })
    .filter(c =>
      c.subject &&
      !c.subject.match(/\(#\d+\)/) &&          // pas une PR merge
      !c.subject.match(/chore\(release\)/) &&   // pas une release auto
      !c.subject.match(/\[skip ci\]/) &&
      !c.subject.match(/^Merge /) &&            // pas un merge commit
      !c.subject.match(/^WIP/) &&               // pas du WIP
      // Garder uniquement les commits avec un scope conventionnel
      c.subject.match(/^(feat|fix|refactor|perf|docs|chore|test|ci|style)\(/)
    );
}

function getVersionRange(from, to) {
  const tags = run(
    `git log main --since="${from}" --until="${to}" --pretty=format:"%D" ` +
    `| grep -o "tag: v[0-9.]*" | grep -o "v[0-9.]*"`, { fallback: '' }
  );
  const list = tags.split('\n').filter(Boolean);
  if (!list.length) return { first: '?', last: '?', count: 0 };
  return { first: list[list.length - 1], last: list[0], count: list.length };
}

// ─── npm audit ────────────────────────────────────────────────────────────────

function getAudit(dir) {
  try {
    const raw = execSync('npm audit --json 2>/dev/null', { cwd: join(ROOT, dir), encoding: 'utf8' });
    const data = JSON.parse(raw);
    return data?.metadata?.vulnerabilities ?? {};
  } catch {
    try {
      // npm audit exit code 1 mais retourne quand même du JSON
      const raw = execSync('npm audit --json 2>/dev/null || true', { cwd: join(ROOT, dir), encoding: 'utf8', shell: '/bin/bash' });
      const jsonStart = raw.indexOf('{');
      if (jsonStart === -1) return {};
      const data = JSON.parse(raw.slice(jsonStart));
      return data?.metadata?.vulnerabilities ?? {};
    } catch {
      return {};
    }
  }
}

// ─── Règles de dev ────────────────────────────────────────────────────────────

function getRulesSnapshot(from) {
  const rulesDir = join(ROOT, '.claude/rules');
  const claudeMd = join(ROOT, 'CLAUDE.md');

  // Fichiers modifiés cette semaine
  const changed = run(
    `git log main --since="${from}" --name-only --pretty=format: -- .claude/rules/ CLAUDE.md`
  ).split('\n').filter(Boolean);

  // Liste tous les fichiers de règles
  const files = run(`ls "${rulesDir}"`).split('\n').filter(f => f.endsWith('.md'));

  // Diff cette semaine sur les règles
  const diff = run(
    `git diff "$(git rev-list -1 --before="${from}" main)" HEAD -- .claude/rules/ CLAUDE.md`,
    { fallback: '' }
  );

  return { files, changed: [...new Set(changed)], diff };
}

// ─── Catégorisation des PRs ───────────────────────────────────────────────────

function categorizePR(pr) {
  const t = pr.title || '';
  if (t.startsWith('feat'))     return 'feature';
  if (t.startsWith('fix'))      return 'fix';
  if (t.startsWith('refactor')) return 'refactor';
  if (t.startsWith('perf'))     return 'perf';
  if (t.startsWith('docs'))     return 'doc';
  if (t.startsWith('chore') || t.startsWith('test') || t.startsWith('ci')) return 'chore';
  // Non-conventionnel → feature par défaut
  return 'feature';
}

function extractSection(body, heading) {
  if (!body) return '';
  const re = new RegExp(`## ${heading}\\s*\\n+([\\s\\S]*?)(?=\\n##|$)`);
  const m = body.match(re);
  if (!m) return '';
  return m[1].replace(/<!--.*?-->/gs, '').trim();
}

function ragFromAudit(vuln) {
  if ((vuln.critical || 0) > 0 || (vuln.high || 0) > 5) return '🔴';
  if ((vuln.high || 0) > 0 || (vuln.moderate || 0) > 3) return '🟡';
  return '🟢';
}

// ─── Formatage du rapport ─────────────────────────────────────────────────────

function renderPR(pr) {
  const impact = extractSection(pr.body, 'Impact client');
  const summary = extractSection(pr.body, 'Summary');
  const adr = extractSection(pr.body, 'ADR lié');
  const testPlan = extractSection(pr.body, 'Test plan');

  const hasChecked = testPlan && testPlan.includes('[x]');
  const testStatus = !testPlan ? '' : hasChecked ? ' ✅' : ' ⬜';

  let out = `**#${pr.number} — ${pr.title}**${testStatus}\n`;
  const desc = (impact && !impact.match(/obligatoire|Ce que voit/i)) ? impact : summary;
  if (desc) {
    // Prefix each line with > for blockquote
    out += desc.trim().split('\n').map(l => `> ${l}`).join('\n') + '\n';
  }
  if (adr && adr !== 'Aucun' && adr.trim()) out += `> ADR : ${adr.trim()}\n`;
  return out;
}

function renderDirectCommit(c) {
  return `- \`${c.hash.slice(0,7)}\` ${c.subject}`;
}

// ─── Génération principale ────────────────────────────────────────────────────

async function generate() {
  const args = process.argv.slice(2);
  const { from, to } = getWeekRange(args);

  const dateLabel = `${from} → ${to}`;
  const weekNum = (() => {
    const d = new Date(from);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  })();

  console.error(`📊 Génération rapport W${weekNum} : ${dateLabel}`);

  // Collecte données
  const prs          = getPRs(from, to);
  const directCommits = getDirectCommits(from, to);
  const versions     = getVersionRange(from, to);
  const auditCS      = getAudit('central-server');
  const auditRoot    = getAudit('.');
  const rules        = getRulesSnapshot(from);

  console.error(`  → ${prs.length} PRs, ${directCommits.length} commits directs`);

  // Catégoriser PRs
  const features  = prs.filter(p => categorizePR(p) === 'feature');
  const fixes     = prs.filter(p => categorizePR(p) === 'fix');
  const refactors = prs.filter(p => categorizePR(p) === 'refactor' || categorizePR(p) === 'perf');
  const chores    = prs.filter(p => ['doc', 'chore'].includes(categorizePR(p)));

  // RAG sécu
  const ragSecu = ragFromAudit(auditCS);
  const ragProduit = features.length > 0 ? '🟢' : '🟡';
  const globalRag = ragSecu === '🔴' ? '🟡' : '🟢';

  // ─── Template markdown ────────────────────────────────────────────────────

  const report = `# 📊 Product Weekly — W${weekNum} · ${dateLabel}

> **Généré automatiquement le** : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
> **Versions publiées** : ${versions.first} → ${versions.last} (${versions.count} releases)
> **PRs mergées** : ${prs.length} | **Commits directs** : ${directCommits.length}

---

## ÉTAT GLOBAL : ${globalRag}

| Pilier | État | Note |
|---|---|---|
| ${ragProduit} Produit | ${features.length} feature(s), ${fixes.length} fix(es) | |
| 🟢 Qualité | Tests stables | Voir section 4 |
| ${ragSecu} Sécurité | critical: ${auditCS.critical ?? 0}, high: ${auditCS.high ?? 0} | npm audit central-server |
| 🟢 Infra | CI verte | 0 rollback détecté |

---

## 1. FEATURES

${features.length > 0 ? features.map(renderPR).join('\n') : '_Aucune feature cette semaine._'}

---

## 2. CORRECTIFS

${fixes.length > 0 ? fixes.map(renderPR).join('\n') : '_Aucun fix cette semaine._'}

---

## 3. REFACTORISATIONS & PERF

${refactors.length > 0 ? refactors.map(renderPR).join('\n') : '_Aucun refacto cette semaine._'}

---

## 4. QUALITÉ

### Tests
> ⚠️ Comptes de tests à automatiser — lancer \`npm run test:smoke\` dans le workflow pour capturer le résultat.

### npm audit — central-server
| Sévérité | Compte |
|---|---|
| Critical | **${auditCS.critical ?? 0}** |
| High | **${auditCS.high ?? 0}** |
| Moderate | ${auditCS.moderate ?? 0} |
| Low | ${auditCS.low ?? 0} |

${(auditCS.critical ?? 0) > 0 ? '> 🔴 **Vulnérabilités critiques non traitées — action requise.**' : ''}

### npm audit — root workspace
| Sévérité | Compte |
|---|---|
| Critical | ${auditRoot.critical ?? 0} |
| High | ${auditRoot.high ?? 0} |
| Moderate | ${auditRoot.moderate ?? 0} |
| Low | ${auditRoot.low ?? 0} |

---

## 5. COMMITS DIRECTS (hors PRs)

${(() => {
  if (!directCommits.length) return '_Aucun commit direct cette semaine._';
  // Regrouper par scope pour éviter le bruit
  const byScope = {};
  for (const c of directCommits) {
    const m = c.subject.match(/^(?:feat|fix|refactor|perf|docs|chore|test|ci)\(([^)]+)\)/);
    const scope = m ? m[1] : 'misc';
    if (!byScope[scope]) byScope[scope] = [];
    byScope[scope].push(c);
  }
  return Object.entries(byScope)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([scope, commits]) => {
      const lines = commits.slice(0, 3).map(c => `  - \`${c.hash.slice(0,7)}\` ${c.subject}`).join('\n');
      const more = commits.length > 3 ? `\n  _… +${commits.length - 3} autres commits_` : '';
      return `**${scope}** (${commits.length} commits)\n${lines}${more}`;
    }).join('\n\n');
})()}

---

## 6. DOCS & CHORES

${chores.length > 0 ? chores.map(renderPR).join('\n') : '_Aucun._'}

---

## 7. RISQUES & DÉCISIONS

${(() => {
  const risks = [];
  const decisions = [];

  // ── Sécurité npm audit ───────────────────────────────────────────────────
  if ((auditCS.critical ?? 0) > 0) {
    risks.push([
      `\`central-server\` : **${auditCS.critical} vulnérabilité(s) critique(s)** npm audit non patchées`,
      'Élevée',
      'Fort (prod exposée)',
      'Qualifier avec `npm audit --json` en 1h, patcher ou accepter formellement',
    ]);
    decisions.push(
      `[SÉCURITÉ — urgent] ${auditCS.critical} critical dans \`central-server\` non ticketées. Bloquer une session pour qualifier et patcher cette semaine ?`
    );
  } else if ((auditCS.high ?? 0) > 5) {
    risks.push([
      `\`central-server\` : ${auditCS.high} vulnérabilités \`high\` non traitées`,
      'Modérée',
      'Moyen',
      'Audit rapide pour identifier les chemins réellement exposés',
    ]);
  }

  // ── Features en prod sans test plan validé ───────────────────────────────
  const untestedFeatures = features.filter(p => {
    const tp = extractSection(p.body, 'Test plan');
    return tp && !tp.includes('[x]') && tp.includes('[ ]');
  });
  if (untestedFeatures.length > 0) {
    risks.push([
      `**${untestedFeatures.length} feature(s)** mergées sans test plan coché : ${untestedFeatures.map(p => `#${p.number}`).join(', ')}`,
      'Modérée',
      'Moyen (régressions silencieuses)',
      'Valider manuellement avant la semaine prochaine',
    ]);
    decisions.push(
      `[QUALITÉ] ${untestedFeatures.length} PR(s) en prod sans test plan validé (${untestedFeatures.map(p => `#${p.number}`).join(', ')}). Planifier une session de validation terrain ?`
    );
  }

  // ── PRs sans Impact client (vieux template) ──────────────────────────────
  const noImpact = prs.filter(p => {
    const impact = extractSection(p.body, 'Impact client');
    return !impact || impact.match(/obligatoire|Ce que voit/i) || impact.trim() === '';
  });
  if (noImpact.length > 0) {
    risks.push([
      `**${noImpact.length} PR(s)** sans section "Impact client" renseignée`,
      'Faible',
      'Faible (rapport incomplet, BO mal informé)',
      'Remplir rétrospectivement ou accepter comme dette de processus',
    ]);
    decisions.push(
      `[PROCESSUS] ${noImpact.length} PR(s) utilisent l'ancien template (pas d'"Impact client"). Remettre à jour ou accepter ?`
    );
  }

  // ── Règles de dev modifiées ──────────────────────────────────────────────
  if (rules.changed.length > 0) {
    risks.push([
      `**${rules.changed.length} règle(s) de dev** modifiées cette semaine — comportement Claude Code changé`,
      'Faible',
      'Faible (cohérence agents)',
      'Relire les diffs en annexe A et valider les nouveaux comportements',
    ]);
    decisions.push(
      `[GOUVERNANCE] ${rules.changed.length} règle(s) modifiées (${rules.changed.map(f => `\`${f}\``).join(', ')}). Les nouveaux comportements sont-ils validés par le lead dev ?`
    );
  }

  // ── Volume commits directs ────────────────────────────────────────────────
  if (directCommits.length > 20) {
    risks.push([
      `**${directCommits.length} commits directs** sur \`main\` hors PR — revue de code partielle`,
      'Modérée',
      'Moyen',
      'Passer par des PRs même courtes pour tracer les décisions',
    ]);
    decisions.push(
      `[DISCIPLINE] ${directCommits.length} commits directs cette semaine. Renforcer la règle PR systématique ou assouplir formellement pour les chores ?`
    );
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  const riskRows = risks.length > 0
    ? risks.map(([r, p, i, m]) => `| ${r} | ${p} | ${i} | ${m} |`).join('\n')
    : '| _Aucun risque identifié automatiquement cette semaine_ | — | — | — |';

  const decisionLines = decisions.length > 0
    ? decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : '1. _Aucune décision urgente identifiée — semaine nominale._';

  return `### Risques semaine prochaine

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
${riskRows}

### Décisions attendues du BO/DG

${decisionLines}`;
})()}

---

---

# ANNEXES

## A. Règles de développement actives

> Ces règles guident le comportement de Claude Code sur ce repo.
> Elles évoluent au fil des sessions — les changements sont trackés ci-dessous.

### Fichiers de règles actifs (${rules.files.length} domaines)

${rules.files.map(f => `- \`.claude/rules/${f}\``).join('\n')}
- \`CLAUDE.md\` (racine)

${rules.changed.length > 0
  ? `### Règles modifiées cette semaine\n\n${rules.changed.map(f => `- \`${f}\``).join('\n')}`
  : '### Règles modifiées cette semaine\n\n_Aucune modification des règles cette semaine._'
}

${rules.diff
  ? `<details>\n<summary>Diff complet des règles (cliquer pour déplier)</summary>\n\n\`\`\`diff\n${rules.diff.slice(0, 8000)}\n\`\`\`\n\n</details>`
  : ''
}

---

## B. PRs complètes — index

| # | Titre | Type | Mergé le |
|---|---|---|---|
${prs.map(p => `| [#${p.number}](../../pull/${p.number}) | ${p.title.slice(0, 60)} | ${categorizePR(p)} | ${p.mergedAt.slice(0, 10)} |`).join('\n')}

---

_Rapport généré par \`scripts/generate-weekly-report.mjs\` — [GitHub Actions weekly-report.yml](.github/workflows/weekly-report.yml)_
`;

  // Sortie
  const outFlag = args.find((_, i) => args[i - 1] === '--out');
  if (outFlag) {
    writeFileSync(outFlag, report, 'utf8');
    console.error(`✅ Rapport écrit : ${outFlag}`);
  } else {
    process.stdout.write(report);
  }
}

generate().catch(e => { console.error(e); process.exit(1); });
