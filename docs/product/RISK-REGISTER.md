# Risk Register — MadXP

> Mis à jour : Avril 2026 | Sources : Business Plan §11, Audit Sécurité déc. 2025, NFR v2.0, Weekly W16

---

## Matrice de notation

| Probabilité | Score P |     | Impact   | Score I |     | Score final | Priorité |
| ----------- | ------- | --- | -------- | ------- | --- | ----------- | -------- |
| Faible      | 1       |     | Faible   | 1       |     | 1–2         | P3       |
| Modérée     | 2       |     | Moyen    | 2       |     | 3–4         | P2       |
| Élevée      | 3       |     | Élevé    | 3       |     | 6           | P1       |
| Quasi-cert. | 4       |     | Critique | 4       |     | 8–16        | P0       |

**Score = P × I. P0 = action immédiate. P1 = sprint en cours. P2 = backlog prioritaire. P3 = surveiller.**

---

## 1. Risques Techniques (P0–P1)

| RISK-ID  | Description                                                                                                                       | Proba | Impact | Score | Priorité | Statut           | Mitigation                                                                              | Owner    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- | ---------------- | --------------------------------------------------------------------------------------- | -------- |
| RISK-T01 | **3 vulnérabilités npm critical non patchées** sur `central-server` (W16 audit : critical=3, high=20) — prod exposée              | 3     | 4      | 12    | **P0**   | Ouvert           | `npm audit --json` → qualifier → patcher ou accepter formellement avec ticket           | Lead Dev |
| RISK-T02 | **WiFi Pi instabilité** — bssid-lock et mesh WiFi incompatibles (ADR-011). Reconnexion échoue si AP bascule sur BSSID différent   | 3     | 3      | 9     | **P0**   | Mitigé (règle)   | `bgscan` désactivé ; interdiction mesh sans Ethernet ; alerte `lowWifiSignal` < -70 dBm | Ops Pi   |
| RISK-T03 | **Railway sticky sessions** — scaling horizontal bloqué sans Redis adapter Socket.IO. Instance unique = SPOF applicatif           | 2     | 4      | 8     | **P0**   | Mitigé (partiel) | Redis adapter prévu (NFR-SC10) ; Railway Hobby → 1 instance max aujourd'hui             | Infra    |
| RISK-T04 | **Supabase connection pool limité à 5** (Transaction Mode PgBouncer port 6543). Saturation si flotte > 50 Pi actifs simultanément | 2     | 4      | 8     | **P0**   | Mitigé (alerte)  | Alerte `DbPoolSaturation` > 80% pendant 3 min ; clamp 1-50 ; optimiser queries          | Lead Dev |
| RISK-T05 | **Rollback OTA incomplet** — si crash entre backup et validation, le Pi reste en état intermédiaire                               | 2     | 3      | 6     | **P1**   | Mitigé           | Rollback auto si checks critiques échouent ; canary 5 min post-OTA (NFR-D08/D09)        | Ops Pi   |
| RISK-T06 | **Heap mémoire API Railway** — limite 256 MB RSS (Hobby). Leak mémoire ou charge > 200 Pi = OOM + restart                         | 2     | 3      | 6     | **P1**   | Mitigé           | Memory Manager cleanup à 93% heap ; alerte `HighMemoryUsage` à 88% (NFR-SC07/08)        | Infra    |
| RISK-T07 | **Corruption `config.json` Pi** — fichier local seul référentiel de la boucle. Corruption = TV muette                             | 2     | 3      | 6     | **P1**   | Mitigé           | Backup avant OTA ; fallback `local_config_mirror` ; sync-guardian watchdog              | Ops Pi   |
| RISK-T08 | **Incompatibilité mise à jour Pi OS** — dépendances Node.js ou Angular cassent sur une version OS mineure                         | 2     | 3      | 6     | **P1**   | Ouvert           | Tests staging ; rollback OTA automatique ; canary déploiement                           | Lead Dev |
| RISK-T09 | **Surcharge Socket.IO** — 500 Pi simultanés sans Redis cluster = gorge d'étranglement (NFR-SC01)                                  | 2     | 3      | 6     | **P1**   | Ouvert           | Redis adapter + monitoring rooms ; objectif cible atteint à Phase 3                     | Infra    |
| RISK-T10 | **strictNullChecks=false** sur `raspberry/tsconfig.json` — surface d'erreurs runtime Angular Pi élevée                            | 2     | 2      | 4     | **P2**   | Ouvert           | Activer progressivement ; taux de couverture tests Pi frontend = 0% (audit)             | Lead Dev |

---

## 2. Risques Produit

| RISK-ID  | Description                                                                                                                          | Proba | Impact | Score | Priorité | Statut       | Mitigation                                                                                        | Owner    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ | ----- | -------- | ------------ | ------------------------------------------------------------------------------------------------- | -------- |
| RISK-P01 | **Bootstrap commercial œuf/poule** — clubs veulent des sponsors avant d'avoir audience, annonceurs veulent des clubs avant d'acheter | 3     | 4      | 12    | **P0**   | Actif        | Stratégie clubs pilotes gratuits → preuve d'audience → recrutement sponsors ; démarrage bootstrap | CEO      |
| RISK-P02 | **Churn annonceurs sans self-service portal** — renouvellement sans ROI prouvé → 30-40% churn annuel estimé                          | 3     | 3      | 9     | **P0**   | Ouvert       | Analytics sponsors en prod ; dashboard ROI ; portail self-service (roadmap)                       | Product  |
| RISK-P03 | **6 features mergées sans test plan validé** (W16 : #472, #467, #449, #441, #439, #438) — régressions silencieuses en prod           | 3     | 2      | 6     | **P1**   | Ouvert       | Validation manuelle planifiée ; test plan obligatoire avant merge (processus)                     | Lead Dev |
| RISK-P04 | **229 commits directs sur main sans PR** (W16) — revue de code partielle, décisions non tracées                                      | 3     | 2      | 6     | **P1**   | Ouvert       | Renforcer règle PR systématique ou assouplir formellement pour chores                             | Lead Dev |
| RISK-P05 | **Absence de portail self-service annonceur** — toute campagne passe par MADXP → frein à l'échelle                                   | 2     | 3      | 6     | **P1**   | Roadmap      | Feature SAFe planifiée ; prioriser pour réduire churn annonceurs                                  | Product  |
| RISK-P06 | **Dépendance NLF** — client critique concentré ; perte = impact revenus significatif                                                 | 2     | 3      | 6     | **P1**   | Surveillance | Diversification portefeuille clients ; contractualisation multi-année                             | CEO      |
| RISK-P07 | **Zéro couverture tests frontend Pi** — bugs TV non détectés avant terrain                                                           | 2     | 2      | 4     | **P2**   | Ouvert       | Ajouter tests unitaires Angular Pi ; smoke E2E Pi simulé                                          | Lead Dev |

---

## 3. Risques Business & Go-to-Market

| RISK-ID  | Description                                                                                          | Proba | Impact | Score | Priorité | Statut       | Mitigation                                                                            | Owner |
| -------- | ---------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- | ------------ | ------------------------------------------------------------------------------------- | ----- |
| RISK-B01 | **Échec levée de fonds** — runway dépend du bootstrap actuel ; seed conditionnel au NPS pilotes > 40 | 2     | 4      | 8     | **P0**   | Surveillance | Bootstrap rigoureux ; diversification revenus (SaaS + Pi) ; objectif 20 clubs pilotes | CEO   |
| RISK-B02 | **Churn clubs élevé** — ROI TV non prouvé en phase initiale, clubs quittent après pilote             | 2     | 3      | 6     | **P1**   | Ouvert       | NPS suivi ; customer success ; features demandées par clubs                           | CEO   |
| RISK-B03 | **Concurrent bien financé** — acteur media/telecom entre sur le marché TV clubs sportifs             | 2     | 2      | 4     | **P2**   | Surveillance | Exécution rapide ; partenariats fédérations ; différenciation locale hyper-ciblée     | CEO   |
| RISK-B04 | **Difficulté recrutement** — profil full-stack IoT + Angular rare                                    | 3     | 2      | 6     | **P1**   | Actif        | Remote-first ; culture technique forte ; employer branding                            | CEO   |
| RISK-B05 | **Burn rate excessif** — phase bootstrap sans investissement externe                                 | 1     | 4      | 4     | **P2**   | Surveillé    | Budget mensuel strict ; Railway Hobby plan ; infra lean                               | CEO   |

---

## 4. Risques Sécurité

| RISK-ID  | Description                                                                                                     | Proba | Impact | Score | Priorité | Statut     | Mitigation                                                                        | Owner    |
| -------- | --------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- | ---------- | --------------------------------------------------------------------------------- | -------- |
| RISK-S01 | **npm critical (×3) non patchées** — packages vulnérables en prod central-server (voir RISK-T01)                | 3     | 4      | 12    | **P0**   | Ouvert     | Qualifier + patcher dans la semaine ; bloquer merge si audit régresse             | Lead Dev |
| RISK-S02 | **npm high (×20) + root workspace critical (×1, high ×36)** — surface d'attaque élargie                         | 3     | 3      | 9     | **P0**   | Ouvert     | Audit hebdomadaire ; `npm audit fix` sur les safe upgrades ; lockfile en CI       | Lead Dev |
| RISK-S03 | **Exposition JWT dans URL** (EventSource historique, audit déc. 2025 — statut correctif à valider)              | 2     | 3      | 6     | **P1**   | À vérifier | Migrer vers HttpOnly cookie pour SSE ; vérifier correctif appliqué                | Lead Dev |
| RISK-S04 | **RGPD — notification CNIL** — obligation < 72h en cas de violation. Processus non formalisé                    | 2     | 3      | 6     | **P1**   | Ouvert     | Formaliser runbook incident RGPD ; désigner DPO ou référent                       | CEO      |
| RISK-S05 | **API keys sites immuables** — rotation casse tous les Pi. Un secret compromis ne peut pas être révoqué à chaud | 2     | 3      | 6     | **P1**   | Connu      | Rotation via Dashboard (procédure manuelle) ; monitoring usage anormal par site   | Lead Dev |
| RISK-S06 | **MFA non obligatoire sur rôles non-admin** — operators avec accès multi-sites sans second facteur              | 2     | 2      | 4     | **P2**   | Partiel    | MFA obligatoire super_admin/admin (NFR-S02) ; étendre aux operators en Phase 2    | Lead Dev |
| RISK-S07 | **Isolation multi-tenant RLS** — toute erreur de contexte DB = fuite inter-tenant                               | 1     | 4      | 4     | **P2**   | Mitigé     | RLS PostgreSQL sur toutes tables sensibles ; middleware RLS Context ; tests smoke | Lead Dev |

---

## 5. Risques Opérationnels (Pi terrain, support)

| RISK-ID  | Description                                                                                         | Proba | Impact | Score | Priorité | Statut | Mitigation                                                                      | Owner  |
| -------- | --------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- | ------ | ------------------------------------------------------------------------------- | ------ |
| RISK-O01 | **Problème réseau club** — WiFi instable, portail captif, IP change                                 | 3     | 2      | 6     | **P1**   | Mitigé | 3 couches fallback ADR-060 : Cloud → LAN → offline queue ; hotspot dédié wlan0  | Ops Pi |
| RISK-O02 | **Panne hardware Pi** — SD card corrompue, surchauffe (> 85°C), alimentation                        | 2     | 2      | 4     | **P2**   | Mitigé | Stock spare ; RMA rapide ; alerte temp CPU > 80°C ; watchdog systemd            | Ops Pi |
| RISK-O03 | **Formation staff club insuffisante** — télécommande mal utilisée, signalements faux-positifs       | 2     | 2      | 4     | **P2**   | Ouvert | Documentation ; vidéos tutoriels ; runbook T1-T15 (ADR-060 §4)                  | Ops Pi |
| RISK-O04 | **Surcharge support** — flotte > 20 clubs = tickets en masse lors d'une panne globale               | 2     | 2      | 4     | **P2**   | Ouvert | FAQ ; alerting automatique Prometheus → Alertmanager → Slack ; status page      | Ops    |
| RISK-O05 | **Portail captif en salle** — Pi bloqué sans internet, TV muette                                    | 2     | 2      | 4     | **P2**   | Mitigé | Détection HTTP 204 + alerte `captive_portal_detected` ; fallback vidéos locales | Ops Pi |
| RISK-O06 | **Déploiement terrain nouveau club** — erreur config JSON manuelle = Pi ne démarre pas correctement | 2     | 2      | 4     | **P2**   | Mitigé | Script `setup-new-club.sh` ; checklist validation J-7/J-1/J                     | Ops    |

---

## 6. Risques Infrastructure (Railway, Supabase, Hostinger)

| RISK-ID  | Description                                                                                                               | Proba | Impact | Score | Priorité | Statut    | Mitigation                                                                          | Owner    |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | -------- | --------- | ----------------------------------------------------------------------------------- | -------- |
| RISK-I01 | **FTP Hostinger — single point of failure** — stockage vidéos (upload + streaming) centralisé sur un seul fournisseur     | 2     | 4      | 8     | **P0**   | Ouvert    | Vidéos locales sur Pi en backup ; ADR-068 signed URL proxy ; évaluer CDN secondaire | Infra    |
| RISK-I02 | **Dépendance Resend API emails** — alertes PIN burst, notifications = SPOF si Resend down                                 | 2     | 2      | 4     | **P2**   | Ouvert    | Fallback SMTP direct ; retry avec backoff exponentiel                               | Lead Dev |
| RISK-I03 | **Railway downtime** — API centrale down = Pi perdent heartbeat, remote cloud indisponible                                | 1     | 4      | 4     | **P2**   | Mitigé    | Pi autonomes 24h offline (NFR-D03) ; alerte Prometheus si down > 2 min (NFR-D01)    | Infra    |
| RISK-I04 | **Supabase Plan Limits** — DB size alerte > 400 MB, critique > 475 MB ; dépassement = upgrade forcé                       | 2     | 2      | 4     | **P2**   | Surveillé | Alertes Prometheus configurées (NFR-SC06) ; rétention logs/analytics bornée         | Infra    |
| RISK-I05 | **Hostinger Dashboard SPA** — déploiement via FTP/CI ; erreur de déploiement = dashboard inaccessible                     | 1     | 3      | 3     | **P3**   | Mitigé    | GitHub Actions CI vérifie HTTP post-deploy ; rollback via re-deploy                 | Lead Dev |
| RISK-I06 | **Redis adapter non déployé** — sticky sessions Railway bloquent scaling horizontal (voir RISK-T03)                       | 2     | 3      | 6     | **P1**   | Ouvert    | Déployer Redis adapter avant de scaler au-delà d'une instance                       | Infra    |
| RISK-I07 | **Nixpacks auto-détection** — si Railway perd le Dockerfile, Nixpacks détecte root package.json et lance `ng build` → OOM | 1     | 3      | 3     | **P3**   | Mitigé    | Dockerfile builder explicite dans `central-server/Dockerfile` ; règle CLAUDE.md     | Infra    |

---

## Plan de réponse aux P0

### RISK-T01 / RISK-S01 — 3 vulnérabilités npm critical (central-server)

**Si le risque se matérialise** : un attaquant exploite un package vulnérable pour exécuter du code arbitraire sur l'API Railway, exfiltrer les tokens JWT ou la connexion Supabase, compromettre l'ensemble de la flotte Pi via des commandes socket forgées.

**Réponse immédiate** :

1. `cd central-server && npm audit --json > audit.json` — qualifier les 3 critical (CVE, exploitabilité)
2. `npm audit fix` sur les safe upgrades ; `npm audit fix --force` uniquement si tests passent
3. Si non patchable : isoler le package, ouvrir un ticket de dette sécurité, accepter formellement avec date limite
4. Revalider avec `npm run test:smoke` avant merge

---

### RISK-P01 — Bootstrap commercial (œuf/poule)

**Si le risque se matérialise** : aucun club ne renouvelle faute de sponsors, aucun annonceur ne signe faute d'audience. Runway épuisé sans revenus récurrents.

**Réponse immédiate** :

1. Identifier 3-5 clubs pilotes gratuits avec audience TV vérifiable (matchs filmés)
2. Négocier 1-2 sponsors locaux test à tarif réduit comme preuve de concept
3. Produire rapport ROI après 30 jours (analytics vidéo + impressions)
4. Utiliser les données pour pitch annonceurs suivants

---

### RISK-T03 / RISK-I06 — Railway sticky sessions + scaling

**Si le risque se matérialise** : lors d'un pic de connexions Pi (OTA flotte, événement sportif), Railway scale horizontalement mais sans Redis adapter — la moitié des Pi perdent leurs rooms Socket.IO, heartbeats manqués, alertes en cascade.

**Réponse immédiate** :

1. Scale-down à 1 instance (rollback)
2. Déployer Redis adapter (Upstash) avant de rescaler
3. Valider sticky sessions désactivées + rooms correctement distribuées

---

### RISK-I01 — FTP Hostinger SPOF

**Si le risque se matérialise** : Hostinger FTP down = upload vidéos impossibles, streaming SaaS indisponible (ADR-068), téléchargements OTA échouent.

**Réponse immédiate** :

1. Pi déjà déployés : continuent en mode local (vidéos déjà synchronisées)
2. Pi sans vidéos : fallback écran de maintenance ou slides statiques
3. Nouveaux déploiements bloqués jusqu'au retour FTP
4. À moyen terme : évaluer stockage objet secondaire (S3/Backblaze) comme fallback

---

### RISK-T04 — Supabase pool saturé

**Si le risque se matérialise** : toutes les requêtes API échouent avec `connection timeout` — dashboard inaccessible, API REST 503, heartbeats Pi rejetés.

**Réponse immédiate** :

1. Prometheus alerte `DbPoolSaturation` déclenche : identifier les requêtes longues en cours
2. Redémarrer Railway instance pour vider les connexions zombies
3. Passer temporairement en mode maintenance (rate limit très bas)
4. À moyen terme : passer en Supabase plan supérieur (pool > 5)

---

## Revue mensuelle

| Élément         | Détail                      |
| --------------- | --------------------------- |
| **Fréquence**   | 1er vendredi de chaque mois |
| **Responsable** | Lead Dev + CEO              |
| **Durée**       | 30 min                      |

**Checklist de revue** :

- [ ] Relire les risques P0 : statut toujours actuel ?
- [ ] Nouveaux risques identifiés ce mois (incidents, audits, changelogs) ?
- [ ] Score npm audit : progression ou régression ?
- [ ] Métriques infrastructure : pool DB, heap API, taux reconnexion Pi
- [ ] Incidents terrain : Pi offline, pannes WiFi, OTA échoués
- [ ] Risques business : NPS clubs, taux churn annonceurs, pipeline commercial
- [ ] Mise à jour statuts (Ouvert → Mitigé → Fermé)
- [ ] Risques P2 à promouvoir en P1 ?

**Template entrée nouvelle ligne** :

```
| RISK-Xxx | Description courte | P (1-4) | I (1-4) | Score | Priorité | Ouvert | Mitigation | Owner |
```

---

> **Sources** : `docs/business/BUSINESS_PLAN_COMPLET.md §11`, `docs/archive/audits/AUDIT_SECURITE_COMPLET.md`, `docs/product/NFR.md`, `docs/technical/diagrams/05-architecture-c4.md`, `docs/reports/WEEKLY-W16-2026-04-18.md §7`
