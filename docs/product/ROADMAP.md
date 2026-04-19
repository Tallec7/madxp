# Neopro — Roadmap Produit

> ADRs et PROPs validés ou proposés, **non encore implémentés**.
> Exclut : les ADRs acceptés et entièrement codés. Inclut : les décisions architecturales en attente de code et les propositions ouvertes.
>
> **Dernière mise à jour** : 18 Avril 2026

---

## Légende

| Symbole | Signification                                   |
| ------- | ----------------------------------------------- |
| 🔴      | Deal-breaker commercial — bloque des signatures |
| 🟡      | Upsell / revenu additionnel direct              |
| 🟢      | Qualité produit / dette technique               |
| 🕐      | Sunset planifié (date fixée)                    |

---

## PI-2 — En cours (Q2 2026)

### 🔴 Score Live — Lecture automatique tables de marque

**ADR-049 · PROP-003** · Rattachement SAFe : F-15.2, F-21.2 (PI-3)

**Problème** : plusieurs prospects refusent la double saisie (table de marque + opérateur Neopro). Deal-breaker commercial identifié en prod.

**Architecture décidée (ADR-049 — Proposé, non codé)** :

- Pattern plugin `ScoreboardConnector` avec interface commune
- Contrat `ScoreboardData v1` — 5 niveaux d'enrichissement (L1 score live → L5 métadonnées techniques)
- Table DB `scoreboard_events` — audit trail complet, fondation de F-21.2 (API publique PI-3)
- Connecteurs prioritaires : **Stramatel** (RS-485 binaire, 19 200 bps) + **Bodet** (Scorepad TCP port 4001 + BT6000 série)
- Fallback OCR Tesseract pour tables sans sortie données
- Upsell abonnement **+15 €/mois/site**, kit hardware facturé coût+marge

**Trois topologies d'installation standardisées** :

| Topologie                   | Scénario                              | Connectivité                  |
| --------------------------- | ------------------------------------- | ----------------------------- |
| **A1** — Pi + S2E PoE LAN   | Club pro avec régie câblée            | Ethernet club                 |
| **A3** — Pi + S2E WiFi      | Club avec WiFi couvrant gymnase       | WiFi club via `wlan1`         |
| **B** — Scorebox Pi Zero AP | Gymnase offline total (80% des clubs) | Mini-AP local `scorebox-XXXX` |

**Produit matériel** : **Neopro Scorebox** (Pi Zero 2 W + HAT RS-485 SN65HVD72) — 3 modes configurables : `cloud-push`, `local-ap`, `lan-bridge`.

**Effort estimé** : 15-20 j dev + sourcing hardware
**Référence** : [ADR-049](../adr/ADR-049-score-live-multi-vendor-architecture.md) · [PROP-003](../proposals/PROP-003-score-live-multi-vendor.md)

---

### 🕐 Sunset Remote Legacy — Retrait UI v1

**ADR-061** · Date sunset : **1er novembre 2026**

**Décidé et planifié** — toggle `U22` + métriques déjà en place. Il reste à :

- Retirer le bundle legacy du code (suppression composant + routes)
- Afficher l'écran de transition "migration forcée" après `2026-11-01`
- Vérifier alerte Prometheus `RemoteLegacyAdoptionLow` (v2 < 70% sur 7j) avant le cut

**Référence** : [ADR-061](../adr/ADR-061-remote-legacy-coexistence-sunset.md)

---

## PI-2 / PI-3 — Décisions ouvertes (PROP)

Ces propositions ont un statut `Proposé` — la décision architecture n'est pas encore figée en ADR.

---

### 🟡 PROP-005 — Planification horaire : Pi local vs Serveur cloud

**PROP-005** · Rattachement SAFe : E-07

**Problème** : le club veut programmer le démarrage automatique d'une playlist (ex : spots sponsors à 14h les samedi). Aujourd'hui, tout est manuel.

**Options ouvertes** :

- **Option A** — Cron local Pi : playlist déclenchée par cron systemd, zéro dépendance réseau. Fiable offline, mais pas pilotable depuis le dashboard.
- **Option B** — Scheduling cloud : le central-server pousse un `scheduled_play` event via Socket.IO à l'heure prévue. Pilotable dashboard, mais nécessite connexion réseau au moment J.
- **Option C** — Hybride : cloud pour la définition, Pi pour l'exécution (sync à la connexion, fallback cron local).

**Décision à prendre** : option B ou C. Option A seule = trop limitée dashboard.
**Référence** : [PROP-005](../proposals/PROP-005-scheduling-local-vs-server.md)

---

### 🟡 PROP-006 — Portail Sponsor Self-Service

**PROP-006** · Rattachement SAFe : E-01, E-02

**Problème** : un annonceur régional ne peut pas aujourd'hui acheter un placement, uploader sa vidéo, et voir ses statistiques sans passer par l'opérateur Neopro. Frein à la scalabilité commerciale.

**Options ouvertes** :

- **Option A** — Extension du dashboard central : nouveau rôle `advertiser` avec vues filtrées. Moins cher, moins sexy.
- **Option B** — Portail dédié (sous-domaine `sponsors.neopro.fr`) : onboarding autonome, intégration Stripe, rapports PDF auto.

**Décision à prendre** : Option B recommandée (marketplace two-sided), mais effort 20-30 j dev.
**Référence** : [PROP-006](../proposals/PROP-006-sponsor-self-service-portal.md)

---

### 🟡 PROP-007 — Algorithme de Rotation Équitable des Sponsors

**PROP-007** · Rattachement SAFe : E-02, E-03

**Problème** : la rotation actuelle des spots n'est pas garantie équitable (un sponsor peut être sur-diffusé ou sous-diffusé selon l'ordre de playlist).

**Options ouvertes** :

- **Round-robin strict** : chaque sponsor diffusé à tour de rôle. Simple, prévisible.
- **Weighted rotation** : pondération par budget (sponsor Premium 2× plus diffusé). Aligné sur la valeur business.
- **Time-slot based** : garanties de plages horaires (ex : 3 spots par heure garantis). Contractualisation plus forte.

**Décision à prendre** : weighted rotation recommandée — aligne technique et tarification.
**Référence** : [PROP-007](../proposals/PROP-007-sponsor-rotation-algorithm.md)

---

### 🟢 PROP-008 — Expiration Automatique de Contenu

**PROP-008** · Rattachement SAFe : E-04, E-07

**Problème** : une vidéo sponsor avec une date de fin de contrat continue de tourner après expiration si personne ne l'enlève manuellement.

**Options ouvertes** :

- **Pi-local** : le sync-agent vérifie `expires_at` toutes les heures, supprime le fichier et met à jour `configuration.json`. Fonctionne offline.
- **Server-side** : le central-server envoie un event `content_expired` via Socket.IO. Dépend de la connexion.

**Décision à prendre** : hybride — Pi supprime localement, server confirme et loggue.
**Référence** : [PROP-008](../proposals/PROP-008-content-expiration.md)

---

### 🟡 PROP-009 — Motion Design Personnalisé (Vidéos dynamiques joueurs)

**PROP-009** · Rattachement SAFe : E-05

**Problème** : les clubs veulent des vidéos "fiche joueur" ou "annonce composition" générées automatiquement avec les données de la DB (nom, photo, numéro, stats). Aujourd'hui tout est statique.

**Options ouvertes** :

- **Lottie** : animations JSON légères, rendu côté client Angular/Pi. Limité aux animations 2D, pas de composition vidéo.
- **Remotion (ADR-052/054/055 déjà accepté)** : rendu server-side, pipeline async, templates React. Extension naturelle de l'existant.
- **Plainly SaaS** : outil tiers no-code, exporte des vidéos MP4. Dépendance externe, coût par rendu.

**Décision à prendre** : Remotion recommandé (déjà intégré ADR-052) — créer des templates "fiche joueur" et "composition d'équipe".
**Référence** : [PROP-009](../proposals/PROP-009-motion-design-personnalise.md)

---

## PI-3 — Horizon long terme (Q3/Q4 2026)

---

### 🟡 PROP-001 — Multi-TV (Plusieurs écrans depuis un seul Pi)

**PROP-001** · Rattachement SAFe : E-12

**Problème** : certains clubs ont 2-3 TV dans l'enceinte (vestiaires, buvette, tribune). Aujourd'hui un Pi = un écran.

**Architecture proposée** :

- Mode hybride Pi + SaaS : le Pi pilote l'écran principal (HDMI), des onglets navigateur sur d'autres écrans reçoivent le signal via Socket.IO (mode SaaS-slave).
- Pas de matériel supplémentaire pour les écrans secondaires.
- Synchro contenu via event `broadcast_all` depuis la Remote.

**Pré-requis** : PROP-002 (dual-display) terminé ✅ — architecture extensible naturellement.
**Référence** : [PROP-001](../proposals/PROP-001-multi-tv-single-pi.md)

---

### 🟡 PROP-010 — Auto-génération de variantes vidéo par type d'écran

**PROP-010** · Rattachement SAFe : E-05, E-22

**Problème** : une vidéo en 16:9 TV ne s'affiche pas bien sur un écran LED en 32:9 ou en portrait. L'opérateur doit uploader une version par format.

**Architecture proposée** : pipeline FFmpeg server-side qui, à l'upload, génère automatiquement les variantes (16:9 crop/letterbox, 9:16 portrait, 32:9 ultra-wide). Le dashboard propose les variantes disponibles à la sélection selon le type d'écran détecté.

**Pré-requis** : ADR-069 (delivery strategy pattern) ✅ — la couche de sélection de contenu par type d'écran est prête.
**Référence** : [PROP-010](../proposals/PROP-010-auto-generation-video-variants.md)

---

### 🟡 PROP-011 — Multi-Zone LED (Contenus différenciés par côté de terrain)

**PROP-011** · Rattachement SAFe : E-22

**Problème** : les panneaux LED de bord de terrain ont souvent 2-4 zones indépendantes (côté A, côté B, fond de filet). Afficher la même vidéo partout = manque à gagner sponsor (possibilité de vendre des emplacements différenciés).

**Architecture proposée** : le Pi pilote plusieurs sorties HDMI (via capture cards), chaque zone = un processus de boucle vidéo indépendant. La Remote permet de cibler une zone spécifique lors du déclenchement.

**Dépendance** : ADR-029 (dual HDMI) ✅, ADR-031 (master-slave sync) ✅.
**Référence** : [PROP-011](../proposals/PROP-011-multi-zone-led.md)

---

### 🟢 PROP-012 — Catalogue des Modes de Livraison Vidéo

**PROP-012** · Rattachement SAFe : E-13

**Problème** : les clubs demandent parfois de diffuser sur Chromecast, Smart TV Samsung (Tizen), ou tablette vestiaires. Pas de réponse officielle aujourd'hui.

**Catalogue documenté** :

| Canal                     | Effort | Priorité |
| ------------------------- | ------ | -------- |
| Pi HDMI (en prod)         | —      | ✅ Done  |
| SaaS navigateur (en prod) | —      | ✅ Done  |
| Chromecast via Cast SDK   | 5 j    | PI-3     |
| Android TV / Fire TV      | 8 j    | PI-3     |
| Smart TV Tizen (Samsung)  | 12 j   | PI-3     |
| IPTV multicast LAN        | 10 j   | PI-3     |

**Décision à prendre** : prioriser Chromecast (volume) avant Android TV.
**Référence** : [PROP-012](../proposals/PROP-012-video-delivery-modes.md)

---

## Vision long terme — F-21.2 (PI-3)

### 🟡 API Publique Score Live — Neopro comme source of truth sport régional

**Rattachement SAFe** : F-21.2

Une fois ADR-049 implémenté sur 30+ clubs, Neopro sera la **seule entité capable de lire en temps réel les tables de marque de centaines de clubs régionaux français**. Le contrat `ScoreboardData v1` est conçu dès maintenant comme un schéma public versionné.

**Modèle envisagé** :

- API REST + WebSocket publique avec auth Bearer
- Plans tarifaires par niveau d'enrichissement (L1 gratuit, L2-L5 payant)
- Intégration médias locaux, applications fédérales, fantasy sport
- Effet réseau : plus de clubs équipés = plus de valeur de l'API = plus d'annonceurs

**Pré-requis** : F-15.2 (Score Live MVP) en production sur 10+ clubs.

---

## Résumé Priorisation

| Priorité | Item                         | Horizon       | Effort             | Bloquant commercial |
| -------- | ---------------------------- | ------------- | ------------------ | ------------------- |
| 1        | Score Live ADR-049/PROP-003  | PI-2 immédiat | 15-20 j            | 🔴 Oui              |
| 2        | Rotation équitable PROP-007  | PI-2          | 3-5 j              | Non                 |
| 3        | Expiration contenu PROP-008  | PI-2          | 2-3 j              | Non                 |
| 4        | Sunset remote legacy ADR-061 | 2026-11-01    | 1 j                | 🕐 Date fixée       |
| 5        | Scheduling PROP-005          | PI-2/PI-3     | 5-8 j              | Non                 |
| 6        | Motion design PROP-009       | PI-2/PI-3     | 8-12 j             | Non                 |
| 7        | Portail sponsor PROP-006     | PI-3          | 20-30 j            | Non                 |
| 8        | Auto-variantes PROP-010      | PI-3          | 8-10 j             | Non                 |
| 9        | Multi-TV PROP-001            | PI-3          | 10-15 j            | Non                 |
| 10       | Multi-zone LED PROP-011      | PI-3          | 12-15 j            | Non                 |
| 11       | Modes livraison PROP-012     | PI-3          | 5-35 j selon canal | Non                 |
| 12       | API publique F-21.2          | PI-3+         | 15-20 j            | Non                 |
