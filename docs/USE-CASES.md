# Cas d'usage Neopro

> **Audience** : futur PM (mapping backlog produit ↔ besoins réels) + futur CTO (priorisation tech) + Daisy (pilotage).
>
> **Statut** : Live | **Dernière revue** : 2026-04-27 | **Source** : `PERSONAE.md` + interview Daisy 2026-04-25 + benchmark `docs/strategy/BENCHMARK-COMPETITORS.md`
>
> **Rôle de ce doc** : `PERSONAE.md` répond à *"qui ?"*, `USE-CASES.md` répond à *"quoi ?"*, `JOURNEYS.md` (à venir) répond à *"quand / comment ressenti dans le temps ?"*. Les 3 sont x-référencés.

## Comment lire ce doc

### Convention d'identifiant

`CU-<persona>-<num>` — exemples :
- `CU-3b-1` = 1er cas d'usage du persona 3b (resp communication club)
- `CU-3c-5` = 5e cas d'usage du persona 3c (resp partenaires club)
- `CU-1-1` = 1er cas d'usage du persona 1 (super_admin)

Les ID sont **stables** : on n'en supprime pas, on en ajoute. Si un CU devient obsolète, on le marque `🗄️ ARCHIVÉ` mais on garde l'ID pour préserver les liens roadmap / specs / commits.

### Convention de statut

| Emoji | Statut | Signification |
|---|---|---|
| 🟢 | NOW | Couvert en prod aujourd'hui, vérifié terrain |
| 🟡 | PARTIAL | Capacité code prête mais usage pas activé / pas généralisé |
| 🔮 | NEXT | Prévu roadmap NEXT (M0-3) |
| 🛣️ | LATER | Prévu roadmap LATER (M3+) |
| ❌ | GAP | Identifié comme besoin, ni couvert ni planifié — à arbitrer |
| 🗄️ | ARCHIVÉ | CU obsolète, conservé pour traçabilité historique |

### Format d'un CU

Pour chaque CU :
- **Titre + ID + statut**
- **Persona(s) concernée(s)** : principale + secondaires si applicable
- **Fréquence** : daily / weekly / monthly / matchday / event-based / once+ajustements
- **Touchpoint** : surface produit (Dashboard club, Studio, Remote, portail sponsor, mail auto, etc.)
- **Sans Neopro** : la frustration / situation actuelle (1 phrase)
- **Avec Neopro** : le wow / résultat (1 phrase)
- **Composants produit affectés** : pointers vers `docs/specs/` ou ADR
- **Métriques de succès** *(si applicable)* : KPI mesurable

---

## Index par persona

| Persona | CUs détaillés | Total CUs | Doc dédié |
|---|---|---|---|
| 1. Super_admin | 0 | 4 | `PERSONAE.md` §1 |
| 2. Admin Support | 0 | 4 | `PERSONAE.md` §2 |
| 3a. Président club | 0 | 2 | `PERSONAE.md` §3a |
| **3b. Resp communication club** | **6** | **6** | `PERSONAE.md` §3b |
| **3c. Resp partenaires club** | **8** | **8** | `PERSONAE.md` §3c |
| 4. Staff bénévole | 0 | 2 | `PERSONAE.md` §4 |
| 5. Spectateur tribune | 0 | 3 | `PERSONAE.md` §5 |
| 6a. Commerçant proximité | 0 | 1 | `PERSONAE.md` §6a |
| 6b. PME régionale | 0 | 2 | `PERSONAE.md` §6b |
| 6c. Partenaire institutionnel | 0 | 1 | `PERSONAE.md` §6c |
| 7. Annonceur national | 0 | 3 | `PERSONAE.md` §7 |
| 8. Régie publicitaire | 0 | 3 | `PERSONAE.md` §8 |
| 9. Agence multi-clubs | 0 | 2 | `PERSONAE.md` §9 |
| 10. Fédération / Ligue | 0 | 3 | `PERSONAE.md` §10 |
| **TOTAL** | **14** | **44** | |

> **Note** : les CUs des personas 1, 2, 3a, 4, 5, 6a-c, 7, 8, 9, 10 sont actuellement en **stubs** (titre + statut + 1-2 phrases). Priorité de détaillage à arbitrer avec le PM jour 1.

## Index par statut roadmap

| Statut | Count | CUs |
|---|---|---|
| 🟢 NOW | 13 | CU-1-1 à 1-4, CU-2-1 à 2-4, CU-3b-1, CU-3b-2, CU-3b-3, CU-3b-5, CU-4-1, CU-4-2, CU-5-1 |
| 🟡 PARTIAL | 11 | CU-3a-1, CU-3a-2, CU-3b-6, CU-3c-1 à 3c-7, CU-9-1, CU-9-2 |
| 🔮 NEXT (M0-3) | 5 | CU-6a-1, CU-6b-1, CU-6b-2, CU-3c-8 partiel |
| 🛣️ LATER (M3+) | 14 | CU-3b-4, CU-5-2, CU-5-3, CU-6c-1, CU-7-1 à 7-3, CU-8-1 à 8-3, CU-10-1 à 10-3 |
| ❌ GAP | 0 | — |

## Index par composant produit

| Composant | CUs principaux |
|---|---|
| Dashboard super_admin | CU-1-1 à 1-4 |
| Dashboard admin support | CU-2-1 à 2-4 |
| Dashboard club (lecture KPI) | CU-3a-1, CU-3a-2 |
| **Studio Remotion (Template Studio v2)** | **CU-3b-1, CU-3b-3, CU-3b-5, CU-3c-7** |
| **Scénarios matchday + Remote** | **CU-3b-2, CU-4-1, CU-4-2, CU-3c-7** |
| **Réseaux sociaux post-match (LATER)** | **CU-3b-4** |
| **Coordination Studio ↔ rotation pondérée sponsors** | **CU-3b-6, CU-3c-6** |
| **Dashboard sponsors (rotation pondérée + packs)** | **CU-3c-1 à 3c-6** |
| **Portail sponsor + mail mensuel auto** | **CU-3c-5, CU-6a-1, CU-6b-1, CU-6b-2** |
| Rapport semestriel collectivité | CU-3c-8, CU-6c-1 |
| Écran TV passif (pubs + score) | CU-5-1 |
| QR mini-app interactive (LATER) | CU-5-2, CU-5-3 |
| Dashboard annonceur réseau | CU-7-1 à 7-3 |
| Dashboard régie multi-tenant | CU-8-1 à 8-3 |
| Dashboard agency multi-tenant | CU-9-1, CU-9-2 |
| Dashboard fédération white-label | CU-10-1 à 10-3 |

---

## Catalogue détaillé

### Persona 1 — Super_admin

#### 🟢 CU-1-1 : Monitoring de la flotte en parallèle
- **Persona** : 1 (Super_admin)
- **Fréquence** : daily
- **Touchpoint** : Dashboard super_admin + Grafana + Slack alerts
- **Sans Neopro** : *"Je porte tout le support pour 7 sites en parallèle dans ma tête, sans process formel — chaque incident NLF un samedi soir m'arrive sur Slack perso."*
- **Avec Neopro** : *"Slack #neopro-alerts reste calme tout un week-end NLF, lundi matin Grafana confirme que les 7 sites ont tourné sans incident."*
- **Composants** : Dashboard super_admin, alerting Prometheus, Grafana

#### 🟢 CU-1-2 : Onboarding d'un nouveau site Pi/SaaS
- **Persona** : 1
- **Fréquence** : monthly (croissance flotte)
- **Touchpoint** : Dashboard super_admin (création site, génération api_key, association club)
- **Sans Neopro** : *"Provisionner un nouveau Pi prenait 2h de SSH manuel."*
- **Avec Neopro** : *"Création site dashboard → api_key auto → image Pi flashée prête → boot et déclaration spontanée à la flotte."*
- **Composants** : `central-server/sites.controller.ts`, install.sh Pi

#### 🟢 CU-1-3 : Gestion users / advertisers / agencies
- **Persona** : 1
- **Fréquence** : weekly
- **Touchpoint** : Dashboard super_admin (CRUD users + permissions multi-tenant)
- **Sans Neopro** : *"Gestion manuelle dans Excel, risque d'attribution croisée."*
- **Avec Neopro** : *"CRUD avec scopes multi-tenant ADR-035/041/042, audit log automatique."*
- **Composants** : multi-profile auth, ADR-035

#### 🟢 CU-1-4 : Support client N0 (escalade depuis 2)
- **Persona** : 1 (escalade depuis 2)
- **Fréquence** : weekly
- **Touchpoint** : Slack + dashboard + accès SSH Pi en dernier recours
- **Sans Neopro** : *"Tout incident terminait sur le Slack perso de Daisy."*
- **Avec Neopro** : *"L'admin support N1 résout 80%, Daisy intervient sur escalade documentée."*
- **Composants** : (process opérationnel)

---

### Persona 2 — Admin Support

#### 🟢 CU-2-1 : Support distant N1 sur incident club
- **Persona** : 2
- **Fréquence** : daily
- **Touchpoint** : Dashboard admin (vue parc, logs heartbeat) + commandes remote
- **Sans Neopro** : *"30 min de mail/téléphone pour comprendre quel site, quelle version, quel symptôme."*
- **Avec Neopro** : *"Président panique 'TV noire à 19h45' → en 30 sec dashboard montre Pi en redémarrage post-coupure ENEDIS, je rassure sans déplacement."*
- **Composants** : `admin-ops.service.ts`, heartbeat Pi

#### 🟢 CU-2-2 : Création nouveau site (délégué par 1)
- **Persona** : 2
- **Fréquence** : monthly
- **Touchpoint** : Dashboard admin (formulaire création site)
- **Composants** : sites.controller, voir CU-1-2

#### 🟢 CU-2-3 : Vue parc temps réel (heartbeat tous sites)
- **Persona** : 2
- **Fréquence** : daily
- **Touchpoint** : Dashboard admin (carte flotte + status Pi/SaaS)
- **Composants** : `admin-state.store.ts`, monitoring service

#### 🟢 CU-2-4 : Commandes remote (restart kiosk, rotate PSK, etc.)
- **Persona** : 2
- **Fréquence** : weekly
- **Touchpoint** : Dashboard admin → command queue → Pi sync-agent
- **Composants** : `commandQueueService`, `sync-agent`, ADR-074 (rotate_psk)

---

### Persona 3a — Président / Dirigeant club

#### 🟡 CU-3a-1 : Lecture rapport stratégique trimestriel
- **Persona** : 3a (principale) + 3c (générateur)
- **Fréquence** : monthly (lecture mail)
- **Touchpoint** : mail trimestriel + dashboard club en lecture
- **Sans Neopro** : *"Aucun KPI clair sur l'efficacité des sponsors, juste retours d'oreille — quand un sponsor part en fin de saison, raison découverte après coup."*
- **Avec Neopro** : *"PDF 4 pages avec impressions sponsors agrégées, taux de fidélisation, prospects sponsoring entrants — présentable en bureau directeur."*
- **Statut** : 🟡 capacité reporting prête côté code, format trimestriel à industrialiser
- **Composants** : sponsor reports, dashboard club lecture

#### 🟡 CU-3a-2 : Validation budget Neopro en bureau directeur
- **Persona** : 3a
- **Fréquence** : annual
- **Touchpoint** : PDF rapport + dashboard club en démo
- **Sans Neopro** : *"Décision prise sur ressenti, opposition possible en bureau."*
- **Avec Neopro** : *"Renouvellement validé sur data : x% de fidélisation sponsors, y prospects entrants attribuables à la visibilité."*
- **Statut** : 🟡 data disponible, mise en forme dédiée à confirmer

---

### Persona 3b — Responsable communication / Community manager club

> **6 CUs détaillés ci-dessous** — c'est cette persona qui justifie l'investissement Template Studio v2.

#### 🟢 CU-3b-1 : Préparation matchday hebdomadaire
- **Persona** : 3b
- **Fréquence** : weekly
- **Touchpoint** : Studio + scénario match
- **Sans Neopro** : *"Chaque vendredi je repars de zéro sur Canva — 4h pour refaire faits de jeu / intro joueurs / bandeau sponsors, rien n'est réutilisable d'une semaine sur l'autre."*
- **Avec Neopro** : *"Je clone le scénario de la semaine dernière, j'actualise les noms des joueurs, je preview, je déploie en 45 min — le samedi soir tourne tout seul."*
- **Composants** : Template Studio v2 (`docs/templates/`), scénarios matchday
- **Métriques** : temps préparation matchday < 1h (vs 4h sans)

#### 🟢 CU-3b-2 : Animation live pendant le match
- **Persona** : 3b (avec délégation possible à 4)
- **Fréquence** : matchday
- **Touchpoint** : Remote en tribune (smartphone/tablette)
- **Sans Neopro** : *"Pendant le match collé au PC de régie au lieu de profiter de l'ambiance — chaque transition manuelle, je rate la moitié des moments forts."*
- **Avec Neopro** : *"Avec la Remote sur tablette je suis en tribune, je déclenche les célébrations sur les buts en temps réel, et la mi-temps part toute seule à 25:00."*
- **Composants** : Remote, scénarios matchday, ADR-093 match sessions
- **Métriques** : 0 PC de régie nécessaire, 100% des moments forts couverts

#### 🟢 CU-3b-3 : Habillage saison / charte graphique club
- **Persona** : 3b
- **Fréquence** : once + ajustements
- **Touchpoint** : Studio (templates de base + variables club)
- **Sans Neopro** : *"Quand le club change de sponsor maillot, je reprends 30 templates Canva un par un — 2 jours pour une modif qui devrait prendre 10 min."*
- **Avec Neopro** : *"La charte club est définie une fois dans le Studio, tous les templates en héritent — 1 modif → cascade automatique sur la flotte."*
- **Composants** : Template Studio v2 (variables club), `template_fonts`, ADR-086

#### 🛣️ CU-3b-4 : Highlights + posts réseaux sociaux post-match
- **Persona** : 3b
- **Fréquence** : weekly post-match
- **Touchpoint** : Studio → export auto Insta/TikTok
- **Sans Neopro** : *"Dimanche midi je monte les highlights manuellement pendant que mes proches déjeunent — je poste lundi 14h, engagement divisé par 3."*
- **Avec Neopro** : *"À la fin du match Neopro pousse automatiquement le clip 'score final + meilleur moment' sur les réseaux du club, engagement Insta x4 vs publication lundi."*
- **Statut** : 🛣️ LATER — Remotion async render existe (ADR-054/055), intégration RS à faire
- **Composants** : Template Studio + nouveau service "social publisher"
- **Métriques** : engagement Insta cible x4

#### 🟢 CU-3b-5 : Communication hors-match
- **Persona** : 3b
- **Fréquence** : weekly
- **Touchpoint** : calendrier diffusion (Studio + scheduler)
- **Sans Neopro** : *"L'écran tourne en boucle sur les pubs entre les matches — pas d'outil pour planifier les annonces club (entraînements, AG, résultats jeunes)."*
- **Avec Neopro** : *"Je crée 'AG mercredi 18h' depuis le Studio, programmée 18h-21h les soirs d'ouverture publique — s'affiche sans toucher au reste."*
- **Composants** : Studio, scheduler diffusion, calendrier programmation

#### 🟡 CU-3b-6 : Coordination avec 3c (sponsors dans la programmation)
- **Persona** : 3b (consommateur) + 3c (configurateur)
- **Fréquence** : weekly
- **Touchpoint** : Dashboard sponsors en lecture (rotation pondérée définie par 3c)
- **Sans Neopro** : *"Resp partenaires me dit 'fais passer Decathlon plus souvent en mi-temps' — sans outil partagé je dois deviner, 2-3 allers-retours par semaine."*
- **Avec Neopro** : *"Resp partenaires configure la rotation pondérée côté dashboard, mes scénarios matchday lisent automatiquement les emplacements alloués — contrat respecté par construction."*
- **Statut** : 🟡 rotation pondérée prête côté code, intégration scénario matchday à industrialiser
- **Composants** : sponsor weighted rotation, scénarios matchday
- **Voir aussi** : CU-3c-6 (perspective miroir)

---

### Persona 3c — Responsable partenaires / sponsoring club

> **8 CUs détaillés ci-dessous** — c'est cette persona qui transforme Neopro d'un "outil tech" en "levier commercial".

#### 🟡 CU-3c-1 : Prospection nouveaux sponsors
- **Persona** : 3c
- **Fréquence** : weekly
- **Touchpoint** : export PDF + dashboard live en RDV
- **Sans Neopro** : *"Prospection avec un PPT de 2023 et 3 photos de tribune — quand le prospect demande 'combien voient mon logo par mois ?' aucune réponse, il part sur du Google Ads."*
- **Avec Neopro** : *"En RDV je sors mon ordi sur Neopro live : '12 800 impressions/mois sur 18 matches, breakdown par contrat' — le prospect signe à 8K€/an au lieu des 3K€ habituels."*
- **Composants** : sponsor stats, dashboard live, export PDF
- **Métriques** : ticket moyen 3K€ → 8K€ (×2,7)

#### 🟡 CU-3c-2 : Renégociation annuelle des contrats
- **Persona** : 3c
- **Fréquence** : seasonal peak (juin)
- **Touchpoint** : rapports ROI 12 mois
- **Sans Neopro** : *"Juin = 3 semaines à fabriquer des bilans Excel, beaucoup ne renouvellent pas faute d'arguments."*
- **Avec Neopro** : *"Clic 'rapport annuel sponsor X', PDF 8 pages avec impressions cumulées + courbe d'évolution + comparatif anonymisé — taux de reconduction 60% → 85%."*
- **Composants** : sponsor reports annuels, comparatifs anonymisés
- **Métriques** : taux reconduction 60% → 85%

#### 🟡 CU-3c-3 : Construction des packs commerciaux
- **Persona** : 3c
- **Fréquence** : once + ajustements
- **Touchpoint** : Dashboard sponsors / rotation pondérée
- **Sans Neopro** : *"Tous sponsors au même tarif faute de différencier 'logo bandeau' et 'spot vidéo mi-temps' — marge laissée à chaque renouvellement."*
- **Avec Neopro** : *"4 packs bronze/argent/or/platine avec fréquences et emplacements distincts, dashboard prouve que platine génère 4x plus d'impressions premium — facturation x4 sans débat."*
- **Composants** : sponsor weighted rotation (poids différenciés), dashboard sponsors
- **Métriques** : prix pack platine = 4× pack bronze justifié par data

#### 🟡 CU-3c-4 : Onboarding nouveau sponsor signé
- **Persona** : 3c (avec collab 3b sur intégration visuels)
- **Fréquence** : événementiel
- **Touchpoint** : Dashboard sponsors + Studio
- **Sans Neopro** : *"Sponsor signé mardi → 3 semaines à récupérer logo HD, le faire retoucher, le pousser au resp com — sponsor s'inquiète."*
- **Avec Neopro** : *"Sponsor signé mardi, créé dans dashboard mercredi avec logo et vidéo, premier rapport reçu samedi soir après son 1er match diffusé — onboarding 4 jours."*
- **Composants** : sponsor onboarding flow, portail sponsor
- **Métriques** : délai onboarding 3 semaines → 4 jours

#### 🟡 CU-3c-5 : Reporting mensuel automatique aux sponsors actuels
- **Persona** : 3c (générateur) + 6a, 6b (lecteurs)
- **Fréquence** : monthly
- **Touchpoint** : mail auto + portail sponsor
- **Sans Neopro** : *"1er du mois : 2 jours à compiler 8 bilans Excel et envoyer un par un — temps perdu pour la prospection."*
- **Avec Neopro** : *"1er du mois : 15 min à vérifier les rapports auto, mot personnalisé pour 2-3 partenaires clés, matinée libérée pour appeler des prospects."*
- **Statut** : 🟡 capacité technique prête (sponsor reports), Sponsor Portal V1 à livrer NEXT M2-3
- **Composants** : sponsor reports CRON, mail auto SendGrid, Sponsor Portal V1
- **Métriques** : temps reporting mensuel 2j → 15 min

#### 🟡 CU-3c-6 : Allocation des emplacements premium
- **Persona** : 3c (configurateur) + 3b (consommateur)
- **Fréquence** : weekly
- **Touchpoint** : Dashboard sponsors (rotation pondérée)
- **Sans Neopro** : *"3 sponsors majeurs veulent tous 'être visibles à mi-temps' — j'arbitre manuellement chaque match, quelqu'un râle inévitablement."*
- **Avec Neopro** : *"Rotation pondérée saisonnière (Decathlon 3x/match mi-temps, banque locale 2x/match bandeau...) — le système tourne, preuve à l'appui en cas de litige."*
- **Composants** : sponsor weighted rotation algo
- **Voir aussi** : CU-3b-6 (perspective miroir)

#### 🟡 CU-3c-7 : Animation relationnelle VIP / soirées partenaires
- **Persona** : 3c
- **Fréquence** : event-based
- **Touchpoint** : Studio + Remote
- **Sans Neopro** : *"Soirée partenaires en loge un soir de match : message écran 'Bienvenue partenaires CA' à mailer au resp com 3 jours à l'avance."*
- **Avec Neopro** : *"Animation événementielle 'soirée VIP CA mardi 20h' depuis le dashboard — s'affiche automatiquement entre 19h45 et 22h sans toucher à la programmation matchday standard."*
- **Composants** : Studio, scheduler diffusion contextuelle

#### 🟡 CU-3c-8 : Reporting institutionnel pour 6c (collectivités)
- **Persona** : 3c (générateur) + 6c (lecteur)
- **Fréquence** : semestriel
- **Touchpoint** : export PDF formaté admin
- **Sans Neopro** : *"Mairie demande son rapport semestriel de visibilité — 1 journée par collectivité, format jamais standard."*
- **Avec Neopro** : *"Clic 'rapport semestriel collectivité' avec dates début/fin, PDF formaté admin (heures cumulées, impressions estimées) — annexable directement à la convention de partenariat."*
- **Statut** : 🟡 partiel — capacité reports existe, format collectivité spécifique à industrialiser
- **Composants** : sponsor reports + nouveau format "audit-grade"
- **Voir aussi** : CU-6c-1 (perspective lecteur)

---

### Persona 4 — Staff bénévole jour de match

#### 🟢 CU-4-1 : Tenir le score live pendant le match
- **Persona** : 4
- **Fréquence** : matchday
- **Touchpoint** : Remote (smartphone/tablette)
- **Sans Neopro** : *"Je gère le score sur la TV mais sans formation, dernière fois j'ai planté l'écran 10 min en plein match. Fixe derrière un ordinateur tout le temps."*
- **Avec Neopro** : *"Score table de marque ajouté en live → l'info passe sur ma Remote → écran à jour automatiquement, je peux suivre le match au lieu d'être collé à un ordi."*
- **Composants** : Remote, ADR-093, score-update.handler

#### 🟢 CU-4-2 : Lancer une vidéo manuelle (entrée équipe, but)
- **Persona** : 4
- **Fréquence** : matchday (multiple/match)
- **Touchpoint** : Remote
- **Sans Neopro** : *"Manipulation OBS bricolée, plante régulièrement."*
- **Avec Neopro** : *"Un clic sur la Remote, vidéo lancée à l'écran instantanément — personne ne s'aperçoit que je n'ai aucune formation."*
- **Composants** : Remote, scénarios matchday

---

### Persona 5 — Spectateur en tribune

#### 🟢 CU-5-1 : Regarder pubs + score sur l'écran (passif)
- **Persona** : 5
- **Fréquence** : matchday (audience captive ~2h)
- **Touchpoint** : Écran TV (passif)
- **Statut** : 🟢 NOW — c'est le mode actuel V1, justifie déjà le pricing sponsor
- **Composants** : TV component, sponsor display

#### 🛣️ CU-5-2 : Scanner QR + jouer un pronostic
- **Persona** : 5
- **Fréquence** : matchday
- **Touchpoint** : QR code écran → mini-app web mobile
- **Sans Neopro V2** : *"Pubs sponsors qui défilent en boucle pendant la mi-temps, ne me parlent jamais directement — je ne peux ni cliquer ni participer ni gagner."*
- **Avec Neopro V2** : *"Scan QR → tape 'NLF gagne 28-25' → mon prénom apparaît sur l'écran géant 30 sec plus tard avec les autres pronostiqueurs — je crie avec mes voisins quand je suis dans le top 3."*
- **Statut** : 🛣️ LATER — élément central du pricing premium V2
- **Composants** : nouveau service mini-app web mobile, intégration écran TV

#### 🛣️ CU-5-3 : Voter pour le MVP du match
- **Persona** : 5
- **Fréquence** : matchday (fin de match)
- **Touchpoint** : QR mini-app
- **Statut** : 🛣️ LATER — variante de CU-5-2

---

### Persona 6a — Commerçant de proximité

#### 🔮 CU-6a-1 : Réception mail mensuel light
- **Persona** : 6a
- **Fréquence** : monthly (lecture mail seulement)
- **Touchpoint** : mail auto (photo + 1 chiffre)
- **Sans Neopro** : *"Donne 1 500€/an au club, ne sait pas si son logo est vu."*
- **Avec Neopro** : *"Mail mensuel avec photo logo écran + 'votre logo a été vu 8 400 fois ce mois-ci' — suffisant pour renouveler sans hésiter."*
- **Statut** : 🔮 NEXT — Sponsor Portal V1 livraison M2-3, format light pour 6a
- **Composants** : Sponsor Portal V1, mail auto SendGrid

---

### Persona 6b — PME régionale

#### 🔮 CU-6b-1 : Lecture portail web sponsor multi-clubs
- **Persona** : 6b
- **Fréquence** : monthly + ponctuel
- **Touchpoint** : portail web (login, dashboard impressions)
- **Sans Neopro** : *"Sponsor 4 clubs régionaux pour 35K€/an total, justifie devant DAF avec photos de tribune."*
- **Avec Neopro** : *"Portail web, login unique, impressions multi-clubs consolidées, breakdown par club, comparatif Q-1 — défendable en COMEX."*
- **Statut** : 🔮 NEXT — Sponsor Portal V1, version multi-clubs en V1.5

#### 🔮 CU-6b-2 : Export PDF mensuel pour COMEX
- **Persona** : 6b
- **Fréquence** : monthly
- **Touchpoint** : portail web (bouton export)
- **Statut** : 🔮 NEXT (lié à CU-6b-1)

---

### Persona 6c — Partenaire institutionnel (collectivité)

#### 🛣️ CU-6c-1 : Réception rapport semestriel audit-grade
- **Persona** : 6c
- **Fréquence** : semestrielle
- **Touchpoint** : portail/mail rapport semestriel
- **Sans Neopro** : *"Convention 25K€/an avec mention 'logo visible lors des matches'. Rapport au conseil municipal sans data."*
- **Avec Neopro** : *"Rapport semestriel certifié 'logo affiché X heures, Y impressions' annexable au rapport d'activité de la convention de partenariat."*
- **Statut** : 🛣️ LATER — segment moins documenté, prospection ciblée mairies sportives à valider
- **Composants** : sponsor reports format audit-grade
- **Voir aussi** : CU-3c-8 (perspective générateur)

---

### Persona 7 — Annonceur national

#### 🛣️ CU-7-1 : Upload vidéo + sélection multi-clubs
- **Persona** : 7
- **Fréquence** : weekly (campagnes)
- **Touchpoint** : Dashboard annonceur dédié
- **Sans Neopro** : *"WeTransfer un par un, 50 clubs partenaires, sans savoir si elles passent."*
- **Avec Neopro** : *"Upload une fois, coche 50 clubs, 30 min plus tard ça tourne partout."*
- **Statut** : 🛣️ LATER — déclenche revenu pub réseau

#### 🛣️ CU-7-2 : Tracking impressions live par club
- **Persona** : 7
- **Fréquence** : daily (campagne en cours)
- **Statut** : 🛣️ LATER

#### 🛣️ CU-7-3 : Reporting PDF mensuel campagne
- **Persona** : 7
- **Fréquence** : monthly
- **Statut** : 🛣️ LATER

---

### Persona 8 — Régie publicitaire

#### 🛣️ CU-8-1 : Allocation inventaires multi-clubs aux annonceurs sous-jacents
- **Persona** : 8
- **Fréquence** : daily
- **Touchpoint** : Dashboard régie multi-tenant
- **Statut** : 🛣️ LATER — capacité multi-tenant prête (ADR-037, workflow agency/advertiser/club ADR-035)

#### 🛣️ CU-8-2 : Reporting cloisonné par contrat
- **Persona** : 8
- **Fréquence** : monthly
- **Statut** : 🛣️ LATER

#### 🛣️ CU-8-3 : Gestion permissions multi-tenant (régie / annonceur / club)
- **Persona** : 8
- **Fréquence** : weekly
- **Statut** : 🛣️ LATER

---

### Persona 9 — Agence multi-clubs

#### 🟡 CU-9-1 : SSO multi-clubs avec switcher contextuel
- **Persona** : 9
- **Fréquence** : daily
- **Touchpoint** : Dashboard agency multi-tenant
- **Sans Neopro** : *"5 clubs régionaux délégués, 5 logins séparés, mélange de pubs entre 2 clubs déjà reproché."*
- **Avec Neopro** : *"Single login, 5 clubs en bandeau supérieur, switch en un clic sans risque de mélange — gestion 3 matches en parallèle depuis ma cuisine."*
- **Statut** : 🟡 capacité code prête (workflow agency multi-tenant), à valider commercialement avec une agence pilote
- **Composants** : ADR-035 (multi-profile), agency workflow

#### 🟡 CU-9-2 : Templates partagés cross-clubs
- **Persona** : 9
- **Fréquence** : weekly
- **Statut** : 🟡 PARTIAL

---

### Persona 10 — Fédération sportive / Ligue

#### 🛣️ CU-10-1 : Push partenariat ligue en cascade aux clubs membres
- **Persona** : 10
- **Fréquence** : seasonal (négociation annuelle)
- **Touchpoint** : Dashboard fédération
- **Sans Neopro** : *"Partenariat Lidl/Crédit Agricole avec 28 clubs membres → liste Excel envoyée aux annonceurs, exécution chaotique."*
- **Avec Neopro** : *"Clic 'pousser à tous les clubs membres', semaine suivante rapport agrégé d'impressions national — packs ligue cohérents pour la première fois."*
- **Statut** : 🛣️ LATER — canal de distribution massif (28 clubs en 1 contrat si LNH/FFHB signe)

#### 🛣️ CU-10-2 : Reporting agrégé national
- **Persona** : 10
- **Fréquence** : monthly + saisonnier
- **Statut** : 🛣️ LATER

#### 🛣️ CU-10-3 : Branding fédéral white-label
- **Persona** : 10
- **Fréquence** : once + ajustements
- **Statut** : 🛣️ LATER

---

## Gaps identifiés (TODO PM jour 1)

### CUs à détailler en priorité (stubs aujourd'hui)

1. **CU-3a-1, CU-3a-2** — Président club (rapport stratégique trimestriel) : industrialiser le format → cible NEXT
2. **CU-1-x** — Super_admin : à étoffer si futur PM doit comprendre les opérations en profondeur
3. **CU-7-x, CU-8-x, CU-10-x** — Personas 🔮 anticipées : à valider terrain avant d'investir détail produit

### Manques à challenger

- **CU "lecture du rapport ROI par un sponsor"** : aujourd'hui implicite dans 6a/6b/6c. Pourrait mériter un CU dédié côté lecteur (vs côté générateur 3c-5).
- **CU "support utilisateur en autonomie"** : un président qui appelle sans pouvoir consulter de FAQ produit. Manque-t-il un CU "self-service support" ?
- **CU "facturation / paiement Neopro"** : qui signe le devis, qui valide la CB, comment un nouveau site SaaS s'active automatiquement ? Pas couvert.
- **CU "changement d'adresse / migration de site"** : un club qui change de gymnase. Edge case fréquent en saison.

## Process de mise à jour

- **Nouveau CU** → ajouter avec ID `CU-<persona>-<num+1>`, mettre à jour les 3 index en haut + table dans `PERSONAE.md`.
- **CU obsolète** → marquer `🗄️ ARCHIVÉ` avec date et raison, ne pas supprimer.
- **CU qui change de statut** (ex: 🔮 → 🟢 quand livré) → mettre à jour l'emoji + index par statut.
- **CU détaillé qui devient stub ou inversement** → mettre à jour count dans index par persona.

---

## Voir aussi

- `docs/PERSONAE.md` — qui sont les utilisateurs (le "qui ?")
- `docs/JOURNEYS.md` *(à venir)* — flow temporel + courbe émotionnelle (le "quand / comment ressenti ?")
- `docs/product/PRD.md` — vision produit
- `docs/product/ROADMAP.md` — priorisation NOW/NEXT/LATER
- `docs/specs/` — specs métier par composant (le "comment ça marche")
- `docs/strategy/BENCHMARK-COMPETITORS.md` — pourquoi ces CUs sont différenciants vs concurrence
