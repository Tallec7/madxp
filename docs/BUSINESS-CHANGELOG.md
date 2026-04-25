# Business Changelog Neopro

> Récap hebdomadaire des PRs en langage métier. Lecture en 1 minute le vendredi pour avoir le pouls.
>
> Format : 1 entrée par semaine, 3 buckets (🎯 Pour le club / 🛡️ Pour la robustesse / 🧹 Pour l'équipe), 1 bullet par PR avec n° citée.
>
> Convention : ne PAS créer d'entrée pour une session qui ne ship rien (exploration, debug pur, etc.).

---

## Semaine 17 — 21-27 Avril 2026

> Audit Lead Dev complet par Claude. Note projet : 78/100 → potentiel 85+ après merge des PRs ouvertes.

### 🎯 Pour le club (NLF, prospects)

- Aucun changement visible utilisateur
  (sessions techniques d'audit + refactor d'infra + cleanup process)

### 🛡️ Pour la robustesse / production

- **Memory leak SaaS corrigé** ([#600](https://github.com/Tallec7/neopro/pull/600)) — évite les redémarrages Railway intempestifs après plusieurs jours d'uptime sur sites SaaS multi-clients.
- **Backup task : alerte explicite** ([#600](https://github.com/Tallec7/neopro/pull/600)) — si quelqu'un croit avoir un backup CRON qui tourne, on le sait maintenant (avant : faux positif "success" silencieux dangereux).
- **Notifications Slack quand un objectif club est à risque** ([#612](https://github.com/Tallec7/neopro/pull/612)) — alerte groupée par site (1 message Slack par site, liste des objectifs <50% de progression). Activable via `SLACK_WEBHOOK_URL`.

### 🧹 Pour l'équipe (toi + futurs devs)

- **2 fichiers monstres splittés** : `socket.service.ts` (1263→991 lignes, [#607](https://github.com/Tallec7/neopro/pull/607) — extraction du SaaS relay) et `cron-scheduler.service.ts` (1036→486 lignes, [#612](https://github.com/Tallec7/neopro/pull/612) — extraction des 7 task executors). Reviews de PR plus rapides, scope cognitif clarifié.
- **Règle SAFe morte archivée** ([#609](https://github.com/Tallec7/neopro/pull/609)) — `.claude/rules/safe-update.md` n'avait jamais été appliquée (735 commits sans MAJ auto). Moins de bruit dans chaque session Claude.
- **2 nouveaux ADR documentés** : ADR-096 (split socket.service via handler dédié), ADR-097 (split cron-scheduler via cron-tasks/ modules).
- **ADR-098 — observabilité vidéos orphelines** ([#621](https://github.com/Tallec7/neopro/pull/621)) — documente la stratégie "compteur temps réel + audit FTP CRON 24h" issue de l'incident NLF (PRs #613-618). Garantit qu'on ne reviendra pas sur la décision sans avoir vu les alternatives rejetées (webhook FTP, CRON horaire).
- **Util `jsonb-references` factorisé** ([#623](https://github.com/Tallec7/neopro/pull/623)) — pattern `JSONB::text ILIKE` utilisé pour la cascade DELETE vidéo (config_profiles + sites.local_config_mirror) extrait dans un util testé. Au prochain incident similaire (advertiser, sponsor, campaign), une nouvelle sonde se plug en 5 lignes au lieu de 25.
- **Conventions de session formalisées** ([#XXX, cette PR](https://github.com/Tallec7/neopro)) — CLAUDE.md augmenté de 7 blocs (worktree dédiée, Story Card, format de réponse, préfixes d'impact, garde-fous, etc.). Toutes les sessions Claude parallèles seront alignées.
- **Format SPEC métier introduit** — `docs/specs/` avec 1 SPEC pilote sur les sessions match. Permet de capturer les règles métier vivantes sans dériver comme SAFe.

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
