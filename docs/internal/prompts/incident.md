# Template — INCIDENT

> Copie-colle ce bloc en début de session Claude quand un incident est remonté (NLF, alerte Grafana, régression vue en prod, métrique anormale).

---

```
INCIDENT [P0 / P1 / P2]
SOURCE: [NLF / dashboard / métrique Grafana / mon œil sur l'app / autre]
SYMPTÔME OBSERVÉ: <ce que JE vois, factuel — ne PAS interpréter>
HYPOTHÈSE INITIALE (peut être fausse): <ma théorie sur la cause>
QUAND ÇA A COMMENCÉ: <timestamp ou "je ne sais pas">
SCOPE IMPACTÉ: <NLF only / 1 site SaaS / toute la flotte / inconnu>

RÈGLES DE CETTE SESSION (non négociables):

1. ZÉRO EDIT TANT QUE TU N'AS PAS:
   a. Reformulé ce que tu comprends en 1 phrase
   b. Lu la SPEC du domaine concerné (cf. routing CLAUDE.md)
   c. Lu docs/clients/NLF.md si NLF concerné
   d. Tenté de reproduire en local avec `npm run dev:seed` si possible
   e. Trianguler DOC vs CODE vs ÉTAT (DB / logs si tu y as accès)
   f. Listé les hypothèses non vérifiées de mon brief
   g. Reçu mon GO explicite

2. SI mon hypothèse initiale ne tient pas le code → STOP, expose la
   contradiction, demande arbitrage. Ne fais PAS l'inverse "Daisy a peut-être
   raison, je vais essayer son hypothèse quand même". 
   Daisy préfère être challengé que voir 4h de fix sur mauvaise piste.

3. NIVEAUX DE CONFIANCE OBLIGATOIRES dans ta réponse:
   ✅ Vérifié (j'ai lu le fichier ou run la commande)
   ⚠️ Estimé (mémoire/audit, à valider)
   ❌ Inconnu (je le dis)

4. APRÈS LE FIX:
   - Test régression nommé `smoke-<domaine>-incident-<YYYY-MM-DD>.test.ts`
   - Mise à jour SPEC du domaine, section "Cas d'edge connus"
   - Si NLF impacté → mise à jour docs/clients/NLF.md
   - Entrée dans docs/runbooks/INCIDENT-LOG.md (1 ligne)

5. PAS DE FIX APRÈS 21H sauf P0 NLF avéré.

Symptôme reporté:
<...>

Logs / screenshots disponibles:
<colle les logs ou "rien">
```
