#!/bin/bash

################################################################################
# Script de configuration REMOTE d'un nouveau club Neopro
#
# Ce script configure un club SANS dépendance au dossier Neopro local :
# 1. Collecte les informations du club
# 2. Crée la configuration JSON
# 3. Télécharge l'archive de déploiement depuis GitHub Releases
# 4. Déploie sur le Raspberry Pi via SSH
# 5. Configure le sync-agent pour le serveur central
#
# Prérequis :
# - Le Pi doit déjà être installé avec setup.sh
# - Connexion SSH au Pi (pi@neopro.local)
# - Accès Internet pour télécharger depuis GitHub
#
# Usage: ./setup-remote-club.sh [--release VERSION]
################################################################################

set -e

# Configuration
GITHUB_REPO="Tallec7/neopro"
DEFAULT_RELEASE="latest"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     CONFIGURATION REMOTE NOUVEAU CLUB NEOPRO                   ║"
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

################################################################################
# Fonction utilitaire : Gestion des clés SSH
################################################################################

check_ssh_connection() {
    local SSH_HOST="$1"

    # Tenter la connexion et capturer le résultat
    local SSH_OUTPUT
    SSH_OUTPUT=$(ssh -o ConnectTimeout=10 -o BatchMode=yes pi@"${SSH_HOST}" exit 2>&1) || local SSH_RESULT=$?

    # Vérifier si c'est une erreur de clé SSH
    if echo "${SSH_OUTPUT}" | grep -q "REMOTE HOST IDENTIFICATION HAS CHANGED\|Host key verification failed"; then
        print_warning "La clé SSH du Raspberry Pi a changé (nouveau boîtier ou réinstallation)"
        echo ""
        read -p "Voulez-vous réinitialiser la clé SSH pour ${SSH_HOST} ? (O/n) : " RESET_KEY
        RESET_KEY=${RESET_KEY:-O}

        if [[ $RESET_KEY =~ ^[Oo]$ ]]; then
            print_step "Suppression de l'ancienne clé SSH..."
            ssh-keygen -R "${SSH_HOST}" 2>/dev/null || true
            # Supprimer aussi l'IP si on utilise un hostname
            if [[ "${SSH_HOST}" == *".local"* ]] || [[ "${SSH_HOST}" == *".home"* ]]; then
                local RESOLVED_IP
                RESOLVED_IP=$(getent hosts "${SSH_HOST}" 2>/dev/null | awk '{print $1}' || true)
                if [ -n "${RESOLVED_IP}" ]; then
                    ssh-keygen -R "${RESOLVED_IP}" 2>/dev/null || true
                fi
            fi
            print_success "Clé SSH réinitialisée"
            return 0
        else
            print_error "Connexion annulée"
            return 1
        fi
    elif [ -n "${SSH_RESULT}" ] && [ "${SSH_RESULT}" -ne 0 ]; then
        return 0
    fi

    return 0
}

# Variables globales
WIFI_CONFIGURED=false
RELEASE_VERSION=""
RESOLVED_RELEASE_VERSION=""
CONFIG_JSON=""

################################################################################
# Étape 1 : Collecte des informations
################################################################################

collect_club_info() {
    print_header
    print_step "Collecte des informations du club"
    echo ""

    # Nom du club (identifiant unique)
    read -p "Nom du club (ex: CESSON, RENNES) : " CLUB_NAME
    CLUB_NAME=$(echo "$CLUB_NAME" | tr '[:lower:]' '[:upper:]' | tr -d ' ')

    if [ -z "$CLUB_NAME" ]; then
        print_error "Le nom du club est obligatoire"
        exit 1
    fi

    # Informations générales
    read -p "Nom complet du club (ex: CESSON Handball) : " CLUB_FULL_NAME
    read -p "Nom du site (ex: Complexe Sportif CESSON) : " SITE_NAME

    # Localisation
    read -p "Ville : " CITY
    read -p "Région (défaut: Bretagne) : " REGION
    REGION=${REGION:-Bretagne}
    read -p "Pays (défaut: France) : " COUNTRY
    COUNTRY=${COUNTRY:-France}

    # Sports (handball par défaut)
    read -p "Sports (séparés par des virgules, défaut: handball) : " SPORTS
    SPORTS=${SPORTS:-handball}

    # Contact
    read -p "Email de contact : " CONTACT_EMAIL
    read -p "Téléphone (optionnel) : " CONTACT_PHONE

    # Mot de passe
    echo ""
    print_warning "Configuration du mot de passe d'authentification"
    print_info "Le mot de passe doit contenir au moins 12 caractères"
    print_info "Mélange recommandé : majuscules, minuscules, chiffres, symboles"
    echo ""

    while true; do
        read -s -p "Mot de passe : " PASSWORD
        echo ""

        # Vérifier la longueur
        if [ ${#PASSWORD} -lt 12 ]; then
            print_error "Le mot de passe doit contenir au moins 12 caractères"
            continue
        fi

        read -s -p "Confirmer le mot de passe : " PASSWORD_CONFIRM
        echo ""

        if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
            print_error "Les mots de passe ne correspondent pas"
            continue
        fi

        break
    done

    print_success "Informations collectées"

    # Résumé
    echo ""
    print_step "Résumé de la configuration"
    echo ""
    echo "Nom du club      : $CLUB_NAME"
    echo "Nom complet      : $CLUB_FULL_NAME"
    echo "Nom du site      : $SITE_NAME"
    echo "Ville            : $CITY"
    echo "Région           : $REGION"
    echo "Pays             : $COUNTRY"
    echo "Sports           : $SPORTS"
    echo "Email            : $CONTACT_EMAIL"
    [ -n "$CONTACT_PHONE" ] && echo "Téléphone        : $CONTACT_PHONE"
    echo "Mot de passe     : ${PASSWORD:0:3}***********"
    echo ""

    read -p "Confirmer la création de cette configuration ? (o/N) : " CONFIRM
    if [[ ! $CONFIRM =~ ^[Oo]$ ]]; then
        print_error "Configuration annulée"
        exit 1
    fi
}

################################################################################
# Étape 2 : Création de la configuration JSON (en mémoire, pas de fichier local)
################################################################################

create_configuration_json() {
    print_step "Création de la configuration JSON"

    # Créer le JSON directement en mémoire (sans dépendance au template local)
    # Échapper les guillemets et backslashes pour JSON
    CLUB_NAME_ESC=$(echo "$CLUB_NAME" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CLUB_FULL_NAME_ESC=$(echo "$CLUB_FULL_NAME" | sed 's/\\/\\\\/g; s/"/\\"/g')
    SITE_NAME_ESC=$(echo "$SITE_NAME" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CITY_ESC=$(echo "$CITY" | sed 's/\\/\\\\/g; s/"/\\"/g')
    REGION_ESC=$(echo "$REGION" | sed 's/\\/\\\\/g; s/"/\\"/g')
    COUNTRY_ESC=$(echo "$COUNTRY" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CONTACT_EMAIL_ESC=$(echo "$CONTACT_EMAIL" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CONTACT_PHONE_ESC=$(echo "$CONTACT_PHONE" | sed 's/\\/\\\\/g; s/"/\\"/g')
    PASSWORD_ESC=$(echo "$PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g')
    CONFIG_VERSION_VALUE=${RESOLVED_RELEASE_VERSION:-$RELEASE_VERSION}
    if [ -z "$CONFIG_VERSION_VALUE" ]; then
        CONFIG_VERSION_VALUE="unknown"
    fi
    CONFIG_VERSION_ESC=$(echo "$CONFIG_VERSION_VALUE" | sed 's/\\/\\\\/g; s/"/\\"/g')

    # Convertir les sports en tableau JSON
    SPORTS_JSON=$(echo "$SPORTS" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')

    # Générer le JSON complet
    CONFIG_JSON=$(cat <<EOF
{
  "club": {
    "name": "${CLUB_NAME_ESC}",
    "fullName": "${CLUB_FULL_NAME_ESC}",
    "siteName": "${SITE_NAME_ESC}",
    "location": {
      "city": "${CITY_ESC}",
      "region": "${REGION_ESC}",
      "country": "${COUNTRY_ESC}"
    },
    "sports": ${SPORTS_JSON},
    "contact": {
      "email": "${CONTACT_EMAIL_ESC}",
      "phone": "${CONTACT_PHONE_ESC}"
    }
  },
  "authentication": {
    "enabled": true,
    "password": "${PASSWORD_ESC}"
  },
  "sync": {
    "enabled": false,
    "serverUrl": "https://neopro-central-production.up.railway.app",
    "apiKey": ""
  },
  "version": "${CONFIG_VERSION_ESC}",
  "features": {
    "displayMode": "auto",
    "autoStart": true,
    "loop": true,
    "shuffle": false
  },
  "videos": []
}
EOF
    )

    print_success "Configuration JSON créée en mémoire"
    print_info "Version logicielle référencée : ${CONFIG_VERSION_VALUE}"
}

################################################################################
# Étape 3 : Téléchargement de l'archive depuis GitHub Releases
################################################################################

download_deployment_archive() {
    print_step "Téléchargement de l'archive de déploiement depuis GitHub"

    # Créer un dossier temporaire
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf ${TEMP_DIR}" EXIT

    # Déterminer la version à télécharger
    if [ -z "$RELEASE_VERSION" ]; then
        RELEASE_VERSION="$DEFAULT_RELEASE"
    fi

    print_info "Version : $RELEASE_VERSION"

    # Construire l'URL de téléchargement
    if [ "$RELEASE_VERSION" = "latest" ]; then
        DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/neopro-raspberry-deploy.tar.gz"
    else
        DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_VERSION}/neopro-raspberry-deploy.tar.gz"
    fi

    print_info "Téléchargement depuis : $DOWNLOAD_URL"

    # Télécharger l'archive
    if curl -L -f -o "${TEMP_DIR}/neopro-raspberry-deploy.tar.gz" "$DOWNLOAD_URL"; then
        print_success "Archive téléchargée"
        ARCHIVE_PATH="${TEMP_DIR}/neopro-raspberry-deploy.tar.gz"
    else
        print_error "Échec du téléchargement"
        print_info "Vérifiez que la release existe : https://github.com/${GITHUB_REPO}/releases"
        exit 1
    fi

    # Vérifier la taille de l'archive
    ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
    print_info "Taille de l'archive : $ARCHIVE_SIZE"

    # Détecter la version réelle depuis l'archive
    local archive_version
    archive_version=$(tar -xOf "$ARCHIVE_PATH" deploy/VERSION 2>/dev/null | tr -d '\r' || true)
    if [ -n "$archive_version" ]; then
        RESOLVED_RELEASE_VERSION=$(printf '%s' "$archive_version" | head -n1 | tr -d '[:space:]')
        if [ -z "$RESOLVED_RELEASE_VERSION" ]; then
            RESOLVED_RELEASE_VERSION="${RELEASE_VERSION:-unknown}"
        fi
        print_success "Version détectée dans l'archive : $RESOLVED_RELEASE_VERSION"
    else
        RESOLVED_RELEASE_VERSION="${RELEASE_VERSION:-unknown}"
        print_warning "Impossible de détecter la version depuis l'archive (valeur utilisée : ${RESOLVED_RELEASE_VERSION})"
    fi
}

################################################################################
# Étape 4 : Adresse du Raspberry Pi
################################################################################

get_pi_address() {
    print_step "Configuration de la connexion au Raspberry Pi"
    echo ""

    # Demander l'adresse du Pi
    read -p "Adresse du Raspberry Pi (défaut: neopro.local) : " PI_ADDRESS
    PI_ADDRESS=${PI_ADDRESS:-neopro.local}

    # Tester la connexion
    print_info "Test de connexion vers $PI_ADDRESS..."

    # Vérifier/réinitialiser la clé SSH si nécessaire
    if ! check_ssh_connection "$PI_ADDRESS"; then
        print_error "Impossible de se connecter au Raspberry Pi"
        exit 1
    fi

    # Test de ping
    if ping -c 1 -W 5 "$PI_ADDRESS" >/dev/null 2>&1; then
        print_success "Raspberry Pi accessible"
    else
        print_warning "Ping échoué, mais on continue (le Pi peut bloquer ICMP)"
    fi

    # Vérifier que Neopro est installé sur le Pi
    print_info "Vérification de l'installation Neopro..."
    if ssh -o StrictHostKeyChecking=accept-new pi@"$PI_ADDRESS" "[ -d /home/pi/neopro ]"; then
        print_success "Installation Neopro détectée"
    else
        print_error "Neopro n'est pas installé sur ce Pi"
        print_info "Installez d'abord Neopro avec :"
        print_info "  curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s ${CLUB_NAME} PASSWORD"
        exit 1
    fi
}

################################################################################
# Étape 5 : Déploiement sur le Raspberry Pi
################################################################################

deploy_to_pi() {
    print_step "Déploiement sur le Raspberry Pi"
    local version_label="${RESOLVED_RELEASE_VERSION:-$RELEASE_VERSION}"
    if [ -z "$version_label" ]; then
        version_label="unknown"
    fi
    print_info "Version déployée : $version_label"

    print_info "Upload de l'archive (peut prendre quelques minutes)..."
    if scp -o StrictHostKeyChecking=accept-new "$ARCHIVE_PATH" pi@"$PI_ADDRESS":~/neopro-raspberry-deploy.tar.gz; then
        print_success "Archive uploadée"
    else
        print_error "Échec de l'upload"
        exit 1
    fi

    print_info "Extraction et installation sur le Pi..."
    ssh pi@"$PI_ADDRESS" bash <<'REMOTE_SCRIPT'
set -e

RASPBERRY_DIR="/home/pi/neopro"

# Créer une sauvegarde de la configuration et des vidéos existantes
if [ -f ${RASPBERRY_DIR}/webapp/configuration.json ]; then
    cp ${RASPBERRY_DIR}/webapp/configuration.json /tmp/configuration.json.backup
fi
if [ -d ${RASPBERRY_DIR}/videos ]; then
    mv ${RASPBERRY_DIR}/videos /tmp/videos.backup
fi

# Extraire l'archive dans un dossier temporaire
cd ~
rm -rf ~/neopro-update
mkdir -p ~/neopro-update
tar -xzf neopro-raspberry-deploy.tar.gz -C ~/neopro-update

# Déterminer le format de l'archive (nouveau: webapp/, ancien: deploy/webapp/)
if [ -d ~/neopro-update/webapp ]; then
    SOURCE_DIR=~/neopro-update
elif [ -d ~/neopro-update/deploy/webapp ]; then
    SOURCE_DIR=~/neopro-update/deploy
else
    echo 'Erreur: Structure du package invalide'
    exit 1
fi

# Déployer les composants
sudo cp -r ${SOURCE_DIR}/webapp/* ${RASPBERRY_DIR}/webapp/
sudo cp -r ${SOURCE_DIR}/server/* ${RASPBERRY_DIR}/server/
if [ -d ${SOURCE_DIR}/sync-agent ]; then
    sudo cp -r ${SOURCE_DIR}/sync-agent/* ${RASPBERRY_DIR}/sync-agent/
fi
if [ -d ${SOURCE_DIR}/admin ]; then
    sudo cp -r ${SOURCE_DIR}/admin/* ${RASPBERRY_DIR}/admin/
fi

# Enregistrer la version et les métadonnées de build
if [ -f ${SOURCE_DIR}/VERSION ]; then
    sudo cp ${SOURCE_DIR}/VERSION ${RASPBERRY_DIR}/VERSION
    sudo chown pi:pi ${RASPBERRY_DIR}/VERSION
    sudo chmod 644 ${RASPBERRY_DIR}/VERSION
fi
if [ -f ${SOURCE_DIR}/release.json ]; then
    sudo cp ${SOURCE_DIR}/release.json ${RASPBERRY_DIR}/release.json
    sudo chown pi:pi ${RASPBERRY_DIR}/release.json
    sudo chmod 644 ${RASPBERRY_DIR}/release.json
fi

# Nettoyage
rm -rf ~/neopro-update

# S'assurer que le WiFi client (wlan1) conserve sa configuration
if ip link show wlan1 >/dev/null 2>&1 && [ -f /etc/wpa_supplicant/wpa_supplicant.conf ]; then
    sudo ln -sf /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
    sudo systemctl enable wpa_supplicant@wlan1.service >/dev/null 2>&1 || true
    sudo systemctl restart wpa_supplicant@wlan1.service >/dev/null 2>&1 || true
    sudo dhcpcd wlan1 >/dev/null 2>&1 || true
fi

# Restaurer la configuration et les vidéos si elles existaient
if [ -f /tmp/configuration.json.backup ]; then
    sudo cp /tmp/configuration.json.backup ${RASPBERRY_DIR}/webapp/configuration.json
    rm /tmp/configuration.json.backup
fi
if [ -d /tmp/videos.backup ]; then
    sudo mv /tmp/videos.backup ${RASPBERRY_DIR}/videos
fi

# Installer les dépendances npm
cd ${RASPBERRY_DIR}/server
sudo npm install --omit=dev

cd ${RASPBERRY_DIR}/sync-agent
sudo npm install --omit=dev

# Fixer les permissions
sudo chown -R pi:pi ${RASPBERRY_DIR}
sudo chmod -R 755 ${RASPBERRY_DIR}

# Nettoyer
cd ~
rm -rf deploy neopro-raspberry-deploy.tar.gz
REMOTE_SCRIPT

    if [ $? -eq 0 ]; then
        print_success "Déploiement terminé"
    else
        print_error "Échec du déploiement"
        exit 1
    fi

    # Copier la configuration JSON créée
    print_info "Installation de la configuration du club..."
    echo "$CONFIG_JSON" | ssh pi@"$PI_ADDRESS" "sudo tee /home/pi/neopro/webapp/configuration.json > /dev/null"
    print_success "Configuration installée"

    # Fix permissions pour nginx (www-data doit pouvoir accéder à /home/pi)
    print_info "Configuration des permissions pour nginx..."
    ssh pi@"$PI_ADDRESS" "
        sudo chmod 755 /home/pi
        sudo chmod 755 /home/pi/neopro
        sudo chmod -R 755 /home/pi/neopro/webapp
        sudo chown -R pi:www-data /home/pi/neopro/webapp
    "
    print_success "Permissions configurées"

    # Redémarrer les services
    print_info "Redémarrage des services..."
    ssh pi@"$PI_ADDRESS" "
        sudo systemctl restart neopro-app
        sudo systemctl restart nginx
        sudo systemctl restart neopro-admin 2>/dev/null || true
    "
    sleep 2

    # Vérifier les services
    if ssh pi@"$PI_ADDRESS" "systemctl is-active neopro-app >/dev/null 2>&1"; then
        print_success "Services redémarrés avec succès"
    else
        print_warning "Le service neopro-app n'est pas actif"
        print_info "Vérifiez les logs : ssh pi@$PI_ADDRESS 'sudo journalctl -u neopro-app -n 50'"
    fi
}

################################################################################
# Étape 6 : Configuration du hotspot WiFi
################################################################################

configure_wifi_hotspot() {
    print_step "Configuration du hotspot WiFi"

    # Vérifier si hostapd est installé
    if ssh -o ConnectTimeout=10 pi@"$PI_ADDRESS" "systemctl is-active hostapd >/dev/null 2>&1"; then
        print_info "Mise à jour du SSID WiFi vers NEOPRO-$CLUB_NAME..."

        # Demander le mot de passe WiFi
        echo ""
        read -p "Mot de passe WiFi (8-63 caractères, défaut: celui d'auth) : " WIFI_PASSWORD
        WIFI_PASSWORD=${WIFI_PASSWORD:-$PASSWORD}

        if [ ${#WIFI_PASSWORD} -lt 8 ]; then
            print_error "Le mot de passe WiFi doit faire au moins 8 caractères"
            WIFI_CONFIGURED=false
            return
        fi

        # Échapper les caractères spéciaux
        WIFI_PASSWORD_ESC=$(printf '%s' "$WIFI_PASSWORD" | sed "s/'/'\\\\''/g")

        if ssh pi@"$PI_ADDRESS" "
            sudo sed -i 's/^ssid=.*/ssid=NEOPRO-$CLUB_NAME/' /etc/hostapd/hostapd.conf
            sudo sed -i 's/^wpa_passphrase=.*/wpa_passphrase=${WIFI_PASSWORD_ESC}/' /etc/hostapd/hostapd.conf
            sudo systemctl restart hostapd
        "; then
            print_success "Hotspot WiFi configuré : NEOPRO-$CLUB_NAME"
            WIFI_CONFIGURED=true
        else
            print_warning "Échec de la configuration du hotspot"
            WIFI_CONFIGURED=false
        fi
    else
        print_warning "hostapd n'est pas actif sur ce Pi"
        print_info "Le hotspot WiFi NEOPRO-$CLUB_NAME ne sera pas disponible"
        WIFI_CONFIGURED=false
    fi
}

################################################################################
# Étape 7 : Configuration du sync-agent
################################################################################

setup_sync_agent() {
    print_step "Configuration du sync-agent (connexion au serveur central)"

    echo ""
    read -p "Voulez-vous configurer la connexion au serveur central maintenant ? (o/N) : " SETUP_SYNC

    if [[ ! $SETUP_SYNC =~ ^[Oo]$ ]]; then
        print_warning "Configuration du sync-agent ignorée"
        print_info "Pour le configurer plus tard, exécutez sur le Pi :"
        print_info "  ssh pi@$PI_ADDRESS"
        print_info "  cd /home/pi/neopro/sync-agent"
        print_info "  sudo npm run register"
        print_info "  sudo systemctl restart neopro-sync-agent"
        return
    fi

    # Demander les credentials admin
    echo ""
    print_info "Credentials du dashboard central (pour l'enregistrement du site)"
    read -p "Email admin : " ADMIN_EMAIL
    read -s -p "Mot de passe admin : " ADMIN_PASSWORD
    echo ""

    if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
        print_error "Email et mot de passe requis"
        return
    fi

    print_info "Enregistrement du site sur le serveur central..."

    # Échapper les caractères spéciaux pour le shell
    ESCAPED_ADMIN_PASSWORD=$(printf '%s' "$ADMIN_PASSWORD" | sed "s/'/'\\\\''/g")
    ESCAPED_SITE_NAME=$(printf '%s' "$SITE_NAME" | sed "s/'/'\\\\''/g")
    ESCAPED_CLUB_NAME=$(printf '%s' "$CLUB_FULL_NAME" | sed "s/'/'\\\\''/g")

    # Exécuter register-site.js avec toutes les variables d'environnement
    ssh pi@"$PI_ADDRESS" "
        cd /home/pi/neopro/sync-agent
        export CENTRAL_SERVER_URL='https://neopro-central-production.up.railway.app'
        export ADMIN_EMAIL='${ADMIN_EMAIL}'
        export ADMIN_PASSWORD='${ESCAPED_ADMIN_PASSWORD}'
        export SITE_NAME='${ESCAPED_SITE_NAME}'
        export CLUB_NAME='${ESCAPED_CLUB_NAME}'
        export LOCATION_CITY='${CITY}'
        export LOCATION_REGION='${REGION}'
        export LOCATION_COUNTRY='${COUNTRY}'
        export SPORTS='${SPORTS}'

        sudo -E node scripts/register-site.js
    "

    # Installer le service systemd
    print_info "Installation du service systemd..."
    ssh pi@"$PI_ADDRESS" "cd /home/pi/neopro/sync-agent && sudo npm run install-service"

    # Vérifier le service
    print_info "Vérification du service..."
    sleep 2
    ssh pi@"$PI_ADDRESS" "sudo systemctl status neopro-sync-agent --no-pager" || true

    if [ $? -eq 0 ]; then
        print_success "Sync-agent configuré avec succès"
    else
        print_error "Échec de la configuration du sync-agent"
        print_info "Pour réessayer manuellement :"
        print_info "  ssh pi@$PI_ADDRESS"
        print_info "  cd /home/pi/neopro/sync-agent"
        print_info "  sudo npm run register"
        print_info "  sudo systemctl restart neopro-sync-agent"
    fi
}

################################################################################
# Étape 8 : Résumé final
################################################################################

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║           CONFIGURATION TERMINÉE AVEC SUCCÈS                   ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Informations du club :${NC}"
    echo "  • Nom du club : $CLUB_NAME"
    echo "  • Site : $SITE_NAME"
    echo "  • Localisation : $CITY, $REGION, $COUNTRY"
    echo ""
    echo -e "${BLUE}Configuration :${NC}"
    echo "  • Mot de passe : ${PASSWORD:0:3}***********"
    if [ -n "$RESOLVED_RELEASE_VERSION" ]; then
        echo "  • Version logicielle : ${RESOLVED_RELEASE_VERSION}"
    elif [ -n "$RELEASE_VERSION" ]; then
        echo "  • Version logicielle : ${RELEASE_VERSION}"
    fi
    echo ""
    echo -e "${BLUE}Accès au boîtier :${NC}"
    if [ "$WIFI_CONFIGURED" = true ]; then
        echo "  • WiFi : NEOPRO-$CLUB_NAME"
    fi
    echo "  • URL : http://$PI_ADDRESS"
    echo "  • Login : http://$PI_ADDRESS/login"
    echo "  • TV : http://$PI_ADDRESS/tv"
    echo "  • Remote : http://$PI_ADDRESS/remote"
    echo "  • Admin : http://$PI_ADDRESS:8080"
    if [ "$WIFI_CONFIGURED" != true ]; then
        echo ""
        echo -e "${YELLOW}Note :${NC} Le hotspot WiFi n'est pas actif sur ce Pi."
        echo "  Accédez au boîtier via l'adresse $PI_ADDRESS sur votre réseau."
    fi
    echo ""
    echo -e "${BLUE}Serveur central :${NC}"
    echo "  • Dashboard : https://neopro-central-production.up.railway.app"
    echo "  • Le site devrait apparaître dans la liste des sites"
    echo ""
    echo -e "${YELLOW}Prochaines étapes :${NC}"
    echo "  1. Tester la connexion : http://neopro.local/login"
    echo "  2. Vérifier sur le dashboard central que le site est en ligne"
    echo "  3. Déployer les vidéos depuis le dashboard central"
    echo ""
    echo -e "${BLUE}Commandes utiles :${NC}"
    echo "  • Voir les logs app : ssh pi@$PI_ADDRESS 'sudo journalctl -u neopro-app -f'"
    echo "  • Voir les logs sync : ssh pi@$PI_ADDRESS 'sudo journalctl -u neopro-sync-agent -f'"
    echo "  • Diagnostic sync : ssh pi@$PI_ADDRESS 'cd /home/pi/neopro/sync-agent && npm run diagnose'"
    echo "  • Redémarrer : ssh pi@$PI_ADDRESS 'sudo reboot'"
    echo ""
}

################################################################################
# Fonction principale
################################################################################

main() {
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --release)
                RELEASE_VERSION="$2"
                shift 2
                ;;
            *)
                print_error "Argument inconnu : $1"
                echo "Usage: $0 [--release VERSION]"
                exit 1
                ;;
        esac
    done

    # Collecter les informations
    collect_club_info

    # Télécharger l'archive depuis GitHub
    download_deployment_archive

    # Créer la configuration JSON (en mémoire)
    create_configuration_json

    # Demander l'adresse du Pi
    get_pi_address

    # Déployer sur le Pi
    deploy_to_pi

    # Configuration WiFi hotspot
    configure_wifi_hotspot

    # Sync-agent
    setup_sync_agent

    # Résumé
    print_summary

    print_success "Configuration terminée !"
}

# Lancement
main "$@"
