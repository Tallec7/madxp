#!/bin/bash
# =============================================================================
# FIX NLF Pi — Script tout-en-un Phase 1
# =============================================================================
#
# Ce script corrige tous les problèmes identifiés sur le Pi NLF (v3.7.13.1)
# à partir de l'analyse du debug bundle du 2026-02-08.
#
# Usage :
#   scp raspberry/scripts/fix-nlf-pi.sh pi@neopro.local:/tmp/
#   ssh pi@neopro.local 'chmod +x /tmp/fix-nlf-pi.sh && sudo /tmp/fix-nlf-pi.sh'
#
# Ce que fait ce script :
#   1. Corrige TKIP → CCMP dans hostapd.conf (éjections téléphones)
#   2. Installe les 3 services systemd manquants (watchdog, guardian, optimizer)
#   3. Crée le dossier videos-processing (permission denied)
#   4. Vérifie et corrige les flags GPU du kiosk
#   5. Vide le cache Chromium (erreurs SharedImage)
#   6. Force le flush des analytics bloquées
#
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

echo "=========================================="
echo "  FIX NLF Pi — Phase 1 (debug bundle)"
echo "=========================================="
echo ""

# =============================================================================
# 1. Hotspot : TKIP → CCMP
# =============================================================================

log_step "1/6 — Hotspot : TKIP → CCMP"

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

log_step "2/6 — Services systemd manquants"

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
        # Chercher le .service dans config/systemd ou dans le répertoire courant du script
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

log_step "3/6 — Permission dossier videos-processing"

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

log_step "4/6 — Vérification flags GPU kiosk"

KIOSK_SCRIPT="$SCRIPTS_DIR/kiosk-watchdog.sh"

if [ -f "$KIOSK_SCRIPT" ]; then
    # Vérifier si des flags GPU problématiques sont présents
    BAD_FLAGS=false

    if grep -qE "use-gl|use-angle|swiftshader" "$KIOSK_SCRIPT"; then
        log_warn "Flags GPU obsolètes détectés dans kiosk-watchdog.sh"
        BAD_FLAGS=true

        # Lister les flags problématiques
        grep -oE "(--use-gl=[a-z]+|--use-angle=[a-z]+|--disable-gpu-compositing|swiftshader)" "$KIOSK_SCRIPT" | while read -r flag; do
            log_warn "  Flag obsolète : $flag"
        done
    fi

    if grep -qE "disable-gpu-compositing" "$KIOSK_SCRIPT"; then
        BAD_FLAGS=true
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
    if echo "$CHROMIUM_CMD" | grep -qE "use-gl|use-angle|swiftshader|disable-gpu-compositing"; then
        log_warn "Chromium tourne avec des flags GPU obsolètes — reboot nécessaire"
        NEEDS_REBOOT=true
    else
        log_ok "Chromium tourne avec les bons flags GPU"
    fi
else
    log_info "Chromium non détecté (kiosk peut-être arrêté)"
fi

# =============================================================================
# 5. Cache Chromium (erreurs SharedImage)
# =============================================================================

log_step "5/6 — Nettoyage cache Chromium"

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
# 6. Flush des analytics bloquées
# =============================================================================

log_step "6/6 — Flush analytics bloquées"

ANALYTICS_BUFFER="$NEOPRO_ROOT/data/analytics_buffer.json"
SPONSOR_BUFFER="$NEOPRO_ROOT/data/sponsor_impressions.json"

# Afficher l'état actuel
if [ -f "$ANALYTICS_BUFFER" ]; then
    ANALYTICS_COUNT=$(python3 -c "import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))" 2>/dev/null || echo "?")
    ANALYTICS_SIZE=$(du -h "$ANALYTICS_BUFFER" 2>/dev/null | awk '{print $1}')
    log_info "Buffer analytics : $ANALYTICS_COUNT événements ($ANALYTICS_SIZE)"
else
    log_info "Pas de buffer analytics"
fi

if [ -f "$SPONSOR_BUFFER" ]; then
    SPONSOR_COUNT=$(python3 -c "import json; print(len(json.load(open('$SPONSOR_BUFFER'))))" 2>/dev/null || echo "?")
    SPONSOR_SIZE=$(du -h "$SPONSOR_BUFFER" 2>/dev/null | awk '{print $1}')
    log_info "Buffer sponsors : $SPONSOR_COUNT événements ($SPONSOR_SIZE)"
else
    log_info "Pas de buffer sponsors"
fi

# Redémarrer le sync-agent pour déclencher le flush
log_info "Redémarrage du sync-agent pour déclencher le flush..."
systemctl restart neopro-sync-agent

# Attendre un peu que le flush commence
sleep 10

# Vérifier si le buffer a commencé à diminuer
if [ -f "$ANALYTICS_BUFFER" ]; then
    NEW_COUNT=$(python3 -c "import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))" 2>/dev/null || echo "?")
    if [ "$NEW_COUNT" != "?" ] && [ "$ANALYTICS_COUNT" != "?" ]; then
        if [ "$NEW_COUNT" -lt "$ANALYTICS_COUNT" ] 2>/dev/null; then
            DIFF=$((ANALYTICS_COUNT - NEW_COUNT))
            log_ok "Flush en cours : $DIFF événements envoyés (reste $NEW_COUNT)"
        elif [ "$NEW_COUNT" -eq 0 ] 2>/dev/null; then
            log_ok "Buffer analytics entièrement vidé"
        else
            log_warn "Buffer pas encore vidé ($NEW_COUNT événements) — le flush continue en arrière-plan"
            log_info "Vérifier dans 2 min : python3 -c \"import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))\""
        fi
    fi
fi

# =============================================================================
# Résumé
# =============================================================================

echo ""
echo "=========================================="
echo "  RÉSUMÉ"
echo "=========================================="
echo ""
echo -e "  Corrections appliquées : ${GREEN}$CHANGES${NC}"
echo -e "  Erreurs rencontrées    : ${RED}$ERRORS${NC}"

if [ "$NEEDS_REBOOT" = true ]; then
    echo ""
    echo -e "  ${YELLOW}⚠ Un reboot est nécessaire pour appliquer :${NC}"
    echo -e "  ${YELLOW}  - Changement TKIP → CCMP sur le hotspot${NC}"
    echo -e "  ${YELLOW}  - Nettoyage cache GPU Chromium${NC}"
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
echo "  # Vérifier les flags GPU (ne doit PAS contenir use-gl/swiftshader)"
echo "  ps aux | grep chromium | grep -v grep"
echo ""
echo "  # Vérifier que le buffer analytics se vide"
echo "  python3 -c \"import json; print(len(json.load(open('$ANALYTICS_BUFFER'))))\""
echo ""
