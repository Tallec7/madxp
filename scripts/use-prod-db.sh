#!/usr/bin/env bash
#
# Helper local — bascule `central-server/.env` sur la DB prod Railway en
# lecture pour les sessions de debug Claude / dev (read-only recommandé).
#
# Pourquoi : pendant le cleanup ADR-070 (PR #633), la `DATABASE_URL` du
# fichier .env local a été laissée pointant sur la DB Supabase orpheline,
# qui n'est plus écrite. Toute query psql lancée sans précaution renvoie
# des données gelées au moment du switch — d'où le faux diagnostic
# "Pi NLF down depuis 48h" lors de l'investigation issue #644.
#
# Usage :
#
#   # 1. Bascule (lance railway connect, te demande de copier le DATABASE_URL)
#   ./scripts/use-prod-db.sh
#
#   # 2. Sanity check : la requête doit retourner ce que tu vois sur le dashboard
#   psql "$(grep ^DATABASE_URL central-server/.env | cut -d= -f2-)" \
#     -c "SELECT site_name, status, last_seen_at, NOW() - last_seen_at AS since
#         FROM sites WHERE site_name LIKE 'Gymnase Mangin%';"
#
#   # 3. Pour revenir au stub local : restaurer central-server/.env.local-stub
#   ./scripts/use-prod-db.sh --restore
#
# IMPORTANT :
# - Ce script ne touche PAS la DB. Il switch juste l'env.
# - Le DATABASE_URL prod ne va JAMAIS dans le repo (ignored par .gitignore).
# - Préférer `railway connect postgres-prod` pour un psql interactif sans
#   stocker la credential.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/central-server/.env"
STUB_FILE="$ROOT/central-server/.env.local-stub"

if [[ "${1:-}" == "--restore" ]]; then
  if [[ ! -f "$STUB_FILE" ]]; then
    echo "❌ Pas de stub local sauvegardé dans $STUB_FILE"
    echo "   Restore manuellement depuis git :"
    echo "   git -C central-server checkout HEAD -- .env.example"
    exit 1
  fi
  cp "$STUB_FILE" "$ENV_FILE"
  echo "✅ Restauré le stub local dans $ENV_FILE"
  exit 0
fi

# Sauvegarde la version locale avant écrasement.
if [[ -f "$ENV_FILE" ]] && [[ ! -f "$STUB_FILE" ]]; then
  cp "$ENV_FILE" "$STUB_FILE"
  echo "💾 Sauvegardé l'env local dans $STUB_FILE (utilisé par --restore)"
fi

cat <<'EOF'

📋 Récupération du DATABASE_URL prod via Railway :

   1. Lance dans un autre terminal :

      railway link        # sélectionne workspace > divine-freedom > production > postgres-prod

   2. Récupère le DATABASE_URL public (proxy, pas l'URL .railway.internal) :

      railway variables --kv | grep ^DATABASE_PUBLIC_URL=

      Si DATABASE_PUBLIC_URL n'existe pas, ouvre un proxy interactif :

      railway connect postgres-prod
      (puis dans psql : \conninfo )

   3. Colle le DATABASE_URL ci-dessous (postgresql://...) puis Entrée :

EOF

read -rp "DATABASE_URL prod > " PROD_URL

if [[ -z "$PROD_URL" ]]; then
  echo "❌ URL vide, abandon."
  exit 1
fi

if [[ "$PROD_URL" != postgresql://* ]]; then
  echo "❌ Format invalide (doit commencer par postgresql://)"
  exit 1
fi

if [[ "$PROD_URL" == *"railway.internal"* ]]; then
  echo "⚠️  L'URL .railway.internal n'est accessible que depuis Railway."
  echo "    Utiliser DATABASE_PUBLIC_URL (proxy.rlwy.net) à la place."
  exit 1
fi

# Remplace ou ajoute la ligne DATABASE_URL dans le .env.
if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  # macOS sed (BSD)
  sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$PROD_URL|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
else
  echo "DATABASE_URL=$PROD_URL" >> "$ENV_FILE"
fi

echo "✅ central-server/.env basculé sur prod Railway."
echo "   Pour revenir au local : ./scripts/use-prod-db.sh --restore"
