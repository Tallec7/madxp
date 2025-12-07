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
#   --output=FILE    Fichier de sortie (défaut: stdout)
#   --save           Sauvegarder dans docs/changelog/
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
OUTPUT=""
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
        --output=*)
            OUTPUT="${arg#*=}"
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
            echo "  --output=FILE    Fichier de sortie"
            echo "  --save           Sauvegarder dans docs/changelog/"
            echo ""
            echo "Exemples:"
            echo "  $0 --commits=10"
            echo "  $0 --since=2025-12-01"
            echo "  $0 --save"
            exit 0
            ;;
    esac
done

# Construire la commande git log
GIT_CMD="git log --pretty=format:%H§%s§%an§%ad --date=short"

if [ -n "$SINCE" ]; then
    GIT_CMD="$GIT_CMD --since=$SINCE"
elif [ "$ALL" = true ]; then
    : # Pas de limite
elif [ -n "$COMMITS" ]; then
    GIT_CMD="$GIT_CMD -n $COMMITS"
fi

# Variables pour stocker les commits par type
FEAT_LIST=""
FIX_LIST=""
DOCS_LIST=""
REFACTOR_LIST=""
CHORE_LIST=""
OTHER_LIST=""

# Lire les commits
while IFS='§' read -r hash subject author date; do
    [ -z "$hash" ] && continue

    short_hash="${hash:0:7}"

    # Déterminer le type
    if [[ "$subject" =~ ^feat ]]; then
        # Nettoyer le message
        clean_msg=$(echo "$subject" | sed -E 's/^feat(\([^)]+\))?:\s*//')
        FEAT_LIST="${FEAT_LIST}- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    elif [[ "$subject" =~ ^fix ]]; then
        clean_msg=$(echo "$subject" | sed -E 's/^fix(\([^)]+\))?:\s*//')
        FIX_LIST="${FIX_LIST}- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    elif [[ "$subject" =~ ^docs ]]; then
        clean_msg=$(echo "$subject" | sed -E 's/^docs(\([^)]+\))?:\s*//')
        DOCS_LIST="${DOCS_LIST}- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    elif [[ "$subject" =~ ^refactor ]]; then
        clean_msg=$(echo "$subject" | sed -E 's/^refactor(\([^)]+\))?:\s*//')
        REFACTOR_LIST="${REFACTOR_LIST}- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    elif [[ "$subject" =~ ^chore ]]; then
        clean_msg=$(echo "$subject" | sed -E 's/^chore(\([^)]+\))?:\s*//')
        CHORE_LIST="${CHORE_LIST}- ${clean_msg} (\`${short_hash}\`) - ${date}
"
    else
        OTHER_LIST="${OTHER_LIST}- ${subject} (\`${short_hash}\`) - ${date}
"
    fi
done < <(eval $GIT_CMD)

# Générer le changelog
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
    FILENAME="docs/changelog/${TODAY}_commits.md"
    echo "$OUTPUT_CONTENT" > "$FILENAME"
    echo -e "${GREEN}✓ Changelog sauvegardé: ${FILENAME}${NC}"
elif [ -n "$OUTPUT" ]; then
    echo "$OUTPUT_CONTENT" > "$OUTPUT"
    echo -e "${GREEN}✓ Changelog généré: ${OUTPUT}${NC}"
else
    echo "$OUTPUT_CONTENT"
fi
