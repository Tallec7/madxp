# Template — FEAT (nouvelle feature ou refactor structurel)

> Copie-colle ce bloc en début de session Claude pour une nouvelle feature, un nouveau composant, ou un refactor structurel cross-fichier.

---

```
FEAT
NOM: <nom court de la feature>
PROBLÈME UTILISATEUR: <pour qui (rôle), quel besoin, dans quel contexte>
NON-GOALS: <ce qu'on ne fera PAS dans cette session — important pour cadrer>
DEADLINE / PRIORITÉ: <date ou "pas urgent">

RÈGLES DE CETTE SESSION (non négociables):

1. ÉTAPE 1 — SPEC AVANT CODE:
   Écris docs/specs/{features|services|components}/<feature>.spec.md
   Format: 1 page max, suit le gabarit docs/specs/README.md.
   Sections obligatoires:
   - Problème + Goals + Non-Goals
   - Comportement attendu (règles métier)
   - Cas d'edge connus (vide au démarrage)
   - Fichiers impactés
   - Tests à prévoir
   ATTENDS MON GO sur la SPEC avant de toucher au code.

2. ÉTAPE 2 — PLAN D'IMPLÉMENTATION:
   - Liste des fichiers à créer/modifier (avec rôle de chaque)
   - Ordre d'implémentation (data → service → API → UI typiquement)
   - Découpage en commits atomiques
   - Tests à créer (unitaires + smoke + E2E si pertinent)
   - Régressions potentielles dans d'autres features (par grep des callers)
   - Si modif cross-composant (central-server + dashboard + raspberry):
     ADR léger inclus (cf. .claude/rules/adr.md)
   ATTENDS MON GO sur le plan avant de coder.

3. ÉTAPE 3 — IMPLÉMENTATION:
   - 1 commit par étape (atomique, conventional-commits)
   - Test après chaque étape (pas batch en fin)
   - Si une décision architecturale émerge en cours → STOP, demande arbitrage

4. NIVEAUX DE CONFIANCE OBLIGATOIRES dans la réponse:
   ✅ Vérifié / ⚠️ Estimé / ❌ Inconnu

5. CHALLENGE MODE: si en cours d'implémentation tu trouves une meilleure
   approche que celle qu'on a planifiée, STOP, expose, demande arbitrage.
   Ne change PAS unilatéralement le plan.

6. À LA FIN:
   - SPEC mise à jour avec ce qui a été VRAIMENT livré (vs ce qui était prévu)
   - PR draft avec body = Story Card (cf. docs/internal/CLAUDE-WORKFLOW.md)
   - Entrée dans docs/BUSINESS-CHANGELOG.md
   - Si visible client (TV/dashboard/remote) → notif spécifique dans la PR

Contexte additionnel:
<...>
```
