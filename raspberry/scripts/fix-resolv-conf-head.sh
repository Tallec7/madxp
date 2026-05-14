#!/usr/bin/env bash
#
# ADR-126 — Pin /etc/resolv.conf.head pour neutraliser le DNS hijack si dhcpcd
# vide /etc/resolv.conf (incident NLF 2026-05-14).
#
# Idempotent : exécutable plusieurs fois sans effet de bord. Conçu pour être
# appelé par :
#   - raspberry/install.sh (install initiale, déjà couvert)
#   - OTA post-install hook (rattrape la flotte existante)
#   - Admin SSH manuel : `sudo /home/pi/neopro/scripts/fix-resolv-conf-head.sh`
#
# Exit codes :
#   0 = OK (créé ou déjà conforme)
#   1 = pas root, ne peut pas écrire /etc

set -euo pipefail

RESOLV_HEAD="/etc/resolv.conf.head"
REQUIRED_NAMESERVERS=("1.1.1.1" "8.8.8.8")

if [ "$(id -u)" -ne 0 ]; then
    echo "fix-resolv-conf-head: requires root (re-run with sudo)" >&2
    exit 1
fi

# Si le fichier existe ET contient déjà nos nameservers, ne rien faire.
if [ -f "$RESOLV_HEAD" ]; then
    all_present=true
    for ns in "${REQUIRED_NAMESERVERS[@]}"; do
        if ! grep -qE "^nameserver[[:space:]]+${ns}\b" "$RESOLV_HEAD"; then
            all_present=false
            break
        fi
    done
    if $all_present; then
        echo "fix-resolv-conf-head: ${RESOLV_HEAD} already conforming, nothing to do"
        exit 0
    fi
fi

cat > "$RESOLV_HEAD" <<'EOF'
# Géré par install.sh / fix-resolv-conf-head.sh (ADR-126)
# Filet de sécurité DNS : empêche le hijack dnsmasq local quand le bail
# dhcpcd disparaît. NE PAS supprimer sans ADR de remplacement.
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF
chmod 644 "$RESOLV_HEAD"

# Déclencher la régénération immédiate de /etc/resolv.conf via dhcpcd
# (le hook 20-resolv.conf lit resolv.conf.head et préfixe ses entrées).
if systemctl is-active --quiet dhcpcd 2>/dev/null; then
    dhcpcd --rebind 2>/dev/null || true
fi

echo "fix-resolv-conf-head: ${RESOLV_HEAD} written"
exit 0
