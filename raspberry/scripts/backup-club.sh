#!/bin/bash

################################################################################
# Script de sauvegarde d'un club Neopro
#
# Ce script sauvegarde depuis le Raspberry Pi :
# - La configuration (configuration.json)
# - Les vidéos (optionnel, peut être volumineux)
# - La configuration du sync-agent
#
# Usage: ./backup-club.sh [ADRESSE_PI] [NOM_BACKUP]
# Exemple: ./backup-club.sh neopro.local
#          ./backup-club.sh neopro.home backup-avant-mise-a-jour
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     SAUVEGARDE D'UN CLUB NEOPRO                                ║"
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
# Paramètres
################################################################################

PI_ADDRESS="${1:-neopro.local}"
BACKUP_NAME="${2:-backup-$(date +%Y%m%d-%H%M%S)}"
BACKUP_DIR="raspberry/backups"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Créer le répertoire de backups
mkdir -p "${BACKUP_DIR}"

print_info "Adresse du Pi : ${PI_ADDRESS}"
print_info "Nom du backup : ${BACKUP_NAME}"

################################################################################
# Fonction de vérification SSH
################################################################################

check_ssh_connection() {
    local SSH_HOST="$1"

    SSH_OUTPUT=$(ssh -o ConnectTimeout=10 -o BatchMode=yes pi@"${SSH_HOST}" exit 2>&1) || SSH_RESULT=$?

    if echo "${SSH_OUTPUT}" | grep -q "REMOTE HOST IDENTIFICATION HAS CHANGED\|Host key verification failed"; then
        print_warning "La clé SSH du Raspberry Pi a changé"
        read -p "Voulez-vous réinitialiser la clé SSH pour ${SSH_HOST} ? (O/n) : " RESET_KEY
        RESET_KEY=${RESET_KEY:-O}

        if [[ $RESET_KEY =~ ^[Oo]$ ]]; then
            ssh-keygen -R "${SSH_HOST}" 2>/dev/null || true
            print_success "Clé SSH réinitialisée"
            return 0
        else
            return 1
        fi
    fi
    return 0
}

################################################################################
# Étape 1 : Connexion SSH
################################################################################

print_step "Test de connexion SSH..."

if ! check_ssh_connection "$PI_ADDRESS"; then
    print_error "Connexion annulée"
    exit 1
fi

if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new pi@"${PI_ADDRESS}" exit 2>/dev/null; then
    print_error "Impossible de se connecter à pi@${PI_ADDRESS}"
    exit 1
fi

print_success "Connexion SSH OK"

################################################################################
# Étape 2 : Récupération des infos du club
################################################################################

print_step "Récupération des informations du club..."

# Récupérer le nom du club depuis la configuration
CLUB_INFO=$(ssh pi@"${PI_ADDRESS}" "cat /home/pi/neopro/webapp/configuration.json 2>/dev/null | head -20" || echo "{}")

if echo "$CLUB_INFO" | grep -q "name"; then
    CLUB_NAME=$(echo "$CLUB_INFO" | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    print_info "Club détecté : ${CLUB_NAME}"
else
    print_warning "Impossible de détecter le nom du club"
    CLUB_NAME="unknown"
fi

# Mettre à jour le nom du backup avec le club
BACKUP_PATH="${BACKUP_DIR}/${CLUB_NAME}-${BACKUP_NAME}"
mkdir -p "${BACKUP_PATH}"

################################################################################
# Étape 3 : Sauvegarde de la configuration
################################################################################

print_step "Sauvegarde de la configuration..."

# Configuration principale
scp pi@"${PI_ADDRESS}":/home/pi/neopro/webapp/configuration.json "${BACKUP_PATH}/" 2>/dev/null && \
    print_success "configuration.json sauvegardé" || \
    print_warning "configuration.json non trouvé"

# Configuration sync-agent
scp pi@"${PI_ADDRESS}":/etc/neopro/site.conf "${BACKUP_PATH}/" 2>/dev/null && \
    print_success "site.conf (sync-agent) sauvegardé" || \
    print_warning "site.conf non trouvé"

# Variables d'environnement sync-agent
scp pi@"${PI_ADDRESS}":/home/pi/neopro/sync-agent/.env "${BACKUP_PATH}/sync-agent.env" 2>/dev/null && \
    print_success "sync-agent .env sauvegardé" || \
    print_warning "sync-agent .env non trouvé"

################################################################################
# Étape 4 : Sauvegarde des vidéos (optionnel)
################################################################################

print_step "Sauvegarde des vidéos"

# Vérifier la taille des vidéos
VIDEO_SIZE=$(ssh pi@"${PI_ADDRESS}" "du -sh /home/pi/neopro/videos 2>/dev/null | cut -f1" || echo "0")
print_info "Taille des vidéos sur le Pi : ${VIDEO_SIZE}"

echo ""
read -p "Voulez-vous sauvegarder les vidéos ? (o/N) : " BACKUP_VIDEOS

if [[ $BACKUP_VIDEOS =~ ^[Oo]$ ]]; then
    print_info "Téléchargement des vidéos (peut prendre du temps)..."
    mkdir -p "${BACKUP_PATH}/videos"

    scp -r pi@"${PI_ADDRESS}":/home/pi/neopro/videos/* "${BACKUP_PATH}/videos/" 2>/dev/null && \
        print_success "Vidéos sauvegardées" || \
        print_warning "Aucune vidéo trouvée ou erreur de transfert"
else
    print_info "Sauvegarde des vidéos ignorée"
fi

################################################################################
# Étape 5 : Création de l'archive
################################################################################

print_step "Création de l'archive..."

# Créer une archive compressée
ARCHIVE_NAME="${CLUB_NAME}-${BACKUP_NAME}.tar.gz"
cd "${BACKUP_DIR}"
COPYFILE_DISABLE=1 tar -czf "${ARCHIVE_NAME}" "$(basename ${BACKUP_PATH})"
cd - > /dev/null

# Supprimer le dossier temporaire
rm -rf "${BACKUP_PATH}"

ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"
ARCHIVE_SIZE=$(du -h "${ARCHIVE_PATH}" | cut -f1)

print_success "Archive créée : ${ARCHIVE_PATH} (${ARCHIVE_SIZE})"

################################################################################
# Résumé
################################################################################

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           SAUVEGARDE TERMINÉE                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Archive : ${ARCHIVE_PATH}"
echo "Taille  : ${ARCHIVE_SIZE}"
echo ""
echo "Pour restaurer ce backup :"
echo "  ./raspberry/scripts/restore-club.sh ${ARCHIVE_PATH} ${PI_ADDRESS}"
echo ""
