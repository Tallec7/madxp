#!/bin/bash

################################################################################
# Backup automatique Neopro sur Raspberry Pi
#
# Ce script effectue une sauvegarde locale automatique de :
# - configuration.json
# - sync-agent config (.env et site.conf)
# - Liste des vidéos (pas les fichiers eux-mêmes pour économiser l'espace)
#
# Rotation : conserve les 7 derniers backups
#
# Usage: sudo /home/pi/neopro/scripts/auto-backup.sh
################################################################################

set -e

# Configuration
NEOPRO_DIR="${NEOPRO_DIR:-/home/pi/neopro}"
BACKUP_ROOT="${BACKUP_DIR:-/home/pi/neopro-backups}"
BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DATE=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/backup.log"
RETENTION_DAYS=7

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✓${NC} $1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ✗${NC} $1" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠${NC} $1" | tee -a "${LOG_FILE}"
}

################################################################################
# Initialisation
################################################################################

# Créer le répertoire de backups
mkdir -p "${BACKUP_ROOT}"
mkdir -p "${BACKUP_DIR}"

log "=== Démarrage du backup automatique ==="
log "Répertoire de backup : ${BACKUP_DIR}"

################################################################################
# 1. Configuration principale
################################################################################

log "Sauvegarde de configuration.json..."

CONFIG_SOURCE="${NEOPRO_DIR}/webapp/configuration.json"
if [ -f "${CONFIG_SOURCE}" ]; then
    cp "${CONFIG_SOURCE}" "${BACKUP_DIR}/configuration.json"
    log_success "configuration.json sauvegardé"
else
    log_warning "configuration.json non trouvé"
fi

################################################################################
# 2. Configuration sync-agent
################################################################################

log "Sauvegarde de la configuration sync-agent..."

# .env du sync-agent
if [ -f "${NEOPRO_DIR}/sync-agent/.env" ]; then
    cp "${NEOPRO_DIR}/sync-agent/.env" "${BACKUP_DIR}/sync-agent.env"
    log_success "sync-agent .env sauvegardé"
else
    log_warning "sync-agent .env non trouvé"
fi

# site.conf
if [ -f "/etc/neopro/site.conf" ]; then
    cp "/etc/neopro/site.conf" "${BACKUP_DIR}/site.conf"
    log_success "site.conf sauvegardé"
else
    log_warning "site.conf non trouvé"
fi

################################################################################
# 3. Liste des vidéos (inventaire)
################################################################################

log "Création de l'inventaire des vidéos..."

if [ -d "${NEOPRO_DIR}/videos" ]; then
    # Créer un fichier d'inventaire avec les métadonnées
    find "${NEOPRO_DIR}/videos" -type f \( -name "*.mp4" -o -name "*.mkv" -o -name "*.mov" -o -name "*.avi" \) \
        -exec ls -lh {} \; > "${BACKUP_DIR}/videos-inventory.txt" 2>/dev/null || true

    # Nombre de vidéos
    VIDEO_COUNT=$(wc -l < "${BACKUP_DIR}/videos-inventory.txt" 2>/dev/null || echo "0")
    log_success "Inventaire créé : ${VIDEO_COUNT} vidéo(s)"
else
    log_warning "Répertoire videos non trouvé"
    echo "Aucune vidéo" > "${BACKUP_DIR}/videos-inventory.txt"
fi

################################################################################
# 4. Informations système
################################################################################

log "Collecte des informations système..."

cat > "${BACKUP_DIR}/system-info.txt" <<EOF
Backup créé le : ${BACKUP_DATE} à $(date +%H:%M:%S)
Hostname : $(hostname)
Uptime : $(uptime -p)
Espace disque :
$(df -h ${NEOPRO_DIR} | tail -1)

Services :
$(systemctl is-active neopro-app 2>/dev/null || echo "neopro-app: unknown")
$(systemctl is-active neopro-sync-agent 2>/dev/null || echo "neopro-sync-agent: unknown")
$(systemctl is-active nginx 2>/dev/null || echo "nginx: unknown")
EOF

log_success "Informations système sauvegardées"

################################################################################
# 5. Création de l'archive
################################################################################

log "Compression du backup..."

ARCHIVE_NAME="backup-${BACKUP_TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_ROOT}/${ARCHIVE_NAME}"

cd "${BACKUP_ROOT}"
tar -czf "${ARCHIVE_NAME}" "$(basename ${BACKUP_DIR})" 2>/dev/null

if [ -f "${ARCHIVE_PATH}" ]; then
    ARCHIVE_SIZE=$(du -h "${ARCHIVE_PATH}" | cut -f1)
    log_success "Archive créée : ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

    # Supprimer le dossier temporaire
    rm -rf "${BACKUP_DIR}"
else
    log_error "Échec de la création de l'archive"
    exit 1
fi

################################################################################
# 6. Rotation des backups (garder les N derniers jours)
################################################################################

log "Rotation des backups (conservation : ${RETENTION_DAYS} jours)..."

# Compter les backups avant rotation
BEFORE_COUNT=$(ls -1 ${BACKUP_ROOT}/backup-*.tar.gz 2>/dev/null | wc -l)

# Supprimer les backups plus vieux que RETENTION_DAYS jours
find "${BACKUP_ROOT}" -name "backup-*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# Compter les backups après rotation
AFTER_COUNT=$(ls -1 ${BACKUP_ROOT}/backup-*.tar.gz 2>/dev/null | wc -l)
DELETED_COUNT=$((BEFORE_COUNT - AFTER_COUNT))

if [ ${DELETED_COUNT} -gt 0 ]; then
    log_success "Rotation : ${DELETED_COUNT} ancien(s) backup(s) supprimé(s)"
else
    log "Aucun backup à supprimer"
fi

log_success "Backups actifs : ${AFTER_COUNT}"

################################################################################
# 7. Métrique de backup (pour monitoring)
################################################################################

# Créer un fichier de statut pour le monitoring
cat > "${BACKUP_ROOT}/last-backup-status.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "date": "${BACKUP_DATE}",
  "success": true,
  "archive": "${ARCHIVE_NAME}",
  "size": "${ARCHIVE_SIZE}",
  "backups_count": ${AFTER_COUNT},
  "retention_days": ${RETENTION_DAYS}
}
EOF

################################################################################
# Résumé
################################################################################

log "=== Backup terminé avec succès ==="
log "Archive : ${ARCHIVE_PATH}"
log "Taille : ${ARCHIVE_SIZE}"
log "Backups conservés : ${AFTER_COUNT}"

# Nettoyer les logs de plus de 30 jours
find "${BACKUP_ROOT}" -name "backup.log.*" -type f -mtime +30 -delete 2>/dev/null || true

# Rotation du log principal si trop gros (> 10MB)
if [ -f "${LOG_FILE}" ] && [ $(stat -f%z "${LOG_FILE}" 2>/dev/null || stat -c%s "${LOG_FILE}" 2>/dev/null || echo 0) -gt 10485760 ]; then
    mv "${LOG_FILE}" "${LOG_FILE}.$(date +%Y%m%d-%H%M%S)"
fi

exit 0
