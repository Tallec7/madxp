#!/bin/bash

################################################################################
# Script de correction du hostname pour Raspberry Pi
# Fixe le problème de perte du hostname "neopro" après reboot
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== Diagnostic du hostname ===${NC}"

echo -e "\n1. Contenu de /etc/hostname:"
cat /etc/hostname

echo -e "\n2. Contenu de /etc/hosts:"
cat /etc/hosts

echo -e "\n3. Hostname actuel (hostnamectl):"
hostnamectl --static

echo -e "\n4. État du service avahi-daemon:"
systemctl status avahi-daemon --no-pager | head -5

echo -e "\n${YELLOW}=== Correction du hostname ===${NC}"

# Lire le hostname configuré (fallback: neopro)
EXPECTED_HOSTNAME="neopro"
if [ -f /etc/neopro/site.conf ]; then
    CONFIGURED=$(grep "^HOSTNAME_SLUG=" /etc/neopro/site.conf | cut -d'=' -f2)
    if [ -n "${CONFIGURED}" ]; then
        EXPECTED_HOSTNAME="${CONFIGURED}"
    fi
fi
echo -e "Hostname cible: ${EXPECTED_HOSTNAME}"

# 1. Fixer /etc/hostname
echo "${EXPECTED_HOSTNAME}" | sudo tee /etc/hostname > /dev/null
echo -e "${GREEN}✓ /etc/hostname mis à jour${NC}"

# 2. Fixer /etc/hosts
sudo sed -i "s/127.0.1.1.*/127.0.1.1\t${EXPECTED_HOSTNAME}.local ${EXPECTED_HOSTNAME}/" /etc/hosts
echo -e "${GREEN}✓ /etc/hosts mis à jour${NC}"

# 3. Appliquer le hostname
sudo hostnamectl set-hostname "${EXPECTED_HOSTNAME}"
echo -e "${GREEN}✓ Hostname appliqué avec hostnamectl${NC}"

# 4. Configurer Avahi pour écouter sur toutes les interfaces
if grep -q "^#allow-interfaces" /etc/avahi/avahi-daemon.conf; then
    sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
elif grep -q "^allow-interfaces" /etc/avahi/avahi-daemon.conf; then
    sudo sed -i 's/^allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
else
    sudo sed -i '/^\[server\]/a allow-interfaces=eth0,wlan0,wlan1' /etc/avahi/avahi-daemon.conf
fi
echo -e "${GREEN}✓ Avahi configuré pour eth0,wlan0,wlan1${NC}"

# 5. Redémarrer avahi-daemon
sudo systemctl restart avahi-daemon
echo -e "${GREEN}✓ avahi-daemon redémarré${NC}"

echo -e "\n${YELLOW}=== Vérification ===${NC}"
echo -e "Hostname actuel: $(hostnamectl --static)"
echo -e "Hostname attendu: ${EXPECTED_HOSTNAME}"
echo -e "\n${GREEN}✓ Configuration terminée !${NC}"
echo -e "\n${YELLOW}Note:${NC} Le hostname devrait maintenant persister après un reboot."
echo -e "Pour tester, vous pouvez faire: ${GREEN}sudo reboot${NC}"
