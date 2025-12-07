#!/bin/bash

################################################################################
# Script de nettoyage du Raspberry Pi après installation
#
# Supprime le dossier ~/raspberry/ qui n'est plus nécessaire après install.sh
# L'application est installée dans /home/pi/neopro/
#
# Usage: ./cleanup-pi.sh [ADRESSE_PI]
################################################################################

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PI_ADDRESS="${1:-neopro.local}"
PI_USER="pi"

echo -e "${BLUE}>>> Nettoyage du Raspberry Pi ($PI_ADDRESS)${NC}"

# Vérifier que l'installation est complète
if ! ssh -o ConnectTimeout=10 "$PI_USER@$PI_ADDRESS" "test -d /home/pi/neopro/server" 2>/dev/null; then
    echo -e "${RED}✗ L'application n'est pas installée dans /home/pi/neopro/${NC}"
    echo "Exécutez d'abord install.sh avant de nettoyer"
    exit 1
fi

# Afficher ce qui va être supprimé
echo ""
echo -e "${YELLOW}Ce qui va être supprimé :${NC}"
ssh "$PI_USER@$PI_ADDRESS" "
    if [ -d ~/raspberry ]; then
        du -sh ~/raspberry
        ls ~/raspberry/ 2>/dev/null || echo '(vide)'
    else
        echo '~/raspberry n existe pas'
    fi
"

echo ""
read -p "Supprimer ~/raspberry sur le Pi ? (o/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Oo]$ ]]; then
    ssh "$PI_USER@$PI_ADDRESS" "rm -rf ~/raspberry"
    echo -e "${GREEN}✓ ~/raspberry supprimé${NC}"

    # Afficher l'espace libéré
    echo ""
    echo "Espace disque actuel :"
    ssh "$PI_USER@$PI_ADDRESS" "df -h / | tail -1"
else
    echo -e "${YELLOW}Nettoyage annulé${NC}"
fi
