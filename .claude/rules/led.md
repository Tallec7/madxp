# LED périmétrique — Invariants (ADR-134 / ADR-135)

Source de vérité : [ADR-134](../../docs/adr/ADR-134-led-perimeter-render-directly-folded.md),
[ADR-135](../../docs/adr/ADR-135-led-perimeter-per-side-zones.md),
[led-perimeter.spec.md](../../docs/specs/features/led-perimeter.spec.md).

## L'invariant central

**Le canvas processeur ne dépend QUE de la géométrie du site, jamais du contenu diffusé.**

Un processeur LED (Novastar/Colorlight) est configuré **une seule fois à l'installation**,
pixel à pixel. Émettre tantôt un canvas, tantôt un autre, rend le second immappable —
ruban noir ou décalé, un soir de match.

Or aujourd'hui la géométrie est choisie par le CONTENU :
`led-export-worker.service.ts` branche sur `side_files.length > 0` entre le pliage
continu (`computeRibbonDimensions` + `computeFoldGeometry`) et le pliage par côté
(`computeFoldGeometryPerSide`), qui ne donnent pas le même nombre de bandes.

C'est sans conséquence **tant que le pliage n'est pas dans le chemin de diffusion**.
Il ne l'est pas : `config-secondary-variants.ts` injecte le `storage_path` brut de la
variante. Le pliage ne sert qu'au bouton « Exporter le MP4 plié » et au banc d'essai.

## NE JAMAIS FAIRE (smoke test enforced)

- **Importer `led-fold.service` ou `led-export-worker.service` depuis
  `utils/config-secondary-variants.ts`** — ni y appeler `computeFoldGeometry*` /
  `applyPerSideFold` / `applyFoldExport`. C'est le câblage de l'**étape D** d'ADR-135
  (diffuser le canvas composé), et il ne peut pas être fait tant que la divergence de
  géométrie existe. Le site **Saas Lanester HB** a `canvas_in.band_count = 1` figé par
  un installateur : le passer en par-côté doublerait la hauteur du canvas (110 → 220 px)
  face à un processeur gravé pour 110.
- **Retirer `if (!v.storage_path && !v.filename) continue;`** de
  `config-secondary-variants.ts` — une variante « par côté pure » n'a ni `storage_path`
  ni `filename` ; l'injecter produit un chemin `videos-led-perimeter/null` → MP4 noir.
- **Consommer `applyPerSideFold` / `computeFoldGeometryPerSide` ailleurs que dans
  `led-export-worker.service.ts`** (et les scripts CLI/POC). Un nouveau consommateur en
  production = étape D qui se câble par la bande.

## État du parc (vérifié en DB prod le 2026-08-10)

**2 sites** ont un display `type='led-perimeter'`, **les deux en `site_type='saas'`
(aucun Pi)** :

| Site                   | Côtés     | Pitch | Px / côté | Bandes                 |
| ---------------------- | --------- | ----- | --------- | ---------------------- |
| Saas Lanester HB       | 2 × 4,8 m | P10   | 480       | 1 (uniforme, **figé**) |
| Piraths Strasbourg ATH | 4 × 10 m  | P6.25 | 1600      | 4 (provisoire)         |

**Aucun côté ne dépasse `band_width` (1920).** Le pliage est un no-op fonctionnel pour
tout le parc installé — le ruban handball 80 m / 13 333 px qui justifie ADR-134 n'a
aucun client. Ne pas étendre le moteur de pliage tant qu'un club réel n'a pas un côté
plus large que 1920 px. Le SPIKE-003 matériel (mode A vs B) n'a pas avancé, matériel
non commandé.

## Quand ce garde-fou doit être révisé

Le smoke `smoke-led-canvas-invariant.test.ts` est un **tripwire** : il verrouille la
divergence actuelle. Il doit échouer — et être revu sciemment, dans la même PR — le jour où :

- on unifie la géométrie (« toujours plier par côté », `canvas_in` dérivé du seul profil) ;
- ou on câble réellement l'étape D après validation matérielle.

## Référence

- Smoke : `central-server/src/__tests__/smoke/smoke-led-canvas-invariant.test.ts`
- Maquette du parcours cible : `docs/proposals/assets/led-mockups/03-parcours-simplifie-ecrans-led.html`
