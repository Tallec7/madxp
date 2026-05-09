# Template — FIX

> Copie-colle ce bloc en début de session Claude pour un fix bug avec scope identifié (pas un incident remonté — pour ça, voir `incident.md`).

---

```
FIX
SCOPE: <fichier OU domaine OU symptôme>
PROBLÈME: <description claire du bug à corriger>
COMMENT JE L'AI VU: <repro steps OU "je suppose en lisant le code">

RÈGLES DE CETTE SESSION (non négociables):

1. MODE PLAN OBLIGATOIRE (Tab pour activer si pas déjà actif).

2. AVANT TOUT EDIT, produis ce bloc:

   ## Triangulation
   - DOC dit: <quote SPEC pertinente, ou "pas de SPEC sur ce domaine">
   - CODE fait: <quote ligne fichier:N — ce que fait vraiment le code aujourd'hui>
   - ÉTAT (si accessible): <query DB ou "non vérifiable">
   - VERDICT: convergent / divergent / incomplet

   ## Plan
   - Fichiers à modifier: <liste>
   - Autres callers du code touché: <liste obtenue par grep>
   - Tests régression à créer/modifier: <liste>
   - SPEC à mettre à jour: <chemin ou "aucune">
   - Risques de régression ailleurs: <liste>

3. ATTENDS MON GO avant tout edit.

4. SI le scope contient saas / config / sync / content / displays:
   - Lis d'abord la SPEC routée (cf. CLAUDE.md routing)
   - Lis docs/clients/NLF.md si comportement potentiellement visible NLF
   - Vérifie qu'aucun smoke test n'est pinné aux fichiers à toucher

5. NIVEAUX DE CONFIANCE OBLIGATOIRES dans la réponse:
   ✅ Vérifié / ⚠️ Estimé / ❌ Inconnu

6. CHALLENGE MODE: si mon diagnostic est en contradiction avec le code,
   STOP, expose la contradiction, demande arbitrage.

7. APRÈS LE FIX:
   - 1 commit atomique conventional-commits
   - Test régression nommé selon convention
   - SPEC mise à jour si comportement métier changé
   - Pas de push direct sur main, ouvre une PR

Détails additionnels:
<...>
```
