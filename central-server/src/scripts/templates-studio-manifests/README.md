# Templates Studio V1 — vendored manifests

> ⚠️ Source de vérité : `studio-template/templates-remotion/src/templates/<slug>/manifest.json`
> (repo séparé). Les fichiers présents ici sont des **copies vendored** lues par
> `seed-templates-studio-manifests.ts` au boot du central-server.

## Workflow actuel (manuel, V1)

1. Un designer édite `Composition.tsx` + `manifest.json` dans le repo `studio-template/`.
2. Au moment de déployer la nouvelle version, on **copie manuellement** le `manifest.json`
   modifié dans ce dossier (`cp` vers `central-server/src/scripts/templates-studio-manifests/`).
3. Le commit inclut la mise à jour de `manifest_json`/`version` dans la PR neopro.
4. Au prochain boot de l'API, `seed-templates-studio-manifests.ts` upsert dans `template_definitions`.

## TODO V2 — automatiser

- [ ] Option A : git submodule `studio-template/` côté neopro, scan direct
- [ ] Option B : publier studio-template comme npm package, import natif
- [ ] Option C : étape Docker build qui clone le repo et copie les manifests

À trancher quand on passera de 3 templates V1 à ~10 — au-delà, la copie manuelle devient une source d'erreurs (oublier de bump la version, désynchro avec le `.tsx`).

## Règle de versioning (cf STUDIO_V1.md §5)

- Un template existant en prod : **ne jamais** modifier un binding ou un `compositionId`.
- Breaking change : nouveau slug (`but_generique` → `but_generique_v2`) + nouveau fichier ici.
- Les anciennes rows `template_definitions` restent (FK depuis `render_requests.template_id`),
  passées en `is_active = false` par l'upsert si le slug n'est plus présent dans le dossier.
