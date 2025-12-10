const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

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
	if (corsOrigins.includes(origin)) {
		res.header('Access-Control-Allow-Origin', origin);
	}
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	res.header('Access-Control-Allow-Credentials', 'true');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

const server = http.createServer(app);

// Configuration CORS pour permettre les connexions depuis votre site Apache
const io = socketIO(server, {
	cors: {
		origin: [
			"https://neopro.kalonpartners.bzh", // Site démo production
			"http://localhost:4200", // Dev local
			"http://neopro.local", // Raspberry Pi (mDNS)
			"http://neopro.local:4200", // Raspberry Pi avec port
			"http://192.168.4.1", // Raspberry Pi Hotspot (IP fixe)
			"http://192.168.4.1:4200" // Raspberry Pi Hotspot avec port
		],
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
// ANALYTICS ENDPOINT
// Reçoit les analytics de l'app Angular et les sauvegarde pour le sync-agent
// ============================================================================
const ANALYTICS_FILE_PATH = path.join(
	process.env.HOME || '/home/pi',
	'neopro',
	'data',
	'analytics_buffer.json'
);

app.post('/api/analytics', (req, res) => {
	try {
		const { events } = req.body;

		if (!events || !Array.isArray(events)) {
			return res.status(400).json({ error: 'events array required' });
		}

		// Créer le dossier si nécessaire
		const dir = path.dirname(ANALYTICS_FILE_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Charger le buffer existant
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

		// Ajouter les nouveaux événements
		buffer.push(...events);

		// Sauvegarder
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

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
	console.log('Client connecté:', socket.id);

	socket.on('command', (data) => {
		console.log('Commande reçue:', data);
		// Broadcast à tous les clients sauf l'émetteur
		io.emit('action', data);
	});

	socket.on('disconnect', () => {
		console.log('Client déconnecté:', socket.id);
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`✓ Serveur Socket.IO lancé sur le port ${PORT}`);
});
