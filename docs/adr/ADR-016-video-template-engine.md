# ADR-016: Moteur de Templates Vidéo

**Date** : Février 2026
**Statut** : Proposé
**Décideurs** : À déterminer

---

## Contexte

Aujourd'hui, Neopro permet de convertir une image en vidéo (avec fond flou optionnel). Mais le résultat est basique : l'image affichée pendant X secondes.

Les chargées de com' des clubs veulent un résultat plus professionnel : logo du club, couleurs du club, animations, texte. Aujourd'hui, elles doivent passer par un graphiste ou Canva pour créer ces visuels habillés.

**Objectif** : Permettre de créer une vidéo sponsor professionnelle directement dans Neopro, sans outil externe, en déposant simplement le visuel du sponsor.

## Décision

À prendre. Trois options sur la table.

## Options

### Option A : ffmpeg côté serveur (filter_complex)

**Principe** : Utiliser ffmpeg avec des filtres complexes pour superposer logo club, texte, cadre sur l'image sponsor.

```bash
ffmpeg -i sponsor.jpg -i logo_club.png \
  -filter_complex "[0]scale=1280:720[bg]; \
    [bg][1]overlay=10:10[out]" \
  -map "[out]" output.mp4
```

**Avantages** :
- Déjà utilisé pour image-to-video (compétence existante)
- Rendu serveur = résultat identique partout
- Pas de dépendance navigateur

**Inconvénients** :
- **Mémoire** : Railway 512MB, ffmpeg gourmand (voir ADR-015)
- Pas de prévisualisation live (render → preview → ajuster → re-render)
- Animations limitées (ffmpeg ≠ After Effects)
- Templates = fichiers de config ffmpeg complexes à maintenir

**Estimation effort** : Moyen
**Risque technique** : Contrainte mémoire Railway

### Option B : Canvas/HTML côté navigateur + capture

**Principe** : Le dashboard affiche un éditeur HTML/Canvas. L'utilisateur place les éléments visuellement. Le résultat est capturé en vidéo via `MediaRecorder` ou envoyé au serveur pour rendu.

```typescript
// Éditeur dans le navigateur
const canvas = document.createElement('canvas');
ctx.drawImage(sponsorImage, x, y, w, h);
ctx.drawImage(clubLogo, 10, 10, 80, 80);
ctx.fillText('PARTENAIRE OFFICIEL', 640, 680);
```

**Avantages** :
- **Prévisualisation live** : WYSIWYG, l'utilisateur voit le résultat en temps réel
- Animations CSS/Canvas riches
- Pas de charge serveur pour la preview
- Expérience proche de Canva

**Inconvénients** :
- La capture vidéo depuis Canvas est complexe (codecs, performance)
- Le rendu final doit quand même passer par le serveur (uniformité)
- Plus de code frontend à maintenir
- Compatibilité navigateur variable

**Estimation effort** : Élevé
**Risque technique** : Complexité capture vidéo cross-browser

### Option C : Service tiers (Creatomate, Shotstack, Bannerbear)

**Principe** : Utiliser une API SaaS spécialisée dans la génération de vidéos à partir de templates.

```typescript
const result = await creatomate.render({
  template: 'sponsor-card-v1',
  modifications: {
    'sponsor-image': sponsorUrl,
    'club-logo': clubLogoUrl,
    'club-name': 'FC Nantes'
  }
});
```

**Avantages** :
- **Qualité pro** : Templates de qualité studio
- Zéro infrastructure à gérer
- Animations complexes possibles
- Prévisualisation via API

**Inconvénients** :
- **Coût** : ~$0.10-0.50 par rendu → 1000 rendus/mois = $100-500/mois
- Dépendance externe (SaaS)
- Latence réseau pour le rendu
- Personnalisation limitée aux capacités de l'API

**Estimation effort** : Faible (intégration API)
**Risque technique** : Coût et dépendance

## Critères de décision

| Critère | Poids | Option A (ffmpeg) | Option B (Canvas) | Option C (SaaS) |
|---------|-------|-------------------|-------------------|-----------------|
| Coût | 30% | ✅ Gratuit | ✅ Gratuit | ❌ $100-500/mois |
| Qualité rendu | 25% | ⚠️ Basique | ✅ Riche | ✅ Pro |
| Preview live | 20% | ❌ Non | ✅ Oui | ⚠️ Via API |
| Effort dev | 15% | ⚠️ Moyen | ❌ Élevé | ✅ Faible |
| Mémoire serveur | 10% | ❌ Risque 512MB | ✅ Client-side | ✅ Externe |

## Recommandation

**Option B (Canvas navigateur)** avec rendu final ffmpeg serveur :
- Preview et édition dans le navigateur (zéro coût, UX riche)
- Export des paramètres (positions, tailles, textes) vers le serveur
- Rendu final ffmpeg avec les mêmes paramètres (uniformité)
- Commencer simple (2-3 templates) et itérer

## Références

- [image-to-video.service.ts](../../central-server/src/services/image-to-video.service.ts) - Service existant
- ADR-015 : Contraintes mémoire Railway

---

*Créé le 11 février 2026*
