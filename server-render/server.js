const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuration CORS pour permettre les connexions depuis votre site Apache
const io = socketIO(server, {
	cors: {
		origin: ["https://neopro.kalonpartners.bzh", "http://localhost:4200"], // Votre site en production + dev local
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
