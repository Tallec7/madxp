# ADR-137: Un écran porte sa géométrie ; la résolution est dérivée, jamais saisie

**Date** : 2026-08-10
**Statut** : Accepté
**Format** : Léger

> Lié à : [PROP-014](../proposals/PROP-014-led-perimeter-content-pipeline.md) (§1, §3, §8), [ADR-134](ADR-134-led-perimeter-render-directly-folded.md), [ADR-135](ADR-135-led-perimeter-per-side-zones.md), [ADR-037](ADR-037-saas-mode-architecture.md) (sites sans Pi).
> Maquette de référence : `docs/proposals/assets/led-mockups/03-parcours-simplifie-ecrans-led.html`.
> Décision **partielle** : traite le modèle d'écran et l'UX. L'unification de la géométrie de pliage (« toujours par côté ») et le contrôle de compatibilité du signal restent à venir, et dépendent du SPIKE-003 matériel.

---

## Contexte

Le modèle d'écran mélangeait trois choses distinctes, ce qui rendait la LED périmétrique illisible pour un opérateur — et parfois mensongère.

**1. `resolution` était tantôt une vérité, tantôt une décoration.** C'était une chaîne littérale figée par gabarit (`displays-editor.component.ts`). Pour `led-perimeter` elle valait `'1920x1120'`, une valeur **fausse dès que l'opérateur touchait un côté** — le canvas réel se dérive du profil (côtés × pitch → bandes × hauteur). Elle fuyait jusque dans l'aide à l'upload côté Contenu (« Format recommandé »), où un club lisait une cible qui ne correspondait à aucun terrain réel.

**2. L'index valait pour un type et pour une source.** L'écran `#0` avait son type en lecture seule et un badge « 🖥️ Pi HDMI » affiché en dur sur `display.index === 0`. Or PROP-014 §1 note que le ruban est « parfois branché en HDMI primaire » — un club LED-en-primaire était indécrivable. Pire : **les deux seuls sites LED en production sont `site_type='saas'`, sans aucun Pi** (relevé DB 2026-08-10), donc le badge mentait sur 100 % du parc concerné.

**3. `zones` était un champ mort.** Déclaré dans le schéma Joi et dans les modèles, écrit en base (`'uniform'` sur les deux sites), **lu par personne** — vérifié : 0 consommateur dans `central-server/src`, `raspberry/src` et `central-dashboard/src`. Le « contenu par côté » avait déménagé sur la variante d'une vidéo (révision ADR-135) sans que le champ soit purgé.

## Décision

**Un écran déclare sa géométrie dans ses unités naturelles ; sa résolution effective en est toujours dérivée.**

1. **`resolution` devient une valeur calculée à l'affichage** (`getDisplayResolution()`), pour tous les types. Une TV la dérive d'un standard choisi dans une liste ; un ruban LED la dérive de son profil. Pour les types dérivés, **plus rien n'est persisté** (`DISPLAY_TEMPLATES.resolution = null`) : une valeur figée en base ne peut plus devenir périmée. La LED cesse d'être un cas spécial — c'est un type dont les unités sont mètres + pitch au lieu de pixels.

2. **L'index ne décrit que la sortie ; le type est éditable sur tous les écrans, `#0` compris.** Le profil LED suit le type : créé en entrant sur `led-perimeter`, retiré en sortant (pas de profil orphelin). Un type personnalisé reste proposé dans la liste pour ne pas être perdu silencieusement.

3. **Aucun champ « source » n'est ajouté, et le badge « Pi HDMI » est retiré.** Un écran ne sait pas qui le pilote. La distinction Pi / pas-Pi existe déjà une fois, au bon niveau : `site_type`, que le déploiement consomme (`update-deployment.service.ts`). La dupliquer par écran réintroduirait le couplage qu'on retire.

4. **`zones` est retiré du schéma et des modèles.** Il n'est pas re-déclaré : `stripUnknown: true` du middleware `validate()` le retire silencieusement des payloads legacy — **pas de 400**, et le champ disparaît de la DB à la première réécriture des displays. Dépréciation sans migration.

5. **La géométrie LED est extraite dans un util partagé** (`core/utils/led-geometry.ts`) plutôt que dupliquée entre `displays-editor` et `video-variant-panel`. La source de vérité reste `led-fold.service.ts` côté serveur ; l'util en est une transposition d'affichage (même contrainte de frontière de bundle que la composition Remotion, ADR-134).

## Alternatives rejetées

- **Ajouter un champ « source » par écran (Pi / Fire Stick / PC).** Rejeté après revue : le modèle d'écran est déjà agnostique du Pi (write-through `sites.displays` → config SaaS), et ce qui contraint réellement le rendu est **le signal émis**, pas la marque du boîtier. Un PC, un Pi 5 et un Fire Stick 4K sortent tous du 4K. Enumérer des appareils, c'est deviner du matériel qu'on ne contrôle pas.
- **Recalculer et persister `resolution` à chaque édition du profil.** Rejeté : deux états à faire diverger, pour zéro gain — la dérivation à l'affichage est exacte par construction.
- **Migration SQL pour purger `zones` du JSONB.** Rejeté : `stripUnknown` le fait gratuitement à la première écriture, sans risque sur un JSONB de production.
- **Supprimer `resolution` du modèle.** Rejeté : elle reste la façon naturelle de dire « Full HD » pour une TV. C'est sa **fixation en dur pour un type dérivé** qui était le bug, pas le champ.

## Conséquences

- ✅ Le badge de résolution dit toujours la vérité, y compris l'aide à l'upload d'un club — qui affiche désormais le **ruban déroulé** du terrain, la cible que `validateLedFormat` juge côté serveur.
- ✅ Un club dont le ruban est en sortie principale est enfin descriptible.
- ✅ Zéro impact Pi et zéro impact déploiement : `displays[].resolution` n'a **aucun lecteur côté `raspberry/`** (vérifié — les occurrences y concernent la résolution EDID lue par `hdmi.service.js`, un autre objet). Changement purement dashboard + schéma.
- ⚠️ Un client dashboard non rafraîchi peut encore envoyer `zones` : accepté et strippé, pas d'erreur.
- ⚠️ La géométrie reste dupliquée entre le serveur (`led-fold.service.ts`) et le dashboard (`led-geometry.ts`). Consolidée d'un côté à l'autre, mais pas unifiée — le partage de code cross-bundle reste hors périmètre.
- ❌ **Non traité ici** : la géométrie de pliage dépend encore du contenu (uniforme vs par côté). Verrouillé en attendant par le garde-fou `smoke-led-canvas-invariant` — voir `.claude/rules/led.md`.

## Fichiers impactés

- `central-dashboard/src/app/core/utils/led-geometry.ts` — **nouveau**, géométrie partagée.
- `central-dashboard/src/app/features/sites/components/site-settings-tab/displays-editor/displays-editor.component.ts` — résolution dérivée, `<select>` de type, retrait du badge Pi.
- `central-dashboard/src/app/features/content/video-variant-panel.component.ts` / `.html` — « Format recommandé » dérivé du terrain.
- `central-dashboard/src/app/core/models/index.ts` — retrait de `zones`.
- `central-server/src/middleware/validation.ts` — retrait de `zones` du schéma `updateDisplays`.
- `central-server/src/types/index.ts` — retrait de `zones` de `LedProfileConfig`.
