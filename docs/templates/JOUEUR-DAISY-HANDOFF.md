# Handoff Daisy — chantier templates JOUEUR

> Version courte : 2 items minimum bloquants. Le reste je gère.

---

## Le strict minimum (2 items)

### 1. Les 8 WebM alpha

1920×1080 @ 25fps, format WebM avec canal alpha (transparence).

```
Joueur Simple (durée totale 5'24 = 5960 ms) :
  ├─ 01-A-hexagone.webm
  └─ 02-B-transition.webm

Joueur But (durée totale 6'24 = 6960 ms) :
  ├─ 01-A-hexagone.webm
  ├─ 02-B-transition.webm
  ├─ 03-C-titre.webm
  └─ 04-D-transition.webm

Packshots (durée à mesurer) :
  ├─ packshot-generique.webm
  └─ packshot-img.webm
```

→ Drive / Hostinger / upload Slack, comme tu préfères.

### 2. Confirm `ComicSans` (PDF page 5)

Sur `PACKSHOT_IMG`, le nom-club tu as écrit **"ComicSans bold majuscules"**.

J'ai pris l'hypothèse que c'est une typo pour **GeneralSans** (cohérent
avec PACKSHOT_GENERIQUE et la charte tech). **Si c'est faux**, dis-moi
et je reverter en 30 secondes. Sinon ✅ on garde GeneralSans.

---

## Tout le reste, je gère

| Item | Comment je m'arrange |
|---|---|
| Mesures safe zones (hexagone + photo) | Je mesure moi-même sur les WebM (VLC frame + screenshot Figma proxy). Frame-compare nous dira si écart. |
| Fonts `.otf` (Bulevar + GeneralSans) | Web fonts proxies en attendant (Anton + Oswald, lookalikes). Frame-compare → on bascule sur les .otf si écart visible. |
| Licences fonts web | Confirmation verbale Slack suffit, pas besoin du PDF de licence pour ship. |
| Délai cible | J'enchaîne JOUEUR Simple → But, ordre alpha. Si tu veux prioriser autrement, ping-moi. |
| Client cible | Je publie en `published` accessible à toute la flotte. Tu peux restreindre via l'UI super_admin si besoin. |

---

## Tu peux tester DÈS MAINTENANT (sans rien livrer)

POC auto-crop sur tes photos détourées :

```bash
git worktree add ../neopro-bbox feat/template-options-crud-and-cleanup
cd ../neopro-bbox/central-server && npm install
npm run template:preview-bbox
# → http://localhost:3030 → drag-drop tes PNG
```

Ou via l'UI dashboard live : https://feat-template-versioning-and.neopro-exg.pages.dev → login super_admin → Templates Remotion → bouton **🛠 Outils JOUEUR** → onglet Auto-crop.

Si le rectangle rouge cadre bien tes photos, on est bons. Sinon je tune.

---

## Séquence post-livraison (J+0 → J+5)

| Jour | Action |
|---|---|
| **J+0** | Tu livres les 8 WebM + dis si ComicSans était voulu ou pas |
| **J+1** | J'importe via `npm run template:import` sur staging |
| **J+2** | Frame-compare visio 30 min (toi + moi) |
| **J+3-4** | J'ajuste si écarts visuels |
| **J+5** | Publish v1.0 + push prod |

**Total** : ~1 semaine entre ta livraison et le push prod.

---

## Refs

- [JOUEUR-SPEC-GLOBAL.md](JOUEUR-SPEC-GLOBAL.md) — vue d'ensemble + invariants
- [HOWTO-CONFIGURE-OPTIONS.md](HOWTO-CONFIGURE-OPTIONS.md) — config options + packshot pluggable
- [PR #766](https://github.com/Tallec7/neopro/pull/766) → [PR #775](https://github.com/Tallec7/neopro/pull/775) — stack 5 PRs

Ping-moi quand tu as les WebM. ✌️
