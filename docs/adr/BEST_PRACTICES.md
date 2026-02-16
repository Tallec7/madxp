# Bonnes pratiques ADR - Neopro

> Quand, pourquoi et comment documenter les décisions techniques.

## Le problème

Sans cadre clair, deux dérives :

1. **Sur-documentation** : un ADR pour chaque choix, personne ne les lit
2. **Sous-documentation** : décisions prises en session (chat, réunion, pair-programming) qui disparaissent sans trace

L'objectif est de trouver le bon niveau de traçabilité pour chaque type de décision.

---

## Quand créer un ADR ?

### Grille de décision

```
La décision est-elle...

  ┌─ Irréversible ou coûteuse à changer ?          ──→ ADR complet
  ├─ Cross-composant (Pi + API + Dashboard) ?       ──→ ADR complet
  ├─ Un choix entre alternatives viables ?          ──→ ADR complet ou léger
  ├─ Locale à un module avec impact limité ?        ──→ ADR léger ou commit
  └─ Triviale / un seul choix évident ?             ──→ Commit message
```

### Matrice détaillée

| Type de décision                       | Exemple Neopro                                | Traçabilité                |
| -------------------------------------- | --------------------------------------------- | -------------------------- |
| Choix d'architecture cross-composant   | Edge + Cloud (ADR-001)                        | ADR complet                |
| Choix de technologie structurant       | Socket.IO (ADR-002), PostgreSQL (ADR-003)     | ADR complet                |
| Changement de stratégie produit        | Suppression analytics (ADR-027)               | ADR complet                |
| Contrainte infra découverte en prod    | Railway Hobby (ADR-015), BSSID mesh (ADR-011) | ADR complet                |
| Choix d'implémentation avec trade-offs | Merge config vs overwrite                     | ADR léger                  |
| Ajout d'une API avec impact sécurité   | Remote publique sans JWT (ADR-007)            | ADR complet                |
| Refactor interne à un service          | Réorganiser les routes d'un controller        | Commit message détaillé    |
| Fix de bug                             | Corriger un calcul d'analytics                | Commit message + issue ref |
| Choix cosmétique / style               | Nommage d'une variable                        | Rien                       |

### Question rapide (30 secondes)

> _"Dans 6 mois, est-ce que quelqu'un se demandera pourquoi on a fait ce choix ?"_
>
> **Oui** → ADR (complet ou léger)
> **Non** → Commit message suffit

---

## Les deux formats

### ADR complet (~100-175 lignes)

Pour les décisions structurantes. Template : [`docs/templates/TEMPLATE_ADR.md`](../templates/TEMPLATE_ADR.md)

Sections obligatoires : Contexte, Décision, Alternatives, Conséquences, Plan d'implémentation.

**Quand l'utiliser** : décisions irréversibles, cross-composant, ou avec des alternatives significatives.

### ADR léger (~15-30 lignes)

Pour les décisions intermédiaires qui méritent une trace sans le formalisme complet. Template : [`docs/templates/TEMPLATE_ADR_LIGHT.md`](../templates/TEMPLATE_ADR_LIGHT.md)

**Quand l'utiliser** : choix d'implémentation avec trade-offs, décisions locales à un module mais non triviales, contraintes découvertes en session qu'il faut garder.

---

## Capturer les décisions de session

Les décisions prises en chat (Claude Code, pair-programming, réunion) sont les plus fragiles. Deux mécanismes :

### 1. ADR post-session

Après une session qui produit une décision significative :

1. Créer un ADR léger qui capture le contexte et le "pourquoi"
2. Commiter l'ADR avec le code dans la même PR
3. Le temps investi : ~5 minutes

### 2. Commit enrichi

Pour les décisions qui ne méritent pas un ADR mais dépassent un simple commit message :

```
feat(sync): use merge strategy instead of overwrite

Decision: merge-based sync au lieu d'un overwrite complet
Why: évite les race conditions sur réseaux lents (constaté chez NLF)
Alternatives: queue-based (trop complexe), overwrite (perte de données)
Refs: ADR-013
```

Le format `Decision / Why / Alternatives / Refs` est optionnel mais recommandé pour les commits qui portent un choix.

---

## Lier ADR et code

La traçabilité fonctionne dans les deux sens.

### Code → ADR

Quand un bloc de code implémente une décision non évidente :

```typescript
// Décision: ADR-007 — API Remote sans JWT (accès réseau local uniquement)
router.get('/api/remote/status', remoteController.getStatus);
```

Réserver ces commentaires aux cas où le "pourquoi" n'est pas évident. Ne pas annoter chaque ligne.

### ADR → Code

Dans chaque ADR, une section `## Fichiers impactés` :

```markdown
## Fichiers impactés

- `central-server/src/routes/remote.routes.ts` — routes sans auth
- `raspberry/server/src/services/remote.service.ts` — handler local
```

Cela permet de retrouver rapidement le code concerné par une décision.

---

## Cycle de vie

### Statuts

| Statut       | Signification                                            |
| ------------ | -------------------------------------------------------- |
| **Proposé**  | En discussion, pas encore implémenté                     |
| **Accepté**  | Implémenté et en production                              |
| **Déprécié** | Remplacé par un autre ADR (garder pour historique)       |
| **Rejeté**   | Évalué mais non retenu (garder pour éviter de revisiter) |

### Revue trimestrielle

Tous les 3 mois, passer en revue :

- [ ] Les ADRs **Proposé** sont-ils encore pertinents ? (Accepter, rejeter ou supprimer)
- [ ] Les ADRs **Accepté** reflètent-ils encore la réalité ? (Mettre à jour ou déprécier)
- [ ] Y a-t-il des décisions prises sans ADR qui méritent d'être documentées ?
- [ ] Les doublons de numérotation sont-ils résolus ?

---

## Processus de création

```
1. Identifier le besoin (en session, en code review, en production)
         │
2. Choisir le format (complet ou léger, cf. grille ci-dessus)
         │
3. Rédiger l'ADR (copier le template, remplir)
         │
4. Commiter avec le code dans la même branche/PR
         │
5. Review en PR (l'ADR fait partie du diff)
         │
6. Merge → Mettre à jour docs/adr/README.md
```

### Numérotation

- Séquentielle : ADR-021, ADR-022, etc.
- Ne jamais réutiliser un numéro, même pour un ADR rejeté
- Préfixe dans le nom de fichier : `ADR-021-nom-descriptif.md`

### Qui rédige ?

Celui qui prend ou implémente la décision. Un ADR n'a pas besoin d'être parfait — il doit capturer le "pourquoi" avant qu'il ne s'oublie.

---

## Anti-patterns

| Anti-pattern                                | Pourquoi c'est un problème                          | Alternative                                     |
| ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| ADR rédigé des semaines après la décision   | Le contexte est perdu, l'ADR est incomplet          | Rédiger dans les 24h, même en format léger      |
| ADR sans alternatives                       | Pas de preuve que d'autres options ont été évaluées | Toujours documenter au moins 1 alternative      |
| ADR qui décrit le "quoi" sans le "pourquoi" | Pas de valeur ajoutée par rapport au code           | Se concentrer sur les contraintes et trade-offs |
| ADR jamais mis à jour                       | Devient trompeur quand la réalité diverge           | Revue trimestrielle                             |
| Trop d'ADRs sur des détails mineurs         | Bruit, personne ne les lit                          | Utiliser la grille de décision                  |

---

_Dernière mise à jour : 14 février 2026_
