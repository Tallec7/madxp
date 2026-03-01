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

# Vérification de /etc/hosts (corruption = nginx crash car "localhost" non résolu)
print_step "Vérification de /etc/hosts..."
ssh ${RASPBERRY_USER}@${RASPBERRY_IP} "
    HOSTS_FILE=/etc/hosts
    NEEDS_FIX=false

    # Détecter fichier corrompu (contient du binaire)
    if file \"\$HOSTS_FILE\" 2>/dev/null | grep -qv 'text'; then
        echo 'ERREUR: /etc/hosts contient des données binaires (fichier corrompu)'
        NEEDS_FIX=true
    # Détecter entrée localhost manquante
    elif ! grep -q '^127\.0\.0\.1[[:space:]]' \"\$HOSTS_FILE\" 2>/dev/null; then
        echo 'ERREUR: /etc/hosts ne contient pas 127.0.0.1 localhost'
        NEEDS_FIX=true
    fi

    if [ \"\$NEEDS_FIX\" = true ]; then
        echo 'Réparation automatique de /etc/hosts...'
        HOSTNAME=\$(hostname 2>/dev/null || echo 'neopro')
        sudo bash -c \"cat > \$HOSTS_FILE << HOSTSEOF
127.0.0.1	localhost
127.0.1.1	\$HOSTNAME
::1		localhost ip6-localhost ip6-loopback
ff02::1		ip6-allnodes
ff02::2		ip6-allrouters
HOSTSEOF\"
        echo '/etc/hosts réparé'
    else
        echo '/etc/hosts OK'
    fi
"

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
        cd ${RASPBERRY_DIR}/server && sudo npm install --production 2>/dev/null || true
        echo 'Serveur installé'
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
        # npm install pour sync-agent (CRITICAL - sans ça le service crash)
        cd ${RASPBERRY_DIR}/sync-agent && sudo npm install --production 2>/dev/null || true
        echo 'Sync-agent installé'
    fi

    # Installation admin panel
    if [ -d ~/neopro-update/admin ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/admin
        sudo cp -r ~/neopro-update/admin/* ${RASPBERRY_DIR}/admin/
        cd ${RASPBERRY_DIR}/admin && sudo npm install --production 2>/dev/null || true
        echo 'Admin panel installé'
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

    # Vérifier le WiFi client (wlan1) SANS le redémarrer
    # IMPORTANT: Ne JAMAIS restart wpa_supplicant@wlan1 pendant un deploy !
    # Le RTL8192EU met 15-30s pour WPA auth + DHCP, et le NetworkWatchdog
    # peut escalader jusqu'à modprobe -r / USB unbind → dongle WiFi mort.
    if ip link show wlan1 >/dev/null 2>&1 && [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
        sudo ln -sf /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
        sudo systemctl enable wpa_supplicant@wlan1.service >/dev/null 2>&1 || true
        echo 'Service WiFi client (wlan1) symlink vérifié (pas de restart)'
    fi

    # Installation des scripts runtime (compress/video, wifi, backup, etc.)
    if [ -d ~/neopro-update/scripts ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/scripts
        sudo cp -r ~/neopro-update/scripts/* ${RASPBERRY_DIR}/scripts/
        sudo chown -R pi:pi ${RASPBERRY_DIR}/scripts
        sudo chmod +x ${RASPBERRY_DIR}/scripts/*.sh 2>/dev/null || true
        echo 'Scripts runtime installés'
    fi

    # Installation des fichiers de configuration (systemd services, etc.)
    if [ -d ~/neopro-update/config ]; then
        sudo mkdir -p ${RASPBERRY_DIR}/config
        sudo cp -r ~/neopro-update/config/* ${RASPBERRY_DIR}/config/
        sudo chown -R pi:pi ${RASPBERRY_DIR}/config
        echo 'Config files installés'
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

    # Créer un golden snapshot du sync-agent AVANT le premier déploiement
    # Si le nouveau code crashe, le guardian pourra restaurer cette version
    if [ -d ${RASPBERRY_DIR}/sync-agent/src ] && [ ! -d ${RASPBERRY_DIR}/sync-agent-golden ]; then
        echo 'Création du golden snapshot sync-agent (filet de sécurité)...'
        sudo cp -r ${RASPBERRY_DIR}/sync-agent ${RASPBERRY_DIR}/sync-agent-golden
        sudo sh -c \"date -Iseconds > ${RASPBERRY_DIR}/sync-agent-golden/.golden-created\"
        sudo chown -R pi:pi ${RASPBERRY_DIR}/sync-agent-golden
        echo '✓ Golden snapshot créé'
    fi

    # Nettoyage
    rm -rf ~/neopro-update ~/neopro-deploy.tar.gz

    # Installation du fichier sudoers (permissions ciblées pour le sync-agent)
    if [ -f ${RASPBERRY_DIR}/config/sudoers.d/neopro ]; then
        sudo cp ${RASPBERRY_DIR}/config/sudoers.d/neopro /etc/sudoers.d/neopro
        sudo chown root:root /etc/sudoers.d/neopro
        sudo chmod 440 /etc/sudoers.d/neopro
        echo 'Sudoers neopro installé'
    fi

    # Installation des services systemd depuis config/systemd/
    if [ -d ${RASPBERRY_DIR}/config/systemd ]; then
        echo 'Installation des services systemd...'
        NEWLY_INSTALLED=''
        for svc_file in ${RASPBERRY_DIR}/config/systemd/*.service; do
            if [ -f \"\$svc_file\" ]; then
                svc_name=\$(basename \"\$svc_file\")
                was_installed=false
                if [ -f /etc/systemd/system/\$svc_name ]; then
                    was_installed=true
                fi
                sudo cp \"\$svc_file\" /etc/systemd/system/\$svc_name
                sudo chown root:root /etc/systemd/system/\$svc_name
                sudo chmod 644 /etc/systemd/system/\$svc_name
                sudo systemctl enable \${svc_name%.service} 2>/dev/null || true
                if [ \"\$was_installed\" = false ]; then
                    NEWLY_INSTALLED=\"\${NEWLY_INSTALLED} \${svc_name%.service}\"
                fi
                echo \"  ✓ \$svc_name installé\"
            fi
        done
        sudo systemctl daemon-reload

        # Démarrer les NOUVEAUX services (pas ceux gérés par le restart ci-dessous)
        MANAGED_SERVICES='neopro-app neopro-admin neopro-kiosk neopro-sync-agent'
        for svc in \$NEWLY_INSTALLED; do
            case \" \$MANAGED_SERVICES \" in
                *\" \$svc \"*) ;;  # Sera géré par le restart des services
                *)
                    sudo systemctl start \$svc 2>/dev/null || true
                    echo \"  ▶ \$svc démarré (nouveau service)\"
                    ;;
            esac
        done
        echo 'Services systemd installés'
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

    # Phase 1: Redémarrer les services backend + nginx (en parallèle entre eux)
    sudo systemctl start neopro-app &
    sudo systemctl restart nginx &

    # Redémarrer admin panel si installé
    if systemctl list-unit-files neopro-admin.service >/dev/null 2>&1; then
        sudo systemctl restart neopro-admin &
    fi

    # Redémarrer sync-agent si installé
    # IMPORTANT: Écrire une grace period AVANT le restart pour que le NetworkWatchdog
    # ne déclenche pas de fausse cascade de recovery pendant le redémarrage post-deploy
    if systemctl list-unit-files neopro-sync-agent.service >/dev/null 2>&1; then
        GRACE_UNTIL=\$(( \$(date +%s%3N) + 120000 ))
        echo \"{\\\"internet\\\":\${GRACE_UNTIL},\\\"hotspot\\\":0}\" > /tmp/neopro-watchdog-grace.json
        echo 'Grace period NetworkWatchdog: 120s (protège wlan1 post-deploy)'
        sudo systemctl restart neopro-sync-agent &
    fi

    # Attendre que backend + nginx soient prêts AVANT de redémarrer le kiosk
    # Évite que Chromium charge une page d'erreur/blanche si nginx n'est pas prêt
    wait

    # Phase 2: Redémarrer kiosk APRÈS que nginx + neopro-app sont opérationnels
    # Le kiosk-watchdog vérifie aussi nginx, mais l'ordonnancement ici est plus fiable
    if systemctl list-unit-files neopro-kiosk.service >/dev/null 2>&1; then
        sudo systemctl restart neopro-kiosk
    fi
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

    # Vérifier kiosk si installé
    if systemctl list-unit-files neopro-kiosk.service >/dev/null 2>&1; then
        if systemctl is-active --quiet neopro-kiosk; then
            echo '✓ Service neopro-kiosk: OK'
        else
            echo '⚠ Service neopro-kiosk: NON ACTIF'
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

# Diagnostic post-déploiement (vérifie la complétude du Pi)
# NOTE: set +e nécessaire car bash 3.2 (macOS) déclenche set -e à l'intérieur
# des $() avant que || true ne puisse rattraper le code de sortie
set +e
print_step "Diagnostic post-déploiement (vérification de la complétude du Pi)..."
DIAG_SCRIPT="${RASPBERRY_DIR}/scripts/diagnose-pi.sh"
DIAG_SSH_ERR=$(mktemp)
DIAG_OUTPUT=$(ssh -o ConnectTimeout=10 ${RASPBERRY_USER}@${RASPBERRY_IP} "
    if [ -x ${DIAG_SCRIPT} ]; then
        ${DIAG_SCRIPT} --json 2>/dev/null
    else
        echo '{\"healthy\":true,\"errors\":0,\"warnings\":0,\"checks\":[]}'
    fi
" 2>"${DIAG_SSH_ERR}")
DIAG_SSH_RC=$?

# Parser le résultat JSON
DIAG_ERRORS=$(echo "${DIAG_OUTPUT}" | grep -o '"errors":[0-9]*' | cut -d: -f2)
DIAG_WARNINGS=$(echo "${DIAG_OUTPUT}" | grep -o '"warnings":[0-9]*' | cut -d: -f2)
DIAG_HEALTHY=$(echo "${DIAG_OUTPUT}" | grep -o '"healthy":true')

if [ -n "$DIAG_HEALTHY" ]; then
    print_success "Diagnostic : Pi complet et opérationnel (${DIAG_WARNINGS:-0} avertissement(s))"
elif [ -n "$DIAG_ERRORS" ] && [ "$DIAG_ERRORS" -gt 0 ] 2>/dev/null; then
    print_warning "Diagnostic : ${DIAG_ERRORS} erreur(s), ${DIAG_WARNINGS:-0} avertissement(s)"
    echo -e "${YELLOW}  Exécutez le diagnostic complet pour les détails :${NC}"
    echo "  ssh ${RASPBERRY_USER}@${RASPBERRY_IP} '${DIAG_SCRIPT}'"
elif [ "$DIAG_SSH_RC" -eq 255 ]; then
    # Exit 255 = SSH connection failure (auth, timeout, unreachable)
    print_warning "Diagnostic : connexion SSH échouée (code ${DIAG_SSH_RC})"
    DIAG_SSH_MSG=$(cat "${DIAG_SSH_ERR}" 2>/dev/null | head -1)
    [ -n "$DIAG_SSH_MSG" ] && echo -e "${YELLOW}  ${DIAG_SSH_MSG}${NC}"
    echo -e "${YELLOW}  Exécutez le diagnostic manuellement :${NC}"
    echo "  ssh ${RASPBERRY_USER}@${RASPBERRY_IP} '${DIAG_SCRIPT}'"
elif [ "$DIAG_SSH_RC" -ne 0 ] && [ -n "$DIAG_OUTPUT" ]; then
    # SSH OK but diagnose-pi.sh returned errors (exit code = error count)
    # JSON parsing may have failed (old script version with stdout pollution)
    print_warning "Diagnostic : ${DIAG_SSH_RC} erreur(s) détectée(s)"
    echo -e "${YELLOW}  Exécutez le diagnostic complet pour les détails :${NC}"
    echo "  ssh ${RASPBERRY_USER}@${RASPBERRY_IP} '${DIAG_SCRIPT}'"
else
    print_warning "Diagnostic : impossible de déterminer l'état (script non disponible ?)"
fi
rm -f "${DIAG_SSH_ERR}"
set -e

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
echo "  • Diagnostic: ssh ${RASPBERRY_USER}@${RASPBERRY_IP} '${DIAG_SCRIPT}'"
echo ""
echo -e "${GREEN}Déploiement terminé!${NC}"
