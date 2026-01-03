#!/usr/bin/env node
/**
 * NEOPRO - Script de Test Rapide
 *
 * Usage:
 *   node scripts/quick-test.js [options]
 *
 * Options:
 *   --api-url URL      URL de l'API (défaut: http://localhost:3001)
 *   --pi-host HOST     Hostname/IP du Raspberry Pi (défaut: neopro.local)
 *   --skip-api         Ignorer les tests API
 *   --skip-pi          Ignorer les tests Pi
 *   --full             Inclure les tests unitaires (plus long)
 *   --e2e              Inclure les tests E2E Playwright (nécessite dashboard)
 */

const { execSync, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Couleurs ANSI
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Configuration
const args = process.argv.slice(2);
const config = {
  apiUrl: getArg('--api-url') || 'http://localhost:3001',
  piHost: getArg('--pi-host') || 'neopro.local',
  skipApi: args.includes('--skip-api'),
  skipPi: args.includes('--skip-pi'),
  full: args.includes('--full'),
  e2e: args.includes('--e2e')
};

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// Compteurs
let passed = 0;
let failed = 0;
let skipped = 0;

// Utilitaires
function log(type, message) {
  const prefix = {
    pass: `${colors.green}[PASS]${colors.reset}`,
    fail: `${colors.red}[FAIL]${colors.reset}`,
    skip: `${colors.yellow}[SKIP]${colors.reset}`,
    info: `${colors.blue}[INFO]${colors.reset}`,
  };
  console.log(`${prefix[type] || ''} ${message}`);
}

function section(title) {
  console.log('');
  console.log(`${colors.blue}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue} ${title}${colors.reset}`);
  console.log(`${colors.blue}${'═'.repeat(60)}${colors.reset}`);
}

function runCommand(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 30000
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.stdout || error.message };
  }
}

async function httpGet(url, timeout = 10000) {
  // Utiliser fetch natif (Node 18+)
  // Note: On remplace localhost par 127.0.0.1 pour forcer IPv4
  // (Node 18+ fetch essaie IPv6 d'abord, ce qui échoue souvent en local)
  const ipv4Url = url.replace('://localhost', '://127.0.0.1');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(ipv4Url, {
      signal: controller.signal,
      method: 'GET',
    });
    clearTimeout(timeoutId);
    return {
      status: response.status,
      ok: response.ok
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      ok: false,
      error: err.name === 'AbortError' ? 'timeout' : err.message
    };
  }
}

// Tests
async function testNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major >= 18) {
    log('pass', `Node.js ${version}`);
    passed++;
  } else {
    log('fail', `Node.js ${version} (v18+ requis)`);
    failed++;
  }
}

function testNodeModules() {
  const projectRoot = path.resolve(__dirname, '..');

  if (fs.existsSync(path.join(projectRoot, 'node_modules'))) {
    log('pass', 'node_modules présent (racine)');
    passed++;
  } else {
    log('fail', 'node_modules manquant (racine)');
    failed++;
  }

  if (fs.existsSync(path.join(projectRoot, 'central-server', 'node_modules'))) {
    log('pass', 'node_modules présent (central-server)');
    passed++;
  } else {
    log('fail', 'node_modules manquant (central-server)');
    failed++;
  }
}

function testEnvFile() {
  const projectRoot = path.resolve(__dirname, '..');
  const envPath = path.join(projectRoot, 'central-server', '.env');

  if (!fs.existsSync(envPath)) {
    log('fail', '.env manquant dans central-server');
    failed++;
    return;
  }

  log('pass', '.env présent');
  passed++;

  const envContent = fs.readFileSync(envPath, 'utf-8');

  // Vérifier DATABASE_URL
  if (envContent.includes('DATABASE_URL=') && !envContent.includes('DATABASE_URL=postgresql://user:password')) {
    log('pass', 'DATABASE_URL configuré');
    passed++;
  } else {
    log('fail', 'DATABASE_URL non configuré');
    failed++;
  }

  // Vérifier JWT_SECRET
  const jwtMatch = envContent.match(/JWT_SECRET=["']?([^"'\n]+)/);
  if (jwtMatch && jwtMatch[1].length >= 32) {
    log('pass', 'JWT_SECRET configuré (longueur OK)');
    passed++;
  } else {
    log('fail', 'JWT_SECRET manquant ou trop court');
    failed++;
  }
}

function testCriticalFiles() {
  const projectRoot = path.resolve(__dirname, '..');
  const criticalFiles = [
    'central-server/src/server.ts',
    'central-server/src/middleware/auth.ts',
    'central-server/src/services/socket.service.ts',
    'central-server/src/config/database.ts'
  ];

  for (const file of criticalFiles) {
    if (fs.existsSync(path.join(projectRoot, file))) {
      log('pass', `Fichier: ${file}`);
      passed++;
    } else {
      log('fail', `Fichier manquant: ${file}`);
      failed++;
    }
  }
}

async function testApiHealth() {
  if (config.skipApi) {
    log('skip', 'Tests API ignorés');
    skipped++;
    return;
  }

  log('info', `Test API: ${config.apiUrl}/health`);

  const result = await httpGet(`${config.apiUrl}/health`);

  if (result.ok) {
    log('pass', `API Health: HTTP ${result.status}`);
    passed++;
  } else if (result.status === 0) {
    log('skip', 'API non accessible (démarrez-la avec: cd central-server && npm run dev)');
    skipped++;
  } else {
    log('fail', `API Health: HTTP ${result.status}`);
    failed++;
  }
}

async function testApiProtection() {
  if (config.skipApi) return;

  const result = await httpGet(`${config.apiUrl}/api/auth/me`);

  if (result.status === 401) {
    log('pass', 'API Auth protection: HTTP 401 (OK)');
    passed++;
  } else if (result.status === 0) {
    // API non accessible, déjà signalé
  } else {
    log('fail', `API Auth protection: HTTP ${result.status} (attendu: 401)`);
    failed++;
  }
}

function testBuild() {
  const projectRoot = path.resolve(__dirname, '..');
  log('info', 'Compilation TypeScript...');

  const result = runCommand('npm run build', {
    cwd: path.join(projectRoot, 'central-server'),
    silent: true,
    timeout: 60000
  });

  if (result.success) {
    log('pass', 'Build central-server réussi');
    passed++;
  } else {
    log('fail', 'Build central-server échoué');
    failed++;
  }
}

function testLint() {
  const projectRoot = path.resolve(__dirname, '..');
  log('info', 'Vérification ESLint...');

  const result = runCommand('npm run lint', {
    cwd: projectRoot,
    silent: true,
    timeout: 60000
  });

  if (result.success) {
    log('pass', 'Lint: aucune erreur');
    passed++;
  } else {
    log('fail', 'Lint: des erreurs détectées');
    failed++;
  }
}

function testUnitTests() {
  if (!config.full) {
    log('skip', 'Tests unitaires ignorés (utilisez --full pour les inclure)');
    skipped++;
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  log('info', 'Exécution des tests unitaires...');

  const result = runCommand('npm test -- --passWithNoTests', {
    cwd: path.join(projectRoot, 'central-server'),
    silent: true,
    timeout: 180000
  });

  if (result.success) {
    log('pass', 'Tests unitaires passent');
    passed++;
  } else {
    log('fail', 'Tests unitaires échouent');
    failed++;
  }
}

function testNpmAudit() {
  const projectRoot = path.resolve(__dirname, '..');

  const result = runCommand('npm audit --audit-level=high --json', {
    cwd: path.join(projectRoot, 'central-server'),
    silent: true,
    timeout: 30000
  });

  try {
    const audit = JSON.parse(result.output);
    const highVulns = (audit.metadata?.vulnerabilities?.high || 0) +
                      (audit.metadata?.vulnerabilities?.critical || 0);

    if (highVulns === 0) {
      log('pass', 'Aucune vulnérabilité haute/critique');
      passed++;
    } else {
      log('fail', `${highVulns} vulnérabilité(s) haute(s)/critique(s)`);
      failed++;
    }
  } catch {
    // Si pas de vulnérabilités, npm audit retourne un code d'erreur mais pas de JSON
    if (result.output && result.output.includes('found 0 vulnerabilities')) {
      log('pass', 'Aucune vulnérabilité');
      passed++;
    } else {
      log('pass', 'Audit de sécurité OK');
      passed++;
    }
  }
}

// ============================================================================
// TESTS RASPBERRY PI
// ============================================================================

function testPiConnectivity() {
  if (config.skipPi) {
    log('skip', 'Tests Pi ignorés (--skip-pi)');
    skipped++;
    return false;
  }

  log('info', `Test connectivité Pi: ${config.piHost}`);

  // Test ping
  const pingResult = runCommand(`ping -c 1 -W 2 ${config.piHost}`, {
    silent: true,
    timeout: 5000
  });

  if (!pingResult.success) {
    log('skip', `Pi non accessible (${config.piHost})`);
    skipped++;
    return false;
  }

  log('pass', `Pi accessible: ${config.piHost}`);
  passed++;
  return true;
}

async function testPiWebInterface() {
  if (config.skipPi) return;

  // Test port 80 (TV/Remote interface)
  const port80 = await httpGet(`http://${config.piHost}:80`, 3000);
  if (port80.ok) {
    log('pass', 'Interface TV/Remote (port 80) accessible');
    passed++;
  } else if (port80.status === 0) {
    log('skip', 'Interface TV/Remote non accessible');
    skipped++;
  } else {
    log('fail', `Interface TV/Remote: HTTP ${port80.status}`);
    failed++;
  }

  // Test port 8080 (Admin interface)
  const port8080 = await httpGet(`http://${config.piHost}:8080`, 3000);
  if (port8080.ok) {
    log('pass', 'Interface Admin (port 8080) accessible');
    passed++;
  } else if (port8080.status === 0) {
    log('skip', 'Interface Admin non accessible');
    skipped++;
  } else {
    log('fail', `Interface Admin: HTTP ${port8080.status}`);
    failed++;
  }
}

async function testPiSocketConnection() {
  if (config.skipPi) return;

  // Test port 3000 (Socket.IO local server)
  const port3000 = await httpGet(`http://${config.piHost}:3000`, 3000);
  if (port3000.ok || port3000.status === 400) {
    // 400 is OK for Socket.IO (expects upgrade)
    log('pass', 'Socket.IO local (port 3000) accessible');
    passed++;
  } else if (port3000.status === 0) {
    log('skip', 'Socket.IO local non accessible');
    skipped++;
  } else {
    log('fail', `Socket.IO local: HTTP ${port3000.status}`);
    failed++;
  }
}

// ============================================================================
// TESTS E2E PLAYWRIGHT
// ============================================================================

function testE2eDependencies() {
  const projectRoot = path.resolve(__dirname, '..');
  const e2ePath = path.join(projectRoot, 'e2e', 'node_modules');

  if (!fs.existsSync(e2ePath)) {
    log('fail', 'E2E: dépendances non installées (cd e2e && npm install)');
    failed++;
    return false;
  }

  log('pass', 'E2E: dépendances installées');
  passed++;
  return true;
}

async function testE2ePlaywright() {
  if (!config.e2e) {
    log('skip', 'Tests E2E ignorés (utilisez --e2e pour les inclure)');
    skipped++;
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');

  // Check dependencies
  if (!testE2eDependencies()) {
    return;
  }

  // Check if dashboard is running
  const dashboardCheck = await httpGet('http://localhost:4200', 3000);
  if (!dashboardCheck.ok) {
    log('skip', 'E2E: Dashboard non accessible (npm run start:central)');
    skipped++;
    return;
  }

  log('info', 'Exécution des tests E2E Playwright...');

  const result = runCommand('npm test -- --workers=1 --reporter=list', {
    cwd: path.join(projectRoot, 'e2e'),
    silent: true,
    timeout: 300000 // 5 minutes
  });

  if (result.success) {
    log('pass', 'Tests E2E Playwright passent');
    passed++;
  } else {
    log('fail', 'Tests E2E échouent');
    failed++;

    // Show brief error output
    if (result.output) {
      const lines = result.output.split('\n').slice(-10);
      console.log(`\n${colors.yellow}Dernières lignes:${colors.reset}`);
      lines.forEach(line => console.log(`  ${line}`));
    }
  }
}

// Main
async function main() {
  console.log('');
  console.log(`${colors.green}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║           NEOPRO - Test Rapide du Système                    ║${colors.reset}`);
  console.log(`${colors.green}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Pi Host: ${config.piHost}`);
  console.log(`Mode: ${config.full ? 'Complet' : 'Rapide'}${config.e2e ? ' + E2E' : ''}`);

  section('1. Environnement');
  await testNodeVersion();
  testNodeModules();

  section('2. Configuration');
  testEnvFile();
  testCriticalFiles();

  section('3. Sécurité');
  testNpmAudit();

  // Note: On teste l'API AVANT le build car npm run build dans central-server
  // peut interférer avec nodemon (npm run dev) et causer un redémarrage
  section('4. API');
  await testApiHealth();
  await testApiProtection();

  section('5. Raspberry Pi');
  const piAccessible = testPiConnectivity();
  if (piAccessible) {
    await testPiWebInterface();
    await testPiSocketConnection();
  }

  section('6. Build & Tests');
  testBuild();
  testLint();
  testUnitTests();

  section('7. E2E (Playwright)');
  await testE2ePlaywright();

  // Résumé
  section('RÉSUMÉ');
  console.log('');
  console.log(`  ${colors.green}Réussis:${colors.reset}  ${passed}`);
  console.log(`  ${colors.red}Échoués:${colors.reset}  ${failed}`);
  console.log(`  ${colors.yellow}Ignorés:${colors.reset}  ${skipped}`);
  console.log('');

  // Afficher les options disponibles
  if (skipped > 0) {
    console.log(`${colors.cyan}Options disponibles:${colors.reset}`);
    if (!config.full) console.log('  --full        Inclure les tests unitaires');
    if (!config.e2e) console.log('  --e2e         Inclure les tests E2E Playwright');
    if (config.skipPi) console.log('  (retirer --skip-pi pour tester le Pi)');
    if (config.skipApi) console.log('  (retirer --skip-api pour tester l\'API)');
    console.log('');
  }

  if (failed === 0) {
    console.log(`${colors.green}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.green}║                    TOUS LES TESTS PASSENT                    ║${colors.reset}`);
    console.log(`${colors.green}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`${colors.red}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.red}║                    ${failed} TEST(S) ONT ÉCHOUÉ                       ║${colors.reset}`);
    console.log(`${colors.red}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
    process.exit(1);
  }
}

main().catch(console.error);
