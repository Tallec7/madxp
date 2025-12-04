#!/bin/bash

################################################################################
# Script de récupération Neopro
# Diagnostique et répare automatiquement les problèmes courants
#
# Usage: sudo ./recovery.sh
################################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/home/pi/neopro"
ISSUES_FOUND=0
ISSUES_FIXED=0

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         NEOPRO - SYSTÈME DE RÉCUPÉRATION                       ║"
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
# Vérifications et réparations
################################################################################

check_directory_structure() {
    print_step "Vérification de la structure des répertoires..."

    local dirs=("$INSTALL_DIR" "$INSTALL_DIR/webapp" "$INSTALL_DIR/server" "$INSTALL_DIR/admin" "$INSTALL_DIR/videos" "$INSTALL_DIR/logs" "$INSTALL_DIR/backups")

    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            print_warning "Répertoire manquant: $dir"
            mkdir -p "$dir"
            chown -R pi:pi "$dir"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
            ISSUES_FIXED=$((ISSUES_FIXED + 1))
            print_success "Répertoire créé"
        fi
    done

    print_success "Structure des répertoires OK"
}

check_permissions() {
    print_step "Vérification des permissions..."

    local owner=$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || stat -f '%Su' "$INSTALL_DIR")

    if [ "$owner" != "pi" ]; then
        print_warning "Permissions incorrectes sur $INSTALL_DIR"
        chown -R pi:pi "$INSTALL_DIR"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
        print_success "Permissions corrigées"
    fi

    print_success "Permissions OK"
}

check_services() {
    print_step "Vérification des services..."

    local services=("neopro-app" "neopro-admin" "nginx" "hostapd" "dnsmasq" "avahi-daemon")

    for service in "${services[@]}"; do
        if ! systemctl is-enabled "$service" &>/dev/null; then
            print_warning "Service $service n'est pas activé"
            systemctl enable "$service" || true
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
            ISSUES_FIXED=$((ISSUES_FIXED + 1))
        fi

        if ! systemctl is-active "$service" &>/dev/null; then
            print_warning "Service $service n'est pas démarré"
            systemctl start "$service" || true
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
            ISSUES_FIXED=$((ISSUES_FIXED + 1))
        fi
    done

    print_success "Services vérifiés"
}

check_node_modules() {
    print_step "Vérification des dépendances Node.js..."

    # Serveur principal
    if [ ! -d "$INSTALL_DIR/server/node_modules" ]; then
        print_warning "Dépendances serveur manquantes"
        cd "$INSTALL_DIR/server"
        npm install --production
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
        cd -
        print_success "Dépendances serveur installées"
    fi

    # Admin
    if [ ! -d "$INSTALL_DIR/admin/node_modules" ]; then
        print_warning "Dépendances admin manquantes"
        cd "$INSTALL_DIR/admin"
        npm install --production
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        ISSUES_FIXED=$((ISSUES_FIXED + 1))
        cd -
        print_success "Dépendances admin installées"
    fi

    print_success "Dépendances Node.js OK"
}

check_network() {
    print_step "Vérification de la configuration réseau..."

    # Vérifier hostapd
    if [ ! -f /etc/hostapd/hostapd.conf ]; then
        print_error "Configuration hostapd manquante"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        echo "  → Réexécutez le script d'installation"
    fi

    # Vérifier dnsmasq
    if [ ! -f /etc/dnsmasq.conf ]; then
        print_error "Configuration dnsmasq manquante"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        echo "  → Réexécutez le script d'installation"
    fi

    # Vérifier l'interface wlan0
    if ! ip addr show wlan0 &>/dev/null; then
        print_error "Interface wlan0 non trouvée"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        local ip=$(ip -4 addr show wlan0 | grep inet | awk '{print $2}' | cut -d/ -f1)
        if [ "$ip" != "192.168.4.1" ]; then
            print_warning "IP wlan0 incorrecte: $ip (attendu: 192.168.4.1)"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
            echo "  → Vérifiez /etc/dhcpcd.conf"
        fi
    fi

    print_success "Configuration réseau vérifiée"
}

check_disk_space() {
    print_step "Vérification de l'espace disque..."

    local available=$(df "$INSTALL_DIR" | tail -1 | awk '{print $4}')
    local available_mb=$((available / 1024))

    if [ "$available_mb" -lt 500 ]; then
        print_warning "Espace disque faible: ${available_mb}MB disponibles"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        echo ""
        echo "  Actions recommandées:"
        echo "  • Supprimer les anciens backups"
        echo "  • Supprimer les vidéos inutilisées"
        echo "  • Nettoyer les logs"
    fi

    print_success "Espace disque: ${available_mb}MB disponibles"
}

clean_logs() {
    print_step "Nettoyage des logs..."

    # Journald
    journalctl --vacuum-time=7d

    # Nginx logs
    if [ -f "$INSTALL_DIR/logs/nginx-access.log" ]; then
        truncate -s 0 "$INSTALL_DIR/logs/nginx-access.log"
    fi
    if [ -f "$INSTALL_DIR/logs/nginx-error.log" ]; then
        truncate -s 0 "$INSTALL_DIR/logs/nginx-error.log"
    fi

    print_success "Logs nettoyés"
}

check_webapp() {
    print_step "Vérification de l'application web..."

    if [ ! -f "$INSTALL_DIR/webapp/index.html" ]; then
        print_error "Application web manquante dans $INSTALL_DIR/webapp/"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
        echo ""
        echo "  → Copiez le build Angular dans $INSTALL_DIR/webapp/"
        echo "  Exemple:"
        echo "  scp -r dist/neopro/browser/* pi@neopro.local:$INSTALL_DIR/webapp/"
    else
        print_success "Application web présente"
    fi
}

check_videos() {
    print_step "Vérification des vidéos..."

    local video_count=$(find "$INSTALL_DIR/videos" -type f -name "*.mp4" -o -name "*.mkv" -o -name "*.mov" 2>/dev/null | wc -l)

    if [ "$video_count" -eq 0 ]; then
        print_warning "Aucune vidéo trouvée dans $INSTALL_DIR/videos/"
        echo ""
        echo "  → Copiez les vidéos dans $INSTALL_DIR/videos/"
    else
        print_success "$video_count vidéo(s) trouvée(s)"
    fi
}

restart_services() {
    print_step "Redémarrage des services..."

    systemctl restart neopro-app
    systemctl restart neopro-admin
    systemctl restart nginx

    sleep 2

    print_success "Services redémarrés"
}

test_connectivity() {
    print_step "Test de connectivité..."

    # Test HTTP local
    if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200"; then
        print_success "HTTP local: OK"
    else
        print_error "HTTP local: ÉCHEC"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi

    # Test Socket.IO
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
        print_success "Socket.IO: OK"
    else
        print_error "Socket.IO: ÉCHEC"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi

    # Test Admin
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200"; then
        print_success "Admin Panel: OK"
    else
        print_error "Admin Panel: ÉCHEC"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
}

create_backup() {
    print_step "Création d'un backup de sécurité..."

    local backup_name="recovery-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$INSTALL_DIR/backups/$backup_name" \
        -C "$INSTALL_DIR" \
        webapp server admin club-config.json 2>/dev/null || true

    print_success "Backup créé: $backup_name"
}

generate_report() {
    local report_file="/home/pi/neopro-recovery-report-$(date +%Y%m%d-%H%M%S).txt"

    cat > "$report_file" << EOF
╔════════════════════════════════════════════════════════════════╗
║              RAPPORT DE RÉCUPÉRATION NEOPRO                    ║
╚════════════════════════════════════════════════════════════════╝

Date: $(date)
Hostname: $(hostname)

RÉSUMÉ
------
Problèmes détectés: $ISSUES_FOUND
Problèmes corrigés: $ISSUES_FIXED

ÉTAT DES SERVICES
-----------------
$(systemctl status neopro-app --no-pager -l | head -5)
$(systemctl status neopro-admin --no-pager -l | head -5)
$(systemctl status nginx --no-pager -l | head -5)

ÉTAT DU RÉSEAU
--------------
$(ip addr show wlan0)

ESPACE DISQUE
-------------
$(df -h $INSTALL_DIR)

LOGS RÉCENTS (neopro-app)
-------------------------
$(journalctl -u neopro-app -n 20 --no-pager)

LOGS RÉCENTS (neopro-admin)
---------------------------
$(journalctl -u neopro-admin -n 20 --no-pager)

EOF

    chown pi:pi "$report_file"
    print_success "Rapport généré: $report_file"
}

################################################################################
# Menu interactif
################################################################################

show_menu() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    MENU DE RÉCUPÉRATION                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "1. Diagnostic complet"
    echo "2. Réparer les problèmes détectés"
    echo "3. Nettoyer les logs"
    echo "4. Redémarrer tous les services"
    echo "5. Créer un backup"
    echo "6. Générer un rapport"
    echo "7. Tout réparer automatiquement (recommandé)"
    echo "0. Quitter"
    echo ""
    read -p "Votre choix: " choice

    case $choice in
        1)
            diagnostic_only
            ;;
        2)
            repair_issues
            ;;
        3)
            clean_logs
            ;;
        4)
            restart_services
            ;;
        5)
            create_backup
            ;;
        6)
            generate_report
            ;;
        7)
            auto_repair
            ;;
        0)
            exit 0
            ;;
        *)
            print_error "Choix invalide"
            show_menu
            ;;
    esac
}

diagnostic_only() {
    print_header
    check_directory_structure
    check_permissions
    check_services
    check_node_modules
    check_network
    check_disk_space
    check_webapp
    check_videos
    test_connectivity

    echo ""
    if [ "$ISSUES_FOUND" -eq 0 ]; then
        print_success "Aucun problème détecté!"
    else
        print_warning "$ISSUES_FOUND problème(s) détecté(s)"
        echo ""
        echo "Lancez l'option 7 pour tout réparer automatiquement"
    fi
}

repair_issues() {
    check_directory_structure
    check_permissions
    check_services
    check_node_modules
    restart_services
    test_connectivity

    echo ""
    print_success "$ISSUES_FIXED problème(s) corrigé(s)"
}

auto_repair() {
    print_header
    echo ""
    print_step "Mode de réparation automatique"
    echo ""

    create_backup
    check_directory_structure
    check_permissions
    check_services
    check_node_modules
    check_network
    clean_logs
    restart_services
    test_connectivity
    generate_report

    echo ""
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          RÉCUPÉRATION TERMINÉE                                 ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo "Problèmes détectés: $ISSUES_FOUND"
    echo "Problèmes corrigés: $ISSUES_FIXED"
    echo ""

    if [ "$ISSUES_FOUND" -gt "$ISSUES_FIXED" ]; then
        print_warning "Certains problèmes nécessitent une intervention manuelle"
        echo "Consultez le rapport pour plus de détails"
    else
        print_success "Tous les problèmes ont été corrigés!"
    fi
}

################################################################################
# Fonction principale
################################################################################

main() {
    check_root

    if [ "$1" == "--auto" ]; then
        auto_repair
    else
        print_header
        echo ""
        echo "Ce script diagnostique et répare automatiquement"
        echo "les problèmes courants du système Neopro."
        echo ""
        show_menu
    fi
}

main "$@"
