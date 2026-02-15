# ADR-022: Restructuration UX de l'onglet Contenu (Site Detail)

**Date** : Février 2026
**Statut** : Accepté
**Décideurs** : Guillaume Le Tallec

---

## Contexte

L'onglet Contenu de la page Site Detail est la page la plus dense du dashboard (13 sections en scroll vertical). Elle porte toute la stratégie de collecte de data sponsors.

**Problème business** : La majorité des clubs utilisent uniquement la boucle par défaut. Or les analytics ne s'enregistrent que via les boucles temporelles (avant-match, match, après-match). Résultat : 0 impression trackée pour les sponsors sur ces clubs.

**Problème UX** : Le chemin de moindre résistance (upload → boucle par défaut → déployer) mène à 0 data. L'interface ne guide pas vers les boucles par phase et les 13 sections semblent indépendantes alors qu'elles forment un pipeline : Bibliothèque → Boucles → Télécommande → Analytics.

**Objectif** : Chaque choix UX doit pousser l'utilisateur vers les boucles par phase + analytics mappées = data sponsors fiable sur 100% des clubs.

## Décision

**Option B retenue** — Restructuration complète, déployée progressivement P0→P3.

## Options

### Option A : Améliorations incrémentales (warnings + tooltips)

**Principe** : Ajouter des warnings et indicateurs sur la page existante sans toucher à la structure.

- Warning sur la boucle par défaut quand elle contient des sponsors
- Tooltips explicatifs ("Pertinentes" = vidéos dans la config ou sur le Pi)
- Badge "Non mappé" plus visible sur les catégories analytics
- Fix du bug "NaN undefined"

**Avantages** :

- Effort minimal, déployable en quelques jours
- Pas de risque de régression sur la structure existante
- Mesurable rapidement (taux d'adoption des boucles par phase)

**Inconvénients** :

- Ne résout pas le problème structurel (13 sections déconnectées)
- La boucle par défaut reste le chemin de moindre résistance
- Le preview télécommande reste mal positionné

**Estimation effort** : Faible (2-3 jours)

### Option B : Restructuration complète de la page ✅

**Principe** : Réorganiser la page autour du pipeline vidéo, inverser la hiérarchie boucle par défaut / boucles par phase, ajouter un bandeau de santé et de la validation.

#### Changements structurels

1. **Bandeau de santé en haut de page** — Stepper horizontal cliquable :

   ```
   ① Bibliothèque (101 vidéos) → ② Boucles (3 phases ✅) → ③ Télécommande (5 cat. ✅) → ④ Analytics (⚠️ 5 non mappés)
   ```

   Badge ⚠️ sur le maillon faible + message d'alerte contextuel.

2. **Fusion boucle par défaut + boucles par phase** en une seule section avec tabs :
   - 3 tabs primaires : Avant-match, Match, Après-match
   - 1 tab secondaire : Boucle par défaut (visuellement réduit, label "fallback", warning "pas de data")
   - Bouton "Répartir automatiquement" : copie la boucle par défaut dans les 3 phases et la vide (sauf NEOPRO)

3. **Réordonnancement des sections** en pipeline logique :
   - Actuel : Bibliothèque → Preview → Boucle défaut → Catégories → Télécommande → Boucles phase → Analytics
   - Proposé : Bibliothèque → Catégories → Boucles (unifié) → Télécommande → Analytics

4. **Preview télécommande sticky** : panneau latéral 70/30 sur grand écran ou FAB flottant

5. **Validation de cohérence** avant déploiement (bloc style CI) :
   - ✅ Toutes les vidéos des boucles sont sur le Pi
   - ⚠️ 3 vidéos sponsors ne sont dans aucune boucle
   - ⚠️ Catégorie "FOCUS PARTENAIRE" non mappée en analytics
   - ❌ Catégorie "ENTRÉE" assignée à Avant-match mais vide (0 vidéo)

#### Améliorations ciblées

6. **Auto-suggestion analytics** : "FOCUS PARTENAIRE" → placeholder "Sponsor", "JINGLE" → "Jingle"
7. **Durées dans les boucles** : colonne durée + footer "Durée totale : 4min38 · ~13 rotations/heure"
8. **Compteurs d'impact** : "72 vidéos trackées · 2 en fallback non tracké"
9. **Historique des modifications** : log qui/quand pour ajouts/retraits de vidéos dans les boucles
10. **Tooltips sur filtres** : explication de "Pertinentes" et autres filtres

**Avantages** :

- Résout le problème structurel (pipeline visible)
- Inverse la hiérarchie : les phases deviennent le chemin par défaut
- La validation empêche les configs cassées silencieusement
- L'historique fournit un audit trail pour les annonceurs

**Inconvénients** :

- Effort significatif, restructuration de la page
- Risque de régression sur les workflows existants
- Nécessite des tests E2E pour valider la refonte
- L'historique des modifications nécessite du backend (central-server)

**Estimation effort** : 2-3 semaines (implémentation progressive par priorité)

### Option C : Wizard guidé (onboarding step-by-step)

**Principe** : Remplacer la page par un wizard step-by-step qui force l'utilisateur à configurer dans l'ordre.

**Avantages** :

- Garantit que chaque étape est complétée
- Impossible de sauter les boucles par phase ou l'analytics

**Inconvénients** :

- Trop contraignant pour les utilisateurs expérimentés
- Les opérateurs reviennent souvent modifier un seul élément, pas tout reconfigurer
- Incompatible avec le workflow actuel d'édition en place

**Estimation effort** : 3-4 semaines

## Recommandation

**Option B (restructuration complète)**, déployée progressivement :

| Priorité | Items                                                                                        | Scope                        | Statut        |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------- |
| 🔴 P0    | Fix "NaN undefined" + warning boucle par défaut                                              | Bug fix + levier stratégique | ✅ Implémenté |
| 🟠 P1    | Bandeau de santé + fusion boucles + bouton répartir auto + validation cohérence              | Restructuration page         | ✅ Implémenté |
| 🟡 P2    | Preview sticky + auto-suggestion analytics + réordonnancement sections + durées dans boucles | Améliorations ciblées        | ✅ Implémenté |
| 🟢 P3    | Compteurs d'impact + tooltips                                                                | Polish                       | ✅ Implémenté |
| 🟢 P3    | Historique modifications                                                                     | Backend (central-server)     | ⏳ Différé    |

Chaque priorité est déployable indépendamment. P0 peut sortir en 1-2 jours. P1 en 1 semaine.

## Impact cross-composant

| Composant         | Changements                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| central-dashboard | Restructuration du `site-content-tab.component`, nouveau `loop-manager.component` (fusion boucle défaut + phases), bandeau de santé, validation cohérence, compteurs d'impact, preview sticky FAB, auto-suggestion analytics, durées dans boucles, tooltips |
| central-server    | Historique des modifications (P3, différé) : nouveau endpoint + table pour logger les changements de config                                                                                                                                                 |
| raspberry         | Aucun impact — les boucles par phase et la boucle par défaut fonctionnent déjà côté Pi                                                                                                                                                                      |

## Références

- [site-content-tab.component.ts](../../central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts) — Composant principal de l'onglet Contenu
- [loop-manager.component.ts](../../central-dashboard/src/app/features/sites/components/loop-manager/loop-manager.component.ts) — Gestion unifiée des boucles (défaut + phases)
- [video-library.component.ts](../../central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts) — Bibliothèque vidéo
- [remote-preview.component.ts](../../central-dashboard/src/app/features/sites/components/remote-preview/remote-preview.component.ts) — Preview télécommande
- Plan UX détaillé : [Notion — Plan UX Onglet Contenu](https://www.notion.so/308c27de363881cd9b9ac26046dec2b9)

---

_Créé le 15 février 2026 · Implémenté le 15 février 2026_
