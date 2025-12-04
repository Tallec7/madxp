#!/bin/bash

###############################################################################
# Neopro - Script de développement local
# Lance l'application Angular + Serveur Socket.IO + Admin Interface en local
###############################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         NEOPRO - LOCAL DEVELOPMENT SETUP                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    echo "Installer Node.js depuis https://nodejs.org"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js version: $(node --version)"

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm version: $(npm --version)"

# Vérifier Angular CLI
if ! command -v ng &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  Angular CLI n'est pas installé"
    echo "Installation d'Angular CLI..."
    npm install -g @angular/cli
fi

echo -e "${GREEN}✓${NC} Angular CLI version: $(ng version --minimal 2>/dev/null || echo 'installed')"
echo ""

# Installation des dépendances si nécessaire
echo -e "${BLUE}📦 Vérification des dépendances...${NC}"

if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances Angular..."
    npm install
else
    echo -e "${GREEN}✓${NC} Dépendances Angular OK"
fi

if [ ! -d "server-render/node_modules" ]; then
    echo "Installation des dépendances serveur Socket.IO..."
    cd server-render
    npm install
    cd ..
else
    echo -e "${GREEN}✓${NC} Dépendances serveur Socket.IO OK"
fi

if [ ! -d "raspberry/admin/node_modules" ]; then
    echo "Installation des dépendances admin..."
    cd raspberry/admin
    npm install
    cd ../..
else
    echo -e "${GREEN}✓${NC} Dépendances admin OK"
fi

echo ""
echo -e "${BLUE}🚀 Démarrage des services...${NC}"
echo ""

# Fonction pour tuer les processus au Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Arrêt de tous les services...${NC}"
    kill $PID_ANGULAR $PID_SOCKET $PID_ADMIN 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 1. Démarrer le serveur Socket.IO
echo -e "${GREEN}[1/3]${NC} Démarrage Socket.IO server (port 3000)..."
cd server-render
node server.js > ../logs/socket.log 2>&1 &
PID_SOCKET=$!
cd ..
sleep 2

if ps -p $PID_SOCKET > /dev/null; then
    echo -e "${GREEN}✓${NC} Socket.IO started (PID: $PID_SOCKET)"
else
    echo -e "${RED}❌ Échec démarrage Socket.IO${NC}"
    exit 1
fi

# 2. Démarrer l'interface admin (mode démo)
echo -e "${GREEN}[2/3]${NC} Démarrage Admin Interface - MODE DEMO (port 8080)..."
cd raspberry/admin
node admin-server-demo.js > ../../logs/admin.log 2>&1 &
PID_ADMIN=$!
cd ../..
sleep 2

if ps -p $PID_ADMIN > /dev/null; then
    echo -e "${GREEN}✓${NC} Admin Interface started (PID: $PID_ADMIN)"
else
    echo -e "${RED}❌ Échec démarrage Admin${NC}"
    exit 1
fi

# 3. Démarrer Angular Dev Server
echo -e "${GREEN}[3/3]${NC} Démarrage Angular dev server (port 4200)..."
ng serve > logs/angular.log 2>&1 &
PID_ANGULAR=$!

# Attendre que Angular soit prêt
echo -e "${YELLOW}⏳ Compilation Angular en cours...${NC}"
sleep 5

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   ✅ TOUS LES SERVICES DÉMARRÉS               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📱 Application Neopro:${NC}"
echo "   • Login:  http://localhost:4200"
echo "   • TV:     http://localhost:4200/tv"
echo "   • Remote: http://localhost:4200/remote"
echo ""
echo -e "${BLUE}🎛️  Admin Interface (MODE DEMO):${NC}"
echo "   • Dashboard: http://localhost:8080"
echo "   • Données mockées pour démo"
echo ""
echo -e "${BLUE}🔌 Socket.IO Server:${NC}"
echo "   • Port: 3000"
echo ""
echo -e "${BLUE}📋 Logs en direct:${NC}"
echo "   • tail -f logs/angular.log"
echo "   • tail -f logs/socket.log"
echo "   • tail -f logs/admin.log"
echo ""
echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter tous les services${NC}"
echo ""

# Garder le script actif
wait $PID_ANGULAR
