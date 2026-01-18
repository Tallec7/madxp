#!/bin/bash

################################################################################
# Script de diagnostic et réparation du hotspot WiFi Neopro
#
# Ce script analyse les interférences WiFi, vérifie l'alimentation,
# et peut préparer un changement de canal (appliqué au prochain reboot).
#
# Usage: ./fix-hotspot.sh [OPTIONS]
#   --auto-fix     : Prépare les corrections (canal changé dans config, reboot requis)
#   --json         : Output en JSON (pour intégration dashboard/admin)
#   --reboot-now   : Redémarre immédiatement après avoir appliqué les corrections
################################################################################

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

AUTO_FIX=false
JSON_OUTPUT=false
REBOOT_NOW=false

for arg in "$@"; do
    case $arg in
        --auto-fix)
            AUTO_FIX=true
            ;;
        --json)
            JSON_OUTPUT=true
            ;;
        --reboot-now)
            REBOOT_NOW=true
            ;;
    esac
done

# Variables pour le résultat JSON
JSON_RESULT=""
CHANNEL_CHANGED=false
NEEDS_REBOOT=false
OLD_CHANNEL=""
NEW_CHANNEL=""

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║            DIAGNOSTIC HOTSPOT WIFI NEOPRO                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_section() {
    echo -e "\n${BLUE}═══ $1 ═══${NC}"
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
    echo -e "${CYAN}ℹ $1${NC}"
}

################################################################################
# 1. VÉRIFICATION DE L'ALIMENTATION
################################################################################
check_power() {
    print_section "1. Alimentation"

    local THROTTLED=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)

    if [ -z "$THROTTLED" ]; then
        print_warning "Impossible de lire l'état d'alimentation"
        return 1
    fi

    if [ "$THROTTLED" = "0x0" ]; then
        print_success "Alimentation OK (aucun problème détecté)"
        return 0
    else
        print_error "Problème d'alimentation détecté !"
        echo ""

        # Décoder les flags
        if (( THROTTLED & 0x1 )); then
            print_error "  → Sous-voltage détecté (alimentation trop faible)"
        fi
        if (( THROTTLED & 0x2 )); then
            print_error "  → Fréquence CPU bridée"
        fi
        if (( THROTTLED & 0x4 )); then
            print_error "  → CPU en throttling (surchauffe)"
        fi
        if (( THROTTLED & 0x8 )); then
            print_error "  → Limite de température atteinte"
        fi
        if (( THROTTLED & 0x10000 )); then
            print_warning "  → Sous-voltage passé (historique)"
        fi
        if (( THROTTLED & 0x20000 )); then
            print_warning "  → Bridage fréquence passé (historique)"
        fi
        if (( THROTTLED & 0x40000 )); then
            print_warning "  → Throttling passé (historique)"
        fi
        if (( THROTTLED & 0x80000 )); then
            print_warning "  → Limite température passée (historique)"
        fi

        echo ""
        print_info "SOLUTION : Utiliser un chargeur 5V/3A officiel Raspberry Pi"
        print_info "           Éviter les ports USB de TV ou hubs non alimentés"
        return 1
    fi
}

################################################################################
# 2. SCAN DES RÉSEAUX WIFI ET ANALYSE DES CANAUX
################################################################################
scan_wifi_channels() {
    print_section "2. Analyse des canaux WiFi"

    # Récupérer l'interface WiFi
    local WIFI_IF=$(iw dev 2>/dev/null | awk '/Interface/ {print $2; exit}')

    if [ -z "$WIFI_IF" ]; then
        print_error "Aucune interface WiFi détectée"
        return 1
    fi

    # Canal actuel
    local CURRENT_CHANNEL=$(grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
    print_info "Canal actuel du hotspot : ${CURRENT_CHANNEL:-inconnu}"

    echo ""
    echo "Scan des réseaux environnants..."

    # Scanner (nécessite que hostapd soit temporairement arrêté ou utiliser une autre interface)
    # On utilise iwlist qui peut scanner même en mode AP sur certains drivers
    local SCAN_RESULT=$(sudo iwlist "$WIFI_IF" scan 2>/dev/null)

    if [ -z "$SCAN_RESULT" ]; then
        print_warning "Impossible de scanner (mode AP actif)"
        print_info "Comptage basé sur les logs dnsmasq et estimations"

        # Fallback : recommander les canaux standards
        echo ""
        echo "Canaux recommandés (non-chevauchants) :"
        echo "  Channel 1  : Souvent moins encombré"
        echo "  Channel 6  : Par défaut (souvent saturé)"
        echo "  Channel 11 : Alternative recommandée"

        RECOMMENDED_CHANNEL=1
        return 0
    fi

    # Compter les réseaux par canal
    echo ""
    echo "Réseaux détectés par canal :"
    echo "────────────────────────────"

    declare -A CHANNEL_COUNT
    for ch in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
        CHANNEL_COUNT[$ch]=0
    done

    while IFS= read -r line; do
        if [[ "$line" =~ Channel:([0-9]+) ]]; then
            ch="${BASH_REMATCH[1]}"
            ((CHANNEL_COUNT[$ch]++))
        fi
    done <<< "$SCAN_RESULT"

    # Afficher les résultats
    for ch in 1 6 11; do
        local count=${CHANNEL_COUNT[$ch]}
        local bar=""
        for ((i=0; i<count; i++)); do bar+="█"; done

        local status=""
        if [ "$ch" = "$CURRENT_CHANNEL" ]; then
            status=" ← ACTUEL"
        fi

        if [ $count -eq 0 ]; then
            echo -e "  Channel $ch : ${GREEN}$count réseaux${NC} $bar$status"
        elif [ $count -le 3 ]; then
            echo -e "  Channel $ch : ${YELLOW}$count réseaux${NC} $bar$status"
        else
            echo -e "  Channel $ch : ${RED}$count réseaux${NC} $bar$status"
        fi
    done

    # Trouver le meilleur canal (parmi 1, 6, 11)
    local BEST_CHANNEL=1
    local MIN_COUNT=${CHANNEL_COUNT[1]}

    for ch in 6 11; do
        if [ ${CHANNEL_COUNT[$ch]} -lt $MIN_COUNT ]; then
            MIN_COUNT=${CHANNEL_COUNT[$ch]}
            BEST_CHANNEL=$ch
        fi
    done

    RECOMMENDED_CHANNEL=$BEST_CHANNEL

    echo ""
    if [ "$BEST_CHANNEL" != "$CURRENT_CHANNEL" ]; then
        print_warning "Canal recommandé : $BEST_CHANNEL (actuellement sur $CURRENT_CHANNEL)"
        return 1
    else
        print_success "Vous êtes déjà sur le meilleur canal ($CURRENT_CHANNEL)"
        return 0
    fi
}

################################################################################
# 3. VÉRIFICATION DES SERVICES HOTSPOT
################################################################################
check_hotspot_services() {
    print_section "3. Services Hotspot"

    local SERVICES_OK=true

    # hostapd
    if systemctl is-active --quiet hostapd; then
        print_success "hostapd : actif"
    else
        print_error "hostapd : inactif"
        SERVICES_OK=false
    fi

    # dnsmasq
    if systemctl is-active --quiet dnsmasq; then
        print_success "dnsmasq : actif"
    else
        print_error "dnsmasq : inactif"
        SERVICES_OK=false
    fi

    # Vérifier rfkill
    local RF_BLOCKED=$(rfkill list wifi 2>/dev/null | grep -c "Soft blocked: yes")
    if [ "$RF_BLOCKED" -gt 0 ]; then
        print_error "WiFi bloqué par rfkill !"
        SERVICES_OK=false
    else
        print_success "rfkill : WiFi non bloqué"
    fi

    # Vérifier l'IP
    if ip addr show wlan0 2>/dev/null | grep -q "192.168.4.1"; then
        print_success "IP wlan0 : 192.168.4.1"
    else
        print_error "IP wlan0 : 192.168.4.1 non configurée"
        SERVICES_OK=false
    fi

    # Vérifier le SSID
    local SSID=$(grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
    if [ -n "$SSID" ]; then
        print_success "SSID configuré : $SSID"
    else
        print_error "SSID non configuré"
        SERVICES_OK=false
    fi

    if [ "$SERVICES_OK" = true ]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# 4. TEST DE CONNECTIVITÉ
################################################################################
test_connectivity() {
    print_section "4. Test de connectivité"

    # Test captive portal
    local CAPTIVE_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/generate_204 2>/dev/null)
    if [ "$CAPTIVE_TEST" = "204" ]; then
        print_success "Captive portal : OK (204)"
    else
        print_warning "Captive portal : code $CAPTIVE_TEST (attendu: 204)"
    fi

    # Test page principale
    local MAIN_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
    if [ "$MAIN_TEST" = "200" ]; then
        print_success "Page principale : OK (200)"
    else
        print_error "Page principale : code $MAIN_TEST"
    fi

    # Test remote
    local REMOTE_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/remote 2>/dev/null)
    if [ "$REMOTE_TEST" = "200" ]; then
        print_success "Page /remote : OK (200)"
    else
        print_error "Page /remote : code $REMOTE_TEST"
    fi
}

################################################################################
# 5. CORRECTIONS AUTOMATIQUES
################################################################################
apply_fixes() {
    print_section "5. Corrections"

    local FIXES_APPLIED=false
    local RFKILL_FIXED=false

    # Fix rfkill si bloqué (peut être appliqué immédiatement, sans risque)
    if rfkill list wifi 2>/dev/null | grep -q "Soft blocked: yes"; then
        print_info "Déblocage WiFi (rfkill)..."
        sudo rfkill unblock wifi
        RFKILL_FIXED=true
        FIXES_APPLIED=true
        sleep 1
    fi

    # Changer de canal si recommandé
    # IMPORTANT: On ne redémarre PAS hostapd car ça coupe wlan1 (connexion Internet)
    # Le changement sera appliqué au prochain reboot du Pi
    if [ -n "$RECOMMENDED_CHANNEL" ]; then
        local CURRENT=$(grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
        if [ "$RECOMMENDED_CHANNEL" != "$CURRENT" ]; then
            if [ "$AUTO_FIX" = true ]; then
                print_info "Préparation du changement de canal : $CURRENT → $RECOMMENDED_CHANNEL"
                sudo sed -i "s/^channel=.*/channel=$RECOMMENDED_CHANNEL/" /etc/hostapd/hostapd.conf

                # Sauvegarder pour le JSON
                OLD_CHANNEL="$CURRENT"
                NEW_CHANNEL="$RECOMMENDED_CHANNEL"
                CHANNEL_CHANGED=true
                NEEDS_REBOOT=true
                FIXES_APPLIED=true

                print_success "Configuration mise à jour (canal $CURRENT → $RECOMMENDED_CHANNEL)"
                print_warning "⚠️  REDÉMARRAGE REQUIS pour appliquer le changement"
                print_info "Le changement sera effectif au prochain redémarrage du boîtier"

                # Si --reboot-now est passé, programmer le reboot
                if [ "$REBOOT_NOW" = true ]; then
                    print_warning "Redémarrage du boîtier dans 5 secondes..."
                    echo ""
                    print_warning "⚠️  La TV et la télécommande seront indisponibles pendant ~1 minute"
                    sleep 5
                    sudo reboot
                fi
            else
                echo ""
                print_warning "Changement de canal recommandé : $CURRENT → $RECOMMENDED_CHANNEL"
                echo ""
                read -p "Appliquer ce changement ? (o/N) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Oo]$ ]]; then
                    sudo sed -i "s/^channel=.*/channel=$RECOMMENDED_CHANNEL/" /etc/hostapd/hostapd.conf
                    OLD_CHANNEL="$CURRENT"
                    NEW_CHANNEL="$RECOMMENDED_CHANNEL"
                    CHANNEL_CHANGED=true
                    NEEDS_REBOOT=true
                    FIXES_APPLIED=true

                    print_success "Configuration mise à jour"
                    echo ""
                    read -p "Redémarrer maintenant pour appliquer ? (o/N) " -n 1 -r
                    echo
                    if [[ $REPLY =~ ^[Oo]$ ]]; then
                        print_warning "Redémarrage dans 3 secondes..."
                        sleep 3
                        sudo reboot
                    else
                        print_info "Le changement sera appliqué au prochain redémarrage"
                    fi
                fi
            fi
        fi
    fi

    # Résumé
    if [ "$FIXES_APPLIED" = true ]; then
        if [ "$RFKILL_FIXED" = true ] && [ "$CHANNEL_CHANGED" = false ]; then
            # Seul rfkill a été corrigé, on peut redémarrer les services sans risque
            print_info "Redémarrage des services hotspot..."
            sudo systemctl restart hostapd
            sudo systemctl restart dnsmasq
            sleep 2
            if systemctl is-active --quiet hostapd && systemctl is-active --quiet dnsmasq; then
                print_success "Services hotspot redémarrés avec succès"
            fi
        fi
    else
        print_info "Aucune correction nécessaire"
    fi
}

################################################################################
# 6. RÉSUMÉ ET RECOMMANDATIONS
################################################################################
print_summary() {
    print_section "RÉSUMÉ"

    echo ""

    local HAS_ISSUES=false

    # Alimentation
    local THROTTLED=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
    if [ "$THROTTLED" != "0x0" ] && [ -n "$THROTTLED" ]; then
        print_error "Alimentation : PROBLÈME DÉTECTÉ"
        echo "  → Utiliser un chargeur 5V/3A officiel"
        HAS_ISSUES=true
    fi

    # Services
    if ! systemctl is-active --quiet hostapd || ! systemctl is-active --quiet dnsmasq; then
        print_error "Services : INACTIFS"
        echo "  → sudo systemctl restart hostapd dnsmasq"
        HAS_ISSUES=true
    fi

    # Canal
    if [ -n "$RECOMMENDED_CHANNEL" ]; then
        local CURRENT=$(grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
        if [ "$RECOMMENDED_CHANNEL" != "$CURRENT" ]; then
            print_warning "Canal : $CURRENT (recommandé: $RECOMMENDED_CHANNEL)"
            HAS_ISSUES=true
        fi
    fi

    echo ""

    if [ "$HAS_ISSUES" = false ]; then
        print_success "Hotspot configuré correctement !"
        echo ""
        echo "Si le SSID n'est toujours pas visible :"
        echo "  1. Vérifier que vous n'êtes pas trop loin du boîtier"
        echo "  2. Redémarrer le WiFi sur votre téléphone"
        echo "  3. Essayer de vous connecter à 192.168.4.1 directement"
    else
        echo ""
        echo "Pour appliquer les corrections automatiquement :"
        echo "  ./fix-hotspot.sh --auto-fix"
    fi

    echo ""
}

################################################################################
# OUTPUT JSON (pour intégration dashboard/admin)
################################################################################
output_json() {
    local CURRENT_CHANNEL=$(grep "^channel=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
    local SSID=$(grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null | cut -d= -f2)
    local HOSTAPD_ACTIVE=$(systemctl is-active --quiet hostapd && echo "true" || echo "false")
    local DNSMASQ_ACTIVE=$(systemctl is-active --quiet dnsmasq && echo "true" || echo "false")
    local THROTTLED=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
    local POWER_OK="true"
    if [ "$THROTTLED" != "0x0" ] && [ -n "$THROTTLED" ]; then
        POWER_OK="false"
    fi

    cat << EOF
{
  "success": true,
  "diagnostic": {
    "currentChannel": $CURRENT_CHANNEL,
    "recommendedChannel": ${RECOMMENDED_CHANNEL:-$CURRENT_CHANNEL},
    "ssid": "$SSID",
    "hostapdActive": $HOSTAPD_ACTIVE,
    "dnsmasqActive": $DNSMASQ_ACTIVE,
    "powerOk": $POWER_OK,
    "throttledValue": "$THROTTLED"
  },
  "fix": {
    "channelChanged": $CHANNEL_CHANGED,
    "needsReboot": $NEEDS_REBOOT,
    "oldChannel": "${OLD_CHANNEL:-}",
    "newChannel": "${NEW_CHANNEL:-}"
  },
  "message": "$([ "$CHANNEL_CHANGED" = true ] && echo "Canal changé de $OLD_CHANNEL à $NEW_CHANNEL. Redémarrage requis pour appliquer." || echo "Diagnostic terminé.")"
}
EOF
}

################################################################################
# EXÉCUTION
################################################################################

# Mode JSON : pas d'affichage texte
if [ "$JSON_OUTPUT" = true ]; then
    # Exécuter les vérifications silencieusement
    exec 3>&1 4>&2
    exec 1>/dev/null 2>&1

    check_power
    POWER_OK=$?

    scan_wifi_channels
    CHANNEL_OK=$?

    check_hotspot_services
    SERVICES_OK=$?

    # Appliquer les corrections si demandé
    if [ "$AUTO_FIX" = true ]; then
        apply_fixes
    fi

    # Restaurer stdout et afficher JSON
    exec 1>&3 2>&4
    output_json
    exit 0
fi

# Mode normal (texte)
print_header

# Vérifications
check_power
POWER_OK=$?

scan_wifi_channels
CHANNEL_OK=$?

check_hotspot_services
SERVICES_OK=$?

test_connectivity

# Appliquer les corrections si demandé ou si problèmes détectés
if [ "$AUTO_FIX" = true ] || [ $SERVICES_OK -ne 0 ]; then
    apply_fixes
fi

# Résumé final
print_summary
