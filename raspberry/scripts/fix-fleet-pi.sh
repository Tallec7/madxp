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
#   2. Installe les packages recommandés manquants (unclutter-xfixes, x11-utils, edid-decode)
#   3. Corrige le masquage du curseur TV (remplacement unclutter → unclutter-xfixes + autostart)
#   4. Installe les 3 services systemd manquants (watchdog, guardian, optimizer)
#   5. Crée le dossier videos-processing (permission denied)
#   6. Vérifie et corrige les flags GPU du kiosk
#   7. Vide le cache Chromium (erreurs SharedImage / AllocateRingBuffer)
#   8. Force le flush des buffers bloqués (analytics + sponsors)
#   9. Vérifie gpu_mem dans la config boot (Pi 5 : dynamique CMA)
#  10. Vérifie hdmi_force_hotplug sur les 2 ports HDMI (E-23)
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
# 2. Packages recommandés manquants
# =============================================================================

log_step "2/10 — Packages recommandés"

RECOMMENDED_PACKAGES=(
    "unclutter-xfixes"
    "x11-utils"
    "edid-decode"
    "feh"
)

for pkg in "${RECOMMENDED_PACKAGES[@]}"; do
    if dpkg -l "$pkg" 2>/dev/null | grep -q "^ii"; then
        log_ok "$pkg déjà installé"
    else
        log_info "Installation de $pkg..."
        if apt-get install -y "$pkg" >/dev/null 2>&1; then
            log_ok "$pkg installé"
            CHANGES=$((CHANGES + 1))
        else
            log_warn "$pkg : installation échouée (pas critique)"
        fi
    fi
done

# Supprimer l'ancien paquet 'unclutter' s'il est installé (remplacé par unclutter-xfixes)
if dpkg -l "unclutter" 2>/dev/null | grep -q "^ii"; then
    log_info "Suppression de l'ancien paquet 'unclutter' (remplacé par unclutter-xfixes)..."
    apt-get remove -y unclutter >/dev/null 2>&1 && \
        log_ok "Ancien paquet 'unclutter' supprimé" || \
        log_warn "Impossible de supprimer 'unclutter'"
    CHANGES=$((CHANGES + 1))
fi

# =============================================================================
# 3. Masquage curseur TV (unclutter-xfixes + autostart LXDE)
# =============================================================================

log_step "3/10 — Masquage curseur TV"

AUTOSTART_FILE="/home/pi/.config/lxsession/LXDE-pi/autostart"
AUTOSTART_DIR=$(dirname "$AUTOSTART_FILE")

# Créer le répertoire si absent
if [ ! -d "$AUTOSTART_DIR" ]; then
    mkdir -p "$AUTOSTART_DIR"
    chown -R pi:pi /home/pi/.config
    log_ok "Répertoire autostart LXDE créé"
fi

# Vérifier si @unclutter est dans l'autostart
if [ -f "$AUTOSTART_FILE" ] && grep -q "@unclutter" "$AUTOSTART_FILE"; then
    log_ok "@unclutter déjà dans l'autostart LXDE"
else
    if [ ! -f "$AUTOSTART_FILE" ]; then
        # Créer le fichier autostart complet
        cat > "$AUTOSTART_FILE" << 'AUTOSTART_EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0 -root
AUTOSTART_EOF
        log_ok "Fichier autostart LXDE créé avec @unclutter"
    else
        # Ajouter @unclutter au fichier existant
        echo '@unclutter -idle 0 -root' >> "$AUTOSTART_FILE"
        log_ok "@unclutter ajouté à l'autostart LXDE"
    fi
    chown -R pi:pi /home/pi/.config
    CHANGES=$((CHANGES + 1))
    NEEDS_REBOOT=true
fi

# =============================================================================
# 4. Services systemd manquants
# =============================================================================

log_step "4/10 — Services systemd manquants"

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

log_step "5/10 — Permission dossier videos-processing"

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

log_step "6/10 — Vérification flags GPU kiosk"

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

log_step "7/10 — Nettoyage cache Chromium"

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

log_step "8/10 — Flush buffers bloqués"

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
    log_warn "Stale sponsor_impressions.json found (pre-v3.67 remnant) : $SPONSOR_COUNT events ($SPONSOR_SIZE) — removing"
    rm -f "$SPONSOR_BUFFER"
    SPONSOR_COUNT="0"
else
    log_info "Pas de buffer sponsors (OK — consolidated pipeline)"
    SPONSOR_COUNT="0"
fi

# Cleanup orphan sponsor-impressions.js (deleted from repo in v3.67 but rsync sans --delete)
ORPHAN_SPONSOR_JS="$NEOPRO_ROOT/sync-agent/src/sponsor-impressions.js"
if [ -f "$ORPHAN_SPONSOR_JS" ]; then
    log_warn "Orphan sponsor-impressions.js found — removing"
    rm -f "$ORPHAN_SPONSOR_JS"
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

log_step "9/10 — Vérification gpu_mem"

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
# 8. Vérification hdmi_force_hotplug (E-23 Résilience HDMI)
# =============================================================================

log_step "10/10 — Vérification hdmi_force_hotplug"

BOOT_CONFIG_HDMI=""
for cfg in /boot/firmware/config.txt /boot/config.txt; do
    if [ -f "$cfg" ]; then
        BOOT_CONFIG_HDMI="$cfg"
        break
    fi
done

if [ -n "$BOOT_CONFIG_HDMI" ]; then
    for port in 0 1; do
        key="hdmi_force_hotplug:${port}"
        if grep -q "^${key}=1" "$BOOT_CONFIG_HDMI" 2>/dev/null; then
            log_ok "${key}=1 déjà configuré"
        elif grep -q "^${key}=" "$BOOT_CONFIG_HDMI" 2>/dev/null; then
            sed -i "s/^${key}=.*/${key}=1/" "$BOOT_CONFIG_HDMI"
            log_ok "${key} mis à jour à 1"
            CHANGES=$((CHANGES + 1))
            NEEDS_REBOOT=true
        else
            echo "" >> "$BOOT_CONFIG_HDMI"
            echo "# Force HDMI port ${port} hotplug (Neopro E-23)" >> "$BOOT_CONFIG_HDMI"
            echo "${key}=1" >> "$BOOT_CONFIG_HDMI"
            log_ok "${key}=1 ajouté à $BOOT_CONFIG_HDMI"
            CHANGES=$((CHANGES + 1))
            NEEDS_REBOOT=true
        fi
    done
else
    log_warn "Fichier config.txt non trouvé"
fi

# =============================================================================
# 9. Boot splash — écran noir propre (quiet/splash dans cmdline.txt)
# =============================================================================

log_step "11/11 — Configuration boot splash Neopro"

# 9a. cmdline.txt — ajouter les paramètres quiet boot
CMDLINE_FILE=""
for cfg in /boot/firmware/cmdline.txt /boot/cmdline.txt; do
    if [ -f "$cfg" ]; then
        CMDLINE_FILE="$cfg"
        break
    fi
done

if [ -n "$CMDLINE_FILE" ]; then
    current_cmdline=$(cat "$CMDLINE_FILE")
    cmdline_modified=false
    for param in quiet splash logo.nologo "vt.global_cursor_default=0" loglevel=1; do
        if ! echo "$current_cmdline" | grep -qw "$param"; then
            current_cmdline="$current_cmdline $param"
            cmdline_modified=true
        fi
    done
    if $cmdline_modified; then
        echo "$current_cmdline" > "$CMDLINE_FILE"
        log_ok "Paramètres boot splash ajoutés à $CMDLINE_FILE"
        CHANGES=$((CHANGES + 1))
        NEEDS_REBOOT=true
    else
        log_ok "Boot splash cmdline.txt déjà configuré"
    fi
else
    log_warn "cmdline.txt non trouvé"
fi

# 9b. config.txt — disable_splash=1
BOOT_CONFIG_SPLASH=""
for cfg in /boot/firmware/config.txt /boot/config.txt; do
    if [ -f "$cfg" ]; then
        BOOT_CONFIG_SPLASH="$cfg"
        break
    fi
done

if [ -n "$BOOT_CONFIG_SPLASH" ]; then
    if ! grep -q "^disable_splash=1" "$BOOT_CONFIG_SPLASH" 2>/dev/null; then
        echo "" >> "$BOOT_CONFIG_SPLASH"
        echo "# Désactiver le rainbow splash du firmware (Neopro boot)" >> "$BOOT_CONFIG_SPLASH"
        echo "disable_splash=1" >> "$BOOT_CONFIG_SPLASH"
        log_ok "disable_splash=1 ajouté à $BOOT_CONFIG_SPLASH"
        CHANGES=$((CHANGES + 1))
        NEEDS_REBOOT=true
    else
        log_ok "disable_splash=1 déjà configuré"
    fi
fi

# 9c. Plymouth splash — remplacer le logo Raspberry par le vrai logo NEOPRO
PLYMOUTH_SPLASH="/usr/share/plymouth/themes/pix/splash.png"
NEOPRO_LOGO="$NEOPRO_ROOT/webapp/neopro-logo-white.png"
if [ -f "$PLYMOUTH_SPLASH" ]; then
    # Vérifier si c'est déjà notre splash (1920x1080) vs le splash par défaut (1024x768)
    SPLASH_SIZE=$(python3 -c "from PIL import Image; img=Image.open('$PLYMOUTH_SPLASH'); print(f'{img.width}x{img.height}')" 2>/dev/null || echo "unknown")
    if [ "$SPLASH_SIZE" != "1920x1080" ]; then
        # Générer le splash NEOPRO avec le vrai logo (neopro-logo-white.png)
        if python3 -c "from PIL import Image" 2>/dev/null && [ -f "$NEOPRO_LOGO" ]; then
            python3 - "$NEOPRO_LOGO" <<'PYEOF'
import sys
from PIL import Image, ImageDraw, ImageFont

logo_path = sys.argv[1]
img = Image.new("RGBA", (1920, 1080), (10, 10, 10, 255))

# Load and scale real NEOPRO logo
logo = Image.open(logo_path).convert("RGBA")
target_width = 760
scale = target_width / logo.width
target_height = int(logo.height * scale)
logo_resized = logo.resize((target_width, target_height), Image.LANCZOS)

# Center logo (slightly above center)
x = (1920 - target_width) // 2
y = (1080 - target_height) // 2 - 40
img.paste(logo_resized, (x, y), logo_resized)

# "Chargement..." subtitle
draw = ImageDraw.Draw(img)
try:
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
except Exception:
    font_small = ImageFont.load_default()
sub = "Chargement..."
bbox = draw.textbbox((0, 0), sub, font=font_small)
tw = bbox[2] - bbox[0]
draw.text(((1920 - tw) / 2, y + target_height + 60), sub, fill=(180, 180, 180, 180), font=font_small)

img.save("/tmp/neopro-plymouth-splash.png")
PYEOF
            if [ -f /tmp/neopro-plymouth-splash.png ]; then
                cp "$PLYMOUTH_SPLASH" "${PLYMOUTH_SPLASH}.bak" 2>/dev/null || true
                cp /tmp/neopro-plymouth-splash.png "$PLYMOUTH_SPLASH"
                # Regénérer l'initramfs pour inclure le nouveau splash
                update-initramfs -u >/dev/null 2>&1 || true
                rm -f /tmp/neopro-plymouth-splash.png
                log_ok "Plymouth splash remplacé par NEOPRO (vrai logo, 1920x1080)"
                CHANGES=$((CHANGES + 1))
                NEEDS_REBOOT=true
            else
                log_warn "Échec génération splash NEOPRO (Python)"
            fi
        else
            log_warn "Python Pillow ou logo NEOPRO non disponible — splash Plymouth non remplacé"
        fi
    else
        log_ok "Plymouth splash NEOPRO déjà en place"
    fi
else
    log_warn "Plymouth splash non trouvé ($PLYMOUTH_SPLASH)"
fi

# 9d. Kiosk boot splash — image overlay affichée par feh pendant le démarrage de Chromium
# Couvre le gap entre Plymouth et Chromium fullscreen (2-5s où la fenêtre apparaît avec décorations)
KIOSK_SPLASH="$NEOPRO_ROOT/data/boot-splash.png"
if [ ! -f "$KIOSK_SPLASH" ] || [ "$KIOSK_SPLASH" -ot "$NEOPRO_LOGO" ] 2>/dev/null; then
    if python3 -c "from PIL import Image" 2>/dev/null && [ -f "$NEOPRO_LOGO" ]; then
        mkdir -p "$(dirname "$KIOSK_SPLASH")"
        python3 - "$NEOPRO_LOGO" "$KIOSK_SPLASH" <<'PYEOF'
import sys
from PIL import Image, ImageDraw, ImageFont

logo_path = sys.argv[1]
out_path = sys.argv[2]
img = Image.new("RGBA", (1920, 1080), (10, 10, 10, 255))

# Load and scale real NEOPRO logo
logo = Image.open(logo_path).convert("RGBA")
target_width = 760
scale = target_width / logo.width
target_height = int(logo.height * scale)
logo_resized = logo.resize((target_width, target_height), Image.LANCZOS)

# Center logo (slightly above center)
x = (1920 - target_width) // 2
y = (1080 - target_height) // 2 - 40
img.paste(logo_resized, (x, y), logo_resized)

# "Chargement..." subtitle
draw = ImageDraw.Draw(img)
try:
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
except Exception:
    font_small = ImageFont.load_default()
sub = "Chargement..."
bbox = draw.textbbox((0, 0), sub, font=font_small)
tw = bbox[2] - bbox[0]
draw.text(((1920 - tw) / 2, y + target_height + 60), sub, fill=(180, 180, 180, 180), font=font_small)

img.save(out_path)
PYEOF
        if [ -f "$KIOSK_SPLASH" ]; then
            chown pi:pi "$KIOSK_SPLASH"
            log_ok "Kiosk boot splash généré: $KIOSK_SPLASH"
            CHANGES=$((CHANGES + 1))
        else
            log_warn "Échec génération kiosk boot splash"
        fi
    else
        log_warn "Python Pillow ou logo NEOPRO non disponible — kiosk boot splash non généré"
    fi
else
    log_ok "Kiosk boot splash déjà à jour"
fi

# 9e. Desktop noir — empêcher le fond d'écran Pi de s'afficher entre Plymouth et Chromium
# IMPORTANT: pcmanfm-pi wrapper lance `pcmanfm --desktop` SANS --profile → utilise le profil "default"
# On doit fixer TOUS les profils (default + LXDE-pi) ET les configs système (/etc/xdg)
LXDE_AUTOSTART="/home/pi/.config/lxsession/LXDE-pi/autostart"

DESKTOP_BLACK_CONF='[*]
wallpaper_mode=color
wallpaper_common=1
desktop_bg=#0a0a0a
desktop_fg=#0a0a0a
desktop_shadow=#0a0a0a
show_documents=0
show_trash=0
show_mounts=0'

# Tous les emplacements de config pcmanfm à fixer (user + system, default + LXDE-pi, monitor 0 + 1)
PCMANFM_CONFIGS=(
    "/home/pi/.config/pcmanfm/default/desktop-items-0.conf"
    "/home/pi/.config/pcmanfm/default/desktop-items-1.conf"
    "/home/pi/.config/pcmanfm/LXDE-pi/desktop-items-0.conf"
    "/home/pi/.config/pcmanfm/LXDE-pi/desktop-items-1.conf"
    "/etc/xdg/pcmanfm/default/desktop-items-0.conf"
    "/etc/xdg/pcmanfm/default/desktop-items-1.conf"
)

for PCMANFM_CONF in "${PCMANFM_CONFIGS[@]}"; do
    if [ ! -f "$PCMANFM_CONF" ] || ! grep -q "desktop_bg=#0a0a0a" "$PCMANFM_CONF" 2>/dev/null; then
        mkdir -p "$(dirname "$PCMANFM_CONF")"
        echo "$DESKTOP_BLACK_CONF" > "$PCMANFM_CONF"
        log_ok "Desktop pcmanfm configuré en fond noir: $PCMANFM_CONF"
        CHANGES=$((CHANGES + 1))
    fi
done

# Ajouter xsetroot -solid black et retirer lxpanel de l'autostart
if [ -f "$LXDE_AUTOSTART" ]; then
    if ! grep -q "xsetroot -solid black" "$LXDE_AUTOSTART" 2>/dev/null || grep -q "@lxpanel" "$LXDE_AUTOSTART" 2>/dev/null; then
        cat > "$LXDE_AUTOSTART" << 'AUTOEOF'
@xsetroot -solid black
@pcmanfm --desktop --profile LXDE-pi
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
AUTOEOF
        log_ok "LXDE autostart corrigé (fond noir, pas de barre de tâches)"
        CHANGES=$((CHANGES + 1))
    else
        log_ok "LXDE autostart déjà configuré"
    fi
fi
# Tuer lxpanel si elle tourne encore (effet immédiat sans reboot)
if pgrep -x lxpanel >/dev/null 2>&1; then
    pkill -x lxpanel 2>/dev/null || true
    log_ok "lxpanel tuée (barre de tâches inutile en mode kiosk)"
    CHANGES=$((CHANGES + 1))
fi

# =============================================================================
# 10. Désactivation des services obsolètes / inutiles
# =============================================================================
# neopro-vlc-kiosk : ancien POC HLS/VLC jamais retiré — crash-loop qui empêche
#                     systemd-analyze de finir et consomme CPU/logs
# neopro-ffmpeg-stream : dépendance de vlc-kiosk, même POC
# neopro-playlist-manager : ancien POC — MODULE_NOT_FOUND crash-loop (score-bridge.js absent)
# neopro-score-bridge : ancien POC — MODULE_NOT_FOUND crash-loop (playlist-manager.js absent)
# cups : impression — jamais utilisé sur un Pi kiosk
# ModemManager : gestion modem 3G/4G — pas de modem sur les Pi
# cloud-init : provisioning cloud — inutile sur Pi physique

log_step "12/13 — Désactivation services obsolètes"

OBSOLETE_SERVICES=(
    "neopro-vlc-kiosk"
    "neopro-ffmpeg-stream"
    "neopro-playlist-manager"
    "neopro-score-bridge"
)

USELESS_SERVICES=(
    "cups"
    "ModemManager"
    "cloud-init-main"
)

NEEDS_DAEMON_RELOAD=false

for svc in "${OBSOLETE_SERVICES[@]}"; do
    # Check both is-enabled AND is-active: manually installed services
    # (file copied to /etc/systemd/system/ without `systemctl enable`)
    # return "indirect" or odd states from is-enabled but still run via Restart=always
    if systemctl is-enabled "$svc" &>/dev/null 2>&1 || systemctl is-active "$svc" &>/dev/null 2>&1; then
        systemctl stop "$svc" 2>/dev/null || true
        systemctl disable "$svc" 2>/dev/null || true
        rm -f "/etc/systemd/system/${svc}.service" 2>/dev/null || true
        NEEDS_DAEMON_RELOAD=true
        log_ok "Service obsolète désactivé + unit supprimé: $svc"
        CHANGES=$((CHANGES + 1))
    else
        log_ok "Service obsolète déjà désactivé: $svc"
    fi
done

for svc in "${USELESS_SERVICES[@]}"; do
    if systemctl is-enabled "$svc" &>/dev/null 2>&1 || systemctl is-active "$svc" &>/dev/null 2>&1; then
        systemctl stop "$svc" 2>/dev/null || true
        systemctl disable "$svc" 2>/dev/null || true
        log_ok "Service inutile désactivé: $svc"
        CHANGES=$((CHANGES + 1))
    else
        log_ok "Service inutile déjà désactivé: $svc"
    fi
done

if [ "$NEEDS_DAEMON_RELOAD" = true ]; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed 2>/dev/null || true
fi

# =============================================================================
# 11/10 — Captive portal iptables (Android HTTPS connectivity checks)
# =============================================================================

log_step "11/10 — Captive portal iptables (Android)"

# Android fait ses checks de connectivité en HTTPS (port 443).
# Sans redirection iptables, le Pi ne répond pas → Android bascule sur la 4G.
# Avec la redirection, Android détecte un captive portal et reste sur le WiFi.
IPTABLES_SCRIPT="$NEOPRO_ROOT/scripts/setup-captive-portal-iptables.sh"
if [ -x "$IPTABLES_SCRIPT" ]; then
    if AP_INTERFACE=wlan0 "$IPTABLES_SCRIPT"; then
        log_ok "Captive portal iptables configuré via script"
        CHANGES=$((CHANGES + 1))
    else
        log_err "Échec du script setup-captive-portal-iptables.sh"
    fi
else
    # Fallback inline si le script n'est pas encore déployé
    log_info "Script iptables non trouvé, application inline..."

    # Nettoyage (idempotent)
    while iptables -t nat -D PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null; do :; done
    while iptables -t nat -D PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null; do :; done
    while iptables -t nat -D POSTROUTING -s 192.168.4.0/24 -o wlan0 -j MASQUERADE 2>/dev/null; do :; done

    # Installation
    iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null || true
    iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null || true
    iptables -t nat -A POSTROUTING -s 192.168.4.0/24 -o wlan0 -j MASQUERADE 2>/dev/null || true

    if iptables -t nat -C PREROUTING -i wlan0 -p tcp --dport 443 -j DNAT --to-destination 192.168.4.1:80 2>/dev/null; then
        log_ok "Captive portal iptables configuré (inline)"
        CHANGES=$((CHANGES + 1))
    else
        log_err "Échec de la configuration iptables captive portal"
    fi
fi

# =============================================================================
# 13/13 — Pi 5 Active Cooler: activer dtparam=cooling_fan dans config.txt
# =============================================================================
# Sans dtparam=cooling_fan, le device-tree marque le noeud cooling_fan comme
# "disabled" → le kernel ne charge pas le driver pwm-fan → pas de
# /sys/class/thermal/cooling_device0 → getFanStatus() retourne present:false
# → aucune alerte fan_failure possible + fan tourne à 100% en permanence

log_step "13/13 — Pi 5 Active Cooler fan (dtparam=cooling_fan)"

if [ "$IS_PI5" = true ]; then
    BOOT_CONFIG_FAN=""
    for cfg in /boot/firmware/config.txt /boot/config.txt; do
        if [ -f "$cfg" ]; then
            BOOT_CONFIG_FAN="$cfg"
            break
        fi
    done

    if [ -n "$BOOT_CONFIG_FAN" ]; then
        if grep -q "^dtparam=cooling_fan" "$BOOT_CONFIG_FAN" 2>/dev/null; then
            log_ok "dtparam=cooling_fan déjà configuré dans $BOOT_CONFIG_FAN"
        else
            echo "" >> "$BOOT_CONFIG_FAN"
            echo "# Active Cooler Pi 5 — contrôle PWM ventilateur (surveillance Neopro)" >> "$BOOT_CONFIG_FAN"
            echo "dtparam=cooling_fan" >> "$BOOT_CONFIG_FAN"
            log_ok "dtparam=cooling_fan ajouté à $BOOT_CONFIG_FAN"
            CHANGES=$((CHANGES + 1))
            NEEDS_REBOOT=true
        fi
    else
        log_warn "config.txt non trouvé — dtparam=cooling_fan non configuré"
    fi
else
    log_ok "Pas un Pi 5 — cooling_fan non applicable"
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
    echo -e "  ${YELLOW}  - Configuration hdmi_force_hotplug${NC}"
    echo -e "  ${YELLOW}  - Boot splash (écran noir propre + Plymouth NEOPRO)${NC}"
    [ "$IS_PI5" = true ] && echo -e "  ${YELLOW}  - Activation Active Cooler Pi 5 (dtparam=cooling_fan)${NC}"
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
