# Registre de Risques ROAM — PI-1

> **Dernière mise à jour** : 19 Février 2026
> **PI** : PI-1 (Février - Mars 2026)
> Framework SAFe ROAM : **R**esolved, **O**wned, **A**ccepted, **M**itigated

---

## Méthode ROAM

| Statut        | Signification                                                  | Action                  |
| ------------- | -------------------------------------------------------------- | ----------------------- |
| **Resolved**  | Le risque n'existe plus                                        | Archiver                |
| **Owned**     | Un responsable est assigné et travaille activement dessus      | Suivre en sprint review |
| **Accepted**  | Le risque est compris et accepté (impact faible ou inévitable) | Documenter l'impact     |
| **Mitigated** | Des actions de mitigation réduisent la probabilité ou l'impact | Vérifier l'efficacité   |

---

## Risques PI-1

### R-01 : Capacité solo-dev insuffisante pour 81 SP engagés

| Champ           | Détail                                        |
| --------------- | --------------------------------------------- |
| **Catégorie**   | Capacité                                      |
| **Statut ROAM** | **Accepted**                                  |
| **Probabilité** | Haute                                         |
| **Impact**      | Moyen — Les objectifs étendus seront reportés |
| **Owner**       | Gwenvael                                      |

**Description** : Un seul développeur pour 79 SP (71 engagés + 8 étendus) sur 6 semaines. La vélocité cible de 27 SP/sprint n'est pas encore validée historiquement. 5 Epics requalifiés Done allègent le PI-1 mais le risque capacité reste.

**Mitigation** : Les objectifs étendus (F-07.3 WiFi USB 3 SP, F-10.1 Carte flotte 5 SP) servent de buffer. En cas de retard, ils sont reportés en PI-2 sans impact business critique. Focus sur les 4 objectifs engagés (E-01, E-02, E-03, E-06).

**Critère de résolution** : Vélocité réelle mesurée après Sprint 1. Ajustement du périmètre engagé si vélocité < 20 SP.

---

### R-02 : WiFi gymnase instable pendant les tests

| Champ           | Détail                                                    |
| --------------- | --------------------------------------------------------- |
| **Catégorie**   | Technique                                                 |
| **Statut ROAM** | **Mitigated**                                             |
| **Probabilité** | Haute                                                     |
| **Impact**      | Moyen — Ralentit le développement des features temps réel |
| **Owner**       | Gwenvael                                                  |

**Description** : Les tests d'intégration avec les Pi physiques dépendent du WiFi des gymnases partenaires (NARH, NLF). Les conditions réseau sont imprévisibles (surtout le soir de match avec 200+ téléphones connectés).

**Actions de mitigation** :

- [x] Environnement de test local avec routeur dédié
- [x] Mode offline fonctionnel (Socket.IO local, E-07)
- [ ] Tests de charge WiFi simulés (throttling réseau)
- [ ] Clé USB WiFi externe en backup (E-07)

**Critère de résolution** : E-07 (Résilience WiFi V2) livré et validé en conditions réelles.

---

### R-03 : Aucun sponsor inscrit pour valider le portail

| Champ           | Détail                                                            |
| --------------- | ----------------------------------------------------------------- |
| **Catégorie**   | Business                                                          |
| **Statut ROAM** | **Owned**                                                         |
| **Probabilité** | Moyenne                                                           |
| **Impact**      | Haut — E-01 (Portail Sponsor) développé sans feedback utilisateur |
| **Owner**       | Gwenvael + Gabin                                                  |

**Description** : Le portail sponsor self-service (E-01) est développé pour des sponsors qui n'existent pas encore en self-service. Risque de construire une feature inadaptée.

**Actions** :

- [ ] Identifier ≥ 3 sponsors existants (NARH, NLF) prêts à tester le portail en beta
- [ ] Interview sponsors actuels pour valider le workflow (upload, sélection gymnase, rapport)
- [ ] Prototype clickable partagé avant le dev (Sprint 1)

**Critère de résolution** : ≥ 3 sponsors beta identifiés et confirmés avant fin Sprint 1.

---

### R-04 : Dépendance Supabase pour le scaling

| Champ           | Détail                                                                |
| --------------- | --------------------------------------------------------------------- |
| **Catégorie**   | Infrastructure                                                        |
| **Statut ROAM** | **Accepted**                                                          |
| **Probabilité** | Faible                                                                |
| **Impact**      | Haut — Pool de 5 connexions limite le nombre de requêtes concurrentes |
| **Owner**       | Gwenvael                                                              |

**Description** : PostgreSQL hébergé sur Supabase avec un pool de 5 connexions. Suffisant pour 15 clubs, mais risque de bottleneck à 50+ clubs avec des requêtes analytics lourdes (E-03).

**Mitigation** : Le pool de 5 connexions est suffisant pour PI-1 (< 15 clubs). Évaluation en PI-2 d'un upgrade Supabase ou d'une migration vers un PG managé (Neon, Railway PG).

**Critère de résolution** : Benchmark de charge à 50 connexions simulées avant PI-2 Planning.

---

### R-05 : Sécurité des api_keys Pi

| Champ           | Détail                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| **Catégorie**   | Sécurité                                                                       |
| **Statut ROAM** | **Mitigated**                                                                  |
| **Probabilité** | Faible                                                                         |
| **Impact**      | Critique — Compromission d'un Pi pourrait exposer l'api_key et usurper un site |
| **Owner**       | Gwenvael                                                                       |

**Description** : Les api_keys des Pi sont stockées en clair sur le Pi dans la config. Un accès physique au Pi permet de récupérer la clé.

**Actions de mitigation** :

- [x] api_key unique par site, révocable depuis le dashboard
- [x] Rotation possible sans reconfiguration du Pi (sync automatique)
- [ ] Chiffrement de la config locale sur le Pi (GPG ou keyring)
- [ ] Rate limiting par api_key (E-09 Audit)

**Critère de résolution** : Chiffrement config locale implémenté + rate limiting actif.

---

### R-06 : Retard onboarding automatisé bloque le scaling

| Champ           | Détail                                                |
| --------------- | ----------------------------------------------------- |
| **Catégorie**   | Business                                              |
| **Statut ROAM** | **Owned**                                             |
| **Probabilité** | Moyenne                                               |
| **Impact**      | Critique — Sans E-06, impossible de dépasser 15 clubs |
| **Owner**       | Gwenvael                                              |

**Description** : L'onboarding automatisé (E-06, WSJF=20) est le bottleneck N°1 de VS1. Si la feature n'est pas livrée en PI-1, le milestone "5 clubs payants" (31 mars) est compromis.

**Actions** :

- [ ] Prioriser E-06 en Sprint 2 (pas de report)
- [ ] Fallback : script semi-automatisé (SSH + config template) si le wizard complet n'est pas prêt
- [ ] Tester le wizard avec le prochain club signé (RACC ou Corsaires)

**Critère de résolution** : Premier club onboardé via wizard automatisé avant fin Sprint 3.

---

### R-07 : Hébergement FTP Hostinger comme point de défaillance

| Champ           | Détail                                    |
| --------------- | ----------------------------------------- |
| **Catégorie**   | Infrastructure                            |
| **Statut ROAM** | **Accepted**                              |
| **Probabilité** | Faible                                    |
| **Impact**      | Haut — Perte d'accès aux vidéos uploadées |
| **Owner**       | Gwenvael                                  |

**Description** : Toutes les vidéos sont stockées sur FTP Hostinger. Pas de backup automatisé, pas de CDN, pas de redondance. Une panne Hostinger rend les vidéos inaccessibles.

**Mitigation** : Le cache local 48h (E-07) protège les clubs déjà déployés. Migration vers un stockage cloud (S3/R2) envisagée en PI-2 si ≥ 20 clubs.

**Critère de résolution** : Stratégie de backup définie avant PI-2 Planning.

---

### R-08 : Absence de tests E2E sur le parcours sponsor

| Champ           | Détail                                                       |
| --------------- | ------------------------------------------------------------ |
| **Catégorie**   | Qualité                                                      |
| **Statut ROAM** | **Owned**                                                    |
| **Probabilité** | Haute                                                        |
| **Impact**      | Moyen — Risque de régression sur le parcours sponsor complet |
| **Owner**       | Gwenvael                                                     |

**Description** : Le parcours sponsor (inscription → upload → validation → rotation → analytics) traverse 4 Epics (E-01 → E-02 → E-03) sans test E2E de bout en bout. Les smoke tests existants ne couvrent pas ce parcours.

**Actions** :

- [ ] Écrire un test E2E Playwright du parcours sponsor complet (Sprint 3)
- [ ] Intégrer dans la CI (GitHub Actions)
- [ ] Valider avec un sponsor beta avant la release PI-1

**Critère de résolution** : Test E2E Playwright du parcours sponsor vert en CI.

---

## Matrice ROAM

```
          ┌─────────────────────────────────────────┐
          │           IMPACT                        │
          │     Faible    Moyen      Haut   Critique│
┌─────────┼──────────────────────────────────────────┤
│ Haute   │             R-01(A)             R-08(O) │
│         │             R-02(M)                     │
│ Proba.  │                                         │
│ Moyenne │             R-03(O)             R-06(O) │
│         │                                         │
│ Faible  │                        R-07(A)  R-05(M) │
│         │                        R-04(A)          │
└─────────┴──────────────────────────────────────────┘

(A) = Accepted  (O) = Owned  (M) = Mitigated  (R) = Resolved
```

---

## Suivi des actions

| Action                                 | Risque | Owner    | Deadline   | Statut     |
| -------------------------------------- | ------ | -------- | ---------- | ---------- |
| Mesurer vélocité Sprint 1              | R-01   | Gwenvael | Fin S1     | En attente |
| Tests de charge WiFi simulés           | R-02   | Gwenvael | S2         | En attente |
| Identifier 3 sponsors beta             | R-03   | Gabin    | Fin S1     | En attente |
| Interview sponsors existants           | R-03   | Gwenvael | S1         | En attente |
| Benchmark charge 50 connexions         | R-04   | Gwenvael | Avant PI-2 | En attente |
| Chiffrement config locale Pi           | R-05   | Gwenvael | S3         | En attente |
| Script semi-auto onboarding (fallback) | R-06   | Gwenvael | S2         | En attente |
| Stratégie backup vidéos                | R-07   | Gwenvael | Avant PI-2 | En attente |
| Test E2E parcours sponsor              | R-08   | Gwenvael | S3         | En attente |

---

**Retour** : [SAFe Neopro](README.md) · [PI Objectives](PI-OBJECTIVES.md) · [Inspect & Adapt](INSPECT-ADAPT.md)
