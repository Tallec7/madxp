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
ADMIN_SERVICE_FILE="raspberry/config/systemd/neopro-admin.service"
PACKAGE_VERSION="unknown"

if [ -f "raspberry/deploy/VERSION" ]; then
    PACKAGE_VERSION=$(tr -d '\r' < raspberry/deploy/VERSION | head -n1 | tr -d '[:space:]')
elif [ -f "${DEPLOY_ARCHIVE}" ]; then
    # L'archive contient directement VERSION (sans préfixe deploy/)
    PACKAGE_VERSION=$(tar -xOf "${DEPLOY_ARCHIVE}" VERSION 2>/dev/null | tr -d '\r' | head -n1 | tr -d '[:space:]')
fi

if [ -z "$PACKAGE_VERSION" ]; then
    PACKAGE_VERSION="unknown"
fi

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         DÉPLOIEMENT DISTANT NEOPRO                             ║"
echo "║         Cible: ${RASPBERRY_USER}@${RASPBERRY_IP}              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${BLUE}Version du package : ${PACKAGE_VERSION}${NC}"

# Vérifications préalables
if [ ! -f "${DEPLOY_ARCHIVE}" ]; then
    print_error "Archive de déploiement non trouvée: ${DEPLOY_ARCHIVE}"
    echo "Veuillez d'abord exécuter: ./raspberry/scripts/build-raspberry.sh"
    exit 1
fi

# Test de connexion SSH
print_step "Test de connexion SSH..."
print_warning "Vous allez devoir entrer le mot de passe SSH du Raspberry Pi"

# Tenter la connexion et capturer le résultat
SSH_OUTPUT=$(ssh -o ConnectTimeout=10 -o BatchMode=yes ${RASPBERRY_USER}@${RASPBERRY_IP} exit 2>&1) || SSH_RESULT=$?

# Vérifier si c'est une erreur de clé SSH (nouveau boîtier ou réinstallation)
if echo "${SSH_OUTPUT}" | grep -q "REMOTE HOST IDENTIFICATION HAS CHANGED\|Host key verification failed"; then
    print_warning "La clé SSH du Raspberry Pi a changé (nouveau boîtier ou réinstallation)"
    echo ""
    read -p "Voulez-vous réinitialiser la clé SSH pour ${RASPBERRY_IP} ? (O/n) : " RESET_KEY
    RESET_KEY=${RESET_KEY:-O}

    if [[ $RESET_KEY =~ ^[Oo]$ ]]; then
        print_step "Suppression de l'ancienne clé SSH..."
        ssh-keygen -R ${RASPBERRY_IP} 2>/dev/null || true
        # Supprimer aussi l'IP si on utilise un hostname
        if [[ "${RASPBERRY_IP}" == *".local"* ]] || [[ "${RASPBERRY_IP}" == *".home"* ]]; then
            RESOLVED_IP=$(getent hosts ${RASPBERRY_IP} 2>/dev/null | awk '{print $1}' || true)
            if [ -n "${RESOLVED_IP}" ]; then
                ssh-keygen -R ${RESOLVED_IP} 2>/dev/null || true
            fi
        fi
        print_success "Clé SSH réinitialisée"
        echo ""
        print_step "Nouvelle tentative de connexion..."
        # Réessayer avec StrictHostKeyChecking=accept-new pour accepter la nouvelle clé
        if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${RASPBERRY_USER}@${RASPBERRY_IP} exit; then
            print_error "Impossible de se connecter après réinitialisation"
            exit 1
        fi
    else
        print_error "Connexion annulée"
        exit 1
    fi
elif [ -n "${SSH_RESULT}" ] && [ "${SSH_RESULT}" -ne 0 ]; then
    # Autre erreur SSH - réessayer en mode interactif (pour le mot de passe)
    if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${RASPBERRY_USER}@${RASPBERRY_IP} exit; then
        print_error "Impossible de se connecter à ${RASPBERRY_USER}@${RASPBERRY_IP}"
        echo "Vérifiez que:"
        echo "  • Le Raspberry Pi est allumé et accessible"
        echo "  • Vous êtes connecté au bon réseau WiFi (NEOPRO-...)"
        echo "  • L'adresse IP est correcte (neopro.local ou 192.168.4.1)"
        echo "  • SSH est activé sur le Raspberry Pi"
        echo ""
        echo "💡 Conseil: Configurez une clé SSH pour éviter de retaper le mot de passe:"
        echo "   ssh-copy-id ${RASPBERRY_USER}@${RASPBERRY_IP}"
        exit 1
    fi
fi
print_success "Connexion SSH OK"

# Backup de la version actuelle (sans compression pour vitesse sur Pi)
print_step "Sauvegarde de la version actuelle..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    cd ${RASPBERRY_DIR}
    mkdir -p backups
    BACKUP_NAME=\"backup-\$(date +%Y%m%d-%H%M%S).tar\"
    # tar sans compression (-c au lieu de -czf) : 10x plus rapide sur Pi
    tar -cf backups/\${BACKUP_NAME} webapp/ server/ 2>/dev/null || true
    echo \"Backup créé: \${BACKUP_NAME}\"
    # Garder seulement les 3 derniers backups (plus gros sans compression)
    ls -t backups/backup-*.tar 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null || true
    # Nettoyer anciens backups compressés
    rm -f backups/*.tar.gz 2>/dev/null || true
"
print_success "Backup créé"

# Upload de l'archive
print_step "Upload de la nouvelle version..."
scp ${DEPLOY_ARCHIVE} ${RASPBERRY_USER}@${RASPBERRY_IP}:~/neopro-deploy.tar.gz
print_success "Upload terminé"

# Upload du fichier de service admin si disponible
if [ -f "${ADMIN_SERVICE_FILE}" ]; then
    print_step "Mise à jour de l'unité systemd neopro-admin..."
    scp ${ADMIN_SERVICE_FILE} ${RASPBERRY_USER}@${RASPBERRY_IP}:/tmp/neopro-admin.service
    print_success "Fichier de service uploadé"
fi

# Extraction et installation
print_step "Installation de la nouvelle version..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    # Création d'un répertoire temporaire pour l'extraction
    rm -rf ~/neopro-update
    mkdir -p ~/neopro-update

    # Extraction (--warning=no-unknown-keyword supprime les warnings macOS xattr)
    # L'archive contient directement webapp/, server/, etc. (sans préfixe deploy/)
    tar --warning=no-unknown-keyword -xzf ~/neopro-deploy.tar.gz -C ~/neopro-update

    # Installation webapp
    # IMPORTANT: Préserver configuration.json qui est spécifique au club
    # Note: Les vidéos sont dans /home/pi/neopro/videos/, pas dans webapp/
    if [ -d ~/neopro-update/webapp ]; then
        # Sauvegarder configuration.json
        if [ -f ${RASPBERRY_DIR}/webapp/configuration.json ]; then
            cp ${RASPBERRY_DIR}/webapp/configuration.json /tmp/configuration.json.backup
            echo 'Configuration locale sauvegardée'
        fi

        # Supprimer et installer la nouvelle webapp
        sudo rm -rf ${RASPBERRY_DIR}/webapp/*
        sudo cp -r ~/neopro-update/webapp/* ${RASPBERRY_DIR}/webapp/

        # Restaurer configuration.json
        if [ -f /tmp/configuration.json.backup ]; then
            sudo cp /tmp/configuration.json.backup ${RASPBERRY_DIR}/webapp/configuration.json
            rm /tmp/configuration.json.backup
            echo 'Configuration locale restaurée'
        fi

        echo 'Webapp installée (configuration préservée)'
    fi

    # Installation serveur
    if [ -d ~/neopro-update/server ]; then
        sudo cp -r ~/neopro-update/server/* ${RASPBERRY_DIR}/server/
        # npm install seulement si package.json a changé
        if [ -f ~/neopro-update/server/package.json ]; then
            cd ${RASPBERRY_DIR}/server
            if ! cmp -s ~/neopro-update/server/package.json ${RASPBERRY_DIR}/server/.package.json.last 2>/dev/null; then
                sudo npm install --production 2>/dev/null || true
                sudo cp package.json .package.json.last
                echo 'Serveur installé (dépendances mises à jour)'
            else
                echo 'Serveur installé (dépendances inchangées)'
            fi
        else
            echo 'Serveur installé'
        fi
    fi

    # NOTE: Les vidéos ne sont pas déployées ici
    # Elles sont gérées par le sync-agent depuis Google Drive

    # Installation sync-agent
    if [ -d ~/neopro-update/sync-agent ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/sync-agent
        # Sauvegarder les configs locales du sync-agent (.env, config/.env)
        if [ -f ${RASPBERRY_DIR}/sync-agent/.env ]; then
            cp ${RASPBERRY_DIR}/sync-agent/.env /tmp/sync-agent.env.backup
        fi
        if [ -f ${RASPBERRY_DIR}/sync-agent/config/.env ]; then
            cp ${RASPBERRY_DIR}/sync-agent/config/.env /tmp/sync-agent-config.env.backup
        fi
        # Copier les nouveaux fichiers
        sudo cp -r ~/neopro-update/sync-agent/* ${RASPBERRY_DIR}/sync-agent/
        # Restaurer les configs locales
        if [ -f /tmp/sync-agent.env.backup ]; then
            sudo cp /tmp/sync-agent.env.backup ${RASPBERRY_DIR}/sync-agent/.env
            rm /tmp/sync-agent.env.backup
        fi
        if [ -f /tmp/sync-agent-config.env.backup ]; then
            sudo mkdir -p ${RASPBERRY_DIR}/sync-agent/config
            sudo cp /tmp/sync-agent-config.env.backup ${RASPBERRY_DIR}/sync-agent/config/.env
            rm /tmp/sync-agent-config.env.backup
        fi
        echo 'Sync-agent installé (configuration préservée)'
    fi

    # Installation admin panel
    if [ -d ~/neopro-update/admin ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/admin
        sudo cp -r ~/neopro-update/admin/* ${RASPBERRY_DIR}/admin/
        # npm install seulement si package.json a changé
        if [ -f ~/neopro-update/admin/package.json ]; then
            cd ${RASPBERRY_DIR}/admin
            if ! cmp -s ~/neopro-update/admin/package.json ${RASPBERRY_DIR}/admin/.package.json.last 2>/dev/null; then
                sudo npm install --production 2>/dev/null || true
                sudo cp package.json .package.json.last
                echo 'Admin panel installé (dépendances mises à jour)'
            else
                echo 'Admin panel installé (dépendances inchangées)'
            fi
        else
            echo 'Admin panel installé'
        fi
    fi

    # Enregistrer les métadonnées de version (à la racine de neopro/)
    if [ -f ~/neopro-update/VERSION ]; then
        sudo cp ~/neopro-update/VERSION ${RASPBERRY_DIR}/VERSION
        sudo chown pi:pi ${RASPBERRY_DIR}/VERSION
        sudo chmod 644 ${RASPBERRY_DIR}/VERSION
        echo \"Version installée: \$(cat ${RASPBERRY_DIR}/VERSION)\"
    fi
    if [ -f ~/neopro-update/release.json ]; then
        sudo cp ~/neopro-update/release.json ${RASPBERRY_DIR}/release.json
        sudo chown pi:pi ${RASPBERRY_DIR}/release.json
        sudo chmod 644 ${RASPBERRY_DIR}/release.json
    fi

    # S'assurer que le WiFi client (wlan1) conserve sa configuration et redémarre
    if ip link show wlan1 >/dev/null 2>&1 && [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
        sudo ln -sf /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
        sudo systemctl enable wpa_supplicant@wlan1.service >/dev/null 2>&1 || true
        sudo systemctl restart wpa_supplicant@wlan1.service >/dev/null 2>&1 || true
        sudo dhcpcd wlan1 >/dev/null 2>&1 || true
        echo 'Service WiFi client (wlan1) vérifié'
    fi

    # Installation des scripts runtime (compress/video, wifi, backup, etc.)
    if [ -d ~/neopro-update/scripts ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/scripts
        sudo cp -r ~/neopro-update/scripts/* ${RASPBERRY_DIR}/scripts/
        sudo chown -R pi:pi ${RASPBERRY_DIR}/scripts
        sudo chmod +x ${RASPBERRY_DIR}/scripts/*.sh 2>/dev/null || true
        echo 'Scripts runtime installés'
    fi

    # Permissions correctes pour nginx et sync-agent
    echo 'Configuration des permissions...'
    sudo chmod 755 /home/pi
    sudo chmod 755 ${RASPBERRY_DIR}
    # webapp appartient à pi (pour sync-agent) mais accessible par www-data (nginx)
    sudo chown -R pi:pi ${RASPBERRY_DIR}/webapp/
    sudo find ${RASPBERRY_DIR}/webapp -type f -exec chmod 644 {} \;
    sudo find ${RASPBERRY_DIR}/webapp -type d -exec chmod 755 {} \;
    # Ajouter www-data au groupe pi pour lecture (nginx)
    sudo usermod -a -G pi www-data 2>/dev/null || true
    sudo chown -R pi:pi ${RASPBERRY_DIR}/server
    sudo chown -R pi:pi ${RASPBERRY_DIR}/admin
    sudo chown -R pi:pi ${RASPBERRY_DIR}/sync-agent
    sudo chown -R pi:pi ${RASPBERRY_DIR}/scripts 2>/dev/null || true
    sudo chown -R pi:pi ${RASPBERRY_DIR}/videos
    sudo chown -R pi:pi ${RASPBERRY_DIR}/logs
    echo 'Permissions configurées'

    # Nettoyage
    rm -rf ~/neopro-update ~/neopro-deploy.tar.gz

    # Mise à jour de l'unité systemd neopro-admin si fournie
    if [ -f /tmp/neopro-admin.service ]; then
        echo 'Mise à jour de /etc/systemd/system/neopro-admin.service'
        sudo cp /tmp/neopro-admin.service /etc/systemd/system/neopro-admin.service
        sudo chown root:root /etc/systemd/system/neopro-admin.service
        sudo chmod 644 /etc/systemd/system/neopro-admin.service
        sudo rm /tmp/neopro-admin.service
        sudo systemctl daemon-reload
    fi
"
print_success "Installation terminée"

# Redémarrage des services
print_step "Redémarrage des services..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    # Arrêter proprement neopro-app
    sudo systemctl stop neopro-app 2>/dev/null || true

    # Libérer le port 3000 si un processus zombie l'occupe encore
    if sudo fuser 3000/tcp >/dev/null 2>&1; then
        echo 'Port 3000 occupé, libération en cours...'
        sudo fuser -k 3000/tcp 2>/dev/null || true
        sleep 1
    fi

    # Redémarrer tous les services en parallèle
    sudo systemctl start neopro-app &
    sudo systemctl restart nginx &

    # Redémarrer admin panel si installé
    if systemctl list-unit-files neopro-admin.service >/dev/null 2>&1; then
        sudo systemctl restart neopro-admin &
    fi

    # Redémarrer sync-agent si installé
    if systemctl list-unit-files neopro-sync-agent.service >/dev/null 2>&1; then
        sudo systemctl restart neopro-sync-agent &
    fi

    # Attendre que tous les services redémarrent
    wait
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

    # Vérifier admin panel si installé
    if systemctl list-unit-files neopro-admin.service >/dev/null 2>&1; then
        if systemctl is-active --quiet neopro-admin; then
            echo '✓ Service neopro-admin: OK'
        else
            echo '⚠ Service neopro-admin: NON ACTIF'
        fi
    fi

    # Vérifier sync-agent si installé
    if systemctl list-unit-files neopro-sync-agent.service >/dev/null 2>&1; then
        if systemctl is-active --quiet neopro-sync-agent; then
            echo '✓ Service neopro-sync-agent: OK'
        else
            echo '⚠ Service neopro-sync-agent: NON ACTIF (peut être normal si non configuré)'
        fi
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
echo "  • Version: ${PACKAGE_VERSION}"
echo "  • Mode TV: http://${RASPBERRY_IP}/tv"
echo "  • Remote: http://${RASPBERRY_IP}/remote"
echo ""
echo -e "${YELLOW}Commandes utiles:${NC}"
echo "  • Voir les logs: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo journalctl -u neopro-app -f'"
echo "  • Redémarrer: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo systemctl restart neopro-app'"
echo "  • Status: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} 'sudo systemctl status neopro-app'"
echo ""
echo -e "${GREEN}Déploiement terminé!${NC}"
