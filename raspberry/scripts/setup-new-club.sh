#!/bin/bash

################################################################################
# Script d'automatisation pour configurer un nouveau club Neopro
#
# Ce script :
# 1. Crée la configuration complète (auth + sync)
# 2. Build l'application
# 3. Déploie sur le Raspberry Pi
# 4. Configure le sync-agent pour le serveur central
#
# Usage: ./setup-new-club.sh
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     CONFIGURATION NOUVEAU CLUB NEOPRO                          ║"
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

# Vérifie la connexion SSH et réinitialise la clé si nécessaire
# Usage: check_ssh_connection "adresse"
check_ssh_connection() {
    local SSH_HOST="$1"

    # Tenter la connexion et capturer le résultat
    local SSH_OUTPUT
    SSH_OUTPUT=$(ssh -o ConnectTimeout=10 -o BatchMode=yes pi@"${SSH_HOST}" exit 2>&1) || local SSH_RESULT=$?

    # Vérifier si c'est une erreur de clé SSH (nouveau boîtier ou réinstallation)
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
        # Autre erreur - on laisse passer, sera géré par la commande SSH suivante
        return 0
    fi

    return 0
}

# Variables globales
WIFI_CONFIGURED=false

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

    # Vérifier si la config existe déjà
    CONFIG_FILE="raspberry/config/templates/${CLUB_NAME}-configuration.json"
    if [ -f "$CONFIG_FILE" ]; then
        print_warning "La configuration pour $CLUB_NAME existe déjà"
        read -p "Voulez-vous la remplacer ? (o/N) : " REPLACE
        if [[ ! $REPLACE =~ ^[Oo]$ ]]; then
            print_info "Utilisation de la configuration existante"
            USE_EXISTING=true
            return
        fi
    fi

    USE_EXISTING=false

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
# Étape 2 : Création de la configuration
################################################################################

create_configuration() {
    if [ "$USE_EXISTING" = true ]; then
        print_step "Utilisation de la configuration existante"
        return
    fi

    print_step "Création du fichier de configuration"

    # Copier le template
    cp raspberry/config/templates/TEMPLATE-configuration.json "$CONFIG_FILE"

    # Remplacer les placeholders
    # Note: utilisation de sed compatible macOS et Linux

    # Informations générales
    sed -i.bak "s/\[NOM_DU_CLUB\]/$CLUB_NAME/g" "$CONFIG_FILE"
    sed -i.bak "s/\[NOM_DU_SITE\]/$SITE_NAME/g" "$CONFIG_FILE"
    sed -i.bak "s/CHANGER_CE_MOT_DE_PASSE/$PASSWORD/g" "$CONFIG_FILE"

    # Localisation
    sed -i.bak "s/\[VILLE\]/$CITY/g" "$CONFIG_FILE"
    sed -i.bak "s/Bretagne/$REGION/g" "$CONFIG_FILE"
    sed -i.bak "s/France/$COUNTRY/g" "$CONFIG_FILE"

    # Sports (converti en array JSON)
    SPORTS_JSON=$(echo "$SPORTS" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')
    sed -i.bak "s/\[\"handball\"\]/$SPORTS_JSON/g" "$CONFIG_FILE"

    # Contact
    sed -i.bak "s/\[EMAIL\]/$CONTACT_EMAIL/g" "$CONFIG_FILE"
    if [ -n "$CONTACT_PHONE" ]; then
        sed -i.bak "s/\[TELEPHONE\]/$CONTACT_PHONE/g" "$CONFIG_FILE"
    else
        sed -i.bak "s/\[TELEPHONE\]//g" "$CONFIG_FILE"
    fi

    # Nettoyer les fichiers .bak
    rm -f "$CONFIG_FILE.bak"

    print_success "Configuration créée : $CONFIG_FILE"
}

################################################################################
# Étape 3 : Adresse du Raspberry Pi
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
}

################################################################################
# Étape 4 : Build et déploiement (réutilise build-and-deploy.sh)
################################################################################

build_and_deploy() {
    print_step "Build et déploiement de l'application"

    # Copier la configuration dans public/
    cp "$CONFIG_FILE" public/configuration.json
    print_success "Configuration copiée dans public/"

    # Utiliser le script build-and-deploy.sh existant
    print_info "Lancement du build et déploiement (cela peut prendre quelques minutes)..."
    print_warning "⚠️  Vous allez peut-être devoir entrer le mot de passe SSH du Raspberry Pi"
    echo ""

    if ./raspberry/scripts/build-and-deploy.sh "$PI_ADDRESS"; then
        print_success "Build et déploiement terminés avec succès"
    else
        print_error "Échec du build ou déploiement"
        exit 1
    fi

    # Configurer le hotspot WiFi avec le nom du club
    print_step "Configuration du hotspot WiFi"

    # Vérifier si hostapd est installé
    if ssh -o ConnectTimeout=10 pi@"$PI_ADDRESS" "systemctl is-active hostapd >/dev/null 2>&1"; then
        print_info "Mise à jour du SSID WiFi vers NEOPRO-$CLUB_NAME..."
        ssh pi@"$PI_ADDRESS" "
            sudo sed -i 's/^ssid=.*/ssid=NEOPRO-$CLUB_NAME/' /etc/hostapd/hostapd.conf
            sudo systemctl restart hostapd
        "
        if [ $? -eq 0 ]; then
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
# Étape 5 : Configuration du hotspot WiFi
################################################################################

configure_wifi_hotspot() {
    print_step "Configuration du hotspot WiFi"

    # Vérifier si hostapd est installé
    if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new pi@"$PI_ADDRESS" "systemctl is-active hostapd >/dev/null 2>&1"; then
        print_info "Mise à jour du SSID WiFi vers NEOPRO-$CLUB_NAME..."
        if ssh pi@"$PI_ADDRESS" "
            sudo sed -i 's/^ssid=.*/ssid=NEOPRO-$CLUB_NAME/' /etc/hostapd/hostapd.conf
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
# Étape 6 : Configuration du sync-agent
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

    # Demander les credentials admin (seules infos non collectées précédemment)
    echo ""
    print_info "Credentials du dashboard central (pour l'enregistrement du site)"
    read -p "Email admin : " ADMIN_EMAIL
    read -s -p "Mot de passe admin : " ADMIN_PASSWORD
    echo ""

    if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
        print_error "Email et mot de passe requis"
        return
    fi

    print_info "Installation des dépendances et enregistrement du site..."

    # Vérifier/réinitialiser la clé SSH si nécessaire
    if ! check_ssh_connection "$PI_ADDRESS"; then
        return
    fi

    # Étape 1: Installer les dépendances npm
    print_info "Installation des dépendances npm..."
    ssh -o StrictHostKeyChecking=accept-new pi@"$PI_ADDRESS" "cd /home/pi/neopro/sync-agent && npm install --omit=dev"

    # Étape 2: Enregistrer le site sur le serveur central
    print_info "Enregistrement du site sur le serveur central..."

    # Échapper les caractères spéciaux pour le shell (simple quotes)
    ESCAPED_ADMIN_PASSWORD=$(printf '%s' "$ADMIN_PASSWORD" | sed "s/'/'\\\\''/g")
    ESCAPED_SITE_NAME=$(printf '%s' "$SITE_NAME" | sed "s/'/'\\\\''/g")
    ESCAPED_CLUB_NAME=$(printf '%s' "$CLUB_FULL_NAME" | sed "s/'/'\\\\''/g")

    # Exécuter register-site.js avec toutes les variables d'environnement
    # Y compris ADMIN_EMAIL et ADMIN_PASSWORD pour éviter les prompts interactifs
    ssh pi@"$PI_ADDRESS" "
        cd /home/pi/neopro/sync-agent
        export CENTRAL_SERVER_URL='https://neopro-central.onrender.com'
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

    # Étape 3: Installer le service systemd
    print_info "Installation du service systemd..."
    ssh pi@"$PI_ADDRESS" "cd /home/pi/neopro/sync-agent && sudo npm run install-service"

    # Étape 4: Vérifier le service
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
# Étape 7 : Résumé final
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
    echo "  • Fichier : $CONFIG_FILE"
    echo "  • Mot de passe : ${PASSWORD:0:3}***********"
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
    echo "  • Dashboard : https://neopro-central.onrender.com"
    echo "  • Le site devrait apparaître dans la liste des sites"
    echo ""
    echo -e "${YELLOW}Prochaines étapes :${NC}"
    echo "  1. Tester la connexion : http://neopro.local/login"
    echo "  2. Vérifier sur le dashboard central que le site est en ligne"
    echo "  3. Copier les vidéos du club dans /home/pi/neopro/videos/"
    echo "  4. Mettre à jour configuration.json avec les bonnes vidéos"
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
    # Vérifier qu'on est à la racine du projet
    if [ ! -f "package.json" ]; then
        print_error "Ce script doit être exécuté depuis la racine du projet"
        exit 1
    fi

    # Vérifier que les scripts requis existent
    if [ ! -f "raspberry/scripts/build-and-deploy.sh" ]; then
        print_error "Script raspberry/scripts/build-and-deploy.sh non trouvé"
        exit 1
    fi

    # Collecter les informations
    collect_club_info

    # Créer la configuration
    create_configuration

    # Demander l'adresse du Pi
    get_pi_address

    # Build et déploiement (utilise build-and-deploy.sh)
    build_and_deploy

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
