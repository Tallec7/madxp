#!/usr/bin/env node
/**
 * Hardcoded French Text Detector
 *
 * Scans Angular templates for French text that should be translated.
 * Detects common patterns in .html and inline templates in .ts files.
 *
 * Usage:
 *   node scripts/check-hardcoded-i18n.js              # Check all files
 *   node scripts/check-hardcoded-i18n.js --staged     # Check only staged files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directories to scan
const SCAN_DIRS = ['central-dashboard/src/app'];

// File extensions to check
const EXTENSIONS = ['.ts', '.html'];

// Colors for terminal output
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

// French words/patterns that indicate hardcoded text
// These are common UI words that should be translated
const FRENCH_PATTERNS = [
  // Common UI actions
  /['"`](?:Confirmer|Annuler|Supprimer|Modifier|Ajouter|Enregistrer|Valider|Fermer|Retour|Suivant|Précédent)['"`]/gi,
  // Status/state words
  /['"`](?:Chargement|En cours|Terminé|Échec|Erreur|Succès|Attention|En attente|Actif|Inactif)\.{0,3}['"`]/gi,
  // Deployment related
  /['"`](?:Déploiement|Déployer|Mise à jour|Mettre à jour|Appliquer)\.{0,3}['"`]/gi,
  // File/queue related
  /['"`][^'"`]*(?:file d'attente|en file)[^'"`]*['"`]/gi,
  // Common French phrases with accents
  /['"`][^'"`]*(?:Êtes-vous sûr|Voulez-vous|Veuillez)[^'"`]*['"`]/gi,
  // Questions in French
  /['"`][^'"`]*\?['"`]/g, // Will be filtered to only French ones
  // Words with common French accents in strings
  /['"`][^'"`]*(?:é|è|ê|à|ù|ô|î|ï|ç)[^'"`]*['"`]/g,
];

// Whitelist patterns - these are OK and should be ignored
const WHITELIST = [
  // Translation keys
  /['"`][\w.]+['"`]\s*\|\s*translate/,
  // i18n pipe usage
  /\{\{\s*['"`][\w.]+['"`]\s*\|\s*translate/,
  // Variable interpolation that looks French but is a key
  /translate\s*:\s*\{/,
  // Comments
  /\/\/.*$/,
  /\/\*[\s\S]*?\*\//,
  // Import statements
  /import\s+.*from/,
  // Class names, IDs, CSS
  /class\s*=\s*['"`]/,
  /id\s*=\s*['"`]/,
  // Data attributes
  /data-[\w-]+\s*=\s*['"`]/,
  // URLs and paths
  /(?:href|src|url)\s*=\s*['"`]/i,
  // Console logs (acceptable in some cases)
  /console\.(log|warn|error|info)/,
  // File paths
  /['"`]\.{0,2}\/[\w\/-]+['"`]/,
  // Empty strings
  /['"`]['"`]/,
  // Single characters
  /['"`].['"`]/,
  // Numbers only
  /['"`]\d+['"`]/,
  // Known technical terms
  /['"`](?:null|undefined|true|false|POST|GET|PUT|DELETE|PATCH)['"`]/i,
  // Angular template syntax
  /\*ngIf|\*ngFor|\[ngClass\]|\[ngStyle\]/,
  // Translation service calls
  /\.instant\s*\(\s*['"`][\w.]+['"`]/,
  /translationService/,
  // Backup files
  /\.backup$/,
];

// Specific French words to detect (more targeted)
const FRENCH_WORDS = [
  'Déploiement',
  'Déployer',
  'Confirmer',
  'Annuler',
  'Supprimer',
  'Modifier',
  'Ajouter',
  'Enregistrer',
  'Valider',
  'Fermer',
  'Retour',
  'Suivant',
  'Précédent',
  'Chargement',
  'En cours',
  'Terminé',
  'Échec',
  'Erreur',
  'Succès',
  'Attention',
  'En attente',
  'Actif',
  'Inactif',
  'Mise à jour',
  'Mettre à jour',
  'Appliquer',
  "file d'attente",
  'Êtes-vous sûr',
  'Voulez-vous',
  'Veuillez',
  'Redémarrer',
  'Connexion',
  'Déconnexion',
  'Utilisateur',
  'Mot de passe',
  'Rechercher',
  'Filtrer',
  'Télécharger',
  'Téléverser',
  'Sélectionner',
  'Aucun',
  'Tous',
  'Oui',
  'Non',
];

/**
 * Get list of staged files (for pre-commit mode)
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
    });
    return output
      .split('\n')
      .filter((f) => f.trim())
      .filter((f) => EXTENSIONS.some((ext) => f.endsWith(ext)))
      .filter((f) => SCAN_DIRS.some((dir) => f.startsWith(dir)));
  } catch {
    return [];
  }
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, dist, etc.
      if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
        getAllFiles(fullPath, files);
      }
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      // Skip backup files
      if (!entry.name.includes('.backup')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract inline template from a TypeScript component file
 */
function extractInlineTemplate(content) {
  const templateMatch = content.match(/template\s*:\s*`([\s\S]*?)`/);
  if (templateMatch) {
    return {
      template: templateMatch[1],
      startIndex: templateMatch.index,
    };
  }
  return null;
}

/**
 * Check if a line should be ignored based on whitelist
 */
function isWhitelisted(line) {
  return WHITELIST.some((pattern) => pattern.test(line));
}

/**
 * Check if we're inside an inline template in a .ts file
 */
function isInsideTemplate(content, lineIndex) {
  const lines = content.split('\n');
  let inTemplate = false;
  let templateDepth = 0;

  for (let i = 0; i <= lineIndex; i++) {
    const line = lines[i];

    // Check for template start
    if (line.includes('template:') && line.includes('`')) {
      inTemplate = true;
      templateDepth = 1;
    } else if (inTemplate) {
      // Count backticks to track template boundaries
      const backticks = (line.match(/`/g) || []).length;
      if (backticks % 2 === 1) {
        inTemplate = !inTemplate;
      }
    }
  }

  return inTemplate;
}

/**
 * Find hardcoded French text in a file
 */
function findHardcodedText(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  const isTypeScript = filePath.endsWith('.ts');

  // For .ts files, first find the template boundaries
  let templateStart = -1;
  let templateEnd = -1;

  if (isTypeScript) {
    // Find template: ` pattern (may have newline between : and `)
    const templateMatch = content.match(/template\s*:\s*`/s);
    if (templateMatch) {
      const startPos = templateMatch.index + templateMatch[0].length;
      templateStart = content.substring(0, startPos).split('\n').length - 1;

      // Find the closing backtick (handling nested template literals)
      let pos = startPos;
      let inNestedTemplate = false;

      while (pos < content.length) {
        const char = content[pos];
        const prevChar = content[pos - 1];

        // Handle nested template literals ${...}
        if (char === '$' && content[pos + 1] === '{') {
          inNestedTemplate = true;
        } else if (inNestedTemplate && char === '}') {
          inNestedTemplate = false;
        } else if (!inNestedTemplate && char === '`' && prevChar !== '\\') {
          // Found the closing backtick
          break;
        }
        pos++;
      }
      templateEnd = content.substring(0, pos).split('\n').length - 1;

    }
  }

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return;
    }

    // For .ts files, only check lines inside the template
    if (isTypeScript) {
      if (templateStart === -1 || index < templateStart || index > templateEnd) {
        return;
      }
    }

    // Skip if whitelisted
    if (isWhitelisted(line)) {
      return;
    }

    // Check for French words in the line
    for (const word of FRENCH_WORDS) {
      if (!line.includes(word)) continue;

      // Look for the word in string literals (single quotes, double quotes)
      // Pattern: 'text with French word' or "text with French word"
      const stringPattern = new RegExp(
        "(['\"])[^'\"]*" + escapeRegex(word) + "[^'\"]*\\1",
        'gi'
      );

      const matches = line.match(stringPattern);
      if (!matches) continue;

      for (const match of matches) {
        // Skip if it contains | translate
        if (match.includes('| translate') || match.includes('|translate')) {
          continue;
        }
        // Skip if it's clearly a translation key (dot notation only, no spaces/special chars)
        if (/^['"][\w.]+['"]$/.test(match.trim())) {
          continue;
        }

        issues.push({
          line: lineNum,
          text: match.trim().substring(0, 60),
          context: line.trim().substring(0, 120),
        });
        break; // One issue per word per line is enough
      }
    }
  });

  // Deduplicate issues
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.line}:${issue.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main function
 */
function main() {
  const isStaged = process.argv.includes('--staged');

  console.log(colors.bold('\nHardcoded French Text Detector\n'));

  let files;
  if (isStaged) {
    files = getStagedFiles();
    console.log(`Checking ${colors.blue(files.length)} staged file(s)...\n`);
  } else {
    files = [];
    for (const dir of SCAN_DIRS) {
      const fullDir = path.join(process.cwd(), dir);
      if (fs.existsSync(fullDir)) {
        getAllFiles(fullDir, files);
      }
    }
    console.log(`Checking ${colors.blue(files.length)} file(s) in ${SCAN_DIRS.join(', ')}...\n`);
  }

  if (files.length === 0) {
    console.log(colors.green('No files to check.\n'));
    process.exit(0);
  }

  let totalIssues = 0;
  const fileIssues = [];

  for (const file of files) {
    const relativePath = path.relative(process.cwd(), file);
    const issues = findHardcodedText(file);

    if (issues.length > 0) {
      fileIssues.push({ file: relativePath, issues });
      totalIssues += issues.length;
    }
  }

  // Report
  if (totalIssues === 0) {
    console.log(colors.green('No hardcoded French text detected!\n'));
    process.exit(0);
  }

  console.log(colors.red(`Found ${totalIssues} potential hardcoded French text issue(s):\n`));

  for (const { file, issues } of fileIssues) {
    console.log(colors.bold(file));
    for (const issue of issues) {
      console.log(colors.yellow(`  Line ${issue.line}: ${issue.text}`));
      console.log(colors.gray(`    ${issue.context}`));
    }
    console.log();
  }

  console.log(colors.bold('How to fix:'));
  console.log('1. Add translation keys to en.json, fr.json, and es.json');
  console.log("2. Replace hardcoded text with {{ 'key' | translate }}");
  console.log('3. Run npm run i18n:check to verify key synchronization\n');

  process.exit(1);
}

main();
