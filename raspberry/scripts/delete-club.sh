#!/bin/bash

################################################################################
# Script de suppression d'un club Neopro
#
# Ce script :
# 1. Supprime l'enregistrement du site sur le serveur central
# 2. Supprime la configuration locale (raspberry/configs/)
# 3. Optionnellement, réinitialise le Raspberry Pi
#
# Usage: ./delete-club.sh [NOM_CLUB]
# Exemple: ./delete-club.sh CESSON
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${RED}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     SUPPRESSION D'UN CLUB NEOPRO                               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Vérifier qu'on est à la racine du projet
if [ ! -f "package.json" ]; then
    print_error "Ce script doit être exécuté depuis la racine du projet"
    exit 1
fi

print_header

################################################################################
# Étape 1 : Sélection du club
################################################################################

CLUB_NAME="$1"

if [ -z "$CLUB_NAME" ]; then
    print_step "Clubs disponibles"
    echo ""

    # Lister les configurations existantes
    CONFIGS=$(ls raspberry/configs/*-configuration.json 2>/dev/null || true)

    if [ -z "$CONFIGS" ]; then
        print_warning "Aucune configuration de club trouvée dans raspberry/configs/"
        exit 0
    fi

    for config in $CONFIGS; do
        name=$(basename "$config" | sed 's/-configuration.json//')
        echo "  • $name"
    done

    echo ""
    read -p "Nom du club à supprimer : " CLUB_NAME
fi

CLUB_NAME=$(echo "$CLUB_NAME" | tr '[:lower:]' '[:upper:]' | tr -d ' ')
CONFIG_FILE="raspberry/configs/${CLUB_NAME}-configuration.json"

if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Configuration non trouvée : $CONFIG_FILE"
    exit 1
fi

################################################################################
# Étape 2 : Confirmation
################################################################################

print_step "Confirmation"
echo ""
print_warning "Vous allez supprimer le club : $CLUB_NAME"
echo ""
echo "Cette action va :"
echo "  • Supprimer l'enregistrement sur le serveur central (si configuré)"
echo "  • Supprimer le fichier de configuration local"
echo "  • Optionnellement réinitialiser le Raspberry Pi"
echo ""
read -p "Êtes-vous sûr de vouloir continuer ? (oui/NON) : " CONFIRM

if [ "$CONFIRM" != "oui" ]; then
    print_info "Suppression annulée"
    exit 0
fi

################################################################################
# Étape 3 : Suppression sur le serveur central
################################################################################

print_step "Suppression sur le serveur central"

read -p "Voulez-vous supprimer l'enregistrement sur le serveur central ? (o/N) : " DELETE_CENTRAL

if [[ $DELETE_CENTRAL =~ ^[Oo]$ ]]; then
    echo ""
    print_info "Credentials du dashboard central (admin)"
    read -p "Email admin : " ADMIN_EMAIL
    read -s -p "Mot de passe admin : " ADMIN_PASSWORD
    echo ""

    if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
        print_warning "Credentials manquants, suppression centrale ignorée"
    else
        # Récupérer le site_id depuis la configuration ou le Pi
        print_info "Recherche du site sur le serveur central..."

        # Extraire le nom du site depuis la configuration
        SITE_NAME=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || echo "$CLUB_NAME")

        # Appeler l'API pour supprimer le site
        CENTRAL_URL="https://neopro-central.onrender.com"

        # D'abord, se connecter pour obtenir un token
        print_info "Connexion au serveur central..."
        LOGIN_RESPONSE=$(curl -s -X POST "${CENTRAL_URL}/api/auth/login" \
            -H "Content-Type: application/json" \
            -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\"}" 2>/dev/null || echo "error")

        if echo "$LOGIN_RESPONSE" | grep -q "token"; then
            TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

            # Lister les sites pour trouver celui à supprimer
            print_info "Recherche du site $CLUB_NAME..."
            SITES_RESPONSE=$(curl -s -X GET "${CENTRAL_URL}/api/sites" \
                -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "error")

            # Chercher le site par nom
            SITE_ID=$(echo "$SITES_RESPONSE" | grep -o "\"id\"[[:space:]]*:[[:space:]]*\"[^\"]*\"[^}]*\"name\"[[:space:]]*:[[:space:]]*\"[^\"]*${CLUB_NAME}[^\"]*\"" | head -1 | grep -o "\"id\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed 's/.*"\([^"]*\)"$/\1/' || true)

            if [ -n "$SITE_ID" ]; then
                print_info "Site trouvé (ID: $SITE_ID), suppression..."
                DELETE_RESPONSE=$(curl -s -X DELETE "${CENTRAL_URL}/api/sites/${SITE_ID}" \
                    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "error")

                if echo "$DELETE_RESPONSE" | grep -q -i "success\|deleted\|ok" || [ -z "$DELETE_RESPONSE" ]; then
                    print_success "Site supprimé du serveur central"
                else
                    print_warning "Réponse inattendue du serveur : $DELETE_RESPONSE"
                fi
            else
                print_warning "Site $CLUB_NAME non trouvé sur le serveur central"
                print_info "Il a peut-être déjà été supprimé ou n'a jamais été enregistré"
            fi
        else
            print_error "Échec de la connexion au serveur central"
            print_info "Vérifiez vos credentials et réessayez"
        fi
    fi
else
    print_info "Suppression centrale ignorée"
fi

################################################################################
# Étape 4 : Réinitialisation du Raspberry Pi
################################################################################

print_step "Réinitialisation du Raspberry Pi"

read -p "Voulez-vous réinitialiser le Raspberry Pi associé ? (o/N) : " RESET_PI

if [[ $RESET_PI =~ ^[Oo]$ ]]; then
    read -p "Adresse du Raspberry Pi (défaut: neopro.local) : " PI_ADDRESS
    PI_ADDRESS=${PI_ADDRESS:-neopro.local}

    print_warning "Cela va :"
    echo "  • Arrêter les services neopro"
    echo "  • Supprimer la configuration du sync-agent"
    echo "  • Supprimer le fichier configuration.json"
    echo ""
    read -p "Confirmer la réinitialisation du Pi ? (oui/NON) : " CONFIRM_PI

    if [ "$CONFIRM_PI" = "oui" ]; then
        print_info "Connexion au Pi..."

        ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new pi@"$PI_ADDRESS" "
            echo '>>> Arrêt des services...'
            sudo systemctl stop neopro-sync-agent 2>/dev/null || true
            sudo systemctl disable neopro-sync-agent 2>/dev/null || true

            echo '>>> Suppression de la configuration sync-agent...'
            sudo rm -f /etc/neopro/site.conf 2>/dev/null || true
            sudo rm -f /home/pi/neopro/sync-agent/.env 2>/dev/null || true

            echo '>>> Suppression de configuration.json...'
            sudo rm -f /home/pi/neopro/webapp/configuration.json 2>/dev/null || true

            echo '>>> Nettoyage des logs...'
            sudo journalctl --rotate 2>/dev/null || true
            sudo journalctl --vacuum-time=1s 2>/dev/null || true

            echo '✓ Raspberry Pi réinitialisé'
        " && print_success "Raspberry Pi réinitialisé" || print_error "Échec de la réinitialisation du Pi"
    else
        print_info "Réinitialisation du Pi annulée"
    fi
else
    print_info "Réinitialisation du Pi ignorée"
fi

################################################################################
# Étape 5 : Suppression de la configuration locale
################################################################################

print_step "Suppression de la configuration locale"

rm -f "$CONFIG_FILE"
print_success "Configuration supprimée : $CONFIG_FILE"

# Supprimer aussi la clé SSH si demandé
read -p "Voulez-vous aussi supprimer la clé SSH connue pour ce Pi ? (o/N) : " DELETE_SSH

if [[ $DELETE_SSH =~ ^[Oo]$ ]]; then
    if [ -n "$PI_ADDRESS" ]; then
        ssh-keygen -R "$PI_ADDRESS" 2>/dev/null || true
        print_success "Clé SSH supprimée pour $PI_ADDRESS"
    fi
fi

################################################################################
# Résumé
################################################################################

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           SUPPRESSION TERMINÉE                                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Le club $CLUB_NAME a été supprimé."
echo ""
echo "Pour reconfigurer ce club :"
echo "  ./raspberry/scripts/setup-new-club.sh"
echo ""
