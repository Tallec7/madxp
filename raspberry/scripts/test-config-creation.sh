#!/bin/bash

################################################################################
# Script de test pour vérifier la création de configuration
# Sans déploiement réel sur le Pi
################################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     TEST : CRÉATION DE CONFIGURATION                           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_header

# Paramètres de test
CLUB_NAME="TEST_CLUB"
CLUB_FULL_NAME="Test Handball Club"
SITE_NAME="Complexe Sportif Test"
CITY="Test-Ville"
REGION="Test-Région"
COUNTRY="France"
SPORTS="handball"
CONTACT_EMAIL="test@test.fr"
CONTACT_PHONE="+33 6 00 00 00 00"
PASSWORD="TestPassword123!"

CONFIG_FILE="raspberry/configs/${CLUB_NAME}-configuration.json"

print_step "Configuration de test"
echo ""
echo "Nom du club      : $CLUB_NAME"
echo "Nom complet      : $CLUB_FULL_NAME"
echo "Nom du site      : $SITE_NAME"
echo "Ville            : $CITY"
echo "Région           : $REGION"
echo "Sports           : $SPORTS"
echo "Email            : $CONTACT_EMAIL"
echo "Téléphone        : $CONTACT_PHONE"
echo "Mot de passe     : ${PASSWORD:0:4}***********"
echo ""

print_step "Création du fichier de configuration"

# Copier le template
cp raspberry/configs/TEMPLATE-configuration.json "$CONFIG_FILE"

# Remplacer les placeholders
sed -i.bak "s/\[NOM_DU_CLUB\]/$CLUB_NAME/g" "$CONFIG_FILE"
sed -i.bak "s/\[NOM_DU_SITE\]/$SITE_NAME/g" "$CONFIG_FILE"
sed -i.bak "s/CHANGER_CE_MOT_DE_PASSE/$PASSWORD/g" "$CONFIG_FILE"
sed -i.bak "s/\[VILLE\]/$CITY/g" "$CONFIG_FILE"
sed -i.bak "s/Bretagne/$REGION/g" "$CONFIG_FILE"
sed -i.bak "s/France/$COUNTRY/g" "$CONFIG_FILE"

SPORTS_JSON=$(echo "$SPORTS" | sed 's/,/","/g' | sed 's/^/["/' | sed 's/$/"]/')
sed -i.bak "s/\[\"handball\"\]/$SPORTS_JSON/g" "$CONFIG_FILE"

sed -i.bak "s/\[EMAIL\]/$CONTACT_EMAIL/g" "$CONFIG_FILE"
sed -i.bak "s/\[TELEPHONE\]/$CONTACT_PHONE/g" "$CONFIG_FILE"

# Nettoyer les fichiers .bak
rm -f "$CONFIG_FILE.bak"

print_success "Configuration créée : $CONFIG_FILE"

print_step "Vérification du fichier JSON"

# Vérifier que le JSON est valide
if python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
    print_success "JSON valide"
else
    echo "✗ JSON invalide"
    exit 1
fi

# Afficher les sections importantes
print_step "Contenu de la section auth"
cat "$CONFIG_FILE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data.get('auth', {}), indent=2))"

print_step "Contenu de la section sync"
cat "$CONFIG_FILE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps(data.get('sync', {}), indent=2))"

print_step "Test terminé avec succès"
echo ""
echo "Fichier créé : $CONFIG_FILE"
echo ""
echo "Pour nettoyer :"
echo "  rm $CONFIG_FILE"
echo ""

print_success "Tous les tests sont passés !"
