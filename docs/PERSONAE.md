# Personae Neopro

> **Audience** : futur PM (jour 1 = lecture obligatoire) + futur CTO (comprendre les humains derrière le code) + Daisy (référence partagée pour challenger les décisions)
>
> **Statut** : Live | **Dernière revue** : 2026-04-25 | **Source** : interview Daisy 2026-04-25 + benchmark `docs/strategy/BENCHMARK-COMPETITORS.md`
>
> **Convention de lecture** :
> - 🟢 = persona active aujourd'hui en prod (ARR confirmé)
> - 🟡 = persona partiellement servie aujourd'hui (besoin connu, outil à venir)
> - 🔮 = persona anticipée (modèle préparé, pas encore client réel — à valider terrain)

## Comment lire ce doc

Chaque persona suit un format unique pour comparaison facile :
- **En une phrase** : qui est cette personne dans la vraie vie
- **Frustration #1 sans Neopro** : la douleur qu'on résout
- **Moment "wow" avec Neopro** : l'instant où il/elle se dit *"c'est exactement ce que je voulais"*
- **Interactions Neopro** : par quels touchpoints (dashboard, remote, mail auto, écran)
- **Fréquence d'usage** : daily / weekly / matchday / monthly
- **Source d'info** : terrain confirmé / hypothèse à valider — un PM saura quoi interviewer en priorité

---

## 1. 🟢 Super_admin (Daisy / futur PM / futur CTO)

**En une phrase** : la personne qui pilote l'ensemble du parc Neopro, gère contenus + accès + annonceurs, fait office de support N1 quand un client appelle.

**Frustration #1 sans Neopro** :
> *"Je porte tout le support pour 7 sites en parallèle dans ma tête, sans aucun process formel — chaque incident NLF un samedi soir m'arrive sur mon Slack perso et je dois switcher de contexte instantanément, même quand je suis en famille."*

**Moment "wow" avec Neopro** :
> *"Mon Slack #neopro-alerts reste calme tout un week-end NLF, je ne touche pas à Railway une seule fois, et lundi matin Grafana me confirme que les 7 sites ont tourné sans incident — la flotte se débrouille sans moi pour la première fois."*

**Interactions Neopro** : Dashboard super_admin (gestion sites, users, contenus, advertisers, monitoring) + Grafana + Slack alerts + accès SSH Pi en dernier recours

**Fréquence d'usage** : daily

**Source d'info** : ✅ terrain confirmé (Daisy elle-même)

---

## 2. 🟢 Admin Support

**En une phrase** : opérateur Neopro qui a une vue d'ensemble du parc, gère les droits d'accès, crée les nouveaux sites, prend en charge le support distant niveau 1.

**Frustration #1 sans Neopro** :
> *"Je dois aider les clubs à se dépatouiller rapidement en cas de problème — sans outil unifié, je perds 30 minutes à comprendre quel site, quelle version, quel symptôme exact."*

**Moment "wow" avec Neopro** :
> *"Un président de club m'appelle paniqué à 19h45 'la TV est noire' — je vois en 30 secondes sur le dashboard que son Pi est juste en train de redémarrer après une coupure ENEDIS, je peux le rassurer avant qu'il rappelle, sans jamais me déplacer ni me connecter en SSH."*

**Interactions Neopro** : Dashboard admin (vue parc, gestion sites/users), monitoring temps réel (heartbeat Pi, status Pi/SaaS), commandes remote (restart kiosk, rotate PSK, etc.)

**Fréquence d'usage** : daily

**Source d'info** : 🟡 hypothèse renforcée par les capacités code (admin-ops.service.ts, admin-state.store.ts) — à valider en interview client si admin externe existe

---

## 3. 🟢 Représentant club (président / responsable com)

**En une phrase** : le décideur d'achat du club ET le user quotidien — souvent fusionnés dans les clubs amateurs/semi-pros (président bénévole impliqué techniquement, ou responsable com salarié(e) avec délégation totale).

**Frustration #1 sans Neopro** :
> *"En préparation du samedi soir, je dois jongler entre Excel scores, ma clé USB pour les pubs sponsors, et l'ordi du club qui plante. Je dois préparer tous les visuels de faits de jeu, l'expérience matchday avec les entrées et buts. Je dois réviser les infos et tout bien préparer à chaque fois — pendant que je devrais accueillir les invités VIP et préparer l'orga match."*

**Moment "wow" avec Neopro** :
> *"Le samedi soir, je crée mes templates de pubs sponsors en 10 minutes au lieu d'une heure d'After Effects, je délègue toute l'exécution match au bénévole sans stresser, et le lundi mon partenaire reçoit son rapport ROI sans que j'aie à l'envoyer manuellement — je récupère 4h de cerveau qui passent de l'opérationnel à la stratégie comm/partenaires."*

**Interactions Neopro** : Dashboard club (préparation matches, gestion sponsors, templates Studio, calendrier diffusion, statistiques sponsors), Remote en tribune les soirs de match, mail mensuel automatique de rapport partenaires

**Fréquence d'usage** : weekly + intensif les jours de match

**Cas d'usage rattaché** — Réseaux sociaux post-match (roadmap LATER) : highlights / score final automatiquement poussés sur Instagram/TikTok du club

**Source d'info** : ✅ terrain confirmé (NLF + autres clients)

---

## 4. 🟢 Staff bénévole jour de match

**En une phrase** : la personne (souvent un parent / un fan / un jeune) qui a accepté de "tenir le score" 3 heures pour aider le club, sans formation préalable, sans compte dashboard.

**Frustration #1 sans Neopro** :
> *"On me demande de gérer le score sur la TV mais je n'ai jamais de formation et la dernière fois j'ai planté l'écran 10 minutes en plein match. En plus je dois être fixe derrière un ordinateur tout le temps avec une connexion internet."*

**Moment "wow" avec Neopro** :
> *"Je clique sur une vidéo manuelle sur la télécommande, elle se lance à l'écran instantanément, et personne ne s'aperçoit que je n'ai aucune formation. Quand la table de marque ajoute du score, je vois l'info en live sur la télécommande et l'écran est à jour automatiquement — je peux suivre le match au lieu d'être collé à un ordi."*

**Interactions Neopro** : Remote uniquement (smartphone ou tablette en tribune) — aucun dashboard

**Fréquence d'usage** : matchday uniquement (1-2× par semaine en saison)

**Source d'info** : ✅ terrain confirmé (observé sur sites NLF + autres)

---

## 5. 🟢🔮 Spectateur en tribune

**En une phrase** : le supporter / parent / ami du joueur dans la tribune qui vient regarder le match — l'utilisateur final business de Neopro, même s'il n'a aucune interaction logicielle aujourd'hui.

**Frustration #1 sans Neopro (et même AVEC Neopro V1)** :
> *"Je suis dans la tribune, je vois les pubs sponsors qui défilent en boucle pendant la mi-temps, mais elles ne me parlent jamais directement — je ne peux ni cliquer, ni participer, ni gagner quoi que ce soit. Pendant ce temps mon téléphone est dans ma main."*

**Moment "wow" avec Neopro V2 (roadmap LATER #1 — QR/jeu)** :
> *"À la mi-temps je scanne le QR code affiché sur l'écran, je tape mon prono 'NLF gagne 28-25', mon prénom apparaît sur l'écran géant 30 secondes plus tard avec les autres pronostiqueurs — je crie avec mes voisins quand je suis dans le top 3 des gagnants à la fin du match."*

**Interactions Neopro** :
- 🟢 Aujourd'hui : passif, regarde l'écran (exposition pubs + score live)
- 🔮 Demain : QR code → mini-app web mobile (pronostic, jeu, vote MVP, donation sponsor)

**Fréquence d'usage** : matchday uniquement (audience captive ~2h)

**Pourquoi cette persona est business-critique** : c'est le seul utilisateur final dont l'engagement justifie le pricing premium des sponsors. Cf. `BENCHMARK-COMPETITORS.md` : *"un spectateur dans un gymnase est plus engagé qu'un piéton devant un abribus → inventaire publicitaire premium"*.

**Source d'info** : ✅ visible terrain (passif) | 🔮 hypothèse pour la version interactive (à tester en MVP)

---

## 6. 🟡 Sponsor local du club

**En une phrase** : commerçant, artisan, PME locale qui finance le club via un partenariat annuel (ex: 2 000€/an pour son logo en tribune) — bénéficiaire indirect de Neopro, ne touche pas l'outil aujourd'hui.

**Frustration #1 sans Neopro** :
> *"Je paie le club 2 000€/an pour avoir mon logo en tribune mais je n'ai aucune idée si quelqu'un l'a vraiment vu."*

**Moment "wow" avec Neopro** (Sponsor Portal V1, NEXT #2) :
> *"Je reçois un mail mensuel automatique 'votre logo a été vu 12 800 fois ce mois-ci dans l'arène NLF' avec une capture d'écran de l'affichage et le détail par jour de match — pour la première fois je peux justifier mes 2 000€ à mon directeur financier sans bullshit."*

**Interactions Neopro** :
- 🟡 Aujourd'hui : aucune interaction directe — le club lui montre des screenshots manuellement
- 🔜 NEXT (M2-3) : mail mensuel automatique + portail web ROI dédié (login simple, pas dashboard complet)

**Fréquence d'usage** : monthly (lecture mail / portail)

**Source d'info** : 🟡 hypothèse forte renforcée par retours indirects clubs — à valider en interview directe sponsor par le PM

---

## 7. 🔮 Annonceur région/national

**En une phrase** : marque (Decathlon, marque locale, banque sportive, etc.) qui veut acheter de l'exposition publicitaire sur un réseau de clubs sportifs en France, sans négocier club par club.

**Frustration #1 sans Neopro** :
> *"J'ai 50 clubs partenaires en France et je dois envoyer mes vidéos par WeTransfer un par un, sans savoir si elles passent vraiment. Je ne sais pas si mes spots ont été vus, devant combien de personnes."*

**Moment "wow" avec Neopro** :
> *"J'upload ma vidéo Decathlon une seule fois sur le dashboard Neopro, je coche les 50 clubs où je veux la diffuser, et 30 minutes plus tard elle tourne partout — j'ai un compteur impressions qui monte en temps réel par club, sans WeTransfer ni mail."*

**Interactions Neopro** : Dashboard annonceur dédié (upload contenu, sélection clubs/régions/dates, dashboard impressions temps réel, rapports PDF mensuels), API REST publique (intégration côté annonceur)

**Fréquence d'usage** : weekly (campagnes en cours) + monthly (reporting)

**Source d'info** : 🔮 hypothèse marketing — à valider via signature 1er annonceur réseau (objectif post-PM)

**Lien stratégique** : déclenche le revenu Neopro côté pub réseau (modèle 2 niveaux régie publicitaire — cf. `docs/business/REGIE_TOUT_EN_UN.md`)

---

## 8. 🔮 Régie publicitaire

**En une phrase** : société qui vend des espaces pub d'autres médias/supports (équivalent JCDecaux pour les arènes) — achète en gros des inventaires Neopro qu'elle redistribue à ses propres annonceurs.

**Frustration #1 sans Neopro** :
> *"Je vends des espaces pub sur 30 clubs sportifs partenaires, mais chaque annonceur que je revends doit pouvoir tracker ses propres impressions sans voir celles des autres — et aujourd'hui je leur fais des screenshots Excel à la main chaque mois."*

**Moment "wow" avec Neopro** :
> *"Le 1er du mois je reçois automatiquement les rapports d'impressions de mes 10 annonceurs sur les 30 clubs, séparés par contrat, prêts à être envoyés à mes clients — je passe 2h à les valider au lieu d'une journée à les fabriquer un par un sous Excel."*

**Interactions Neopro** : Dashboard régie multi-tenant (gestion annonceurs sous-jacents, allocation inventaires multi-clubs, rapports automatiques séparés par contrat, gestion permissions cloisonnées)

**Fréquence d'usage** : daily (gestion campagnes en cours) + monthly (validation reporting)

**Source d'info** : 🔮 anticipation marché (pas de client régie à date) — capacité Neopro multi-tenant déjà prête côté code (cf. ADR-037 + workflow agency/advertiser/club ADR-035), à activer commercialement

---

## 9. 🟡 Agence multi-clubs

**En une phrase** : agence sport-marketing locale ou régionale qui gère plusieurs clubs simultanément — l'équivalent d'un "Représentant club × N clubs", avec besoin de rapidité et de cloisonnement strict.

**Frustration #1 sans Neopro** :
> *"Je suis responsable com pour 5 clubs régionaux qui m'ont délégué leur outil. Le samedi je dois me connecter sur 5 dashboards séparés (5 logins, 5 onglets), préparer 5 setups quasi-identiques, et un client m'a déjà reproché un mélange de pubs entre 2 clubs."*

**Moment "wow" avec Neopro** :
> *"Je me connecte avec un seul login sur le dashboard Neopro, je vois mes 5 clubs en bandeau supérieur, je bascule de l'un à l'autre en un clic sans risque de mélanger les pubs ou les sponsors — un samedi soir je gère 3 matches en parallèle depuis ma cuisine."*

**Interactions Neopro** : Dashboard agency multi-tenant (single sign-on N clubs, switcher contextuel, vue consolidée parc, alertes croisées, templates partagés)

**Fréquence d'usage** : daily

**Source d'info** : 🟡 capacité code prête (workflow agency multi-tenant existe), à valider commercialement avec une agence partenaire pilote

---

## 10. 🔮 Fédération sportive / Ligue

**En une phrase** : autorité institutionnelle (ex: LNH, FFHB, FFBB, etc.) qui supervise N clubs affiliés et peut négocier un partenariat global avec Neopro et avec des annonceurs nationaux pour le compte de tous ses membres.

**Frustration #1 sans Neopro** :
> *"Ma ligue représente 28 clubs pro. J'ai un partenariat ligue avec 3 grands annonceurs nationaux (Lidl, Crédit Agricole, etc.) qui doivent diffuser dans TOUS les arènes des clubs membres, sans que chaque club ait à le négocier individuellement. Aujourd'hui je leur envoie une liste Excel des contacts club et ils se débrouillent — résultat : exécution chaotique et invendable comme offre globale."*

**Moment "wow" avec Neopro** :
> *"Je signe un partenariat ligue avec Lidl pour 'présence dans les 28 arènes', je clique 'pousser à tous les clubs membres' depuis mon dashboard Fédération, et la semaine suivante je reçois le rapport agrégé d'impressions national — je peux vendre des packs ligue cohérents pour la première fois."*

**Interactions Neopro** : Dashboard fédération (gestion clubs affiliés, partenariats institutionnels poussés en cascade, reporting agrégé national, branding fédéral white-label)

**Fréquence d'usage** : weekly (suivi partenariats) + saisonnier (négociation annuelle)

**Source d'info** : 🔮 anticipation stratégique — canal de distribution massif. Si la LNH dit "tous nos clubs prennent Neopro", tu signes 28 clubs en 1 contrat. Mais clubs subis = engagement plus faible → arbitrage commercial à faire.

**Lien stratégique** : `BENCHMARK-COMPETITORS.md` identifie les certifications/partenariats fédéraux (FFBB, FIBA) comme avantage Bodet/Stramatel à rattraper. Cette persona est un levier de rattrapage si on signe une fédération en partenariat exclusif.

---

## Synthèse pour interview PM/CTO

### Tableau comparatif des 10 personae

| # | Persona | Statut | Touchpoint principal | Fréquence | Action prio PM jour 1 |
|---|---|---|---|---|---|
| 1 | Super_admin | 🟢 | Dashboard super_admin | daily | (interne — Daisy/futur PM) |
| 2 | Admin Support | 🟢 | Dashboard admin | daily | Interview pour mesurer charge support |
| 3 | Représentant club | 🟢 | Dashboard club + Remote | weekly + matchday | **PM jour 1 : interviewer NLF** |
| 4 | Staff bénévole | 🟢 | Remote uniquement | matchday | PM mois 1 : observation terrain matchday |
| 5 | Spectateur tribune | 🟢🔮 | Écran (passif) → QR (futur) | matchday | PM mois 2 : test MVP QR/jeu |
| 6 | Sponsor local | 🟡 | Mail auto → Portail (futur) | monthly | PM mois 1 : interview 3 sponsors NLF |
| 7 | Annonceur national | 🔮 | Dashboard annonceur | weekly + monthly | PM mois 3 : signer 1er annonceur réseau |
| 8 | Régie publicitaire | 🔮 | Dashboard régie multi-tenant | daily + monthly | PM mois 6+ : prospecter 1ère régie |
| 9 | Agence multi-clubs | 🟡 | Dashboard agency multi-tenant | daily | PM mois 4 : prospecter 1ère agence pilote |
| 10 | Fédération / Ligue | 🔮 | Dashboard fédération | weekly + saison | PM mois 6+ : approcher LNH/FFHB |

### Pour le pitch en 30 secondes

> *"Neopro sert 10 personae sur 3 niveaux : (1) les utilisateurs club (président, com, bénévole) qui pilotent leur matchday, (2) les bénéficiaires indirects (sponsors locaux, annonceurs réseau, régies, fédérations) qui monétisent l'audience, (3) le spectateur final dont l'engagement justifie tout le pricing. Aujourd'hui on sert solidement les 4 premiers, on ouvre les 6 autres au fil de la roadmap NEXT et LATER."*

### TODO Daisy persistants

- [ ] Valider terrain les 4 personae 🔮 (annonceur national, régie, fédération, spectateur interactif) avec interviews directes — task PM jour 1
- [ ] Documenter les 7 sites actifs nominativement (`docs/CLIENTS.md` privé) avec leur(s) persona(e) référent(e)(s)
- [ ] Confirmer que l'admin support (persona 2) est externe à Daisy ou est rempli par Daisy elle-même aujourd'hui
