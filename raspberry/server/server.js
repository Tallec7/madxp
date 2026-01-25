const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration pour l'envoi des analytics au serveur central
const CENTRAL_SERVER_URL = process.env.CENTRAL_SERVER_URL || 'https://neopro-central-production.up.railway.app';
const SITE_ID = process.env.SITE_ID; // ID du site pour la démo
const IS_CLOUD_ENV = process.env.RENDER || process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

// CORS middleware for all Express routes (analytics API)
const corsOrigins = [
	"https://neopro.kalonpartners.bzh",
	"http://localhost:4200",
	"http://neopro.local",
	"http://neopro.local:4200",
	"http://192.168.4.1",
	"http://192.168.4.1:4200"
];

app.use((req, res, next) => {
	const origin = req.headers.origin;

	// Accept any origin - the Pi is on a local network and may have dynamic IPs
	// depending on the club's network configuration (DHCP, different subnets, etc.)
	if (origin) {
		res.header('Access-Control-Allow-Origin', origin);
		res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type');
		res.header('Access-Control-Allow-Credentials', 'true');
		// Required for Chrome Private Network Access (PNA) - allows requests from
		// public networks to private IPs (e.g., phone on club WiFi → Pi on same network)
		res.header('Access-Control-Allow-Private-Network', 'true');
	}

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}

	next();
});

const server = http.createServer(app);

// Configuration CORS pour Socket.IO
// Accept any origin - the Pi may be accessed via different IPs depending on the
// club's network (hotspot 192.168.4.1, DHCP IP, etc.)
const io = socketIO(server, {
	cors: {
		origin: true, // Accept any origin
		methods: ["GET", "POST"],
		credentials: true
	}
});

// Route de santé pour Render
app.get('/', (req, res) => {
	res.json({
		status: 'ok',
		service: 'Neopro Socket.IO Server',
		connections: io.engine.clientsCount
	});
});

// ============================================================================
// SITE INFO ENDPOINT
// Expose le site_id pour les analytics sponsors
// ============================================================================
app.get('/api/site-info', (req, res) => {
	res.json({
		siteId: SITE_ID || null,
		siteName: process.env.SITE_NAME || null,
		configured: !!SITE_ID
	});
});

// ============================================================================
// LICENSE STATUS ENDPOINT
// Returns the cached license status from the sync-agent
// ============================================================================
const LICENSE_CACHE_PATH = path.join(
	process.env.HOME || '/home/pi',
	'neopro',
	'data',
	'license_cache.json'
);

app.get('/api/license-status', (req, res) => {
	try {
		if (!fs.existsSync(LICENSE_CACHE_PATH)) {
			// No cache yet - first connection or cache cleared
			return res.json({
				status: 'CONNECTION_WARNING',
				reason: 'no_cache',
				message_remote: 'Veuillez connecter le boîtier à Internet pour activer la licence.',
				needs_connection: true
			});
		}

		const cacheData = JSON.parse(fs.readFileSync(LICENSE_CACHE_PATH, 'utf8'));

		// Calculate days since last check
		if (cacheData.last_server_check) {
			const lastCheck = new Date(cacheData.last_server_check);
			const now = new Date();
			const daysSinceCheck = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));

			const CACHE_TTL_DAYS = 7;
			const GRACE_PERIOD_DAYS = 7;

			// Check if cache has expired (> 14 days)
			if (daysSinceCheck > CACHE_TTL_DAYS + GRACE_PERIOD_DAYS) {
				return res.json({
					status: 'BLOCKED',
					reason: 'connection_required',
					days_since_check: daysSinceCheck,
					message_tv: 'Connexion Internet requise',
					message_remote: `Le boîtier n'a pas contacté le serveur depuis ${daysSinceCheck} jours. Veuillez le connecter à Internet.`,
					can_auto_unblock: true,
					needs_connection: true
				});
			}

			// Check if in grace period (7-14 days)
			if (daysSinceCheck > CACHE_TTL_DAYS) {
				const daysLeft = CACHE_TTL_DAYS + GRACE_PERIOD_DAYS - daysSinceCheck;
				return res.json({
					status: 'GRACE_PERIOD',
					reason: 'connection_grace',
					days_since_check: daysSinceCheck,
					days_until_block: daysLeft,
					message_remote: `Connexion requise dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour valider la licence.`,
					can_auto_unblock: true,
					needs_connection: true
				});
			}

			cacheData.days_since_check = daysSinceCheck;
		}

		res.json(cacheData);
	} catch (error) {
		console.error('[License] Error reading cache:', error.message);
		res.status(500).json({
			status: 'CONNECTION_WARNING',
			reason: 'cache_error',
			message_remote: 'Erreur lors de la lecture du statut de licence.',
			needs_connection: true
		});
	}
});

// ============================================================================
// ANALYTICS ENDPOINT
// Reçoit les analytics de l'app Angular et les sauvegarde pour le sync-agent
// ============================================================================
const ANALYTICS_FILE_PATH = path.join(
	process.env.HOME || '/home/pi',
	'neopro',
	'data',
	'analytics_buffer.json'
);

const SPONSOR_IMPRESSIONS_FILE_PATH = path.join(
	process.env.HOME || '/home/pi',
	'neopro',
	'data',
	'sponsor_impressions.json'
);

app.post('/api/analytics', async (req, res) => {
	try {
		const { events } = req.body;

		if (!events || !Array.isArray(events)) {
			return res.status(400).json({ error: 'events array required' });
		}

		// En environnement cloud (Render), envoyer directement au serveur central
		if (IS_CLOUD_ENV && SITE_ID) {
			try {
				const response = await axios.post(
					`${CENTRAL_SERVER_URL}/api/analytics/video-plays`,
					{
						site_id: SITE_ID,
						plays: events
					},
					{
						headers: { 'Content-Type': 'application/json' },
						timeout: 10000
					}
				);
				console.log(`[Analytics] Sent ${events.length} events to central server:`, response.data);
				return res.json({ success: true, received: events.length, forwarded: true, recorded: response.data.recorded });
			} catch (forwardError) {
				console.error('[Analytics] Failed to forward to central:', forwardError.message);
				// En cas d'échec, on continue avec le stockage local comme fallback
			}
		}

		// Stockage local (Raspberry Pi ou fallback)
		const dir = path.dirname(ANALYTICS_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		let buffer = [];
		if (fs.existsSync(ANALYTICS_FILE_PATH)) {
			try {
				const data = fs.readFileSync(ANALYTICS_FILE_PATH, 'utf8');
				buffer = JSON.parse(data);
			} catch (e) {
				console.warn('Failed to parse existing analytics buffer:', e.message);
				buffer = [];
			}
		}

		buffer.push(...events);
		fs.writeFileSync(ANALYTICS_FILE_PATH, JSON.stringify(buffer, null, 2));

		console.log(`[Analytics] Received ${events.length} events, total buffer: ${buffer.length}`);
		res.json({ success: true, received: events.length, total: buffer.length });
	} catch (error) {
		console.error('[Analytics] Error:', error);
		res.status(500).json({ error: error.message });
	}
});

app.get('/api/analytics/stats', (req, res) => {
	try {
		let buffer = [];
		if (fs.existsSync(ANALYTICS_FILE_PATH)) {
			const data = fs.readFileSync(ANALYTICS_FILE_PATH, 'utf8');
			buffer = JSON.parse(data);
		}

		res.json({
			count: buffer.length,
			oldestEvent: buffer.length > 0 ? buffer[0].played_at : null,
			newestEvent: buffer.length > 0 ? buffer[buffer.length - 1].played_at : null
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============================================================================
// SPONSOR IMPRESSIONS ENDPOINT
// Reçoit les impressions sponsors de l'app Angular et les sauvegarde pour le sync-agent
// ============================================================================
app.post('/api/sync/sponsor-impressions', async (req, res) => {
	try {
		const { impressions } = req.body;

		if (!impressions || !Array.isArray(impressions)) {
			return res.status(400).json({ error: 'impressions array required' });
		}

		// En environnement cloud (Render), envoyer directement au serveur central
		if (IS_CLOUD_ENV && SITE_ID) {
			try {
				const impressionsWithSiteId = impressions.map(imp => ({
					...imp,
					site_id: imp.site_id || SITE_ID
				}));

				const response = await axios.post(
					`${CENTRAL_SERVER_URL}/api/analytics/impressions`,
					{ impressions: impressionsWithSiteId },
					{
						headers: { 'Content-Type': 'application/json' },
						timeout: 10000
					}
				);

				console.log(`[SponsorImpressions] Sent ${impressions.length} impressions to central server:`, response.data);
				return res.json({
					success: true,
					received: impressions.length,
					queued: 0,
					forwarded: true,
					recorded: response.data.data?.recorded || response.data.recorded || 0
				});
			} catch (forwardError) {
				console.error('[SponsorImpressions] Failed to forward to central:', forwardError.message);
				// En cas d'échec, on continue avec le stockage local comme fallback
			}
		}

		// Stockage local (Raspberry Pi ou fallback)
		const dir = path.dirname(SPONSOR_IMPRESSIONS_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		let buffer = [];
		if (fs.existsSync(SPONSOR_IMPRESSIONS_FILE_PATH)) {
			try {
				const data = fs.readFileSync(SPONSOR_IMPRESSIONS_FILE_PATH, 'utf8');
				buffer = JSON.parse(data);
			} catch (e) {
				console.warn('[SponsorImpressions] Failed to parse existing buffer:', e.message);
				buffer = [];
			}
		}

		buffer.push(...impressions);
		fs.writeFileSync(SPONSOR_IMPRESSIONS_FILE_PATH, JSON.stringify(buffer, null, 2));

		console.log(`[SponsorImpressions] Received ${impressions.length} impressions, total buffer: ${buffer.length}`);
		res.json({ success: true, received: impressions.length, queued: buffer.length });
	} catch (error) {
		console.error('[SponsorImpressions] Error:', error);
		res.status(500).json({ error: error.message });
	}
});

app.get('/api/sync/sponsor-impressions/stats', (req, res) => {
	try {
		let buffer = [];
		if (fs.existsSync(SPONSOR_IMPRESSIONS_FILE_PATH)) {
			const data = fs.readFileSync(SPONSOR_IMPRESSIONS_FILE_PATH, 'utf8');
			buffer = JSON.parse(data);
		}

		res.json({
			count: buffer.length,
			oldestImpression: buffer.length > 0 ? buffer[0].played_at : null,
			newestImpression: buffer.length > 0 ? buffer[buffer.length - 1].played_at : null
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ============================================================================
// PERSISTANCE DU SCORE EN MÉMOIRE
// Le score est conservé côté serveur pour éviter le reset au refresh
// ============================================================================
let currentScore = {
	homeTeam: 'DOMICILE',
	awayTeam: 'EXTÉRIEUR',
	homeScore: 0,
	awayScore: 0
};

let currentPhase = 'neutral';

// État des options locales (overlay, timer, breaking news, template)
let currentOptions = null;

// État du timer
let currentTimer = {
	currentTime: 0,
	isRunning: false,
	halfDuration: 45,
	countDown: true
};

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
	console.log('Client connecté:', socket.id);

	// Envoyer l'état actuel au client qui vient de se connecter
	socket.emit('score-update', currentScore);
	socket.emit('phase-change', { phase: currentPhase });
	if (currentOptions) {
		socket.emit('options-update', currentOptions);
	}
	if (currentTimer.isRunning || currentTimer.currentTime > 0) {
		socket.emit('timer-update', {
			action: 'sync',
			...currentTimer
		});
	}

	socket.on('command', (data) => {
		console.log('Commande reçue:', data);
		// Broadcast à tous les clients sauf l'émetteur
		io.emit('action', data);
	});

	// Score updates - persister et relayer à tous les clients (TV, etc.)
	socket.on('score-update', (data) => {
		console.log('Score update reçu:', data);
		// Persister le score
		currentScore = {
			homeTeam: data.homeTeam || currentScore.homeTeam,
			awayTeam: data.awayTeam || currentScore.awayTeam,
			homeScore: data.homeScore ?? currentScore.homeScore,
			awayScore: data.awayScore ?? currentScore.awayScore
		};
		io.emit('score-update', currentScore);
	});

	socket.on('score-reset', () => {
		console.log('Score reset reçu');
		currentScore.homeScore = 0;
		currentScore.awayScore = 0;
		io.emit('score-reset');
		io.emit('score-update', currentScore);
	});

	socket.on('phase-change', (data) => {
		console.log('Phase change reçu:', data);
		currentPhase = data.phase;
		io.emit('phase-change', data);
	});

	// Permet à un client de redemander l'état actuel (utile après routing Angular)
	socket.on('request-state', () => {
		console.log('Request state reçu de:', socket.id);
		socket.emit('score-update', currentScore);
		socket.emit('phase-change', { phase: currentPhase });
		if (currentOptions) {
			socket.emit('options-update', currentOptions);
		}
		if (currentTimer.isRunning || currentTimer.currentTime > 0) {
			socket.emit('timer-update', {
				action: 'sync',
				...currentTimer
			});
		}
	});

	// ========================================================================
	// OPTIONS, TIMER & BREAKING NEWS - Communication Remote ↔ TV
	// ========================================================================

	// Options update - persister et relayer à tous les clients (TV)
	socket.on('options-update', (data) => {
		console.log('Options update reçu:', data);
		currentOptions = data;
		// Broadcast à tous les autres clients (notamment TV)
		socket.broadcast.emit('options-update', data);
	});

	// Timer update - persister et relayer à tous les clients (TV)
	socket.on('timer-update', (data) => {
		console.log('Timer update reçu:', data);
		// Mettre à jour l'état du timer
		if (data.currentTime !== undefined) currentTimer.currentTime = data.currentTime;
		if (data.isRunning !== undefined) currentTimer.isRunning = data.isRunning;
		if (data.halfDuration !== undefined) currentTimer.halfDuration = data.halfDuration;
		if (data.countDown !== undefined) currentTimer.countDown = data.countDown;

		// Broadcast à tous les autres clients (notamment TV)
		socket.broadcast.emit('timer-update', data);
	});

	// Breaking news - pas de persistance, juste relay immédiat
	socket.on('breaking-news', (data) => {
		console.log('Breaking news reçu:', data);
		// Broadcast à tous les autres clients (notamment TV)
		socket.broadcast.emit('breaking-news', data);
	});

	// Notification de mise à jour de la configuration (envoyé par le sync-agent)
	socket.on('config_updated', () => {
		console.log('[Config] Configuration updated notification received');

		// Lire la nouvelle configuration depuis le fichier
		const configPath = path.join(
			process.env.HOME || '/home/pi',
			'neopro',
			'webapp',
			'configuration.json'
		);

		try {
			if (fs.existsSync(configPath)) {
				const configData = fs.readFileSync(configPath, 'utf8');
				const config = JSON.parse(configData);

				console.log('[Config] Broadcasting reload-config to all clients');
				// Envoyer la nouvelle config à tous les clients (TV, Remote)
				io.emit('action', { type: 'reload-config', data: config });
			} else {
				console.warn('[Config] Configuration file not found:', configPath);
			}
		} catch (error) {
			console.error('[Config] Error reading configuration:', error.message);
		}
	});

	// ========================================================================
	// LICENSE STATUS - Gestion du statut de licence
	// Les événements sont envoyés par le sync-agent depuis le serveur central
	// ========================================================================

	// Mise à jour du statut de licence (warning, grace period, etc.)
	socket.on('license_update', (status) => {
		console.log('[License] Status update received:', status?.status, status?.reason);
		// Broadcast à tous les clients (TV et Remote)
		io.emit('license_update', status);
	});

	// Blocage de licence (site suspendu ou connexion requise)
	socket.on('license_blocked', (status) => {
		console.log('[License] BLOCKED received:', status?.status, status?.reason);
		// Broadcast à tous les clients (TV et Remote)
		io.emit('license_blocked', status);
	});

	socket.on('disconnect', () => {
		console.log('Client déconnecté:', socket.id);
	});
});

// ============================================================================
// AUTH SETUP ENDPOINT
// Permet de définir le mot de passe initial lors du premier démarrage
// ============================================================================
const CONFIG_PATH = path.join(
	process.env.HOME || '/home/pi',
	'neopro',
	'webapp',
	'configuration.json'
);

app.post('/api/auth/setup', async (req, res) => {
	try {
		const { password } = req.body;

		if (!password) {
			return res.status(400).json({ success: false, error: 'Mot de passe requis' });
		}

		if (password.length < 4) {
			return res.status(400).json({ success: false, error: 'Le mot de passe doit contenir au moins 4 caractères' });
		}

		// Charger la configuration existante
		let config = {
			remote: { title: 'NeoPro' },
			version: '1.0.0',
			categories: [],
			sponsors: []
		};

		if (fs.existsSync(CONFIG_PATH)) {
			try {
				const data = fs.readFileSync(CONFIG_PATH, 'utf8');
				config = JSON.parse(data);
			} catch (e) {
				console.warn('[AuthSetup] Failed to parse existing config, using defaults');
			}
		}

		// Vérifier si un mot de passe existe déjà
		if (config.auth && config.auth.password) {
			return res.status(403).json({
				success: false,
				error: 'Un mot de passe est déjà configuré. Utilisez le panneau admin pour le modifier.'
			});
		}

		// Ajouter/mettre à jour la section auth
		config.auth = config.auth || {};
		config.auth.password = password;
		config.auth.configuredAt = new Date().toISOString();

		// S'assurer que le répertoire existe
		const configDir = path.dirname(CONFIG_PATH);
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		// Sauvegarder la configuration
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

		console.log('[AuthSetup] Initial password configured successfully');

		// Notifier les clients de la mise à jour de config
		io.emit('action', { type: 'reload-config', data: config });

		res.json({ success: true });
	} catch (error) {
		console.error('[AuthSetup] Error:', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

// Route pour vérifier si le setup est nécessaire
app.get('/api/auth/status', (req, res) => {
	try {
		let requiresSetup = true;

		if (fs.existsSync(CONFIG_PATH)) {
			try {
				const data = fs.readFileSync(CONFIG_PATH, 'utf8');
				const config = JSON.parse(data);
				requiresSetup = !config.auth || !config.auth.password;
			} catch (e) {
				console.warn('[AuthStatus] Failed to parse config');
			}
		}

		res.json({ requiresSetup });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`✓ Serveur Socket.IO lancé sur le port ${PORT}`);
});
