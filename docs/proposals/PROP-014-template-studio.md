# PROP-014 — Template Studio (interne → public freemium)

> **⚠️ Supersédé par [ADR-074](../adr/ADR-074-template-studio.md)** — la décision a été prise et enrichie (couches alpha + slots data-driven + wizard super_admin). Cette proposition est conservée pour historique mais l'ADR est la source de vérité.
>
> Statut : Supersédé · Auteur : Claude + GLT · Date : 2026-04-19
> Epic SAFe : E-05 (Motion / Templates, PI-2)

## Contexte

La page `/content/templates-remotion` permet aujourd'hui aux clubs de générer des visuels à partir de templates Remotion (ButSimple, ButImgJoueur). 2 templates en prod, Gabin en prépare d'autres.

Un bundle Claude Design ([Template Studio](https://api.anthropic.com/v1/design/h/nu5K3WjdsG_4pNel5zRK8A)) propose une UI type "IDE de motion design" (sidebar templates + player 16:9 + props panel sectionné + transport bar + CTA sticky).

**Objectif produit double** :

1. **Interne** : upgrade UX de la page Templates Remotion (espace max player, scrubber, props sectionnés).
2. **Public (phase 2)** : extraire le studio pour neopro.fr → outil freemium de lead-gen (clubs non-Neopro créent un visuel watermarké contre capture email).

## Phase 1 — Cohérence design tokens ✅ FAIT

Les hardcodes violet `#8b5cf6` et variantes ont été remplacés par `var(--primary-color)` (Hockey Dark `#2022E9` du design system Neopro). Fichiers touchés :

- `remotion-templates.component.scss`
- `template-card.component.ts`
- `template-props-form.component.ts`
- `template-schema-editor.component.ts`
- `template-versions.component.ts`

Zéro changement structurel. Impact : un changement de `--primary-color` dans `styles.scss` se répercute désormais sur toute la feature.

## Phase 2 — Restructure galerie + studio full-screen

### Architecture cible

```
/content/templates-remotion              ← galerie (layout dashboard normal)
  ├─ grille des templates (cards existantes)
  ├─ bandeau "Dernières vidéos rendues" (lien vers bibliothèque)
  └─ Click card → navigate

/content/templates-remotion/studio/:id   ← studio full-screen (layout isolé)
  ├─ 3 colonnes : sidebar picker / player central / props panel
  ├─ transport bar sous le player
  ├─ CTA "Générer la vidéo" sticky bottom
  └─ bouton "← Retour à la galerie"
```

### Layout wrapper

Nouveau composant `<studio-layout>` standalone qui désactive la shell globale (topbar + sidebar nav dashboard) pour sa route. Route child dans `app.routes.ts` avec `data: { fullscreen: true }`, intercepté par `LayoutComponent` existant.

### Composants

| Nouveau / Réutilisé | Composant                      | Rôle                                                        |
| ------------------- | ------------------------------ | ----------------------------------------------------------- |
| Réutilisé           | `TemplatePropsFormComponent`   | Form dynamique (schema-driven)                              |
| Réutilisé           | `TemplatePreviewComponent`     | iframe Remotion                                             |
| Réutilisé           | `RemotionTemplatesDataService` | HTTP calls                                                  |
| **Nouveau**         | `StudioLayoutComponent`        | Wrapper full-screen                                         |
| **Nouveau**         | `StudioSidebarComponent`       | Picker templates (replace grid en mode studio)              |
| **Nouveau**         | `StudioTransportBarComponent`  | Play/pause/scrub/replay, branché sur `@remotion/player` ref |
| **Nouveau**         | `StudioContextStripComponent`  | Ligne du haut (ID template, dimensions, fps)                |

### Contraintes

- **Data-driven** : sidebar list vient de `GET /remotion-templates`, zéro hardcode. Nouveau template ajouté par Gabin via code → apparaît auto.
- **Cohérence tokens** : zéro nouvelle couleur hex. Uniquement `var(--…)` du design system.
- **Règle file size** (`feedback_file_size_limit`) : <400 lignes/fichier, splitter proactivement.
- **Pas de `fetch()` direct** (règle dashboard) : tout passe par `ApiService`.
- **Responsive <900px** : 3 colonnes → tabs verticales.

### Estimation

~600 lignes TS + SCSS. 1 ADR léger (choix layout isolé).

## Phase 3 — Scènes / séquences (MAJEUR — à cadrer)

Aujourd'hui : un template = une composition Remotion figée (ex. ButImgJoueur = 5s avec animations fixes).

Cible : un template = suite de **scènes** que l'user peut ajouter/retirer/réordonner. Ex. template "Résumé Match" = scène intro (logo club) + scène N buts (1 par but marqué) + scène score final + scène homme du match.

### Impact cross-composant

| Composant                 | Changement                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **central-server**        | Schéma DB `remotion_templates` étend `schema` JSON pour supporter `scenes: [{ id, type, duration, props }]`. Endpoint `/render` accepte un array de scènes, enqueue un job qui compose dynamiquement.               |
| **Remotion compositions** | Chaque template devient une **meta-composition** `<Series>` Remotion qui lit `scenes[]` et rend les sous-compositions dans l'ordre. Gabin code des **briques** (intro, but, podium, stat joueur…) réutilisables.    |
| **Dashboard**             | Nouveau composant `SceneListComponent` dans le studio : liste drag-reorder des scènes actives + bouton "+ Ajouter scène" (picker depuis la lib de briques). Props panel devient contextuel à la scène sélectionnée. |
| **Durée dynamique**       | Durée template = Σ durées scènes. Transport bar affiche timeline segmentée.                                                                                                                                         |

### Questions ouvertes à trancher avant dev

1. **Qui crée les briques ?** Uniquement Gabin via code Remotion, ou schema editor dashboard permet aussi de créer une brique from scratch ? → Reco : **Gabin code les briques, l'user les compose**. Pas de WYSIWYG true.
2. **Transitions entre scènes** : hardcoded (cut sec) au début, ou configurables (fade, slide, wipe) ? → Reco : **cut sec MVP**, configurables plus tard.
3. **Limite nombre de scènes** : 3 à 10 d'après GLT. Max dur = 60s ? → Reco : **hard limit 12 scènes / 60s** pour contenir les coûts render.
4. **Assets par scène vs globaux** : logo club = global, photo joueur = par scène. Schema doit distinguer. → Reco : **split `globalProps` + `scenes[i].props`**.
5. **Retro-compat** : les templates actuels (ButSimple, ButImgJoueur) passent en mode "1 seule scène" ? → Reco : **oui**, migration DB qui wrappe `schema` existant dans `{ scenes: [{ ...schema }] }`.

### Estimation

**Gros** : ~3-5 jours dev + refacto Remotion compositions par Gabin. ADR complet requis (cross-composant).

## Phase 4 — Public freemium (après Phase 3)

Sous-domaine `studio.neopro.fr` qui monte le même `StudioLayoutComponent` avec flag `mode: 'public'` :

- Rate limit par IP (ex. 3 renders / jour)
- Watermark MP4 forcé (overlay Remotion injecté côté server)
- Lead capture : download MP4 gated par formulaire email
- Templates restreints (ButSimple only ? À décider)
- Tracking conversion → CRM

Pas d'impact sur interne, greffe propre.

## Décisions à valider avec GLT

1. ✅ Cohérence tokens → fait Phase 1
2. ⏳ OK Phase 2 (studio full-screen sous-route) ?
3. ⏳ Phase 3 reco "Gabin code les briques, user compose" → acceptable ?
4. ⏳ Phase 4 freemium : objectif timeline (MVP Q3 ? Q4 ?)

## Non-goals (explicites)

- Pas de palette noir/or du proto Claude Design (on garde les tokens dashboard)
- Pas de WYSIWYG de création de brique Remotion (reste du code Gabin)
- Pas de timeline multi-pistes façon Premiere
- Pas de mobile natif (web responsive suffit)

## Références

- Bundle design : `/tmp/design-studio/template-design-neopro/` (expiré, backup si besoin)
- ADR-054 : Remotion async render
- ADR-055 : Template versions
- PROP-004 : Video template engine (parent conceptuel)
- PROP-009 : Motion design personnalisé (overlap à vérifier)
