#!/bin/bash

################################################################################
# Script de préparation d'une "Image Golden" Neopro
#
# Ce script prépare un Raspberry Pi installé pour être cloné en tant qu'image
# de base réutilisable. Il nettoie les configurations spécifiques au club.
#
# À exécuter SUR LE RASPBERRY PI avant de cloner la carte SD.
#
# Usage: sudo ./prepare-golden-image.sh
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
    echo "║       PRÉPARATION IMAGE GOLDEN NEOPRO                          ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}>>> $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo"
        exit 1
    fi
}

################################################################################
# Vérification de l'installation
################################################################################

check_installation() {
    print_step "Vérification de l'installation Neopro..."

    local ERRORS=0

    # Vérifier que l'application est installée
    if [ ! -d "/home/pi/neopro" ]; then
        print_error "/home/pi/neopro n'existe pas - l'application n'est pas installée"
        ERRORS=$((ERRORS + 1))
    fi

    # Vérifier les services
    for service in neopro-app nginx; do
        if ! systemctl is-enabled "$service" &>/dev/null; then
            print_warning "Service $service non activé"
        fi
    done

    # Vérifier hostapd
    if ! systemctl is-enabled hostapd &>/dev/null; then
        print_warning "hostapd non activé - le hotspot WiFi ne fonctionnera pas"
    fi

    if [ $ERRORS -gt 0 ]; then
        print_error "Installation incomplète. Exécutez d'abord install.sh"
        exit 1
    fi

    print_success "Installation vérifiée"
}

################################################################################
# Nettoyage des configurations spécifiques
################################################################################

clean_club_config() {
    print_step "Nettoyage des configurations club..."

    # Supprimer la configuration du club
    if [ -f "/home/pi/neopro/webapp/assets/configuration.json" ]; then
        rm -f "/home/pi/neopro/webapp/assets/configuration.json"
        print_success "Configuration club supprimée"
    fi

    # Supprimer les vidéos
    if [ -d "/home/pi/neopro/videos" ]; then
        rm -rf /home/pi/neopro/videos/*
        print_success "Vidéos supprimées"
    fi

    # Supprimer les logs
    rm -rf /home/pi/neopro/logs/*
    print_success "Logs supprimés"

    # Supprimer les backups
    rm -rf /home/pi/neopro/backups/*
    print_success "Backups supprimés"
}

################################################################################
# Réinitialisation du WiFi Hotspot
################################################################################

reset_wifi_hotspot() {
    print_step "Réinitialisation du WiFi hotspot..."

    # Remettre le SSID par défaut
    if [ -f "/etc/hostapd/hostapd.conf" ]; then
        sed -i 's/^ssid=.*/ssid=NEOPRO-NOUVEAU/' /etc/hostapd/hostapd.conf
        print_success "SSID réinitialisé à NEOPRO-NOUVEAU"
    fi

    # Remettre le mot de passe par défaut
    if [ -f "/etc/hostapd/hostapd.conf" ]; then
        sed -i 's/^wpa_passphrase=.*/wpa_passphrase=NeoProWiFi2025/' /etc/hostapd/hostapd.conf
        print_success "Mot de passe WiFi réinitialisé à NeoProWiFi2025"
    fi
}

################################################################################
# Réinitialisation du hostname
################################################################################

reset_hostname() {
    print_step "Réinitialisation du hostname..."

    # Le hostname reste neopro pour la découverte mDNS
    echo "neopro" > /etc/hostname
    sed -i 's/127.0.1.1.*/127.0.1.1\tneopro/' /etc/hosts

    print_success "Hostname défini sur 'neopro'"
}

################################################################################
# Nettoyage du sync-agent
################################################################################

clean_sync_agent() {
    print_step "Nettoyage du sync-agent..."

    # Supprimer la configuration du site
    if [ -f "/etc/neopro/site.conf" ]; then
        rm -f /etc/neopro/site.conf
        print_success "Configuration sync-agent supprimée"
    fi

    # Supprimer le fichier .env
    if [ -f "/home/pi/neopro/sync-agent/.env" ]; then
        rm -f /home/pi/neopro/sync-agent/.env
        print_success "Fichier .env sync-agent supprimé"
    fi

    # Désactiver le service (sera réactivé après configuration)
    systemctl stop neopro-sync-agent 2>/dev/null || true
    print_success "Service sync-agent arrêté"
}

################################################################################
# Nettoyage SSH
################################################################################

clean_ssh() {
    print_step "Nettoyage des clés SSH..."

    # Supprimer les clés SSH autorisées (l'utilisateur devra refaire ssh-copy-id)
    rm -f /home/pi/.ssh/authorized_keys
    print_success "Clés SSH autorisées supprimées"

    # Régénérer les clés host SSH au prochain boot
    rm -f /etc/ssh/ssh_host_*
    print_success "Clés host SSH supprimées (seront régénérées au prochain boot)"
}

################################################################################
# Nettoyage système
################################################################################

clean_system() {
    print_step "Nettoyage système..."

    # Supprimer l'historique bash
    rm -f /home/pi/.bash_history
    rm -f /root/.bash_history

    # Supprimer le cache apt
    apt-get clean
    rm -rf /var/cache/apt/archives/*

    # Supprimer les logs système
    journalctl --vacuum-time=1s

    # Supprimer les fichiers temporaires
    rm -rf /tmp/*
    rm -rf /var/tmp/*

    # Supprimer le dossier raspberry d'installation (plus nécessaire)
    if [ -d "/home/pi/raspberry" ]; then
        rm -rf /home/pi/raspberry
        print_success "Dossier ~/raspberry supprimé"
    fi

    print_success "Système nettoyé"
}

################################################################################
# Création du script de premier démarrage
################################################################################

create_first_boot_script() {
    print_step "Création du script de premier démarrage..."

    cat > /home/pi/first-boot-setup.sh << 'FIRSTBOOT'
#!/bin/bash

################################################################################
# Script de premier démarrage - Configuration du nouveau boîtier Neopro
################################################################################

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       BIENVENUE - CONFIGURATION NOUVEAU BOÎTIER NEOPRO         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo "Ce boîtier Neopro nécessite une configuration initiale."
echo ""

# Demander le nom du club
read -p "Nom du club (ex: NANTES, CESSON, RENNES) : " CLUB_NAME
CLUB_NAME=$(echo "$CLUB_NAME" | tr '[:lower:]' '[:upper:]' | tr ' ' '-')

if [ -z "$CLUB_NAME" ]; then
    echo "Nom de club requis. Réexécutez ce script."
    exit 1
fi

# Demander le mot de passe WiFi
read -p "Mot de passe WiFi (min 8 caractères) : " WIFI_PASSWORD

if [ ${#WIFI_PASSWORD} -lt 8 ]; then
    echo "Le mot de passe doit faire au moins 8 caractères."
    exit 1
fi

echo ""
echo -e "${YELLOW}Configuration :${NC}"
echo "  • Club : $CLUB_NAME"
echo "  • SSID WiFi : NEOPRO-$CLUB_NAME"
echo "  • Mot de passe : $WIFI_PASSWORD"
echo ""

read -p "Confirmer ? (o/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Oo]$ ]]; then
    echo "Configuration annulée."
    exit 1
fi

# Appliquer la configuration
echo ""
echo "Application de la configuration..."

# Mettre à jour le SSID WiFi
sudo sed -i "s/^ssid=.*/ssid=NEOPRO-$CLUB_NAME/" /etc/hostapd/hostapd.conf
sudo sed -i "s/^wpa_passphrase=.*/wpa_passphrase=$WIFI_PASSWORD/" /etc/hostapd/hostapd.conf

# Redémarrer hostapd
sudo systemctl restart hostapd

echo ""
echo -e "${GREEN}Configuration terminée !${NC}"
echo ""
echo "Le hotspot WiFi NEOPRO-$CLUB_NAME est maintenant actif."
echo "Mot de passe : $WIFI_PASSWORD"
echo ""
echo -e "${YELLOW}Prochaine étape :${NC}"
echo "  1. Connectez-vous au WiFi NEOPRO-$CLUB_NAME"
echo "  2. Depuis votre Mac, exécutez :"
echo "     ./raspberry/scripts/setup-new-club.sh"
echo ""

# Supprimer ce script après utilisation
# rm -f /home/pi/first-boot-setup.sh
FIRSTBOOT

    chmod +x /home/pi/first-boot-setup.sh
    chown pi:pi /home/pi/first-boot-setup.sh

    print_success "Script first-boot-setup.sh créé"
}

################################################################################
# Affichage des informations finales
################################################################################

print_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       IMAGE GOLDEN PRÊTE À ÊTRE CLONÉE                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Configuration actuelle :${NC}"
    echo "  • Hostname : neopro (neopro.local)"
    echo "  • WiFi SSID : NEOPRO-NOUVEAU"
    echo "  • WiFi Password : NeoProWiFi2025"
    echo "  • Services : installés et activés"
    echo "  • Sync-agent : désactivé (à configurer par club)"
    echo ""
    echo -e "${YELLOW}Prochaines étapes :${NC}"
    echo "  1. Éteindre le Pi : sudo shutdown -h now"
    echo "  2. Retirer la carte SD"
    echo "  3. Cloner avec : sudo ./clone-sd-card.sh neopro-golden-v1.0"
    echo ""
    echo -e "${BLUE}Pour un nouveau club :${NC}"
    echo "  1. Flasher l'image golden sur une nouvelle carte SD"
    echo "  2. Premier boot : exécuter ~/first-boot-setup.sh"
    echo "  3. Depuis Mac : ./raspberry/scripts/setup-new-club.sh"
    echo ""
}

################################################################################
# Fonction principale
################################################################################

main() {
    print_header
    check_root

    echo ""
    echo -e "${YELLOW}Ce script va préparer ce Raspberry Pi pour être cloné${NC}"
    echo -e "${YELLOW}en tant qu'image de base réutilisable.${NC}"
    echo ""
    echo -e "${RED}ATTENTION : Les données suivantes seront supprimées :${NC}"
    echo "  • Configuration du club"
    echo "  • Vidéos"
    echo "  • Logs et backups"
    echo "  • Clés SSH"
    echo "  • Configuration sync-agent"
    echo ""

    read -p "Continuer ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Opération annulée"
        exit 1
    fi

    check_installation
    clean_club_config
    reset_wifi_hotspot
    reset_hostname
    clean_sync_agent
    clean_ssh
    clean_system
    create_first_boot_script

    print_summary
}

main "$@"
