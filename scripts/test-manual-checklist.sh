#!/bin/bash
#
# NEOPRO - Checklist de Tests Manuels Interactive
# ================================================
#
# Ce script guide l'utilisateur à travers une série de tests manuels
# avec validation interactive et génération de rapport.
#
# Usage: ./scripts/test-manual-checklist.sh
#

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Fichier de rapport
REPORT_FILE="/tmp/neopro-test-report-$(date +%Y%m%d-%H%M%S).md"

# Compteurs
PASSED=0
FAILED=0
SKIPPED=0

# Initialiser le rapport
init_report() {
    cat > "$REPORT_FILE" << EOF
# Rapport de Tests Manuels Neopro

**Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Testeur:** $(whoami)

---

EOF
}

# Fonction pour poser une question oui/non
ask_yn() {
    local prompt="$1"
    local default="${2:-y}"

    if [ "$default" = "y" ]; then
        prompt="$prompt [O/n]: "
    else
        prompt="$prompt [o/N]: "
    fi

    read -p "$prompt" answer
    answer=${answer:-$default}

    case "$answer" in
        [oOyY]*) return 0 ;;
        *) return 1 ;;
    esac
}

# Fonction pour un test manuel
manual_test() {
    local category="$1"
    local test_name="$2"
    local instructions="$3"
    local expected="$4"

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}TEST: $test_name${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Instructions:${NC}"
    echo "$instructions"
    echo ""
    echo -e "${YELLOW}Résultat attendu:${NC}"
    echo "$expected"
    echo ""

    PS3="Résultat du test: "
    select result in "RÉUSSI" "ÉCHOUÉ" "IGNORÉ"; do
        case $result in
            "RÉUSSI")
                echo -e "${GREEN}✓ Test réussi${NC}"
                ((PASSED++))
                echo "## $category: $test_name" >> "$REPORT_FILE"
                echo "- **Statut:** ✅ RÉUSSI" >> "$REPORT_FILE"
                echo "" >> "$REPORT_FILE"
                break
                ;;
            "ÉCHOUÉ")
                echo -e "${RED}✗ Test échoué${NC}"
                read -p "Décrivez le problème: " issue
                ((FAILED++))
                echo "## $category: $test_name" >> "$REPORT_FILE"
                echo "- **Statut:** ❌ ÉCHOUÉ" >> "$REPORT_FILE"
                echo "- **Problème:** $issue" >> "$REPORT_FILE"
                echo "" >> "$REPORT_FILE"
                break
                ;;
            "IGNORÉ")
                echo -e "${YELLOW}⊘ Test ignoré${NC}"
                ((SKIPPED++))
                echo "## $category: $test_name" >> "$REPORT_FILE"
                echo "- **Statut:** ⏭️ IGNORÉ" >> "$REPORT_FILE"
                echo "" >> "$REPORT_FILE"
                break
                ;;
            *)
                echo "Choisissez 1, 2 ou 3"
                ;;
        esac
    done
}

section_header() {
    local title="$1"
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $title${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

    echo "" >> "$REPORT_FILE"
    echo "---" >> "$REPORT_FILE"
    echo "# $title" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# ============================================================================
# DÉBUT DU SCRIPT
# ============================================================================

clear
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           NEOPRO - Checklist de Tests Manuels               ║"
echo "║                                                              ║"
echo "║  Ce script va vous guider à travers les tests manuels       ║"
echo "║  nécessaires pour valider le système avant déploiement.     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo "Appuyez sur ENTRÉE pour commencer..."
read

init_report

# ============================================================================
# SECTION 1: AUTHENTIFICATION
# ============================================================================
section_header "1. AUTHENTIFICATION"

manual_test "Auth" "Login Super Admin" \
"1. Ouvrez le dashboard dans votre navigateur
2. Allez sur la page de login
3. Entrez les credentials super_admin
4. Cliquez sur 'Connexion'" \
"- Redirection vers le dashboard
- Nom de l'utilisateur affiché
- Menu complet visible (Sites, Content, Analytics, Users)"

manual_test "Auth" "Login avec mauvais mot de passe" \
"1. Déconnectez-vous si connecté
2. Entrez un email valide
3. Entrez un mot de passe incorrect
4. Cliquez sur 'Connexion'" \
"- Message d'erreur 'Email ou mot de passe incorrect'
- Pas de redirection
- Champ mot de passe vidé"

manual_test "Auth" "Logout" \
"1. Connectez-vous en tant que super_admin
2. Cliquez sur le bouton de déconnexion
3. Observez le comportement" \
"- Redirection vers la page de login
- Session terminée
- Accès aux pages protégées bloqué"

manual_test "Auth" "Protection des routes" \
"1. Déconnectez-vous
2. Essayez d'accéder directement à /sites dans l'URL
3. Observez le comportement" \
"- Redirection automatique vers /login
- Message 'Veuillez vous connecter'"

# ============================================================================
# SECTION 2: GESTION DES SITES
# ============================================================================
section_header "2. GESTION DES SITES"

manual_test "Sites" "Liste des sites" \
"1. Connectez-vous en tant que super_admin
2. Allez dans la section 'Sites'
3. Observez la liste" \
"- Liste des sites affichée
- Statut (online/offline) visible
- Pagination fonctionnelle"

manual_test "Sites" "Création d'un site" \
"1. Cliquez sur 'Nouveau site'
2. Remplissez: Nom du site, Nom du club, Sport
3. Validez le formulaire" \
"- Site créé avec succès
- API key générée et affichée
- Site visible dans la liste"

manual_test "Sites" "Modification d'un site" \
"1. Cliquez sur un site existant
2. Modifiez le nom du club
3. Sauvegardez" \
"- Modification enregistrée
- Message de confirmation
- Nouvelle valeur affichée"

manual_test "Sites" "Régénération API Key" \
"1. Allez dans les détails d'un site
2. Cliquez sur 'Régénérer API Key'
3. Confirmez l'action" \
"- Nouvelle API key générée
- Ancienne API key invalidée
- Avertissement affiché"

# ============================================================================
# SECTION 3: GESTION DU CONTENU
# ============================================================================
section_header "3. GESTION DU CONTENU (VIDÉOS)"

manual_test "Content" "Upload de vidéo" \
"1. Allez dans la section 'Contenu'
2. Cliquez sur 'Upload vidéo'
3. Sélectionnez un fichier vidéo (< 100MB)
4. Remplissez les métadonnées (catégorie, etc.)
5. Lancez l'upload" \
"- Barre de progression visible
- Upload terminé avec succès
- Vidéo visible dans la liste
- Thumbnail générée"

manual_test "Content" "Liste des vidéos" \
"1. Allez dans la section 'Contenu'
2. Observez la liste des vidéos" \
"- Vidéos affichées avec thumbnails
- Filtrage par catégorie fonctionnel
- Recherche fonctionnelle"

manual_test "Content" "Suppression de vidéo" \
"1. Sélectionnez une vidéo de test
2. Cliquez sur 'Supprimer'
3. Confirmez la suppression" \
"- Vidéo supprimée de la liste
- Fichier supprimé du stockage
- Message de confirmation"

# ============================================================================
# SECTION 4: DÉPLOIEMENT
# ============================================================================
section_header "4. DÉPLOIEMENT DE CONTENU"

manual_test "Deploy" "Déploiement vers un site" \
"1. Sélectionnez une vidéo
2. Cliquez sur 'Déployer'
3. Choisissez un site cible
4. Lancez le déploiement" \
"- Déploiement créé
- Progression affichée
- Statut 'completed' à la fin"

manual_test "Deploy" "Déploiement vers un groupe" \
"1. Créez un groupe de sites si nécessaire
2. Sélectionnez une vidéo
3. Déployez vers le groupe" \
"- Déploiement envoyé à tous les sites du groupe
- Progression individuelle par site
- Rapport final avec statut par site"

# ============================================================================
# SECTION 5: RASPBERRY PI
# ============================================================================
section_header "5. RASPBERRY PI"

manual_test "Pi" "Connexion Socket.IO" \
"1. Vérifiez que le Pi est allumé
2. Regardez la console du serveur central
3. Ou vérifiez le dashboard (statut du site)" \
"- Site marqué 'online' dans le dashboard
- Heartbeat reçu (logs serveur)
- Métriques CPU/RAM affichées"

manual_test "Pi" "Affichage TV" \
"1. Ouvrez http://neopro.local sur un navigateur
   (ou l'IP du Pi)
2. Observez l'interface TV" \
"- Page de connexion ou écran principal affiché
- Logo du club visible
- Interface fluide"

manual_test "Pi" "Télécommande" \
"1. Sur le Pi, accédez à la télécommande
   (port 80, mode télécommande)
2. Testez les boutons" \
"- Boutons réactifs
- Actions effectuées sur la TV
- Navigation fonctionnelle"

manual_test "Pi" "Réception de déploiement" \
"1. Déployez une vidéo vers le Pi depuis le dashboard
2. Observez la progression
3. Vérifiez sur le Pi" \
"- Notification de déploiement reçue
- Téléchargement effectué
- Vidéo disponible localement"

manual_test "Pi" "Lecture vidéo" \
"1. Depuis la télécommande, lancez une vidéo
2. Observez la TV" \
"- Vidéo lue correctement
- Audio fonctionnel
- Pas de saccades"

# ============================================================================
# SECTION 6: ANALYTICS
# ============================================================================
section_header "6. ANALYTICS"

manual_test "Analytics" "Vue d'ensemble" \
"1. Allez dans la section 'Analytics'
2. Observez les graphiques" \
"- Graphiques affichés
- Données cohérentes
- Filtres par date fonctionnels"

manual_test "Analytics" "Stats par site" \
"1. Cliquez sur un site spécifique
2. Observez les statistiques" \
"- Sessions affichées
- Vidéos les plus jouées
- Temps d'écran total"

manual_test "Analytics" "Export de données" \
"1. Allez dans les analytics d'un annonceur
2. Cliquez sur 'Exporter CSV'
3. Téléchargez le fichier" \
"- Fichier CSV téléchargé
- Données correctement formatées
- Toutes les colonnes présentes"

# ============================================================================
# SECTION 7: GESTION DES UTILISATEURS
# ============================================================================
section_header "7. GESTION DES UTILISATEURS"

manual_test "Users" "Création d'utilisateur" \
"1. Allez dans 'Utilisateurs'
2. Cliquez sur 'Nouvel utilisateur'
3. Remplissez le formulaire (role: operator)
4. Validez" \
"- Utilisateur créé
- Email de bienvenue envoyé (si configuré)
- Utilisateur visible dans la liste"

manual_test "Users" "Modification de rôle" \
"1. Sélectionnez un utilisateur
2. Changez son rôle
3. Sauvegardez" \
"- Rôle modifié
- Permissions mises à jour
- L'utilisateur voit le bon menu après reconnexion"

manual_test "Users" "Reset mot de passe" \
"1. Cliquez sur 'Reset password' pour un utilisateur
2. Observez le résultat" \
"- Email de reset envoyé
- Lien valide dans l'email
- Nouveau mot de passe fonctionne"

# ============================================================================
# SECTION 8: ANNONCEURS
# ============================================================================
section_header "8. ANNONCEURS (ADVERTISERS)"

manual_test "Advertisers" "Création d'annonceur" \
"1. Allez dans 'Annonceurs'
2. Créez un nouvel annonceur
3. Associez-lui des vidéos" \
"- Annonceur créé
- Vidéos associées visibles
- Statistiques initialisées"

manual_test "Advertisers" "Portail annonceur" \
"1. Connectez-vous avec un compte advertiser
2. Observez le dashboard" \
"- Seules ses vidéos visibles
- Stats d'impressions affichées
- Pas d'accès aux autres sections"

# ============================================================================
# RÉSUMÉ
# ============================================================================

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                     RÉSUMÉ DES TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Réussis:${NC}  $PASSED"
echo -e "  ${RED}Échoués:${NC}  $FAILED"
echo -e "  ${YELLOW}Ignorés:${NC}  $SKIPPED"
echo ""

# Écrire le résumé dans le rapport
cat >> "$REPORT_FILE" << EOF
---

# Résumé

| Statut | Nombre |
|--------|--------|
| ✅ Réussis | $PASSED |
| ❌ Échoués | $FAILED |
| ⏭️ Ignorés | $SKIPPED |

---

*Rapport généré le $(date '+%Y-%m-%d à %H:%M:%S')*
EOF

echo -e "Rapport sauvegardé: ${CYAN}$REPORT_FILE${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              TOUS LES TESTS MANUELS PASSENT !                ║${NC}"
    echo -e "${GREEN}║                  Système prêt pour production                ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              $FAILED TEST(S) ONT ÉCHOUÉ                          ║${NC}"
    echo -e "${RED}║         Consultez le rapport pour les détails                ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
fi

echo ""
echo "Voulez-vous ouvrir le rapport ? (o/n)"
read -n 1 open_report
echo ""

if [[ "$open_report" =~ ^[oOyY]$ ]]; then
    if command -v open &> /dev/null; then
        open "$REPORT_FILE"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$REPORT_FILE"
    else
        cat "$REPORT_FILE"
    fi
fi
