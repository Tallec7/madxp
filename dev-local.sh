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

# Mode admin (real ou demo)
ADMIN_MODE="real"
if [[ "$1" == "demo" || "$1" == "--demo" ]]; then
    ADMIN_MODE="demo"
fi

# Désactiver la télémétrie Angular pour éviter les prompts bloquants
export NG_CLI_ANALYTICS=false
export ANGULAR_CLI_ANALYTICS=false

ROOT_DIR="$(pwd)"
LOG_DIR="${ROOT_DIR}/logs"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         NEOPRO - LOCAL DEVELOPMENT SETUP                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}⚙️  Admin mode:${NC} ${ADMIN_MODE}"

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

if [ ! -d "central-server/node_modules" ]; then
    echo "Installation des dépendances central server..."
    cd central-server
    npm install
    cd ..
else
    echo -e "${GREEN}✓${NC} Dépendances central server OK"
fi

if [ ! -f "central-server/.env" ]; then
    if [ -f "central-server/.env.example" ]; then
        cp central-server/.env.example central-server/.env
        echo -e "${YELLOW}⚠${NC} central-server/.env créé depuis .env.example. Pensez à configurer DATABASE_URL et JWT_SECRET."
    else
        echo -e "${RED}❌ Aucun fichier .env pour central-server${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} central-server/.env trouvé"
fi

if [ ! -d "central-dashboard/node_modules" ]; then
    echo "Installation des dépendances central dashboard..."
    cd central-dashboard
    npm install --legacy-peer-deps
    cd ..
else
    echo -e "${GREEN}✓${NC} Dépendances central dashboard OK"
fi

echo ""
echo -e "${BLUE}🧹 Nettoyage des ports...${NC}"
# Tuer les processus qui pourraient bloquer les ports
lsof -ti:3003,4200,4300,3001,8081 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓${NC} Ports nettoyés"

echo ""
echo -e "${BLUE}🚀 Démarrage des services...${NC}"
echo ""

# Fonction pour tuer les processus au Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Arrêt de tous les services...${NC}"
    kill ${PID_ANGULAR:-} ${PID_SOCKET:-} ${PID_ADMIN:-} ${PID_CENTRAL_SERVER:-} ${PID_CENTRAL_DASHBOARD:-} 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 1. Démarrer le serveur Socket.IO
echo -e "${GREEN}[1/5]${NC} Démarrage Socket.IO server (port 3003)..."
cd server-render
PORT=3003 node server.js > ../logs/socket.log 2>&1 &
PID_SOCKET=$!
cd ..
sleep 2

if ps -p $PID_SOCKET > /dev/null; then
    echo -e "${GREEN}✓${NC} Socket.IO started (PID: $PID_SOCKET)"
else
    echo -e "${RED}❌ Échec démarrage Socket.IO${NC}"
    echo -e "${YELLOW}⚠${NC}  Vérifiez logs/socket.log pour plus de détails"
    cleanup
fi

# 2. Démarrer l'interface admin (mode démo)
echo -e "${GREEN}[2/5]${NC} Démarrage Admin Interface (port 8081)..."
cd raspberry/admin
if [ "$ADMIN_MODE" = "demo" ]; then
    echo "→ Mode DEMO (données mockées, pas d'écriture disque)"
    ADMIN_PORT=8081 node admin-server-demo.js > ../../logs/admin.log 2>&1 &
else
    echo "→ Mode RÉEL (uploads stockés dans ${ROOT_DIR}/public/videos)"
    ADMIN_PORT=8081 NEOPRO_DIR="${ROOT_DIR}/public" node admin-server.js > ../../logs/admin.log 2>&1 &
fi
PID_ADMIN=$!
cd ../..
sleep 2

if ps -p $PID_ADMIN > /dev/null; then
    echo -e "${GREEN}✓${NC} Admin Interface started (PID: $PID_ADMIN, mode: ${ADMIN_MODE})"
else
    echo -e "${RED}❌ Échec démarrage Admin${NC}"
    echo -e "${YELLOW}⚠${NC}  Vérifiez logs/admin.log pour plus de détails"
    cleanup
fi

# 3. Démarrer Angular Dev Server
echo -e "${GREEN}[3/5]${NC} Démarrage Angular dev server (port 4200)..."
ng serve > logs/angular.log 2>&1 &
PID_ANGULAR=$!

# Attendre que Angular soit prêt
echo -e "${YELLOW}⏳ Compilation Angular en cours...${NC}"
sleep 5

# 4. Démarrer le central server (API + WebSocket)
echo -e "${GREEN}[4/5]${NC} Démarrage Central Server (port 3001)..."
cd central-server
npm run dev > ../logs/central-server.log 2>&1 &
PID_CENTRAL_SERVER=$!
cd ..
sleep 2

if ps -p $PID_CENTRAL_SERVER > /dev/null; then
    echo -e "${GREEN}✓${NC} Central Server started (PID: $PID_CENTRAL_SERVER)"
else
    echo -e "${RED}❌ Échec démarrage Central Server${NC}"
    echo -e "${YELLOW}⚠${NC}  Vérifiez central-server/.env et logs/central-server.log"
    cleanup
fi

# 5. Démarrer le central dashboard
echo -e "${GREEN}[5/5]${NC} Démarrage Central Dashboard (port 4300)..."
cd central-dashboard
NG_CLI_ANALYTICS=false ANGULAR_CLI_ANALYTICS=false npm run start -- --port 4300 --host 127.0.0.1 > ../logs/central-dashboard.log 2>&1 &
PID_CENTRAL_DASHBOARD=$!
cd ..
sleep 5

if ps -p $PID_CENTRAL_DASHBOARD > /dev/null; then
    echo -e "${GREEN}✓${NC} Central Dashboard started (PID: $PID_CENTRAL_DASHBOARD)"
else
    echo -e "${RED}❌ Échec démarrage Central Dashboard${NC}"
    echo -e "${YELLOW}⚠${NC}  Vérifiez logs/central-dashboard.log pour plus de détails"
    cleanup
fi

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
echo "   • Dashboard: http://localhost:8081"
if [ "$ADMIN_MODE" = "demo" ]; then
    echo "   • Données mockées, aucun fichier écrit (lancer ./dev-local.sh real pour tester les uploads)"
else
    echo "   • Mode réel, uploads copiés dans ${ROOT_DIR}/public/videos/"
    echo "   • Lancer ./dev-local.sh demo pour repasser en données mockées"
fi
echo ""
echo -e "${BLUE}🔌 Socket.IO Server:${NC}"
echo "   • Port: 3003"
echo ""
echo -e "${BLUE}🛠️  Central Server:${NC}"
echo "   • API:    http://localhost:3001/api"
echo "   • Health: http://localhost:3001/health"
echo ""
echo -e "${BLUE}📊 Central Dashboard:${NC}"
echo "   • http://localhost:4300"
echo ""
echo -e "${BLUE}📋 Logs en direct:${NC}"
echo "   • tail -f logs/angular.log"
echo "   • tail -f logs/socket.log"
echo "   • tail -f logs/admin.log"
echo "   • tail -f logs/central-server.log"
echo "   • tail -f logs/central-dashboard.log"
echo ""
echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter tous les services${NC}"
echo ""

# Garder le script actif indéfiniment
while true; do
    sleep 1
done
