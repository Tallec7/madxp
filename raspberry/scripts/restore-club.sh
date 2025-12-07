#!/bin/bash

################################################################################
# Script de restauration d'un club Neopro
#
# Ce script restaure sur le Raspberry Pi :
# - La configuration (configuration.json)
# - Les vidéos (si présentes dans le backup)
# - La configuration du sync-agent
#
# Usage: ./restore-club.sh <ARCHIVE> [ADRESSE_PI]
# Exemple: ./restore-club.sh raspberry/backups/CESSON-backup-20241207.tar.gz neopro.local
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
    echo "║     RESTAURATION D'UN CLUB NEOPRO                              ║"
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

ARCHIVE_PATH="$1"
PI_ADDRESS="${2:-neopro.local}"

if [ -z "$ARCHIVE_PATH" ]; then
    print_step "Archives disponibles"
    echo ""

    # Lister les backups existants
    BACKUPS=$(ls raspberry/backups/*.tar.gz 2>/dev/null || true)

    if [ -z "$BACKUPS" ]; then
        print_warning "Aucun backup trouvé dans raspberry/backups/"
        echo ""
        echo "Créez d'abord un backup avec :"
        echo "  ./raspberry/scripts/backup-club.sh neopro.local"
        exit 0
    fi

    for backup in $BACKUPS; do
        size=$(du -h "$backup" | cut -f1)
        echo "  • $backup ($size)"
    done

    echo ""
    read -p "Chemin de l'archive à restaurer : " ARCHIVE_PATH
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
    print_error "Archive non trouvée : $ARCHIVE_PATH"
    exit 1
fi

print_info "Archive : ${ARCHIVE_PATH}"
print_info "Destination : pi@${PI_ADDRESS}"

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
# Étape 2 : Extraction de l'archive
################################################################################

print_step "Extraction de l'archive..."

TEMP_DIR=$(mktemp -d)
tar -xzf "$ARCHIVE_PATH" -C "$TEMP_DIR"

# Trouver le dossier extrait
BACKUP_FOLDER=$(ls "$TEMP_DIR" | head -1)
BACKUP_PATH="$TEMP_DIR/$BACKUP_FOLDER"

print_success "Archive extraite"

# Lister le contenu
echo ""
print_info "Contenu du backup :"
ls -la "$BACKUP_PATH" | tail -n +2 | while read line; do
    echo "  $line"
done

################################################################################
# Étape 3 : Confirmation
################################################################################

echo ""
print_warning "Cette opération va écraser les fichiers existants sur le Pi"
read -p "Voulez-vous continuer ? (oui/NON) : " CONFIRM

if [ "$CONFIRM" != "oui" ]; then
    print_info "Restauration annulée"
    rm -rf "$TEMP_DIR"
    exit 0
fi

################################################################################
# Étape 4 : Restauration de la configuration
################################################################################

print_step "Restauration de la configuration..."

# configuration.json
if [ -f "$BACKUP_PATH/configuration.json" ]; then
    scp "$BACKUP_PATH/configuration.json" pi@"${PI_ADDRESS}":/home/pi/neopro/webapp/
    ssh pi@"${PI_ADDRESS}" "sudo chown pi:pi /home/pi/neopro/webapp/configuration.json && sudo chmod 664 /home/pi/neopro/webapp/configuration.json"
    print_success "configuration.json restauré"
else
    print_warning "configuration.json non trouvé dans le backup"
fi

# site.conf (sync-agent)
if [ -f "$BACKUP_PATH/site.conf" ]; then
    scp "$BACKUP_PATH/site.conf" pi@"${PI_ADDRESS}":/tmp/
    ssh pi@"${PI_ADDRESS}" "sudo mv /tmp/site.conf /etc/neopro/ && sudo chown root:root /etc/neopro/site.conf"
    print_success "site.conf restauré"
else
    print_warning "site.conf non trouvé dans le backup"
fi

# sync-agent .env
if [ -f "$BACKUP_PATH/sync-agent.env" ]; then
    scp "$BACKUP_PATH/sync-agent.env" pi@"${PI_ADDRESS}":/home/pi/neopro/sync-agent/.env
    ssh pi@"${PI_ADDRESS}" "sudo chown pi:pi /home/pi/neopro/sync-agent/.env"
    print_success "sync-agent .env restauré"
else
    print_warning "sync-agent .env non trouvé dans le backup"
fi

################################################################################
# Étape 5 : Restauration des vidéos (si présentes)
################################################################################

if [ -d "$BACKUP_PATH/videos" ] && [ "$(ls -A $BACKUP_PATH/videos 2>/dev/null)" ]; then
    print_step "Restauration des vidéos..."

    VIDEO_COUNT=$(ls -1 "$BACKUP_PATH/videos" | wc -l | tr -d ' ')
    print_info "${VIDEO_COUNT} fichier(s) vidéo à restaurer"

    read -p "Restaurer les vidéos ? (o/N) : " RESTORE_VIDEOS

    if [[ $RESTORE_VIDEOS =~ ^[Oo]$ ]]; then
        print_info "Upload des vidéos (peut prendre du temps)..."
        scp -r "$BACKUP_PATH/videos/"* pi@"${PI_ADDRESS}":/home/pi/neopro/videos/
        ssh pi@"${PI_ADDRESS}" "sudo chown -R pi:pi /home/pi/neopro/videos/"
        print_success "Vidéos restaurées"
    else
        print_info "Restauration des vidéos ignorée"
    fi
fi

################################################################################
# Étape 6 : Redémarrage des services
################################################################################

print_step "Redémarrage des services..."

ssh pi@"${PI_ADDRESS}" "
    sudo systemctl restart neopro-app 2>/dev/null || true
    sudo systemctl restart neopro-sync-agent 2>/dev/null || true
    sudo systemctl restart nginx 2>/dev/null || true
"

print_success "Services redémarrés"

################################################################################
# Nettoyage
################################################################################

rm -rf "$TEMP_DIR"

################################################################################
# Résumé
################################################################################

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           RESTAURATION TERMINÉE                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Le backup a été restauré sur ${PI_ADDRESS}"
echo ""
echo "Vérifiez que tout fonctionne :"
echo "  • Application : http://${PI_ADDRESS}"
echo "  • Logs app    : ssh pi@${PI_ADDRESS} 'sudo journalctl -u neopro-app -f'"
echo "  • Logs sync   : ssh pi@${PI_ADDRESS} 'sudo journalctl -u neopro-sync-agent -f'"
echo ""
