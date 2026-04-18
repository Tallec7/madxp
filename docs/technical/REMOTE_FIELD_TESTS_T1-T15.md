# Runbook Tests Terrain Télécommande — T1-T15

> **Phase 6 du plan refonte télécommande** (ADR-058 → ADR-062).
> Objectif : valider en conditions réelles les 15 invariants couverts par les phases 1-5 avant bascule production complète.

**Dernière mise à jour** : 18 Avril 2026
**Responsable exécution** : Ops + 1 développeur backup
**Durée estimée** : 1 sprint full-time (5 jours)

---

## Banc de test requis

| Élément                             | Quantité | Commentaire                                    |
| ----------------------------------- | -------- | ---------------------------------------------- |
| Raspberry Pi 5 (build prod récente) | 1        | OTA à jour, sync-agent vert                    |
| TV HDMI                             | 1        | Simule condition club                          |
| iPhone (iOS 17+)                    | 1        | Safari PWA                                     |
| Android (Chrome 120+)               | 1        | Chrome PWA                                     |
| Tablette iPad ou Android            | 1        | Mode paysage                                   |
| Routeur WiFi test                   | 1        | Pour couper internet sans éteindre la box club |
| Switch LAN                          | 1        | Pour isoler le Pi du reste du réseau           |
| Chronomètre / timer mobile          | 1        | Mesures latence                                |

**Pré-requis dashboard** :

- Site de test créé, 1 profil "Match" avec PIN configuré (ADR-058).
- Super_admin credentials disponibles.
- Grafana accessible (vérification alertes ADR-060).

---

## Grille d'exécution

Pour chaque test :

- ✅ **Passé** : critère observable atteint en moins de la tolérance.
- ⚠️ **Dégradé** : fonctionne mais hors tolérance (latence, retry, etc.).
- ❌ **Échec** : critère non atteint → bug à consigner.

Format de ligne bug : `[TXX] <observation> — <étape> — <device>`.

---

## Tests par domaine

### Auth & sécurité (ADR-058)

#### T1 — PIN profil valide

- **Setup** : PIN défini côté dashboard super_admin.
- **Étapes** : Remote cloud → saisie PIN → valider.
- **Attendu** : token 30j en localStorage, redirection vers la télécommande.
- **Tolérance** : < 1s après validation bcrypt.

#### T2 — PIN profil invalide + lockout

- **Étapes** : 5 PIN faux consécutifs depuis la même IP.
- **Attendu** : 6e tentative bloquée 10 min avec message dédié ; counter `neopro_profile_pin_verifications_total{status="lockout"}` incrémenté.
- **Tolérance** : lockout effectif, pas de contournement en changeant de device_id.

#### T3 — Révocation device token (super_admin)

- **Étapes** : connecter le remote → super_admin révoque le device dans l'UI → remote rafraîchit.
- **Attendu** : 401 Unauthorized sur les requêtes suivantes, forced re-login PIN.

#### T4 — Pi offline PIN fallback

- **Étapes** : couper internet du Pi → remote branché en LAN → saisie PIN.
- **Attendu** : validation locale via `profile-pin.service.js` avec lockout identique (5/10min).

### Résilience transport (ADR-060)

#### T5 — Bascule cloud → LAN automatique

- **Étapes** : remote en cloud, couper l'internet du routeur.
- **Attendu** : bandeau passe de `cloud` à `LAN` en < 3s, télécommande continue sans action utilisateur.
- **Check** : `transport-resilience.service.ts` détecte `neopro.local` joignable.

#### T6 — Hotspot QR (nouveau — couche 2)

- **Étapes** : TV affiche le QR via `?fallback=hotspot` (ou trigger manuel depuis l'admin Pi). Scanner avec iPhone.
- **Attendu** : iPhone se connecte au SSID `Neopro-<siteId>`, accède à `http://neopro.local:3001`, remote fonctionne.
- **Tolérance** : < 15s entre le scan et la télécommande opérationnelle.
- **Vérif sécurité** : PSK différent de la session précédente si rotation déclenchée.

#### T7 — Offline queue (PWA)

- **Étapes** : remote en PWA → couper tout transport (avion) → lancer 5 commandes → réactiver WiFi.
- **Attendu** : les 5 commandes sont rejouées en ordre dès reconnexion, pas de doublons (séquence ADR-059).
- **Check** : `offline-queue.service.ts` drain + Pi log unique par commande.

### Pub/sub état (ADR-059)

#### T8 — Convergence multi-remote

- **Étapes** : 2 remotes (tel A + tablette B) connectés. A incrémente le score.
- **Attendu** : B voit la mise à jour en < 500ms via `state-sync`.
- **Check** : sequence number croissant, pas de saut.

#### T12 — Reconnexion remote après crash Pi

- **Étapes** : redémarrer le Pi pendant une session remote.
- **Attendu** : remote se reconnecte, reçoit un `state-sync` initial, UI synchronisée avec l'état restauré.

### Coexistence legacy/new (ADR-061)

#### T9 — Toggle U22 legacy → new

- **Étapes** : remote actuel legacy, l'utilisateur switch via menu.
- **Attendu** : rechargement propre sur la new, `remote_auth_events` enregistre `client_version: v2`.

#### T10 — Persistance toggle par siteId

- **Étapes** : switch sur site A, aller sur site B, revenir sur A.
- **Attendu** : A reste en new, B suit son propre choix (par défaut new).

#### T11 — Sunset 2026-11-01

- **Étapes** : simuler date système > 2026-11-01.
- **Attendu** : legacy retirée du bundle, écran de transition affiché.

### UX & Governance (ADR-062)

#### T13 — Menu Préférences remote sans option sécurité

- **Étapes** : ouvrir ⚙️ sur la remote.
- **Attendu** : aucune option PIN / device / auth visible, UX locale uniquement.

#### T14 — Features section gated admin

- **Étapes** : connecter avec un user `club` (pas admin).
- **Attendu** : section Features non visible, seule la section UX l'est.

#### T15 — Audit log sécurité

- **Étapes** : super_admin modifie un PIN, révoque un token.
- **Attendu** : 2 entrées dans `remote_auth_events` avec actor, action, timestamp, IP.

---

## Procédure post-tests

1. Centraliser résultats dans un tableur (colonne par test, ligne par device).
2. Consigner les bugs dans GitHub Issues avec le tag `field-test-t1-t15`.
3. Si ≥ 2 tests ❌ → bloquer la bascule legacy sunset, itérer.
4. Si 0-1 ❌ → publier le runbook annexe support + préparer la comm clubs.
5. Re-tester les échecs après correction avant de cocher ✅.

## Critères de succès global

| Indicateur                     | Cible                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Tests ✅                       | 15/15 sur la plage iOS + Android + tablette              |
| Latence convergence state-sync | p95 < 500 ms                                             |
| Lockout PIN effectif           | 100% des tentatives 6e                                   |
| Offline queue sans perte       | 0 commande perdue sur 20 essais                          |
| Alertes Grafana                | `ProfilePinBruteForce` + `RemoteLegacyAdoptionLow` verts |
