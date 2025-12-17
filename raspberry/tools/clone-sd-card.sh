#!/bin/bash

################################################################################
# Script de clonage de carte SD Neopro
# Crée une image compressée d'une carte SD Neopro
#
# Usage: sudo ./clone-sd-card.sh [NOM_IMAGE]
# Exemple: sudo ./clone-sd-card.sh neopro-master-v1.0
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
    echo "║            CLONAGE CARTE SD NEOPRO                             ║"
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

# Paramètres
IMAGE_NAME="${1:-neopro-$(date +%Y%m%d)}"
OUTPUT_DIR="$HOME/neopro-images"
IMAGE_FILE="$OUTPUT_DIR/${IMAGE_NAME}.img"
IMAGE_GZ="$OUTPUT_DIR/${IMAGE_NAME}.img.gz"

################################################################################
# Détection du système d'exploitation
################################################################################

detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="mac"
    else
        print_error "Système d'exploitation non supporté: $OSTYPE"
        exit 1
    fi
}

################################################################################
# Liste des périphériques disponibles
################################################################################

list_devices() {
    print_step "Périphériques disponibles:"
    echo ""

    if [ "$OS" == "linux" ]; then
        lsblk -d -o NAME,SIZE,MODEL,TYPE | grep -E "disk|mmcblk"
    elif [ "$OS" == "mac" ]; then
        diskutil list | grep -E "^/dev/disk"
    fi

    echo ""
}

################################################################################
# Sélection du périphérique
################################################################################

select_device() {
    print_warning "ATTENTION: Sélectionnez la carte SD source (où Neopro est installé)"
    echo ""

    list_devices

    read -p "Entrez le périphérique (ex: /dev/sdb, /dev/mmcblk0, /dev/disk2): " DEVICE

    if [ -z "$DEVICE" ]; then
        print_error "Aucun périphérique sélectionné"
        exit 1
    fi

    # Vérifier que le périphérique existe
    if [ ! -b "$DEVICE" ]; then
        print_error "Le périphérique $DEVICE n'existe pas"
        exit 1
    fi

    # Vérifier la taille
    if [ "$OS" == "linux" ]; then
        DEVICE_SIZE=$(lsblk -b -d -o SIZE "$DEVICE" | tail -1)
        DEVICE_SIZE_GB=$((DEVICE_SIZE / 1024 / 1024 / 1024))
    elif [ "$OS" == "mac" ]; then
        # Extraire la taille en bytes (5ème champ entre parenthèses)
        DEVICE_SIZE=$(diskutil info "$DEVICE" | grep "Total Size" | sed 's/.*(\([0-9]*\) Bytes).*/\1/')
        DEVICE_SIZE_GB=$((DEVICE_SIZE / 1024 / 1024 / 1024))
    fi

    echo ""
    echo -e "${YELLOW}Périphérique sélectionné:${NC}"
    echo "  • Périphérique: $DEVICE"
    echo "  • Taille: ${DEVICE_SIZE_GB}GB"
    echo ""

    read -p "Confirmer le clonage de ce périphérique ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Opération annulée"
        exit 1
    fi
}

################################################################################
# Démontage du périphérique
################################################################################

unmount_device() {
    print_step "Démontage du périphérique..."

    if [ "$OS" == "linux" ]; then
        # Démonter toutes les partitions
        umount ${DEVICE}* 2>/dev/null || true
    elif [ "$OS" == "mac" ]; then
        diskutil unmountDisk "$DEVICE" || true
    fi

    print_success "Périphérique démonté"
}

################################################################################
# Création de l'image
################################################################################

create_image() {
    print_step "Création de l'image (cela peut prendre 10-30 minutes)..."

    # Créer le dossier de sortie
    mkdir -p "$OUTPUT_DIR"

    # Calculer la progression
    if [ "$OS" == "linux" ]; then
        # Utiliser dd avec barre de progression (pv si disponible)
        if command -v pv &> /dev/null; then
            DEVICE_SIZE=$(blockdev --getsize64 "$DEVICE")
            dd if="$DEVICE" bs=4M status=none | pv -s "$DEVICE_SIZE" | dd of="$IMAGE_FILE" bs=4M status=none
        else
            dd if="$DEVICE" of="$IMAGE_FILE" bs=4M status=progress
        fi
    elif [ "$OS" == "mac" ]; then
        # Sur Mac, utiliser dd avec rdisk (plus rapide)
        RDISK=$(echo "$DEVICE" | sed 's/disk/rdisk/')
        dd if="$RDISK" of="$IMAGE_FILE" bs=4m
    fi

    print_success "Image créée: $IMAGE_FILE"
}

################################################################################
# Compression de l'image
################################################################################

compress_image() {
    print_step "Compression de l'image avec gzip (cela peut prendre 5-15 minutes)..."

    # Utiliser pigz (gzip parallèle) si disponible
    if command -v pigz &> /dev/null; then
        pigz -9 -c "$IMAGE_FILE" > "$IMAGE_GZ"
    else
        gzip -9 -c "$IMAGE_FILE" > "$IMAGE_GZ"
    fi

    # Taille originale vs compressée
    ORIGINAL_SIZE=$(du -h "$IMAGE_FILE" | cut -f1)
    COMPRESSED_SIZE=$(du -h "$IMAGE_GZ" | cut -f1)

    print_success "Image compressée: $IMAGE_GZ"
    echo "  • Taille originale: $ORIGINAL_SIZE"
    echo "  • Taille compressée: $COMPRESSED_SIZE"

    # Demander si on supprime l'image non compressée
    echo ""
    read -p "Supprimer l'image non compressée pour économiser de l'espace ? (o/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        rm "$IMAGE_FILE"
        print_success "Image non compressée supprimée"
    fi
}

################################################################################
# Calcul du checksum
################################################################################

calculate_checksum() {
    print_step "Calcul du checksum SHA256..."

    if [ -f "$IMAGE_GZ" ]; then
        CHECKSUM=$(sha256sum "$IMAGE_GZ" 2>/dev/null || shasum -a 256 "$IMAGE_GZ" | awk '{print $1}')
        echo "$CHECKSUM  ${IMAGE_NAME}.img.gz" > "$OUTPUT_DIR/${IMAGE_NAME}.sha256"
        print_success "Checksum: $CHECKSUM"
    fi
}

################################################################################
# Création d'un fichier README
################################################################################

create_readme() {
    print_step "Création du README..."

    cat > "$OUTPUT_DIR/${IMAGE_NAME}-README.txt" << EOF
╔════════════════════════════════════════════════════════════════╗
║                  IMAGE NEOPRO RASPBERRY PI                     ║
╚════════════════════════════════════════════════════════════════╝

Nom de l'image: ${IMAGE_NAME}
Date de création: $(date)
Créée sur: $(hostname)

╔════════════════════════════════════════════════════════════════╗
║  INSTALLATION                                                  ║
╚════════════════════════════════════════════════════════════════╝

1. DÉCOMPRESSION (si nécessaire)
   gunzip ${IMAGE_NAME}.img.gz

2. FLASH SUR CARTE SD

   Windows:
   - Utiliser Win32DiskImager ou Rufus
   - Sélectionner le fichier .img
   - Sélectionner la carte SD
   - Cliquer "Write"

   Linux:
   sudo dd if=${IMAGE_NAME}.img of=/dev/sdX bs=4M status=progress
   (Remplacer /dev/sdX par votre carte SD)

   Mac:
   sudo dd if=${IMAGE_NAME}.img of=/dev/rdiskX bs=4m
   (Remplacer /dev/rdiskX par votre carte SD)

3. PREMIER DÉMARRAGE
   - Insérer la carte SD dans le Raspberry Pi
   - Brancher l'alimentation
   - L'assistant de configuration se lance automatiquement
   - Suivre les instructions à l'écran

╔════════════════════════════════════════════════════════════════╗
║  VÉRIFICATION                                                  ║
╚════════════════════════════════════════════════════════════════╝

Vérifier l'intégrité du fichier téléchargé:

   sha256sum -c ${IMAGE_NAME}.sha256

Le checksum doit correspondre à:
   $CHECKSUM

╔════════════════════════════════════════════════════════════════╗
║  CONFIGURATION POST-INSTALLATION                               ║
╚════════════════════════════════════════════════════════════════╝

Au premier démarrage, vous devrez configurer:
  • Nom du club
  • Mot de passe WiFi Hotspot

Puis copier:
  • Application Angular dans /home/pi/neopro/webapp/
  • Vidéos dans /home/pi/neopro/videos/

╔════════════════════════════════════════════════════════════════╗
║  ACCÈS                                                         ║
╚════════════════════════════════════════════════════════════════╝

Après configuration:
  • WiFi: NEOPRO-[VOTRE_CLUB]
  • Application: http://neopro.local
  • Mode TV: http://neopro.local/tv
  • Remote: http://neopro.local/remote
  • Admin: http://neopro.local:8080

╔════════════════════════════════════════════════════════════════╗
║  SUPPORT                                                       ║
╚════════════════════════════════════════════════════════════════╝

Email: support@neopro.fr
Documentation: https://github.com/neopro/raspberry

Version: 1.0.0
EOF

    print_success "README créé"
}

################################################################################
# Fonction principale
################################################################################

main() {
    print_header
    check_root
    detect_os

    echo ""
    echo -e "${YELLOW}Ce script va créer une image de votre carte SD Neopro.${NC}"
    echo ""
    echo "Nom de l'image: ${IMAGE_NAME}"
    echo "Dossier de sortie: ${OUTPUT_DIR}"
    echo ""

    select_device
    unmount_device
    create_image
    compress_image
    calculate_checksum
    create_readme

    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          CLONAGE TERMINÉ AVEC SUCCÈS                           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Fichiers créés:${NC}"
    echo "  • Image: $IMAGE_GZ"
    echo "  • Checksum: $OUTPUT_DIR/${IMAGE_NAME}.sha256"
    echo "  • README: $OUTPUT_DIR/${IMAGE_NAME}-README.txt"
    echo ""
    echo -e "${YELLOW}Prochaines étapes:${NC}"
    echo "  1. Tester l'image sur une autre carte SD"
    echo "  2. Distribuer l'image aux clubs"
    echo "  3. Fournir les fichiers README et checksum"
    echo ""
    echo -e "${GREEN}Image prête à être distribuée!${NC}"
    echo ""
}

main "$@"
