#!/bin/bash
# =============================================================================
# FIX FLEET Pi — Script tout-en-un pour la flotte Neopro
# =============================================================================
#
# Ce script corrige les problèmes identifiés sur tous les Pi de la flotte
# (v3.7.13.1) à partir des analyses des debug bundles NLF et NARH du
# 2026-02-08.
#
# Usage :
#   scp raspberry/scripts/fix-fleet-pi.sh pi@neopro.local:/tmp/
#   ssh pi@neopro.local 'chmod +x /tmp/fix-fleet-pi.sh && sudo /tmp/fix-fleet-pi.sh'
#
# Ce que fait ce script :
#   1. Corrige TKIP → CCMP dans hostapd.conf (éjections téléphones)
#   2. Installe les 3 services systemd manquants (watchdog, guardian, optimizer)
#   3. Crée le dossier videos-processing (permission denied)
#   4. Vérifie et corrige les flags GPU du kiosk
#   5. Vide le cache Chromium (erreurs SharedImage / AllocateRingBuffer)
#   6. Force le flush des buffers bloqués (analytics + sponsors)
#   7. Vérifie gpu_mem dans la config boot (Pi 5 : dynamique CMA)
#
# Compatible : Pi 4, Pi 5, Ethernet, WiFi
# Temps estimé : ~30 secondes
# Nécessite : accès root (sudo)
# Reboot : OUI (nécessaire pour appliquer les changements GPU et hotspot)
#
# =============================================================================

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

NEOPRO_ROOT="/home/pi/neopro"
ERRORS=0
CHANGES=0
NEEDS_REBOOT=false

log_ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_err()  { echo -e "${RED}[✗]${NC} $1"; ERRORS=$((ERRORS + 1)); }
log_info() { echo -e "${BLUE}[i]${NC} $1"; }
log_step() { echo -e "\n${BLUE}═══ $1 ═══${NC}"; }

# =============================================================================
# Détection du Pi
# =============================================================================

detect_pi_model() {
    if [ -f /proc/device-tree/model ]; then
        PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
    else
        PI_MODEL="Unknown"
    fi

    if echo "$PI_MODEL" | grep -q "Pi 5"; then
        IS_PI5=true
    else
        IS_PI5=false
    fi

    # Détection connexion
    if ip route 2>/dev/null | grep default | grep -q "eth0"; then
        CONNECTION_TYPE="ethernet"
    elif ip route 2>/dev/null | grep default | grep -q "wlan1"; then
        CONNECTION_TYPE="wifi"
    else
        CONNECTION_TYPE="unknown"
    fi

    # Identifier le site
    SITE_NAME="unknown"
    if [ -f "$NEOPRO_ROOT/webapp/configuration.json" ]; then
        SITE_NAME=$(python3 -c "import json; c=json.load(open('$NEOPRO_ROOT/webapp/configuration.json')); print(c.get('siteName', c.get('clubName', 'unknown')))" 2>/dev/null || echo "unknown")
    fi
}

# =============================================================================
# Vérifications préliminaires
# =============================================================================

if [ "$(id -u)" -ne 0 ]; then
    echo "Ce script doit être exécuté en root (sudo)."
    exit 1
fi

if [ ! -d "$NEOPRO_ROOT" ]; then
    echo "Dossier $NEOPRO_ROOT introuvable. Ce script doit être exécuté sur un Pi Neopro."
    exit 1
fi

detect_pi_model

echo "=========================================="
echo "  FIX FLEET Pi — Corrections debug bundle"
echo "=========================================="
echo ""
echo -e "  Site       : ${BLUE}$SITE_NAME${NC}"
echo -e "  Modèle     : ${BLUE}$PI_MODEL${NC}"
echo -e "  Pi 5       : ${BLUE}$IS_PI5${NC}"
echo -e "  Connexion  : ${BLUE}$CONNECTION_TYPE${NC}"
echo ""

# =============================================================================
# 1. Hotspot : TKIP → CCMP
# =============================================================================

log_step "1/7 — Hotspot : TKIP → CCMP"

HOSTAPD_CONF="/etc/hostapd/hostapd.conf"

if [ -f "$HOSTAPD_CONF" ]; then
    if grep -q "wpa_pairwise=TKIP" "$HOSTAPD_CONF"; then
        sed -i 's/wpa_pairwise=TKIP/wpa_pairwise=CCMP/' "$HOSTAPD_CONF"
        log_ok "TKIP remplacé par CCMP dans hostapd.conf"
        CHANGES=$((CHANGES + 1))
        NEEDS_REBOOT=true
    elif grep -q "wpa_pairwise=CCMP" "$HOSTAPD_CONF"; then
        log_ok "Déjà en CCMP (rien à faire)"
    else
        log_warn "wpa_pairwise non trouvé dans hostapd.conf"
    fi

    # Vérification du résultat
    log_info "Config actuelle :"
    grep -E "wpa_pairwise|rsn_pairwise" "$HOSTAPD_CONF" | while read -r line; do
        log_info "  $line"
    done
else
    log_err "hostapd.conf introuvable"
fi

# =============================================================================
# 2. Services systemd manquants
# =============================================================================

log_step "2/7 — Services systemd manquants"

SERVICES_TO_INSTALL=(
    "neopro-hotspot-watchdog"
    "neopro-sync-guardian"
    "neopro-hotspot-optimizer"
)

SERVICE_SOURCE_DIR="$NEOPRO_ROOT/config/systemd"
SCRIPTS_DIR="$NEOPRO_ROOT/scripts"

for svc in "${SERVICES_TO_INSTALL[@]}"; do
    SERVICE_FILE="/etc/systemd/system/${svc}.service"

    if systemctl list-unit-files | grep -q "$svc"; then
        log_ok "$svc déjà installé"
    else
        # Chercher le .service dans config/systemd
        SOURCE_SERVICE=""
        if [ -f "$SERVICE_SOURCE_DIR/${svc}.service" ]; then
            SOURCE_SERVICE="$SERVICE_SOURCE_DIR/${svc}.service"
        fi

        if [ -n "$SOURCE_SERVICE" ]; then
            cp "$SOURCE_SERVICE" "$SERVICE_FILE"
            log_ok "$svc.service installé dans /etc/systemd/system/"
            CHANGES=$((CHANGES + 1))
        else
            log_warn "$svc.service non trouvé dans $SERVICE_SOURCE_DIR — le prochain OTA le fournira"
        fi
    fi
done

# Vérifier que les scripts associés existent et sont exécutables
SCRIPTS_TO_CHECK=(
    "hotspot-watchdog.sh"
    "sync-agent-guardian.sh"
    "hotspot-optimizer.sh"
)

for script in "${SCRIPTS_TO_CHECK[@]}"; do
    if [ -f "$SCRIPTS_DIR/$script" ]; then
        chmod +x "$SCRIPTS_DIR/$script"
        chown pi:pi "$SCRIPTS_DIR/$script"
        log_ok "$script présent et exécutable"
    else
        log_warn "$script absent de $SCRIPTS_DIR — le prochain OTA le fournira"
    fi
done

# Reload et démarrage
systemctl daemon-reload

for svc in "${SERVICES_TO_INSTALL[@]}"; do
    if [ -f "/etc/systemd/system/${svc}.service" ]; then
        # Vérifier que le script référencé existe avant d'activer
        EXEC_START=$(grep "ExecStart=" "/etc/systemd/system/${svc}.service" 2>/dev/null | head -1 | sed 's/ExecStart=//')
        EXEC_SCRIPT=$(echo "$EXEC_START" | awk '{print $1}')

        if [ -f "$EXEC_SCRIPT" ]; then
            systemctl enable "$svc" 2>/dev/null || true
            systemctl start "$svc" 2>/dev/null || true

            if systemctl is-active --quiet "$svc"; then
                log_ok "$svc démarré"
            else
                log_warn "$svc activé mais pas encore démarré (sera actif après reboot)"
            fi
        else
            log_warn "$svc installé mais script $EXEC_SCRIPT manquant — activé pour le prochain OTA"
            systemctl enable "$svc" 2>/dev/null || true
        fi
    fi
done

# Créer le golden snapshot si le guardian est démarré
if systemctl is-active --quiet "neopro-sync-guardian" && [ -f "$SCRIPTS_DIR/sync-agent-guardian.sh" ]; then
    if [ ! -d "$NEOPRO_ROOT/sync-agent-golden" ]; then
        su -c "$SCRIPTS_DIR/sync-agent-guardian.sh create-golden" pi 2>/dev/null && \
            log_ok "Golden snapshot du sync-agent créé" || \
            log_warn "Impossible de créer le golden snapshot"
    else
        log_ok "Golden snapshot déjà existant"
    fi
fi

# =============================================================================
# 3. Permission videos-processing
# =============================================================================

log_step "3/7 — Permission dossier videos-processing"

VPROC_DIR="$NEOPRO_ROOT/videos-processing"

if [ -d "$VPROC_DIR" ]; then
    chown pi:pi "$VPROC_DIR"
    log_ok "$VPROC_DIR existe déjà"
else
    mkdir -p "$VPROC_DIR"
    chown pi:pi "$VPROC_DIR"
    log_ok "$VPROC_DIR créé avec les bonnes permissions"
    CHANGES=$((CHANGES + 1))
fi

# =============================================================================
# 4. Flags GPU du kiosk
# =============================================================================

log_step "4/7 — Vérification flags GPU kiosk"

KIOSK_SCRIPT="$SCRIPTS_DIR/kiosk-watchdog.sh"

if [ -f "$KIOSK_SCRIPT" ]; then
    # Vérifier si des flags GPU problématiques sont présents
    BAD_FLAGS=false

    # Exclure les lignes de commentaires (le nouveau script contient des commentaires
    # documentant l'historique des tentatives GPU avec ces mots-clés)
    # Note: --use-angle est un défaut système Debian (/usr/bin/chromium), pas un flag obsolète de notre code
    if grep -v '^\s*#' "$KIOSK_SCRIPT" | grep -qE "use-gl|swiftshader|disable-gpu-compositing"; then
        log_warn "Flags GPU obsolètes détectés dans kiosk-watchdog.sh"
        BAD_FLAGS=true

        # Lister les flags problématiques (exclure commentaires)
        grep -v '^\s*#' "$KIOSK_SCRIPT" | grep -oE "(--use-gl=[a-z]+|--disable-gpu-compositing|swiftshader)" | while read -r flag; do
            log_warn "  Flag obsolète : $flag"
        done
    fi

    if [ "$BAD_FLAGS" = true ]; then
        log_err "Le kiosk-watchdog.sh contient des flags GPU obsolètes"
        log_info "Le prochain OTA corrigera ce fichier automatiquement"
        log_info "En attendant, le kiosk tourne en mode GPU dégradé"
    else
        log_ok "Pas de flags GPU obsolètes"
    fi

    # Vérifier si le Pi 5 est détecté
    if grep -q "Pi 5\|pi5\|BCM2712" "$KIOSK_SCRIPT"; then
        log_ok "Détection Pi 5 présente dans le script"
    else
        log_warn "Pas de détection Pi 5 dans le kiosk script — version potentiellement ancienne"
    fi
else
    log_err "kiosk-watchdog.sh introuvable"
fi

# Vérifier les flags du process Chromium en cours
CHROMIUM_CMD=$(ps aux 2>/dev/null | grep "[c]hromium" | head -1 || true)
if [ -n "$CHROMIUM_CMD" ]; then
    # Note: --use-angle=gles est injecté par /usr/bin/chromium (wrapper Debian ARM), pas par notre code
    # Ne vérifier que les flags réellement obsolètes de notre kiosk-watchdog.sh
    if echo "$CHROMIUM_CMD" | grep -qE "use-gl|swiftshader|disable-gpu-compositing"; then
        log_warn "Chromium tourne avec des flags GPU obsolètes — reboot nécessaire"
        NEEDS_REBOOT=true
    else
        log_ok "Chromium tourne avec les bons flags GPU"
    fi
else
    log_info "Chromium non détecté (kiosk peut-être arrêté)"
fi

# =============================================================================
# 5. Cache Chromium (erreurs SharedImage / AllocateRingBuffer)
# =============================================================================

log_step "5/7 — Nettoyage cache Chromium"

CHROMIUM_CACHE="/home/pi/.cache/chromium"
CHROMIUM_CONFIG="/home/pi/.config/chromium"

if [ -d "$CHROMIUM_CACHE" ]; then
    CACHE_SIZE=$(du -sh "$CHROMIUM_CACHE" 2>/dev/null | awk '{print $1}')
    rm -rf "$CHROMIUM_CACHE"
    log_ok "Cache Chromium supprimé ($CACHE_SIZE)"
    CHANGES=$((CHANGES + 1))
    NEEDS_REBOOT=true
else
    log_ok "Pas de cache Chromium à nettoyer"
fi

# Nettoyer aussi le GPU shader cache si présent
GPU_CACHE="$CHROMIUM_CONFIG/Default/GPUCache"
if [ -d "$GPU_CACHE" ]; then
    rm -rf "$GPU_CACHE"
    log_ok "GPU shader cache supprimé"
    CHANGES=$((CHANGES + 1))
else
    log_ok "Pas de GPU shader cache"
fi

# =============================================================================
# 6. Flush des buffers bloqués (analytics + sponsors)
# =============================================================================

log_step "6/7 — Flush buffers bloqués"

ANALYTICS_BUFFER="$NEOPRO_ROOT/data/analytics_buffer.json"
SPONSOR_BUFFER="$NEOPRO_ROOT/data/sponsor_impressions.json"
HAS_BUFFERS=false

# Afficher l'état actuel
if [ -f "$ANALYTICS_BUFFER" ]; then
    ANALYTICS_COUNT=$(python3 -c "import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))" 2>/dev/null || echo "?")
    ANALYTICS_SIZE=$(du -h "$ANALYTICS_BUFFER" 2>/dev/null | awk '{print $1}')
    log_info "Buffer analytics : $ANALYTICS_COUNT événements ($ANALYTICS_SIZE)"
    if [ "$ANALYTICS_COUNT" != "?" ] && [ "$ANALYTICS_COUNT" != "0" ]; then
        HAS_BUFFERS=true
    fi
else
    log_info "Pas de buffer analytics"
    ANALYTICS_COUNT="0"
fi

if [ -f "$SPONSOR_BUFFER" ]; then
    SPONSOR_COUNT=$(python3 -c "import json; print(len(json.load(open('$SPONSOR_BUFFER'))))" 2>/dev/null || echo "?")
    SPONSOR_SIZE=$(du -h "$SPONSOR_BUFFER" 2>/dev/null | awk '{print $1}')
    log_info "Buffer sponsors : $SPONSOR_COUNT événements ($SPONSOR_SIZE)"
    if [ "$SPONSOR_COUNT" != "?" ] && [ "$SPONSOR_COUNT" != "0" ]; then
        HAS_BUFFERS=true
    fi
else
    log_info "Pas de buffer sponsors"
    SPONSOR_COUNT="0"
fi

if [ "$HAS_BUFFERS" = true ]; then
    # Redémarrer le sync-agent pour déclencher le flush
    log_info "Redémarrage du sync-agent pour déclencher le flush..."
    systemctl restart neopro-sync-agent

    # Attendre un peu que le flush commence
    sleep 10

    # Vérifier si les buffers ont commencé à diminuer
    if [ -f "$ANALYTICS_BUFFER" ] && [ "$ANALYTICS_COUNT" != "?" ] && [ "$ANALYTICS_COUNT" != "0" ]; then
        NEW_ANALYTICS=$(python3 -c "import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))" 2>/dev/null || echo "?")
        if [ "$NEW_ANALYTICS" != "?" ]; then
            if [ "$NEW_ANALYTICS" -eq 0 ] 2>/dev/null; then
                log_ok "Buffer analytics entièrement vidé"
            elif [ "$NEW_ANALYTICS" -lt "$ANALYTICS_COUNT" ] 2>/dev/null; then
                DIFF=$((ANALYTICS_COUNT - NEW_ANALYTICS))
                log_ok "Flush analytics en cours : $DIFF événements envoyés (reste $NEW_ANALYTICS)"
            else
                log_warn "Buffer analytics pas encore vidé ($NEW_ANALYTICS événements) — le flush continue en arrière-plan"
            fi
        fi
    fi

    if [ -f "$SPONSOR_BUFFER" ] && [ "$SPONSOR_COUNT" != "?" ] && [ "$SPONSOR_COUNT" != "0" ]; then
        NEW_SPONSORS=$(python3 -c "import json; print(len(json.load(open('$SPONSOR_BUFFER'))))" 2>/dev/null || echo "?")
        if [ "$NEW_SPONSORS" != "?" ]; then
            if [ "$NEW_SPONSORS" -eq 0 ] 2>/dev/null; then
                log_ok "Buffer sponsors entièrement vidé"
            elif [ "$NEW_SPONSORS" -lt "$SPONSOR_COUNT" ] 2>/dev/null; then
                DIFF=$((SPONSOR_COUNT - NEW_SPONSORS))
                log_ok "Flush sponsors en cours : $DIFF événements envoyés (reste $NEW_SPONSORS)"
            else
                log_warn "Buffer sponsors pas encore vidé ($NEW_SPONSORS événements) — le flush continue en arrière-plan"
            fi
        fi
    fi
else
    log_ok "Aucun buffer à vider"
fi

# =============================================================================
# 7. Vérification gpu_mem (config boot)
# =============================================================================

log_step "7/7 — Vérification gpu_mem"

if [ "$IS_PI5" = true ]; then
    log_ok "Pi 5 détecté — gpu_mem est dynamique (CMA), pas besoin de configurer"

    # Vérifier quand même qu'il n'y a pas un gpu_mem restrictif dans config.txt
    BOOT_CONFIG=""
    for cfg in /boot/firmware/config.txt /boot/config.txt; do
        if [ -f "$cfg" ]; then
            BOOT_CONFIG="$cfg"
            break
        fi
    done

    if [ -n "$BOOT_CONFIG" ]; then
        CURRENT_GPU_MEM=$(grep "^gpu_mem=" "$BOOT_CONFIG" 2>/dev/null | tail -1 | cut -d= -f2 || echo "")
        if [ -n "$CURRENT_GPU_MEM" ] && [ "$CURRENT_GPU_MEM" -lt 128 ] 2>/dev/null; then
            log_warn "gpu_mem=$CURRENT_GPU_MEM trouvé dans $BOOT_CONFIG — Pi 5 l'ignore mais c'est inutile"
        else
            log_ok "Pas de gpu_mem restrictif dans $BOOT_CONFIG"
        fi
    fi
else
    # Pi 4 ou autre — vérifier gpu_mem
    GPU_MEM=$(vcgencmd get_mem gpu 2>/dev/null | grep -oP '\d+' || echo "?")

    if [ "$GPU_MEM" = "?" ]; then
        log_warn "Impossible de lire gpu_mem"
    elif [ "$GPU_MEM" -lt 128 ] 2>/dev/null; then
        log_err "gpu_mem=$GPU_MEM trop faible (minimum 128M, recommandé 256M)"

        BOOT_CONFIG=""
        for cfg in /boot/firmware/config.txt /boot/config.txt; do
            if [ -f "$cfg" ]; then
                BOOT_CONFIG="$cfg"
                break
            fi
        done

        if [ -n "$BOOT_CONFIG" ]; then
            if grep -q "^gpu_mem=" "$BOOT_CONFIG"; then
                sed -i 's/^gpu_mem=.*/gpu_mem=256/' "$BOOT_CONFIG"
            else
                echo "gpu_mem=256" >> "$BOOT_CONFIG"
            fi
            log_ok "gpu_mem=256 configuré dans $BOOT_CONFIG"
            CHANGES=$((CHANGES + 1))
            NEEDS_REBOOT=true
        fi
    else
        log_ok "gpu_mem=$GPU_MEM (OK)"
    fi
fi

# =============================================================================
# Résumé
# =============================================================================

echo ""
echo "=========================================="
echo "  RÉSUMÉ — $SITE_NAME"
echo "=========================================="
echo ""
echo -e "  Pi               : ${BLUE}$PI_MODEL${NC}"
echo -e "  Connexion        : ${BLUE}$CONNECTION_TYPE${NC}"
echo -e "  Corrections      : ${GREEN}$CHANGES${NC}"
echo -e "  Erreurs          : ${RED}$ERRORS${NC}"

if [ "$NEEDS_REBOOT" = true ]; then
    echo ""
    echo -e "  ${YELLOW}⚠ Un reboot est nécessaire pour appliquer :${NC}"
    echo -e "  ${YELLOW}  - Changement TKIP → CCMP sur le hotspot${NC}"
    echo -e "  ${YELLOW}  - Nettoyage cache GPU Chromium${NC}"
    [ "$IS_PI5" = false ] && echo -e "  ${YELLOW}  - Configuration gpu_mem${NC}"
    echo ""
    read -p "  Redémarrer maintenant ? (o/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        echo ""
        log_info "Redémarrage dans 3 secondes..."
        sleep 3
        reboot
    else
        echo ""
        log_info "Redémarrage reporté. Lancer 'sudo reboot' quand prêt."
    fi
else
    echo ""
    log_ok "Aucun reboot nécessaire"
fi

echo ""
echo "=========================================="
echo "  Vérifications post-reboot"
echo "=========================================="
echo ""
echo "  # Vérifier que CCMP est actif"
echo "  grep wpa_pairwise /etc/hostapd/hostapd.conf"
echo ""
echo "  # Vérifier les 3 nouveaux services"
echo "  systemctl status neopro-hotspot-watchdog neopro-sync-guardian neopro-hotspot-optimizer"
echo ""
echo "  # Vérifier les flags GPU (ne doit PAS contenir use-gl/swiftshader — use-angle=gles est normal, c'est un défaut Debian)"
echo "  ps aux | grep chromium | grep -v grep"
echo ""
echo "  # Vérifier que les buffers se vident"
echo "  python3 -c \"import json; f=open('$NEOPRO_ROOT/data/analytics_buffer.json'); print('analytics:', len(json.load(f)))\""
echo "  python3 -c \"import json; f=open('$NEOPRO_ROOT/data/sponsor_impressions.json'); print('sponsors:', len(json.load(f)))\""
echo ""
