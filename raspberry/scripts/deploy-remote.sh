#!/bin/bash

################################################################################
# Script de déploiement distant Neopro
# Permet de mettre à jour un Raspberry Pi Neopro à distance via SSH
#
# Usage: ./deploy-remote.sh [IP_RASPBERRY]
# Exemple: ./deploy-remote.sh 192.168.1.100
#          ./deploy-remote.sh neopro.local
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}>>> $1${NC}"
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

# Paramètres
RASPBERRY_IP="${1:-neopro.local}"
RASPBERRY_USER="pi"
RASPBERRY_DIR="/home/pi/neopro"
DEPLOY_ARCHIVE="raspberry/neopro-raspberry-deploy.tar.gz"

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         DÉPLOIEMENT DISTANT NEOPRO                             ║"
echo "║         Cible: ${RASPBERRY_USER}@${RASPBERRY_IP}              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifications préalables
if [ ! -f "${DEPLOY_ARCHIVE}" ]; then
    print_error "Archive de déploiement non trouvée: ${DEPLOY_ARCHIVE}"
    echo "Veuillez d'abord exécuter: ./raspberry/scripts/build-raspberry.sh"
    exit 1
fi

# Test de connexion SSH
print_step "Test de connexion SSH..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${RASPBERRY_USER}@${RASPBERRY_IP} exit 2>/dev/null; then
    print_error "Impossible de se connecter à ${RASPBERRY_USER}@${RASPBERRY_IP}"
    echo "Vérifiez que:"
    echo "  • Le Raspberry Pi est allumé et accessible"
    echo "  • Vous êtes connecté au bon réseau WiFi"
    echo "  • L'adresse IP est correcte"
    echo "  • SSH est activé sur le Raspberry Pi"
    exit 1
fi
print_success "Connexion SSH OK"

# Backup de la version actuelle
print_step "Sauvegarde de la version actuelle..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    cd ${RASPBERRY_DIR}
    mkdir -p backups
    BACKUP_NAME=\"backup-\$(date +%Y%m%d-%H%M%S).tar.gz\"
    tar -czf backups/\${BACKUP_NAME} webapp/ server/ 2>/dev/null || true
    echo \"Backup créé: \${BACKUP_NAME}\"
    # Garder seulement les 5 derniers backups
    ls -t backups/*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
"
print_success "Backup créé"

# Upload de l'archive
print_step "Upload de la nouvelle version..."
scp ${DEPLOY_ARCHIVE} ${RASPBERRY_USER}@${RASPBERRY_IP}:~/neopro-deploy.tar.gz
print_success "Upload terminé"

# Extraction et installation
print_step "Installation de la nouvelle version..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    # Extraction
    rm -rf ~/deploy
    tar -xzf ~/neopro-deploy.tar.gz

    # Installation webapp
    if [ -d ~/deploy/webapp ]; then
        sudo rm -rf ${RASPBERRY_DIR}/webapp/*
        sudo cp -r ~/deploy/webapp/* ${RASPBERRY_DIR}/webapp/
        echo 'Webapp installée'
    fi

    # Installation serveur
    if [ -d ~/deploy/server ]; then
        sudo cp -r ~/deploy/server/* ${RASPBERRY_DIR}/server/
        cd ${RASPBERRY_DIR}/server
        sudo npm install --production 2>/dev/null || true
        echo 'Serveur installé'
    fi

    # Installation vidéos (optionnel - seulement nouveaux fichiers)
    if [ -d ~/deploy/videos ]; then
        sudo cp -rn ~/deploy/videos/* ${RASPBERRY_DIR}/videos/ 2>/dev/null || true
        echo 'Vidéos synchronisées'
    fi

    # Permissions
    sudo chown -R pi:pi ${RASPBERRY_DIR}

    # Nettoyage
    rm -rf ~/deploy ~/neopro-deploy.tar.gz
"
print_success "Installation terminée"

# Redémarrage des services
print_step "Redémarrage des services..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    sudo systemctl restart neopro-app
    sleep 2
    sudo systemctl restart nginx
    sleep 1

    # Vérification des services
    if systemctl is-active --quiet neopro-app; then
        echo '✓ Service neopro-app: OK'
    else
        echo '✗ Service neopro-app: ERREUR'
        exit 1
    fi

    if systemctl is-active --quiet nginx; then
        echo '✓ Service nginx: OK'
    else
        echo '✗ Service nginx: ERREUR'
        exit 1
    fi
"
print_success "Services redémarrés"

# Test de l'application
print_step "Test de l'application..."
if curl -s -o /dev/null -w "%{http_code}" http://${RASPBERRY_IP}/ | grep -q "200"; then
    print_success "Application accessible"
else
    print_warning "Application non accessible (vérifiez manuellement)"
fi

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          DÉPLOIEMENT TERMINÉ AVEC SUCCÈS                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}Application mise à jour sur:${NC}"
echo "  • URL: http://${RASPBERRY_IP}"
echo "  • Mode TV: http://${RASPBERRY_IP}/tv"
echo "  • Remote: http://${RASPBERRY_IP}/remote"
echo ""
echo -e "${YELLOW}Commandes utiles:${NC}"
echo "  • Voir les logs: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo journalctl -u neopro-app -f'"
echo "  • Redémarrer: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo systemctl restart neopro-app'"
echo "  • Status: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo systemctl status neopro-app'"
echo ""
echo -e "${GREEN}Déploiement terminé!${NC}"
