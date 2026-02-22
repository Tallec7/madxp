#!/bin/bash

################################################################################
# Script de préparation d'image Neopro Raspberry Pi
# Prépare le système pour création d'une image réutilisable
#
# Usage: sudo ./prepare-image.sh
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
    echo "║         PRÉPARATION IMAGE NEOPRO RASPBERRY PI                  ║"
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
# Étape 1: Nettoyage du système
################################################################################

cleanup_system() {
    print_step "Nettoyage du système..."

    # Nettoyer les packages
    apt-get autoremove -y
    apt-get autoclean -y
    apt-get clean -y

    # Nettoyer les logs
    find /var/log -type f -exec truncate -s 0 {} \;
    journalctl --vacuum-time=1d

    # Nettoyer le cache
    rm -rf /var/cache/apt/archives/*.deb
    rm -rf /tmp/*
    rm -rf /var/tmp/*

    # Nettoyer l'historique bash
    history -c
    rm -f /home/pi/.bash_history
    rm -f /root/.bash_history

    print_success "Système nettoyé"
}

################################################################################
# Étape 2: Généralisation de la configuration
################################################################################

generalize_config() {
    print_step "Généralisation de la configuration..."

    # Créer un fichier de première configuration
    cat > /home/pi/neopro/first-boot-config.json << 'EOF'
{
  "configured": false,
  "clubName": "",
  "wifiSSID": "",
  "wifiPassword": "",
  "installDate": "",
  "version": "1.0.0"
}
EOF

    # Supprimer la configuration spécifique du club
    if [ -f /home/pi/neopro/club-config.json ]; then
        rm /home/pi/neopro/club-config.json
    fi

    # Réinitialiser le hostname à un nom générique
    hostnamectl set-hostname neopro
    sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts

    # Généraliser la configuration WiFi
    cat > /etc/hostapd/hostapd.conf << 'EOF'
interface=wlan0
driver=nl80211
ssid=NEOPRO-UNCONFIGURED
hw_mode=g
channel=6
wmm_enabled=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
wpa_pairwise=CCMP
rsn_pairwise=CCMP
wpa_passphrase=NeoProWiFi2025
max_num_sta=10
ignore_broadcast_ssid=0
ieee80211n=1
country_code=FR
EOF

    chown pi:pi /home/pi/neopro/first-boot-config.json

    print_success "Configuration généralisée"
}

################################################################################
# Étape 3: Création du script de première configuration
################################################################################

create_first_boot_script() {
    print_step "Création du script de première configuration..."

    cat > /home/pi/neopro/first-boot-setup.sh << 'EOFSCRIPT'
#!/bin/bash

################################################################################
# Script de configuration au premier démarrage
# Personnalise le système Neopro pour un club spécifique
################################################################################

DIALOG_HEIGHT=15
DIALOG_WIDTH=60

# Vérifier si whiptail est disponible
if ! command -v whiptail &> /dev/null; then
    echo "Installation de whiptail..."
    sudo apt-get update -qq
    sudo apt-get install -y whiptail
fi

# Vérifier si déjà configuré
if [ -f /home/pi/neopro/club-config.json ]; then
    if whiptail --title "Neopro Configuration" --yesno "Le système est déjà configuré. Reconfigurer ?" 8 60; then
        :
    else
        echo "Configuration annulée"
        exit 0
    fi
fi

# Écran de bienvenue
whiptail --title "Neopro - Configuration initiale" --msgbox "Bienvenue dans l'assistant de configuration Neopro.\n\nVous allez configurer:\n• Le nom du club\n• Le WiFi Hotspot\n• Les paramètres réseau" $DIALOG_HEIGHT $DIALOG_WIDTH

# Saisie nom du club
CLUB_NAME=$(whiptail --title "Nom du club" --inputbox "Entrez le nom du club (ex: CESSON, NANTES):" $DIALOG_HEIGHT $DIALOG_WIDTH 3>&1 1>&2 2>&3)
if [ -z "$CLUB_NAME" ]; then
    echo "Configuration annulée"
    exit 1
fi

# Saisie mot de passe WiFi
WIFI_PASSWORD=$(whiptail --title "Mot de passe WiFi" --passwordbox "Entrez le mot de passe du Hotspot WiFi (8+ caractères):" $DIALOG_HEIGHT $DIALOG_WIDTH 3>&1 1>&2 2>&3)
if [ -z "$WIFI_PASSWORD" ] || [ ${#WIFI_PASSWORD} -lt 8 ]; then
    whiptail --title "Erreur" --msgbox "Le mot de passe doit contenir au moins 8 caractères" 8 60
    exit 1
fi

# Confirmation
if ! whiptail --title "Confirmation" --yesno "Configuration:\n\nClub: $CLUB_NAME\nWiFi SSID: NEOPRO-$CLUB_NAME\nMot de passe: [défini]\n\nConfirmer ?" $DIALOG_HEIGHT $DIALOG_WIDTH; then
    echo "Configuration annulée"
    exit 1
fi

# Application de la configuration
echo "Application de la configuration..."

# Mise à jour hostapd
sudo sed -i "s/ssid=.*/ssid=NEOPRO-$CLUB_NAME/" /etc/hostapd/hostapd.conf
sudo sed -i "s/wpa_passphrase=.*/wpa_passphrase=$WIFI_PASSWORD/" /etc/hostapd/hostapd.conf

# Création du fichier de configuration
cat > /home/pi/neopro/club-config.json << EOF
{
  "clubName": "$CLUB_NAME",
  "wifiSSID": "NEOPRO-$CLUB_NAME",
  "wifiPassword": "$WIFI_PASSWORD",
  "installDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.0.0",
  "configured": true
}
EOF

# Suppression du fichier de première config
rm -f /home/pi/neopro/first-boot-config.json

# Redémarrage des services
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq

whiptail --title "Configuration terminée" --msgbox "Configuration appliquée avec succès!\n\nVotre système Neopro est prêt.\n\nWiFi: NEOPRO-$CLUB_NAME\nAdmin: http://neopro.local:8080\n\nLe système va redémarrer." $DIALOG_HEIGHT $DIALOG_WIDTH

sudo reboot
EOFSCRIPT

    chmod +x /home/pi/neopro/first-boot-setup.sh
    chown pi:pi /home/pi/neopro/first-boot-setup.sh

    print_success "Script de première configuration créé"
}

################################################################################
# Étape 4: Création du service de première configuration
################################################################################

create_first_boot_service() {
    print_step "Création du service de première configuration..."

    cat > /etc/systemd/system/neopro-first-boot.service << 'EOF'
[Unit]
Description=Neopro First Boot Configuration
After=multi-user.target
Before=neopro-app.service neopro-admin.service

[Service]
Type=oneshot
User=pi
ExecStart=/bin/bash -c 'if [ ! -f /home/pi/neopro/club-config.json ]; then /home/pi/neopro/first-boot-setup.sh; fi'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable neopro-first-boot.service

    print_success "Service de première configuration créé"
}

################################################################################
# Étape 5: Création d'un fichier README sur le bureau
################################################################################

create_desktop_readme() {
    print_step "Création du README sur le bureau..."

    cat > /home/pi/Desktop/NEOPRO-README.txt << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║                    NEOPRO RASPBERRY PI                         ║
║                    Image pré-configurée                        ║
╚════════════════════════════════════════════════════════════════╝

🎯 PREMIER DÉMARRAGE

Au premier démarrage, un assistant de configuration s'ouvrira
automatiquement pour personnaliser le système.

Si l'assistant ne s'ouvre pas, exécutez :
  cd /home/pi/neopro
  ./first-boot-setup.sh


🌐 ACCÈS

Après configuration, le système sera accessible via :
  • WiFi: NEOPRO-[VOTRE_CLUB]
  • Application: http://neopro.local
  • Mode TV: http://neopro.local/tv
  • Remote: http://neopro.local/remote
  • Admin: http://neopro.local:8080


📁 COPIE DES FICHIERS

1. Application Angular:
   Copiez votre build dans: /home/pi/neopro/webapp/

2. Vidéos:
   Copiez vos vidéos dans: /home/pi/neopro/videos/

3. Redémarrez les services:
   sudo systemctl restart neopro-app nginx


🔧 SERVICES

Vérifier l'état:
  sudo systemctl status neopro-app
  sudo systemctl status neopro-admin
  sudo systemctl status nginx

Logs:
  sudo journalctl -u neopro-app -f


📞 SUPPORT

Email: support@neopro.fr
Documentation: /home/pi/raspberry/


╔════════════════════════════════════════════════════════════════╗
║  Version 1.0.0 | Neopro / Kalon Partners                      ║
╚════════════════════════════════════════════════════════════════╝
EOF

    chown pi:pi /home/pi/Desktop/NEOPRO-README.txt

    print_success "README créé sur le bureau"
}

################################################################################
# Étape 6: Configuration SSH
################################################################################

configure_ssh() {
    print_step "Configuration SSH..."

    # Régénérer les clés SSH au premier boot
    cat > /etc/systemd/system/regenerate-ssh-keys.service << 'EOF'
[Unit]
Description=Regenerate SSH host keys
Before=ssh.service
ConditionFileIsExecutable=/usr/bin/ssh-keygen

[Service]
Type=oneshot
ExecStartPre=-/bin/dd if=/dev/hwrng of=/dev/urandom count=1 bs=4096
ExecStartPre=-/bin/sh -c "/bin/rm -f -v /etc/ssh/ssh_host_*_key*"
ExecStart=/usr/bin/ssh-keygen -A -v
ExecStartPost=/bin/systemctl disable regenerate-ssh-keys

[Install]
WantedBy=multi-user.target
EOF

    systemctl enable regenerate-ssh-keys.service

    print_success "Configuration SSH préparée"
}

################################################################################
# Étape 7: Informations finales
################################################################################

finalize() {
    print_step "Finalisation..."

    # Créer un fichier d'information pour l'image
    cat > /home/pi/neopro/IMAGE-INFO.txt << EOF
Image Neopro Raspberry Pi
=========================

Date de création: $(date)
Version: 1.0.0
Créé sur: $(hostname)

Cette image contient:
- Neopro Application (Socket.IO + Angular)
- Neopro Admin Panel (port 8080)
- Hotspot WiFi pré-configuré
- Services systemd
- Script de première configuration

Au premier démarrage:
1. Le script de configuration s'exécutera automatiquement
2. Vous pourrez personnaliser le nom du club et le WiFi
3. Le système redémarrera avec la nouvelle configuration

Documentation:
/home/pi/raspberry/README-COMPLET.md
EOF

    chown pi:pi /home/pi/neopro/IMAGE-INFO.txt

    # Nettoyer les clés SSH actuelles (seront régénérées au boot)
    rm -f /etc/ssh/ssh_host_*_key*

    print_success "Finalisation terminée"
}

################################################################################
# Fonction principale
################################################################################

main() {
    print_header
    check_root

    echo ""
    echo -e "${YELLOW}Ce script prépare le système pour créer une image réutilisable.${NC}"
    echo -e "${YELLOW}L'image pourra être flashée sur d'autres cartes SD.${NC}"
    echo ""
    read -p "Continuer? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Opération annulée"
        exit 1
    fi

    cleanup_system
    generalize_config
    create_first_boot_script
    create_first_boot_service
    create_desktop_readme
    configure_ssh
    finalize

    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          PRÉPARATION TERMINÉE AVEC SUCCÈS                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Prochaines étapes:${NC}"
    echo ""
    echo "1. ÉTEIGNEZ le Raspberry Pi (NE PAS redémarrer):"
    echo "   sudo shutdown -h now"
    echo ""
    echo "2. Retirez la carte SD"
    echo ""
    echo "3. Créez l'image avec un outil comme:"
    echo "   • Win32DiskImager (Windows)"
    echo "   • dd (Linux/Mac)"
    echo "   • Raspberry Pi Imager"
    echo ""
    echo "4. Flashez cette image sur d'autres cartes SD"
    echo ""
    echo "5. Au premier boot, la configuration automatique se lancera"
    echo ""
    echo -e "${YELLOW}⚠ IMPORTANT:${NC}"
    echo "  • Chaque nouvelle carte SD aura des clés SSH uniques"
    echo "  • Le WiFi SSID sera NEOPRO-UNCONFIGURED jusqu'à configuration"
    echo "  • L'assistant de configuration se lance automatiquement"
    echo ""
}

main "$@"
