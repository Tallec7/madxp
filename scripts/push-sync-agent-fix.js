#!/usr/bin/env node
/**
 * Script pour pousser une mise à jour du sync-agent vers un Pi via l'API centrale
 *
 * Usage: node scripts/push-sync-agent-fix.js <siteId> [--api-url=URL] [--token=TOKEN]
 *
 * Exemple:
 *   node scripts/push-sync-agent-fix.js c994620c-2016-40f3-9399-2d0345f69274
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration par défaut
const DEFAULT_API_URL = process.env.CENTRAL_API_URL || 'https://neopro-central-production.up.railway.app';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Usage: node scripts/push-sync-agent-fix.js <siteId> [options]

Options:
  --api-url=URL   URL de l'API centrale (défaut: ${DEFAULT_API_URL})
  --token=TOKEN   Token JWT pour l'authentification
  --file=PATH     Fichier spécifique à envoyer (défaut: commands/index.js)

Exemple:
  node scripts/push-sync-agent-fix.js c994620c-2016-40f3-9399-2d0345f69274 --api-url=https://api.neopro.fr
`);
    process.exit(0);
  }

  const siteId = args[0];

  // Parser les options
  let apiUrl = DEFAULT_API_URL;
  let token = process.env.JWT_TOKEN || '';
  let filePath = 'src/commands/index.js';

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--api-url=')) {
      apiUrl = arg.split('=')[1];
    } else if (arg.startsWith('--token=')) {
      token = arg.split('=')[1];
    } else if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    }
  }

  // Lire le fichier commands/index.js
  const syncAgentPath = path.join(__dirname, '..', 'raspberry', 'sync-agent');
  const commandsFilePath = path.join(syncAgentPath, filePath);

  if (!fs.existsSync(commandsFilePath)) {
    console.error(`Erreur: Fichier non trouvé: ${commandsFilePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(commandsFilePath, 'utf8');
  console.log(`Fichier lu: ${commandsFilePath} (${fileContent.length} caractères)`);

  // Préparer le payload
  const payload = {
    command: 'update_config',
    params: {
      mode: 'update_agent',
      agentFiles: {
        [filePath]: fileContent
      }
    }
  };

  console.log(`\nEnvoi vers: ${apiUrl}/api/sites/${siteId}/command`);
  console.log(`Fichier: ${filePath}`);

  // Faire la requête
  const url = new URL(`${apiUrl}/api/sites/${siteId}/command`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\nStatus: ${res.statusCode}`);
        try {
          const response = JSON.parse(data);
          console.log('Réponse:', JSON.stringify(response, null, 2));

          if (res.statusCode >= 200 && res.statusCode < 300 && response.success) {
            console.log('\n✅ Commande envoyée avec succès!');
            console.log('Le sync-agent va se mettre à jour et redémarrer.');
            console.log('\nProchaine étape: envoyer la commande fix_permissions:');
            console.log(`  curl -X POST ${apiUrl}/api/sites/${siteId}/command \\`);
            console.log(`    -H "Content-Type: application/json" \\`);
            console.log(`    -d '{"command": "update_config", "params": {"mode": "fix_permissions"}}'`);
            resolve();
          } else {
            console.error('\n❌ Erreur:', response.error || 'Commande échouée');
            reject(new Error(response.error || 'Failed'));
          }
        } catch (e) {
          console.log('Réponse brute:', data);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('\n❌ Erreur réseau:', e.message);
      reject(e);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
