#!/usr/bin/env node
/**
 * NEOPRO Test Dashboard
 *
 * Tableau de bord local pour :
 * - Suivre l'exécution des tests
 * - Documenter les bugs et observations
 * - Créer automatiquement des GitHub Issues
 *
 * Usage: npm start (depuis scripts/test-dashboard)
 * Ouvrir: http://localhost:3333
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

const app = express();
const PORT = 3333;
const DATA_FILE = path.join(__dirname, 'test-data.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialiser le fichier de données
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      sessions: [],
      bugs: [],
      notes: [],
      lastTestRun: null,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API Routes

// Obtenir toutes les données
app.get('/api/data', (req, res) => {
  const data = initDataFile();
  res.json(data);
});

// Lancer les tests
app.post('/api/run-tests', (req, res) => {
  const { mode = 'quick' } = req.body;
  const projectRoot = path.resolve(__dirname, '../..');

  const command = mode === 'full'
    ? 'node scripts/quick-test.js --full --skip-pi 2>&1'
    : 'node scripts/quick-test.js --skip-pi 2>&1';

  exec(command, { cwd: projectRoot, timeout: 300000 }, (error, stdout, stderr) => {
    const data = initDataFile();

    // Parser les résultats
    const passedMatch = stdout.match(/Réussis:\s*(\d+)/);
    const failedMatch = stdout.match(/Échoués:\s*(\d+)/);
    const skippedMatch = stdout.match(/Ignorés:\s*(\d+)/);

    const session = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      mode,
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
      success: !error,
      output: stdout,
    };

    data.sessions.unshift(session);
    data.sessions = data.sessions.slice(0, 50); // Garder 50 dernières sessions
    data.lastTestRun = session.timestamp;
    saveData(data);

    res.json(session);
  });
});

// Ajouter un bug
app.post('/api/bugs', (req, res) => {
  const { title, description, severity, component, steps } = req.body;
  const data = initDataFile();

  const bug = {
    id: Date.now().toString(),
    title,
    description,
    severity: severity || 'medium',
    component: component || 'general',
    steps: steps || '',
    status: 'open',
    createdAt: new Date().toISOString(),
    githubIssue: null,
  };

  data.bugs.unshift(bug);
  saveData(data);
  res.json(bug);
});

// Mettre à jour un bug
app.put('/api/bugs/:id', (req, res) => {
  const data = initDataFile();
  const bugIndex = data.bugs.findIndex(b => b.id === req.params.id);

  if (bugIndex === -1) {
    return res.status(404).json({ error: 'Bug not found' });
  }

  data.bugs[bugIndex] = { ...data.bugs[bugIndex], ...req.body, updatedAt: new Date().toISOString() };
  saveData(data);
  res.json(data.bugs[bugIndex]);
});

// Supprimer un bug
app.delete('/api/bugs/:id', (req, res) => {
  const data = initDataFile();
  data.bugs = data.bugs.filter(b => b.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// Créer une GitHub Issue
app.post('/api/bugs/:id/create-issue', async (req, res) => {
  const data = initDataFile();
  const bug = data.bugs.find(b => b.id === req.params.id);

  if (!bug) {
    return res.status(404).json({ error: 'Bug not found' });
  }

  // Vérifier que gh CLI est disponible
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    return res.status(400).json({
      error: 'GitHub CLI not installed',
      help: 'Install with: brew install gh && gh auth login'
    });
  }

  // Construire le body de l'issue
  const severityLabel = {
    critical: 'bug: critical',
    high: 'bug: high',
    medium: 'bug',
    low: 'bug: low',
  }[bug.severity] || 'bug';

  const body = `## Description
${bug.description}

## Steps to Reproduce
${bug.steps || 'N/A'}

## Component
${bug.component}

## Severity
${bug.severity}

---
*Created from Neopro Test Dashboard*`;

  try {
    const projectRoot = path.resolve(__dirname, '../..');
    const result = execSync(
      `gh issue create --title "${bug.title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" --label "${severityLabel}"`,
      { cwd: projectRoot, encoding: 'utf-8' }
    );

    // Extraire l'URL de l'issue
    const issueUrl = result.trim();

    // Mettre à jour le bug
    const bugIndex = data.bugs.findIndex(b => b.id === req.params.id);
    data.bugs[bugIndex].githubIssue = issueUrl;
    data.bugs[bugIndex].status = 'reported';
    saveData(data);

    res.json({ success: true, issueUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create issue', details: error.message });
  }
});

// Ajouter une note
app.post('/api/notes', (req, res) => {
  const { content, category } = req.body;
  const data = initDataFile();

  const note = {
    id: Date.now().toString(),
    content,
    category: category || 'general',
    createdAt: new Date().toISOString(),
  };

  data.notes.unshift(note);
  data.notes = data.notes.slice(0, 100); // Garder 100 dernières notes
  saveData(data);
  res.json(note);
});

// Supprimer une note
app.delete('/api/notes/:id', (req, res) => {
  const data = initDataFile();
  data.notes = data.notes.filter(n => n.id !== req.params.id);
  saveData(data);
  res.json({ success: true });
});

// Exporter les données
app.get('/api/export', (req, res) => {
  const data = initDataFile();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=neopro-test-report-${new Date().toISOString().split('T')[0]}.json`);
  res.json(data);
});

// Exporter en Markdown
app.get('/api/export/markdown', (req, res) => {
  const data = initDataFile();

  let md = `# Rapport de Test Neopro\n\n`;
  md += `**Date:** ${new Date().toLocaleDateString('fr-FR')}\n\n`;

  // Bugs
  md += `## Bugs (${data.bugs.length})\n\n`;
  for (const bug of data.bugs) {
    const statusEmoji = bug.status === 'closed' ? '✅' : bug.status === 'reported' ? '📝' : '🔴';
    md += `### ${statusEmoji} ${bug.title}\n\n`;
    md += `- **Sévérité:** ${bug.severity}\n`;
    md += `- **Composant:** ${bug.component}\n`;
    md += `- **Status:** ${bug.status}\n`;
    if (bug.githubIssue) {
      md += `- **GitHub:** ${bug.githubIssue}\n`;
    }
    md += `\n${bug.description}\n\n`;
    if (bug.steps) {
      md += `**Steps to Reproduce:**\n${bug.steps}\n\n`;
    }
    md += `---\n\n`;
  }

  // Notes
  if (data.notes.length > 0) {
    md += `## Notes\n\n`;
    for (const note of data.notes) {
      md += `- [${note.category}] ${note.content}\n`;
    }
    md += `\n`;
  }

  // Dernière session de test
  if (data.sessions.length > 0) {
    const last = data.sessions[0];
    md += `## Dernière Session de Test\n\n`;
    md += `- **Date:** ${new Date(last.timestamp).toLocaleString('fr-FR')}\n`;
    md += `- **Mode:** ${last.mode}\n`;
    md += `- **Réussis:** ${last.passed}\n`;
    md += `- **Échoués:** ${last.failed}\n`;
    md += `- **Ignorés:** ${last.skipped}\n`;
  }

  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename=neopro-test-report-${new Date().toISOString().split('T')[0]}.md`);
  res.send(md);
});

// Démarrer le serveur avec gestion d'erreur
const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           NEOPRO - Test Dashboard                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log('');
  console.log('Fonctionnalités:');
  console.log('  • Lancer et suivre les tests');
  console.log('  • Documenter les bugs');
  console.log('  • Créer des GitHub Issues automatiquement');
  console.log('  • Exporter les rapports (JSON/Markdown)');
  console.log('');
  console.log('Ctrl+C pour arrêter');
});

// Gestion du port déjà utilisé
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`❌ Erreur: Le port ${PORT} est déjà utilisé.`);
    console.error('');
    console.error('Solutions:');
    console.error(`  1. Tuer le processus: lsof -ti :${PORT} | xargs kill`);
    console.error(`  2. Utiliser un autre port: PORT=3334 npm run test:dashboard`);
    console.error('');
    process.exit(1);
  } else {
    throw err;
  }
});
