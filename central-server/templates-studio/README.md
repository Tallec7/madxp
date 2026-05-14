# Templates Studio — Compositions Remotion

> Code Remotion (compositions + manifests + assets) consommé in-process par
> `central-server/src/services/studio-render-worker.service.ts`.

## Structure

```
central-server/templates-studio/
  index.ts                       Entry point Remotion (registerRoot)
  Root.tsx                       Registre des <Composition>
  templates/
    <slug>/
      manifest.json              Contrat déclaratif (input schema, bindings, format)
      Composition.tsx            Composant React/Remotion
  public/                        Assets statiques (logos, fonts, masks, vidéos)
  remotion.config.ts             Config Remotion (codec, browser, etc.)
  tsconfig.json                  Config TypeScript du sous-package
  package.json                   Deps Remotion isolées (bundlées séparément)
```

## Pourquoi un sous-package ?

Le code Remotion utilise `react`, `react-dom`, `@remotion/cli` qui ne sont pas
nécessaires au backend Express. Les isoler dans un `package.json` séparé évite :

- D'alourdir le `node_modules` du central-server runtime
- De faire compiler les `.tsx` par le `tsc` principal du backend
- Les conflits potentiels de versions React entre Remotion et d'éventuelles
  futures deps du central

Au runtime Docker, le sous-package est résolu à `/app/templates-studio/` avec
son propre `node_modules` (cf. stage `templates-studio-deps` du
`central-server/Dockerfile`).

## Ajouter un template

Voir le guide complet : [`docs/templates/STUDIO-PORTING-GUIDE.md`](../../docs/templates/STUDIO-PORTING-GUIDE.md).

Résumé :

1. `mkdir templates/<slug>` + écrire `manifest.json`
2. Écrire `Composition.tsx` (composant React qui reçoit les bindings résolus)
3. Enregistrer dans `Root.tsx` avec un `<Composition id="...">`
4. Le `compositionId` du manifest **doit matcher** l'`id` du `<Composition>`

## Tester en local

```bash
cd central-server/templates-studio
npm install
npm run studio
# → ouvre Remotion Studio sur http://localhost:3000 (preview live)
```

Pour tester le pipeline complet (avec l'API `/api/templates-studio/render-requests`) :
démarre le central-server (`cd central-server && npm run dev`) qui consomme ce
package via le worker render in-process.
