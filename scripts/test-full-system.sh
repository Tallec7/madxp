#!/bin/bash
#
# NEOPRO - Script de Test Complet du Système
# ===========================================
#
# Usage:
#   ./scripts/test-full-system.sh [options]
#
# Options:
#   --api-url URL      URL de l'API (défaut: http://localhost:3001)
#   --pi-host HOST     Hostname du Pi (défaut: neopro.local)
#   --skip-pi          Ignorer les tests Pi
#   --skip-unit        Ignorer les tests unitaires
#   --verbose          Afficher plus de détails
#   --help             Afficher l'aide
#
# Exemple:
#   ./scripts/test-full-system.sh --api-url https://api.neopro.fr --pi-host 192.168.1.50
#

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration par défaut
API_URL="http://localhost:3001"
PI_HOST="neopro.local"
SKIP_PI=false
SKIP_UNIT=false
VERBOSE=false

# Compteurs
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --pi-host)
            PI_HOST="$2"
            shift 2
            ;;
        --skip-pi)
            SKIP_PI=true
            shift
            ;;
        --skip-unit)
            SKIP_UNIT=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            head -30 "$0" | tail -25
            exit 0
            ;;
        *)
            echo "Option inconnue: $1"
            exit 1
            ;;
    esac
done

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

log_section() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

# Déterminer le répertoire racine du projet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           NEOPRO - Test Complet du Système                   ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  API URL:  ${API_URL}${NC}"
echo -e "${GREEN}║  Pi Host:  ${PI_HOST}${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# PHASE 1: Vérifications préliminaires
# ============================================================================
log_section "PHASE 1: Vérifications Préliminaires"

# Vérifier Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js installé: $NODE_VERSION"
else
    log_fail "Node.js non installé"
    exit 1
fi

# Vérifier npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    log_success "npm installé: $NPM_VERSION"
else
    log_fail "npm non installé"
    exit 1
fi

# Vérifier les dépendances
if [ -d "node_modules" ]; then
    log_success "node_modules présent (racine)"
else
    log_fail "node_modules manquant - exécuter 'npm install'"
fi

if [ -d "central-server/node_modules" ]; then
    log_success "node_modules présent (central-server)"
else
    log_fail "node_modules manquant dans central-server"
fi

# ============================================================================
# PHASE 2: Audit de sécurité
# ============================================================================
log_section "PHASE 2: Audit de Sécurité"

log_info "Vérification des vulnérabilités npm..."

# Audit racine
AUDIT_ROOT=$(cd "$PROJECT_ROOT" && npm audit --audit-level=high 2>&1 || true)
if echo "$AUDIT_ROOT" | grep -q "found 0 vulnerabilities"; then
    log_success "Aucune vulnérabilité haute (racine)"
elif echo "$AUDIT_ROOT" | grep -q "high"; then
    HIGH_COUNT=$(echo "$AUDIT_ROOT" | grep -oE "[0-9]+ high" | head -1 || echo "? high")
    log_fail "Vulnérabilités trouvées (racine): $HIGH_COUNT"
else
    log_success "Aucune vulnérabilité haute (racine)"
fi

# Audit central-server
AUDIT_SERVER=$(cd "$PROJECT_ROOT/central-server" && npm audit --audit-level=high 2>&1 || true)
if echo "$AUDIT_SERVER" | grep -q "found 0 vulnerabilities"; then
    log_success "Aucune vulnérabilité haute (central-server)"
elif echo "$AUDIT_SERVER" | grep -q "high"; then
    HIGH_COUNT=$(echo "$AUDIT_SERVER" | grep -oE "[0-9]+ high" | head -1 || echo "? high")
    log_fail "Vulnérabilités trouvées (central-server): $HIGH_COUNT"
else
    log_success "Aucune vulnérabilité haute (central-server)"
fi

# ============================================================================
# PHASE 3: Tests unitaires
# ============================================================================
log_section "PHASE 3: Tests Unitaires"

if [ "$SKIP_UNIT" = true ]; then
    log_skip "Tests unitaires ignorés (--skip-unit)"
else
    log_info "Exécution des tests unitaires backend..."

    cd "$PROJECT_ROOT/central-server"

    # Exécuter les tests et capturer le résultat
    if npm test -- --passWithNoTests 2>&1 | tee /tmp/neopro-test-output.txt | tail -20; then
        # Vérifier si tous les tests passent
        if grep -q "Test Suites:.*failed" /tmp/neopro-test-output.txt; then
            FAILED=$(grep "Tests:.*failed" /tmp/neopro-test-output.txt | grep -oE "[0-9]+ failed" | head -1)
            log_fail "Tests unitaires: $FAILED"
        else
            PASSED=$(grep "Tests:.*passed" /tmp/neopro-test-output.txt | grep -oE "[0-9]+ passed" | head -1 || echo "? passed")
            log_success "Tests unitaires: $PASSED"
        fi
    else
        log_fail "Tests unitaires: erreur d'exécution"
    fi

    cd "$PROJECT_ROOT"
fi

# ============================================================================
# PHASE 4: Build TypeScript
# ============================================================================
log_section "PHASE 4: Build TypeScript"

log_info "Compilation du backend..."
cd "$PROJECT_ROOT/central-server"

if npm run build 2>&1 | tail -5; then
    log_success "Build central-server réussi"
else
    log_fail "Build central-server échoué"
fi

cd "$PROJECT_ROOT"

# ============================================================================
# PHASE 5: Tests API
# ============================================================================
log_section "PHASE 5: Tests API"

log_info "Test de connexion à l'API: $API_URL"

# Health check
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")

if [ "$HEALTH_RESPONSE" = "200" ]; then
    log_success "API Health check: OK (HTTP 200)"
else
    log_fail "API Health check: HTTP $HEALTH_RESPONSE (attendu: 200)"
    log_info "L'API n'est pas accessible. Démarrez-la avec: cd central-server && npm run dev"
fi

# Test endpoint auth (doit retourner 401 sans token)
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/auth/me" 2>/dev/null || echo "000")

if [ "$AUTH_RESPONSE" = "401" ]; then
    log_success "API Auth protection: OK (HTTP 401 sans token)"
elif [ "$AUTH_RESPONSE" = "000" ]; then
    log_skip "API Auth: API non accessible"
else
    log_fail "API Auth protection: HTTP $AUTH_RESPONSE (attendu: 401)"
fi

# Test endpoint sites (doit retourner 401 sans token)
SITES_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/sites" 2>/dev/null || echo "000")

if [ "$SITES_RESPONSE" = "401" ]; then
    log_success "API Sites protection: OK (HTTP 401 sans token)"
elif [ "$SITES_RESPONSE" = "000" ]; then
    log_skip "API Sites: API non accessible"
else
    log_fail "API Sites protection: HTTP $SITES_RESPONSE (attendu: 401)"
fi

# ============================================================================
# PHASE 6: Tests Raspberry Pi
# ============================================================================
log_section "PHASE 6: Tests Raspberry Pi"

if [ "$SKIP_PI" = true ]; then
    log_skip "Tests Pi ignorés (--skip-pi)"
else
    log_info "Test de connexion au Pi: $PI_HOST"

    # Ping test
    if ping -c 1 -W 2 "$PI_HOST" &> /dev/null; then
        log_success "Pi accessible via ping"

        # Test SSH (port 22)
        if nc -z -w 2 "$PI_HOST" 22 2>/dev/null; then
            log_success "SSH accessible (port 22)"
        else
            log_fail "SSH non accessible (port 22)"
        fi

        # Test port 80 (frontend TV)
        if nc -z -w 2 "$PI_HOST" 80 2>/dev/null; then
            log_success "Frontend TV accessible (port 80)"
        else
            log_skip "Frontend TV non accessible (port 80) - peut être normal si pas démarré"
        fi

        # Test port 3000 (Socket.IO local)
        if nc -z -w 2 "$PI_HOST" 3000 2>/dev/null; then
            log_success "Socket.IO local accessible (port 3000)"
        else
            log_skip "Socket.IO local non accessible (port 3000)"
        fi

        # Test port 8080 (admin interface)
        if nc -z -w 2 "$PI_HOST" 8080 2>/dev/null; then
            log_success "Interface admin accessible (port 8080)"
        else
            log_skip "Interface admin non accessible (port 8080)"
        fi

    else
        log_fail "Pi non accessible: $PI_HOST"
        log_info "Vérifiez que le Pi est allumé et sur le même réseau"
    fi
fi

# ============================================================================
# PHASE 7: Vérification des fichiers critiques
# ============================================================================
log_section "PHASE 7: Fichiers Critiques"

CRITICAL_FILES=(
    "central-server/src/server.ts"
    "central-server/src/middleware/auth.ts"
    "central-server/src/services/socket.service.ts"
    "central-server/src/config/database.ts"
    "raspberry/frontend/src/app/components/tv.component.ts"
    "raspberry/sync-agent/sync-agent.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        log_success "Fichier présent: $file"
    else
        log_fail "Fichier manquant: $file"
    fi
done

# ============================================================================
# PHASE 8: Vérification .env
# ============================================================================
log_section "PHASE 8: Configuration Environnement"

if [ -f "$PROJECT_ROOT/central-server/.env" ]; then
    log_success "Fichier .env présent (central-server)"

    # Vérifier les variables critiques (sans afficher les valeurs)
    ENV_FILE="$PROJECT_ROOT/central-server/.env"

    if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
        log_success "DATABASE_URL configuré"
    else
        log_fail "DATABASE_URL manquant dans .env"
    fi

    if grep -q "^JWT_SECRET=" "$ENV_FILE"; then
        JWT_LENGTH=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | wc -c)
        if [ "$JWT_LENGTH" -gt 32 ]; then
            log_success "JWT_SECRET configuré (longueur OK)"
        else
            log_fail "JWT_SECRET trop court (min 32 caractères)"
        fi
    else
        log_fail "JWT_SECRET manquant dans .env"
    fi

    if grep -q "^FTP_HOST=" "$ENV_FILE" && grep -q "^FTP_USER=" "$ENV_FILE"; then
        log_success "Configuration FTP présente"
    else
        log_skip "Configuration FTP absente (Supabase sera utilisé)"
    fi

else
    log_fail "Fichier .env manquant dans central-server"
    log_info "Copiez .env.example vers .env et configurez les variables"
fi

# ============================================================================
# PHASE 9: Lint
# ============================================================================
log_section "PHASE 9: Lint (ESLint)"

log_info "Vérification du code avec ESLint..."

cd "$PROJECT_ROOT"
if npm run lint 2>&1 | tail -10; then
    log_success "Lint: aucune erreur"
else
    log_fail "Lint: des erreurs ont été détectées"
fi

# ============================================================================
# RÉSUMÉ
# ============================================================================
log_section "RÉSUMÉ DES TESTS"

TOTAL=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))

echo ""
echo -e "  ${GREEN}Réussis:${NC}  $TESTS_PASSED"
echo -e "  ${RED}Échoués:${NC}  $TESTS_FAILED"
echo -e "  ${YELLOW}Ignorés:${NC}  $TESTS_SKIPPED"
echo -e "  ─────────────────"
echo -e "  Total:    $TOTAL"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    TOUS LES TESTS PASSENT                    ║${NC}"
    echo -e "${GREEN}║                    Prêt pour la production !                 ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    DES TESTS ONT ÉCHOUÉ                      ║${NC}"
    echo -e "${RED}║              Corrigez les erreurs avant déploiement          ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
