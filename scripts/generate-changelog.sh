#!/bin/bash

################################################################################
# Génère un changelog à partir des commits git
#
# Usage:
#   ./scripts/generate-changelog.sh                    # 30 derniers commits
#   ./scripts/generate-changelog.sh --since="2025-12-01"  # Depuis une date
#   ./scripts/generate-changelog.sh --commits=20       # N derniers commits
#   ./scripts/generate-changelog.sh --all              # Tous les commits
#
# Options:
#   --since=DATE     Commits depuis cette date (format: YYYY-MM-DD)
#   --commits=N      Les N derniers commits
#   --all            Tous les commits
#   --save           Sauvegarder dans docs/changelog/
#
# Structure générée:
#   docs/changelog/
#   ├── CHANGELOG.md      # Index avec liens vers les détails
#   └── commits/          # Un fichier par commit avec le détail
#       ├── d413ff8.md
#       └── ...
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Valeurs par défaut
SINCE=""
COMMITS="30"
ALL=false
SAVE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --since=*)
            SINCE="${arg#*=}"
            COMMITS=""
            ;;
        --commits=*)
            COMMITS="${arg#*=}"
            ;;
        --all)
            ALL=true
            COMMITS=""
            ;;
        --save)
            SAVE=true
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --since=DATE     Commits depuis cette date (YYYY-MM-DD)"
            echo "  --commits=N      Les N derniers commits (défaut: 30)"
            echo "  --all            Tous les commits"
            echo "  --save           Sauvegarder dans docs/changelog/"
            echo ""
            echo "Exemples:"
            echo "  $0 --commits=10"
            echo "  $0 --since=2025-12-01"
            echo "  $0 --all --save"
            exit 0
            ;;
    esac
done

# Répertoires
CHANGELOG_DIR="docs/changelog"
COMMITS_DIR="$CHANGELOG_DIR/commits"

# Créer les répertoires si nécessaire (en mode save)
if [ "$SAVE" = true ]; then
    mkdir -p "$COMMITS_DIR"
fi

# Construire la commande git log
GIT_CMD="git log --pretty=format:%H§%s§%an§%ad --date=short"

if [ -n "$SINCE" ]; then
    GIT_CMD="$GIT_CMD --since=$SINCE"
elif [ "$ALL" = true ]; then
    : # Pas de limite
elif [ -n "$COMMITS" ]; then
    GIT_CMD="$GIT_CMD -n $COMMITS"
fi

# Variables pour stocker les commits par type (pour l'index)
FEAT_LIST=""
FIX_LIST=""
DOCS_LIST=""
REFACTOR_LIST=""
CHORE_LIST=""
OTHER_LIST=""

# Compteurs
NEW_COMMITS=0
SKIPPED_COMMITS=0

# Fonction pour obtenir les fichiers modifiés d'un commit
get_files_changed() {
    local hash=$1
    git show --stat --name-only --pretty=format: "$hash" | grep -v '^$' | head -30
}

# Fonction pour obtenir le corps du message de commit
get_commit_body() {
    local hash=$1
    git log -1 --pretty=format:%b "$hash" | sed '/^$/d'
}

# Fonction pour générer le fichier détaillé d'un commit
generate_commit_file() {
    local hash=$1
    local short_hash=$2
    local subject=$3
    local author=$4
    local date=$5
    local type=$6
    local clean_msg=$7

    local commit_file="$COMMITS_DIR/${short_hash}.md"

    # Skip si le fichier existe déjà
    if [ -f "$commit_file" ]; then
        ((SKIPPED_COMMITS++)) || true
        return
    fi

    ((NEW_COMMITS++)) || true

    local body=$(get_commit_body "$hash")
    local files=$(get_files_changed "$hash")

    # Générer le contenu du fichier
    local content="# ${clean_msg}

**Commit:** \`${hash}\`
**Date:** ${date}
**Auteur:** ${author}
**Type:** ${type}
"

    if [ -n "$body" ]; then
        content="${content}
## Description

${body}
"
    fi

    if [ -n "$files" ]; then
        content="${content}
## Fichiers modifiés

\`\`\`
${files}
\`\`\`
"
    fi

    content="${content}
---
[← Retour au changelog](../CHANGELOG.md)
"

    echo "$content" > "$commit_file"
}

# Fonction pour déterminer le type et le message nettoyé
get_type_info() {
    local subject=$1

    if [[ "$subject" =~ ^feat ]]; then
        echo "feat|$(echo "$subject" | sed -E 's/^feat(\([^)]+\))?:\s*//')"
    elif [[ "$subject" =~ ^fix ]]; then
        echo "fix|$(echo "$subject" | sed -E 's/^fix(\([^)]+\))?:\s*//')"
    elif [[ "$subject" =~ ^docs ]]; then
        echo "docs|$(echo "$subject" | sed -E 's/^docs(\([^)]+\))?:\s*//')"
    elif [[ "$subject" =~ ^refactor ]]; then
        echo "refactor|$(echo "$subject" | sed -E 's/^refactor(\([^)]+\))?:\s*//')"
    elif [[ "$subject" =~ ^chore ]]; then
        echo "chore|$(echo "$subject" | sed -E 's/^chore(\([^)]+\))?:\s*//')"
    else
        echo "other|$subject"
    fi
}

# Lire les commits
while IFS='§' read -r hash subject author date; do
    [ -z "$hash" ] && continue

    short_hash="${hash:0:7}"

    # Déterminer le type
    type_info=$(get_type_info "$subject")
    type="${type_info%%|*}"
    clean_msg="${type_info#*|}"

    # Générer le fichier détaillé (si mode save)
    if [ "$SAVE" = true ]; then
        generate_commit_file "$hash" "$short_hash" "$subject" "$author" "$date" "$type" "$clean_msg"
    fi

    # Construire l'entrée pour l'index (avec lien)
    if [ "$SAVE" = true ]; then
        index_entry="- [${clean_msg}](commits/${short_hash}.md) - ${date}
"
    else
        index_entry="- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    fi

    # Ajouter à la liste appropriée
    case "$type" in
        feat)     FEAT_LIST="${FEAT_LIST}${index_entry}" ;;
        fix)      FIX_LIST="${FIX_LIST}${index_entry}" ;;
        docs)     DOCS_LIST="${DOCS_LIST}${index_entry}" ;;
        refactor) REFACTOR_LIST="${REFACTOR_LIST}${index_entry}" ;;
        chore)    CHORE_LIST="${CHORE_LIST}${index_entry}" ;;
        *)        OTHER_LIST="${OTHER_LIST}${index_entry}" ;;
    esac
done < <(eval $GIT_CMD)

# Générer le changelog index
TODAY=$(date +%Y-%m-%d)

OUTPUT_CONTENT="# Changelog

Généré le ${TODAY}
"

if [ -n "$FEAT_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## ✨ Nouvelles fonctionnalités

${FEAT_LIST}"
fi

if [ -n "$FIX_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## 🐛 Corrections

${FIX_LIST}"
fi

if [ -n "$DOCS_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## 📚 Documentation

${DOCS_LIST}"
fi

if [ -n "$REFACTOR_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## ♻️ Refactoring

${REFACTOR_LIST}"
fi

if [ -n "$CHORE_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## 🔧 Maintenance

${CHORE_LIST}"
fi

if [ -n "$OTHER_LIST" ]; then
    OUTPUT_CONTENT="${OUTPUT_CONTENT}
## 📝 Autres

${OTHER_LIST}"
fi

# Sortie
if [ "$SAVE" = true ]; then
    echo "$OUTPUT_CONTENT" > "$CHANGELOG_DIR/CHANGELOG.md"
    echo -e "${GREEN}✓ Changelog sauvegardé: ${CHANGELOG_DIR}/CHANGELOG.md${NC}"
    echo -e "${BLUE}  - Nouveaux commits: ${NEW_COMMITS}${NC}"
    echo -e "${BLUE}  - Commits existants (ignorés): ${SKIPPED_COMMITS}${NC}"
else
    echo "$OUTPUT_CONTENT"
fi
