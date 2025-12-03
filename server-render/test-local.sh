#!/bin/bash

echo "🚀 Démarrage du serveur Socket.IO local..."
echo ""
echo "Le serveur va démarrer sur http://localhost:3000"
echo ""
echo "Pour tester :"
echo "1. Ouvrez http://localhost:4200/tv dans un onglet"
echo "2. Ouvrez http://localhost:4200/remote dans un autre onglet"
echo "3. Lancez 'ng serve' dans un autre terminal pour démarrer l'app Angular"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter le serveur"
echo ""

npm install
npm start
