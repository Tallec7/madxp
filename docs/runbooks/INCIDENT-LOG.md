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

| Date       | Sév | Durée | Scope                        | Cause racine                                                                                                                                                                                                                                                                                                                        | Fix PR  | Test régression                            |
| ---------- | --- | ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------ |
| 2026-05-08 | P1  | 1h36  | NLF (1 site)                 | PR #935 casse resolvedConfig SaaS variants/displays                                                                                                                                                                                                                                                                                 | PR #939 | ⚠️ à créer                                 |
| 2026-05-10 | P1  | 30min | RACC (1 site, risque flotte) | OTA déploie nouveaux symlinks nginx (`neopro-base`, `neopro-hls`, `firestick-captive`) sans supprimer le legacy `/etc/nginx/sites-enabled/neopro` créé par install.sh historique → `duplicate default_server` → nginx down → TV + portail captif HS. Cache `/var/cache/nginx/neopro_videos` requis par neopro-hls.conf jamais créé. | PR #956 | smoke-pi-nginx-cleanup-incident-2026-05-10 |
