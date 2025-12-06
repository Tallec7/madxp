#!/usr/bin/env node

/**
 * Script de diagnostic pour le NEOPRO Sync Agent
 * Vérifie la configuration et teste la connexion au serveur central
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Charger la configuration
const configPath = '/etc/neopro/site.conf';
const fallbackPath = path.join(__dirname, '../config/.env');

console.log('🔍 NEOPRO Sync Agent - Diagnostic\n');
console.log('='.repeat(50));

// 1. Vérifier les fichiers de configuration
console.log('\n📁 Vérification des fichiers de configuration...\n');

let configFile = null;
if (fs.existsSync(configPath)) {
  console.log(`✅ ${configPath} existe`);
  configFile = configPath;
} else if (fs.existsSync(fallbackPath)) {
  console.log(`⚠️  ${configPath} n'existe pas`);
  console.log(`✅ ${fallbackPath} existe (fallback)`);
  configFile = fallbackPath;
} else {
  console.log(`❌ Aucun fichier de configuration trouvé!`);
  console.log(`   Exécutez: sudo node scripts/register-site.js`);
  process.exit(1);
}

// Charger la config
dotenv.config({ path: configFile });

// 2. Vérifier les variables requises
console.log('\n📋 Vérification des variables...\n');

const required = {
  CENTRAL_SERVER_URL: process.env.CENTRAL_SERVER_URL,
  SITE_ID: process.env.SITE_ID,
  SITE_API_KEY: process.env.SITE_API_KEY,
};

let hasErrors = false;
for (const [key, value] of Object.entries(required)) {
  if (value) {
    if (key === 'SITE_API_KEY') {
      console.log(`✅ ${key}: ${value.substring(0, 8)}...${value.substring(value.length - 4)} (${value.length} chars)`);
    } else {
      console.log(`✅ ${key}: ${value}`);
    }
  } else {
    console.log(`❌ ${key}: NON DÉFINI`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log('\n❌ Variables manquantes. Exécutez: sudo node scripts/register-site.js');
  process.exit(1);
}

// 3. Tester la connexion HTTP au serveur
console.log('\n🌐 Test de connexion au serveur central...\n');

async function testConnection() {
  const serverUrl = process.env.CENTRAL_SERVER_URL;

  try {
    // Test simple de santé
    const healthResponse = await axios.get(`${serverUrl}/api/health`, { timeout: 10000 });
    console.log(`✅ Serveur accessible: ${serverUrl}`);
    console.log(`   Status: ${healthResponse.data?.status || 'OK'}`);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`❌ Serveur inaccessible: ${serverUrl}`);
      console.log(`   Vérifiez que le serveur central est en ligne`);
    } else if (error.response?.status === 404) {
      console.log(`⚠️  Serveur accessible mais /api/health non trouvé (normal si pas implémenté)`);
    } else {
      console.log(`⚠️  Erreur de connexion: ${error.message}`);
    }
  }

  // 4. Vérifier que le site existe sur le serveur
  console.log('\n🔍 Vérification du site sur le serveur...\n');

  try {
    // On ne peut pas vérifier directement sans token, mais on peut tester le socket
    const io = require('socket.io-client');

    console.log(`   Connexion Socket.IO à ${serverUrl}...`);

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Timeout de connexion (10s)'));
      }, 10000);

      socket.on('connect', () => {
        console.log(`✅ Connexion Socket.IO établie`);

        // Tenter l'authentification
        console.log(`\n🔐 Test d'authentification...`);
        console.log(`   Site ID: ${process.env.SITE_ID}`);
        console.log(`   API Key: ${process.env.SITE_API_KEY.substring(0, 8)}...`);

        socket.emit('authenticate', {
          siteId: process.env.SITE_ID,
          apiKey: process.env.SITE_API_KEY,
        });
      });

      socket.on('authenticated', (data) => {
        clearTimeout(timeout);
        console.log(`\n✅ AUTHENTIFICATION RÉUSSIE!`);
        console.log(`   Message: ${data.message}`);
        socket.disconnect();
        resolve();
      });

      socket.on('auth_error', (data) => {
        clearTimeout(timeout);
        console.log(`\n❌ AUTHENTIFICATION ÉCHOUÉE!`);
        console.log(`   Message: ${data.message}`);
        console.log(`\n💡 Solutions possibles:`);
        console.log(`   1. Vérifiez que le site existe sur le serveur central`);
        console.log(`   2. Régénérez l'API key depuis l'interface centrale`);
        console.log(`   3. Mettez à jour SITE_API_KEY dans ${configFile}`);
        console.log(`   4. Ré-exécutez: sudo node scripts/register-site.js`);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.log(`❌ Erreur de connexion Socket.IO: ${error.message}`);
        socket.disconnect();
        reject(error);
      });
    });

  } catch (error) {
    console.log(`❌ Erreur: ${error.message}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Diagnostic terminé\n');
}

testConnection();
