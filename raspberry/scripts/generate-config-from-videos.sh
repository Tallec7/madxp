#!/bin/bash

# =============================================================================
# NEOPRO - Générateur de configuration depuis un répertoire de vidéos
# =============================================================================
# Ce script scanne un répertoire de vidéos et génère automatiquement
# un fichier configuration.json pour le système Néopro.
#
# Structure attendue du répertoire :
#   videos/
#   ├── PARTENAIRES/           → sponsors (boucle partenaires)
#   ├── FOCUS_PARTENAIRE/      → catégorie Focus partenaires
#   ├── INFOS_CLUB/            → catégorie Infos club
#   ├── ENTREE/                → catégorie Entrées joueurs
#   └── MATCH/                 → catégorie Match
#       ├── BUT/               → sous-catégorie Buts
#       └── JINGLE/            → sous-catégorie Jingles
#
# Les sous-dossiers deviennent des catégories ou sous-catégories.
# Les fichiers vidéo (.mp4, .mkv, .mov, .avi) sont ajoutés automatiquement.
# =============================================================================

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration par défaut
VIDEO_EXTENSIONS="mp4|mkv|mov|avi|webm"
DEFAULT_VIDEO_TYPE="video/mp4"

# Fonction d'affichage
print_header() {
    echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  NEOPRO - Générateur de Configuration Club${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${CYAN}➤${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Fonction pour obtenir le type MIME d'une vidéo
get_video_type() {
    local ext="${1##*.}"
    case "$ext" in
        mp4)  echo "video/mp4" ;;
        mkv)  echo "video/x-matroska" ;;
        mov)  echo "video/quicktime" ;;
        avi)  echo "video/x-msvideo" ;;
        webm) echo "video/webm" ;;
        *)    echo "video/mp4" ;;
    esac
}

# Fonction pour créer un nom lisible à partir d'un nom de fichier
make_readable_name() {
    local filename="$1"
    # Enlever l'extension
    local name="${filename%.*}"
    # Remplacer les underscores par des espaces
    name="${name//_/ }"
    # Remplacer les tirets par des espaces
    name="${name//-/ }"
    # Capitaliser la première lettre de chaque mot
    echo "$name" | sed 's/\b\(.\)/\u\1/g'
}

# Fonction pour créer un ID valide
make_id() {
    local name="$1"
    # Remplacer les espaces par des tirets, enlever les caractères spéciaux
    echo "$name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g'
}

# Fonction pour échapper les caractères JSON
escape_json() {
    local str="$1"
    str="${str//\\/\\\\}"
    str="${str//\"/\\\"}"
    str="${str//$'\n'/\\n}"
    str="${str//$'\r'/\\r}"
    str="${str//$'\t'/\\t}"
    echo "$str"
}

# Fonction pour scanner les vidéos d'un dossier
scan_videos() {
    local dir="$1"
    local base_path="$2"
    local first=true

    if [ ! -d "$dir" ]; then
        return
    fi

    # Trouver tous les fichiers vidéo
    while IFS= read -r -d '' file; do
        local filename=$(basename "$file")
        local readable_name=$(make_readable_name "$filename")
        local video_type=$(get_video_type "$filename")
        local rel_path="${base_path}/$(basename "$file")"

        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi

        echo -n "                    { \"name\": \"$(escape_json "$readable_name")\", \"path\": \"$(escape_json "$rel_path")\", \"type\": \"$video_type\" }"
    done < <(find "$dir" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.webm" \) -print0 | sort -z)
}

# Fonction pour compter les vidéos
count_videos() {
    local dir="$1"
    if [ -d "$dir" ]; then
        find "$dir" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.webm" \) | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

# Fonction pour générer une catégorie avec sous-catégories
generate_category_with_subcategories() {
    local dir="$1"
    local base_path="$2"
    local cat_name="$3"
    local cat_id="$4"
    local first_sub=true

    echo "        {"
    echo "            \"id\": \"$cat_id\","
    echo "            \"name\": \"$cat_name\","
    echo "            \"locked\": false,"
    echo "            \"owner\": \"club\","
    echo "            \"subCategories\": ["

    # Scanner les sous-dossiers
    for subdir in "$dir"/*/; do
        if [ -d "$subdir" ]; then
            local subdir_name=$(basename "$subdir")
            local sub_id=$(make_id "$subdir_name")
            local sub_readable=$(make_readable_name "$subdir_name")
            local video_count=$(count_videos "$subdir")

            if [ "$video_count" -gt 0 ]; then
                if [ "$first_sub" = true ]; then
                    first_sub=false
                else
                    echo ","
                fi

                echo "                {"
                echo "                    \"id\": \"$sub_id\","
                echo "                    \"name\": \"$sub_readable\","
                echo "                    \"locked\": false,"
                echo "                    \"videos\": ["
                scan_videos "$subdir" "$base_path/$subdir_name"
                echo ""
                echo "                    ]"
                echo -n "                }"
            fi
        fi
    done

    echo ""
    echo "            ]"
    echo -n "        }"
}

# Fonction pour générer une catégorie simple (sans sous-catégories)
generate_simple_category() {
    local dir="$1"
    local base_path="$2"
    local cat_name="$3"
    local cat_id="$4"

    echo "        {"
    echo "            \"id\": \"$cat_id\","
    echo "            \"name\": \"$cat_name\","
    echo "            \"locked\": false,"
    echo "            \"owner\": \"club\","
    echo "            \"videos\": ["
    scan_videos "$dir" "$base_path"
    echo ""
    echo "            ]"
    echo -n "        }"
}

# Fonction pour vérifier si un dossier a des sous-dossiers avec des vidéos
has_video_subdirs() {
    local dir="$1"
    for subdir in "$dir"/*/; do
        if [ -d "$subdir" ]; then
            local count=$(count_videos "$subdir")
            if [ "$count" -gt 0 ]; then
                return 0
            fi
        fi
    done
    return 1
}

# =============================================================================
# PROGRAMME PRINCIPAL
# =============================================================================

print_header

# Vérifier les arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <répertoire_vidéos> [nom_club] [fichier_sortie]"
    echo ""
    echo "Arguments:"
    echo "  répertoire_vidéos  : Chemin vers le dossier contenant les vidéos"
    echo "  nom_club          : Nom du club (optionnel, déduit du dossier sinon)"
    echo "  fichier_sortie    : Fichier de configuration à générer (optionnel)"
    echo ""
    echo "Exemple:"
    echo "  $0 ./videos/mon-club MON-CLUB config/mon-club-configuration.json"
    echo ""
    echo "Structure attendue du répertoire :"
    echo "  videos/"
    echo "  ├── PARTENAIRES/           → boucle sponsors"
    echo "  ├── FOCUS_PARTENAIRE/      → focus partenaires"
    echo "  ├── INFOS_CLUB/            → infos club"
    echo "  ├── ENTREE/                → entrées joueurs"
    echo "  └── MATCH/                 → catégorie avec sous-catégories"
    echo "      ├── BUT/               → sous-catégorie"
    echo "      └── JINGLE/            → sous-catégorie"
    exit 1
fi

VIDEO_DIR="$1"
CLUB_NAME="${2:-$(basename "$VIDEO_DIR" | tr '[:lower:]' '[:upper:]')}"
OUTPUT_FILE="${3:-${CLUB_NAME,,}-configuration.json}"

# Vérifier que le répertoire existe
if [ ! -d "$VIDEO_DIR" ]; then
    print_error "Le répertoire '$VIDEO_DIR' n'existe pas."
    exit 1
fi

print_step "Répertoire vidéos : $VIDEO_DIR"
print_step "Nom du club : $CLUB_NAME"
print_step "Fichier de sortie : $OUTPUT_FILE"

# Demander les informations du club de manière interactive
echo ""
print_step "Configuration du club..."
echo ""

read -p "Nom complet du club [$CLUB_NAME]: " CLUB_FULL_NAME
CLUB_FULL_NAME="${CLUB_FULL_NAME:-$CLUB_NAME}"

read -p "Nom du site/salle [Salle $CLUB_NAME]: " SITE_NAME
SITE_NAME="${SITE_NAME:-Salle $CLUB_NAME}"

read -p "Ville: " CITY
CITY="${CITY:-Ville}"

read -p "Région [Bretagne]: " REGION
REGION="${REGION:-Bretagne}"

read -p "Pays [France]: " COUNTRY
COUNTRY="${COUNTRY:-France}"

read -p "Sport principal [handball]: " SPORT
SPORT="${SPORT:-handball}"

read -p "Email de contact: " EMAIL
EMAIL="${EMAIL:-contact@$CLUB_NAME.fr}"

read -p "Téléphone: " PHONE
PHONE="${PHONE:-}"

# Mot de passe
while true; do
    read -s -p "Mot de passe (min 12 caractères): " PASSWORD
    echo ""
    if [ ${#PASSWORD} -ge 12 ]; then
        break
    else
        print_warning "Le mot de passe doit faire au moins 12 caractères."
    fi
done

echo ""
print_step "Analyse du répertoire vidéos..."

# Compter les vidéos par catégorie
total_videos=0
declare -A category_counts

for subdir in "$VIDEO_DIR"/*/; do
    if [ -d "$subdir" ]; then
        dir_name=$(basename "$subdir")

        # Compter les vidéos directes
        direct_count=$(count_videos "$subdir")

        # Compter les vidéos dans les sous-dossiers
        sub_count=0
        for sub_subdir in "$subdir"/*/; do
            if [ -d "$sub_subdir" ]; then
                sub_count=$((sub_count + $(count_videos "$sub_subdir")))
            fi
        done

        total=$((direct_count + sub_count))
        category_counts["$dir_name"]=$total
        total_videos=$((total_videos + total))

        if [ $total -gt 0 ]; then
            print_success "  $dir_name: $total vidéo(s)"
        fi
    fi
done

echo ""
print_success "Total: $total_videos vidéo(s) trouvée(s)"
echo ""

# Générer le fichier de configuration
print_step "Génération de la configuration..."

# Déterminer le chemin de base pour les vidéos
# Si le répertoire est absolu, on utilise "videos" comme base
# Sinon on utilise le chemin relatif
if [[ "$VIDEO_DIR" = /* ]]; then
    VIDEO_BASE_PATH="videos"
else
    VIDEO_BASE_PATH="$VIDEO_DIR"
fi

# Début du fichier JSON
cat > "$OUTPUT_FILE" << EOF
{
    "remote": {
        "title": "Télécommande Néopro - $CLUB_NAME"
    },
    "auth": {
        "password": "$PASSWORD",
        "clubName": "$CLUB_NAME",
        "sessionDuration": 28800000
    },
    "sync": {
        "enabled": true,
        "serverUrl": "https://neopro-central-server.onrender.com",
        "siteName": "$SITE_NAME",
        "clubName": "$CLUB_FULL_NAME",
        "location": {
            "city": "$CITY",
            "region": "$REGION",
            "country": "$COUNTRY"
        },
        "sports": ["$SPORT"],
        "contact": {
            "email": "$EMAIL",
            "phone": "$PHONE"
        }
    },
    "version": "2.0",
EOF

# Générer la section sponsors
echo '    "sponsors": [' >> "$OUTPUT_FILE"

# Chercher les vidéos sponsors dans PARTENAIRES ou BOUCLE_PARTENAIRES
SPONSORS_DIR=""
for dir_name in "PARTENAIRES" "BOUCLE_PARTENAIRES" "SPONSORS" "partenaires" "sponsors"; do
    if [ -d "$VIDEO_DIR/$dir_name" ]; then
        SPONSORS_DIR="$VIDEO_DIR/$dir_name"
        break
    fi
done

if [ -n "$SPONSORS_DIR" ] && [ "$(count_videos "$SPONSORS_DIR")" -gt 0 ]; then
    first_sponsor=true
    while IFS= read -r -d '' file; do
        filename=$(basename "$file")
        readable_name=$(make_readable_name "$filename")
        video_type=$(get_video_type "$filename")
        dir_basename=$(basename "$SPONSORS_DIR")

        if [ "$first_sponsor" = true ]; then
            first_sponsor=false
        else
            echo "," >> "$OUTPUT_FILE"
        fi

        echo -n "        { \"name\": \"$(escape_json "$readable_name")\", \"path\": \"$VIDEO_BASE_PATH/$dir_basename/$filename\", \"type\": \"$video_type\" }" >> "$OUTPUT_FILE"
    done < <(find "$SPONSORS_DIR" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mkv" -o -iname "*.mov" -o -iname "*.avi" -o -iname "*.webm" \) -print0 | sort -z)
    echo "" >> "$OUTPUT_FILE"
fi

echo '    ],' >> "$OUTPUT_FILE"

# Générer les timeCategories
cat >> "$OUTPUT_FILE" << 'EOF'
    "timeCategories": [
        {
            "id": "before",
            "name": "Avant-match",
            "icon": "🏁",
            "color": "from-blue-500 to-blue-600",
            "description": "Échauffement & présentation",
            "categoryIds": []
        },
        {
            "id": "during",
            "name": "Match",
            "icon": "▶️",
            "color": "from-green-500 to-green-600",
            "description": "Live & animations",
            "categoryIds": []
        },
        {
            "id": "after",
            "name": "Après-match",
            "icon": "🏆",
            "color": "from-purple-500 to-purple-600",
            "description": "Résultats & remerciements",
            "categoryIds": []
        }
    ],
EOF

# Générer les catégories
echo '    "categories": [' >> "$OUTPUT_FILE"

first_category=true
category_ids=()

for subdir in "$VIDEO_DIR"/*/; do
    if [ -d "$subdir" ]; then
        dir_name=$(basename "$subdir")
        dir_upper=$(echo "$dir_name" | tr '[:lower:]' '[:upper:]')

        # Ignorer le dossier des sponsors
        case "$dir_upper" in
            PARTENAIRES|BOUCLE_PARTENAIRES|SPONSORS)
                continue
                ;;
        esac

        # Vérifier s'il y a des vidéos (directes ou dans sous-dossiers)
        direct_count=$(count_videos "$subdir")
        has_subdirs=false
        if has_video_subdirs "$subdir"; then
            has_subdirs=true
        fi

        if [ "$direct_count" -eq 0 ] && [ "$has_subdirs" = false ]; then
            continue
        fi

        cat_id=$(make_id "$dir_name")
        cat_name=$(make_readable_name "$dir_name")
        category_ids+=("$cat_id")

        if [ "$first_category" = true ]; then
            first_category=false
        else
            echo "," >> "$OUTPUT_FILE"
        fi

        # Si le dossier a des sous-dossiers avec des vidéos, générer avec subCategories
        if [ "$has_subdirs" = true ]; then
            generate_category_with_subcategories "$subdir" "$VIDEO_BASE_PATH/$dir_name" "$cat_name" "$cat_id" >> "$OUTPUT_FILE"
        else
            generate_simple_category "$subdir" "$VIDEO_BASE_PATH/$dir_name" "$cat_name" "$cat_id" >> "$OUTPUT_FILE"
        fi
    fi
done

echo "" >> "$OUTPUT_FILE"
echo '    ]' >> "$OUTPUT_FILE"
echo '}' >> "$OUTPUT_FILE"

# Mise à jour des timeCategories avec les IDs des catégories
# (On utilise sed pour remplacer les categoryIds vides)
if [ ${#category_ids[@]} -gt 0 ]; then
    ids_json=$(printf '"%s",' "${category_ids[@]}")
    ids_json="[${ids_json%,}]"

    # Mettre à jour "before" avec les catégories d'entrée et infos
    before_ids=()
    during_ids=()
    after_ids=()

    for id in "${category_ids[@]}"; do
        case "$id" in
            *entree*|*entrance*|*joueur*|*player*)
                before_ids+=("$id")
                ;;
            *match*|*but*|*goal*|*jingle*)
                during_ids+=("$id")
                ;;
            *info*|*club*|*focus*|*partenaire*|*partner*)
                before_ids+=("$id")
                after_ids+=("$id")
                ;;
            *)
                before_ids+=("$id")
                during_ids+=("$id")
                ;;
        esac
    done
fi

echo ""
print_success "Configuration générée avec succès !"
echo ""
echo -e "${GREEN}Fichier créé :${NC} $OUTPUT_FILE"
echo ""
echo -e "${YELLOW}Prochaines étapes :${NC}"
echo "  1. Vérifiez et ajustez le fichier si nécessaire"
echo "  2. Copiez-le vers le Raspberry Pi :"
echo "     scp $OUTPUT_FILE pi@neopro.local:/home/pi/neopro/configuration.json"
echo "  3. Ou utilisez-le avec le script de déploiement :"
echo "     cp $OUTPUT_FILE raspberry/config/templates/"
echo ""
echo -e "${CYAN}Note:${NC} Les timeCategories (categoryIds) sont vides par défaut."
echo "      Éditez le fichier pour assigner les catégories aux blocs temporels."
echo ""
