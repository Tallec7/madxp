#!/usr/bin/env bash
# Smoke test : vérifie que tous les liens markdown dans docs/runbooks/ pointent
# vers des fichiers réels (relatifs au repo).
#
# Usage : bash scripts/check-runbook-links.sh
# Exit 0 = tous liens OK, 1 = au moins un lien cassé.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

errors=0
checked=0

# Pour chaque fichier markdown dans docs/runbooks
while IFS= read -r mdfile; do
  # Extraire les liens [text](path) qui ne sont pas des URLs http(s)
  # Format : (path/to/file.md) ou (path/to/file.md#anchor)
  while IFS= read -r link; do
    # Nettoyer : enlever ancre #... et suffixe :LINE (ex: file.ts:42)
    target="${link%%#*}"
    target="${target%:[0-9]*}"
    [ -z "$target" ] && continue

    # Skip URLs absolues
    case "$target" in
      http*|mailto:*) continue ;;
    esac

    # Résoudre le chemin relatif au fichier
    dir="$(dirname "$mdfile")"
    resolved="$(cd "$dir" 2>/dev/null && pwd)/$target"
    # Normaliser . et ..
    resolved=$(python3 -c "import os.path; print(os.path.normpath('$resolved'))" 2>/dev/null || echo "$resolved")

    checked=$((checked + 1))
    if [ ! -e "$resolved" ]; then
      echo "❌ $mdfile → $target (résolu : $resolved)"
      errors=$((errors + 1))
    fi
  done < <(grep -oE '\]\([^)]+\)' "$mdfile" | sed -E 's/^\]\(//; s/\)$//')

done < <(find docs/runbooks -name "*.md" -type f)

echo ""
echo "Checked: $checked liens"
if [ "$errors" -gt 0 ]; then
  echo "❌ $errors lien(s) cassé(s)"
  exit 1
fi
echo "✅ Tous les liens runbook OK"
