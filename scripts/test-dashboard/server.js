#!/usr/bin/env node
/**
 * NEOPRO Test Dashboard
 *
 * Tableau de bord local pour :
 * - Suivre l'exécution des tests
 * - Lister et exécuter les tests par projet
 * - Documenter les bugs et observations
 * - Créer automatiquement des GitHub Issues
 *
 * Usage: npm start (depuis scripts/test-dashboard)
 * Ouvrir: http://localhost:3333
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = 3333;
const DATA_FILE = path.join(__dirname, 'test-data.json');
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Configuration des projets de tests
const TEST_PROJECTS = {
  'central-server': {
    name: 'Central Server (API)',
    path: 'central-server',
    framework: 'jest',
    command: 'npm test',
    testDir: 'src',
    testPattern: '**/*.test.ts',
    configFile: 'jest.config.js',
    icon: '🖥️'
  },
  'central-dashboard': {
    name: 'Central Dashboard (Angular)',
    path: 'central-dashboard',
    framework: 'karma',
    command: 'ng test --no-watch --browsers=ChromeHeadless',
    testDir: 'src/app',
    testPattern: '**/*.spec.ts',
    configFile: 'karma.conf.js',
    icon: '📊'
  },
  'sync-agent': {
    name: 'Sync Agent',
    path: 'raspberry/sync-agent',
    framework: 'jest',
    command: 'npm test',
    testDir: 'src/__tests__',
    testPattern: '**/*.test.js',
    configFile: 'package.json',
    icon: '🔄'
  },
  'e2e': {
    name: 'E2E (Playwright)',
    path: 'e2e',
    framework: 'playwright',
    command: 'npx playwright test',
    testDir: 'tests',
    testPattern: '**/*.spec.ts',
    configFile: 'playwright.config.ts',
    icon: '🎭'
  }
};

// Store pour les tests en cours
const runningTests = new Map();

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

// ==========================================
// API Tests par Projet
// ==========================================

// Liste des projets de tests
app.get('/api/projects', (req, res) => {
  const projects = Object.entries(TEST_PROJECTS).map(([id, config]) => ({
    id,
    ...config,
    fullPath: path.join(PROJECT_ROOT, config.path)
  }));
  res.json(projects);
});

// Liste des fichiers de tests pour un projet
app.get('/api/projects/:projectId/tests', async (req, res) => {
  const { projectId } = req.params;
  const project = TEST_PROJECTS[projectId];

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const testDir = path.join(PROJECT_ROOT, project.path, project.testDir);
    const tests = await findTestFiles(testDir, project.testPattern, project.framework);
    res.json({
      project: projectId,
      projectName: project.name,
      framework: project.framework,
      tests,
      count: tests.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trouver les fichiers de tests récursivement
async function findTestFiles(dir, pattern, framework) {
  const tests = [];

  if (!fs.existsSync(dir)) {
    return tests;
  }

  const walkDir = (currentDir, relativePath = '') => {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const relPath = path.join(relativePath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath, relPath);
      } else if (stat.isFile()) {
        const isTestFile = pattern.includes('.test.')
          ? file.endsWith('.test.ts') || file.endsWith('.test.js')
          : file.endsWith('.spec.ts') || file.endsWith('.spec.js');

        if (isTestFile) {
          // Parser le fichier pour extraire les describe/it
          const content = fs.readFileSync(filePath, 'utf-8');
          const testCases = parseTestFile(content, framework);

          tests.push({
            file: relPath,
            fullPath: filePath,
            name: file.replace(/\.(test|spec)\.(ts|js)$/, ''),
            testCases,
            testCount: testCases.reduce((sum, d) => sum + d.tests.length, 0)
          });
        }
      }
    }
  };

  walkDir(dir);
  return tests;
}

// Parser un fichier de test pour extraire les describe/it
function parseTestFile(content, framework) {
  const describes = [];
  const lines = content.split('\n');

  let currentDescribe = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match describe blocks
    const describeMatch = line.match(/describe\s*\(\s*['"`](.+?)['"`]/);
    if (describeMatch) {
      currentDescribe = {
        name: describeMatch[1],
        line: i + 1,
        tests: []
      };
      describes.push(currentDescribe);
    }

    // Match test/it blocks
    const testMatch = line.match(/(it|test)\s*\(\s*['"`](.+?)['"`]/);
    if (testMatch && currentDescribe) {
      currentDescribe.tests.push({
        name: testMatch[2],
        line: i + 1,
        type: testMatch[1]
      });
    }
  }

  return describes;
}

// Lancer les tests d'un projet
app.post('/api/projects/:projectId/run', (req, res) => {
  const { projectId } = req.params;
  const { testFile } = req.body; // optionnel: fichier spécifique
  const project = TEST_PROJECTS[projectId];

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Vérifier si des tests sont déjà en cours pour ce projet
  if (runningTests.has(projectId)) {
    return res.status(409).json({ error: 'Tests already running for this project' });
  }

  const runId = Date.now().toString();
  const projectPath = path.join(PROJECT_ROOT, project.path);

  // Construire la commande
  let command = project.command;
  if (testFile && project.framework === 'jest') {
    command = `npm test -- --testPathPattern="${testFile}"`;
  } else if (testFile && project.framework === 'playwright') {
    command = `npx playwright test "${testFile}"`;
  }

  // Ajouter les options pour Jest JSON output
  if (project.framework === 'jest') {
    command = command.replace('npm test', 'npm test -- --json --outputFile=jest-results.json');
  }

  const testRun = {
    id: runId,
    projectId,
    projectName: project.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    output: '',
    results: null
  };

  runningTests.set(projectId, testRun);

  // Lancer les tests en arrière-plan
  const child = spawn('bash', ['-c', command], {
    cwd: projectPath,
    env: { ...process.env, FORCE_COLOR: '1', CI: 'true' }
  });

  child.stdout.on('data', (data) => {
    testRun.output += data.toString();
  });

  child.stderr.on('data', (data) => {
    testRun.output += data.toString();
  });

  child.on('close', (code) => {
    testRun.status = code === 0 ? 'passed' : 'failed';
    testRun.finishedAt = new Date().toISOString();
    testRun.exitCode = code;

    // Parser les résultats selon le framework
    testRun.results = parseTestResults(testRun.output, project.framework, projectPath);

    // Sauvegarder dans l'historique
    const data = initDataFile();
    if (!data.projectRuns) data.projectRuns = {};
    if (!data.projectRuns[projectId]) data.projectRuns[projectId] = [];
    data.projectRuns[projectId].unshift(testRun);
    data.projectRuns[projectId] = data.projectRuns[projectId].slice(0, 20); // Garder 20 derniers
    saveData(data);

    runningTests.delete(projectId);
  });

  res.json({ runId, status: 'started', projectId });
});

// Obtenir le statut d'un test en cours
app.get('/api/projects/:projectId/status', (req, res) => {
  const { projectId } = req.params;
  const testRun = runningTests.get(projectId);

  if (testRun) {
    res.json(testRun);
  } else {
    // Retourner le dernier run
    const data = initDataFile();
    const lastRun = data.projectRuns?.[projectId]?.[0];
    res.json(lastRun || { status: 'idle', projectId });
  }
});

// Historique des runs d'un projet
app.get('/api/projects/:projectId/history', (req, res) => {
  const { projectId } = req.params;
  const data = initDataFile();
  const runs = data.projectRuns?.[projectId] || [];
  res.json(runs);
});

// Lancer tous les tests
app.post('/api/projects/run-all', async (req, res) => {
  const results = [];

  for (const [projectId, project] of Object.entries(TEST_PROJECTS)) {
    if (!runningTests.has(projectId)) {
      results.push({ projectId, status: 'queued' });
    }
  }

  res.json({ message: 'All tests queued', projects: results });
});

// Parser les résultats selon le framework
function parseTestResults(output, framework, projectPath) {
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    duration: 0,
    failedTests: [],
    suites: []
  };

  if (framework === 'jest') {
    // Essayer de lire le fichier JSON si disponible
    const jsonPath = path.join(projectPath, 'jest-results.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonResults = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        results.passed = jsonResults.numPassedTests || 0;
        results.failed = jsonResults.numFailedTests || 0;
        results.skipped = jsonResults.numPendingTests || 0;
        results.total = jsonResults.numTotalTests || 0;
        results.duration = jsonResults.testResults?.reduce((sum, t) => sum + (t.endTime - t.startTime), 0) || 0;

        // Extraire les tests échoués
        jsonResults.testResults?.forEach(suite => {
          suite.assertionResults?.forEach(test => {
            if (test.status === 'failed') {
              results.failedTests.push({
                name: test.fullName || test.title,
                file: suite.name,
                message: test.failureMessages?.join('\n') || ''
              });
            }
          });
        });

        fs.unlinkSync(jsonPath); // Nettoyer
        return results;
      } catch (e) {
        // Fallback au parsing de sortie
      }
    }

    // Parser la sortie Jest
    const passMatch = output.match(/Tests:\s*(\d+)\s*passed/);
    const failMatch = output.match(/(\d+)\s*failed/);
    const skipMatch = output.match(/(\d+)\s*skipped/);
    const totalMatch = output.match(/(\d+)\s*total/);

    results.passed = passMatch ? parseInt(passMatch[1]) : 0;
    results.failed = failMatch ? parseInt(failMatch[1]) : 0;
    results.skipped = skipMatch ? parseInt(skipMatch[1]) : 0;
    results.total = totalMatch ? parseInt(totalMatch[1]) : results.passed + results.failed + results.skipped;
  } else if (framework === 'karma') {
    // Parser la sortie Karma
    const successMatch = output.match(/(\d+)\s*SUCCESS/g);
    const failedMatch = output.match(/(\d+)\s*FAILED/g);

    results.passed = successMatch?.length || 0;
    results.failed = failedMatch?.length || 0;
    results.total = results.passed + results.failed;
  } else if (framework === 'playwright') {
    // Parser la sortie Playwright
    const passMatch = output.match(/(\d+)\s*passed/);
    const failMatch = output.match(/(\d+)\s*failed/);
    const skipMatch = output.match(/(\d+)\s*skipped/);

    results.passed = passMatch ? parseInt(passMatch[1]) : 0;
    results.failed = failMatch ? parseInt(failMatch[1]) : 0;
    results.skipped = skipMatch ? parseInt(skipMatch[1]) : 0;
    results.total = results.passed + results.failed + results.skipped;
  }

  return results;
}

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
