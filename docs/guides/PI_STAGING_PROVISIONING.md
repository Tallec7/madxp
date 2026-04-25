# Provisionning Pi staging permanent

> Procédure pour mettre en place le Pi de validation staging — Sprint 1 du programme delivery system.
> Coût : 1 Pi (~80€ ou recyclage) + ~5€/mois électricité.
> Bénéfice : détection des régressions edge cloud↔Pi avant prod, évite régression NLF.

**Dernière mise à jour** : 25 Avril 2026

---

## 1. Objectif

Avoir **1 Raspberry Pi physique** branché en permanence au bureau, pointant sur l'environnement staging (`api-staging.kalonpartners.bzh`), pour valider en conditions réelles tout changement edge avant qu'il parte en prod sur la flotte 50+ clients.

C'est **le seul moyen** de tester le wiring complet :

- sync-agent ↔ cloud
- match-config / score-update handlers
- OTA download/install
- WiFi reconnection / hotspot
- Migration du `configuration.json`

Sans Pi staging, ces régressions n'apparaissent qu'en prod sur NLF.

---

## 2. Matériel

| Item                  | Recommandation                                                            | Coût      |
| --------------------- | ------------------------------------------------------------------------- | --------- |
| Raspberry Pi          | Pi 5 8 Go (idéalement = parc cible) ou Pi 4 4 Go en recyclage             | ~80€ neuf |
| Active Cooler         | Obligatoire Pi 5 (cf. `.claude/rules/raspberry.md` `dtparam=cooling_fan`) | ~5€       |
| Carte SD              | 64 Go A2 (Sandisk Extreme ou équivalent)                                  | ~10€      |
| Alimentation          | Officielle Pi 5 (27 W USB-C PD)                                           | ~12€      |
| Affichage (optionnel) | Petit écran HDMI 7" ou écran USB-C, sinon rien                            | 0-50€     |
| Câble Ethernet        | Recommandé pour stabilité (pas de WiFi mesh à valider sur staging)        | 0-5€      |

**Total : ~80-160€** selon recyclage et écran.

---

## 3. Provisionning logiciel

### 3.1 — Image OS

Suivre la procédure standard `raspberry/install.sh` mais avec **les paramètres staging**.

```bash
# Sur le poste qui flashe la SD
curl -fsSL https://kalonpartners.github.io/neopro/setup.sh | bash -s -- \
  --site-id <UUID-staging-validation> \
  --api-key <api-key-staging> \
  --api-url https://api-staging.kalonpartners.bzh \
  --staging-mode
```

**Note** : si le flag `--staging-mode` n'existe pas encore dans `setup.sh`, il faudra l'ajouter dans une PR séparée — il pointe `socketUrl` et `apiUrl` vers staging au lieu de prod.

### 3.2 — Création du site staging dans la DB

Sur la DB staging Railway :

```sql
INSERT INTO sites (id, name, site_type, api_key, created_at)
VALUES (
  gen_random_uuid(),
  'STAGING-VALIDATION-PI',
  'pi',
  '<api-key-générée>',
  NOW()
);
```

Récupérer l'`id` et l'`api_key` pour le provisionning Pi.

### 3.3 — Profile par défaut

- Charger un profil minimal (1 catégorie sponsors avec 2-3 vidéos test)
- Activer toutes les fonctionnalités à valider (multi-screen, watermark, etc.)

### 3.4 — Branchement & vérifications

1. Brancher Ethernet (priorité stabilité)
2. Allumer le Pi
3. Vérifier dashboard staging : site `STAGING-VALIDATION-PI` doit passer "Connecté" sous 60 s
4. Vérifier `last_seen_at` qui se met à jour
5. Tester télécommande locale via téléphone connecté au hotspot du Pi
6. Tester un push de config depuis le dashboard staging → vérifier réception sur le Pi (logs `journalctl -u neopro-sync-agent`)

---

## 4. Intégration au flow de validation

Une fois le Pi staging up :

- **Toute PR avec label `needs-gabin`** est testable sur ce Pi (auto-déployé par staging).
- Avant un tag prod sensible (changement Pi-side, OTA, sync-agent), **vérifier 24-48h** que le Pi staging tourne stable sur la version cible.
- En cas de régression : reproduire sur le Pi staging avant de toucher la flotte.

---

## 5. Maintenance

### Checks hebdo (5 min)

- [ ] Pi staging connecté sur dashboard
- [ ] Vidéos jouent correctement
- [ ] Logs sync-agent sans erreurs récurrentes
- [ ] Métrique RAM/CPU/temp stable

### Mises à jour

- Le Pi staging reçoit les OTA staging automatiquement (canal staging).
- **Ne PAS mettre le Pi staging dans le canal prod** — il sert de cobaye.

---

## 6. À faire après provisionning (post-Sprint 1)

1. Documenter dans `docs/technical/ENVIRONMENTS.md` §2 : remplacer "À provisionner (Sprint 1)" par l'`id` du site
2. Ajouter une probe automatique : `frontend-health.yml` étendu pour vérifier que `STAGING-VALIDATION-PI` est `last_seen_at < 5 min` (alerte sinon)
3. Mémoire perso (`memory/`) : ajouter projet `project_pi_staging.md`

---

## 7. Décision matérielle

| Option                          | Pour                                 | Contre                                                                 |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| **Pi 5 neuf 8 Go** (recommandé) | Identique parc cible, validation 1:1 | 80€                                                                    |
| Pi 5 4 Go neuf                  | -10€                                 | Moins représentatif RAM                                                |
| Pi 4 4 Go en recyclage          | 0€                                   | Drift hardware/OS vs flotte (qui est Pi 5 ?)                           |
| VM ARM64 sur serveur            | Reproductible, snapshot              | Ne valide pas hotspot, EDID, GPIO, GPU V3D, Active Cooler — **rejeté** |

**Recommandation** : Pi 5 8 Go neuf si la majorité de la flotte est Pi 5. Sinon Pi 4 si c'est encore le format majoritaire.

À trancher avec le contexte hardware actuel de la flotte (cf. inventaire).
