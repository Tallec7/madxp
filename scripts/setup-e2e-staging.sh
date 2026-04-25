#!/usr/bin/env bash
# Setup E2E staging — crée le compte test sur staging DB + installe les secrets GitHub.
#
# Usage :
#   export STAGING_DATABASE_PUBLIC_URL='postgresql://...@<staging-host>.railway.app:.../railway'
#   bash scripts/setup-e2e-staging.sh
#
# Pré-requis : `psql`, `gh` (authentifié sur le repo), `node`.
#
# Crée :
#   - utilisateur `e2e-bot@staging.local` (rôle super_admin) sur la DB staging
#   - secrets GitHub `STAGING_E2E_EMAIL` + `STAGING_E2E_PASSWORD`
#
# Idempotent : ré-exécutable, met à jour le password si l'utilisateur existe déjà.

set -euo pipefail

EMAIL="e2e-bot@staging.local"
DB_URL="${STAGING_DATABASE_PUBLIC_URL:-}"

if [ -z "$DB_URL" ]; then
  echo "❌ STAGING_DATABASE_PUBLIC_URL non défini" >&2
  echo "   Récupère-le via Railway → service postgres-staging → Variables → DATABASE_PUBLIC_URL" >&2
  exit 1
fi

# Garde-fou : confirmer manuellement que c'est bien la DB staging
# (Railway utilise des hostnames génériques, on ne peut pas filtrer par "staging")
echo ""
echo "⚠️  GARDE-FOU MANUEL"
echo "URL cible : $(echo "$DB_URL" | sed 's|://[^@]*@|://***@|')"
echo ""
echo "Vérifie que c'est bien la DB STAGING (pas la prod) :"
echo "  railway status   → doit afficher Service: neopro-staging-db"
echo ""
read -r -p "Tape 'STAGING' (en majuscules) pour confirmer : " CONFIRM
if [ "$CONFIRM" != "STAGING" ]; then
  echo "❌ Confirmation échouée — STOP par sécurité"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI non installé. brew install gh" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh non authentifié. gh auth login" >&2
  exit 1
fi

# 1. Générer un password fort
PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
echo "✅ Password généré (24 bytes)"

# 2. Hasher avec bcryptjs (Neopro utilise bcryptjs, pas bcrypt natif)
TMPDIR_BCRYPT=$(mktemp -d)
trap "rm -rf $TMPDIR_BCRYPT" EXIT
(cd "$TMPDIR_BCRYPT" && npm install --silent --no-audit --no-fund bcryptjs >/dev/null 2>&1)

HASH=$(node -e "
  const bcrypt = require('$TMPDIR_BCRYPT/node_modules/bcryptjs');
  process.stdout.write(bcrypt.hashSync(process.argv[1], 10));
" "$PASSWORD")

if [ -z "$HASH" ]; then
  echo "❌ Échec génération hash bcryptjs" >&2
  exit 1
fi
echo "✅ Hash bcryptjs généré (${#HASH} chars)"

# 3. Upsert utilisateur dans staging DB
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO users (email, password_hash, role, full_name, status, created_at, updated_at)
VALUES ('$EMAIL', '$HASH', 'super_admin', 'E2E Bot Staging', 'active', NOW(), NOW())
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role = 'super_admin',
      status = 'active',
      updated_at = NOW();
SELECT id, email, role, status FROM users WHERE email = '$EMAIL';
SQL
echo "✅ User $EMAIL créé/mis à jour sur staging DB"

# 4. Pousser les secrets GitHub (repo courant)
gh secret set STAGING_E2E_EMAIL --body "$EMAIL"
gh secret set STAGING_E2E_PASSWORD --body "$PASSWORD"
echo "✅ Secrets GitHub STAGING_E2E_EMAIL + STAGING_E2E_PASSWORD installés"

# 5. Vérification
echo ""
echo "=== Vérification ==="
gh secret list | grep -E "STAGING_E2E_(EMAIL|PASSWORD)" || echo "⚠️  Vérifier manuellement"
echo ""
echo "Workflow nightly : .github/workflows/e2e-staging.yml"
echo "Lancement manuel : gh workflow run e2e-staging.yml"
echo ""
echo "✅ Setup E2E staging terminé"
