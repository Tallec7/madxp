const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);

const defaultAllowedOrigins = [
	"https://neopro.kalonpartners.bzh", // Site démo historique
	"https://neopro-admin.kalonpartners.bzh", // Nouveau portail admin
	"http://localhost:4200", // Dev local
	"http://neopro.local", // Raspberry Pi (mDNS)
	"http://neopro.local:4200", // Raspberry Pi avec port
	"http://192.168.4.1", // Raspberry Pi Hotspot (IP fixe)
	"http://192.168.4.1:4200" // Raspberry Pi Hotspot avec port
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
	: defaultAllowedOrigins;

console.log('Socket.IO CORS - allowed origins:', allowedOrigins);

// Configuration CORS pour permettre les connexions depuis le portail admin
const io = socketIO(server, {
	cors: {
		origin: allowedOrigins,
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
