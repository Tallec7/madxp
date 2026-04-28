# Business Changelog Neopro

> Récap hebdomadaire des PRs en langage métier. Lecture en 1 minute le vendredi pour avoir le pouls.
>
> Format : 1 entrée par semaine, 3 buckets (🎯 Pour le club / 🛡️ Pour la robustesse / 🧹 Pour l'équipe), 1 bullet par PR avec n° citée.
>
> Convention : ne PAS créer d'entrée pour une session qui ne ship rien (exploration, debug pur, etc.).

---

## Semaine 18 — 28 Avril – 4 Mai 2026

### 🎯 Pour le club (NLF, prospects)

- **Télécommande V2 : icônes harmonisées cross-OS** ([cette PR](https://github.com/Tallec7/neopro)) — les 11 emojis Unicode de la Remote V2 (📷 modifier logo, 🔁 nouveau match, ⏸/▶ chrono, 💡 astuce breaking news, → période suivante, › chevrons prefs, ⚠/✓ statut erreurs vidéo) rendaient différemment selon iPad opérateur, tablette Android régie, PC Windows tribune ou PC Linux centre médias — parfois en tofu illisible. Migration vers une bibliothèque SVG inline contrôlée (`<app-r2-icon>` + registre Lucide MIT, 0 dépendance npm). Affichage pixel-identique partout, icônes teintables (rouge danger / blanc dark mode), accessibilité RGAA correcte (le lecteur d'écran lit "Modifier le logo" au lieu de "appareil photo emoji"). SPEC-V2-ICONS-01.

### 🛡️ Pour la robustesse / production

- (rien cette semaine)

### 🧹 Pour l'équipe (toi + futurs devs)

- (rien cette semaine)

---

## Semaine 17 — 21-27 Avril 2026

> Audit Lead Dev complet par Claude. Note projet : 78/100 → potentiel 85+ après merge des PRs ouvertes.

### 🎯 Pour le club (NLF, prospects)

- Aucun changement visible utilisateur
  (sessions techniques d'audit + refactor d'infra + cleanup process)
- **Télécommande V2 : verrou rotation + taille du texte de retour** ([#624](https://github.com/Tallec7/neopro/pull/624)) — la sheet "Préférences" V2 ré-expose 2 contrôles d'accessibilité disponibles en V1 (lock rotation, taille texte normale/grande). Les clubs qui activent V2 retrouvent ces options sans devoir basculer en V1.
- **Vidéos manquantes : feedback visible sur les 3 surfaces** ([#630](https://github.com/Tallec7/neopro/pull/630)) — 3e étage du chantier "vidéos manquantes" (après #613/#616/#617/#618). NLF / staff club voient désormais : (1) un toast rouge `⚠️ Vidéo X indisponible — boucle reprise` sur la télécommande quand une vidéo plante, plus un badge `!` persistant sur le bouton ; (2) une bannière rouge sur `/club` quand des erreurs ont été détectées dans les 24h, qui pointe vers `/club/diagnostic` ; (3) une nouvelle tile `Erreurs vidéo (24h)` côté diagnostic. Plus d'écran figé en match sans explication.
- **Vidéos manquantes : couverture étendue + drill-down site** ([#632](https://github.com/Tallec7/neopro/pull/632) / [#634](https://github.com/Tallec7/neopro/pull/634) / [#639](https://github.com/Tallec7/neopro/pull/639) / [#641](https://github.com/Tallec7/neopro/pull/641)) — itérations UX successives suite au feedback Daisy : Remote V1 (legacy) reçoit aussi le toast/badge ; Remote V2 affiche une chip permanente `✓ 0` dans le header pour confirmer que la sonde tourne ; le tab "Contenu" du site detail affiche un badge rouge `[N]` qui agrège erreurs lecture 24h **et** orphelines FTP référencées par ce site ; nouvelle bannière collapsible en tête du tab Contenu listant les vidéos cassées (filename + statut + date détection). L'admin a maintenant un parcours complet : badge → bannière → liste actionnable.
- **Vidéos manquantes : Unlink + Replace + filtre library (γ complet)** ([#643](https://github.com/Tallec7/neopro/pull/643) / [#645](https://github.com/Tallec7/neopro/pull/645) / [#647](https://github.com/Tallec7/neopro/pull/647)) — clôture du chantier vidéos manquantes. #643 : bouton "Retirer du site" 1-clic qui nettoie en cascade boucles + catégories + sponsors et repush la config Pi/SaaS. #645 : suppression du `.jpg` thumbnail du FTP quand on supprime une vidéo (cause racine des `.jpg` orphelins). #647 : bouton 📤 **Remplacer le fichier** dans la modal détail + library — badge ❌ Introuvable FTP sur les cards (grid + table), filtre dédié "❌ Introuvables FTP" (visible si ≥1 orpheline), désactivation des actions dangereuses (Déployer, Ajouter à la config) sur orphelines. Re-uploader le binaire ressuscite la vidéo sans la dé-référencer, auto-résout le warning audit + push toute la flotte (Pi via update_config, SaaS via socket). L'admin n'a plus à recréer une vidéo cassée à la main.
- **URL admin club-grants corrigée** ([#657](https://github.com/Tallec7/neopro/pull/657)) — la modal "Clubs autorisés" sur les vidéos admin globales remontait des 404 (mauvais préfixe `/content/videos/.../club-grants`). 4 endpoints corrigés (load, ajout, retrait, vue club). Plus d'erreur console quand un super_admin gère les accès clubs aux vidéos partagées.
- **Audit FTP : moins de faux positifs "Introuvable"** ([#660](https://github.com/Tallec7/neopro/pull/660)) — Hostinger refuse parfois les requêtes HEAD (timeout/5xx) alors que les fichiers existent. Le CRON marquait à tort des vidéos saines comme "introuvables" (~400 false positives observés en prod le 27/04). Nouvelle stratégie : HEAD timeout → retry GET Range minimal avant de persister le warning. Côté UI, deux badges distincts : 🔴 ❌ Introuvable FTP (404 confirmé, bloque) vs 🟠 ⚠️ Non vérifié (probe failed, info seulement). Dashboard plus fiable.
- **"Retirer du site" SaaS : plus de 404 utilisateur** ([cette PR](https://github.com/Tallec7/neopro)) — sur NLF Handball, cliquer "Retirer du site" sur certaines vidéos affichait une erreur rouge `404 Lien vidéo-site non trouvé`. Cause : le bouton est exposé pour toute vidéo cloud visible côté super_admin, mais le handler renvoyait 404 dès que la pivot `site_videos` n'avait pas la liaison — ce qui arrive normalement (vidéos cloud fleet-wide visibles sans liaison formelle). Fix d'idempotence : si la liaison n'existe pas, l'état désiré est déjà atteint → 200 + flag `alreadyUnlinked`, log `info` pour observabilité. Smoke test garde-fou ajouté pour empêcher la réintroduction du 404. Plus de faux échec côté admin.
- **Bouton "Remplacer le fichier" : fix critique** ([cette PR](https://github.com/Tallec7/neopro)) — depuis la livraison de #647, le bouton uploadait silencieusement TOUS les replaces sous le même nom `"undefined"` côté FTP, écrasant à chaque opération. La DB marquait la vidéo `ready` mais l'URL HTTP du fichier réel ne recevait jamais d'écriture → 404. 12 vidéos finissaient zombies (visibles en DB mais introuvables côté TV). Cause : 1 ligne lisait une colonne aliasée (`existing.storage_path` au lieu de `existing.url`). Fix + smoke test garde-fou inversé (verrouillait littéralement le bug) + ADR-100 documente le contrat de l'alias. Backfill manuel des 12 zombies à faire après deploy.

### 🛡️ Pour la robustesse / production

- **Memory leak SaaS corrigé** ([#600](https://github.com/Tallec7/neopro/pull/600)) — évite les redémarrages Railway intempestifs après plusieurs jours d'uptime sur sites SaaS multi-clients.
- **Backup task : alerte explicite** ([#600](https://github.com/Tallec7/neopro/pull/600)) — si quelqu'un croit avoir un backup CRON qui tourne, on le sait maintenant (avant : faux positif "success" silencieux dangereux).
- **Notifications Slack quand un objectif club est à risque** ([#612](https://github.com/Tallec7/neopro/pull/612)) — alerte groupée par site (1 message Slack par site, liste des objectifs <50% de progression). Activable via `SLACK_WEBHOOK_URL`.
- **Backup DB quotidien rendu idempotent** ([#626](https://github.com/Tallec7/neopro/pull/626)) — le job GitHub Actions plantait dès le 2e run (Hostinger FTP renvoyait "550 File exists" sur le `mkdir`). Désormais robuste : les sauvegardes Railway → Hostinger tournent sans intervention.
- **Page super_admin "Santé vidéos flotte"** ([#630](https://github.com/Tallec7/neopro/pull/630)) — `/admin/video-health` agrège les orphelines FTP (du CRON nocturne) + les erreurs de lecture 24h flotte (du compteur Prometheus) en une seule vue. KPIs + top sites en erreur (drill-down vers le contenu) + bouton `Lancer audit FTP maintenant`. Avant : ces données existaient mais aucun écran ne les affichait.
- **Dashboard Grafana "Blind Spots" + garde-fou observabilité** ([#631](https://github.com/Tallec7/neopro/pull/631)) — 30 métriques `neopro_*` étaient émises sans dashboard. Nouveau dashboard catch-all qui les surface (ADR-074 PSK, ADR-093 match auto-close, cascade FTP, TV playback, Template Studio, etc.). Smoke test gelé qui faillit si une nouvelle métrique apparaît sans être visualisée — on ne livrera plus de feature dont la supervision passe à la trappe.
- **Cleanup Supabase complet** ([#633](https://github.com/Tallec7/neopro/pull/633)) — toutes les références Supabase mortes retirées du code actif, runbooks, README, onboarding et docs RGPD/legal. Page `/legal` du dashboard, registre RGPD, CGV et mentions légales mis à jour : sous-traitant principal = Railway Corp. (USA, EU-US DPF) + Hostinger (UE, FTP vidéos). DPA Railway à signer côté Daisy.
- **Dette `@types/react` débloquée** ([#636](https://github.com/Tallec7/neopro/pull/636)) — `@types/react` et `@types/react-dom` ajoutés en devDependencies. `ng serve central-dashboard` ne plante plus avec TS7016/TS2503 sur le Remotion Studio Player. Dette préexistante découverte pendant la session de cleanup Supabase.
- **Source de vérité de l'uptime sites** ([#644](https://github.com/Tallec7/neopro/issues/644), [#646](https://github.com/Tallec7/neopro/pull/646), [#650](https://github.com/Tallec7/neopro/pull/650), ADR-099) — la page détail d'un site affichait ~10% d'uptime en permanence sur **toute la flotte**, même pour des Pi parfaitement stables. Cause : la formule comptait des samples CPU/RAM (5 min d'intervalle) en supposant des heartbeats de 30s. Nouvelle table `connection_events` qui persiste connect/disconnect réels, calcul d'uptime cohérent (4 KPI par site sur fenêtre N heures : %, nb coupures, plus longue coupure, état courant). Front bascule sur le nouveau champ + veto DB sur faux positifs du cache socket. CRON purge 90j pour borner la table + 2 panels Grafana. Smoke test gelé qui interdit la régression du diviseur magique 2880. Les opérateurs peuvent enfin distinguer un site sain d'un site qui flap.

### 🧹 Pour l'équipe (toi + futurs devs)

- **Monitoring dashboard : 144 checks/jour → 24** — le workflow "Frontend Health Check" tournait toutes les 10 minutes inutilement entre deux déploiements. Réduit à toutes les heures ; le déclencheur post-Release (lui vraiment utile) reste intact.

- **Deploys Hostinger accélérés** ([#625](https://github.com/Tallec7/neopro/pull/625)) — le job `Deploy SaaS to Hostinger` traînait à 20m+ par run. Pipeline FTP optimisé (5 connexions parallèles, sync-mode off, --only-newer, --use-pget-n=4). Impact attendu : -50% à -70% sur deploys incrémentaux.
- **2 fichiers monstres splittés** : `socket.service.ts` (1263→991 lignes, [#607](https://github.com/Tallec7/neopro/pull/607) — extraction du SaaS relay) et `cron-scheduler.service.ts` (1036→486 lignes, [#612](https://github.com/Tallec7/neopro/pull/612) — extraction des 7 task executors). Reviews de PR plus rapides, scope cognitif clarifié.
- **Règle SAFe morte archivée** ([#609](https://github.com/Tallec7/neopro/pull/609)) — `.claude/rules/safe-update.md` n'avait jamais été appliquée (735 commits sans MAJ auto). Moins de bruit dans chaque session Claude.
- **2 nouveaux ADR documentés** : ADR-096 (split socket.service via handler dédié), ADR-097 (split cron-scheduler via cron-tasks/ modules).
- **ADR-098 — observabilité vidéos orphelines** ([#621](https://github.com/Tallec7/neopro/pull/621)) — documente la stratégie "compteur temps réel + audit FTP CRON 24h" issue de l'incident NLF (PRs #613-618). Garantit qu'on ne reviendra pas sur la décision sans avoir vu les alternatives rejetées (webhook FTP, CRON horaire).
- **Util `jsonb-references` factorisé** ([#623](https://github.com/Tallec7/neopro/pull/623)) — pattern `JSONB::text ILIKE` utilisé pour la cascade DELETE vidéo (config_profiles + sites.local_config_mirror) extrait dans un util testé. Au prochain incident similaire (advertiser, sponsor, campaign), une nouvelle sonde se plug en 5 lignes au lieu de 25.
- **Conventions de session formalisées** ([#XXX, cette PR](https://github.com/Tallec7/neopro)) — CLAUDE.md augmenté de 7 blocs (worktree dédiée, Story Card, format de réponse, préfixes d'impact, garde-fous, etc.). Toutes les sessions Claude parallèles seront alignées.
- **Format SPEC métier introduit** — `docs/specs/` avec 1 SPEC pilote sur les sessions match. Permet de capturer les règles métier vivantes sans dériver comme SAFe.
- **Garde-fou couverture tests stabilisé** ([#622](https://github.com/Tallec7/neopro/pull/622)) — tout nouveau service backend doit avoir au moins 1 test. 23 services legacy grandfatherés via allowlist gelée. Empêche le seuil de couverture (41%) de dériver à la baisse à chaque ajout, prépare le ratchet vers 60%+.
- **Build dashboard : 11 erreurs TS éliminées** ([#636](https://github.com/Tallec7/neopro/pull/636)) — `ng build central-dashboard` remontait 11 diagnostics TS (3 causes racines) sur le Studio Player Remotion à cause de `@types/react` / `@types/react-dom` absents du `package.json` racine. Dette révélée après le cleanup Supabase ([#633](https://github.com/Tallec7/neopro/pull/633)). +2 lignes en devDependencies, alignées sur `templates-remotion/`. Karma 580/580.
- **Cas d'usage / scénarios produit formalisés** ([#662](https://github.com/Tallec7/neopro/pull/662)) — nouveau doc `docs/product/USE-CASES.md` qui comble le chaînon entre les personae (qui) et les SPECs (comment ça marche techniquement). Inspiré des agences de user research : 11 Jobs-to-be-Done en 4 clusters + 6 scénarios chronologiques multi-acteurs (matchday NLF, onboarding club, vente sponsoring, incident prod samedi soir, gala VIP, annonceur national). Un futur PM jour 1 peut désormais reconstituer un parcours réel avant de prioriser un backlog, et chaque nouvelle feature peut se valider contre ≥1 scénario existant.

---

<!-- Template pour les semaines suivantes :

## Semaine N — DD-DD Mois YYYY

### 🎯 Pour le club
- (ou "Aucun changement visible utilisateur")

### 🛡️ Pour la robustesse
- ...

### 🧹 Pour l'équipe
- ...

-->
