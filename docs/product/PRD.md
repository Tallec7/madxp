# PRD — Neopro Platform

> **Version** : 2.0 — Avril 2026
> **Sources** : [Business Plan](../business/BUSINESS_PLAN_COMPLET.md) · [Features](../safe/FEATURES.md) · [User Stories](../safe/USER-STORIES.md) · [Implemented Backlog](../safe/IMPLEMENTED-BACKLOG.md) · [NFR](./NFR.md)

---

## 1. Executive Summary

Neopro est le premier réseau publicitaire sportif amateur en France. La plateforme transforme les écrans TV des gymnases en médias interactifs : diffusion vidéo dynamique, scores en direct, rotation sponsors avec analytics de preuve. Le modèle est une two-sided marketplace — clubs abonnés (€50-120/mois) + annonceurs régionaux (€250/mois) — avec effet réseau vertueux. 3 clubs beta en production (CESSON, NARH, RACC), 98.5% uptime, 241 features livrées, pipeline 15 clubs qualifiés, TAM combiné €6,4M France.

---

## 2. Problème & Opportunité

### Pain points clubs sportifs

- **Expérience match médiocre** : écrans statiques, zéro engagement spectateur, contenus amateurs
- **Sponsors pas valorisés** : 0 rapports de diffusion → 30-40% churn annuel, perte €6K-9K/an pour un club N2 à 5 sponsors
- **Gestion technique pénible** : PC bord terrain, bénévoles débordés, changements manuels fastidieux

### Pain points sponsors/annonceurs

- Pas de preuve de diffusion mesurable → renouvellement difficile à défendre
- Aucun accès self-service : tout passe par l'équipe Neopro
- Rapport de diffusion manuel ou inexistant

### Marché adressable

| Segment        | TAM France                      | SAM 2026              | SAM 2028             |
| -------------- | ------------------------------- | --------------------- | -------------------- |
| Clubs sportifs | €5,2M (13 000 clubs × €400/an)  | €53K (35 clubs)       | €450K (300 clubs)    |
| Annonceurs     | €1,2M (150 annonceurs × €8K/an) | €16K (6-8 annonceurs) | €80K (25 annonceurs) |
| **Total**      | **€6,4M**                       | **€69K ARR**          | **€530K ARR**        |

---

## 3. Vision Produit

**We help** les clubs sportifs amateurs **to** professionnaliser leur expérience match et valoriser leurs partenaires **by** leur fournissant une plateforme TV interactive clé-en-main couplée à un réseau publicitaire sportif avec analytics automatiques.

### North Star Metric (unique)

**Minutes de contenu pertinent diffusées par mois sur l'ensemble de la flotte.**

Ce KPI capture simultanément : adoption clubs (Pi actifs), santé technique (uptime), valeur annonceurs (spots vus), et usage réel (matchs joués). Une baisse de la NSM déclenche une investigation cross-domaine.

---

## 4. Personas

### Club Admin / Responsable partenariats

Gérant les contrats sponsors du club. Veut prouver la valeur aux partenaires pour renouveler sans négociation difficile. Apprécie les rapports PDF automatiques et le portail self-service. Douleur principale : risque de perdre un sponsor faute de données.

### Staff / Bénévole club (day of match)

Utilise la télécommande smartphone pendant le match. Pas de compte dashboard — accès local via PIN sur le Pi. A besoin de simplicité maximale : saisir un score, déclencher une vidéo, gérer les phases avant/pendant/après. Tolérance zéro pour la complexité.

### Operator Neopro

Gère la flotte de 50+ Pi depuis le dashboard central. Déploie les contenus, monitore la santé, traite les alertes, configure les profils de sites. Bloqué actuellement par l'onboarding SSH manuel (2-3 jours/club).

### Sponsor / Annonceur régional

Marque locale (Decathlon, Crédit Mutuel) ou PME. Cherche audience sportive captive locale. Veut acheter de la visibilité en quelques clics, suivre les impressions en temps réel, recevoir un rapport mensuel automatique.

### Super Admin

Accès total : gestion utilisateurs, facturation, abonnements, métriques pitch-deck pour investisseurs. Supervise la santé globale de la plateforme.

---

## 5. Scope v1 — Produit livré en production

> 241 features livrées — référence exhaustive : [IMPLEMENTED-BACKLOG.md](../safe/IMPLEMENTED-BACKLOG.md)

| Domaine               | Capacités livrées                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth & Sécurité**   | JWT HttpOnly + Bearer, MFA TOTP, RLS PostgreSQL multi-tenant, audit GDPR, PIN distant par profil + brute-force detection (ADR-058)                                                              |
| **Contenu & Vidéo**   | Upload + compression + checksum SHA-256, image→MP4 ffmpeg, miniatures auto, variantes TV/secondaire (`video_variants`), stockage FTP Hostinger unifié, proxy streaming signé JWT SaaS (ADR-068) |
| **Score & Overlays**  | Overlay V2 multi-sport (6 sports, 9 positions), chronomètre, popup but, bandeau défilant, presets réutilisables                                                                                 |
| **Déploiement & OTA** | Déploiement multi-sites, canary progressif (10→100%), file hors-ligne, planification à date, rollback automatique                                                                               |
| **Monétisation**      | Abonnements 3 tiers (Essentiel/Autonomie/Premium), portail annonceur magic link, portail agence, proof of play SHA-256, rotation Bresenham pondérée                                             |
| **Analytics**         | Analytics club + sponsors (Chart.js, 6 KPIs), PDF 6 pages + CSV + Excel, rapports mensuels auto, métriques Prometheus/Grafana                                                                   |
| **Pi Edge**           | Double-buffer vidéo, profils avant/pendant/après match, watchdog dual-HDMI (Pi 5), admin local, QR code télécommande, Remote V2 PWA + hotspot (ADR-060/062)                                     |
| **Résilience**        | Sync agent bidirectionnel, offline queue, network watchdog 6 phases, clé WiFi USB, écriture atomique config                                                                                     |
| **Monitoring**        | Alertes prédictives (9 règles), Slack, webhook, escalade superviseur, Logtail/Better Stack                                                                                                      |
| **Multi-tenant**      | Modes Pi / SaaS (ADR-037) / Demo, rôles super_admin > admin > operator > advertiser > agency > club                                                                                             |

---

## 6. Scope v2 — Roadmap PI-1 / PI-2

> Référence complète : [FEATURES.md](../safe/FEATURES.md)

### PI-1 — Fév-Mars 2026 (56 SP)

| Epic                   | Feature                                                               | Statut  |
| ---------------------- | --------------------------------------------------------------------- | ------- |
| E-01 Portail Sponsor   | Self-signup email+password (magic link en prod, self-service à finir) | Partiel |
| E-02 Rotation Sponsors | Minimum garanti passages/match, compteur temps réel                   | Partiel |
| E-06 Onboarding        | Auto-provisioning Pi via QR code + wizard 4 étapes (<30 min sans SSH) | Backlog |

### PI-2 — Avr-Mai 2026 (300 SP)

| Epic                    | Feature clé                                                                       |
| ----------------------- | --------------------------------------------------------------------------------- |
| E-15 Score Live Phase 2 | Lecture directe table de marque Stramatel/Bodet (RS-485) — scoreboard sans saisie |
| E-22 Dual Display       | Contenus différenciés TV + écran secondaire (Pi 5 dual HDMI)                      |
| E-23 Résilience HDMI    | Détection hotplug, boot sans écran, failover dual, accès navigateur PC            |
| E-11 Régie Régionale    | Portail annonceur + paiement Stripe + reporting consolidé                         |
| E-05 Motion Design      | Templates animations personnalisables (couleurs club, logo)                       |
| E-16 Rapports Email     | Envoi automatique mensuel PDF opt-in                                              |
| E-17 A/B Testing        | Tests statistiques créas sponsors (chi-carré)                                     |

### PI-3 — Juin-Juil 2026 (94 SP)

Multi-écrans synchronisés (E-12), marque blanche club (E-13), API publique scores live (E-21), analytics ML (E-20).

---

## 7. Top 15 Exigences fonctionnelles

| FR-ID | Description                                                                          | Priorité | Statut         |
| ----- | ------------------------------------------------------------------------------------ | -------- | -------------- |
| FR-01 | Diffusion vidéo en boucle sur TV club avec rotation sponsors pondérée Bresenham      | Must     | Production     |
| FR-02 | Télécommande smartphone (score, phases, vidéo) protégée par PIN profil               | Must     | Production     |
| FR-03 | Overlay score en direct (6 sports, 9 positions, chronomètre, popup but)              | Must     | Production     |
| FR-04 | Déploiement contenu cloud → Pi avec file hors-ligne et rollback automatique          | Must     | Production     |
| FR-05 | Analytics impressions sponsors (compteur, période, gymnase, export PDF/CSV/Excel)    | Must     | Production     |
| FR-06 | Proof of play : capture horodatée + certificat SHA-256                               | Must     | Production     |
| FR-07 | Monitoring flotte Pi temps réel (santé, alertes prédictives 9 règles, Slack)         | Must     | Production     |
| FR-08 | Profils de configuration par phase de match (avant/pendant/après)                    | Must     | Production     |
| FR-09 | Multi-tenant isolé : RLS PostgreSQL + rôles super_admin/admin/operator/club/sponsor  | Must     | Production     |
| FR-10 | Mode SaaS (navigateur sans Pi) avec proxy streaming signé JWT (ADR-037/068)          | Must     | Production     |
| FR-11 | Portail annonceur self-signup email+password avec accès self-service                 | Must     | Partiel — PI-1 |
| FR-12 | Auto-provisioning Pi via QR code (onboarding < 30 min sans SSH)                      | Must     | PI-1           |
| FR-13 | Lecture directe table de marque Stramatel/Bodet — score automatique (ADR-049)        | Must     | PI-2           |
| FR-14 | Dual display HDMI natif (TV principale + écran secondaire Pi 5) avec variantes vidéo | Should   | Partiel — PI-2 |
| FR-15 | Régie publicitaire régionale avec paiement Stripe + rapport consolidé multi-gymnases | Should   | PI-2           |

---

## 8. Hypothèses & Contraintes

### Hypothèses

- Les clubs amateurs investiront €50-120/mois si la valeur sponsors est démontrée et mesurée
- Le seuil S1 de 15 clubs actifs est nécessaire avant de démarcher des annonceurs régionaux (CPM attractif)
- Aucune fédération amateur française (FFHB, FFVB, FFBB) n'expose d'API scores publique — F-15.1 mis en veille, remplacé par lecture directe table de marque (F-15.2)
- Les clubs beta (CESSON, NARH, RACC) valident le modèle avant scale commercial

### Contraintes

- **Infrastructure edge** : Raspberry Pi 4/5, WiFi gymnase instable → résilience offline non négociable
- **Opérateur humain limité** : au-delà de 15 clubs, l'onboarding SSH manuel n'est pas scalable
- **RGPD** : isolation données multi-tenant RLS PostgreSQL, audit trail toutes actions sensibles
- **Stack fixe** : Angular 20 (Pi + dashboard), Express/PostgreSQL 15 (Supabase), Socket.IO, Railway, Hostinger FTP
- **Budget bootstrap 2026** : 2 associés, pas de levier financier externe avant 35 clubs actifs

---

## 9. Critères de succès — KPIs 2026

| KPI                          | Cible fin 2026                     |
| ---------------------------- | ---------------------------------- |
| Clubs actifs                 | 35                                 |
| Annonceurs réseau            | 6-8                                |
| ARR total                    | €53K                               |
| MRR                          | €4 400                             |
| Reach spectateurs            | 15 000/mois                        |
| NSM (min diffusées/mois)     | > 10 000 min/mois (flotte entière) |
| Uptime plateforme            | >= 99% (vs 98.5% actuel)           |
| Lead time onboarding         | < 30 min (après E-06)              |
| Taux renouvellement sponsors | > 80% (vs ~60-70% sans preuves)    |
| Seuil réseau annonceurs      | S1 atteint à 15 clubs              |

---

## 10. Hors scope explicite

Les éléments suivants sont hors périmètre jusqu'à PI-3+ ou décision formelle :

- **API publique scores live (E-21)** — prérequis F-15.2 livré + clause CGU data licence validée
- **Fan engagement interactif** (votes, quiz spectateurs via QR code) — non planifié avant PI-3
- **DOOH programmatique** (connexion SSP/DSP) — requiert 100+ clubs, hors portée avant 2028
- **Intégration billetterie Weezevent** — PI-3 Could
- **Analytics ML / forecasting** (scikit-learn) — PI-3 Won't avant volume suffisant
- **API partenaires OAuth 2.0** — PI-3 Won't
- **White-label franchise** — post 2027
- **Capteurs présence hardware** — PI-3 Won't
- **SMS Twilio** pour alertes critiques — hors scope PI-1/PI-2
- **Heatmap Leaflet impressions** — supprimée (non pertinente < 10 clubs, décision 09/03/2026)
