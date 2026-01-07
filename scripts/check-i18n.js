#!/usr/bin/env node
/**
 * i18n Key Synchronization Checker
 *
 * Validates that all translation files have identical keys.
 * Detects missing and extra keys across language files.
 *
 * Usage:
 *   node scripts/check-i18n.js           # Check only
 *   node scripts/check-i18n.js --fix     # Auto-add missing keys with placeholder
 */

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '../central-dashboard/src/assets/i18n');
const REFERENCE_LANG = 'en'; // English is the reference
const SUPPORTED_LANGS = ['en', 'fr', 'es'];

// Colors for terminal output
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

/**
 * Recursively extracts all keys from a nested object
 * @param {object} obj - The object to extract keys from
 * @param {string} prefix - Current key prefix for nested objects
 * @returns {Set<string>} Set of dot-notation keys
 */
function extractKeys(obj, prefix = '') {
  const keys = new Set();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recurse into nested objects
      const nestedKeys = extractKeys(value, fullKey);
      nestedKeys.forEach((k) => keys.add(k));
    } else {
      keys.add(fullKey);
    }
  }

  return keys;
}

/**
 * Gets value at a dot-notation path
 * @param {object} obj - Object to read from
 * @param {string} path - Dot-notation path (e.g., "auth.login")
 * @returns {*} Value at path or undefined
 */
function getValueAtPath(obj, dotPath) {
  return dotPath.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Sets value at a dot-notation path, creating intermediate objects as needed
 * @param {object} obj - Object to modify
 * @param {string} path - Dot-notation path
 * @param {*} value - Value to set
 */
function setValueAtPath(obj, dotPath, value) {
  const keys = dotPath.split('.');
  const lastKey = keys.pop();
  let current = obj;

  for (const key of keys) {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
}

/**
 * Loads a translation file
 * @param {string} lang - Language code
 * @returns {object} Parsed JSON content
 */
function loadTranslationFile(lang) {
  const filePath = path.join(I18N_DIR, `${lang}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(colors.red(`Error loading ${lang}.json: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Saves a translation file with proper formatting
 * @param {string} lang - Language code
 * @param {object} data - Data to save
 */
function saveTranslationFile(lang, data) {
  const filePath = path.join(I18N_DIR, `${lang}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Sorts object keys recursively to maintain consistent order
 * @param {object} obj - Object to sort
 * @returns {object} Sorted object
 */
function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Main validation function
 */
function checkI18nSync() {
  const isFixMode = process.argv.includes('--fix');

  console.log(colors.bold('\ni18n Key Synchronization Check\n'));
  console.log(`Reference language: ${colors.blue(REFERENCE_LANG)}`);
  console.log(`Languages to check: ${SUPPORTED_LANGS.join(', ')}\n`);

  // Load all translation files
  const translations = {};
  for (const lang of SUPPORTED_LANGS) {
    translations[lang] = loadTranslationFile(lang);
  }

  // Extract keys from reference language
  const referenceKeys = extractKeys(translations[REFERENCE_LANG]);
  console.log(`Reference (${REFERENCE_LANG}) has ${colors.blue(referenceKeys.size)} keys\n`);

  let hasErrors = false;
  const issues = {};

  // Check each language against reference
  for (const lang of SUPPORTED_LANGS) {
    if (lang === REFERENCE_LANG) continue;

    const langKeys = extractKeys(translations[lang]);
    const missing = [...referenceKeys].filter((k) => !langKeys.has(k));
    const extra = [...langKeys].filter((k) => !referenceKeys.has(k));

    issues[lang] = { missing, extra };

    console.log(colors.bold(`${lang}.json:`));

    if (missing.length === 0 && extra.length === 0) {
      console.log(colors.green(`  All ${langKeys.size} keys synchronized`));
    } else {
      hasErrors = true;

      if (missing.length > 0) {
        console.log(colors.red(`  Missing ${missing.length} key(s):`));
        missing.forEach((key) => {
          const refValue = getValueAtPath(translations[REFERENCE_LANG], key);
          console.log(colors.yellow(`    - ${key}`));
          console.log(`      Reference: "${refValue}"`);
        });
      }

      if (extra.length > 0) {
        console.log(colors.yellow(`  Extra ${extra.length} key(s) (not in reference):`));
        extra.forEach((key) => console.log(`    - ${key}`));
      }
    }
    console.log();
  }

  // Fix mode: add missing keys with placeholder
  if (isFixMode && hasErrors) {
    console.log(colors.bold('Fixing missing keys...\n'));

    for (const lang of SUPPORTED_LANGS) {
      if (lang === REFERENCE_LANG) continue;

      const { missing } = issues[lang];
      if (missing.length === 0) continue;

      const data = translations[lang];

      for (const key of missing) {
        const refValue = getValueAtPath(translations[REFERENCE_LANG], key);
        // Use reference value as placeholder with [TRANSLATE] prefix
        const placeholder = `[TRANSLATE] ${refValue}`;
        setValueAtPath(data, key, placeholder);
        console.log(colors.green(`  Added ${lang}.${key}`));
      }

      // Sort keys and save
      const sorted = sortObjectKeys(data);
      saveTranslationFile(lang, sorted);
      console.log(colors.green(`  Saved ${lang}.json\n`));
    }

    console.log(colors.yellow('Keys added with [TRANSLATE] prefix - please translate them!\n'));
  }

  // Summary
  console.log(colors.bold('Summary:'));
  if (hasErrors) {
    if (isFixMode) {
      console.log(colors.yellow('Missing keys were added with placeholders.'));
      console.log(colors.yellow('Please translate keys prefixed with [TRANSLATE].\n'));
      process.exit(0);
    } else {
      console.log(colors.red('Translation files are out of sync!'));
      console.log(colors.yellow('Run with --fix to add missing keys with placeholders.\n'));
      process.exit(1);
    }
  } else {
    console.log(colors.green('All translation files are synchronized!\n'));
    process.exit(0);
  }
}

// Run
checkI18nSync();
