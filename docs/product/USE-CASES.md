# Cas d'usage Neopro — JTBD, scénarios, catalogue & journeys

> **Audience** : futur PM (jour 1, après lecture des personae) + futur CTO (comprendre les chaînes d'action) + Daisy (référence partagée pour challenger une décision produit)
>
> **Statut** : Live | **Dernière revue** : 2026-05-01 | **Source** : [PERSONAE.md](../PERSONAE.md) + [SPECs métier](../specs/) + interviews terrain Daisy + bundle UX research 2026-04-27
>
> **Pourquoi ce doc** : les [personae](../PERSONAE.md) répondent au _qui_ (archétype, frustration, moment wow). Les [SPECs](../specs/) répondent au _comment ça marche techniquement_. Ce doc remplit le chaînon **multi-acteurs et multi-couches** : _quel job concret est exécuté, par qui, dans quel contexte, avec quels touchpoints, comment plusieurs personae se coordonnent, et comment c'est ressenti dans le temps_.
>
> S'inspire des méthodes des agences de user research (IDEO, Adaptive Path, Nielsen Norman) — pile **JTBD (Christensen) + scénarios narratifs + catalogue atomique avec ID stables + journey maps émotionnels**.
>
> **Note 2026-05-01** : la version initiale (2026-04-27) avait volontairement écarté le catalogue atomique et les journey maps émotionnels comme "overhead disproportionné pour une équipe d'une personne". Décision révisée : Daisy a demandé le bundle UX complet (cf. session "comment font les agences pros ?") pour préparer l'onboarding PM avec des artefacts standards de l'industrie.

## Comment lire ce doc

| Couche                                        | Question répondue                                                                                 | Où la trouver                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Persona                                       | _Qui est cette personne ?_ archétype, motivation                                                  | [docs/PERSONAE.md](../PERSONAE.md)                          |
| **JTBD** _(ce doc — § 1)_                     | _Quel job le persona embauche-t-il Neopro pour faire ?_                                           | Format Christensen _"Quand X, je veux Y, pour Z"_           |
| **Scénarios multi-acteurs** _(ce doc — § 2)_  | _Comment plusieurs personae se coordonnent dans un parcours réel ?_                               | Narratif chronologique avant/pendant/après                  |
| **Catalogue atomique CU** _(ce doc — § 3)_    | _Quelle situation atomique vit le persona ?_ avec ID stable (`CU-3b-1`, etc.)                     | 44 CUs catalogués, 14 détaillés, 30 stubs                   |
| **Journey maps émotionnels** _(ce doc — § 4)_ | _Quel est le ressenti du persona dans le temps ?_ courbe émotionnelle, pain points, magic moments | 3 journeys clés (matchday, prospection, mois 1 sponsor PME) |
| Spec métier                                   | _Comment ça marche en règles techniques observables ?_                                            | [docs/specs/](../specs/)                                    |

**Quand utiliser quoi** :

- Tu prépares une interview client → lis le persona + ses CUs (§3) + le journey associé (§4)
- Tu priorises un backlog → lis les JTBD (§1) pour la valeur + le catalogue (§3) pour le statut roadmap
- Tu prépares une démo / un onboarding → lis les scénarios (§2) qui couvrent le persona cible
- Tu écris une nouvelle feature → vérifie qu'elle s'insère dans ≥1 scénario (§2) ET qu'elle adresse ≥1 CU (§3)
- Tu prépares une slide pitch → cite un magic moment d'un journey (§4) pour humaniser
- Tu fais un post-mortem incident → ajoute un cas d'edge au scénario concerné (§2)

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

**JTBD-B2 (Opérateur matchday / persona 4)**

> Quand on me demande de gérer les écrans samedi soir, je veux pouvoir tout faire depuis ma place en tribune avec mon téléphone — one-hand si je commente au micro — pour profiter du match au lieu d'être collé à un PC en régie.

**JTBD-B3 (Spectateur / persona 5 — roadmap LATER)**

> Quand l'écran géant s'allume à la mi-temps, je veux pouvoir interagir avec mon téléphone (prono, vote MVP), pour vivre une émotion partagée avec mes voisins de tribune au lieu de scroller Insta.

### Cluster C — Prouver le ROI sponsor pour vendre plus cher

**JTBD-C1 (Resp partenaires / persona 3c)**

> Quand un prospect me demande « combien de personnes voient mon logo par mois ? », je veux pouvoir lui montrer un dashboard live en RDV, pour signer à 8 K€ au lieu des 3 K€ habituels.

**JTBD-C2 (Resp partenaires / persona 3c)**

> Quand juin arrive et que mes 8 sponsors veulent justifier leur reconduction au DAF, je veux qu'un PDF audit-grade parte automatiquement, pour passer le taux de reconduction de 60 % à 85 % sans 3 semaines d'Excel.

**JTBD-C3 (Partenaire / Acheteur media / persona 6 — niveaux 1→4)**

> Quand on m'envoie ma facture annuelle, je veux savoir où mon argent est passé sans avoir à demander, pour ne pas remettre en cause le partenariat l'année prochaine.

### Cluster D — Démultiplier sans perdre la qualité (segments réseau, futurs)

**JTBD-D1 (Annonceur national / persona 7 — 🔮)**

> Quand je lance une campagne nationale sur 50 clubs, je veux uploader ma vidéo une seule fois et tracker en temps réel, pour ne plus envoyer 50 WeTransfers à l'aveugle.

**JTBD-D2 (Agence multi-clubs / persona 8 — 🟡)**

> Quand je gère 5 clubs un samedi soir, je veux un seul login et un switcher contextuel, pour ne plus mélanger les pubs entre clients et perdre ma crédibilité.

**JTBD-D3 (Fédération / persona 9 — 🔮)**

> Quand je signe un partenariat ligue avec Lidl pour les 28 arènes membres, je veux pousser le contenu en 1 clic à toute la flotte, pour vendre des packs ligue cohérents pour la première fois.

**JTBD-D4 (Installateur / persona 10 — 🟡)**

> Quand un club m'appelle à 19h45 "l'écran est noir", je veux ouvrir un accès distant structuré depuis mon téléphone, pour relancer le kiosk en 2 minutes sans me déplacer.

---

## § 2 — Scénarios multi-acteurs

Chaque scénario est un parcours **chronologique** qui implique ≥2 personae. Format unique pour comparaison facile.

---

### Scénario 1 — Matchday d'un club ambitieux NLF, un samedi soir

**Déclencheur** : match programmé samedi 20h, 1 200 spectateurs attendus, 8 sponsors actifs dont 1 PME en renégociation.

**Acteurs** : 1 (Super_admin Daisy), 3a (Président), 3b (Resp com), 3c (Resp partenaires), 4 (Opérateur matchday), 5 (Spectateur), 6 niveau 2 (Sponsor PME en observation).

**Trame** :

| Moment         | Acteur  | Action                                                                                                         | Touchpoint Neopro                    | SPEC                                                                                                                   |
| -------------- | ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Vendredi 18h   | 3b      | Clone le scénario matchday de la semaine, met à jour les noms des joueurs, preview, déploie                    | Dashboard club → Templates Studio V1 | ADR-123/124/125/127/128 (V1 code-driven ; SPEC V2 supprimée en ADR-129)                                                |
| Vendredi 19h   | 3c      | Vérifie que le sponsor PME en renégo est bien en pack premium ce samedi (rotation pondérée)                    | Dashboard sponsors                   | (à écrire : sponsors-rotation)                                                                                         |
| Samedi 18h     | 1       | Vérifie Grafana au passage (alerts sites silencieux) — flotte verte, ne fait rien                              | Grafana + Slack #neopro-alerts       | [socket-service](../specs/services/socket-service.spec.md)                                                             |
| Samedi 19h45   | 4       | Arrive en tribune, ouvre Remote sur sa tablette (one-hand), voit la session match s'auto-créer au coup d'envoi | Remote V2                            | [match-sessions](../specs/features/match-sessions.spec.md)                                                             |
| Samedi 20h-22h | 4 + 3b  | Score live + transitions matchday automatiques. 4 déclenche les célébrations sur les buts depuis la tribune    | Remote V2 + TV Player                | [match-sessions](../specs/features/match-sessions.spec.md), [socket-service](../specs/services/socket-service.spec.md) |
| Samedi 22h     | 4       | Quitte le gymnase. La session reste ouverte (oubli)                                                            | —                                    | —                                                                                                                      |
| Samedi 22h45   | (CRON)  | Auto-close de la session inactive, score figé, `ended_by='timeout'`                                            | Cron scheduler                       | [cron-scheduler](../specs/services/cron-scheduler.spec.md), [match-sessions](../specs/features/match-sessions.spec.md) |
| Samedi 23h     | 5       | (🔮 LATER) A scanné le QR à la mi-temps, son prono apparaît dans le top 3 affiché 30s sur l'écran géant        | Mini-app web mobile                  | (à écrire : spectateur-interactif)                                                                                     |
| Lundi matin    | 3a      | Ouvre son mail, lit le rapport matchday (impressions sponsors, taux de présence) — n'a pas touché à Neopro     | Mail auto rapport hebdo              | (à écrire : sponsor-reports)                                                                                           |
| Lundi matin    | 3c      | Envoie un mot personnalisé au sponsor PME en renégo avec son rapport individuel auto-généré                    | Portail sponsor + mail               | (à écrire : sponsor-reports)                                                                                           |
| Lundi midi     | 6 niv.2 | Reçoit son rapport mensuel consolidé, le présente en COMEX mardi                                               | Portail web sponsor                  | (à écrire : sponsor-reports)                                                                                           |

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

**Acteurs** : 1 (Super_admin Daisy), 2 (Admin Support — si externe), 3a (Président qui appelle), 4 (Opérateur matchday sur place), 10 (Installateur — escalade si Pi reste DOWN >5 min).

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

**SPECs concernées** : Templates Studio V1 (ADR-123/124/125/127/128 — SPEC V2 supprimée en ADR-129), [cron-scheduler](../specs/services/cron-scheduler.spec.md) (tâches programmées), [socket-service](../specs/services/socket-service.spec.md) (push contenu).

---

### Scénario 6 — Création de contenu publicitaire annonceur national (🔮 roadmap)

**Déclencheur** : annonceur national signe un pack "50 clubs en France pour 6 mois", uploade son spot une seule fois.

**Acteurs** : 7 (Annonceur réseau), 1 (Super_admin Neopro — validation), 3b (Resp com de chaque club — vérifie l'intégration), 4 (Opérateur matchday — neutre, ne sait rien du flux).

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

## § 3 — Catalogue atomique des cas d'usage

> Là où §2 raconte un parcours multi-acteurs, **§3 décompose chaque persona en CUs atomiques avec ID stables**. Un CU peut être référencé par un scénario (§2), un journey (§4), une SPEC, une PR, un ticket support — ou tous à la fois.

### Convention d'identifiant

`CU-<persona>-<num>` — exemples : `CU-3b-1` (1er CU du persona 3b), `CU-3c-5` (5e CU du persona 3c).

Les ID sont **stables** : on n'en supprime pas, on en ajoute. Un CU obsolète est marqué `🗄️ ARCHIVÉ` mais conserve son ID pour préserver les liens roadmap / specs / commits.

### Convention de statut

| Emoji | Statut  | Signification                                               |
| ----- | ------- | ----------------------------------------------------------- |
| 🟢    | NOW     | Couvert en prod aujourd'hui, vérifié terrain                |
| 🟡    | PARTIAL | Capacité code prête mais usage pas activé / pas généralisé  |
| 🔮    | NEXT    | Prévu roadmap NEXT (M0-3)                                   |
| 🛣️    | LATER   | Prévu roadmap LATER (M3+)                                   |
| ❌    | GAP     | Identifié comme besoin, ni couvert ni planifié — à arbitrer |
| 🗄️    | ARCHIVÉ | CU obsolète, conservé pour traçabilité historique           |

### Index par persona

| Persona                         | CUs détaillés | Total CUs | Doc dédié         |
| ------------------------------- | ------------- | --------- | ----------------- |
| 1. Super_admin                  | 0             | 4         | `PERSONAE.md` §1  |
| 2. Admin Support                | 0             | 4         | `PERSONAE.md` §2  |
| 3a. Président club              | 0             | 2         | `PERSONAE.md` §3a |
| **3b. Resp communication club** | **6**         | **6**     | `PERSONAE.md` §3b |
| **3c. Resp partenaires club**   | **8**         | **8**     | `PERSONAE.md` §3c |
| 4. Staff bénévole               | 0             | 2         | `PERSONAE.md` §4  |
| 5. Spectateur tribune           | 0             | 3         | `PERSONAE.md` §5  |
| 6a. Commerçant proximité        | 0             | 1         | `PERSONAE.md` §6a |
| 6b. PME régionale               | 0             | 2         | `PERSONAE.md` §6b |
| 6c. Partenaire institutionnel   | 0             | 1         | `PERSONAE.md` §6c |
| 7. Annonceur national           | 0             | 3         | `PERSONAE.md` §7  |
| 8. Régie publicitaire           | 0             | 3         | `PERSONAE.md` §8  |
| 9. Agence multi-clubs           | 0             | 2         | `PERSONAE.md` §9  |
| 10. Fédération / Ligue          | 0             | 3         | `PERSONAE.md` §10 |
| **TOTAL**                       | **14**        | **44**    |                   |

> **Note** : seuls 3b et 3c sont détaillés à ce jour. Les 30 autres CUs sont des stubs (titre + statut + 1-2 phrases). Priorité de détaillage à arbitrer avec le PM jour 1 — voir §3.5 "Gaps identifiés".

### Index par statut roadmap

| Statut         | Count | CUs                                                                                    |
| -------------- | ----- | -------------------------------------------------------------------------------------- |
| 🟢 NOW         | 13    | CU-1-1 à 1-4, CU-2-1 à 2-4, CU-3b-1, CU-3b-2, CU-3b-3, CU-3b-5, CU-4-1, CU-4-2, CU-5-1 |
| 🟡 PARTIAL     | 11    | CU-3a-1, CU-3a-2, CU-3b-6, CU-3c-1 à 3c-7, CU-9-1, CU-9-2                              |
| 🔮 NEXT (M0-3) | 5     | CU-6a-1, CU-6b-1, CU-6b-2, CU-3c-8 (partiel)                                           |
| 🛣️ LATER (M3+) | 14    | CU-3b-4, CU-5-2, CU-5-3, CU-6c-1, CU-7-1 à 7-3, CU-8-1 à 8-3, CU-10-1 à 10-3           |
| ❌ GAP         | 0     | (3 GAPs identifiés via les journeys §4 — non encore catalogués comme CU)               |

### Index par composant produit

| Composant                                          | CUs principaux                         |
| -------------------------------------------------- | -------------------------------------- |
| Dashboard super_admin                              | CU-1-1 à 1-4                           |
| Dashboard admin support                            | CU-2-1 à 2-4                           |
| Dashboard club (lecture KPI)                       | CU-3a-1, CU-3a-2                       |
| **Studio Remotion (Template Studio v2)**           | **CU-3b-1, CU-3b-3, CU-3b-5, CU-3c-7** |
| **Scénarios matchday + Remote**                    | **CU-3b-2, CU-4-1, CU-4-2, CU-3c-7**   |
| Réseaux sociaux post-match (LATER)                 | CU-3b-4                                |
| Coordination Studio ↔ rotation pondérée sponsors   | CU-3b-6, CU-3c-6                       |
| **Dashboard sponsors (rotation pondérée + packs)** | **CU-3c-1 à 3c-6**                     |
| **Portail sponsor + mail mensuel auto**            | **CU-3c-5, CU-6a-1, CU-6b-1, CU-6b-2** |
| Rapport semestriel collectivité                    | CU-3c-8, CU-6c-1                       |
| Écran TV passif (pubs + score)                     | CU-5-1                                 |
| QR mini-app interactive (LATER)                    | CU-5-2, CU-5-3                         |
| Dashboard annonceur réseau                         | CU-7-1 à 7-3                           |
| Dashboard régie multi-tenant                       | CU-8-1 à 8-3                           |
| Dashboard agency multi-tenant                      | CU-9-1, CU-9-2                         |
| Dashboard fédération white-label                   | CU-10-1 à 10-3                         |

### § 3.1 — CUs détaillés : Persona 3b (Resp communication / Community manager club)

> 6 CUs — c'est la persona qui justifie l'investissement Template Studio v2.

#### 🟢 CU-3b-1 : Préparation matchday hebdomadaire

- **Fréquence** : weekly | **Touchpoint** : Studio + scénario match
- **Sans Neopro** : _"Chaque vendredi je repars de zéro sur Canva — 4h pour refaire faits de jeu / intro joueurs / bandeau sponsors, rien n'est réutilisable d'une semaine sur l'autre."_
- **Avec Neopro** : _"Je clone le scénario de la semaine dernière, j'actualise les noms des joueurs, je preview, je déploie en 45 min — le samedi soir tourne tout seul."_
- **Composants** : Template Studio v2 (`docs/templates/`), scénarios matchday | **Métrique** : temps préparation < 1h (vs 4h sans)

#### 🟢 CU-3b-2 : Animation live pendant le match

- **Fréquence** : matchday | **Touchpoint** : Remote en tribune (smartphone/tablette)
- **Sans Neopro** : _"Pendant le match collé au PC de régie au lieu de profiter de l'ambiance — chaque transition manuelle, je rate la moitié des moments forts."_
- **Avec Neopro** : _"Avec la Remote sur tablette je suis en tribune, je déclenche les célébrations sur les buts en temps réel, et la mi-temps part toute seule à 25:00."_
- **Composants** : Remote, scénarios matchday, ADR-093 match sessions | **Métrique** : 0 PC de régie nécessaire

#### 🟢 CU-3b-3 : Habillage saison / charte graphique club

- **Fréquence** : once + ajustements | **Touchpoint** : Studio (templates de base + variables club)
- **Sans Neopro** : _"Quand le club change de sponsor maillot, je reprends 30 templates Canva un par un — 2 jours pour une modif qui devrait prendre 10 min."_
- **Avec Neopro** : _"La charte club est définie une fois dans le Studio, tous les templates en héritent — 1 modif → cascade automatique sur la flotte."_
- **Composants** : Template Studio v2 (variables club), `template_fonts`, ADR-086

#### 🛣️ CU-3b-4 : Highlights + posts réseaux sociaux post-match

- **Fréquence** : weekly post-match | **Touchpoint** : Studio → export auto Insta/TikTok
- **Sans Neopro** : _"Dimanche midi je monte les highlights manuellement pendant que mes proches déjeunent — je poste lundi 14h, engagement divisé par 3."_
- **Avec Neopro** : _"À la fin du match Neopro pousse automatiquement le clip 'score final + meilleur moment' sur les réseaux du club, engagement Insta x4 vs publication lundi."_
- **Statut** : 🛣️ LATER — Remotion async render existe (ADR-054/055), intégration RS à faire | **Métrique** : engagement Insta cible x4

#### 🟢 CU-3b-5 : Communication hors-match

- **Fréquence** : weekly | **Touchpoint** : calendrier diffusion (Studio + scheduler)
- **Sans Neopro** : _"L'écran tourne en boucle sur les pubs entre les matches — pas d'outil pour planifier les annonces club (entraînements, AG, résultats jeunes)."_
- **Avec Neopro** : _"Je crée 'AG mercredi 18h' depuis le Studio, programmée 18h-21h les soirs d'ouverture publique — s'affiche sans toucher au reste."_

#### 🟡 CU-3b-6 : Coordination avec 3c (sponsors dans la programmation)

- **Fréquence** : weekly | **Touchpoint** : Dashboard sponsors en lecture (rotation pondérée définie par 3c)
- **Sans Neopro** : _"Resp partenaires me dit 'fais passer Decathlon plus souvent en mi-temps' — sans outil partagé je dois deviner, 2-3 allers-retours par semaine."_
- **Avec Neopro** : _"Resp partenaires configure la rotation pondérée côté dashboard, mes scénarios matchday lisent automatiquement les emplacements alloués — contrat respecté par construction."_
- **Voir aussi** : CU-3c-6 (perspective miroir)

### § 3.2 — CUs détaillés : Persona 3c (Resp partenaires / sponsoring club)

> 8 CUs — c'est la persona qui transforme Neopro d'un "outil tech" en "levier commercial".

#### 🟡 CU-3c-1 : Prospection nouveaux sponsors

- **Fréquence** : weekly | **Touchpoint** : export PDF + dashboard live en RDV
- **Sans Neopro** : _"Prospection avec un PPT de 2023 et 3 photos de tribune — quand le prospect demande 'combien voient mon logo par mois ?' aucune réponse, il part sur du Google Ads."_
- **Avec Neopro** : _"En RDV je sors mon ordi sur Neopro live : '12 800 impressions/mois sur 18 matches, breakdown par contrat' — le prospect signe à 8K€/an au lieu des 3K€ habituels."_
- **Métrique** : ticket moyen 3K€ → 8K€ (×2,7)

#### 🟡 CU-3c-2 : Renégociation annuelle des contrats

- **Fréquence** : seasonal peak (juin) | **Touchpoint** : rapports ROI 12 mois
- **Sans Neopro** : _"Juin = 3 semaines à fabriquer des bilans Excel, beaucoup ne renouvellent pas faute d'arguments."_
- **Avec Neopro** : _"Clic 'rapport annuel sponsor X', PDF 8 pages avec impressions cumulées + courbe d'évolution + comparatif anonymisé — taux de reconduction 60% → 85%."_
- **Métrique** : taux reconduction 60% → 85%

#### 🟡 CU-3c-3 : Construction des packs commerciaux

- **Fréquence** : once + ajustements | **Touchpoint** : Dashboard sponsors / rotation pondérée
- **Sans Neopro** : _"Tous sponsors au même tarif faute de différencier 'logo bandeau' et 'spot vidéo mi-temps' — marge laissée à chaque renouvellement."_
- **Avec Neopro** : _"4 packs bronze/argent/or/platine avec fréquences et emplacements distincts, dashboard prouve que platine génère 4x plus d'impressions premium — facturation x4 sans débat."_
- **Métrique** : prix pack platine = 4× pack bronze justifié par data

#### 🟡 CU-3c-4 : Onboarding nouveau sponsor signé

- **Fréquence** : événementiel | **Touchpoint** : Dashboard sponsors + Studio
- **Sans Neopro** : _"Sponsor signé mardi → 3 semaines à récupérer logo HD, le faire retoucher, le pousser au resp com — sponsor s'inquiète."_
- **Avec Neopro** : _"Sponsor signé mardi, créé dans dashboard mercredi avec logo et vidéo, premier rapport reçu samedi soir après son 1er match diffusé — onboarding 4 jours."_
- **Métrique** : délai onboarding 3 semaines → 4 jours

#### 🟡 CU-3c-5 : Reporting mensuel automatique aux sponsors actuels

- **Fréquence** : monthly | **Touchpoint** : mail auto + portail sponsor
- **Sans Neopro** : _"1er du mois : 2 jours à compiler 8 bilans Excel et envoyer un par un — temps perdu pour la prospection."_
- **Avec Neopro** : _"1er du mois : 15 min à vérifier les rapports auto, mot personnalisé pour 2-3 partenaires clés, matinée libérée pour appeler des prospects."_
- **Statut** : capacité technique prête (sponsor reports), Sponsor Portal V1 à livrer NEXT M2-3 | **Métrique** : temps reporting mensuel 2j → 15 min

#### 🟡 CU-3c-6 : Allocation des emplacements premium

- **Fréquence** : weekly | **Touchpoint** : Dashboard sponsors (rotation pondérée)
- **Sans Neopro** : _"3 sponsors majeurs veulent tous 'être visibles à mi-temps' — j'arbitre manuellement chaque match, quelqu'un râle inévitablement."_
- **Avec Neopro** : _"Rotation pondérée saisonnière (Decathlon 3x/match mi-temps, banque locale 2x/match bandeau...) — le système tourne, preuve à l'appui en cas de litige."_
- **Voir aussi** : CU-3b-6 (perspective miroir)

#### 🟡 CU-3c-7 : Animation relationnelle VIP / soirées partenaires

- **Fréquence** : event-based | **Touchpoint** : Studio + Remote
- **Sans Neopro** : _"Soirée partenaires en loge un soir de match : message écran 'Bienvenue partenaires CA' à mailer au resp com 3 jours à l'avance."_
- **Avec Neopro** : _"Animation événementielle 'soirée VIP CA mardi 20h' depuis le dashboard — s'affiche automatiquement entre 19h45 et 22h sans toucher à la programmation matchday standard."_

#### 🟡 CU-3c-8 : Reporting institutionnel pour 6c (collectivités)

- **Fréquence** : semestriel | **Touchpoint** : export PDF formaté admin
- **Sans Neopro** : _"Mairie demande son rapport semestriel de visibilité — 1 journée par collectivité, format jamais standard."_
- **Avec Neopro** : _"Clic 'rapport semestriel collectivité' avec dates début/fin, PDF formaté admin (heures cumulées, impressions estimées) — annexable directement à la convention de partenariat."_
- **Voir aussi** : CU-6c-1 (perspective lecteur)

### § 3.3 — CUs en stub (autres personae)

Format compact — à détailler quand priorité PM le justifie.

**Persona 1 (Super_admin)** : `🟢 CU-1-1` Monitoring flotte parallèle | `🟢 CU-1-2` Onboarding nouveau site Pi/SaaS | `🟢 CU-1-3` Gestion users / advertisers / agencies (multi-tenant ADR-035/041/042) | `🟢 CU-1-4` Support client N0 (escalade depuis 2)

**Persona 2 (Admin Support)** : `🟢 CU-2-1` Support distant N1 sur incident club | `🟢 CU-2-2` Création nouveau site (délégué par 1) | `🟢 CU-2-3` Vue parc temps réel (heartbeat) | `🟢 CU-2-4` Commandes remote (restart kiosk, rotate PSK)

**Persona 3a (Président)** : `🟡 CU-3a-1` Lecture rapport stratégique trimestriel | `🟡 CU-3a-2` Validation budget Neopro en bureau directeur

**Persona 4 (Staff bénévole)** : `🟢 CU-4-1` Tenir le score live pendant le match | `🟢 CU-4-2` Lancer une vidéo manuelle (entrée équipe, but)

**Persona 5 (Spectateur)** : `🟢 CU-5-1` Regarder pubs + score (passif) | `🛣️ CU-5-2` Scanner QR + jouer un pronostic | `🛣️ CU-5-3` Voter pour le MVP du match

**Persona 6a (Commerçant proximité)** : `🔮 CU-6a-1` Réception mail mensuel light (photo + 1 chiffre)

**Persona 6b (PME régionale)** : `🔮 CU-6b-1` Lecture portail web sponsor multi-clubs | `🔮 CU-6b-2` Export PDF mensuel pour COMEX

**Persona 6c (Partenaire institutionnel)** : `🛣️ CU-6c-1` Réception rapport semestriel audit-grade

**Persona 7 (Annonceur national)** : `🛣️ CU-7-1` Upload vidéo + sélection multi-clubs | `🛣️ CU-7-2` Tracking impressions live par club | `🛣️ CU-7-3` Reporting PDF mensuel campagne

**Persona 8 (Régie publicitaire)** : `🛣️ CU-8-1` Allocation inventaires multi-clubs | `🛣️ CU-8-2` Reporting cloisonné par contrat | `🛣️ CU-8-3` Gestion permissions multi-tenant régie/annonceur/club

**Persona 9 (Agence multi-clubs)** : `🟡 CU-9-1` SSO multi-clubs avec switcher contextuel | `🟡 CU-9-2` Templates partagés cross-clubs

**Persona 10 (Fédération)** : `🛣️ CU-10-1` Push partenariat ligue en cascade | `🛣️ CU-10-2` Reporting agrégé national | `🛣️ CU-10-3` Branding fédéral white-label

### § 3.4 — Gaps identifiés (TODO PM jour 1)

#### CUs à détailler en priorité

1. **CU-3a-1, CU-3a-2** — Président club (rapport stratégique trimestriel) : industrialiser le format → cible NEXT
2. **CU-1-x** — Super_admin : à étoffer si futur PM doit comprendre les opérations en profondeur
3. **CU-7-x, CU-8-x, CU-10-x** — Personae 🔮 anticipées : à valider terrain avant d'investir détail produit

#### Manques à challenger

- **CU "lecture du rapport ROI par un sponsor"** : implicite dans 6a/6b/6c. Pourrait mériter un CU dédié côté lecteur (vs côté générateur 3c-5).
- **CU "support utilisateur en autonomie"** : un président qui appelle sans pouvoir consulter de FAQ produit. Manque-t-il un CU "self-service support" ?
- **CU "facturation / paiement Neopro"** : qui signe le devis, qui valide la CB, comment un nouveau site SaaS s'active automatiquement ? Pas couvert.
- **CU "changement d'adresse / migration de site"** : un club qui change de gymnase. Edge case fréquent en saison.

#### GAPs émergeant des journeys (§4)

- **CU "preview matchday avec sponsors mappés"** (Journey 1) — coordination 3b ↔ 3c repose sur la confiance, manque une vue partagée
- **CU "CRM léger prospects sponsors"** (Journey 2) — 3c suit ses prospects sur Excel, pas de mesure de transformation
- **CU "enquête NPS sponsor trimestrielle"** (Journey 3) — impossible de détecter les insatisfactions latentes avant non-renouvellement

---

## § 4 — Journey maps émotionnels

> Là où §2 raconte _ce qui se passe_ et §3 catalogue _ce qui est fait_, **§4 capture _ce qui est ressenti_** dans le temps. Chaque journey suit le format agence UX classique : action / pensée / émotion / pain point / magic moment, avec courbe émotionnelle de 1 (😡 frustration extrême) à 5 (😀 joie extrême).

### § 4.1 — Journey 1 : Matchday du Resp communication NLF

**Persona principale** : 3b | **Personas secondaires** : 4, 3a, 3c | **Trigger** : match samedi 20h | **Durée** : 66h (vendredi 18h → lundi 12h)

| Phase                       | Action 3b                                                                     | Émotion  | Touchpoint           | Note                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| Vendredi 18h (J-2)          | Clone scénario semaine dernière, actualise 12 noms joueuses + sponsors actifs | 🙂 4     | Studio Remotion      | ✨ Magic : 45 min total au lieu de 4h sur Canva (CU-3b-1)                                           |
| Vendredi 19h30              | Vérifie rotation pondérée Decathlon mi-temps configurée par 3c                | 😐 3     | Dashboard sponsors   | ⚠️ Pain résiduel : pas de "preview matchday avec sponsors mappés" (GAP)                             |
| Samedi 14h (brief bénévole) | Envoie lien Remote pré-config au lycéen volontaire, brief 5 min               | 🙂 4     | Remote (lien envoyé) | ✨ Magic : bénévole peut suivre le match, plus de freeze écran 10 min (CU-4-1, CU-4-2)              |
| Samedi 19h45 (pré-match)    | Déploie scénario, monte en tribune avec tablette                              | 😀 4     | Studio + Remote      |                                                                                                     |
| **Samedi 20h-22h (match)**  | Déclenche célébrations sur les buts depuis la tribune                         | **😀 5** | Remote en tribune    | ✨ MAGIC : "Léa Martinez • 47" affiché 2 sec après le but, 600 personnes vibrent ensemble (CU-3b-2) |
| Samedi 22h05 (fin match)    | Arrête scénario matchday                                                      | 🙂 4     | Studio               | "Ce serait dingue si Neopro pouvait me sortir le clip auto"                                         |
| **Dimanche 11h-13h**        | Monte highlights pour Insta/TikTok manuellement                               | **😟 2** | Hors Neopro          | ⚠️ PAIN CRITIQUE : pic de douleur résiduel, sacrifie son dimanche (CU-3b-4 LATER)                   |
| Dimanche 14h                | Poste highlights sur Insta + TikTok                                           | 😐 3     | Réseaux sociaux      | Engagement moyen (timing dimanche après-midi)                                                       |
| Lundi 9h (récap)            | Vérifie impressions match dans dashboard sponsors                             | 🙂 4     | Dashboard sponsors   | ✨ Magic : 30 sec pour confirmer Decathlon a tourné 6×, vs 2h auparavant                            |

**Métriques de succès (statut actuel)** :

| Métrique                                | Cible | Statut                                   |
| --------------------------------------- | ----- | ---------------------------------------- |
| Temps préparation J-2                   | < 1h  | 🟢 ~45 min                               |
| Pics de stress 😡 (1) en cours de match | 0     | 🟢 0 NLF                                 |
| Magic moments 😀 (5) capturés           | ≥ 1   | 🟢 célébration but                       |
| Délai post Insta vs fin de match        | < 2h  | 🛣️ ~16h aujourd'hui (LATER avec CU-3b-4) |
| Bénévole opérationnel sans formation    | 100%  | 🟢 confirmé NLF                          |

### § 4.2 — Journey 2 : Prospection d'un nouveau sponsor par le Resp partenaires

**Persona principale** : 3c | **Personas secondaires** : 6b (cabinet expertise comptable 25 salariés), 3a | **Trigger** : appel entrant | **Durée** : 3 semaines (appel → signature)

| Phase                                    | Action 3c                                                                                       | Émotion  | Touchpoint                            | Note                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Semaine 1 — appel entrant                | Prend l'appel, propose RDV au club                                                              | 🙂 4     | Téléphone (hors Neopro)               | "Si je signe, c'est 8K€/an minimum"                                                                                                  |
| Semaine 1 (J+2) — préparation            | Génère export PDF anonymisé "ma régie aujourd'hui" (8 sponsors actifs, 12 800 impressions/mois) | 😀 5     | Dashboard sponsors                    | ✨ Magic : 2 min vs PowerPoint de 2023 (CU-3c-1)                                                                                     |
| **Semaine 1 (J+5) — RDV physique**       | Présente 30 min, ouvre Neopro live + démo Studio "Cabinet X partenaire NLF" générée à la volée  | **😀 5** | Dashboard live + Studio               | ✨ MAGIC côté 6b : voit ce que ça donnerait sur l'écran du gymnase (CU-3c-1, CU-3c-3)                                                |
| Semaine 2 — négo packs                   | Envoie 4 propositions (bronze 3K / argent 5K / or 8K / platine 12K) avec breakdown impressions  | 🙂 4     | Dashboard rotation pondérée           | Le dashboard prouve que platine = 4× impressions premium → prix justifié sans débat (CU-3c-3)                                        |
| Semaine 3 — signature pack OR            | Sponsor signe à 8K€/an, transmet logo HD                                                        | 😀 5     | Administratif (hors Neopro)           | "Avant Neopro je l'aurais vendu 3K€ par défaut" (+5K€ par contrat)                                                                   |
| **Semaine 3 (J+3) — onboarding express** | Crée sponsor dans dashboard, intègre logo + vidéo, génère accès portail sponsor                 | **😀 5** | Dashboard sponsors + Studio + portail | ✨ MAGIC : signature mardi → 1er rapport reçu dimanche soir (4 jours), 6b appelle "on va vous présenter à 3 PME du Rotary" (CU-3c-4) |

**Métriques de succès** :

| Métrique                                           | Cible        | Statut               |
| -------------------------------------------------- | ------------ | -------------------- |
| Ticket moyen sponsor                               | 8K€ vs 3K€   | 🟡 anecdotique 1 cas |
| Délai signature (premier contact → contrat)        | < 4 semaines | 🟢 3 semaines        |
| Délai onboarding (signature → 1er rapport)         | < 1 semaine  | 🟢 4 jours           |
| Taux transformation prospects RDV → signature      | > 50%        | ❌ pas de CRM (GAP)  |
| Recommandations entrantes par sponsor satisfait/an | ≥ 1          | 🟡 anecdotique       |

### § 4.3 — Journey 3 : Mois 1 d'une PME régionale qui devient sponsor

**Persona principale** : 6b (DM cabinet expertise comptable, 25 salariés, 8K€/an) | **Personas secondaires** : 3c, DAF interne | **Trigger** : signature en septembre | **Durée** : 45 jours (signature → 1er reporting consolidé)

| Phase                            | Action 6b                                                                        | Émotion  | Touchpoint                    | Note                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| J-30 → J0 (pré-saison)           | Signe le contrat, attend 1er match                                               | 😐 3     | (mail)                        | "Mon DAF m'a dit 'tu m'expliques ce que ça donne dans 6 mois'"                                          |
| **J0 (samedi 14 sept, 22h45)**   | Reçoit mail "votre logo est passé pour la 1ère fois ce soir au match NLF vs CSM" | **😀 4** | Mail auto Neopro post-match   | ✨ MAGIC : photo logo écran + "affiché 14 fois pendant 2h12 cumulées" — pas un mail générique (CU-3c-5) |
| **J+30 (1er octobre)**           | Reçoit rapport mensuel auto sur portail sponsor (4 matches, 56 800 impressions)  | **😀 5** | Portail sponsor V1            | ✨ MAGIC : annexable directement au rapport DAF du 5 octobre, zéro question (CU-6b-1, CU-6b-2)          |
| J+45 (mi-octobre, déjeuner pair) | Parle à un DG d'une PME tech locale, montre son portail sponsor sur mobile       | 😀 5     | Portail sponsor (démo mobile) | ✨ MAGIC côté 3c : appel mardi suivant "on me parle de votre portail" — recommandation organique        |

**Métriques de succès** :

| Métrique                                            | Cible | Statut                               |
| --------------------------------------------------- | ----- | ------------------------------------ |
| Délai 1er rapport reçu post-match                   | < 24h | 🔮 selon livraison Sponsor Portal V1 |
| Taux d'ouverture mail mensuel auto                  | > 70% | 🔮 à mesurer post-livraison          |
| Taux d'export PDF mensuel                           | > 50% | 🔮 à mesurer post-livraison          |
| Recommandations entrantes par sponsor PME / 12 mois | ≥ 1   | 🟡 anecdotique                       |
| NPS sponsor à 6 mois                                | > 50  | ❌ enquête NPS pas instaurée (GAP)   |

### § 4.4 — Synthèse pour le PM jour 1

**Pics de douleur résiduels (à arbitrer en priorité)** :

| Journey | Pain point                                     | CU lié           | Statut   | Reco PM                                                       |
| ------- | ---------------------------------------------- | ---------------- | -------- | ------------------------------------------------------------- |
| 1       | Highlights RS dimanche midi à la main          | CU-3b-4          | 🛣️ LATER | Reprioriser NEXT ? Forte valeur perçue, déjà cité par 2 clubs |
| 1       | Pas de "preview matchday avec sponsors mappés" | (manque CU)      | ❌ GAP   | Créer un CU "vue partagée 3b ↔ 3c"                            |
| 2       | Pas de CRM léger intégré pour suivre prospects | (manque CU)      | ❌ GAP   | Décision : CU dédié ou intégration Hubspot ?                  |
| 3       | Sponsor Portal V1 pas encore livré             | CU-3c-5, CU-6b-1 | 🔮 NEXT  | Confirmer M2-3 livraison                                      |
| 3       | Pas de NPS sponsor instauré                    | (manque CU)      | ❌ GAP   | Créer un CU "enquête NPS sponsor trimestrielle"               |

**Magic moments à protéger (ne jamais casser)** :

| Journey | Magic moment                                               | CU               |
| ------- | ---------------------------------------------------------- | ---------------- |
| 1       | Préparation matchday en 45 min vs 4h                       | CU-3b-1          |
| 1       | Bénévole opérationnel sans formation                       | CU-4-1, CU-4-2   |
| 1       | Célébration but live en tribune                            | CU-3b-2          |
| 2       | Démo Studio "animation prospect" générée à la volée en RDV | CU-3c-1, CU-3c-3 |
| 2       | Onboarding sponsor 4 jours signature → 1er rapport         | CU-3c-4          |
| 3       | Mail auto post-match 22h45 avec photo logo                 | CU-3c-5          |
| 3       | Export PDF mensuel formaté DAF                             | CU-6b-2          |

**Recommandations PM jour 1** :

1. **Vivre un Journey 1 en présentiel** : aller à un match NLF samedi 20h, observer le resp com en tribune avec sa Remote — meilleure façon de comprendre la magic moment "célébration but"
2. **Interviewer 6b en priorité** : un sponsor PME à 8K€/an = unité économique qui justifie tout l'investissement Sponsor Portal. Le Journey 3 est le plus hypothétique aujourd'hui, confirmation terrain critique
3. **Identifier les GAP comme premiers candidats au backlog** : 3 CUs manquants émergent des journeys (preview matchday partagé, CRM léger, NPS sponsor) — non visibles dans personas/CUs seuls

---

## § 5 — Couverture personae × scénarios

| Persona                 | S1 Matchday      | S2 Onboarding | S3 Sponsoring          | S4 Incident   | S5 Gala   | S6 Annonceur |
| ----------------------- | ---------------- | ------------- | ---------------------- | ------------- | --------- | ------------ |
| 1 Super_admin           | ✅               | ✅            | —                      | ✅            | —         | ✅           |
| 2 Admin Support         | —                | ✅            | —                      | ✅            | —         | —            |
| 3a Président            | ✅               | ✅            | ✅                     | ✅            | (délègue) | —            |
| 3b Resp com             | ✅               | ✅            | —                      | —             | ✅        | ✅           |
| 3c Resp partenaires     | ✅               | —             | ✅                     | —             | ✅        | —            |
| 4 Opérateur matchday    | ✅               | —             | —                      | ✅            | —         | (passif)     |
| 5 Spectateur            | (🔮)             | —             | —                      | —             | —         | —            |
| 6 Partenaire (niv. 1-4) | niv. 2 ✅        | —             | ✅ (niv. 1-4 variants) | —             | —         | —            |
| 7 Annonceur réseau      | —                | —             | —                      | —             | —         | ✅           |
| 8 Agence                | (futur scénario) | —             | —                      | —             | —         | —            |
| 9 Fédération            | (futur scénario) | —             | —                      | —             | —         | (futur)      |
| 10 Installateur         | —                | ✅ (J+3)      | —                      | ✅ (escalade) | —         | —            |

**Lecture** :

- Tous les personae 🟢 actifs en prod sont couverts par ≥1 scénario
- Personae 🔮 (5 spectateur, 7 annonceur, 9 fédération) ont un scénario partiel — à compléter quand un client réel valide l'usage
- Persona 6 remplace les anciens 6a/6b/6c — S3 couvre le spectre niveaux 1→4 en variants
- Persona 10 (Installateur) apparaît en S2 (J+3 installation) et S4 (escalade incident)

---

## § 6 — Cycle de vie de ce doc

| Évènement                   | Action                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Nouveau persona ajouté      | Vérifier qu'il est cité dans ≥1 scénario (§2), créer ≥1 CU (§3), envisager un journey (§4) si ressenti complexe             |
| Persona promue 🔮 → 🟡 → 🟢 | Mettre à jour la matrice §5 + détailler ses CUs en §3 (sortir du stub) + envisager un scénario dédié                        |
| Nouveau CU ajouté           | Attribuer un ID `CU-<persona>-<num+1>` stable, mettre à jour les 3 index §3, x-référencer dans `PERSONAE.md`                |
| CU obsolète                 | Marquer 🗄️ ARCHIVÉ avec date et raison, ne jamais supprimer l'ID                                                            |
| CU change de statut         | Mettre à jour l'emoji (🔮 → 🟢 quand livré) + l'index par statut §3                                                         |
| Pain point résiduel résolu  | Mettre à jour le journey concerné §4, déplacer vers les "magic moments à protéger"                                          |
| Nouvelle SPEC livrée        | Vérifier qu'elle est référencée dans ≥1 scénario §2 ET adresse ≥1 CU §3 (sinon, soit elle est trop fine soit le doc manque) |
| Incident production         | Si nouveau type, ajouter un cas d'edge au scénario §2 concerné + lien post-mortem                                           |
| Revue planifiée             | Tous les 6 mois, en parallèle de la revue PERSONAE.md — vérifier que les journeys §4 matchent toujours la réalité terrain   |

## § 7 — Ce qui n'est PAS dans le scope

- ❌ User stories format SAFe → [docs/safe/USER-STORIES.md](../safe/USER-STORIES.md)
- ❌ Règles techniques détaillées par composant → [docs/specs/](../specs/)
- ❌ Mockups, wireframes interactifs → reportés post-embauche PM (les journey maps §4 capturent l'essentiel pour l'instant)
- ❌ Service Blueprints (backstage tech complet) → couvert ad-hoc dans `docs/specs/` et ADR
- ❌ Stratégie commerciale / pricing → [docs/strategy/](../strategy/), [docs/business/](../business/)

## § 8 — Évolutions possibles

- [ ] Ajouter un scénario "Gestion multi-clubs par une agence régionale" (persona 8)
- [ ] Ajouter un scénario "Partenariat ligue : Lidl × 28 clubs LNH" (persona 9)
- [ ] Ajouter un scénario "Installation + incident : technicien terrain → remote shell" (persona 10)
- [ ] Ajouter un scénario "Soirée VIP avec mini-app spectateur interactif" (persona 5 — quand QR code livré)
- [ ] Détailler les CUs des personas 1, 2, 4, 5, 7-10 (aujourd'hui en stubs §3.3) — priorité à arbitrer avec PM
- [ ] Convertir les 3 GAPs identifiés (§3.4 + §4.4) en CUs catalogués (preview matchday partagé, CRM léger sponsors, NPS sponsor)
- [ ] Ajouter un journey "Mois 1 d'un nouveau club onboardé" (parallèle au scénario §2.2 mais avec courbe émotionnelle)
- [ ] Mesurer empiriquement le ratio "scénarios / journeys / CUs cités en démo prospect" pour valider l'utilité du doc
- [ ] Service Blueprints des CUs critiques (CU-3b-2 animation live + CU-3c-5 reporting auto) si le PM en ressent le besoin
