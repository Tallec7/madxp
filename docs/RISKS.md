# Risk Register Neopro

> ⚠️ **STALE** — Dernière révision : 2026-04-30. Contenu potentiellement périmé. Revue trimestrielle recommandée.

> **Audience** : Daisy + futur PM (où placer son énergie produit) + futur CTO (où placer son énergie infra)
>
> **Principe directeur** : un risque non documenté est un risque sous-estimé. Tout risque ici a été pesé en `proba × impact` et a une mitigation chiffrée — ou explicitement marquée "à accepter".
>
> **Statut** : Live | **Dernière revue** : 2026-04-27 | **Prochaine revue** : tous les mois (au lieu de tous les 2 mois pour TECH-DEBT car les risques business bougent vite)

## Comment lire ce doc

Chaque risque est noté avec :
- **Probabilité** (1-5) : 1 = peu probable, 5 = quasi-certain dans les 12 mois
- **Impact** (1-5) : 1 = mineur, 5 = catastrophique (perte client clé, perte de tout le code, etc.)
- **Score** = Proba × Impact, max 25. Tout score ≥12 doit avoir un plan de mitigation actif.
- **Statut mitigation** : 🔴 aucune / 🟡 partielle / 🟢 active

---

## 🔴 Risques business critiques (proba × impact ≥ 15)

### R-01 — Dépendance NLF Handball (concentration client)

| Champ | Valeur |
|---|---|
| **Type** | Business / Revenu |
| **Proba** | 4 (très probable que NLF reste un % énorme du CA pendant 6+ mois) |
| **Impact** | 5 (perdre NLF = perte de revenue principal + perte de la référence commerciale "client de prestige") |
| **Score** | **20 / 25** |
| **Statut mitigation** | 🟡 partielle |
| **Détail** | Sur les 7 sites actifs, NLF Handball est le client critique. Toutes les features récentes sont validées contre son use case. Si NLF résilie ou ne renouvelle pas, c'est à la fois une perte de CA majeure ET une perte de référence pour vendre à d'autres clubs. |
| **Mitigation actuelle** | Documentation client (`docs/clients/NLF.md`), fixes Pi-spécifiques pour eux, Slack chaud. |
| **Mitigation cible** | Diversifier à 3+ clients de taille équivalente avant fin 2026. Tracker le % de CA NLF chaque trimestre. |
| **TODO Daisy** | Documenter le contrat NLF (durée, montant, clause de résiliation) dans `docs/clients/NLF.md` partie privée |

### R-02 — Bus factor = 1 (Daisy seule sur le code)

| Champ | Valeur |
|---|---|
| **Type** | Tech / Org |
| **Proba** | 5 (Daisy peut tomber malade, partir en vacances, avoir un imprévu — c'est certain dans les 12 mois) |
| **Impact** | 4 (panne = personne pour intervenir, NLF en patit, churn possible) |
| **Score** | **20 / 25** |
| **Statut mitigation** | 🔴 aucune |
| **Mitigation cible** | (1) `docs/RUNBOOK.md` couvrant 5 incidents les plus probables, (2) un freelance back-up identifié et formé en 2j, (3) recrutement CTO d'ici septembre 2026 (annoncé). |
| **Effort** | 3-5j pour le runbook + back-up. CTO = projet de 2-3 mois en parallèle. |

### R-03 — Hostinger Single Point Of Failure (SPOF infra)

| Champ | Valeur |
|---|---|
| **Type** | Tech / Infra |
| **Proba** | 3 (Hostinger a déjà eu des pannes en 2025) |
| **Impact** | 4 (réduit après migration frontend Cloudflare 2026-04-29 — pas de vidéos servies = TV blanche en plein match si Pi non-cache) |
| **Score** | **12 / 25** |
| **Statut mitigation** | 🟡 partielle |
| **Mitigation cible** | Cloudflare en proxy + cache devant FTP vidéos Hostinger (1j) + plan documenté de bascule vers Cloudflare R2 ou AWS S3 (1j additionnel). Test annuel obligatoire. |
| **Effort restant** | 2j |
| **Mitigation actuelle (2026-04-29, PRs #729→#743)** : ADR-071 phase 3 livrée. **Le frontend (dashboard + SaaS) ne dépend plus de Hostinger** — bascule sur Cloudflare Pages avec deploys atomiques + rollback 1-clic + CDN edge global. Le périmètre du risque R-03 est maintenant réduit à la composante FTP vidéos (`storage.service.ts` + `kalonpartners.bzh/neopro-video/`). Phase 4 cleanup (.htaccess + jobs lftp) planifiée J+7. |
| **Note** | Le coût Cloudflare R2 sur 7 sites est marginal (~5€/mois pour 100GB). À chiffrer en détail au moment de l'implémentation. |

---

## 🟡 Risques élevés (score 10-14)

### R-04 — Perte de la DB Railway sans backup testé

| Proba 2 / Impact 5 / **Score 10** / 🟡 partielle |
|---|
| Railway fait des backups Postgres + workflow GitHub `db-backup.yml` exécute un `pg_dump` quotidien → Hostinger FTP (idempotent depuis PR #626). Mirror Supabase historique retiré (PR #633). Restore n'est toujours pas testé automatiquement. Si la DB est perdue (incident provider, suppression accidentelle via migration foireuse), on a un dump à J-1 mais on ne sait pas combien de minutes met le restore. |
| **Mitigation actuelle** : `db-backup.yml` quotidien, dump custom format, double upload FTP, sanity check >1 MB. |
| **Mitigation cible** : workflow GitHub Action mensuel qui restore vers une DB éphémère + script de validation + Slack le résultat. |
| **Effort** : 1j. **Bloqueur** : audit RGPD + sérénité. |

### R-05 — Perte du `HOTSPOT_PSK_ENCRYPTION_KEY`

| Proba 2 / Impact 5 / **Score 10** / 🟡 partielle |
|---|
| Cette clé chiffre tous les PSK WiFi des Pi en DB. Si elle est perdue (Railway env var écrasée par mégarde, migration ratée), tous les PSK deviennent indéchiffrables → tous les Pi se reconnectent à un hotspot avec un mauvais PSK = catastrophe parc. |
| **Mitigation actuelle** : la clé est sauvegardée dans 1Password (memory `project_adr073_rollout_paused.md` ligne 14). |
| **Mitigation manquante** : aucun script qui prouve "je peux restaurer la clé depuis 1Password en 5 min". Aucun monitoring sur la présence de cette env var dans Railway. |
| **Mitigation cible** : (1) test de restauration documenté dans `docs/RUNBOOK.md`, (2) alert Prometheus si la clé est absente au boot. |
| **Effort** : 0.5j. |

### R-06 — bworlds LaunchKit qui pivot ou disparaît

| Proba 3 / Impact 4 / **Score 12** / 🟡 partielle |
|---|
| Le SDK `@bworlds/launchkit` est intégré dans `central-dashboard/src/main.ts` pour heartbeat uptime + error capture (memory `project_bworlds_launchkit.md`). Évaluation prévue juin 2026. Si bworlds pivot, le SDK peut casser le boot du dashboard. |
| **Mitigation actuelle** : feature flag `launchkit.check()` interdit par smoke test (gate access bloqué). Heartbeat uniquement, pas de dépendance critique. |
| **Mitigation cible** : retirer le SDK avant juillet 2026 si l'évaluation n'aboutit pas, OU documenter formellement le contrat avec bworlds (SLA, fallback si SDK plante). |
| **Effort** : 1j pour retrait. **TODO Daisy** : décision à prendre fin juin 2026. |

### R-07 — Recrutement PM/CTO qui rate (mauvais fit)

| Proba 3 / Impact 4 / **Score 12** / 🟡 partielle |
|---|
| Recruter un PM ou un CTO confirmé en 2 mois sur un marché tendu, en solo, sans help RH, est un challenge. Un mauvais recrutement coûte ~3-6 mois (onboarding + départ + re-sourcing) et 30-60k€. |
| **Mitigation actuelle** : audit Lead Dev session du 25/04 + docs en cours de production qui crédibilisent la boîte en interview. |
| **Mitigation cible** : (1) screening checklist 30 min en cold call (red flags rapides), (2) projet test rémunéré 1 jour avant signature, (3) période d'essai courte (2 mois) explicitement mentionnée. |
| **Effort** : à intégrer dans le doc privé `recruitment/` (pas dans ce repo). |

### R-08 — Cap table / equity non clarifiée si CTO co-fondateur

| Proba 3 / Impact 4 / **Score 12** / 🔴 |
|---|
| Si Daisy recrute un CTO en mode "co-fondateur tardif" (5-15% equity), aucun document ne définit aujourd'hui la cap table actuelle, le vesting, les conditions de sortie. Sans ça, la négociation va déraper ou se faire à la va-vite et créer des conflits dans 12 mois. |
| **Mitigation actuelle** : aucune. |
| **Mitigation cible** : (1) cap table actuelle documentée (privée), (2) policy vesting (4 ans / cliff 1 an standard) prête à l'emploi, (3) avocat startup identifié pour rédiger le pacte d'actionnaires. |
| **Effort** : 1-2j de lecture (legalese) + 1.5-3k€ d'avocat pour le pacte. |
| **TODO Daisy** : décider si CTO = co-fondateur (equity) ou salarié (cash). Cf. mon message précédent sur les 3 interprétations A/B/C. |

---

## 🟢 Risques moyens (score 6-9)

### R-09 — Railway shutdown ou pricing prohibitif

| Proba 2 / Impact 4 / **Score 8** / 🟡 partielle |
|---|
| Railway est notre hébergeur API + Postgres **unique** (le mirror Supabase historique a été retiré, cf. ADR-070, ADR-085, PR #633). Son business model n'est pas garanti à 5 ans (cf. évolutions pricing récentes). Migration vers AWS/Render/Fly.io est faisable (déjà Dockerfile-friendly) mais coûte 5-10j de travail. |
| **Mitigation actuelle** : Dockerfile builder utilisé (cf. CLAUDE.md NE JAMAIS FAIRE Nixpacks), donc portable. Dumps quotidiens FTP Hostinger (PR #626) = la DB est récupérable même si Railway disparaît. |
| **Mitigation cible** : POC migration documenté (sans la faire) pour réduire le délai en cas d'urgence. |
| **Effort** : 2j de POC. |

### R-10 — Memory leak résiduel ou nouveau dans les services Node

| Proba 2 / Impact 3 / **Score 6** / 🟢 active |
|---|
| Un memory leak dans `saasStates` a été corrigé partiellement (issue #594) puis renforcé (PR #600 sweep périodique). D'autres Maps instance-level pourraient cacher des leaks similaires. |
| **Mitigation actuelle** : règle CLAUDE.md "Toute Map/Set instance-level doit avoir un cleanup" + métrique Prometheus `recordSaasStatesCount` + Grafana alerte si croissance anormale. |
| **Mitigation cible** : audit de toutes les Maps instance-level dans `central-server/src/services/` lors du recrutement CTO (vue fraîche utile). |

### R-11 — Pi à v3.10-v3.17 encore en parc (legacy `applyPreUpdateMigration`)

| Proba 2 / Impact 3 / **Score 6** / 🟡 partielle |
|---|
| `.claude/rules/ota.md` documente `applyPreUpdateMigration()` avec un TODO cleanup "une fois tous les Pi v3.10→v3.17 migrés". NLF est passé en v3.27, mais on n'a pas vérifié les 6 autres Pi du parc. |
| **Mitigation actuelle** : la migration est non-bloquante (try/catch) côté code v3.20+, donc pas de risque immédiat. |
| **Mitigation cible** : query DB qui liste les versions actuelles du parc + plan de migration des Pi <v3.20. Permet ensuite de supprimer le code legacy. |
| **Effort** : 0.5j d'audit + 1-3j par Pi à migrer si certains sont encore en v3.17. |

### R-12 — Dépendances JS dépréciées non auditées

| Proba 3 / Impact 2 / **Score 6** / 🔴 |
|---|
| `npm audit` n'est pas lancé régulièrement. Une CVE critique sur Express, Socket.IO, ou un middleware de sécurité passerait inaperçue jusqu'à ce qu'un scan externe (audit assurance, demande client) la révèle. |
| **Mitigation cible** : Dependabot activé sur le repo + script CI qui run `npm audit --production` avec seuil bloquant sur critical. |
| **Effort** : 0.5j à activer. |

### R-13 — Aucune politique RGPD / suppression données users

| Proba 2 / Impact 3 / **Score 6** / 🟡 partielle |
|---|
| La DB stocke des emails users dashboard, des audit_logs, des match infos avec noms équipes/joueurs (in directement). Si demande RGPD utilisateur (rare car users = clubs persona morale, mais possible pour les emails admin), on ne sait pas répondre rapidement. |
| **Mitigation actuelle (PR #633, 2026-04-27)** : registre RGPD à jour (`docs/legal/GDPR_PROCESSING_REGISTER.md`), politique de confidentialité, CGV, mentions légales et page `/legal` du dashboard reflètent les sous-traitants actuels (Railway USA + Hostinger UE Chypre). Encadrement transferts hors UE explicite (EU-US DPF + CCT/SCC). |
| **Mitigation manquante** : (1) DPA Railway non encore signé (https://railway.com/legal/dpa), (2) `docs/RGPD.md` opérationnel manquant, (3) script `cleanup_user_data(user_id)` non écrit/testé. |
| **Mitigation cible** : signer DPA Railway + écrire `docs/RGPD.md` + script `cleanup_user_data(user_id)` testé. |
| **Effort** : 0.5j (signature DPA + doc) + 0.5j (script cleanup). |

---

## ⚪ Risques faibles (score 1-5) — surveiller sans agir

| ID | Risque | Note |
|---|---|---|
| R-14 | Fuite secrets via screenshots Slack | 1×3=3 — bonne hygiène Daisy, à rappeler à la 1ère recrue |
| R-15 | Dépendance Cloudflare Pages staging | 2×2=4 — alternative facile si pivot |
| R-16 | Pi qui crame physiquement (carte SD) | 1×2=2 — kit de remplacement existe, NLF a un Pi de backup |
| R-17 | Domain `kalonpartners.bzh` non renouvelé | 1×4=4 — renouvellement auto Hostinger, à vérifier annuellement |
| R-18 | Performance dashboard avec 100+ sites | 2×2=4 — pas avant 6+ mois |

---

## Synthèse pour interview PM/CTO

Si tu dois résumer en 3 phrases face à un candidat :

1. **Top 3 risques** : dépendance NLF (R-01), bus factor 1 (R-02), Hostinger SPOF (R-03). Tous documentés, mitigation chiffrée, certains en cours d'attaque.
2. **Posture** : on n'attend pas qu'un risque devienne un incident pour le documenter. C'est dans `docs/RISKS.md`, mis à jour mensuellement.
3. **Pour ton job** : un PM s'attaque à R-01 (diversifier client), un CTO s'attaque à R-02 + R-03 + R-04 + R-05 (bus factor + infra SPOF + backup + secret). C'est exactement la frontière de scope qu'on attend.

C'est 10x plus crédible qu'un discours "on n'a pas de risques" + un incident qui débarque mois 2.

---

## Référence croisée avec TECH-DEBT.md

Plusieurs risques ici ont une contrepartie technique dans `docs/TECH-DEBT.md` :

| Risque | Tech debt associée |
|---|---|
| R-02 Bus factor 1 | P0 "Bus factor = 1" + manque RUNBOOK |
| R-03 Hostinger SPOF | P0 "Hostinger SPOF" |
| R-04 Backup DB | P0 "Aucun backup DB testé" |
| R-05 Perte clé PSK | P1 "Secrets management" |
| R-12 Dépendances dépréciées | P3 "Dépendances dépréciées non auditées" |
| R-13 RGPD | P1 "Aucune politique data retention formelle" |

Les 2 docs se complètent : `RISKS.md` = "qu'est-ce qui peut mal tourner et avec quel impact" / `TECH-DEBT.md` = "comment on évite que ça tourne mal, par où on attaque".
