# User Journeys Neopro

> **Audience** : futur PM (ressentir la "vraie vie" d'un samedi soir NLF avant la 1ère interview terrain) + futur CTO (priorisation par moments de douleur) + Daisy (pilotage UX).
>
> **Statut** : Live | **Dernière revue** : 2026-04-27 | **Source** : interview Daisy 2026-04-25 + PERSONAE.md + USE-CASES.md
>
> **Rôle de ce doc** : `PERSONAE.md` répond à *"qui ?"*, `USE-CASES.md` à *"quoi ?"*, `JOURNEYS.md` à *"quand / comment ressenti dans le temps ?"*. Les 3 sont x-référencés.

## Comment lire ce doc

Chaque journey suit le format **agence UX classique** :

- **Trigger** : événement qui déclenche le journey
- **Persona principale** + secondaires impliquées
- **Phases** : chronologiques, avec timeline réelle (ex: vendredi 18h, samedi 14h, lundi 9h)
- **Pour chaque phase** :
  - 🎬 *Action* : ce que la persona fait
  - 💭 *Pensée* : ce qu'elle se dit dans sa tête
  - 😀😐😡 *Émotion* : courbe émotionnelle (joie / neutre / douleur)
  - 📍 *Touchpoint Neopro* : où elle interagit avec le produit
  - ⚠️ *Pain point* : friction identifiée
  - ✨ *Magic moment* : moment de plaisir / wow
- **CUs liés** : pointers vers `USE-CASES.md`
- **Métriques de succès** du journey global

### Convention émotionnelle

Échelle de 1 (douleur extrême) à 5 (joie extrême) :
- 😡 1 — frustration, blocage, panique
- 😟 2 — inconfort, doute
- 😐 3 — neutre, opérationnel
- 🙂 4 — satisfaction, fluidité
- 😀 5 — joie, fierté, wow

Le but d'un journey bien conçu : **transformer les pics 😡 en 😐, et créer 1-2 ✨ moments 😀**.

---

## Journey 1 — Matchday du Responsable communication NLF

> **Persona principale** : 3b (Responsable communication / Community manager NLF)
> **Personas secondaires** : 4 (staff bénévole), 3a (président, supervise à distance), 3c (resp partenaires, attend ses sponsors visibles)
> **Trigger** : un match à domicile samedi 20h (ProD2 handball féminin, ~600 spectateurs attendus)
> **Durée totale** : ~66h, du vendredi 18h au lundi 12h

### Vendredi 18h — Préparation J-2

- 🎬 **Action** : ouvre le Studio Neopro, clone le scénario du match précédent, met à jour 12 noms de joueuses + composition adversaire + sponsors actifs ce match
- 💭 **Pensée** : *"OK, je connais la routine maintenant. Le scénario de la semaine dernière était propre, je l'ajuste."*
- 😀 **Émotion** : 🙂 4 (fluidité, vs 😡 1 il y a 6 mois sur Canva)
- 📍 **Touchpoint** : Studio Remotion (clonage scénario, édition variables club)
- ✨ **Magic moment** : *"Le clone garde mes 4 templates de faits de jeu, je n'ai qu'à actualiser les noms — 45 min total au lieu de 4h."*
- **CUs liés** : `CU-3b-1` (préparation matchday hebdo)

### Vendredi 19h30 — Vérification sponsors

- 🎬 **Action** : ouvre le dashboard sponsors pour vérifier que la rotation pondérée du match prévoit bien le passage Decathlon en mi-temps (engagement contractuel)
- 💭 **Pensée** : *"Le resp partenaires a bien tout configuré ? Je ne veux pas qu'on me reproche d'avoir oublié Decathlon comme la fois où on était sous OBS."*
- 😐 **Émotion** : 3 (vigilance opérationnelle)
- 📍 **Touchpoint** : Dashboard sponsors (lecture rotation pondérée)
- ⚠️ **Pain point résiduel** : la coordination 3b ↔ 3c repose encore sur du bon sens et un bandeau "vue de la rotation" — un dashboard "preview matchday avec sponsors mappés sur le scénario" serait plus rassurant
- **CUs liés** : `CU-3b-6` (coordination avec 3c)

### Samedi 14h — Brief bénévole + dernier check

- 🎬 **Action** : envoie au bénévole jeune (persona 4, lycéen volontaire) un lien Remote pré-configuré, lui explique en 5 min comment déclencher les vidéos manuelles (entrée équipe, but)
- 💭 **Pensée** : *"S'il plante, c'est moi qui prends — mais avec la Remote, le pire qu'il puisse faire c'est cliquer sur la mauvaise vidéo, plus de freeze écran 10 min comme avant."*
- 🙂 **Émotion** : 4 (confiance déléguée)
- 📍 **Touchpoint** : Remote (lien envoyé), brief verbal
- ✨ **Magic moment** : *"En 3 ans on est passés du PowerPoint sur clé USB à 'tu cliques sur ton téléphone'. Le bénévole peut suivre le match au lieu d'être collé à un ordi."*
- **CUs liés** : `CU-4-1`, `CU-4-2`

### Samedi 19h45 — Pré-match

- 🎬 **Action** : déploie le scénario, vérifie que l'écran affiche bien l'intro joueuses, monte en tribune avec sa tablette
- 💭 **Pensée** : *"OK c'est parti — j'ai 600 spectateurs, mes 8 sponsors visibles, le bénévole sur le score live. Je peux profiter."*
- 😀 **Émotion** : 4 (excitation matchday)
- 📍 **Touchpoint** : Studio (déploiement) → Remote en tribune

### Samedi 20h-22h — Pendant le match

- 🎬 **Action** : déclenche les célébrations sur les buts, regarde les sponsors tourner dans le bandeau, intervient si besoin sur la Remote
- 💭 **Pensée** : *"Le but de Léa à la 47e — clic célébration, écran s'allume avec son nom, 600 personnes crient — c'est ça que je veux que ça raconte."*
- 😀 **Émotion** : 5 (fierté, joie)
- 📍 **Touchpoint** : Remote en tribune
- ✨ **Magic moment** : *"Quand mon écran a affiché 'Léa Martinez • 47' avec l'animation flammes 2 secondes après le but, j'ai senti 600 personnes vibrer ensemble. C'est le club que je voulais."*
- **CUs liés** : `CU-3b-2` (animation live), `CU-4-1` (score live par bénévole)

### Samedi 22h05 — Fin de match

- 🎬 **Action** : arrête le scénario matchday, écran passe en boucle pubs/résultat final
- 💭 **Pensée** : *"Bon match. Maintenant les RS — ce serait dingue si Neopro pouvait me sortir le clip auto."*
- 🙂 **Émotion** : 4 (satisfaction post-match)
- 📍 **Touchpoint** : Studio (fin de scénario)
- ⚠️ **Pain point** : le clip RS post-match auto n'existe pas encore (CU-3b-4 est LATER) → elle va passer dimanche midi à le monter à la main

### Dimanche 11h-13h — Highlights manuels

- 🎬 **Action** : monte les highlights pour Insta/TikTok, choisit 3 moments forts, ajoute la charte club
- 💭 **Pensée** : *"Mes proches déjeunent, et moi je suis sur Premiere Pro. Ça devrait être automatique."*
- 😟 **Émotion** : 2 (frustration, sacrifice perso)
- 📍 **Touchpoint** : (hors Neopro — Premiere Pro)
- ⚠️ **Pain point critique** : c'est le pic de douleur résiduel du journey. CU-3b-4 (LATER) résoudra ce moment précis.

### Dimanche 14h — Post Insta

- 🎬 **Action** : poste les highlights sur Insta + TikTok du club
- 💭 **Pensée** : *"Bon, c'est en ligne. L'engagement sera moyen parce qu'on est dimanche après-midi, mais c'est mieux que rien."*
- 😐 **Émotion** : 3 (résigné)

### Lundi 9h — Récap

- 🎬 **Action** : ouvre le dashboard sponsors, regarde les impressions du match
- 💭 **Pensée** : *"Decathlon a bien tourné 6 fois en mi-temps comme prévu — je peux envoyer un mail au resp partenaires pour confirmer."*
- 🙂 **Émotion** : 4 (satisfaction opérationnelle)
- 📍 **Touchpoint** : Dashboard sponsors (lecture stats post-match)
- ✨ **Magic moment** : *"En 30 secondes je sais que tout est passé. Avant je devais reconstituer ça à la main pendant 2h."*

---

### Métriques de succès du journey

| Métrique | Cible | Statut actuel |
|---|---|---|
| Temps préparation J-2 | < 1h | 🟢 ~45 min |
| Pics de stress 😡 (1) en cours de match | 0 | 🟢 0 sur dernier match NLF |
| Magic moments 😀 (5) capturés | ≥ 1 | 🟢 célébration but |
| Délai post Insta vs fin de match | < 2h | 🛣️ ~16h aujourd'hui (dimanche midi) — LATER avec CU-3b-4 |
| Bénévole opérationnel sans formation | 100% | 🟢 confirmé NLF |

### Pain points résiduels à arbitrer

1. **CU-3b-4 LATER (RS post-match)** : pic de douleur dimanche midi, valeur perçue très haute, déjà cité par 2 clubs. À reprioriser NEXT ?
2. **Coordination 3b ↔ 3c (CU-3b-6)** : "preview matchday avec sponsors mappés" manque, repose sur la confiance entre les 2 personas. Ajouter une vue partagée ?

---

## Journey 2 — Prospection d'un nouveau sponsor par le Resp partenaires

> **Persona principale** : 3c (Responsable partenaires NLF)
> **Personas secondaires** : 6b (PME régionale prospectée — un cabinet d'expertise comptable de 25 salariés), 3a (président, signataire final côté club)
> **Trigger** : appel entrant d'un cabinet régional intéressé par "soutenir le sport féminin local"
> **Durée totale** : ~3 semaines, de l'appel à la signature

### Semaine 1 — Premier contact (appel téléphonique)

- 🎬 **Action 3c** : prend l'appel, écoute le brief sponsor (envie d'engagement local + visibilité auprès de PME locales), propose un RDV en physique au club
- 💭 **Pensée 3c** : *"Très bon prospect, ils ont 25 salariés et un budget marketing 'événementiel local' à allouer. Si je signe, c'est un 8K€/an minimum."*
- 🙂 **Émotion** : 4 (excitation commerciale)
- 📍 **Touchpoint** : (téléphone — hors Neopro à ce stade)

### Semaine 1 (J+2) — Préparation du RDV

- 🎬 **Action** : ouvre le dashboard sponsors NLF, prépare un export PDF "Ma régie aujourd'hui" : 8 sponsors actifs, 12 800 impressions/mois moyennes, 18 matches/saison, breakdown par contrat anonymisé
- 💭 **Pensée** : *"Avant je leur sortais un PowerPoint de 2023. Maintenant je leur montre la donnée live de mes sponsors actuels — c'est un autre niveau de crédibilité."*
- 😀 **Émotion** : 5 (confiance pré-RDV)
- 📍 **Touchpoint** : Dashboard sponsors (export PDF)
- ✨ **Magic moment** : *"Le PDF se génère en 2 min, je peux y intégrer une version anonymisée des stats de mes sponsors actuels — preuve sociale par la donnée."*
- **CUs liés** : `CU-3c-1` (prospection)

### Semaine 1 (J+5) — RDV physique au cabinet

- 🎬 **Action** : présentation 30 min, ouvre son ordi sur Neopro live (impressions du dernier match NLF en temps réel), montre la rotation pondérée ("voici comment vous seriez positionné en pack platine")
- 💭 **Pensée** : *"La data live, ils ne s'y attendaient pas. Ils comparent mentalement avec Google Ads et leur partenariat radio locale — Neopro gagne sur la mesure et la prestige."*
- 😀 **Émotion** : 5 (vente en cours)
- 📍 **Touchpoint** : Dashboard sponsors live + démo Studio (montre une animation "Cabinet X — partenaire NLF" générée à la volée)
- ✨ **Magic moment côté prospect (6b)** : *"Quand il a généré une animation 'Cabinet X partenaire NLF' devant moi en 2 min sur le Studio, j'ai vu ce que ça donnerait sur l'écran du gymnase. C'est plus tangible qu'un brief PowerPoint."*
- **CUs liés** : `CU-3c-1`, `CU-3c-3` (packs commerciaux)

### Semaine 2 — Négociation packs

- 🎬 **Action** : envoie 4 propositions packs (bronze 3K€ / argent 5K€ / or 8K€ / platine 12K€) avec breakdown impressions estimées par pack
- 💭 **Pensée** : *"Le dashboard prouve que platine = 4× impressions premium de bronze. Je peux justifier le prix sans débat."*
- 🙂 **Émotion** : 4 (négociation outillée)
- 📍 **Touchpoint** : Dashboard sponsors (config rotation pondérée par pack)
- **CUs liés** : `CU-3c-3` (construction packs)

### Semaine 3 — Signature pack OR à 8K€

- 🎬 **Action 3c** : envoie le contrat, le prospect signe, transmet logo HD et brief créatif
- 💭 **Pensée 3c** : *"8K€ signé. Avant Neopro je lui aurais vendu 3K€ par défaut. Le ROI Neopro pour ma régie : +5K€ sur ce contrat."*
- 😀 **Émotion** : 5 (fierté commerciale)
- 📍 **Touchpoint** : (administratif — hors Neopro)

### Semaine 3 (J+3) — Onboarding express

- 🎬 **Action** : crée le sponsor dans le dashboard, intègre logo + vidéo, génère ses accès portail sponsor, planifie 1ère visibilité au prochain match
- 💭 **Pensée** : *"Mardi signature → samedi premier passage → dimanche soir premier rapport d'impressions reçu par le sponsor. Onboarding 4 jours, c'est ce qui transforme un sponsor 'satisfait' en 'fan' — il va recommander à ses pairs PME."*
- 😀 **Émotion** : 5 (cycle vertueux)
- 📍 **Touchpoint** : Dashboard sponsors (création) + Studio (intégration logo) + portail sponsor (création accès)
- ✨ **Magic moment** : *"Le sponsor reçoit son rapport d'impressions du 1er match dimanche soir, m'appelle lundi matin 'on est super contents, on va vous présenter à 3 partenaires PME du club Rotary'."*
- **CUs liés** : `CU-3c-4` (onboarding)

---

### Métriques de succès du journey

| Métrique | Cible | Statut actuel |
|---|---|---|
| Ticket moyen sponsor | 8K€ vs 3K€ historique | 🟡 anecdotique 1 cas, à confirmer sur 5 prospects |
| Délai signature (premier contact → contrat) | < 4 semaines | 🟢 3 semaines |
| Délai onboarding (signature → 1er rapport) | < 1 semaine | 🟢 4 jours |
| Taux de transformation prospects RDV → signature | > 50% | 🟡 à mesurer (CRM ?) |
| Recommandations entrantes par sponsor satisfait | ≥ 1 sur 12 mois | 🟡 à mesurer |

### Pain points résiduels à arbitrer

1. **Pas de CRM léger intégré** : 3c suit ses prospects sur un Excel → mesure de transformation impossible. CU à créer ? Ou intégration Hubspot ?
2. **Le portail sponsor V1 (CU-3c-5) doit être livré pour que ce journey passe de 🟡 à 🟢** : sans portail, le rapport mensuel auto est en mail simple, moins prestigieux pour un sponsor 8K€/an.

---

## Journey 3 — Mois 1 d'une PME régionale qui devient sponsor

> **Persona principale** : 6b (PME régionale — directeur marketing d'un cabinet d'expertise comptable, 25 salariés, signataire 8K€/an)
> **Personas secondaires** : 3c (resp partenaires NLF, en relation), DAF du cabinet (validation budget interne)
> **Trigger** : signature du contrat sponsor en septembre, premier match diffusé samedi 14 septembre
> **Durée totale** : ~45 jours, de la signature au premier reporting consolidé reçu

### J-30 → J0 — Pré-saison (signature → 1er match)

- 🎬 **Action 6b** : signe le contrat, envoie logo HD et brief, attend le 1er match
- 💭 **Pensée** : *"OK on a signé 8K€/an. Mon DAF m'a dit 'tu m'expliques ce que ça donne dans 6 mois'. Je dois prouver."*
- 😐 **Émotion** : 3 (attente, doute latent)
- 📍 **Touchpoint** : (transmission fichiers par mail — pré-portail)

### J0 (samedi 14 sept, 22h) — Premier match diffusé

- 🎬 **Action** : reçoit un mail "votre logo est passé pour la 1ère fois ce soir au match NLF vs CSM Bucarest, voici les détails"
- 💭 **Pensée** : *"Wow, je ne m'attendais pas à un mail dès ce soir. Habituellement avec mes autres partenariats locaux je n'ai aucun retour."*
- 😀 **Émotion** : 4 (surprise positive)
- 📍 **Touchpoint** : mail auto Neopro (post-match)
- ✨ **Magic moment** : *"Mail reçu samedi soir 22h45 avec photo de mon logo sur l'écran du gymnase et 'votre logo a été affiché 14 fois pendant 2h12 cumulées'. Ce n'est pas un mail générique — c'est ce match précis."*
- **CUs liés** : `CU-3c-5` (reporting auto), `CU-6b-1` (lecture portail)

### J+30 (1er octobre) — Premier rapport mensuel

- 🎬 **Action** : reçoit le rapport mensuel auto sur son portail sponsor (login dédié), explore les stats : 4 matches diffusés en septembre, 56 800 impressions cumulées, breakdown par match
- 💭 **Pensée** : *"C'est plus pro que mon rapport Google Ads. Je peux annexer ce PDF à mon rapport mensuel marketing pour mon DAF."*
- 😀 **Émotion** : 5 (justification budgétaire trouvée)
- 📍 **Touchpoint** : portail sponsor V1 (login + dashboard)
- ✨ **Magic moment** : *"L'export PDF en 2 clics, formaté avec mon logo en couverture, courbes d'impressions par match — j'ai mis ça dans mon rapport DAF du 5 octobre, il a posé zéro question."*
- **CUs liés** : `CU-6b-1`, `CU-6b-2`

### J+45 (mi-octobre) — Conversation déjeuner avec un pair PME

- 🎬 **Action** : déjeune avec le DG d'une PME tech locale (12 salariés), lui parle de son partenariat NLF et du portail Neopro
- 💭 **Pensée** : *"S'il me demande comment ça marche, je peux lui montrer mon portail en direct sur mon téléphone — preuve sociale instantanée."*
- 😀 **Émotion** : 5 (recommandation organique)
- 📍 **Touchpoint** : portail sponsor (démo mobile)
- ✨ **Magic moment côté 3c** : *"3c reçoit un appel le mardi suivant : 'On me parle de votre portail, je peux faire un point avec vous ?' — recommandation organique générée par le portail."*
- **CUs liés** : `CU-6b-1` (portail mobile)

---

### Métriques de succès du journey

| Métrique | Cible | Statut actuel |
|---|---|---|
| Délai 1er rapport reçu post-match | < 24h | 🟡 selon livraison Sponsor Portal V1 |
| Taux d'ouverture mail mensuel auto | > 70% | 🔮 à mesurer post-livraison |
| Taux d'export PDF mensuel | > 50% | 🔮 à mesurer post-livraison |
| Recommandations entrantes par sponsor PME / 12 mois | ≥ 1 | 🟡 anecdotique |
| NPS sponsor à 6 mois | > 50 | 🔮 enquête à instaurer |

### Pain points résiduels à arbitrer

1. **Sponsor Portal V1 (CU-3c-5, CU-6b-1) est NEXT** : sans lui, ce journey reste hypothétique. Priorité absolue M2-3.
2. **Pas de NPS sponsor instauré** : impossible de détecter les insatisfactions latentes avant le non-renouvellement. CU à créer ? Enquête trimestrielle automatisée ?

---

## Synthèse des 3 journeys pour le PM jour 1

### Pics de douleur résiduels (à arbitrer en priorité)

| Journey | Pain point | CU lié | Statut | Reco PM |
|---|---|---|---|---|
| 1 (matchday 3b) | Highlights RS dimanche midi à la main | CU-3b-4 | 🛣️ LATER | Reprioriser NEXT ? Forte valeur perçue, déjà cité par 2 clubs |
| 1 (matchday 3b) | Pas de "preview matchday avec sponsors mappés" | (manque CU) | ❌ GAP | Créer un CU "vue partagée 3b ↔ 3c" |
| 2 (prospection 3c) | Pas de CRM léger intégré pour suivre prospects | (manque CU) | ❌ GAP | Décision : CU dédié ou intégration Hubspot ? |
| 3 (sponsor PME 6b) | Sponsor Portal V1 pas encore livré | CU-3c-5, CU-6b-1 | 🔮 NEXT | Confirmer M2-3 livraison |
| 3 (sponsor PME 6b) | Pas de NPS sponsor instauré | (manque CU) | ❌ GAP | Créer un CU "enquête NPS sponsor trimestrielle" |

### Magic moments à protéger (ne jamais casser)

| Journey | Magic moment | CU |
|---|---|---|
| 1 | Préparation matchday en 45 min vs 4h | CU-3b-1 |
| 1 | Bénévole opérationnel sans formation | CU-4-1, CU-4-2 |
| 1 | Célébration but live en tribune | CU-3b-2 |
| 2 | Démo Studio "animation prospect" générée à la volée en RDV | CU-3c-1, CU-3c-3 |
| 2 | Onboarding sponsor 4 jours signature → 1er rapport | CU-3c-4 |
| 3 | Mail auto post-match 22h45 avec photo logo | CU-3c-5 |
| 3 | Export PDF mensuel formaté DAF | CU-6b-2 |

### Recommandations PM jour 1

1. **Vivre un journey 1 en présentiel** : aller à un match NLF samedi 20h, observer le resp com en tribune avec sa Remote — c'est la meilleure façon de comprendre la magic moment "célébration but".
2. **Interviewer 6b en priorité** : un sponsor PME à 8K€/an est l'unité économique qui justifie tout l'investissement Sponsor Portal. Le journey 3 est le plus hypothétique aujourd'hui — confirmation terrain critique.
3. **Identifier les GAP comme premiers candidats au backlog** : 3 CUs manquants émergent des journeys (preview matchday partagé, CRM léger, NPS sponsor) qui n'étaient pas visibles dans PERSONAE.md ou USE-CASES.md.

---

## Process de mise à jour

- **Nouveau journey** → ajouter en section dédiée, x-référencer aux personas et CUs.
- **Pain point qui devient magic moment** (CU livré qui résout une douleur) → mettre à jour la phase concernée, déplacer le pain point vers les "magic moments à protéger".
- **Métrique de succès qui change de couleur** (🛣️ → 🟢 quand mesurable) → mettre à jour avec date de la première mesure.
- **Tous les 6 mois** : revue terrain pour valider que les journeys décrits matchent toujours la réalité (évolution UX, nouveaux clients, nouveaux usages).

---

## Voir aussi

- `docs/PERSONAE.md` — qui sont les utilisateurs (le "qui ?")
- `docs/USE-CASES.md` — catalogue atomique des CUs (le "quoi ?")
- `docs/product/PRD.md` — vision produit
- `docs/product/ROADMAP.md` — priorisation NOW/NEXT/LATER
- `docs/strategy/BENCHMARK-COMPETITORS.md` — pourquoi ces journeys sont différenciants vs concurrence
