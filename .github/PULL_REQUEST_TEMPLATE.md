## Summary

<!-- Ce qui change techniquement — 2-5 lignes max -->

## Impact client

<!-- CE QUE VOIT / RESSENT L'UTILISATEUR FINAL — obligatoire.
     Exemples : "Le staff peut piloter la TV sans internet via le hotspot Pi."
                "Les clubs SaaS voient maintenant les vidéos déployées par l'admin."
                "Aucun changement visible — refacto interne uniquement."
     Cette section est extraite automatiquement pour le rapport hebdo BO. -->

## ADR lié

<!-- Numéro ADR si décision architecturale, sinon "Aucun" -->

## Risque

<!-- Cocher 1 case -->

- [ ] 🟢 **Low** — refacto interne, fix isolé, doc, tests
- [ ] 🟡 **Medium** — feature standard, modif endpoint, modif UI
- [ ] 🔴 **High** — touche match live, OTA flotte, auth, migration DB, paiement

## Migration DB

<!-- Cocher 1 case -->

- [ ] Aucune migration
- [ ] Migration ajoutée — **idempotente** (`IF NOT EXISTS` / `IF EXISTS`)
- [ ] Migration ajoutée — **réversible** (down script ou `DROP IF EXISTS` documenté)
- [ ] Migration testée sur staging avant tag prod (obligatoire si Risque 🔴)

## Comment tester sur staging

<!-- Pour le validateur (Gabin si needs-gabin). Donner URL + steps. Exemples :
     1. Ouvrir https://api-staging.kalonpartners.bzh/sponsors/signup
     2. Remplir avec un email test, attendre le magic link
     3. Vérifier la création du sponsor dans le dashboard staging
     4. Cas d'échec attendu : email déjà utilisé → erreur 409 propre -->

## Test plan

- [ ] CI verte (lint + typecheck + tests + smoke)
- [ ] Tests existants passent (`npm run test:smoke:smart`)
- [ ] Nouveaux tests ajoutés si feature ou fix non trivial
- [ ] Testé manuellement sur les cas décrits ci-dessus

## Validation

<!-- Choisir le label adapté avant le merge — voir CONTRIBUTING.md §3.3 :
     - tech-only           → refacto/perf/infra/fix purement technique
     - needs-gabin         → toute évolution UX/produit/métier
     Tag prod interdit sans `gabin-validated` quand `needs-gabin` est présent. -->
