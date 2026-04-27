# Cas d'usage Neopro — JTBD & scénarios multi-acteurs

> **Audience** : futur PM (jour 1, après lecture des personae) + futur CTO (comprendre les chaînes d'action) + Daisy (référence partagée pour challenger une décision produit)
>
> **Statut** : Live | **Dernière revue** : 2026-04-27 | **Source** : [PERSONAE.md](../PERSONAE.md) + [SPECs métier](../specs/) + interviews terrain Daisy
>
> **Pourquoi ce doc** : les [personae](../PERSONAE.md) répondent au _qui_ (archétype, frustration, moment wow). Les [SPECs](../specs/) répondent au _comment ça marche techniquement_. Ce doc remplit le chaînon **multi-acteurs** : _quel job concret est exécuté, par qui, dans quel contexte, avec quels touchpoints, et comment on prouve que ça réussit_.
>
> S'inspire des méthodes des agences de user research (IDEO, Adaptive Path) — pile JTBD (Christensen) + scenarios narratifs. Volontairement pas de journey map émotionnelle (overhead disproportionné pour une équipe d'une personne tant qu'aucun PM n'est embauché).

## Comment lire ce doc

| Couche                                       | Question répondue                                                   | Où la trouver                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Persona                                      | _Qui est cette personne ?_ archétype, motivation                    | [docs/PERSONAE.md](../PERSONAE.md)                                                     |
| Cas d'usage **mono-persona**                 | _Que fait-elle dans son métier au quotidien ?_                      | Section "Cas d'usage détaillés" inline dans `PERSONAE.md` (cf. 3b CU1-CU6, 3c CU1-CU8) |
| **JTBD** _(ce doc — § 1)_                    | _Quel job le persona embauche-t-il Neopro pour faire ?_             | Format Christensen _"Quand X, je veux Y, pour Z"_                                      |
| **Scénarios multi-acteurs** _(ce doc — § 2)_ | _Comment plusieurs personae se coordonnent dans un parcours réel ?_ | Narratif chronologique avant/pendant/après                                             |
| Spec métier                                  | _Comment ça marche en règles techniques observables ?_              | [docs/specs/](../specs/)                                                               |

**Quand utiliser quoi** :

- Tu prépares une interview client → lis le persona + ses CU inline
- Tu priorises un backlog → lis les JTBD (§1) pour identifier ce qui crée le plus de valeur
- Tu prépares une démo / un onboarding → lis les scénarios (§2) qui couvrent le persona cible
- Tu écris une nouvelle feature → vérifie qu'elle s'insère dans ≥1 scénario existant (sinon, soit tu crées un scénario, soit tu te demandes si la feature est légitime)

---

## § 1 — Jobs-to-be-Done (JTBD)

Format : _"Quand [situation déclenchante], je veux [motivation profonde], pour [résultat mesurable / émotion]"_. Un JTBD n'est pas une feature : c'est le **job qu'embauche le persona** ; plusieurs features Neopro peuvent servir le même JTBD.

### Cluster A — Piloter la flotte sans s'épuiser

**JTBD-A1 (Super_admin / persona 1)**

> Quand un week-end de matches arrive, je veux que la flotte se débrouille sans m'appeler, pour pouvoir vivre ma vie de famille sans Slack en main.

**JTBD-A2 (Admin Support / persona 2)**

> Quand un président de club appelle paniqué « la TV est noire », je veux comprendre en 30 secondes si c'est un faux positif ou un vrai incident, pour le rassurer avant qu'il rappelle et sans déplacement physique.

### Cluster B — Faire vivre le matchday sans budget Ligue A

**JTBD-B1 (Resp com club / persona 3b)**

> Quand le vendredi arrive, je veux préparer le show matchday en 45 min au lieu de 4h, pour récupérer mon dimanche et mon énergie pour les réseaux sociaux du lundi.

**JTBD-B2 (Staff bénévole / persona 4)**

> Quand on me demande « tiens le score samedi soir », je veux pouvoir le faire depuis ma place en tribune avec mon téléphone, pour profiter du match au lieu d'être collé à un PC en régie.

**JTBD-B3 (Spectateur / persona 5 — roadmap LATER)**

> Quand l'écran géant s'allume à la mi-temps, je veux pouvoir interagir avec mon téléphone (prono, vote MVP), pour vivre une émotion partagée avec mes voisins de tribune au lieu de scroller Insta.

### Cluster C — Prouver le ROI sponsor pour vendre plus cher

**JTBD-C1 (Resp partenaires / persona 3c)**

> Quand un prospect me demande « combien de personnes voient mon logo par mois ? », je veux pouvoir lui montrer un dashboard live en RDV, pour signer à 8 K€ au lieu des 3 K€ habituels.

**JTBD-C2 (Resp partenaires / persona 3c)**

> Quand juin arrive et que mes 8 sponsors veulent justifier leur reconduction au DAF, je veux qu'un PDF audit-grade parte automatiquement, pour passer le taux de reconduction de 60 % à 85 % sans 3 semaines d'Excel.

**JTBD-C3 (Sponsor / personae 6a, 6b, 6c)**

> Quand on m'envoie ma facture annuelle, je veux savoir où mon argent est passé sans avoir à demander, pour ne pas remettre en cause le partenariat l'année prochaine.

### Cluster D — Démultiplier sans perdre la qualité (segments réseau, futurs)

**JTBD-D1 (Annonceur national / persona 7 — 🔮)**

> Quand je lance une campagne nationale sur 50 clubs, je veux uploader ma vidéo une seule fois et tracker en temps réel, pour ne plus envoyer 50 WeTransfers à l'aveugle.

**JTBD-D2 (Agence multi-clubs / persona 9 — 🟡)**

> Quand je gère 5 clubs un samedi soir, je veux un seul login et un switcher contextuel, pour ne plus mélanger les pubs entre clients et perdre ma crédibilité.

**JTBD-D3 (Fédération / persona 10 — 🔮)**

> Quand je signe un partenariat ligue avec Lidl pour les 28 arènes membres, je veux pousser le contenu en 1 clic à toute la flotte, pour vendre des packs ligue cohérents pour la première fois.

---

## § 2 — Scénarios multi-acteurs

Chaque scénario est un parcours **chronologique** qui implique ≥2 personae. Format unique pour comparaison facile.

---

### Scénario 1 — Matchday d'un club ambitieux NLF, un samedi soir

**Déclencheur** : match programmé samedi 20h, 1 200 spectateurs attendus, 8 sponsors actifs dont 1 PME en renégociation.

**Acteurs** : 1 (Super_admin Daisy), 3a (Président), 3b (Resp com), 3c (Resp partenaires), 4 (Staff bénévole), 5 (Spectateur), 6b (Sponsor PME en observation).

**Trame** :

| Moment         | Acteur | Action                                                                                                       | Touchpoint Neopro                 | SPEC                                                                                                                   |
| -------------- | ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Vendredi 18h   | 3b     | Clone le scénario matchday de la semaine, met à jour les noms des joueurs, preview, déploie                  | Dashboard club → Studio Templates | [templates-studio](../specs/features/templates-studio.spec.md)                                                         |
| Vendredi 19h   | 3c     | Vérifie que le sponsor PME en renégo est bien en pack premium ce samedi (rotation pondérée)                  | Dashboard sponsors                | (à écrire : sponsors-rotation)                                                                                         |
| Samedi 18h     | 1      | Vérifie Grafana au passage (alerts sites silencieux) — flotte verte, ne fait rien                            | Grafana + Slack #neopro-alerts    | [socket-service](../specs/services/socket-service.spec.md)                                                             |
| Samedi 19h45   | 4      | Arrive en tribune, ouvre Remote sur sa tablette, voit la session match s'auto-créer au coup d'envoi          | Remote V2                         | [match-sessions](../specs/features/match-sessions.spec.md)                                                             |
| Samedi 20h-22h | 4 + 3b | Score live + transitions matchday automatiques. 3b déclenche les célébrations sur les buts depuis la tribune | Remote V2 + TV Player             | [match-sessions](../specs/features/match-sessions.spec.md), [socket-service](../specs/services/socket-service.spec.md) |
| Samedi 22h     | 4      | Quitte le gymnase. La session reste ouverte (oubli)                                                          | —                                 | —                                                                                                                      |
| Samedi 22h45   | (CRON) | Auto-close de la session inactive, score figé, `ended_by='timeout'`                                          | Cron scheduler                    | [cron-scheduler](../specs/services/cron-scheduler.spec.md), [match-sessions](../specs/features/match-sessions.spec.md) |
| Samedi 23h     | 5      | (🔮 LATER) A scanné le QR à la mi-temps, son prono apparaît dans le top 3 affiché 30s sur l'écran géant      | Mini-app web mobile               | (à écrire : spectateur-interactif)                                                                                     |
| Lundi matin    | 3a     | Ouvre son mail, lit le rapport matchday (impressions sponsors, taux de présence) — n'a pas touché à Neopro   | Mail auto rapport hebdo           | (à écrire : sponsor-reports)                                                                                           |
| Lundi matin    | 3c     | Envoie un mot personnalisé au sponsor PME en renégo avec son rapport individuel auto-généré                  | Portail sponsor + mail            | (à écrire : sponsor-reports)                                                                                           |
| Lundi midi     | 6b     | Reçoit son rapport mensuel consolidé, le présente en COMEX mardi                                             | Portail web sponsor               | (à écrire : sponsor-reports)                                                                                           |

**Métrique de succès** : 0 alerte Slack pour 1, scénario matchday déployé en <60 min par 3b, taux de reconduction 6b ≥85% sur l'année.

**Cas d'edge connus** :

- Coupure ENEDIS pendant le match → Pi reboot, 4 voit "reconnexion" sur Remote, recovery TV automatique au retour secteur
- 4 oublie de fermer la session → CRON auto-close à 22h45 (gel score, `ended_by='timeout'`, badge ⏲️ visible côté dashboard pour distinguer d'une fermeture manuelle)

---

### Scénario 2 — Onboarding d'un nouveau club

**Déclencheur** : club semi-pro signe un contrat Neopro après prospection. Premier match diffusé visé sous 3 semaines.

**Acteurs** : 1 (Super_admin), 2 (Admin Support), 3a (Président — décideur d'achat), 3b (Resp com — utilisateur quotidien à former).

**Trame** :

| J+    | Acteur  | Action                                                                           | Touchpoint                       |
| ----- | ------- | -------------------------------------------------------------------------------- | -------------------------------- |
| J0    | 1       | Crée le site, génère api_key, configure mode (Pi vs SaaS) selon contrat          | Dashboard super_admin            |
| J0+1h | 2       | Prépare l'image Pi (si Pi), expédie le boîtier ou envoie les credentials SaaS    | Backoffice + tracking colis      |
| J+3   | 2 + 3a  | Installation physique Pi (visioconférence), test connexion hotspot, premier ping | Dashboard admin (vue parc)       |
| J+5   | 3b      | Reçoit invitation dashboard club + tutoriel Studio                               | Mail onboarding + dashboard club |
| J+10  | 3b      | Crée son premier scénario matchday inspiré d'un template par défaut              | Dashboard club → Studio          |
| J+14  | 3b      | Premier match diffusé en pré-prod (match amical), ajustements                    | Studio + Remote                  |
| J+21  | 3a + 3b | Premier match officiel, 3a en tribune utilise Remote pour la 1ʳᵉ fois            | Remote V2 + TV Player            |
| J+28  | 3a      | Reçoit son premier rapport mensuel                                               | Mail auto                        |

**Métrique de succès** : premier match officiel diffusé J+21, 0 ticket support de J+14 à J+28.

**Cas d'edge connus** :

- Pi bloqué en hotspot (PSK rotation pré-déploiement) → procédure white-glove (ADR-073), à valider avant d'activer Phase 5b ADR-074
- Mode SaaS choisi puis client veut basculer Pi → migration manuelle (pas de bascule automatique en V1)

---

### Scénario 3 — Vente de sponsoring : prospection → renégociation

**Déclencheur** : 3c veut faire passer un prospect de "intéressé" à "signé à 8K€/an".

**Acteurs** : 3c (Resp partenaires), 3a (Président — co-pilote en RDV stratégique), prospect → 6b (PME régionale), Neopro.

**Trame** :

| Étape                          | Acteur  | Action                                                                                                            | Touchpoint                           |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Prospection (T-3 mois)         | 3c      | Sort en RDV avec son ordi, ouvre dashboard live : "12 800 impressions/mois sur 18 matches, breakdown par contrat" | Dashboard sponsors club + export PDF |
| Closing (T-2 mois)             | 3c + 3a | Présentent ensemble en RDV final, prospect signe pack premium 8K€ vs concurrence Google Ads                       | Dashboard sponsors + mail contrat    |
| Onboarding (T0)                | 3c      | Crée le sponsor dans le dashboard, upload logo HD + spot vidéo                                                    | Dashboard sponsors club              |
| Première diffusion (T+3 jours) | (auto)  | Spot diffusé au premier match, impressions trackées dès soir 1                                                    | TV Player + analytics                |
| Suivi mensuel (T+1 mois)       | 6b      | Reçoit son premier rapport individuel                                                                             | Portail web sponsor + mail           |
| Mid-season (T+6 mois)          | 6b      | Présente à son COMEX, justifie le budget face au DAF                                                              | Portail web sponsor (export PDF)     |
| Renégociation (T+12 mois)      | 3c      | Clique "rapport annuel sponsor X", PDF 8 pages auto-généré                                                        | Dashboard sponsors                   |
| Signature reconduction         | 6b      | Signe pour T+24 mois sans débat                                                                                   | Mail contrat                         |

**Métrique de succès** : ratio panier moyen sponsor (target 5K → 8K€), taux de reconduction (target 60% → 85%).

**Cas d'edge connus** :

- Sponsor demande une A/B test sur 2 visuels → capacité à activer (rotation pondérée), à formaliser dans la spec sponsors-rotation
- Sponsor veut voir les impressions live (pas juste mensuel) → portail web sponsor V1 doit exposer une vue temps réel (NEXT #2)

---

### Scénario 4 — Incident production un samedi soir

**Déclencheur** : à 19h45, un président de club (3a) appelle Daisy paniqué : "la TV est noire, on commence dans 15 minutes".

**Acteurs** : 1 (Super_admin Daisy), 2 (Admin Support — si externe), 3a (Président qui appelle), 4 (Staff bénévole sur place).

**Trame** :

| Minute      | Acteur | Action                                                                                                                             | Touchpoint              |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 19h45       | 3a     | Appelle Daisy en mode panique                                                                                                      | Téléphone (hors-Neopro) |
| 19h45 + 30s | 1 ou 2 | Ouvre dashboard sites, voit Pi en `restarting` (heartbeat absent depuis 2 min après une coupure ENEDIS)                            | Dashboard admin         |
| 19h46       | 1      | Rassure 3a : "ENEDIS, ça revient dans 2 minutes" — pas de SSH                                                                      | Téléphone               |
| 19h47       | (Pi)   | Pi reboot terminé, reconnecte au hotspot, heartbeat reprend, kiosk relance Chromium                                                | (auto)                  |
| 19h48       | 4      | Voit la TV revenir, lance la première vidéo manuelle pour vérifier                                                                 | Remote V2               |
| 19h50       | 1      | Vérifie Grafana : pas d'autre site impacté, pas d'alerte cascade                                                                   | Grafana + Prometheus    |
| 19h55       | 3a     | Rappelle pour confirmer "tout est ok, merci"                                                                                       | Téléphone               |
| Lundi       | 1      | Vérifie post-incident : `neopro_pi_reboots_total{cause="enedis"}` cohérent, ajoute si nécessaire un cas d'edge à la SPEC concernée | Grafana                 |

**Métrique de succès** : incident résolu sans SSH, TTR <5 min, 0 client perdu.

**SPECs concernées** : [socket-service](../specs/services/socket-service.spec.md) (heartbeat, recovery), TV Player (auto-recovery — à écrire), [match-sessions](../specs/features/match-sessions.spec.md) (continuité session après reboot Pi en cours de match).

**Cas d'edge connus** :

- Si Pi reste DOWN >5 min → escalade vers procédure SSH manuelle (encore aujourd'hui, à automatiser en LATER)
- Si la coupure ENEDIS dure 2h → batterie UPS si présente, sinon kiosk redémarre proprement au retour (ADR-091)

---

### Scénario 5 — Soirée gala / événement hors-match

**Déclencheur** : club organise une soirée partenaires en loge VIP un mardi soir, sans match.

**Acteurs** : 3a (Président — délègue à 3c), 3c (Resp partenaires — orchestre), 3b (Resp com — fournit les visuels).

**Trame** :

| Étape       | Acteur | Action                                                                                         | Touchpoint              |
| ----------- | ------ | ---------------------------------------------------------------------------------------------- | ----------------------- |
| J-7         | 3c     | Crée l'animation événementielle "soirée VIP CA mardi 20h" depuis le dashboard sponsors         | Dashboard sponsors club |
| J-3         | 3b     | Fournit le visuel "Bienvenue partenaires CA — dégustation à la mi-temps" via Studio            | Studio Templates        |
| J-1         | 3c     | Programme la diffusion mardi 19h45-22h, vérifie qu'elle ne casse pas la programmation matchday | Dashboard programmation |
| Mardi 19h45 | (auto) | L'animation s'affiche automatiquement à l'heure prévue                                         | TV Player               |
| Mardi 22h   | (auto) | Fin de programmation événementielle, retour à l'écran de veille standard                       | TV Player               |
| Mercredi    | 3c     | Vérifie les impressions de la soirée pour son rapport partenaires                              | Dashboard sponsors      |

**Métrique de succès** : 0 conflit avec la programmation matchday standard, 100% des partenaires VIP confirment "ils ont vu leur message".

**SPECs concernées** : [templates-studio](../specs/features/templates-studio.spec.md), [cron-scheduler](../specs/services/cron-scheduler.spec.md) (tâches programmées), [socket-service](../specs/services/socket-service.spec.md) (push contenu).

---

### Scénario 6 — Création de contenu publicitaire annonceur national (🔮 roadmap)

**Déclencheur** : annonceur national signe un pack "50 clubs en France pour 6 mois", uploade son spot une seule fois.

**Acteurs** : 7 (Annonceur national), 1 (Super_admin Neopro — validation), 3b (Resp com de chaque club — vérifie l'intégration), 4 (Staff jour de match — neutre, ne sait rien du flux).

**Trame** :

| Étape                         | Acteur | Action                                                                                   | Touchpoint                     |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------- | ------------------------------ |
| J0                            | 7      | Login dashboard annonceur, upload spot 30s, sélectionne 50 clubs cibles, dates, créneaux | Dashboard annonceur (à écrire) |
| J0+15 min                     | 1      | Reçoit notification de validation, vérifie que le contenu respecte la charte             | Dashboard super_admin          |
| J0+30 min                     | (auto) | Spot pushé à la flotte, dispo sur les 50 sites Pi/SaaS                                   | Storage + sync-agent           |
| J+1 (premier match d'un club) | 3b     | Voit le spot dans son scénario matchday "campagne nationale en cours du J0 au J+180"     | Dashboard club                 |
| J+7                           | 7      | Suit le compteur impressions temps réel par club                                         | Dashboard annonceur            |
| J+30                          | 7      | Reçoit rapport mensuel agrégé                                                            | Mail auto                      |

**Métrique de succès** : 50 clubs activés en <2h après upload, 0 WeTransfer manuel, taux de remplissage inventaire >80%.

**SPECs concernées** : (à écrire : annonceur-network, dashboard annonceur, network-content-distribution).

**Cas d'edge connus** : aucun — scénario non encore implémenté côté UI dashboard annonceur (capacité multi-tenant existe en backend cf. ADR-035).

---

## § 3 — Couverture personae × scénarios

| Persona             | S1 Matchday      | S2 Onboarding | S3 Sponsoring   | S4 Incident | S5 Gala   | S6 Annonceur |
| ------------------- | ---------------- | ------------- | --------------- | ----------- | --------- | ------------ |
| 1 Super_admin       | ✅               | ✅            | —               | ✅          | —         | ✅           |
| 2 Admin Support     | —                | ✅            | —               | ✅          | —         | —            |
| 3a Président        | ✅               | ✅            | ✅              | ✅          | (délègue) | —            |
| 3b Resp com         | ✅               | ✅            | —               | —           | ✅        | ✅           |
| 3c Resp partenaires | ✅               | —             | ✅              | —           | ✅        | —            |
| 4 Staff bénévole    | ✅               | —             | —               | ✅          | —         | (passif)     |
| 5 Spectateur        | (🔮)             | —             | —               | —           | —         | —            |
| 6a Commerçant       | —                | —             | (variant léger) | —           | —         | —            |
| 6b PME              | ✅               | —             | ✅              | —           | —         | —            |
| 6c Institutionnel   | —                | —             | (variant audit) | —           | —         | —            |
| 7 Annonceur         | —                | —             | —               | —           | —         | ✅           |
| 9 Agence            | (futur scenario) | —             | —               | —           | —         | —            |
| 10 Fédération       | (futur scenario) | —             | —               | —           | —         | (futur)      |

**Lecture** :

- Tous les personae 🟢 actifs en prod sont couverts par ≥1 scénario
- Personae 🔮 (5 spectateur, 7 annonceur, 10 fédération) ont un scénario partiel — à compléter quand un client réel valide l'usage
- Personae 6a/6c apparaissent en variant dans S3, à formaliser quand le portail sponsor V1 est livré

---

## § 4 — Cycle de vie de ce doc

| Évènement                   | Action                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Nouveau persona ajouté      | Vérifier qu'il est cité dans ≥1 scénario, sinon en créer un                                               |
| Persona promue 🔮 → 🟡 → 🟢 | Mettre à jour la matrice § 3 + envisager un scénario dédié                                                |
| Nouvelle SPEC livrée        | Vérifier qu'elle est référencée dans ≥1 scénario (sinon, soit elle est trop fine soit le scénario manque) |
| Incident production         | Si nouveau type, ajouter un cas d'edge au scénario concerné + lien post-mortem                            |
| Revue planifiée             | Tous les 6 mois, en parallèle de la revue PERSONAE.md                                                     |

## § 5 — Ce qui n'est PAS dans le scope

- ❌ User stories format SAFe → [docs/safe/USER-STORIES.md](../safe/USER-STORIES.md)
- ❌ Règles techniques détaillées par composant → [docs/specs/](../specs/)
- ❌ Mockups, wireframes, journey maps émotionnels → reportés post-embauche PM
- ❌ Stratégie commerciale / pricing → [docs/strategy/](../strategy/), [docs/business/](../business/)

## § 6 — Évolutions possibles

- [ ] Ajouter un scénario "Gestion multi-clubs par une agence régionale" (persona 9)
- [ ] Ajouter un scénario "Partenariat ligue : Lidl × 28 clubs LNH" (persona 10)
- [ ] Ajouter un scénario "Soirée VIP avec mini-app spectateur interactif" (persona 5 — quand QR code livré)
- [ ] Mesurer empiriquement le ratio "scénarios cités en démo prospect" pour valider l'utilité du doc
- [ ] Quand 1ʳᵉ embauche PM, basculer en journey maps complets si valeur ajoutée prouvée
