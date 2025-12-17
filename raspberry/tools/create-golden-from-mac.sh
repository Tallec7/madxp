#!/bin/bash

################################################################################
# Script automatisé de création d'image GOLDEN Neopro
#
# Ce script automatise tout le processus de création d'une image golden :
#   1. Se connecte au Pi via SSH
#   2. Exécute prepare-golden-image.sh sur le Pi
#   3. Éteint le Pi
#   4. Attend la confirmation de l'utilisateur
#   5. Clone la carte SD avec clone-sd-card.sh
#
# Usage: ./create-golden-from-mac.sh <pi-host> [nom-image]
# Exemple: ./create-golden-from-mac.sh raspberrypi.local neopro-golden-v1.0
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       CRÉATION AUTOMATISÉE IMAGE GOLDEN NEOPRO                 ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "${CYAN}>>> $1${NC}"
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

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

################################################################################
# Vérification des paramètres
################################################################################

check_parameters() {
    if [ -z "$PI_HOST" ]; then
        print_error "Usage: $0 <pi-host> [nom-image]"
        echo ""
        echo "Exemples:"
        echo "  $0 raspberrypi.local"
        echo "  $0 raspberrypi.local neopro-golden-v1.0"
        echo "  $0 192.168.1.50 neopro-golden-v2.0"
        exit 1
    fi
}

################################################################################
# Vérification de la connexion SSH
################################################################################

check_ssh_connection() {
    print_step "Vérification de la connexion SSH vers $PI_HOST..."

    if ssh -o ConnectTimeout=5 -o BatchMode=yes "pi@$PI_HOST" exit 2>/dev/null; then
        print_success "Connexion SSH établie"
    else
        print_warning "Connexion SSH impossible en mode non-interactif"
        print_info "Vous devrez peut-être entrer le mot de passe lors des prochaines étapes"
    fi
}

################################################################################
# Vérification que le Pi est bien installé
################################################################################

check_pi_installation() {
    print_step "Vérification de l'installation Neopro sur le Pi..."

    if ssh "pi@$PI_HOST" "[ -d ~/raspberry/tools ] && [ -f ~/raspberry/tools/prepare-golden-image.sh ]" 2>/dev/null; then
        print_success "Installation Neopro trouvée sur le Pi"
    else
        print_error "Le Pi ne semble pas avoir Neopro installé ou les fichiers ne sont pas présents"
        echo ""
        print_info "Assurez-vous d'avoir exécuté :"
        echo "  1. ./raspberry/scripts/copy-to-pi.sh $PI_HOST"
        echo "  2. ssh pi@$PI_HOST 'cd raspberry && sudo ./install.sh MASTER password'"
        exit 1
    fi
}

################################################################################
# Exécution de prepare-golden-image.sh sur le Pi
################################################################################

prepare_golden_on_pi() {
    print_step "Préparation de l'image golden sur le Pi..."
    echo ""
    print_warning "Cette étape va nettoyer toutes les données du club sur le Pi"
    echo ""

    read -p "Continuer ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Opération annulée"
        exit 1
    fi

    echo ""
    print_info "Exécution de prepare-golden-image.sh sur le Pi..."
    print_info "Cela peut prendre quelques minutes..."
    echo ""

    # Exécuter le script sur le Pi
    if ssh -t "pi@$PI_HOST" "cd raspberry/tools && sudo ./prepare-golden-image.sh"; then
        print_success "Pi préparé avec succès"
    else
        print_error "Échec de la préparation du Pi"
        exit 1
    fi
}

################################################################################
# Arrêt du Pi
################################################################################

shutdown_pi() {
    print_step "Arrêt du Raspberry Pi..."
    echo ""
    print_warning "Le Pi va maintenant s'éteindre"
    echo ""

    read -p "Continuer ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Opération annulée"
        print_info "Le Pi est prêt mais n'a pas été éteint"
        print_info "Vous pouvez l'éteindre manuellement avec : ssh pi@$PI_HOST sudo shutdown -h now"
        exit 1
    fi

    echo ""
    print_info "Envoi de la commande d'arrêt..."

    # Envoyer la commande shutdown (ne pas attendre de réponse car la connexion sera coupée)
    ssh "pi@$PI_HOST" "sudo shutdown -h now" 2>/dev/null || true

    sleep 2
    print_success "Commande d'arrêt envoyée"
    echo ""
    print_warning "Attendez 30 secondes que le Pi s'éteigne complètement"
    print_info "Les LEDs du Pi doivent s'éteindre (sauf LED rouge alimentation)"
    echo ""

    # Compte à rebours
    for i in {30..1}; do
        echo -ne "\rAttente : ${i}s "
        sleep 1
    done
    echo -e "\r${GREEN}✓ 30 secondes écoulées${NC}"
}

################################################################################
# Attente retrait et insertion carte SD
################################################################################

wait_for_sd_card() {
    echo ""
    echo -e "${YELLOW}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  ÉTAPE MANUELLE : RETRAIT ET INSERTION CARTE SD               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    print_warning "Le Pi doit être COMPLÈTEMENT ÉTEINT avant de retirer la carte SD"
    echo ""
    echo "Instructions :"
    echo "  1. Débranchez l'alimentation du Raspberry Pi (si pas déjà fait)"
    echo "  2. Retirez la carte SD du Raspberry Pi"
    echo "  3. Insérez la carte SD dans le lecteur de votre Mac"
    echo "  4. Attendez que la carte soit reconnue par macOS"
    echo ""

    read -p "Appuyez sur ENTRÉE une fois la carte SD insérée dans le Mac..."
    echo ""

    print_success "Carte SD prête pour le clonage"
}

################################################################################
# Clonage de la carte SD
################################################################################

clone_sd_card() {
    print_step "Clonage de la carte SD..."
    echo ""
    print_info "Le script clone-sd-card.sh va maintenant se lancer"
    print_info "Il vous demandera de sélectionner le périphérique de la carte SD"
    print_warning "ATTENTION : Sélectionnez bien la carte SD du Pi, pas votre disque dur Mac !"
    echo ""

    read -p "Prêt à lancer le clonage ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Oo]$ ]]; then
        print_error "Clonage annulé"
        print_info "Vous pouvez lancer le clonage manuellement avec :"
        echo "  sudo ./raspberry/tools/clone-sd-card.sh $IMAGE_NAME"
        exit 1
    fi

    echo ""

    # Vérifier que le script existe
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    CLONE_SCRIPT="$SCRIPT_DIR/clone-sd-card.sh"

    if [ ! -f "$CLONE_SCRIPT" ]; then
        print_error "Le script clone-sd-card.sh n'a pas été trouvé"
        print_info "Chemin attendu: $CLONE_SCRIPT"
        exit 1
    fi

    # Lancer le clonage
    if sudo "$CLONE_SCRIPT" "$IMAGE_NAME"; then
        print_success "Clonage terminé avec succès !"
    else
        print_error "Échec du clonage"
        exit 1
    fi
}

################################################################################
# Résumé final
################################################################################

print_final_summary() {
    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       IMAGE GOLDEN CRÉÉE AVEC SUCCÈS !                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}Fichiers créés dans ~/neopro-images/ :${NC}"
    echo "  • ${IMAGE_NAME}.img.gz"
    echo "  • ${IMAGE_NAME}.sha256"
    echo "  • ${IMAGE_NAME}-README.txt"
    echo ""
    echo -e "${YELLOW}Prochaines étapes :${NC}"
    echo "  1. Tester l'image sur une nouvelle carte SD"
    echo "  2. Utiliser Raspberry Pi Imager pour flasher l'image"
    echo "  3. Premier boot : exécuter ~/first-boot-setup.sh"
    echo "  4. Configurer avec ./raspberry/scripts/setup-new-club.sh"
    echo ""
    echo -e "${GREEN}Votre image golden est prête à être utilisée ! 🎉${NC}"
    echo ""
}

################################################################################
# Fonction principale
################################################################################

main() {
    # Récupérer les paramètres
    PI_HOST="$1"
    IMAGE_NAME="${2:-neopro-golden-$(date +%Y%m%d)}"

    print_header
    echo ""
    echo "Configuration :"
    echo "  • Hôte du Pi : $PI_HOST"
    echo "  • Nom de l'image : $IMAGE_NAME"
    echo ""

    check_parameters
    check_ssh_connection
    check_pi_installation

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  ÉTAPE 1/4 : Préparation du Pi${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    prepare_golden_on_pi

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  ÉTAPE 2/4 : Arrêt du Pi${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    shutdown_pi

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  ÉTAPE 3/4 : Insertion de la carte SD dans le Mac${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    wait_for_sd_card

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  ÉTAPE 4/4 : Clonage de la carte SD${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    clone_sd_card

    print_final_summary
}

main "$@"
