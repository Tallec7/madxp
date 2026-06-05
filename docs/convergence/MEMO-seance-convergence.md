# Mémo de séance — ce que je défends / ce que je concède

> **Pour** : Daisy, en séance de convergence avec le lead dev retail.
> **But** : arriver avec une position claire — savoir où tenir bon, où lâcher, et quoi en repartir.
> 1 page. À lire 5 min avant.

## Les 3 décisions à SORTIR de la séance (sinon la séance a échoué)

1. **Stack du noyau** — on tranche, ou au moins on fixe les critères + la date de décision. _(bloquant pour tout démarrage)_
2. **Périmètre retail réel** — grille §I.5 remplie (au moins Q1, Q6, Q8). _(débloque la régie + le port player)_
3. **Sens de « sport prêt en 3 mois »** — re-câblage acté, OU on rallonge l'horizon. _(évite de promettre l'impossible)_

---

## 🛡️ NON-NÉGOCIABLES (je tiens bon, ce sont des invariants, pas des préférences)

| Je défends                                                                     | Pourquoi                                                | Si on cède, on casse…                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| **Autonomie offline du Pi**                                                    | offre vendue « TV sans dépendance internet en live »    | le produit sport en prod (NLF, Mangin-Beaulieu…) |
| **`sponsor_local` ≠ `media_sold`** (2 modèles de droits, 1 moteur de rotation) | acteurs/propriété/facturation différents                | la facturation + l'attribution (risque §I.4-1)   |
| **Port/adaptateur, jamais `if (vertical)`** dans le moteur                     | sinon « 2 produits déguisés »                           | la promesse même du noyau commun                 |
| **Audience = 2 métriques** (diffusions ≠ humains exposés)                      | sources de vérité incompatibles                         | la fiabilité des rapports des deux côtés         |
| **`ownsTruth` déduit du substrat** (edge vs cloud)                             | fait cohabiter Pi-autoritaire et retail-cloud sans hack | le modèle dual ADR-120                           |

> Règle d'arbitrage : si le lead retail propose de mutualiser un de ces points « pour simplifier », c'est **exactement** l'abstraction forcée que le CDC dit d'éviter. Demander un cas d'usage concret avant d'accepter.

## 🤝 NÉGOCIABLES (je concède volontiers, c'est sa table aussi)

| Je lâche / j'ouvre                  | Condition                                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Quelle stack sème le noyau**      | mon lean « proche du sport » n'est qu'un défaut ; sa stack peut gagner si elle absorbe mieux temps-réel + edge |
| **La richesse de la planification** | le retail (campagnes datées, dayparting) tire probablement le standard — le sport s'y conforme                 |
| **Le substrat / l'edge retail**     | s'il n'y a pas d'edge retail, tant mieux, moins de complexité noyau                                            |
| **Le nom de la marque**             | aucun avis fort — décision produit, pas technique                                                              |
| **Le moteur de créa/templates**     | mutualisable, pas un point dur                                                                                 |

## ⚠️ Pièges à désamorcer (ce qu'il NE faut PAS accepter par confort)

- « On met l'audience dans une seule table » → non, 2 métriques.
- « advertiser = annonceur, c'est pareil » → non, sémantiques distinctes par vertical.
- « On réécrit le sport proprement tant qu'on y est » → non en 3 mois ; re-câblage.
- « Le retail est toujours connecté donc le noyau peut supposer le cloud » → non, le noyau ne suppose **jamais** le cloud en lecture (sinon on perd l'offline sport).

## Ce que je ramène de la séance

- Grille §I.5 remplie → je débloque SPEC-CORE-REGIE, SPEC-RETAIL-INVENTORY/AUDIENCE/BILLING.
- Décision stack → je fige l'archi Décision C.
- `capabilities()` du substrat retail → je finis SPEC-CORE-PLAYER §13.

## Mon ouverture en séance (proposition)

> « J'arrive avec le sport entièrement posé et un noyau cadré autour d'un seul concept : le _player abstrait_. Je n'ai rien inventé sur ton retail — j'ai 12 questions. Mon seul dogme, c'est qu'aucune spécificité d'un vertical ne fuit dans le moteur de l'autre. Sur tout le reste — la stack comprise — je suis ouvert. »
