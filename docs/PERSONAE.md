# Personae MadXP

> **Audience** : futur PM (jour 1 = lecture obligatoire) + futur CTO (comprendre les humains derrière le code) + Daisy (référence partagée pour challenger les décisions)
>
> **Statut** : Live | **Dernière revue** : 2026-05-01 | **Source** : refonte personas Daisy mai 2026
>
> **À lire en parallèle** : [docs/product/USE-CASES.md](product/USE-CASES.md) — JTBD + scénarios multi-acteurs (qui se coordonne avec qui dans un parcours réel : matchday, onboarding, sponsoring, incident…). Ce doc-ci décrit _qui est qui_ ; USE-CASES décrit _comment ils interagissent ensemble_.
>
> **Convention de lecture** :
>
> - 🟢 = persona active aujourd'hui en prod (ARR confirmé)
> - 🟡 = persona partiellement servie aujourd'hui (besoin connu, outil à venir)
> - 🔮 = persona anticipée (modèle préparé, pas encore client réel — à valider terrain)
>
> **À lire en parallèle** — [docs/product/USE-CASES.md](product/USE-CASES.md) regroupe 4 couches qui complètent ce doc :
>
> - 📋 **§1 JTBD** (Christensen) — _quel job le persona embauche-t-il MadXP pour faire ?_
> - 🎬 **§2 Scénarios multi-acteurs** — _comment plusieurs personae se coordonnent dans un parcours réel_
> - 🗂️ **§3 Catalogue atomique CU** — 44 cas d'usage avec ID stables (`CU-3b-1`, etc.) — _que fait chaque persona, atomiquement_
> - 🛣️ **§4 Journey maps émotionnels** — 3 journeys clés avec courbe émotionnelle — _comment c'est ressenti dans le temps_

## Comment lire ce doc

Chaque persona suit un format unique pour comparaison facile :

- **En une phrase** : qui est cette personne dans la vraie vie
- **Points de douleur** : les frustrations qu'on résout
- **Moment "wow" avec MadXP** : l'instant où il/elle se dit _"c'est exactement ce que je voulais"_
- **Touchpoints MadXP** : par quels outils (dashboard, remote, mail auto, écran)
- **Fréquence d'usage** : daily / weekly / matchday / monthly
- **Source d'info** : terrain confirmé / hypothèse à valider — un PM saura quoi interviewer en priorité
- **Cas d'usage** : liste des CUs liés (détails dans [`docs/product/USE-CASES.md`](product/USE-CASES.md) §3)

---

## 1. 🟢 Super_admin (Daisy / futur PM / futur CTO)

**En une phrase** : la personne qui pilote l'ensemble du parc MadXP, gère contenus + accès + annonceurs, fait office de support N1 quand un client appelle.

**Points de douleur** :

> _"Je porte tout le support pour 7 sites en parallèle dans ma tête, sans aucun process formel — chaque incident NLF un samedi soir m'arrive sur mon Slack perso et je dois switcher de contexte instantanément, même quand je suis en famille."_

**Moment "wow" avec MadXP** :

> _"Mon Slack #neopro-alerts reste calme tout un week-end NLF, je ne touche pas à Railway une seule fois, et lundi matin Grafana me confirme que les 7 sites ont tourné sans incident — la flotte se débrouille sans moi pour la première fois."_

**Touchpoints MadXP** : Dashboard super_admin (gestion sites, users, contenus, advertisers, monitoring) + Grafana + Slack alerts + accès SSH Pi en dernier recours

**Fréquence d'usage** : daily

**Source d'info** : ✅ terrain confirmé (Daisy elle-même)

---

## 2. 🟢 Admin Support

**En une phrase** : opérateur MadXP qui a une vue d'ensemble du parc, gère les droits d'accès, crée les nouveaux sites, prend en charge le support distant niveau 1.

**Points de douleur** :

> _"Je dois aider les clubs à se dépatouiller rapidement en cas de problème — sans outil unifié, je perds 30 minutes à comprendre quel site, quelle version, quel symptôme exact."_

**Moment "wow" avec MadXP** :

> _"Un président de club m'appelle paniqué à 19h45 'la TV est noire' — je vois en 30 secondes sur le dashboard que son Pi est juste en train de redémarrer après une coupure ENEDIS, je peux le rassurer avant qu'il rappelle, sans jamais me déplacer ni me connecter en SSH."_

**Touchpoints MadXP** : Dashboard admin (vue parc, gestion sites/users), monitoring temps réel (heartbeat Pi, status Pi/SaaS), commandes remote (restart kiosk, rotate PSK, etc.)

**Fréquence d'usage** : daily

**Source d'info** : 🟡 hypothèse renforcée par les capacités code (admin-ops.service.ts, admin-state.store.ts) — à valider en interview client si admin externe existe

---

## 3. 🟢 Représentant club (3 sous-personas)

> ⚠️ Ce qui était auparavant un seul persona "Président / Resp com" est en réalité **trois métiers distincts** dans un club ambitieux. Ils n'achètent pas la même fonctionnalité, n'ont pas les mêmes KPI, et un PM qui interview "le club" sans les distinguer rate la moitié des signaux.

---

### 3a. 🟢 Président / Dirigeant club

**En une phrase** : décideur d'achat qui paie la facture MadXP et attend une retombée image + sponsoring sans toucher à l'opérationnel — souvent bénévole engagé qui voit MadXP comme un investissement stratégique pour le club.

**Points de douleur** :

> _"J'investis 5 000€/an dans un outil pour le club, je veux savoir si mes sponsors sont contents et si on a monté en gamme face aux clubs voisins. Aujourd'hui je n'ai aucun KPI clair, juste des retours d'oreille — et quand un sponsor part en fin de saison, je découvre la raison après coup."_

**Moment "wow" avec MadXP** :

> _"Tous les trimestres je reçois un PDF de 4 pages avec les impressions sponsors agrégées, le taux de fidélisation des partenaires, le nombre de prospects sponsoring entrants — je peux le présenter en bureau directeur sans avoir touché à l'outil moi-même."_

**Touchpoints MadXP** : Mail trimestriel automatique (rapport stratégique club), accès dashboard club en lecture (KPI agrégés, jamais le Studio), Remote en tribune les soirs de gala — délègue tout l'opérationnel à 3b/3c.

**Fréquence d'usage** : monthly (lecture rapport) — jamais opérationnel quotidien

**Source d'info** : ✅ terrain confirmé (NLF — président engagé) | 🟡 à valider pour les clubs où le président est moins technique

---

### 3b. 🟢 Responsable communication / Animateur club

**En une phrase** : la personne (salarié, bénévole expérimenté, ou président qui cumule) qui gère l'image du club au quotidien — contenu matchday, réseaux sociaux, communication interne — et pour qui l'écran du gymnase est à la fois une vitrine et une charge.

---

**Spectre d'autonomie**

_Chaque dimension est indépendante — un club peut être autonome sur l'une et pas sur les autres._

**Création de contenu**

- Niveau 1 : MadXP produit tout (shooting photo, shooting vidéo, contenus). Il valide et diffuse. _(upsell service)_
- Niveau 2 : personnalise les templates MadXP dans le Studio (couleurs, logo, noms joueurs)
- Niveau 3 : crée from scratch dans le Studio. Vision long terme.

**Programmation / diffusion**

- Niveau 1 : MadXP configure les scénarios matchday pour lui _(upsell service)_
- Niveau 2 : clone et ajuste des scénarios existants
- Niveau 3 : crée ses propres scénarios from scratch

**Technique**

- Niveau 1 : ne sait pas ce qu'est un Pi, besoin d'installation et configuration complète
- Niveau 2 : peut suivre un guide, gère les ajustements basiques
- Niveau 3 : comprend l'architecture, diagnostique seul

**Infrastructure**

- **Full SaaS** : a ses propres écrans et sa connectivité. Internet obligatoire, pas de résilience offline. Friction minimale à l'onboarding. Dépendant du WiFi gymnase le jour du match.
- **Offre Pi** : MadXP fournit le boîtier, résilience offline, watchdog réseau. Argument d'entrée sur l'anxiété matchday. Une fois autonome et confiant, le club peut évoluer vers le full SaaS.

**Multi-écrans**

- Site unifié / zones distinctes : même programmation de base, contenus différenciés par zone (salle, entrée, buvette)
- Sites indépendants : deux salles distinctes avec matchs simultanés, programmation totalement séparée
- Sans MadXP : plusieurs boucles sur plusieurs PC, synchronisation manuelle, plusieurs opérateurs nécessaires le jour du match

---

**Points de douleur sans MadXP**

- **Diffusion et programmation** : savoir quoi diffuser quand est un casse-tête permanent — gérer les phases match (avant, pendant, mi-temps, après), les rotations sponsors, les annonces club. Sans MadXP c'est manuel ou inexistant. Douleur quotidienne la plus fréquente, avant même la création.
- **Multi-écrans** : prépare plusieurs boucles sur plusieurs PC, nécessite plusieurs opérateurs le jour du match ou un seul qui jongle. Source d'erreurs et de stress réelle.
- **Coordination avec l'écran physique** : est-ce que ce qui est programmé s'affiche vraiment ? Est-ce que le Pi tourne ? Aucune visibilité sans MadXP. Anxiété réelle la nuit avant un match.
- **Création de contenu chronophage** : rien n'est réutilisable d'une semaine sur l'autre sans outil adapté.
- **Double travail réseaux sociaux** : contenu écran gymnase et contenu RS sont deux workflows séparés, deux fois le temps, rien n'est mutualisé.
- **Coordination inter-personas floue** : synchronisation avec l'opérateur matchday (Remote), le resp partenaires (rotation sponsors), le décideur (validation charte) — tout passe par WhatsApp, source d'erreurs.
- **Isolement en clubs amateur** : souvent seul, bénévole, peu de temps — chaque friction est rédhibitoire.

---

**Moment "wow" avec MadXP** _(selon le profil)_

- **Niveau service** : "MadXP m'a livré mes contenus, je les ai mis en ligne en 10 minutes, le match a tourné tout seul — je n'ai rien eu à créer."
- **Niveau template** : "J'ai cloné le scénario de la semaine dernière, mis à jour les noms, déployé en 20 minutes depuis mon canapé — le samedi soir s'est géré sans moi."
- **Niveau créateur** : "J'ai une maîtrise totale de ce qui passe sur nos écrans, avec des visuels au niveau d'un club pro, sans dépendre d'une agence."
- **Multi-écrans** : "Je programme une fois pour les trois écrans du complexe, l'opérateur gère tout depuis une seule Remote le soir du match."

---

**Touchpoints MadXP**

- Studio (création/personnalisation templates, scénarios matchday)
- Dashboard club (programmation diffusion, calendrier, gestion phases match, gestion multi-écrans)
- Monitoring écran/Pi en temps réel
- Remote (coordination avec l'opérateur matchday)
- Assets photo/vidéo livrés par MadXP (réutilisables RS)
- Service shooting photo + vidéo MadXP _(upsell — niveau service)_
- Service configuration scénarios MadXP _(upsell — niveau service)_

**Fréquence d'usage** : daily en saison (programmation, ajustements, monitoring) + intensif jour de match + ponctuel hors-saison

**Source d'info** : ✅ terrain confirmé (clubs beta, observation matchday) + spectre d'autonomie et multi-écrans à valider sur panel plus large

---

### 3c. 🟡 Responsable partenaires / Sponsoring club

**En une phrase** : la personne (salarié, élu bénévole, ou président qui cumule) dont la mission est de financer le club via les partenariats — trouver de nouveaux sponsors, vendre plus cher, et justifier chaque euro dépensé par ses partenaires actuels.

---

**Spectre d'autonomie**

_Chaque dimension est indépendante._

**Autonomie numérique**

- Niveau 1 : ne se connecte jamais au dashboard — tout arrive par mail automatique, il valide et transfère
- Niveau 2 : consulte le dashboard en lecture, exporte des PDFs pour ses RDV
- Niveau 3 : configure lui-même les packs, les rotations, onboard les nouveaux sponsors

**Autonomie commerciale**

- Niveau 1 : prospecte seul sans support MadXP
- Niveau 2 : utilise les données MadXP comme outil de vente en RDV
- Niveau 3 _(vision moyen terme)_ : MadXP l'aide activement à identifier des prospects potentiels

---

**Points de douleur sans MadXP**

- **Prospection à l'aveugle** : prospecte sans données — quand un prospect demande "combien de personnes voient mon logo ?" il n'a aucune réponse crédible. Il perd face à Google Ads qui lui donne des chiffres.
- **Catalogue partenaires limité et coûteux** : vend uniquement de l'affichage physique (panneaux dibond ~150€/pièce, stickers terrain, kakémono). 10 partenaires = 1 500€ minimum de panneaux par saison, réimprimés à chaque changement de logo ou de sponsor. Un sponsor qui part = panneau inutilisable en stock.
- **Mise à jour cauchemardesque** : un logo qui change en cours de saison = nouveau panneau à 150€, délai 3-4 semaines, friction avec le sponsor.
- **Pas de différenciation tarifaire** : sans preuve de valeur, impossible de vendre un spot vidéo mi-temps plus cher qu'un logo bandeau. Tout se vend au même tarif faute d'argument.
- **Renouvellement fragile** : sans données de diffusion, chaque renégociation annuelle est une négociation from scratch.
- **Production des bilans chronophage** : fabrique des bilans Excel manuellement en fin de saison — plusieurs jours de travail pour des documents qui ne convainquent pas toujours.
- **Profil parfois peu à l'aise numériquement** : bénévole expérimenté voire à la retraite — chaque friction dans l'outil est une barrière à l'adoption.

---

**Ce que MadXP transforme dans son métier**

MadXP ne remplace pas tous les supports physiques — il **transforme l'écran en support vendable et prouvable** :

**Ce que MadXP remplace :**

- ✅ Panneaux dibond et kakémono — 0€ de réimpression, mise à jour en 2 clics
- ✅ Tout affichage dynamique géré manuellement sur écran existant

**Ce que MadXP ne remplace pas :**

- ❌ Stickers terrain — restent pertinents, hors périmètre
- ❌ Logos maillots — hors périmètre

**Les gains concrets :**

- **Réduction coûts directs** : 1 500€ de panneaux dibond/saison → 0€
- **Nouveaux formats vendables** : spot vidéo mi-temps, habillage phase de jeu, animation but — formats premium inexistants sur support physique
- **Preuve de diffusion** : "combien de fois mon logo est passé ce mois-ci ?" devient une réponse automatique
- **Rapport automatique** : le sponsor reçoit ses données sans intervention de 3c — le renouvellement devient une formalité
- **Onboarding immédiat** : sponsor signé mardi, visible dès le match suivant — sans prestataire, sans délai de production

---

**Trois moments dans sa relation avec MadXP**

**Avant le RDV prospect** — prépare son argumentaire avec les données MadXP (impressions, taux de présence, comparatif packs). MadXP est son dossier de vente.

**Pendant le RDV** — sort le dashboard ou un PDF en live pour convaincre. MadXP est sa preuve.

**Après la signature** — onboard le nouveau sponsor, configure sa rotation, les rapports partent automatiquement. MadXP est son back-office.

---

**Moment "wow" avec MadXP**

- **En RDV prospect** : "Je sors mon téléphone sur le dashboard live — '11 200 impressions ce mois-ci sur 16 matches' — il signe à 8K€ au lieu des 3K€ habituels."
- **Sur les coûts** : "J'ai arrêté de commander des bâches — un nouveau sponsor est visible dès le match suivant sa signature. Mes 1 500€ de panneaux annuels sont devenus 0€."
- **Sur la mise à jour** : "Le sponsor a changé de logo en janvier — 2 clics dans le dashboard, c'est réglé. Avant ça m'aurait coûté 150€ et 3 semaines."
- **En renouvellement** : "Je clique 'rapport annuel sponsor X', PDF 8 pages prêt en 30 secondes — taux de reconduction passe de 60% à 85%."

---

**Touchpoints MadXP**

- Dashboard sponsors (gestion contrats, configuration packs bronze/argent/or, rotation pondérée)
- Export PDF rapport sponsor (en RDV prospect ou renouvellement)
- Portail sponsor partagé en lecture _(outil de vente en RDV + autonomie sponsor persona 6)_
- Mail automatique mensuel aux sponsors _(mode passif — fonctionne sans connexion)_
- Rapport annuel automatique _(renouvellement contrats)_

**Fréquence d'usage** : weekly en période active + intensif en période de renégociation annuelle + passif le reste du temps (rapports automatiques)

**Source d'info** : ✅ terrain confirmé (présence resp partenaires dans +75% des clubs) + chiffres coûts dibond à valider sur panel plus large

---

## 4. 🟢 Opérateur matchday

**En une phrase** : la personne présente le jour du match qui orchestre en temps réel ce qui s'affiche sur les écrans du gymnase — depuis une Remote mobile ou une vue régie fixe — sans formation technique préalable et sans être clouée derrière un PC.

---

**Qui c'est**

Statut indifférent : bénévole, parent, salarié du club, speaker, resp com qui cumule. Ce qui les unit : ils sont là le jour du match, ils ont la Remote en main, et ils n'ont pas été formés pendant des heures pour ça.

Un cas fréquent : le speaker qui cumule — il parle au micro et gère la Remote en simultané. La Remote doit être utilisable one-hand, actions larges, sans lecture fine. **Contrainte UX forte.**

---

**Points de douleur sans MadXP**

- **Cloué derrière un PC en régie** : ne peut pas bouger, rate le match, déconnecté de l'ambiance
- **Multi-écrans = multi-personnes** : un écran par bénévole, coordination impossible en live, erreurs fréquentes
- **Aucune formation préalable possible** : trop complexe à expliquer, chaque match est une improvisation
- **Saisie manuelle du score** : répétitive, source d'erreur, mobilise son attention en permanence
- **Incident écran = panique** : si l'écran devient noir il est démuni — pas de diagnostic disponible depuis la Remote

---

**Ce que MadXP change**

- **Un seul opérateur pour tout le site** : plus besoin d'un bénévole par écran
- **Mobile en tribune** : smartphone ou tablette, il suit le match et déclenche les actions depuis n'importe où dans la salle
- **Tout est préconfiguré par 3b** : il n'improvise pas — il choisit dans des playlists/boucles prêtes à l'emploi
- **Score automatique** _(roadmap été 2026)_ : intégration table de marque selon modèle et abonnement
- **Clôture automatique** : fin des enregistrements de data au bout de 15 minutes sans action

---

**Actions typiques en live**

- Choisir la phase de match (échauffement, entrée joueurs, match en cours, mi-temps, après-match)
- Déclencher des contenus spécifiques : célébration but, temps fort, animation
- Lancer un breaking news / message instantané — texte libre à la volée, diffusé immédiatement _(confiance club requise)_
- Choisir sur quel écran diffuser quel contenu
- Mettre à jour le score manuellement _(jusqu'à intégration table de marque)_
- Reboot Pi en dernier recours si incident écran

**Types de contenus qu'il manipule** : vidéos, pages URL, liens stream, playlists thématiques, messages texte à la volée

---

**Moment "wow" avec MadXP**

- **Mobilité** : "Je suis en tribune avec les supporters, je déclenche la célébration but en temps réel depuis mon téléphone — personne ne sait que c'est moi qui gère."
- **Simplicité** : "On m'a expliqué en 5 minutes — j'ai géré 3 écrans tout seul pendant tout le match sans jamais appeler personne."
- **Speaker qui cumule** : "Je commente le match au micro et je lance les animations depuis ma Remote d'une seule main — c'est fluide."

---

**Point d'attention**

Le message texte à la volée est diffusé immédiatement sans validation devant tout le gymnase. C'est une liberté qui suppose une confiance explicite du club envers l'opérateur. À cadrer dans l'onboarding club.

---

**Touchpoints MadXP**

- Remote mobile (smartphone/tablette) — touchpoint principal, pensé one-hand
- Vue régie (PC fixe) — alternative pour les clubs qui préfèrent un poste fixe
- Playlists et boucles préconfigurées par 3b
- Bouton reboot Pi _(incident uniquement)_

**Fréquence d'usage** : matchday uniquement — 1 à 3 fois par semaine en saison

**Source d'info** : ✅ terrain confirmé (observé sur sites beta) + cumul speaker/opérateur et contrainte UX one-hand à valider

---

## 5. 🟢🔮 Spectateur en tribune

**En une phrase** : le supporter, parent ou ami présent dans les tribunes le jour du match — utilisateur final passif aujourd'hui, futur utilisateur actif et surface de monétisation directe à horizon 6/9 mois.

---

**Qui c'est**

Pas un utilisateur produit au sens classique — il n'a pas de compte, pas de dashboard, pas de Remote. Mais c'est lui qui justifie tout le pricing sponsor : sans audience captive dans les tribunes, il n'y a pas d'inventaire publicitaire à vendre.

---

**Deux états selon l'horizon**

**Aujourd'hui — spectateur passif**
Il regarde l'écran. Il voit les animations matchday, les spots sponsors, le score en temps réel. Il n'interagit pas. Son engagement est réel mais non mesuré — c'est la limite actuelle de l'argumentaire commercial de 3c.

**Horizon 6/9 mois — spectateur actif (QR code)**
Il scanne un QR code affiché sur l'écran, accède à une mini-app web mobile, et participe à des expériences interactives en temps réel pendant le match.

**Horizon 1/2 ans — spectateur immersif**
Il prend un selfie depuis la mini-app, il s'affiche sur l'écran du gymnase. L'expérience devient communautaire et virale.

---

**Ce que MadXP lui apporte en vision cible**

- **Participation en temps réel** : pronostic, vote MVP, jeu concours, interaction sponsor — depuis son téléphone sans télécharger d'app
- **Visibilité sur l'écran** : son prénom, son pronostic, son selfie s'affichent sur le grand écran
- **Expériences sponsorisées** : un sponsor finance le jeu concours, son produit est le lot

---

**Questions ouvertes à trancher en roadmap**

- **Branding** : le spectateur voit-il le QR code MadXP ou le QR code du club ? Impact sur la collecte de données et la marque MadXP.
- **Identification** : anonyme (pseudo/prénom) ou identifié (email) ? À trancher pour la collecte RGPD.

---

**Surface de monétisation à trois niveaux**

**Niveau 1 — Indirect** : son engagement mesurable valorise les impressions sponsors. 3c vend plus cher parce qu'il peut prouver non plus juste "combien de fois le logo est passé" mais "combien de spectateurs ont interagi pendant la diffusion."

**Niveau 2 — Direct sponsor** : un sponsor paie pour financer le jeu concours — son logo sur le QR code, son produit comme lot. Le spectateur est l'audience, le sponsor est l'annonceur, MadXP est le média.

**Niveau 3 — Direct partenaire externe** : un acteur sport-entertainment paie pour accéder à l'audience MadXP et animer ses propres expériences. MadXP devient une plateforme ouverte.

---

**Moment "wow"**

- **Passif aujourd'hui** : "L'écran du gymnase ressemble à celui d'un club pro — le score en temps réel, les animations buts, les spots sponsors — je me sens dans un vrai match."
- **Actif demain** : "J'ai scanné le QR code à la mi-temps, tapé mon pronostic, et mon prénom est apparu sur l'écran géant 30 secondes après — j'ai crié avec mes voisins."

---

**Touchpoints MadXP**

- Écran gymnase (passif — exposition contenu)
- QR code affiché sur l'écran _(roadmap 6/9 mois)_
- Mini-app web mobile _(roadmap 6/9 mois — sans téléchargement)_
- Selfie affiché à l'écran _(roadmap 1/2 ans)_

**Fréquence** : matchday uniquement — audience captive ~2h par match

**Source d'info** : ✅ passif terrain confirmé (observé sur sites beta) + version active en roadmap — branding et identification à trancher avant développement

---

## 6. 🟡 Partenaire / Acheteur media club

**En une phrase** : l'entreprise, marque ou institution qui achète de la visibilité dans le gymnase du club — du spot ponctuel sans engagement au partenariat pluriannuel — dont la relation est gérée exclusivement par le club via MadXP.

---

**Qui c'est — spectre de la relation**

_Mêmes touchpoints MadXP, nature de relation et niveau d'exigence croissants._

- **Niveau 0 — Acheteur media ponctuel** : entreprise locale qui veut communiquer 1-2 mois sans engagement partenariat. Acheteur de spot, pas sponsor.
- **Niveau 1 — Commerçant de proximité** (500€-2 000€/an) : artisan, restaurateur, garage, agence immo locale. Geste de soutien autant que stratégie marketing. Veut juste un signe que ça vit.
- **Niveau 2 — PME locale** (2 000€-8 000€/an) : entreprise locale structurée. Attend un reporting professionnel pour justifier sa dépense en interne.
- **Niveau 3 — PME régionale multi-clubs** (8 000€-20 000€/an) : sponsorise plusieurs clubs simultanément. Veut une vue consolidée et un reporting COMEX-ready.
- **Niveau 4 — Partenaire institutionnel** : collectivité, mairie, conseil départemental. Logique politique/territoriale, pas commerciale. Veut une preuve audit-grade pour rendre des comptes aux contribuables.

---

**Points de douleur sans MadXP**

- **Aucune preuve de visibilité** : "Je donne X€ au club mais je ne sais pas si mon logo est vu." Sans données, le renouvellement est une décision émotionnelle.
- **Reporting inexistant ou manuel** : reçoit au mieux un mail "merci" du président, au pire rien.
- **Mise à jour des visuels lente et coûteuse** : un changement de logo = nouveau panneau à 150€, délai 3-4 semaines.
- **Format non adapté selon le profil** :
  - Acheteur ponctuel : pas de relation partenariat, veut juste acheter et diffuser vite
  - Commerçant : submergé par des rapports trop complexes qu'il ne lit pas
  - PME : reçoit des bilans Excel artisanaux insuffisants pour son DAF
  - Institutionnel : aucun document au format convention de partenariat

---

**Touchpoints MadXP selon le niveau**

| Niveau              | Mode         | Touchpoint                                                    |
| ------------------- | ------------ | ------------------------------------------------------------- |
| 0 — Ponctuel        | Aucun direct | Tout passe par 3c — rapport diffusion en fin de période       |
| 1 — Commerçant      | Passif       | Mail mensuel light : 1 photo logo + 1 chiffre clé             |
| 2 — PME locale      | Semi-actif   | Mail mensuel PDF structuré + portail lecture occasionnel      |
| 3 — PME multi-clubs | Actif        | Portail self-service consolidé + export PDF + reporting COMEX |
| 4 — Institutionnel  | Ponctuel     | Rapport semestriel audit-grade annexable à la convention      |

---

**Moment "wow" selon le niveau**

- **Acheteur ponctuel** : "J'ai appelé le club, mon spot tournait le week-end suivant, j'ai reçu un rapport en fin de mois. Aucune complexité."
- **Commerçant** : "J'ai reçu une photo de mon logo sur l'écran avec '8 400 impressions ce mois-ci' — c'est suffisant pour renouveler sans hésiter."
- **PME locale** : "Mon directeur m'a demandé de justifier nos 5K€ de sponsoring — j'ai sorti le PDF MadXP en réunion, ça a clos le débat."
- **PME multi-clubs** : "Je reçois un rapport consolidé sur mes 4 clubs chaque mois — je présente ça en COMEX sans complexe face au budget Google Ads."
- **Institutionnel** : "J'annexe le rapport semestriel MadXP à notre convention — quand un élu demande 'qu'est-ce qu'on a en retour ?', j'ai une réponse certifiée."

---

**Fréquence d'interaction**

- Niveau 0 : ponctuelle (achat + rapport fin de période)
- Niveau 1 : mensuelle (lecture mail) + annuelle (renouvellement)
- Niveau 2-3 : mensuelle (portail/PDF) + annuelle (renouvellement)
- Niveau 4 : semestrielle (rapport convention)

**Source d'info** : 🟡 hypothèse forte sur spectre — à valider terrain via interviews partenaires clubs beta (5 commerçants + 2 PME + 1 collectivité + 1 acheteur ponctuel minimum)

---

## 7. 🔮 Annonceur réseau

**En une phrase** : la marque nationale ou inter-régionale qui achète de la visibilité sur le réseau de gymnases MadXP directement — sans passer par les clubs — en échange d'un reversement automatique aux clubs qui diffusent ses spots.

---

**Ce qui le distingue du partenaire club**

|                     | Partenaire club       | Annonceur réseau              |
| ------------------- | --------------------- | ----------------------------- |
| Relation            | Club ↔ Marque         | MadXP ↔ Marque                |
| Géré par            | 3c (resp partenaires) | MadXP                         |
| Périmètre           | 1 club                | N gymnases                    |
| Club dans la boucle | Oui — contrôle total  | Non — reversement automatique |

---

**Points de douleur sans MadXP**

- **Fragmentation** : pour toucher 50 clubs il doit négocier 50 contrats séparément — impossible à l'échelle
- **Aucune preuve de diffusion** : envoie ses vidéos par WeTransfer, ne sait pas si elles ont été diffusées ni devant combien de personnes
- **Pas de ciblage** : ne peut pas choisir par sport, région, niveau de compétition ou taille d'audience
- **Reporting inexistant** : pas de données consolidées sur ses campagnes multi-clubs

---

**Trajectoire produit**

**Aujourd'hui — régie manuelle MadXP**
L'annonceur passe par l'équipe MadXP qui gère sa campagne manuellement.

**Court terme — portail self-service basique**

- Upload de contenus en autonomie
- Sélection des gymnases (par sport, région, niveau)
- Suivi des impressions en temps réel
- Rapport automatique mensuel + modération automatique

**Moyen/long terme — régie algorithmique complète**

- Achat programmatique : budget, durée, ciblage multi-critères
- Optimisation automatique, A/B test, rapport temps réel par gymnase

---

**Modèle économique**

- L'annonceur achète des spots sur un package de gymnases
- MadXP reverse 10-20% aux clubs qui diffusent — automatiquement, sans intervention club
- Le club peut exercer un droit de veto sur certaines marques — option payante
- Coexiste avec les partenariats club dans les mêmes gymnases — compatible et non exclusif

---

**Moment "wow"**

- **Aujourd'hui** : "J'uploade ma vidéo une fois chez MadXP, elle tourne dans 5 gymnases le week-end suivant — j'ai un rapport d'impressions consolidé en fin de mois sans avoir contacté un seul club."
- **Self-service** : "Je coche handball + Bretagne, je fixe mon budget à 2 000€ sur 4 semaines — l'algo diffuse et m'envoie le rapport automatiquement."

---

**Touchpoints MadXP** : équipe MadXP (régie manuelle aujourd'hui) → portail annonceur → dashboard régie complet (long terme)

**Fréquence d'usage** : weekly en campagne active + monthly (rapport)

**Statut** : 🔮 modèle anticipé — pas d'annonceur réseau à date. À valider via signature premier annonceur réseau post-lancement commercial.

**Source d'info** : 🔮 anticipation — taux de reversement clubs (10% ou 20%) et conditions veto à trancher

---

## 8. 🟡 Agence multi-clubs

**En une phrase** : agence sport-marketing locale ou régionale qui gère plusieurs clubs simultanément pour le compte de ses clients — partenaire commercial et opérationnel de MadXP qui apporte des clubs en volume en échange d'un accès consolidé et d'un tarif préférentiel.

---

**Ce qui la distingue de 3b**

|                 | 3b — Resp com club | Agence multi-clubs                           |
| --------------- | ------------------ | -------------------------------------------- |
| Périmètre       | 1 club             | N clubs simultanément                        |
| Relation MadXP  | Utilisateur        | Partenaire commercial                        |
| Accès dashboard | Club uniquement    | Vue consolidée N clubs                       |
| Paiement        | Abonnement club    | Accès gratuit + tarif préférentiel + upsells |
| Contrat MadXP   | Non                | Oui — contrat partenaire                     |

---

**Points de douleur sans MadXP**

- **Multi-logins** : un dashboard par club, 5 onglets ouverts simultanément, risque de mélanger contenus et sponsors entre clients
- **Pas de vue consolidée** : impossible de voir l'état de tous ses clubs en un coup d'œil
- **Duplication du travail** : prépare des setups quasi-identiques pour chaque club séparément
- **Coordination matchday complexe** : le samedi soir elle peut gérer 3 matches en parallèle sans outil unifié

---

**Position dans la chaîne MadXP**

**Canal de distribution** : elle embarque plusieurs clubs d'un coup — chaque club signé via une agence est un abonnement MadXP sans effort commercial direct.

**Consommatrice de services** : elle commande des upsells en volume pour ses clubs (shooting, production, templates) — revenus services récurrents pour MadXP.

---

**Modèle commercial**

- Accès dashboard multi-clubs : gratuit
- Tarif abonnement clubs gérés : préférentiel (négocié dans le contrat partenaire)
- Upsells (templates partagés, shooting, production) : payants
- Contrat partenaire formel avec MadXP : exclusivité territoriale possible

---

**Moment "wow"**

- **Opérationnel** : "Je me connecte avec un seul login, je vois mes 5 clubs en un coup d'œil, je bascule de l'un à l'autre en un clic — le samedi soir je gère 3 matches en parallèle depuis ma cuisine sans risquer de mélanger les sponsors."
- **Monitoring** : "Un Pi redémarre à 19h45 chez un de mes clubs — je vois l'alerte sur mon dashboard consolidé avant même que le club m'appelle."
- **Templates** : "Je crée un template de base une fois, je le déploie sur mes 4 clubs handball avec les couleurs de chacun — 20 minutes au lieu de 4 fois 20 minutes."

---

**Touchpoints MadXP**

- Dashboard agence multi-clubs (vue consolidée, switcher contextuel, monitoring global)
- Accès Studio multi-clubs (templates partagés — upsell)
- Commande upsells directs pour ses clubs
- Contrat partenaire MadXP

**Fréquence d'usage** : daily en saison + intensif les jours de match

**Statut** : 🟡 moyen terme — pas de client agence à date. À activer dès 20+ clubs dans une région.

**Source d'info** : 🟡 capacité multi-tenant existante côté code — à valider commercialement avec une agence partenaire pilote

---

## 9. 🔮 Fédération / Ligue

**En une phrase** : l'autorité institutionnelle sportive (ligue régionale, comité départemental, fédération nationale) qui prescrit MadXP à ses clubs affiliés en échange d'une commission, pousse des contenus et partenariats nationaux dans le réseau, et exploite les données agrégées de ses clubs comme actif stratégique.

---

**Ce qui la distingue de l'agence**

|                      | Agence multi-clubs | Fédération / Ligue          |
| -------------------- | ------------------ | --------------------------- |
| Relation clubs       | Prestataire        | Autorité institutionnelle   |
| Levier sur les clubs | Commercial         | Contractuel / réglementaire |
| Commission           | Non                | 12% (évolutif)              |
| Données réseau       | Non                | Oui (payant)                |
| Contenus nationaux   | Non                | Oui — pousse en cascade     |

---

**Points de douleur sans MadXP**

- **Partenariats nationaux non exécutables** : a des accords avec Lidl, Crédit Agricole, etc. mais ne peut pas les diffuser dans les gymnases de ses clubs affiliés sans négocier club par club
- **Aucune donnée réseau** : ne sait pas combien de spectateurs assistent aux matches de ses clubs
- **Prescription sans outil** : recommande des solutions à ses clubs mais n'a aucun levier contractuel ni commission en retour

---

**Ce que MadXP lui apporte**

**Comme canal de distribution :**

- Commission 12% sur chaque abonnement club signé via prescription fédérale
- Exclusivité territoriale possible sur 6 mois maximum

**Comme utilisateur produit :**

- Dashboard fédération : vue agrégée de tous ses clubs affiliés MadXP
- Push de contenus nationaux en cascade dans les gymnases affiliés
- Régie fédérale : ses propres annonceurs nationaux diffusés via le réseau
- Données agrégées réseau (audience totale, impressions) — payant
- Scores live de tous ses clubs affiliés via ScoreBox _(roadmap PI-2)_

---

**Modèle contractuel club sous prescription fédérale**

- Club signé via prescription fédérale : tarif préférentiel, contenus fédéraux acceptés par défaut
- Veto club sur contenus fédéraux : possible mais le club sort du deal fédéral et paie le tarif standard
- Ce mécanisme crée un engagement contractuel fort — levier de volume ET de discipline réseau pour MadXP

---

**Moment "wow"**

- **Prescription** : "Je signe un accord avec MadXP — mes 28 clubs ont accès à un tarif préférentiel et je touche 12% sur chaque abonnement. Je n'ai rien à gérer au quotidien."
- **Contenus nationaux** : "Je clique 'pousser à tous les clubs affiliés' — la semaine suivante ma campagne Lidl tourne dans 28 gymnases simultanément avec un rapport agrégé d'impressions."
- **Données réseau** : "Pour la première fois je peux dire à mes partenaires 'notre réseau touche X spectateurs par mois avec Y impressions certifiées' — c'est de la vraie data, pas une estimation."

---

**Touchpoints MadXP**

- Dashboard fédération (vue clubs affiliés, suivi prescriptions, push contenus nationaux)
- Régie fédérale (gestion annonceurs nationaux, diffusion en cascade)
- Données agrégées réseau (payant)
- Scores live clubs affiliés _(roadmap PI-2 — ScoreBox)_
- Contrat partenaire MadXP (commission, exclusivité, conditions)

**Fréquence d'usage** : weekly (suivi prescriptions, campagnes) + saisonnier (négociation annuelle)

**Statut** : 🔮 anticipation stratégique — pas de partenariat fédéral à date. Approcher LNH/FFHB/FFBB en priorité post-lancement commercial.

**Risque à documenter** : club "subi" via prescription fédérale = engagement produit potentiellement plus faible qu'un club qui a choisi MadXP activement. À compenser par onboarding renforcé et démonstration de valeur rapide.

**Source d'info** : 🔮 anticipation stratégique — ScoreBox comme argument fédéral à valider terrain + modèle commission et régie fédérale à structurer juridiquement

---

## 10. 🟡 Installateur / Technicien terrain

**En une phrase** : la personne qui met en service le dispositif MadXP dans le gymnase et assure la maintenance technique ongoing à distance — premier maillon de la chaîne après la vente, garant de l'expérience de 3b dès le jour 1.

---

**Qui c'est**

Aujourd'hui : l'équipe MadXP elle-même. À terme : réseau de techniciens partenaires locaux formés par MadXP, ou le club lui-même si et seulement si la procédure est suffisamment robuste.

Deux phases dans son rôle :

- **Phase 1 — Installation initiale** : mise en service du Pi, connexion écrans, configuration réseau WiFi gymnase, première mise en route du dashboard
- **Phase 2 — Maintenance ongoing** : diagnostic à distance, mises à jour firmware, remplacement matériel, support incident

---

**Points de douleur**

- **Pas de procédure standardisée** : chaque installation est une improvisation — ce qui fonctionne sur un site ne fonctionne pas forcément sur un autre
- **Pas d'outil de diagnostic terrain** : en cas de problème il navigue à l'aveugle sans visibilité sur l'état réel du Pi et du réseau
- **Dépendance SSH** : la configuration passe encore par SSH — trop technique pour un partenaire local non développeur
- **Pas de checklist de mise en service** : aucun garde-fou pour s'assurer que tout est opérationnel avant de quitter le gymnase
- **Support incident sans outil** : quand 3b l'appelle en urgence un soir de match, il n'a pas d'accès distant structuré — il improvise

---

**Vision cible**

⚠️ Un wizard UI guidé pas-à-pas n'est pas la bonne réponse ici. L'installation réseau d'un gymnase est trop diverse (WiFi municipal, VLAN, proxy, NAT) pour être scriptable en UI — et elle suppose une connectivité que le Pi n'a pas encore au moment où on l'installe.

**Court terme — standardisation procédure**

- Pi livré avec une image pré-configurée (site_id, PSK, OTA) qui démarre sans intervention terminal
- Checklist de mise en service documentée (PDF ou page interne) que n'importe quel technicien suit
- Remote shell depuis le dashboard pour diagnostic et intervention à distance sans déplacement

**Moyen terme — outillage diagnostic**

- Vue monitoring par Pi dans le dashboard (heartbeat, température, connectivité, version firmware, logs kiosk)
- Déploiement firmware à distance sur la flotte depuis le dashboard
- Procédure swap Pi standardisée : le nouveau Pi hérite automatiquement de la configuration de l'ancien

**Long terme — plug & play club**
Le club installe seul _seulement_ après que le problème réseau est résolu en amont (hotspot PSK embarqué dans l'image, ADR-074). Sans réseau résilient, aucune procédure ne remplace un humain compétent sur site.

---

**Moment "wow"**

- **Installation** : "J'ai branché le Pi, suivi le checklist en 15 minutes — tout est au vert avant de quitter le gymnase. Aucun terminal ouvert."
- **Incident soir de match** : "3b m'appelle à 19h45, l'écran est noir — j'ouvre le remote shell depuis mon téléphone, je vois que le process kiosk est planté, je le relance en 2 minutes sans me déplacer."
- **Mise à jour flotte** : "Je déploie la nouvelle version firmware sur 50 Pi en un clic depuis le dashboard — sans aller dans un seul gymnase."

---

**Touchpoints MadXP**

- Pi pré-imagé (site_id + PSK + OTA embarqués à la livraison)
- Checklist de mise en service _(à formaliser)_
- Dashboard technicien (vue flotte, état Pi, monitoring temps réel) _(partiellement disponible)_
- Remote shell depuis le dashboard _(à construire)_
- Déploiement firmware à distance
- Procédure swap matériel standardisée

**Fréquence d'usage** : ponctuelle (installation) + variable (maintenance : quotidienne sur incidents actifs, hebdomadaire sur monitoring, mensuelle sur mises à jour)

**Liens avec les autres personas**

- Condition sine qua non de l'expérience **3b** — une installation ratée = churn précoce
- Intervient en dernier recours quand **l'opérateur matchday** ne peut pas relancer le Pi seul
- Travaille sous supervision de **l'équipe MadXP** (super admin / admin support)

**Statut** : 🟡 partiellement couvert aujourd'hui (SSH + intervention équipe MadXP) — remote shell et monitoring technicien sont la priorité produit, le wizard UI ne l'est pas

**Risque critique** : une mauvaise installation = 3b démotivé dès le jour 1 = churn précoce. Persona la plus impactante sur la première impression client malgré son invisibilité commerciale.

**Source d'info** : ✅ terrain confirmé (installations beta) + vision plug & play à horizon 2026-2027 conditionnée à la maturité ADR-074

---

## Synthèse pour interview PM/CTO

### Tableau comparatif des 13 personae

| #   | Persona                     | Statut | Touchpoint principal                 | Fréquence                | Action prio PM jour 1                               |
| --- | --------------------------- | ------ | ------------------------------------ | ------------------------ | --------------------------------------------------- |
| 1   | Super_admin                 | 🟢     | Dashboard super_admin                | daily                    | (interne — Daisy/futur PM)                          |
| 2   | Admin Support               | 🟢     | Dashboard admin                      | daily                    | Interview pour mesurer charge support               |
| 3a  | Président / Dirigeant club  | 🟢     | Mail trimestriel + dashboard lecture | monthly                  | **PM jour 1 : interview NLF président**             |
| 3b  | Resp communication club     | 🟢     | Dashboard club + Studio              | daily en saison          | **PM jour 1 : interview NLF resp com**              |
| 3c  | Resp partenaires club       | 🟡     | Dashboard sponsors + portail         | weekly + intensif renégo | PM mois 1 : valider coûts dibond + spectre          |
| 4   | Opérateur matchday          | 🟢     | Remote mobile (one-hand)             | matchday                 | PM mois 1 : audit UX Remote contrainte one-hand     |
| 5   | Spectateur tribune          | 🟢🔮   | Écran (passif) → QR (futur)          | matchday                 | PM mois 2 : trancher branding QR + identification   |
| 6   | Partenaire / Acheteur media | 🟡     | Mail auto → portail → self-service   | variable selon niveau    | PM mois 1 : 5 interviews sponsors NLF (niveaux 0-2) |
| 7   | Annonceur réseau            | 🔮     | Portail annonceur                    | weekly + monthly         | PM mois 3 : signer 1er annonceur réseau             |
| 8   | Agence multi-clubs          | 🟡     | Dashboard agency multi-tenant        | daily                    | PM mois 4 : prospecter 1ère agence pilote           |
| 9   | Fédération / Ligue          | 🔮     | Dashboard fédération                 | weekly + saison          | PM mois 6+ : approcher LNH/FFHB/FFBB                |
| 10  | Installateur / Technicien   | 🟡     | Remote shell + monitoring Pi         | ponctuel + maintenance   | PM mois 1 : formaliser checklist + remote shell     |

### Pour le pitch en 30 secondes

> _"MadXP sert 13 personae sur 3 niveaux : (1) les utilisateurs club — président, resp com, resp partenaires, opérateur matchday — qui pilotent leur matchday avec des attentes très différentes selon leur métier et leur niveau d'autonomie, (2) les bénéficiaires indirects qui monétisent l'audience — du partenaire local niveau 0 à la fédération nationale, en passant par la PME multi-clubs, l'annonceur réseau et l'agence, (3) le spectateur final dont l'engagement justifie tout le pricing, et l'installateur dont la qualité d'intervention conditionne tout le reste. Aujourd'hui on sert solidement les utilisateurs club ; on ouvre progressivement les segments sponsors et le spectateur interactif au fil de la roadmap."_

### TODO Daisy persistants

- [ ] Valider terrain personas 🔮 (annonceur réseau, fédération, spectateur interactif) — task PM prioritaire
- [ ] Valider le spectre d'autonomie 3b/3c sur un panel plus large (5+ clubs hors NLF)
- [ ] Formaliser la checklist de mise en service Pi et le remote shell dashboard (persona 10 — priorité court terme)
- [ ] Trancher branding QR code spectateur (MadXP vs club) avant développement roadmap 6/9 mois
- [ ] Documenter les sites actifs nominativement (`docs/CLIENTS.md` privé) avec leur(s) persona(e) référent(e)(s)
- [ ] Confirmer que l'admin support (persona 2) est externe à Daisy ou rempli par Daisy elle-même aujourd'hui
