# Personae Neopro

> **Audience** : futur PM (jour 1 = lecture obligatoire) + futur CTO (comprendre les humains derrière le code) + Daisy (référence partagée pour challenger les décisions)
>
> **Statut** : Live | **Dernière revue** : 2026-04-25 | **Source** : interview Daisy 2026-04-25 + benchmark `docs/strategy/BENCHMARK-COMPETITORS.md`
>
> **À lire en parallèle** : [docs/product/USE-CASES.md](product/USE-CASES.md) — JTBD + scénarios multi-acteurs (qui se coordonne avec qui dans un parcours réel : matchday, onboarding, sponsoring, incident…). Ce doc-ci décrit _qui est qui_ ; USE-CASES décrit _comment ils interagissent ensemble_.
>
> **Convention de lecture** :
>
> - 🟢 = persona active aujourd'hui en prod (ARR confirmé)
> - 🟡 = persona partiellement servie aujourd'hui (besoin connu, outil à venir)
> - 🔮 = persona anticipée (modèle préparé, pas encore client réel — à valider terrain)

## Comment lire ce doc

Chaque persona suit un format unique pour comparaison facile :

- **En une phrase** : qui est cette personne dans la vraie vie
- **Frustration #1 sans Neopro** : la douleur qu'on résout
- **Moment "wow" avec Neopro** : l'instant où il/elle se dit _"c'est exactement ce que je voulais"_
- **Interactions Neopro** : par quels touchpoints (dashboard, remote, mail auto, écran)
- **Fréquence d'usage** : daily / weekly / matchday / monthly
- **Source d'info** : terrain confirmé / hypothèse à valider — un PM saura quoi interviewer en priorité

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

**Cas d'usage détaillés** :

#### CU1. Préparation matchday hebdomadaire _(weekly — Studio + scénario match)_

- _Sans Neopro_ : _"Chaque vendredi je repars de zéro sur Canva — 4h pour refaire faits de jeu / intro joueurs / bandeau sponsors, rien n'est réutilisable d'une semaine sur l'autre."_
- _Avec Neopro_ : _"Je clone le scénario de la semaine dernière, j'actualise les noms des joueurs, je preview, je déploie en 45 min — le samedi soir tourne tout seul."_

#### CU2. Animation live pendant le match _(matchday — Remote en tribune)_

- _Sans Neopro_ : _"Pendant le match je suis collé au PC de régie au lieu de profiter de l'ambiance — chaque transition est manuelle et je rate la moitié des moments forts."_
- _Avec Neopro_ : _"Avec la Remote sur ma tablette je suis en tribune, je déclenche les célébrations sur les buts en temps réel, et la mi-temps part toute seule à 25:00."_

#### CU3. Habillage saison / charte graphique club _(once / saison — Studio templates de base)_

- _Sans Neopro_ : _"Quand le club change de sponsor maillot, je reprends 30 templates Canva un par un pour mettre à jour couleurs et logo — 2 jours de boulot pour une modif qui devrait prendre 10 min."_
- _Avec Neopro_ : _"La charte club est définie une fois dans le Studio, tous les templates en héritent — un nouveau partenaire = 1 modif → cascade automatique sur la flotte de visuels."_

#### CU4. 🔮 Highlights + posts réseaux sociaux post-match _(weekly post-match — roadmap LATER)_

- _Sans Neopro_ : _"Le dimanche midi je monte manuellement les highlights pour Insta/TikTok pendant que mes proches déjeunent — je poste lundi 14h, engagement divisé par 3."_
- _Avec Neopro_ : _"À la fin du match Neopro pousse automatiquement le clip 'score final + meilleur moment' sur les réseaux du club, engagement Insta x4 vs publication lundi."_

#### CU5. Communication hors-match _(weekly — calendrier diffusion)_

- _Sans Neopro_ : _"L'écran du gymnase tourne en boucle sur les pubs entre les matches — je voudrais y passer les annonces club (entraînements, AG, résultats jeunes) mais aucun outil simple pour planifier."_
- _Avec Neopro_ : _"Je crée une annonce 'AG mercredi 18h' depuis le Studio, programmée entre 18h et 21h les soirs d'ouverture publique — s'affiche sans toucher au reste."_

#### CU6. Coordination avec 3c (sponsors dans la programmation) _(weekly — dashboard sponsors en lecture)_

- _Sans Neopro_ : _"Le resp partenaires me dit 'fais passer Decathlon plus souvent en mi-temps' — sans outil partagé je dois deviner ce que ça veut dire, on perd 2-3 allers-retours par semaine."_
- _Avec Neopro_ : _"Le resp partenaires configure la rotation pondérée côté dashboard, mes scénarios matchday lisent automatiquement les emplacements alloués — contrat respecté par construction."_

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

**Cas d'usage détaillés** :

#### CU1. Prospection nouveaux sponsors _(weekly — export PDF + dashboard live en RDV)_

- _Sans Neopro_ : _"Je prospecte avec un PPT de 2023 et 3 photos de tribune — quand le prospect demande 'combien de personnes voient mon logo par mois ?' je n'ai aucune réponse, il part sur du Google Ads."_
- _Avec Neopro_ : _"En RDV je sors mon ordi sur Neopro live : '12 800 impressions/mois sur 18 matches, breakdown par contrat' — le prospect signe à 8K€/an au lieu des 3K€ habituels."_

#### CU2. Renégociation annuelle des contrats _(seasonal peak — rapports ROI 12 mois)_

- _Sans Neopro_ : _"En juin chaque sponsor me demande de justifier ses 3K€ — je fabrique des bilans Excel pendant 3 semaines, beaucoup ne renouvellent pas faute d'arguments."_
- _Avec Neopro_ : _"Je clique 'rapport annuel sponsor X', PDF 8 pages avec impressions cumulées + courbe d'évolution + comparatif anonymisé — taux de reconduction passe de 60% à 85%."_

#### CU3. Construction des packs commerciaux _(once + ajustements — dashboard sponsors / rotation pondérée)_

- _Sans Neopro_ : _"Je vends tous mes sponsors au même tarif faute de différencier 'logo bandeau' et 'spot vidéo mi-temps' en termes de visibilité — je laisse de la marge à chaque renouvellement."_
- _Avec Neopro_ : _"Je crée 4 packs bronze/argent/or/platine avec fréquences et emplacements distincts, le dashboard prouve que le pack platine génère 4x plus d'impressions premium — je facture 4x le prix sans débat."_

#### CU4. Onboarding nouveau sponsor signé _(événementiel — dashboard sponsors + Studio)_

- _Sans Neopro_ : _"Sponsor signé mardi → 3 semaines à récupérer son logo HD, le faire retoucher, le pousser au resp com qui l'intègre dans tous les templates — le sponsor s'inquiète avant sa première visibilité."_
- _Avec Neopro_ : _"Sponsor signé mardi, créé dans le dashboard mercredi avec logo et vidéo, premier rapport d'impressions reçu samedi soir après son premier match diffusé — onboarding 4 jours."_

#### CU5. Reporting mensuel automatique aux sponsors actuels _(monthly — mail auto + portail sponsor)_

- _Sans Neopro_ : _"Le 1er du mois : 2 jours à compiler 8 bilans Excel et les envoyer un par un par mail — temps perdu pour la prospection."_
- _Avec Neopro_ : _"Le 1er du mois : 15 min à vérifier les rapports auto envoyés, mot personnalisé pour 2-3 partenaires clés, matinée libérée pour appeler des prospects."_

#### CU6. Allocation des emplacements premium _(weekly — dashboard sponsors)_

- _Sans Neopro_ : _"Mes 3 sponsors majeurs veulent tous 'être visibles à mi-temps' — j'arbitre manuellement chaque match, inévitablement quelqu'un râle."_
- _Avec Neopro_ : _"Je définis une rotation pondérée saisonnière (Decathlon 3x/match mi-temps, banque locale 2x/match bandeau...) — le système tourne, preuve à l'appui en cas de litige."_

#### CU7. Animation relationnelle VIP / soirées partenaires _(event-based — Studio + Remote)_

- _Sans Neopro_ : _"Soirée partenaires en loge un soir de match : je voudrais un message écran 'Bienvenue partenaires CA — dégustation à la mi-temps' mais je dois mailer le resp com 3 jours à l'avance."_
- _Avec Neopro_ : _"Je crée l'animation événementielle 'soirée VIP CA mardi 20h' depuis le dashboard sponsors — s'affiche automatiquement entre 19h45 et 22h sans toucher à la programmation matchday standard."_

#### CU8. Reporting institutionnel pour 6c (collectivités) _(semestriel — export PDF formaté admin)_

- _Sans Neopro_ : _"Quand la mairie demande son rapport semestriel de visibilité, je fabrique un document audit-grade avec heures précises et formats certifiés — 1 journée par collectivité, format jamais standard."_
- _Avec Neopro_ : _"Je clique 'rapport semestriel collectivité' avec dates début/fin, je récupère un PDF formaté admin (heures cumulées, impressions estimées) — annexable directement à la convention de partenariat."_

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
