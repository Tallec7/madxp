---
phase: 12
slug: allowlist-mac-hostapd
status: ready_to_plan
created: 2026-05-08
---

# Phase 12 — ALLOWLIST : Contexte & Décisions

## Goal

Le hotspot Pi opère en mode sécurisé opt-in : seules les MACs whitelistées obtiennent
une IP DHCP. L'admin gère la liste depuis le dashboard sans SSH. Une MAC bloquée génère
une métrique observable.

## Décisions lockées (phases précédentes)

- **Pattern sync (ADR-074)** : sync-agent pull cloud → diff → rewrite fichier → restart
  service. On étend ce pattern pour écrire `/etc/hostapd/hostapd.accept` en plus de
  `hostapd.conf`.
- **Source de vérité = DB cloud** : `sites` table. On ajoute `mac_allowlist TEXT[]` +
  `allowlist_enabled BOOLEAN DEFAULT FALSE` (migration).
- **Opt-in strict (ALLOWLIST-04)** : `allowlist_enabled = FALSE` par défaut → hotspot
  ouvert comme v4.0. Zéro breaking change.
- **Sudoers déjà configuré** pour `systemctl restart hostapd` et `sed -i hostapd.conf` →
  les nouvelles commandes `tee /etc/hostapd/hostapd.accept` devront être ajoutées au
  sudoers.

## Décisions discutées

### A — Emplacement dashboard

**Décision** : Section collapsible **"Sécurité hotspot"** intégrée dans la vue Écrans
(`displays-editor.component`), visible uniquement si `site_type = 'pi'`.

Pas de page dédiée. Le mental model est cohérent : l'admin gère les Fire Sticks assignés
ET les MACs autorisées depuis le même endroit.

UI attendue :

- Toggle "Activer l'allowlist" (booléen)
- Liste des MACs autorisées (chip + bouton supprimer)
- Input + bouton "Ajouter une MAC"
- Badge de statut (actif / inactif)

### B — Auto-population à l'activation

**Décision** : Au toggle ON, pré-remplir la liste avec les MACs des receivers ayant
`displayIndex !== null` (déjà assignés à un display).

Comportement exact :

1. Admin toggle ON → call `PATCH /api/sites/:id` avec `allowlist_enabled: true` +
   `mac_allowlist: [MACs assignées]`
2. Toast : "Allowlist activée — 3 MACs pré-ajoutées depuis vos displays assignés"
3. L'admin peut ensuite retirer/ajouter des MACs

Si aucune MAC assignée → liste vide + toast d'avertissement "Aucune MAC pré-ajoutée —
pensez à ajouter vos Fire Sticks avant d'activer".

### C — Expérience Fire Stick bloqué

**Décision** : Silence acceptable — pas de page "non autorisé".

`macaddr_acl=1` bloque à la couche 802.11 (avant DHCP). Le Fire Stick n'obtient pas
d'IP → impossible de servir une page. Ce comportement est délibéré côté admin.
Le signal pour l'admin = la métrique (section D).

Pas de `macaddr_acl=2` ni de contournement DHCP-level pour afficher une page. La
complexité ne vaut pas pour la v4.1.

### D — Source du signal "rejected" pour la métrique

**Décision** : Étendre `hostapdTelemetry.js` (déjà un process `hostapd_cli` ouvert).

Flow :

1. `hostapd_cli` émet l'event `AP-STA-REJECTED` quand `macaddr_acl=1` bloque une MAC
2. `hostapdTelemetry.js` parse cet event → `logger.warn('hostapd: MAC rejected', { mac })`
3. Sync-agent reçoit le signal → émet event socket `hotspot_mac_rejected` vers cloud
4. Cloud handler → incrémente `neopro_hotspot_rejected_total{site_id}` dans
   `metrics.service.ts`

Pas de tail de logs, pas de corrélation ARP/leases.

## Code context

### Fichiers à créer

| Fichier                                                           | Rôle                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `central-server/src/scripts/migrations/add-hotspot-allowlist.sql` | Colonnes `mac_allowlist TEXT[]` + `allowlist_enabled BOOLEAN` dans `sites`         |
| (extension) `hotspot-config.controller.ts`                        | Exposer `mac_allowlist` + `allowlist_enabled` dans GET/PATCH                       |
| (extension) `hotspot-sync.js`                                     | Écrire `/etc/hostapd/hostapd.accept` + activer `macaddr_acl=1` dans `hostapd.conf` |
| (extension) `hostapdTelemetry.js`                                 | Parser event `AP-STA-REJECTED` + emit socket                                       |
| (extension) `displays-editor.component`                           | Section "Sécurité hotspot" (toggle + liste MACs)                                   |
| (extension) `metrics.service.ts`                                  | Counter `neopro_hotspot_rejected_total`                                            |

### Fichiers clés existants à lire

| Fichier                                                        | Pourquoi                                 |
| -------------------------------------------------------------- | ---------------------------------------- |
| `raspberry/sync-agent/src/services/hotspot-sync.js`            | Pattern diff/rewrite/restart — à étendre |
| `raspberry/sync-agent/src/services/hostapd-telemetry.js`       | Process hostapd_cli existant — à étendre |
| `central-server/src/controllers/hotspot-config.controller.ts`  | API hotspot existante                    |
| `central-server/src/repositories/hotspot-config.repository.ts` | Repository hotspot                       |
| `raspberry/config/sudoers.d/neopro`                            | Commandes sudo autorisées — à compléter  |

### Patterns à réutiliser

- `hotspot-sync.js` : pattern `diffAndApply` (compare state cloud vs local, rewrite si diff)
- `hostapdTelemetry.js` : process `hostapd_cli -i wlan0 mon` déjà ouvert, parse line by line
- `displays-editor.component` : section Bootstrap Phase 11 (section collapsible existante)
- `metrics.service.ts` : Counter avec `{ labels: ['site_id'] }` (pattern ADR-111)

## Contraintes techniques

- `macaddr_acl=1` dans `hostapd.conf` + `accept_mac_file=/etc/hostapd/hostapd.accept`
- Le fichier `.accept` doit être MAJ **avant** restart hostapd (sinon toutes les MACs bloquées)
- Sudoers : ajouter `sudo /usr/bin/tee /etc/hostapd/hostapd.accept` (ou équivalent)
- `AP-STA-REJECTED` : vérifier disponibilité sur Debian 12 Pi 5 (event hostapd 2.10+)
- `mac_allowlist` en DB : stocker en lowercase normalisé (même format que `receivers.service.js`)

## Hors scope (Phase 12)

- Page "non autorisé" visible par le Fire Stick bloqué → Phase 14 optionnelle
- Alertes cloud quand une MAC inconnue tente de se connecter → Phase 13 (différent scope)
- Rotation automatique de l'allowlist basée sur les receivers actifs → à planifier si besoin
