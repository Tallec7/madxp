# Personae Neopro

> **Audience** : futur PM (jour 1 = lecture obligatoire) + futur CTO (comprendre les humains derrière le code) + Daisy (référence partagée pour challenger les décisions)
>
> **Statut** : Live | **Dernière revue** : 2026-05-01 | **Source** : interview Daisy 2026-04-25 + benchmark `docs/strategy/BENCHMARK-COMPETITORS.md`
>
> **Convention de lecture** :
>
> - 🟢 = persona active aujourd'hui en prod (ARR confirmé)
> - 🟡 = persona partiellement servie aujourd'hui (besoin connu, outil à venir)
> - 🔮 = persona anticipée (modèle préparé, pas encore client réel — à valider terrain)
>
> **À lire en parallèle** — [docs/product/USE-CASES.md](product/USE-CASES.md) regroupe 4 couches qui complètent ce doc :
> - 📋 **§1 JTBD** (Christensen) — _quel job le persona embauche-t-il Neopro pour faire ?_
> - 🎬 **§2 Scénarios multi-acteurs** — _comment plusieurs personae se coordonnent dans un parcours réel_
> - 🗂️ **§3 Catalogue atomique CU** — 44 cas d'usage avec ID stables (`CU-3b-1`, etc.) — _que fait chaque persona, atomiquement_
> - 🛣️ **§4 Journey maps émotionnels** — 3 journeys clés avec courbe émotionnelle — _comment c'est ressenti dans le temps_

## Comment lire ce doc

Chaque persona suit un format unique pour comparaison facile :

- **En une phrase** : qui est cette personne dans la vraie vie
- **Frustration #1 sans Neopro** : la douleur qu'on résout
- **Moment "wow" avec Neopro** : l'instant où il/elle se dit _"c'est exactement ce que je voulais"_
- **Interactions Neopro** : par quels touchpoints (dashboard, remote, mail auto, écran)
- **Fréquence d'usage** : daily / weekly / matchday / monthly
- **Source d'info** : terrain confirmé / hypothèse à valider — un PM saura quoi interviewer en priorité
- **Cas d'usage** : liste des CUs liés (détails dans [`docs/product/USE-CASES.md`](product/USE-CASES.md) §3)

---

## 1. 🟢 Super_admin (Daisy / futur PM / futur CTO)

**En une phrase** : la personne qui pilote l'ensemble du parc Neopro, gère contenus + accès + annonceurs, fait office de support N1 quand un client appelle.

**Frustration #1 sans Neopro** :

> _"Je porte tout le support pour 7 sites en parallèle dans ma tête, sans aucun process formel — chaque incident NLF un samedi soir m'arrive sur mon Slack perso et je dois switcher de contexte instantanément, même quand je suis en famille."_

**Moment "wow" avec Neopro** :

> _"Mon Slack #neopro-alerts reste calme tout un week-end NLF, je ne touche pas à Railway une seule fois, et lundi matin Grafana me confirme que les 7 sites ont tourné sans incident — la flotte se débrouille sans moi pour la première fois."_

**Interactions Neopro** : Dashboard super_admin (gestion sites, users, contenus, advertisers, monitoring) + Grafana + Slack alerts + accès SSH Pi en dernier recours

**Fréquence d'usage** : daily

**Source d'info** : ✅ terrain confirmé (Daisy elle-même)

---

## 2. 🟢 Admin Support

**En une phrase** : opérateur Neopro qui a une vue d'ensemble du parc, gère les droits d'accès, crée les nouveaux sites, prend en charge le support distant niveau 1.

**Frustration #1 sans Neopro** :

> _"Je dois aider les clubs à se dépatouiller rapidement en cas de problème — sans outil unifié, je perds 30 minutes à comprendre quel site, quelle version, quel symptôme exact."_

**Moment "wow" avec Neopro** :

> _"Un président de club m'appelle paniqué à 19h45 'la TV est noire' — je vois en 30 secondes sur le dashboard que son Pi est juste en train de redémarrer après une coupure ENEDIS, je peux le rassurer avant qu'il rappelle, sans jamais me déplacer ni me connecter en SSH."_

**Interactions Neopro** : Dashboard admin (vue parc, gestion sites/users), monitoring temps réel (heartbeat Pi, status Pi/SaaS), commandes remote (restart kiosk, rotate PSK, etc.)

**Fréquence d'usage** : daily

**Source d'info** : 🟡 hypothèse renforcée par les capacités code (admin-ops.service.ts, admin-state.store.ts) — à valider en interview client si admin externe existe

---

## 3. 🟢 Représentant club (3 sous-personas)

> ⚠️ Ce qui était auparavant un seul persona "Président / Resp com" est en réalité **trois métiers distincts** dans un club ambitieux. Ils n'achètent pas la même fonctionnalité, n'ont pas les mêmes KPI, et un PM qui interview "le club" sans les distinguer rate la moitié des signaux.

---

### 3a. 🟢 Président / Dirigeant club

**En une phrase** : décideur d'achat qui paie la facture Neopro et attend une retombée image + sponsoring sans toucher à l'opérationnel — souvent bénévole engagé qui voit Neopro comme un investissement stratégique pour le club.

**Frustration #1 sans Neopro** :

> _"J'investis 5 000€/an dans un outil pour le club, je veux savoir si mes sponsors sont contents et si on a monté en gamme face aux clubs voisins. Aujourd'hui je n'ai aucun KPI clair, juste des retours d'oreille — et quand un sponsor part en fin de saison, je découvre la raison après coup."_

**Moment "wow" avec Neopro** :

> _"Tous les trimestres je reçois un PDF de 4 pages avec les impressions sponsors agrégées, le taux de fidélisation des partenaires, le nombre de prospects sponsoring entrants — je peux le présenter en bureau directeur sans avoir touché à l'outil moi-même."_

**Interactions Neopro** : Mail trimestriel automatique (rapport stratégique club), accès dashboard club en lecture (KPI agrégés, jamais le Studio), Remote en tribune les soirs de gala — délègue tout l'opérationnel à 3b/3c.

**Fréquence d'usage** : monthly (lecture rapport) — jamais opérationnel quotidien

**Source d'info** : ✅ terrain confirmé (NLF — président engagé) | 🟡 à valider pour les clubs où le président est moins technique

---

### 3b. 🟢 Responsable communication / Community manager club

**En une phrase** : créatif·ve salarié·e ou bénévole expérimenté·e qui produit le contenu matchday du club et anime les réseaux sociaux — l'utilisateur quotidien le plus intensif côté Studio.

**Frustration #1 sans Neopro** :

> _"Je veux que mes habillages matchday aient l'air pro comme un club de Ligue A, mais je n'ai ni le budget After Effects ni le temps d'apprendre. Je passe mes vendredis soir à bricoler des templates Canva qui ne ressemblent à rien sur l'écran géant, et le lundi je n'ai plus d'énergie pour les réseaux sociaux."_

**Moment "wow" avec Neopro** :

> _"Le vendredi je crée 5 templates de faits de jeu en 30 minutes dans le Studio, ils tournent automatiquement le samedi soir avec le score live, et le lundi mes highlights sont prêts pour Instagram/TikTok sans que j'aie touché à un logiciel d'édition vidéo — je reprends ma vie le dimanche."_

**Interactions Neopro** : Dashboard club intensif (Studio Remotion, scénarios matchday, calendrier diffusion), preview avant déploiement, sortie vidéo highlights post-match (LATER — réseaux sociaux automatisés)

**Fréquence d'usage** : daily en saison (préparation contenus) + intensif les jours de match

**Source d'info** : ✅ terrain confirmé (NLF + autres clients) — c'est cette persona qui justifie l'investissement Template Studio v2

**Cas d'usage** *(détails dans [docs/product/USE-CASES.md §3.1](product/USE-CASES.md#-31--cus-détaillés--persona-3b-resp-communication--community-manager-club))* :

| ID | Titre | Fréquence | Statut |
|---|---|---|---|
| [`CU-3b-1`](product/USE-CASES.md#-cu-3b-1--préparation-matchday-hebdomadaire) | Préparation matchday hebdomadaire | weekly | 🟢 |
| [`CU-3b-2`](product/USE-CASES.md#-cu-3b-2--animation-live-pendant-le-match) | Animation live pendant le match | matchday | 🟢 |
| [`CU-3b-3`](product/USE-CASES.md#-cu-3b-3--habillage-saison--charte-graphique-club) | Habillage saison / charte graphique club | once + ajustements | 🟢 |
| [`CU-3b-4`](product/USE-CASES.md#%EF%B8%8F-cu-3b-4--highlights--posts-réseaux-sociaux-post-match) | Highlights + posts réseaux sociaux post-match | weekly | 🛣️ LATER |
| [`CU-3b-5`](product/USE-CASES.md#-cu-3b-5--communication-hors-match) | Communication hors-match | weekly | 🟢 |
| [`CU-3b-6`](product/USE-CASES.md#-cu-3b-6--coordination-avec-3c-sponsors-dans-la-programmation) | Coordination avec 3c (sponsors dans la programmation) | weekly | 🟡 |

**Journey associé** : [Journey 1 — Matchday du Resp communication NLF](product/USE-CASES.md#-41--journey-1--matchday-du-resp-communication-nlf)

---

### 3c. 🟡 Responsable partenaires / sponsoring club

**En une phrase** : commercial·e du club (salarié·e ou élu·e bénévole) responsable de fidéliser les sponsors actuels et d'en prospecter de nouveaux — le ROI sponsor est sa raison d'être.

**Frustration #1 sans Neopro** :

> _"Je perds des sponsors qui me reprochent 'on ne sait pas si notre logo est vu' — et je n'arrive pas à vendre des packs premium parce que je n'ai aucune data pour justifier l'écart de prix entre une bannière statique et un placement vidéo. Je présente des screenshots PowerPoint à des prospects qui haussent les épaules."_

**Moment "wow" avec Neopro** :

> _"Je signe un nouveau partenaire à 8K€/an au lieu de 3K€ parce que je lui montre en rendez-vous un dashboard live des impressions de mes sponsors actuels — et le mois suivant il reçoit son propre rapport ROI qui justifie sa décision auprès de son directeur."_

**Interactions Neopro** : Dashboard sponsors club (gestion contrats, rotation pondérée, packs bronze/argent/or), portail sponsor partagé en lecture, export PDF pour rendez-vous commercial, rapport mensuel auto envoyé aux sponsors actuels

**Fréquence d'usage** : weekly (préparation rendez-vous + suivi reporting) + intensif en période de renégociation contrats annuels

**Source d'info** : 🟡 capacité code prête (sponsor weighted rotation, sponsor reports) — à valider en interview avec un resp partenaires de club semi-pro

**Lien stratégique** : c'est cette persona qui transforme Neopro d'un "outil tech" en "levier commercial" — sans elle, le ROI sponsor n'est pas activé côté client.

**Cas d'usage** *(détails dans [docs/product/USE-CASES.md §3.2](product/USE-CASES.md#-32--cus-détaillés--persona-3c-resp-partenaires--sponsoring-club))* :

| ID | Titre | Fréquence | Statut |
|---|---|---|---|
| [`CU-3c-1`](product/USE-CASES.md#-cu-3c-1--prospection-nouveaux-sponsors) | Prospection nouveaux sponsors | weekly | 🟡 |
| [`CU-3c-2`](product/USE-CASES.md#-cu-3c-2--renégociation-annuelle-des-contrats) | Renégociation annuelle des contrats | seasonal peak | 🟡 |
| [`CU-3c-3`](product/USE-CASES.md#-cu-3c-3--construction-des-packs-commerciaux) | Construction des packs commerciaux | once + ajustements | 🟡 |
| [`CU-3c-4`](product/USE-CASES.md#-cu-3c-4--onboarding-nouveau-sponsor-signé) | Onboarding nouveau sponsor signé | événementiel | 🟡 |
| [`CU-3c-5`](product/USE-CASES.md#-cu-3c-5--reporting-mensuel-automatique-aux-sponsors-actuels) | Reporting mensuel automatique aux sponsors actuels | monthly | 🟡 |
| [`CU-3c-6`](product/USE-CASES.md#-cu-3c-6--allocation-des-emplacements-premium) | Allocation des emplacements premium | weekly | 🟡 |
| [`CU-3c-7`](product/USE-CASES.md#-cu-3c-7--animation-relationnelle-vip--soirées-partenaires) | Animation relationnelle VIP / soirées partenaires | event-based | 🟡 |
| [`CU-3c-8`](product/USE-CASES.md#-cu-3c-8--reporting-institutionnel-pour-6c-collectivités) | Reporting institutionnel pour 6c (collectivités) | semestriel | 🟡 |

**Journeys associés** : [Journey 2 — Prospection nouveau sponsor](product/USE-CASES.md#-42--journey-2--prospection-dun-nouveau-sponsor-par-le-resp-partenaires) + [Journey 3 — Mois 1 sponsor PME](product/USE-CASES.md#-43--journey-3--mois-1-dune-pme-régionale-qui-devient-sponsor)

---

## 4. 🟢 Staff bénévole jour de match

**En une phrase** : la personne (souvent un parent / un fan / un jeune) qui a accepté de "tenir le score" 3 heures pour aider le club, sans formation préalable, sans compte dashboard.

**Frustration #1 sans Neopro** :

> _"On me demande de gérer le score sur la TV mais je n'ai jamais de formation et la dernière fois j'ai planté l'écran 10 minutes en plein match. En plus je dois être fixe derrière un ordinateur tout le temps avec une connexion internet."_

**Moment "wow" avec Neopro** :

> _"Je clique sur une vidéo manuelle sur la télécommande, elle se lance à l'écran instantanément, et personne ne s'aperçoit que je n'ai aucune formation. Quand la table de marque ajoute du score, je vois l'info en live sur la télécommande et l'écran est à jour automatiquement — je peux suivre le match au lieu d'être collé à un ordi."_

**Interactions Neopro** : Remote uniquement (smartphone ou tablette en tribune) — aucun dashboard

**Fréquence d'usage** : matchday uniquement (1-2× par semaine en saison)

**Source d'info** : ✅ terrain confirmé (observé sur sites NLF + autres)

---

## 5. 🟢🔮 Spectateur en tribune

**En une phrase** : le supporter / parent / ami du joueur dans la tribune qui vient regarder le match — l'utilisateur final business de Neopro, même s'il n'a aucune interaction logicielle aujourd'hui.

**Frustration #1 sans Neopro (et même AVEC Neopro V1)** :

> _"Je suis dans la tribune, je vois les pubs sponsors qui défilent en boucle pendant la mi-temps, mais elles ne me parlent jamais directement — je ne peux ni cliquer, ni participer, ni gagner quoi que ce soit. Pendant ce temps mon téléphone est dans ma main."_

**Moment "wow" avec Neopro V2 (roadmap LATER #1 — QR/jeu)** :

> _"À la mi-temps je scanne le QR code affiché sur l'écran, je tape mon prono 'NLF gagne 28-25', mon prénom apparaît sur l'écran géant 30 secondes plus tard avec les autres pronostiqueurs — je crie avec mes voisins quand je suis dans le top 3 des gagnants à la fin du match."_

**Interactions Neopro** :

- 🟢 Aujourd'hui : passif, regarde l'écran (exposition pubs + score live)
- 🔮 Demain : QR code → mini-app web mobile (pronostic, jeu, vote MVP, donation sponsor)

**Fréquence d'usage** : matchday uniquement (audience captive ~2h)

**Pourquoi cette persona est business-critique** : c'est le seul utilisateur final dont l'engagement justifie le pricing premium des sponsors. Cf. `BENCHMARK-COMPETITORS.md` : _"un spectateur dans un gymnase est plus engagé qu'un piéton devant un abribus → inventaire publicitaire premium"_.

**Source d'info** : ✅ visible terrain (passif) | 🔮 hypothèse pour la version interactive (à tester en MVP)

---

## 6. 🟡 Sponsor local du club (3 sous-personas)

> ⚠️ Un commerçant à 1 500€/an et une PME régionale à 15K€/an n'ont **pas du tout les mêmes attentes**. Mêmes touchpoints techniques côté Neopro, mais format de reporting et niveau d'exigence radicalement différents. À distinguer pour calibrer le Sponsor Portal V1 (NEXT #2) et le pricing des packs.

---

### 6a. 🟡 Commerçant de proximité

**En une phrase** : artisan, restaurateur, garage, agence immo locale qui sponsorise le club du coin pour 500€-2 000€/an — geste de soutien autant que stratégie marketing.

**Frustration #1 sans Neopro** :

> _"Je donne 1 500€/an au club parce que mon fils y joue et que c'est important pour le quartier. Mais quand ma femme me demande 'tu as vu ton logo passer hier ?' je réponds 'aucune idée'. Je n'attends pas un dashboard pro mais juste un signe que ça vit, sinon l'année prochaine je remets en question le chèque."_

**Moment "wow" avec Neopro** :

> _"Tous les mois je reçois une photo de mon logo sur l'écran du gymnase avec une phrase 'votre logo a été vu 8 400 fois ce mois-ci pendant les matches' — c'est suffisant pour que je sache que c'est utile et que je renouvelle sans hésiter l'année prochaine."_

**Interactions Neopro** : Mail mensuel auto (format light : 1 photo + 1 chiffre clé) — pas de portail web, pas de login, pas d'export PDF

**Fréquence d'usage** : monthly (lecture mail seulement)

**Source d'info** : 🟡 hypothèse forte (typologie majoritaire des sponsors clubs amateurs) — à valider terrain par PM via 5 sponsors NLF de cette catégorie

---

### 6b. 🟡 PME régionale

**En une phrase** : PME en croissance (5-50 salariés, ex: cabinet d'expertise comptable régional, banque locale, constructeur, distributeur auto) qui finance plusieurs clubs en région pour 5K-20K€/an et attend un reporting professionnel.

**Frustration #1 sans Neopro** :

> _"Je sponsorise 4 clubs régionaux pour un budget total de 35K€/an. Mon directeur marketing me demande tous les ans de justifier ce poste face au DAF, et je n'ai que des photos de tribune et un mail 'merci' du président. À ce rythme on va recentrer sur du Google Ads où au moins j'ai des chiffres."_

**Moment "wow" avec Neopro** :

> _"Je reçois un rapport mensuel consolidé sur mes 4 clubs : impressions totales, breakdown par club, taux de présence aux matches, comparatif Q-1 — je peux le présenter en COMEX et défendre mon budget sport sans complexe par rapport au digital."_

**Interactions Neopro** : Portail web sponsor (login, multi-clubs si applicable, dashboard impressions, export PDF mensuel), peut demander des A/B tests sur les visuels

**Fréquence d'usage** : monthly (lecture rapport) + ponctuel (rendez-vous club, négociation annuelle)

**Source d'info** : 🟡 hypothèse forte (segment cible identifié dans benchmark) — à valider via 2-3 interviews PME sponsors NLF

**Lien stratégique** : c'est le segment qui justifie le pricing premium des packs sponsors et qui ouvre la porte à la persona 7 (annonceur réseau) — un sponsor PME satisfait sur 1 club devient prescripteur sur 4 clubs.

---

### 6c. 🔮 Partenaire institutionnel (collectivité)

**En une phrase** : mairie, conseil départemental, conseil régional, communauté de communes qui finance le club via subvention ou contrat de partenariat — logique politique/territoriale, pas commerciale.

**Frustration #1 sans Neopro** :

> _"On verse 25K€/an au club et notre logo doit être visible 'lors des matches' selon la convention de partenariat. Quand un élu de l'opposition demande au conseil 'qu'est-ce qu'on a en retour de cet argent public ?', je peux juste dire 'leur logo est dans la salle'. Pas terrible quand on rend des comptes aux contribuables."_

**Moment "wow" avec Neopro** :

> _"Je reçois un rapport semestriel certifié 'logo collectivité affiché X heures cumulées, Y impressions estimées' que je peux annexer au rapport d'activité de la convention de partenariat — c'est de l'audit-grade, pas du marketing."_

**Interactions Neopro** : Mail/portail rapport semestriel formaté pour usage administratif, possibilité de visualiser les heures précises de diffusion (preuve de respect de la convention de partenariat)

**Fréquence d'usage** : semestrielle (revue convention) + ponctuelle (rapport sur demande élus)

**Source d'info** : 🔮 anticipation (segment moins documenté, à valider via prospection ciblée mairies sportives type "ville sportive partenaire")

**Lien stratégique** : canal de distribution massif si on signe une mairie qui équipe ses 5 clubs locaux d'un coup — modèle "ville sportive partenaire Neopro" à explorer en M6+.

---

## 7. 🔮 Annonceur région/national

**En une phrase** : marque (Decathlon, marque locale, banque sportive, etc.) qui veut acheter de l'exposition publicitaire sur un réseau de clubs sportifs en France, sans négocier club par club.

**Frustration #1 sans Neopro** :

> _"J'ai 50 clubs partenaires en France et je dois envoyer mes vidéos par WeTransfer un par un, sans savoir si elles passent vraiment. Je ne sais pas si mes spots ont été vus, devant combien de personnes."_

**Moment "wow" avec Neopro** :

> _"J'upload ma vidéo Decathlon une seule fois sur le dashboard Neopro, je coche les 50 clubs où je veux la diffuser, et 30 minutes plus tard elle tourne partout — j'ai un compteur impressions qui monte en temps réel par club, sans WeTransfer ni mail."_

**Interactions Neopro** : Dashboard annonceur dédié (upload contenu, sélection clubs/régions/dates, dashboard impressions temps réel, rapports PDF mensuels), API REST publique (intégration côté annonceur)

**Fréquence d'usage** : weekly (campagnes en cours) + monthly (reporting)

**Source d'info** : 🔮 hypothèse marketing — à valider via signature 1er annonceur réseau (objectif post-PM)

**Lien stratégique** : déclenche le revenu Neopro côté pub réseau (modèle 2 niveaux régie publicitaire — cf. `docs/business/REGIE_TOUT_EN_UN.md`)

---

## 8. 🔮 Régie publicitaire

**En une phrase** : société qui vend des espaces pub d'autres médias/supports (équivalent JCDecaux pour les arènes) — achète en gros des inventaires Neopro qu'elle redistribue à ses propres annonceurs.

**Frustration #1 sans Neopro** :

> _"Je vends des espaces pub sur 30 clubs sportifs partenaires, mais chaque annonceur que je revends doit pouvoir tracker ses propres impressions sans voir celles des autres — et aujourd'hui je leur fais des screenshots Excel à la main chaque mois."_

**Moment "wow" avec Neopro** :

> _"Le 1er du mois je reçois automatiquement les rapports d'impressions de mes 10 annonceurs sur les 30 clubs, séparés par contrat, prêts à être envoyés à mes clients — je passe 2h à les valider au lieu d'une journée à les fabriquer un par un sous Excel."_

**Interactions Neopro** : Dashboard régie multi-tenant (gestion annonceurs sous-jacents, allocation inventaires multi-clubs, rapports automatiques séparés par contrat, gestion permissions cloisonnées)

**Fréquence d'usage** : daily (gestion campagnes en cours) + monthly (validation reporting)

**Source d'info** : 🔮 anticipation marché (pas de client régie à date) — capacité Neopro multi-tenant déjà prête côté code (cf. ADR-037 + workflow agency/advertiser/club ADR-035), à activer commercialement

---

## 9. 🟡 Agence multi-clubs

**En une phrase** : agence sport-marketing locale ou régionale qui gère plusieurs clubs simultanément — l'équivalent d'un "Représentant club × N clubs", avec besoin de rapidité et de cloisonnement strict.

**Frustration #1 sans Neopro** :

> _"Je suis responsable com pour 5 clubs régionaux qui m'ont délégué leur outil. Le samedi je dois me connecter sur 5 dashboards séparés (5 logins, 5 onglets), préparer 5 setups quasi-identiques, et un client m'a déjà reproché un mélange de pubs entre 2 clubs."_

**Moment "wow" avec Neopro** :

> _"Je me connecte avec un seul login sur le dashboard Neopro, je vois mes 5 clubs en bandeau supérieur, je bascule de l'un à l'autre en un clic sans risque de mélanger les pubs ou les sponsors — un samedi soir je gère 3 matches en parallèle depuis ma cuisine."_

**Interactions Neopro** : Dashboard agency multi-tenant (single sign-on N clubs, switcher contextuel, vue consolidée parc, alertes croisées, templates partagés)

**Fréquence d'usage** : daily

**Source d'info** : 🟡 capacité code prête (workflow agency multi-tenant existe), à valider commercialement avec une agence partenaire pilote

---

## 10. 🔮 Fédération sportive / Ligue

**En une phrase** : autorité institutionnelle (ex: LNH, FFHB, FFBB, etc.) qui supervise N clubs affiliés et peut négocier un partenariat global avec Neopro et avec des annonceurs nationaux pour le compte de tous ses membres.

**Frustration #1 sans Neopro** :

> _"Ma ligue représente 28 clubs pro. J'ai un partenariat ligue avec 3 grands annonceurs nationaux (Lidl, Crédit Agricole, etc.) qui doivent diffuser dans TOUS les arènes des clubs membres, sans que chaque club ait à le négocier individuellement. Aujourd'hui je leur envoie une liste Excel des contacts club et ils se débrouillent — résultat : exécution chaotique et invendable comme offre globale."_

**Moment "wow" avec Neopro** :

> _"Je signe un partenariat ligue avec Lidl pour 'présence dans les 28 arènes', je clique 'pousser à tous les clubs membres' depuis mon dashboard Fédération, et la semaine suivante je reçois le rapport agrégé d'impressions national — je peux vendre des packs ligue cohérents pour la première fois."_

**Interactions Neopro** : Dashboard fédération (gestion clubs affiliés, partenariats institutionnels poussés en cascade, reporting agrégé national, branding fédéral white-label)

**Fréquence d'usage** : weekly (suivi partenariats) + saisonnier (négociation annuelle)

**Source d'info** : 🔮 anticipation stratégique — canal de distribution massif. Si la LNH dit "tous nos clubs prennent Neopro", tu signes 28 clubs en 1 contrat. Mais clubs subis = engagement plus faible → arbitrage commercial à faire.

**Lien stratégique** : `BENCHMARK-COMPETITORS.md` identifie les certifications/partenariats fédéraux (FFBB, FIBA) comme avantage Bodet/Stramatel à rattraper. Cette persona est un levier de rattrapage si on signe une fédération en partenariat exclusif.

---

## Synthèse pour interview PM/CTO

### Tableau comparatif des 14 personae

| #   | Persona                    | Statut | Touchpoint principal                 | Fréquence                | Action prio PM jour 1                        |
| --- | -------------------------- | ------ | ------------------------------------ | ------------------------ | -------------------------------------------- |
| 1   | Super_admin                | 🟢     | Dashboard super_admin                | daily                    | (interne — Daisy/futur PM)                   |
| 2   | Admin Support              | 🟢     | Dashboard admin                      | daily                    | Interview pour mesurer charge support        |
| 3a  | Président / Dirigeant club | 🟢     | Mail trimestriel + dashboard lecture | monthly                  | **PM jour 1 : interview NLF président**      |
| 3b  | Resp communication club    | 🟢     | Dashboard club + Studio              | daily en saison          | **PM jour 1 : interview NLF resp com**       |
| 3c  | Resp partenaires club      | 🟡     | Dashboard sponsors + portail         | weekly + intensif renégo | PM mois 1 : interview resp partenaires NLF   |
| 4   | Staff bénévole             | 🟢     | Remote uniquement                    | matchday                 | PM mois 1 : observation terrain matchday     |
| 5   | Spectateur tribune         | 🟢🔮   | Écran (passif) → QR (futur)          | matchday                 | PM mois 2 : test MVP QR/jeu                  |
| 6a  | Commerçant de proximité    | 🟡     | Mail auto light (photo + chiffre)    | monthly                  | PM mois 1 : interview 3 commerçants sponsors |
| 6b  | PME régionale              | 🟡     | Portail web sponsor + PDF            | monthly                  | PM mois 1 : interview 2 PME sponsors         |
| 6c  | Partenaire institutionnel  | 🔮     | Rapport semestriel audit-grade       | semestrielle             | PM mois 4+ : prospecter 1ère mairie pilote   |
| 7   | Annonceur national         | 🔮     | Dashboard annonceur                  | weekly + monthly         | PM mois 3 : signer 1er annonceur réseau      |
| 8   | Régie publicitaire         | 🔮     | Dashboard régie multi-tenant         | daily + monthly          | PM mois 6+ : prospecter 1ère régie           |
| 9   | Agence multi-clubs         | 🟡     | Dashboard agency multi-tenant        | daily                    | PM mois 4 : prospecter 1ère agence pilote    |
| 10  | Fédération / Ligue         | 🔮     | Dashboard fédération                 | weekly + saison          | PM mois 6+ : approcher LNH/FFHB              |

### Pour le pitch en 30 secondes

> _"Neopro sert 14 personae sur 3 niveaux : (1) les utilisateurs club — président, resp com, resp partenaires, bénévole — qui pilotent leur matchday avec des attentes très différentes selon leur métier, (2) les bénéficiaires indirects qui monétisent l'audience — du commerçant local à la fédération nationale, en passant par la PME régionale, le partenaire institutionnel, l'annonceur réseau, la régie et l'agence multi-clubs, (3) le spectateur final dont l'engagement justifie tout le pricing. Aujourd'hui on sert solidement les utilisateurs club et l'admin support ; on ouvre progressivement les segments sponsors et le spectateur interactif au fil de la roadmap NEXT et LATER."_

### TODO Daisy persistants

- [ ] Valider terrain les 4 personae 🔮 (annonceur national, régie, fédération, spectateur interactif) avec interviews directes — task PM jour 1
- [ ] Documenter les 7 sites actifs nominativement (`docs/CLIENTS.md` privé) avec leur(s) persona(e) référent(e)(s)
- [ ] Confirmer que l'admin support (persona 2) est externe à Daisy ou est rempli par Daisy elle-même aujourd'hui
