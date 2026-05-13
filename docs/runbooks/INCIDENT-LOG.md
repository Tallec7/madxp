# Incident Log

> Tracking des incidents prod. 1 ligne par incident, complété après chaque fix.
> Cf. template session : `docs/internal/prompts/incident.md`

## Format

```
| Date       | Sév | Durée  | Scope       | Cause racine                    | Fix PR  | Test régression                              |
| ---------- | --- | ------ | ----------- | ------------------------------- | ------- | -------------------------------------------- |
| YYYY-MM-DD | P1  | 1h36   | NLF (1 site)| PR #XXX casse SaaS displays     | PR #YYY | smoke-saas-incident-YYYY-MM-DD.test.ts       |
```

### Convention test régression

Tout incident P0/P1 → créer un smoke test nommé :

```
central-server/src/__tests__/smoke/smoke-<domaine>-incident-<YYYY-MM-DD>.test.ts
```

Exemples : `smoke-saas-incident-2026-05-08.test.ts`, `smoke-sync-incident-2026-04-15.test.ts`

Le test doit échouer si le bug revenait. Citer le test dans le commit du fix.

---

## Sévérités

- **P0** : prod totalement down, > 50% flotte — fix autorisé après 21h
- **P1** : prod dégradée ou client critique (NLF) impacté, < 50% flotte
- **P2** : feature spécifique cassée, < 10% flotte
- **P3** : bug visible mais sans impact bloquant

---

## Historique

| Date       | Sév | Durée                                     | Scope                        | Cause racine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fix PR  | Test régression                            |
| ---------- | --- | ----------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------ |
| 2026-05-08 | P1  | 1h36                                      | NLF (1 site)                 | PR #935 casse resolvedConfig SaaS variants/displays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PR #939 | ⚠️ à créer                                 |
| 2026-05-10 | P1  | 30min                                     | RACC (1 site, risque flotte) | OTA déploie nouveaux symlinks nginx (`neopro-base`, `neopro-hls`, `firestick-captive`) sans supprimer le legacy `/etc/nginx/sites-enabled/neopro` créé par install.sh historique → `duplicate default_server` → nginx down → TV + portail captif HS. Cache `/var/cache/nginx/neopro_videos` requis par neopro-hls.conf jamais créé.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | PR #956 | smoke-pi-nginx-cleanup-incident-2026-05-10 |
| 2026-05-13 | P1  | en cours (≥ 2h45 au moment du diagnostic) | NLF (1 site)                 | ADR-117 / PR #972 — hook `triggerMissingVideoDeployments` déclenché par sauvegarde profil KBC sur NLF ce matin 06:37 UTC. Le throttle initial (`MAX_AUTO_DEPLOY = 10` par appel) ne couvrait pas le cumul : appels rapprochés `deployProfile` + `updateProfileConfiguration` × amplification master+secondary variant LED → **34 deploys sériés en 2min30s**. CPU Pi : 0.9% → 8.8% (×10). `neopro-app` crashe à 06:45:11 UTC (1 sec après le 35e deploy `bef2f83a`, qui reste `in_progress`). `neopro-sync-guardian` ne surveille que `neopro-sync-agent`, donc `neopro-app` ne se relève pas. Sync-agent HTTP polling survit 2h (jusqu'à 08:40 UTC) puis silence total. Remise en ligne nécessite accès physique au Pi (reboot ou `systemctl restart neopro-app`).                                                                                                                                                                                                                                                                    | PR #977 | smoke-adr-117-incident-2026-05-13          |
| 2026-05-13 | P0  | en cours (≥ 14h cumul flotte)             | flotte entière (côté cloud)  | **Quota Upstash Redis épuisé (500 000 req/mois)** → `Redis pub/sub client error: ERR max requests limit exceeded` en boucle dans le central-server. L'adapter Socket.IO Redis (utilisé pour scale horizontal mais inutile sur 1 replica Railway) wrappe les broadcasts internes en pub/sub Redis → les events applicatifs `authenticate` et `heartbeat` sont droppés silencieusement → **aucun bump de `sites.last_seen_at` ni d'insertion dans `connection_events` depuis 2026-05-12 20:34 UTC**. Tous les Pi qui essaient de se reconnecter restent `Hors ligne` côté dashboard alors que TCP+Socket.IO low-level passent. Aggravé par un fallback bogué (`socket.service.ts:283-291`) qui n'appelait pas `removeAllListeners('error')` avant `quit()` → les clients Redis morts gardaient leurs handlers d'erreur et continuaient à logger en boucle. **NB** : avant de remonter à Redis, on a perdu ~1h sur une fausse piste apiKey hash/raw (le swap a été propre mais inutile, le pub/sub Redis bloque l'auth handler en amont). | PR #978 | smoke-redis-adapter-incident-2026-05-13    |
