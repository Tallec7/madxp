#!/bin/bash

################################################################################
# Script d'installation du système de backup automatique Neopro
#
# Ce script installe et configure le backup automatique sur le Raspberry Pi :
# - Copie le script de backup
# - Installe les fichiers systemd
# - Active le timer quotidien
# - Crée le premier backup de test
#
# Usage: ./setup-auto-backup.sh [ADRESSE_PI]
# Exemple: ./setup-auto-backup.sh neopro.local
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
    echo "║     INSTALLATION BACKUP AUTOMATIQUE NEOPRO                     ║"
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

print_info "Adresse du Pi : ${PI_ADDRESS}"

################################################################################
# Étape 1 : Connexion SSH
################################################################################

print_step "Test de connexion SSH..."

if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new pi@"${PI_ADDRESS}" exit 2>/dev/null; then
    print_error "Impossible de se connecter à pi@${PI_ADDRESS}"
    exit 1
fi

print_success "Connexion SSH OK"

################################################################################
# Étape 2 : Copie du script de backup
################################################################################

print_step "Installation du script de backup..."

# Copier le script
scp raspberry/scripts/auto-backup.sh pi@"${PI_ADDRESS}":/tmp/auto-backup.sh

# Déplacer et rendre exécutable
ssh pi@"${PI_ADDRESS}" "
    sudo mv /tmp/auto-backup.sh /home/pi/neopro/scripts/auto-backup.sh
    sudo chmod +x /home/pi/neopro/scripts/auto-backup.sh
    sudo chown pi:pi /home/pi/neopro/scripts/auto-backup.sh
"

print_success "Script de backup installé"

################################################################################
# Étape 3 : Installation des fichiers systemd
################################################################################

print_step "Installation des services systemd..."

# Copier les fichiers systemd
scp raspberry/systemd/neopro-backup.service pi@"${PI_ADDRESS}":/tmp/
scp raspberry/systemd/neopro-backup.timer pi@"${PI_ADDRESS}":/tmp/

# Installer les fichiers systemd
ssh pi@"${PI_ADDRESS}" "
    sudo mv /tmp/neopro-backup.service /etc/systemd/system/
    sudo mv /tmp/neopro-backup.timer /etc/systemd/system/
    sudo chmod 644 /etc/systemd/system/neopro-backup.service
    sudo chmod 644 /etc/systemd/system/neopro-backup.timer
    sudo systemctl daemon-reload
"

print_success "Services systemd installés"

################################################################################
# Étape 4 : Activation du timer
################################################################################

print_step "Activation du backup automatique..."

ssh pi@"${PI_ADDRESS}" "
    sudo systemctl enable neopro-backup.timer
    sudo systemctl start neopro-backup.timer
"

print_success "Timer activé (backup quotidien à 3h00)"

################################################################################
# Étape 5 : Vérification
################################################################################

print_step "Vérification de la configuration..."

# Vérifier le statut du timer
TIMER_STATUS=$(ssh pi@"${PI_ADDRESS}" "systemctl is-active neopro-backup.timer")
print_info "Statut du timer : ${TIMER_STATUS}"

# Obtenir la prochaine exécution
NEXT_RUN=$(ssh pi@"${PI_ADDRESS}" "systemctl status neopro-backup.timer | grep 'Trigger:' | awk '{print \$2, \$3, \$4, \$5}'")
print_info "Prochaine exécution : ${NEXT_RUN}"

################################################################################
# Étape 6 : Premier backup de test (optionnel)
################################################################################

echo ""
read -p "Voulez-vous créer un backup de test maintenant ? (o/N) : " TEST_BACKUP

if [[ $TEST_BACKUP =~ ^[Oo]$ ]]; then
    print_step "Création d'un backup de test..."

    ssh pi@"${PI_ADDRESS}" "sudo bash /home/pi/neopro/scripts/auto-backup.sh"

    # Vérifier que le backup a été créé
    BACKUP_COUNT=$(ssh pi@"${PI_ADDRESS}" "ls -1 /home/pi/neopro-backups/backup-*.tar.gz 2>/dev/null | wc -l")

    if [ "$BACKUP_COUNT" -gt 0 ]; then
        print_success "Backup de test créé (${BACKUP_COUNT} backup(s) total)"

        # Afficher la taille
        BACKUP_SIZE=$(ssh pi@"${PI_ADDRESS}" "du -sh /home/pi/neopro-backups 2>/dev/null | cut -f1")
        print_info "Taille totale des backups : ${BACKUP_SIZE}"
    else
        print_warning "Aucun backup créé (vérifiez les logs)"
    fi
else
    print_info "Backup de test ignoré"
fi

################################################################################
# Résumé
################################################################################

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           INSTALLATION TERMINÉE                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "Configuration :"
echo "  • Script     : /home/pi/neopro/scripts/auto-backup.sh"
echo "  • Backups    : /home/pi/neopro-backups/"
echo "  • Fréquence  : Quotidien à 3h00"
echo "  • Rétention  : 7 jours"
echo ""
echo "Commandes utiles :"
echo "  • Voir le statut     : ssh pi@${PI_ADDRESS} 'systemctl status neopro-backup.timer'"
echo "  • Créer un backup    : ssh pi@${PI_ADDRESS} 'sudo bash /home/pi/neopro/scripts/auto-backup.sh'"
echo "  • Voir les backups   : ssh pi@${PI_ADDRESS} 'ls -lh /home/pi/neopro-backups/'"
echo "  • Désactiver         : ssh pi@${PI_ADDRESS} 'sudo systemctl disable neopro-backup.timer'"
echo ""
echo "Interface web :"
echo "  • Admin panel : http://${PI_ADDRESS}:8080"
echo "  • Section Backups disponible dans l'admin"
echo ""
