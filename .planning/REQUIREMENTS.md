# Requirements: Neopro — Template Studio v3

**Defined:** 2026-05-05
**Milestone:** v3.0 — Template Studio v3 : UX admin orientée tâche (ADR-110)
**Core Value:** Un super_admin peut créer un template opérationnel en < 15 min depuis le dashboard, sans aide technique, en utilisant uniquement du vocabulaire métier.

## v1 Requirements

### Asset Manager (ASSET)

- [ ] **ASSET-01**: Super_admin peut parcourir tous les assets WebM dans une grille (thumbnail, durée, dimensions, flag alpha, nombre de templates qui l'utilisent)
- [x] **ASSET-02**: Super_admin peut uploader un fichier WebM ; le système valide le format et détecte le canal alpha (yuva420p via ffprobe côté serveur)
- [x] **ASSET-03**: Le système bloque la suppression d'un asset WebM référencé par ≥1 layer de template publié

### Wizard de création (WIZARD)

- [ ] **WIZARD-01**: Super_admin peut créer un template via un wizard 4 étapes (Identité → Fonds animés → Zones modifiables → Options club)
- [ ] **WIZARD-02**: L'étape 1 (Identité) crée immédiatement une row DB ; les étapes suivantes font des PATCH — jamais de perte en cas de fermeture navigateur
- [ ] **WIZARD-03**: La navigation retour dans le wizard préserve toutes les données saisies sans les effacer
- [ ] **WIZARD-04**: Super_admin peut réordonner les fonds animés (layers) par drag-and-drop dans l'étape 2
- [ ] **WIZARD-05**: Super_admin peut configurer les propriétés d'une zone (libellé, police, taille, couleur, alignement, limite caractères, condition d'apparition) dans l'étape 3

### Duplication (DUP)

- [ ] **DUP-01**: Super_admin peut dupliquer n'importe quel template via un bouton "Dupliquer" sur la card ; le clone s'ouvre directement à l'étape 3
- [x] **DUP-02**: La duplication clone atomiquement les 6 tables liées en une seule transaction DB (`neopro_templates`, `template_layers`, `template_text_fields`, `template_image_slots`, `template_options`, `template_packshot_refs`) ; les `file_url` des WebM sont partagées (pas copiées physiquement)

### Aperçu temps réel (PREV)

- [ ] **PREV-01**: Les étapes 3, 4 et 5 affichent un Player Remotion (panneau droit) qui se rafraîchit sous 300ms après chaque modification du formulaire
- [ ] **PREV-02**: L'aperçu se remplit automatiquement avec des données factices quand les champs utilisateur sont vides ("PRÉNOM NOM", "NOM DU CLUB", logo et photo placeholder Neopro)
- [ ] **PREV-03**: Le Player est monté une seule fois dans le shell wizard avec `[hidden]` sur les étapes 1-2 — jamais recréé par étape (prévient le leak GPU SharedImage)

### Vocabulaire métier & UX (UX)

- [ ] **UX-01**: Toute l'interface wizard utilise exclusivement du vocabulaire métier (aucun jargon DB : "fond animé" et non "layer", "zone modifiable" et non "slot")
- [ ] **UX-02**: Le type d'animation est présenté sous forme de cards visuelles nommées (Apparition, Glissement, Zoom arrière, Logo Pop) — aucun paramètre numérique (scaleFrom/scaleTo) n'est exposé à l'utilisateur
- [ ] **UX-03**: L'étape 4 affiche automatiquement quelles zones sont reliées à chaque option via `visible_if` ("✓ 2 zones reliées à cette option")

### Gate de publication (PUB)

- [ ] **PUB-01**: Le bouton "Publier" reste désactivé tant que les 8 critères de la checklist automatique ne sont pas tous verts (≥1 fond, fonts connues, zones en safe-zone, `visible_if` cohérents avec les options, `packshot_refs` pointant vers templates publiés)
- [ ] **PUB-02**: Super_admin peut lancer un rendu de test avec données factices avant de publier ; le résultat s'affiche dans le Player intégré

### Smoke tests (TEST)

- [x] **TEST-01**: Smoke test `smoke-template-studio-v3-vocabulary` : le mapping UI↔DB est figé — tout changement de clé fait échouer le test
- [x] **TEST-02**: Smoke test `smoke-template-studio-v3-duplicate` : la duplication clone toutes les rows des 6 tables sans dupliquer les assets WebM (COUNT avant/après + vérif `file_url` identiques)
- [ ] **TEST-03**: Smoke test `smoke-template-studio-v3-validation` : la checklist pré-publication rejette un template incomplet selon les 8 critères
- [x] **TEST-04**: Smoke test `smoke-template-studio-v3-asset-manager` : l'upload WebM est refusé si pas de canal alpha quand `respect_alpha=true` est requis

## v2 Requirements (déféré)

### Bibliothèque de fonds switchables (v3.1)

- **LIB-01**: Utilisateur club peut switcher le fond animé d'un template depuis `template_variants` existant
- **LIB-02**: UI grille de variantes accessible depuis le player côté club

### Table des polices (v3.2)

- **FONT-01**: Les polices disponibles sont stockées en DB (`template_fonts`) et non hardcodées dans `FONT_FAMILIES`
- **FONT-02**: Endpoint `GET /api/remotion-templates/fonts` expose la liste à l'UI

### UI club portal (v3.3 / Phase D)

- **CLUB-01**: Utilisateur club peut sélectionner un template et remplir les 4-6 champs pour générer une vidéo joueur
- **CLUB-02**: Le formulaire club utilise le même vocabulaire métier que le wizard admin

### Versioning visuel (v3.4)

- **VER-01**: Super_admin peut voir un diff visuel entre deux versions d'un template publié
- **VER-02**: Super_admin peut rollback vers une version précédente (exploite ADR-108)

## Out of Scope

| Feature                                    | Raison                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Ctrl+Z / undo dans le wizard               | Conflit avec le modèle DB-writes-per-step : un undo post-PATCH nécessiterait un rollback DB complexe — hors scope v3 |
| Sliders `scaleFrom`/`scaleTo` exposés      | Anti-feature confirmé : les paramètres numériques d'animation déroutent les non-techniques                           |
| Saisie CSS libre dans le field editor      | Trop technique pour le persona cible (Daisy, designer externe)                                                       |
| Collaboration multi-utilisateur temps réel | Complexité élevée, aucun besoin produit identifié                                                                    |
| Upload CLI `template:import` supprimé      | Reste actif pour seeding bulk exceptionnel                                                                           |
| Refonte `TemplateRuntime.tsx`              | Moteur v2 inchangé par décision ADR-110                                                                              |
| Génération de thumbnail automatique        | Non défini dans SPEC v3 — déféré à Phase C+ décision explicite                                                       |

## Traceability

| Requirement | Phase       | Status         |
| ----------- | ----------- | -------------- |
| ASSET-01    | Phase 1 (A) | Pending        |
| ASSET-02    | Phase 1 (A) | Done (plan 01) |
| ASSET-03    | Phase 1 (A) | Done (plan 01) |
| WIZARD-01   | Phase 1 (A) | Pending        |
| WIZARD-02   | Phase 1 (A) | Pending        |
| WIZARD-03   | Phase 1 (A) | Pending        |
| WIZARD-04   | Phase 1 (A) | Pending        |
| WIZARD-05   | Phase 1 (A) | Pending        |
| DUP-01      | Phase 1 (A) | Pending        |
| DUP-02      | Phase 1 (A) | Done (plan 01) |
| PREV-01     | Phase 2 (B) | Pending        |
| PREV-02     | Phase 2 (B) | Pending        |
| PREV-03     | Phase 2 (B) | Pending        |
| UX-01       | Phase 2 (B) | Pending        |
| UX-02       | Phase 2 (B) | Pending        |
| UX-03       | Phase 2 (B) | Pending        |
| PUB-01      | Phase 3 (C) | Pending        |
| PUB-02      | Phase 3 (C) | Pending        |
| TEST-01     | Phase 1 (A) | Done (plan 01) |
| TEST-02     | Phase 1 (A) | Done (plan 01) |
| TEST-03     | Phase 3 (C) | Pending        |
| TEST-04     | Phase 1 (A) | Done (plan 01) |

**Coverage:**

- v1 requirements : 22 total
- Mapped to phases : 22
- Unmapped : 0 ✓

---

_Requirements defined: 2026-05-05_
_Last updated: 2026-05-05 — milestone v3.0 initial definition (ADR-110 + research)_
