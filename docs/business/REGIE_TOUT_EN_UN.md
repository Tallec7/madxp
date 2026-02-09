# Neopro — La Régie Tout-en-Un pour Clubs Sportifs

> **Le JCDecaux des gymnases** : régie technique match-day + régie publicitaire à deux niveaux dans un seul boîtier.

**Date** : Février 2026
**Statut** : Plan stratégique produit
**Auteur** : Équipe Neopro

---

## Vision

Neopro se positionne comme la **première régie tout-en-un** conçue pour le sport amateur :

- **Régie technique** : gérer l'expérience spectateur pendant les matchs (score, ambiance, animations)
- **Régie publicitaire à deux niveaux** : diffuser les annonceurs du réseau Neopro ET les partenaires locaux de chaque club

Là où les clubs pro disposent d'une cabine régie avec régisseurs, mélangeurs vidéo et budgets à 6 chiffres, Neopro offre l'essentiel dans un Raspberry Pi à 80€ contrôlé depuis un smartphone.

### Le modèle double régie publicitaire

C'est le coeur du modèle économique. Comme JCDecaux, Neopro gère **deux niveaux de publicité** sur le même écran :

```
┌──────────────────────────────────────────────────────────────┐
│                     ÉCRAN TV DU CLUB                         │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────────┐ │
│  │  ANNONCEURS NEOPRO     │  │  PARTENAIRES DU CLUB       │ │
│  │  (réseau national)     │  │  (sponsors locaux)         │ │
│  │                        │  │                            │ │
│  │  • Décathlon            │  │  • Boulangerie Martin      │ │
│  │  • Intersport           │  │  • Garage Dupont           │ │
│  │  • Nike                 │  │  • Pizzeria du coin        │ │
│  │                        │  │                            │ │
│  │  Vendus par NEOPRO     │  │  Vendus par LE CLUB        │ │
│  │  Diffusés sur 50+ clubs│  │  Diffusés sur 1 club       │ │
│  │  Neopro facture        │  │  Le club facture           │ │
│  └────────────────────────┘  └────────────────────────────┘ │
│                                                              │
│  Les deux coexistent dans la même boucle de sponsors         │
└──────────────────────────────────────────────────────────────┘
```

**Niveau 1 — Régie réseau Neopro** :

- Neopro commercialise des campagnes nationales/régionales auprès de marques (Décathlon, Intersport, fédérations...)
- Ces campagnes sont déployées sur tout ou partie du réseau (50+ clubs)
- Neopro gère la relation annonceur, la facturation, le reporting
- Le club reçoit une rémunération ou une réduction sur son abonnement
- Analogie : les pubs nationales sur les abribus JCDecaux

**Niveau 2 — Régie locale du club** :

- Le club vend ses propres espaces à ses partenaires locaux (commerçants, artisans, sponsors historiques)
- Le club gère la relation, fixe ses prix, fournit les preuves de diffusion via Neopro
- Neopro fournit les outils (dashboard annonceur, proof of play, rapports)
- Analogie : l'affichage local vendu par une mairie sur son mobilier urbain

**Coexistence sur le même écran** :

- La boucle de sponsors mélange les deux niveaux
- La rotation pondérée permet de garantir un % de diffusion à chaque niveau
- Exemple : 40% annonceurs réseau Neopro + 60% partenaires locaux du club

### Pourquoi "Le JCDecaux des gymnases" ?

| Aspect              | JCDecaux                                  | Neopro                                       |
| ------------------- | ----------------------------------------- | -------------------------------------------- |
| Réseau              | Abribus, aéroports, mobilier urbain       | Écrans TV dans 50+ clubs sportifs            |
| Infrastructure      | Mobilier urbain + écrans DOOH             | Raspberry Pi + TV du club                    |
| Pub réseau          | Campagnes nationales vendues par JCDecaux | Campagnes réseau vendues par Neopro          |
| Pub locale          | Affichage local vendu par la collectivité | Partenaires locaux vendus par le club        |
| Gestion parc        | Maintenance, monitoring à distance        | Dashboard central, alertes prédictives, OTA  |
| Reporting           | Preuves de diffusion, audience            | Impressions, proof of play, audience estimée |
| **Différenciateur** | —                                         | **Régie technique match-day intégrée**       |
| **Audience**        | Passants (quelques secondes d'attention)  | **Spectateurs captifs (2h de match)**        |

JCDecaux vend de l'affichage devant des passants. Neopro vend de l'affichage **+ l'animation du match** devant une **audience captive pendant 2h**. Un spectateur dans un gymnase est plus engagé qu'un piéton devant un abribus. C'est un inventaire publicitaire premium.

### Ce que ça change pour le business model

| Revenu          | Source                                  | Qui vend | Qui encaisse             |
| --------------- | --------------------------------------- | -------- | ------------------------ |
| Abonnement club | Forfait mensuel (standard/premium)      | Neopro   | Neopro                   |
| Pub réseau      | Campagnes marques nationales/régionales | Neopro   | Neopro (reverse au club) |
| Pub locale      | Partenaires du club                     | Le club  | Le club                  |

Le club a **deux incitations** à utiliser Neopro :

1. L'outil match-day (régie technique) — c'est ce qui le fait adopter
2. Les revenus pub (locaux + reverse réseau) — c'est ce qui le fait rester

---

## État actuel — Ce que Neopro fait déjà

### Fonctions de régie technique (match-day)

| Fonction                 | État            | Détail                                           |
| ------------------------ | --------------- | ------------------------------------------------ |
| Score en temps réel      | ✅ Opérationnel | Overlay configurable, 6+ sports                  |
| Phases de match          | ✅ Opérationnel | neutral/before/during/after avec boucles dédiées |
| Timer/chronomètre        | ✅ Opérationnel | Start/pause/reset, sync cloud remote             |
| Animations de but        | ✅ Opérationnel | Vidéos jingles déclenchées par la télécommande   |
| Breaking news            | ✅ Opérationnel | Texte défilant en temps réel                     |
| Télécommande mobile      | ✅ Opérationnel | Local (hotspot) + Cloud (internet)               |
| Boucles vidéo par phase  | ✅ Opérationnel | Playlists différentes selon le moment du match   |
| Double-buffer vidéo      | ✅ Opérationnel | Transitions sans flash, récupération erreurs GPU |
| Détection TV allumée     | ✅ Opérationnel | HDMI-CEC (tv_status: on/standby/disconnected)    |
| Contrôle volume          | ❌ Absent       | —                                                |
| Son/audio d'ambiance     | ❌ Absent       | —                                                |
| Timer multi-sport avancé | ⚠️ Basique      | Pas de périodes/prolongations automatiques       |
| Annonces enrichies       | ⚠️ Basique      | Breaking news texte uniquement                   |

### Fonctions de régie publicitaire

#### Infrastructure commune (réseau + local)

| Fonction                       | État            | Détail                                             |
| ------------------------------ | --------------- | -------------------------------------------------- |
| Diffusion sponsors (boucles)   | ✅ Opérationnel | Rotation séquentielle sur 50+ écrans               |
| Gestion parc d'écrans          | ✅ Opérationnel | Dashboard central, monitoring, alertes prédictives |
| Déploiement contenu à distance | ✅ Opérationnel | Upload cloud → Pi, orchestration                   |
| Tracking impressions           | ✅ Opérationnel | `advertiser_impressions`, `advertiser_daily_stats` |
| Comptes annonceurs/agences     | ✅ Opérationnel | Multi-tenant (advertiser, agency)                  |
| Association annonceur ↔ clubs  | ✅ Opérationnel | `advertiser_sites` (1 club ou N clubs)             |
| Estimation audience            | ✅ Partiel      | `audience_estimate` dans `club_sessions`           |
| Détection TV allumée           | ✅ Opérationnel | HDMI-CEC confirme la diffusion effective           |
| Rapport PDF club               | ✅ Opérationnel | `pdf-report.service.ts`                            |

#### Régie réseau Neopro (annonceurs multi-clubs)

| Fonction                       | État                      | Détail                                      |
| ------------------------------ | ------------------------- | ------------------------------------------- |
| Déploiement multi-sites        | ✅ Opérationnel           | 1 vidéo → N clubs en un clic                |
| Ciblage par sport/région       | ⚠️ Possible mais pas d'UI | Données `sports`, `location` existent en DB |
| Dashboard annonceur réseau     | ❌ Supprimé v3.0          | Backend existe, UI retirée                  |
| Rapport PDF annonceur réseau   | ❌ Absent                 | —                                           |
| Rotation pondérée (garantie %) | ❌ Absent                 | Séquentiel uniquement                       |
| Facturation annonceurs réseau  | ❌ Hors scope             | —                                           |

#### Régie locale du club (partenaires locaux)

| Fonction                           | État             | Détail                                    |
| ---------------------------------- | ---------------- | ----------------------------------------- |
| Upload vidéo partenaire            | ✅ Opérationnel  | Upload contextuel par site                |
| Gestion boucle locale              | ✅ Opérationnel  | Config par site via dashboard             |
| Proof of play pour sponsors        | ❌ Supprimé v3.0 | —                                         |
| Rapport PDF pour le sponsor local  | ❌ Absent        | —                                         |
| Page publique sponsor              | ❌ Absent        | —                                         |
| Planification horaire (dayparting) | ❌ Absent        | Existe pour watermarks, pas pour sponsors |
| Distinction visuelle réseau/local  | ❌ Absent        | Pas de tag "réseau" vs "local" dans l'UI  |

#### Ce qui existe en DB mais n'est pas exploité

La structure technique supporte déjà les deux niveaux :

```sql
-- Un annonceur réseau Neopro = associé à N sites
SELECT a.name, COUNT(ast.site_id) as nb_clubs
FROM advertisers a
JOIN advertiser_sites ast ON ast.advertiser_id = a.id
GROUP BY a.id
HAVING COUNT(ast.site_id) > 1;  -- Annonceurs multi-clubs = réseau

-- Un partenaire local = associé à 1 site
SELECT a.name, ast.site_id, s.club_name
FROM advertisers a
JOIN advertiser_sites ast ON ast.advertiser_id = a.id
JOIN sites s ON s.id = ast.site_id
GROUP BY a.id, ast.site_id, s.club_name
HAVING COUNT(ast.site_id) = 1;  -- Annonceurs mono-club = local
```

Il manque un champ `advertiser_type` ('network' | 'local') pour distinguer formellement les deux, mais en pratique le nombre de sites associés suffit à les différencier.

---

## Plan d'Exécution

### Phase 0 — Distinguer réseau et local (pré-requis)

> **Objectif** : Poser les bases techniques pour que les deux niveaux de régie coexistent proprement.
> **Effort** : 2-3 jours
> **Priorité** : FONDATION — tout le reste en dépend

#### 0.1 Champ `advertiser_type` sur la table `advertisers`

**Problème** : Aujourd'hui rien ne distingue un annonceur réseau Neopro d'un partenaire local du club. On ne peut pas filtrer, prioriser ni reporter différemment.

**Solution** : Ajout d'un champ `type` sur `advertisers`.

```sql
-- Migration
ALTER TABLE advertisers ADD COLUMN advertiser_type VARCHAR(20) DEFAULT 'local';
-- 'network' = annonceur du réseau Neopro (déployé sur plusieurs clubs)
-- 'local'   = partenaire local d'un club (géré par le club)

-- Les annonceurs déjà associés à plusieurs sites → network
UPDATE advertisers SET advertiser_type = 'network'
WHERE id IN (
  SELECT advertiser_id FROM advertiser_sites
  GROUP BY advertiser_id HAVING COUNT(site_id) > 3
);
```

**Impact UI** :

- Dashboard central : badge "Réseau" (bleu) ou "Local" (vert) sur chaque annonceur
- Filtres dans la liste annonceurs : "Tous / Réseau / Locaux"
- Site detail > Contenu : section séparée "Sponsors réseau" et "Partenaires du club"

**Fichiers à modifier** :

- `central-server/src/scripts/migrations/add-advertiser-type.sql` — Nouveau
- `central-server/src/types/index.ts` — `advertiser_type: 'network' | 'local'`
- `central-dashboard/.../sponsors-list.component.ts` — Badge + filtre

#### 0.2 Distinction dans la boucle de diffusion

**Problème** : La boucle mélange tous les sponsors sans distinction. Impossible de garantir un % au réseau Neopro.

**Solution** : Dans `configuration.json`, marquer l'origine de chaque sponsor.

```json
{
  "sponsors": [
    { "name": "Décathlon", "path": "videos/decathlon.mp4", "source": "network", "weight": 3 },
    { "name": "Boulangerie", "path": "videos/boulangerie.mp4", "source": "local", "weight": 1 }
  ]
}
```

Le champ `source` est informatif pour le moment. Il deviendra utile quand la rotation pondérée (Phase 2) sera implémentée, permettant de garantir par exemple "40% réseau minimum".

**Fichiers à modifier** :

- `central-server/src/controllers/sites.controller.ts` — Ajouter `source` lors du déploiement config
- `raspberry/sync-agent/src/utils/config-merge.js` — Préserver le champ `source`
- `central-dashboard/.../site-content-tab.component.ts` — Afficher l'origine (badge)

#### 0.3 Tracking séparé réseau/local

**Problème** : Les stats d'impressions ne distinguent pas les diffusions réseau des locales.

**Solution** : Le champ `advertiser_type` sur `advertisers` suffit. Les requêtes de reporting peuvent joindre pour filtrer.

```sql
-- Impressions réseau vs local pour un site
SELECT
  a.advertiser_type,
  COUNT(*) as impressions,
  COUNT(DISTINCT a.id) as nb_annonceurs
FROM advertiser_impressions ai
JOIN advertisers a ON a.id = ai.advertiser_id
WHERE ai.site_id = $1 AND ai.played_at >= $2
GROUP BY a.advertiser_type;
```

Pas de modification du tracking côté Pi — le Pi continue d'envoyer les impressions comme avant. La distinction se fait côté serveur au moment du reporting.

---

### Phase 1 — Crédibiliser la régie pub (Quick wins)

> **Objectif** : Donner aux clubs les outils pour VENDRE des espaces sponsors.
> **Effort** : 1-2 semaines
> **Priorité** : CRITIQUE — c'est ce qui génère du revenu pour les clubs

#### 1.1 Dashboard annonceur (nouveau)

**Problème** : L'UI analytics a été supprimée en v3.0 car les métriques étaient incohérentes. Les annonceurs n'ont aucune visibilité sur leurs campagnes.

**Solution** : Nouveau dashboard simple et fiable pour les utilisateurs `advertiser` et `agency`.

**Ce qui existe déjà** :

- Table `advertiser_impressions` — chaque passage de vidéo sponsor tracké
- Table `advertiser_daily_stats` — agrégation journalière pré-calculée
- Table `advertiser_sites` — association annonceur ↔ clubs
- Table `advertiser_videos` — vidéos par annonceur
- Rôles `advertiser` et `agency` avec auth et RLS
- Détection TV allumée via HDMI-CEC (`tv_status` sur `video_plays`)

**À développer** :

- Page `/advertiser/dashboard` (Angular standalone component)
- KPIs : total impressions ce mois, nombre de clubs, audience estimée
- Graphique : impressions par jour (30 derniers jours) via `advertiser_daily_stats`
- Liste des clubs avec impressions par club
- Liste des vidéos avec impressions par vidéo
- Filtre par période (mois, trimestre, année)

**Requête SQL de base** :

```sql
SELECT ads.date, ads.site_id, s.club_name, ads.impressions_count, ads.unique_videos_played
FROM advertiser_daily_stats ads
JOIN sites s ON s.id = ads.site_id
WHERE ads.advertiser_id = $1 AND ads.date >= $2
ORDER BY ads.date DESC;
```

**Fichiers à créer/modifier** :

- `central-dashboard/src/app/features/advertiser/advertiser-dashboard.component.ts` — Nouveau
- `central-dashboard/src/app/app.routes.ts` — Route `/advertiser/dashboard`
- `central-server/src/controllers/advertiser-analytics.controller.ts` — Endpoints existants à vérifier

#### 1.2 Rapport PDF annonceur

**Problème** : Un club qui vend un espace sponsor ne peut pas fournir de bilan au sponsor.

**Solution** : Rapport PDF mensuel par annonceur, similaire au rapport club existant.

**Ce qui existe déjà** :

- `pdf-report.service.ts` — Service de génération PDF avec PDFKit
- `advertiser_daily_stats` — Données agrégées par jour
- `club_sessions.audience_estimate` — Estimation audience par match

**À développer** :

- Méthode `generateAdvertiserReport(advertiserId, startDate, endDate)` dans `pdf-report.service.ts`
- Contenu : nom annonceur, période, KPIs (impressions, clubs, audience estimée), détail par club, détail par vidéo
- Endpoint `GET /api/reports/advertiser/:id?start=...&end=...` (PDF stream)
- Bouton "Télécharger le rapport" dans le dashboard annonceur

**Requête audience estimée** :

```sql
SELECT SUM(cs.audience_estimate) as total_audience
FROM club_sessions cs
JOIN advertiser_sites ast ON ast.site_id = cs.site_id
WHERE ast.advertiser_id = $1
AND cs.started_at >= $2 AND cs.started_at <= $3
AND cs.audience_estimate IS NOT NULL;
```

#### 1.3 Contrôle volume HDMI-CEC

**Problème** : Le son est géré par la TV, pas par Neopro. Un bénévole doit chercher la télécommande TV pour baisser le volume.

**Solution** : Boutons volume +/- dans la télécommande Neopro (locale et cloud).

**Ce qui existe déjà** :

- `cec-client` installé sur les Pi (utilisé pour `hdmi-status.service.ts`)
- Télécommande locale (`remote.component.ts`) et cloud (`cloud-remote.component.ts`)
- Serveur local (`server.js`) qui reçoit les commandes Socket.IO

**Commandes CEC volume** :

```bash
# Volume up (code 0x41)
echo "tx 50:44:41" | cec-client -s -d 1
# Volume down (code 0x42)
echo "tx 50:44:42" | cec-client -s -d 1
# Mute toggle (code 0x43)
echo "tx 50:44:43" | cec-client -s -d 1
```

**À développer** :

- Boutons volume +/- et mute dans `remote.component.ts` + `cloud-remote.component.ts`
- Événement Socket.IO `volume-control` avec `{ action: 'up' | 'down' | 'mute' }`
- Handler dans `server.js` qui exécute la commande CEC
- Commande cloud : même relay que les autres commandes (central → sync-agent → local)

**Fichiers à modifier** :

- `raspberry/src/app/components/remote/remote.component.ts` — Boutons + émission événement
- `raspberry/src/app/components/remote/remote.component.html` — UI boutons
- `raspberry/server/server.js` — Handler `volume-control`
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — Boutons cloud
- `central-server/src/controllers/remote.controller.ts` — Support commande `volume-control`

---

### Phase 2 — Régie pub complète (2-4 semaines)

> **Objectif** : Fonctions avancées qui permettent une vraie gestion publicitaire.
> **Priorité** : HAUTE — transforme Neopro d'un diffuseur en une régie

#### 2.1 Rotation pondérée des sponsors

**Problème** : Tous les sponsors ont le même temps d'antenne. Un sponsor qui paie 500€/mois a la même visibilité qu'un sponsor à 100€/mois.

**Solution** : Champ `weight` (1-10) par sponsor, la playlist est construite en proportion.

**Ce qui existe déjà** :

- `configuration.json` avec le tableau `sponsors[]`
- `tv.component.ts` qui itère séquentiellement sur `sponsors[]`

**Modification `configuration.json`** :

```json
{
  "sponsors": [
    { "name": "Sponsor Gold", "path": "videos/gold.mp4", "weight": 5 },
    { "name": "Sponsor Bronze", "path": "videos/bronze.mp4", "weight": 1 }
  ]
}
```

**Algorithme** :

```typescript
// Construire la playlist pondérée
buildWeightedPlaylist(sponsors: Sponsor[]): Sponsor[] {
  const playlist: Sponsor[] = [];
  // Normaliser : weight par défaut = 1
  const items = sponsors.map(s => ({ ...s, weight: s.weight || 1 }));
  const totalWeight = items.reduce((sum, s) => sum + s.weight, 0);

  // Répéter chaque sponsor proportionnellement
  for (const sponsor of items) {
    const count = Math.max(1, Math.round((sponsor.weight / totalWeight) * items.length * 2));
    for (let i = 0; i < count; i++) {
      playlist.push(sponsor);
    }
  }

  // Mélanger pour éviter les séquences AAAABB
  return this.shuffleWithSpacing(playlist);
}
```

**Fichiers à modifier** :

- `raspberry/src/app/components/tv/tv.component.ts` — Algorithme de playlist pondérée
- `central-dashboard/.../site-content-tab.component.ts` — Slider/input weight par sponsor
- `raspberry/sync-agent/src/utils/config-merge.js` — Préserver le champ `weight` au merge

#### 2.2 Proof of Play (v2 — sans screenshots)

**Problème** : Les clubs ne peuvent pas prouver aux sponsors que leurs pubs ont bien été diffusées.

**Solution** : Rapport de diffusion horodaté basé sur les données existantes. Pas de screenshots (supprimés pour bonne raison), mais un log fiable.

**Ce qui existe déjà** :

- `video_plays` — Chaque lecture avec `played_at`, `video_filename`, `tv_status`
- `advertiser_impressions` — Impressions par annonceur
- `club_sessions` — Sessions de match avec `audience_estimate`
- HDMI-CEC — `tv_status = 'on'` confirme que la TV était allumée

**Données de preuve** :

```
Date/Heure          | Vidéo                  | TV     | Audience estimée
2026-02-09 15:32:04 | Boulangerie_Martin.mp4 | ON     | ~120 spectateurs
2026-02-09 15:35:18 | Boulangerie_Martin.mp4 | ON     | ~120 spectateurs
2026-02-09 16:01:45 | Boulangerie_Martin.mp4 | ON     | ~120 spectateurs
```

**À développer** :

- Endpoint `GET /api/reports/proof-of-play/:advertiserId?start=...&end=...`
- Requête joignant `video_plays` + `advertiser_videos` + `club_sessions` + `sites`
- Format PDF et/ou CSV exportable
- Section dans le dashboard annonceur : "Preuves de diffusion"

**Requête SQL** :

```sql
SELECT
  vp.played_at,
  vp.video_filename,
  vp.tv_status,
  s.club_name,
  cs.audience_estimate
FROM video_plays vp
JOIN sites s ON s.id = vp.site_id
JOIN advertiser_videos av ON av.video_id = vp.video_id
LEFT JOIN club_sessions cs ON cs.site_id = vp.site_id
  AND vp.played_at BETWEEN cs.started_at AND COALESCE(cs.ended_at, NOW())
WHERE av.advertiser_id = $1
  AND vp.played_at >= $2 AND vp.played_at <= $3
  AND vp.tv_status = 'on'
ORDER BY vp.played_at DESC;
```

**Valeur business** : C'est LE document qu'un club montre à son sponsor pour justifier le renouvellement. "Votre pub a été diffusée 342 fois ce mois devant une audience estimée de 2400 spectateurs, TV confirmée allumée."

#### 2.3 Planification horaire (Dayparting)

**Problème** : Un sponsor veut être diffusé uniquement le weekend (jours de match), pas en semaine quand le gymnase est vide.

**Solution** : Scheduling par sponsor, réutilisant la logique watermark existante.

**Ce qui existe déjà** :

- `watermark.service.ts` — Logique de scheduling (jours de la semaine, plages horaires)
- `WatermarkConfig.schedule` — Structure `{ days: number[], startTime: string, endTime: string }`

**Modification `configuration.json`** :

```json
{
  "sponsors": [
    {
      "name": "Sponsor Weekend",
      "path": "videos/sponsor.mp4",
      "weight": 3,
      "schedule": {
        "days": [0, 6],
        "startTime": "14:00",
        "endTime": "22:00"
      }
    }
  ]
}
```

**Logique** :

```typescript
// Filtrer les sponsors actifs selon le planning
getActiveSponsors(sponsors: Sponsor[]): Sponsor[] {
  const now = new Date();
  return sponsors.filter(s => {
    if (!s.schedule) return true; // Pas de planning = toujours actif
    const dayMatch = s.schedule.days.includes(now.getDay());
    const timeMatch = this.isInTimeRange(now, s.schedule.startTime, s.schedule.endTime);
    return dayMatch && timeMatch;
  });
}
```

**Fichiers à modifier** :

- `raspberry/src/app/components/tv/tv.component.ts` — Filtrage sponsors par schedule
- `central-dashboard/.../site-content-tab.component.ts` — UI planning par sponsor
- `raspberry/sync-agent/src/utils/config-merge.js` — Préserver le champ `schedule`

---

### Phase 3 — Régie technique avancée (1-2 mois)

> **Objectif** : Enrichir l'expérience match-day pour se distinguer d'un simple affichage dynamique.
> **Priorité** : MOYENNE — consolidation du positionnement "régie technique"

#### 3.1 Timer multi-sport avancé

**Problème** : Le timer est générique. Pas de gestion automatique des périodes par sport.

**Solution** : Presets par sport avec gestion des périodes.

**Presets** :

```typescript
const SPORT_TIMER_PRESETS = {
  football: { periods: 2, duration: 45 * 60, extraTime: true, halfTime: 15 * 60 },
  basketball: { periods: 4, duration: 10 * 60, extraTime: true, halfTime: 10 * 60 },
  handball: { periods: 2, duration: 30 * 60, extraTime: true, halfTime: 10 * 60 },
  rugby: { periods: 2, duration: 40 * 60, extraTime: true, halfTime: 10 * 60 },
  volleyball: { periods: 5, duration: null, scoreToWin: 25 }, // Pas de timer, au score
  futsal: { periods: 2, duration: 20 * 60, extraTime: true, halfTime: 10 * 60 },
};
```

**Fonctionnalités** :

- Sélection du sport dans la télécommande → preset chargé
- Affichage période en cours ("1ère MT", "2ème MT", "Prolongation")
- Transition automatique : fin période → pause → période suivante
- Option compteur montant ou descendant selon le sport

**Fichiers à modifier** :

- `raspberry/src/app/components/remote/remote.component.ts` — Sélecteur sport, presets
- `raspberry/src/app/components/tv/tv.component.ts` — Affichage période
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — Sync

#### 3.2 Annonces enrichies (templates)

**Problème** : Le breaking news est un champ texte libre. Le bénévole doit taper "But de Dupont à la 32ème minute" à chaque but.

**Solution** : Templates pré-remplis avec variables.

**Templates** :

```typescript
const ANNOUNCEMENT_TEMPLATES = [
  { id: 'goal', label: '⚽ But', template: 'BUT DE {joueur} ! {homeScore} - {awayScore}' },
  {
    id: 'halftime',
    label: '⏸️ Mi-temps',
    template: 'MI-TEMPS | {homeTeam} {homeScore} - {awayScore} {awayTeam}',
  },
  {
    id: 'result',
    label: '🏆 Résultat',
    template: 'SCORE FINAL | {homeTeam} {homeScore} - {awayScore} {awayTeam}',
  },
  { id: 'info', label: 'ℹ️ Info', template: '{message}' },
  { id: 'next', label: '📅 Prochain match', template: 'PROCHAIN MATCH : {message}' },
];
```

**Interaction** : Clic sur template → remplissage auto des variables depuis le score en cours → envoi en 1 tap.

**Fichiers à modifier** :

- `raspberry/src/app/components/remote/remote.component.ts` — Templates + auto-fill
- `central-dashboard/src/app/features/remote/cloud-remote.component.ts` — Sync

#### 3.3 Playlist audio d'ambiance

**Problème** : L'ambiance sonore du gymnase est gérée séparément (enceinte Bluetooth, téléphone du bénévole). Neopro ne gère que l'image.

**Solution** : Player audio intégré au Pi, contrôlé depuis la télécommande.

**Architecture** :

```
/home/pi/neopro/audio/          ← Fichiers MP3
  ambiance/
    warmup-mix.mp3
    halftime-music.mp3
  jingles/
    goal-horn.mp3
    timeout-buzzer.mp3

TV Component:
  <video> ← Vidéos (son des vidéos)
  <audio> ← Playlist ambiance (volume indépendant)
```

**Comportement** :

- Playlist audio tourne en boucle (indépendante de la vidéo)
- Quand une vidéo avec son joue → audio ambiance baissé automatiquement (ducking)
- Contrôle depuis la télécommande : play/pause, next, volume ambiance
- Playlists par phase : musique d'accueil en `before`, silence en `during`, musique de fête en `after`

**Ce qui existe déjà** :

- `VideoWatcher` pour scanner des fichiers dans un dossier
- La structure de phases (before/during/after)
- Le mécanisme de déploiement de fichiers (même que les vidéos)

**Fichiers à créer/modifier** :

- `raspberry/src/app/services/audio-player.service.ts` — Nouveau service Angular
- `raspberry/src/app/components/tv/tv.component.ts` — Intégration `<audio>` + ducking
- `raspberry/src/app/components/remote/remote.component.ts` — Contrôles audio
- `raspberry/sync-agent/src/watchers/audio-watcher.js` — Scan dossier audio (basé sur video-watcher)

---

### Phase 4 — Outils commerciaux (1-2 semaines)

> **Objectif** : Aider les clubs à vendre des espaces sponsors.
> **Priorité** : BASSE — support commercial, pas du dev produit core

#### 4.1 Packs sponsors templates

Pas du code, des documents. Kits prêts à l'emploi pour les clubs :

**Pack Bronze (100-200€/mois)** :

- 1 vidéo en boucle neutre (entre les matchs)
- Rapport mensuel d'impressions
- 1 club

**Pack Silver (300-500€/mois)** :

- 1 vidéo dans toutes les phases (avant/pendant/après match)
- Rotation pondérée (poids 3)
- Rapport mensuel + proof of play
- 1-3 clubs

**Pack Gold (500-1000€/mois)** :

- Vidéos dédiées par phase (jingle avant-match, pub mi-temps, remerciement après-match)
- Rotation pondérée maximale (poids 5)
- Rapport hebdomadaire + proof of play + audience estimée
- Tous les clubs du réseau

**Livrables** : Templates PDF/Notion + guide de vente pour les clubs.

#### 4.2 Page publique annonceur

**Problème** : Le club doit se connecter au dashboard pour montrer les stats au sponsor.

**Solution** : URL publique partageable (comme le Cloud Remote, sans auth).

**URL** : `https://neopro-admin.kalonpartners.bzh/sponsor-report/{advertiserId}/{token}`

**Contenu** :

- Nom de l'annonceur
- KPIs du mois en cours (impressions, clubs, audience)
- Graphique impressions 30 jours
- Lien pour télécharger le rapport PDF

**Sécurité** : Token unique par annonceur (UUID), pas de données sensibles.

**Ce qui existe déjà** :

- Pattern Cloud Remote (route publique sans auth, sécurisée par UUID)
- Données `advertiser_daily_stats`

---

## Matrice de Priorité

```
                    IMPACT BUSINESS
                    Élevé                          Faible
              ┌─────────────────────┬─────────────────────┐
              │                     │                     │
    Faible    │  ★ PHASE 0+1        │  Phase 4            │
              │  Type réseau/local  │  Packs templates    │
    EFFORT    │  Dashboard annonceur│  Page publique      │
              │  Rapport PDF        │                     │
              │  Volume CEC         │                     │
              ├─────────────────────┼─────────────────────┤
              │                     │                     │
    Élevé     │  ★ PHASE 2          │  Phase 3            │
              │  Rotation pondérée  │  Timer multi-sport  │
              │  Proof of play      │  Audio ambiance     │
              │  Dayparting         │  Annonces templates │
              │  Garantie % réseau  │                     │
              └─────────────────────┴─────────────────────┘
```

---

## Timeline Estimée

```
Fév. 2026       Mars 2026       Avril 2026      Mai 2026
─────────────── ─────────────── ─────────────── ───────────────
[P0][== Phase 1 ==]
 │   Dashboard annonceur
 │   Rapport PDF
 │   Volume CEC
 │
 └─ Type réseau/local
    Distinction boucle
    Tracking séparé
                [==== Phase 2 ====]
                 Rotation pondérée
                 Garantie % réseau/local
                 Proof of play v2
                 Dayparting
                                [====== Phase 3 ======]
                                 Timer multi-sport
                                 Annonces enrichies
                                 Audio ambiance
                                                [Phase 4]
                                                 Packs templates
                                                 Page publique sponsor
```

---

## Métriques de Succès

| Phase   | Métrique                                    | Objectif                           |
| ------- | ------------------------------------------- | ---------------------------------- |
| Phase 0 | Annonceurs classifiés réseau/local          | 100% des annonceurs typés          |
| Phase 1 | Annonceurs utilisant le dashboard           | 5+ annonceurs actifs               |
| Phase 1 | Rapports PDF générés par mois               | 10+ rapports                       |
| Phase 2 | Clubs utilisant la rotation pondérée        | 50% des clubs avec sponsors        |
| Phase 2 | Proof of play téléchargés                   | 20+ par mois                       |
| Phase 2 | Annonceurs réseau Neopro actifs             | 3+ marques diffusées sur 10+ clubs |
| Phase 3 | Utilisation timer multi-sport               | 70% des matchs                     |
| Phase 3 | Clubs utilisant l'audio                     | 30% des clubs                      |
| Global  | Revenu pub réseau / club / mois             | Couvre 30%+ de l'abonnement        |
| Global  | Argument "régie tout-en-un" dans les ventes | Mentionné dans 100% des pitchs     |

---

## Risques et Mitigations

| Risque                                                   | Impact                                                              | Mitigation                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Données analytics incohérentes (raison suppression v3.0) | Dashboard annonceur peu fiable                                      | Se baser uniquement sur `advertiser_daily_stats` (pré-agrégé, pas de calcul temps réel) + filtrer `tv_status = 'on'` |
| CEC non supporté par certaines TV                        | Volume ne fonctionne pas                                            | Détecter le support CEC, afficher un message si non disponible                                                       |
| Sponsors sans `weight` défini                            | Playlist cassée                                                     | Default `weight = 1` si absent (rétrocompatible)                                                                     |
| Complexité UI télécommande                               | Bénévoles perdus                                                    | Garder l'interface simple, fonctions avancées dans un menu secondaire                                                |
| Audio + vidéo simultanés sur Pi                          | Surcharge GPU/CPU                                                   | Ducking automatique, test sur Pi 4 et Pi 5, option désactivable                                                      |
| Conflit réseau/local sur la boucle                       | Club mécontent que "ses" sponsors soient dilués par les pubs réseau | Garantie contractuelle du % local minimum (ex: 60% local, 40% réseau max). Le club garde le contrôle sur sa boucle.  |
| Annonceur réseau refuse le contexte amateur              | Image de marque dégradée dans un gymnase                            | Proposer des formats premium (phase avant-match uniquement, watermark, habillage) et des preuves d'audience captive  |
| Club vend pas de pub locale                              | Pas de revenu local, Neopro = juste un coût                         | Simplifier les outils de vente (Phase 4), fournir des packs clé-en-main, former les clubs                            |

---

## Annexe — Définitions de Référence

### Régie Technique (événementiel/sport)

Ensemble des moyens techniques et humains mobilisés pour gérer la captation, la diffusion et le contrôle de tout ce qui se voit et s'entend pendant un événement. Dans un contexte sportif : scoring, animations visuelles, mixage vidéo, sonorisation, éclairage, coordination équipe technique.

_Sources : [CIFACOM](https://www.cifacom.com/ressources/definition-regie), [Grim Edif](https://www.grimedif.com/actualites/quest-ce-quun-regisseur-evenementiel/)_

### Régie Publicitaire

Entité qui commercialise des espaces publicitaires pour le compte de médias. Intermédiaire entre annonceurs et supports de diffusion. Missions : commercialisation, ciblage, programmation, diffusion, reporting (impressions, CPM), facturation et recouvrement.

_Sources : [Azira](https://azira.com/fr/blogs/regie-publicitaire-role-et-missions), [Cenareo](https://www.cenareo.com/en/blog/roles-missions-regie-publicitaire)_

### Régie DOOH (Digital Out-Of-Home)

Régie publicitaire spécialisée dans l'affichage numérique extérieur. Gère un parc d'écrans connectés avec programmation à distance, contenus en temps réel, statistiques de diffusion et maintenance technique.

_Sources : [Tactic Media](https://tacticmedia.com/regie-publicitaire-dooh/), [TVTools](https://www.tvtools.fr/solutions/affichage-dynamique-stade/)_
