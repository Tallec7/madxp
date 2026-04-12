# ADR-050: Onglet Contenu unifié Pi/SaaS — Statuts vidéo et hiérarchie inversée

**Date** : 2026-04-12
**Statut** : Accepté
**Format** : Complet
**Supersède partiellement** : ADR-022 (restructuration UX onglet Contenu)

---

## Contexte

L'ADR-022 a restructuré l'onglet Contenu autour du pipeline vidéo (health bar, loop-manager unifié, validation). Mais deux problèmes persistent :

1. **La bibliothèque vidéo n'a pas de sens clair en SaaS**. Sur Pi, elle montre l'inventaire des fichiers physiques sur le disque. Sur SaaS, elle montre des vidéos cloud sans indication de leur utilisation. L'utilisateur ne comprend pas lesquelles sont actives.

2. **Le modèle mental Pi et SaaS diverge**. Le concept de "déployer" (transférer un fichier sur un Pi) n'existe pas en SaaS, mais l'UX reste calquée dessus — badges ⏳, boutons 🚀, section "Pending deployments".

3. **Le flux d'ajout de contenu par le club n'est pas visible**. Un club uploade une vidéo mais ne voit pas clairement son statut : est-elle programmée ? disponible en stock ? dans quelle boucle ?

4. **Les sessions SaaS étaient toujours à 0**. Le player générait des session_id locaux (`session_xxx`) rejetés par `uuid.validate()` côté serveur. Fix : le player SaaS crée maintenant une vraie `club_session` via `POST /api/analytics/sessions`.

## Décision

Enrichir l'onglet Contenu avec un **modèle unifié Pi/SaaS** en 3 phases :

### Phase 1 — Badges statut & propriétaire dans la bibliothèque (immédiat)

Ajouter à la bibliothèque vidéo existante :

- **Colonne "Statut"** : calculée dynamiquement depuis la config active
  - ✅ Boucle — vidéo dans `sponsors[]` ou `loopVideos[]`
  - ✅ Catégorie — vidéo dans `categories[].videos[]`
  - ✅ Sponsor — liée à un `site_sponsor` actif
  - ⬜ Disponible — uploadée mais pas dans la config
  - ⏳ À déployer — cloud uniquement, pas sur le Pi (Pi only)
- **Colonne "Propriétaire"** :
  - 🔒 NEOPRO — `category = 'NEOPRO'`
  - 🏠 Club — `uploaded_for_site_id` = site
  - 📢 Sponsor — `advertiser_id` != null
  - 👤 Admin — upload opérateur/admin
- **Bouton [+ Boucle]** sur les vidéos ⬜ Disponible
- **Compteur résumé** : "X/Y programmées · Z disponibles"
- **Filtre par statut** : Tous / Programmées / Disponibles

### Phase 2 — Inversion de hiérarchie (PI-2)

Réordonner les sections :

1. ① Programmation (boucle + phases) — en haut
2. ② Stock vidéo (bibliothèque enrichie) — au milieu
3. ③ Catégories & télécommande (fusionnées) — en dessous
4. ④ Avancé (analytics, 2nd écran, JSON, drafts) — collapsed

### Phase 3 — Loop-manager visuel (PI-2/3)

Cards visuelles, drag & drop, bouton [+ Ajouter depuis le stock].

## Alternatives rejetées

- **Supprimer la bibliothèque sur SaaS** : rejeté car le club a besoin de voir son parc vidéo, préparer des uploads avant de programmer, et nettoyer les vidéos obsolètes.
- **Deux UX séparées Pi/SaaS** : rejeté car cela doublerait la maintenance et le modèle mental (bibliothèque → programmation → écran) est le même.
- **Fusionner immédiatement bibliothèque + config** : rejeté car trop risqué sans d'abord valider les statuts (Phase 1).

## Conséquences

- **Positif** : UX cohérente Pi/SaaS, le club comprend l'état de ses vidéos, les vidéos non utilisées sont identifiables
- **Positif** : Le portail club bénéficie automatiquement (réutilise `site-content-tab`)
- **Risque** : La Phase 2 (réordonnancement) peut casser des smoke tests qui valident l'ordre des sections

## Différences Pi vs SaaS (exhaustif)

| Fonctionnalité               | Pi                | SaaS             |
| ---------------------------- | ----------------- | ---------------- |
| Bouton principal             | "Déployer"        | "Enregistrer"    |
| Statut ⏳ À déployer         | Visible           | Masqué           |
| Encart Synchro Pi            | Visible           | Masqué           |
| Bouton 🚀 Déployer vidéo     | Visible           | Masqué           |
| Draft + historique           | Drafts + versions | config_history   |
| Pending deployments          | Visible           | Masqué           |
| Rafraîchir depuis le Pi      | Header            | Masqué           |
| Boucle, catégories, sponsors | Identique         | Identique        |
| Écran secondaire             | Selon abonnement  | Selon abonnement |
| Analytics mapping            | Admin/operator    | Admin/operator   |
| Upload                       | Identique         | Identique        |
| Portail club (reuse)         | Identique         | Identique        |

## Liens avec les autres onglets

- **Sponsors** : crée les `site_sponsors` → vidéos sponsor apparaissent dans la boucle ici
- **Profils** : le profil actif détermine quelle config est éditée → switch = recharge contenu
- **État** : métriques (sessions, vidéos jouées) = résultat de la programmation faite ici
- **Abonnement** : feature gates (écran secondaire, multi-profils, analytics avancés)
- **Paramètres** : `config.settings` (overlay, watermark, hotspot) — même JSONB mais section séparée

## Fichiers impactés

### Phase 1

- `central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts` — colonnes Statut et Propriétaire
- `central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts` — calcul des statuts depuis la config
- `central-dashboard/src/app/features/sites/components/site-content-tab/video-manager/video-manager.component.ts` — propagation statuts + action [+ Boucle]

### Fix sessions SaaS (déjà déployé)

- `raspberry/src/app/services/analytics.service.ts` — `startSession()` crée une vraie `club_session` via POST
- `raspberry/src/app/components/tv/tv.component.ts` — réordonne `loadSiteId()` avant `startSession()`

## Références

- [ADR-022](ADR-022-content-tab-ux-restructuration.md) — Restructuration initiale (Fév 2026)
- [ADR-037](ADR-037-saas-browser-mode.md) — Mode SaaS navigateur
- [ADR-039](ADR-039-subscription-feature-gates.md) — Feature gates par abonnement

---

_Créé le 12 avril 2026_
