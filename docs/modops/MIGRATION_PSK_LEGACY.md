# Migration PSK Legacy — Pi pré-ADR-073

**Version** : 1.0
**Date de lancement prévue** : après merge PR #484 (ADR-073)
**Responsable** : Ops / Support Neopro
**Niveau requis** : Support Niveau 2+ (accès dashboard Pi `:8080`)
**Durée estimée** : ~10 min par Pi + communication club

---

## Contexte

Avant ADR-073, tous les boîtiers Neopro partageaient la même PSK WiFi hotspot :
`NeoProWiFi2025`. Après ADR-073, chaque nouveau Pi génère une PSK unique à
l'installation.

Les Pi **déployés avant 2026-04-19** tournent toujours sur l'ancienne PSK
partagée. Cette migration remplace la PSK de chaque Pi legacy par une PSK unique.

---

## 1. Préparation

### 1.1 Identifier les Pi legacy

Requête sur le central (psql ou dashboard SAFe si dispo) :

```sql
SELECT
  id,
  club_name,
  ip_local,
  last_seen,
  created_at
FROM sites
WHERE
  site_type = 'pi'
  AND (psk_rotated_at IS NULL OR psk_rotated_at < '2026-04-19')
  AND created_at < '2026-04-19'
ORDER BY
  CASE
    WHEN club_name ILIKE ANY(ARRAY['%nlf%', '%TVB%']) THEN 0  -- clubs prioritaires
    ELSE 1
  END,
  last_seen DESC;
```

> **Note** : le champ `psk_rotated_at` est mis à jour manuellement après chaque
> rotation (voir section 4). Si la colonne n'existe pas encore :
> `ALTER TABLE sites ADD COLUMN psk_rotated_at TIMESTAMPTZ;`

### 1.2 Classifier les Pi par priorité

| Priorité | Profil                         | Fenêtre de migration                |
| -------- | ------------------------------ | ----------------------------------- |
| P1       | Clubs en match/compétition     | Avant vendredi 18 h (avant weekend) |
| P2       | Clubs en usage régulier        | Semaine, heures de bureau           |
| P3       | Vitrines, démos, sites pilotes | Dernier batch, peut attendre        |

### 1.3 Canaux de communication club

Préparer **avant** la rotation :

- [ ] Email au contact référent (template ci-dessous)
- [ ] SMS backup si urgence
- [ ] [MODOP_CLUB_PSK.md](../guides/MODOP_CLUB_PSK.md) à joindre à l'email

**Template email** :

```
Objet : [Neopro] Mise à jour sécurité de votre boîtier — nouvelle PSK WiFi

Bonjour,

Nous renouvelons ce jour la clé WiFi du hotspot local de votre boîtier
Neopro (mesure de sécurité ADR-073, amélioration en cours sur tout le parc).

Votre nouvelle PSK : XXXXXXXXXXXXXXXNeo

Actions à faire :
1. Sur le smartphone/tablette qui sert de télécommande, aller dans Réglages WiFi
2. "Oublier" le réseau Neopro-<VotreClub>
3. Se reconnecter avec la nouvelle PSK ci-dessus

Guide complet en pièce jointe (MODOP_CLUB_PSK.pdf).

En cas de souci, répondre à cet email ou appeler le support.

Cordialement,
L'équipe Neopro
```

---

## 2. Procédure de rotation (par Pi)

### 2.1 Checklist pré-rotation

- [ ] Pi joignable (ping / `last_seen` récent côté central)
- [ ] Fenêtre OK avec le club (pas en plein match)
- [ ] Accès dashboard `:8080` confirmé (login)
- [ ] Email club en brouillon, prêt à envoyer

### 2.2 Rotation via dashboard (nominal)

1. Se connecter à `http://<ip-pi>:8080` — login admin
2. Onglet **Network**
3. Vérifier **Clients WiFi connectés** : noter combien sont là (pour vérification post-rotation)
4. Cliquer **Renouveler la PSK** (carte tech-only)
5. **Saisir la PSK custom** selon le tableau ci-dessous. **Ne pas laisser vide** — l'auto-gen produit une PSK 20-char alphanum imbuvable à taper pour le staff club
6. **Confirmer**
7. Copier la nouvelle PSK dans le presse-papiers (bouton Copier)
8. Coller immédiatement dans le brouillon d'email + 1Password (entrée `Neopro / WiFi Pi / <club>`)

#### Tableau PSK par club (parc actuel)

| Club                          | PSK à appliquer         | Priorité |
| ----------------------------- | ----------------------- | -------- |
| NLF Handball                  | `NantesLoireFeminin26!` | P1       |
| AS Saint Rogatien             | `SaintRogatien26!`      | P2       |
| Corsaires de Nantes           | `CorsairesNantes26!`    | P2       |
| Nantes Atlantique Rink Hockey | `NantesRinkHockey26!`   | P2       |
| GLT Sport                     | `GLTSport26!`           | Test     |
| KALON BREIZH CUP              | `KalonBreizh26!`        | P3       |
| UCK NEF                       | `UCKNef26!`             | P3       |

Pattern : `<NomClubAbbrev><Année>!`, 12-22 chars, lisible, unique par club. Valide techniquement (8-63 chars, ASCII imprimable, pas de `\n|&;`).

### 2.3 Rotation via SSH (fallback)

Voir [MODOP_SUPPORT_PSK.md section 4](../guides/MODOP_SUPPORT_PSK.md#4-rotater-la-psk-fallback--ssh-direct).

### 2.4 Vérification post-rotation

- [ ] Onglet Network → Clients WiFi : liste vide (normal, tout le monde déconnecté)
- [ ] Onglet Events : events `AP-STA-DISCONNECTED` visibles pour les MAC précédentes
- [ ] Envoyer l'email au club avec la nouvelle PSK
- [ ] Attendre ~5 min, vérifier qu'au moins 1 client se reconnecte (télécommande staff)
- [ ] Si pas de reconnexion après 15 min : appeler le club, guider l'oubli du réseau

### 2.5 Mise à jour DB centrale

```sql
UPDATE sites
SET psk_rotated_at = NOW()
WHERE id = '<site_id>';
```

---

## 3. Scénarios d'échec

### 3.1 Dashboard `:8080` inaccessible

**Symptôme** : timeout, refus de connexion, 502.

**Actions** :

1. Vérifier l'IP du Pi (ping, `central-server` heartbeat récent)
2. Vérifier admin-server : `ssh pi@<ip> sudo systemctl status neopro-admin`
3. Si admin-server down : `sudo systemctl restart neopro-admin`
4. Sinon → fallback SSH (section 2.3)

### 3.2 Rotation réussie mais hotspot ne revient pas

**Symptôme** : après restart hostapd, aucun client ne peut s'associer.

**Actions** :

1. SSH : `sudo systemctl status hostapd` — code retour 0 ?
2. `sudo journalctl -u hostapd -n 50` — chercher erreurs syntaxe ou radio
3. Restaurer le backup : `sudo cp /etc/hostapd/hostapd.conf.bak /etc/hostapd/hostapd.conf && sudo systemctl restart hostapd`
4. Si pas de backup : ré-appliquer une PSK via sed (voir MODOP_SUPPORT_PSK §4)

### 3.3 Client club ne peut pas se reconnecter

**Symptôme** : le contact appelle, impossible de saisir la nouvelle PSK.

**Actions** :

1. Confirmer la PSK communiquée (copier-coller de l'email, pas saisie)
2. Demander de **oublier** le réseau (pas juste se déconnecter)
3. Vérifier le nom du réseau (SSID) : `Neopro-<NomClub>` — parfois le staff se connecte à un autre WiFi
4. Onglet Events dashboard → filtrer `reason=PSK_MISMATCH` : confirme PSK incorrecte
5. Dernier recours : régénérer une PSK simple (8 chars alphanumériques) et la communiquer par téléphone

### 3.4 Pi hors ligne pendant la rotation

**Symptôme** : Pi n'est pas joignable au moment prévu.

**Actions** :

- Reporter dans une nouvelle fenêtre
- Si > 72 h hors ligne : remonter à l'équipe support pour vérification terrain

---

## 4. Rollback

**La rotation n'a pas de rollback simple** (la nouvelle PSK remplace l'ancienne).

Si besoin de revenir à `NeoProWiFi2025` pour un Pi spécifique (déconseillé, seulement cas exceptionnel) :

```bash
ssh pi@<ip>
sudo sed -i 's|^wpa_passphrase=.*|wpa_passphrase=NeoProWiFi2025|' /etc/hostapd/hostapd.conf
sudo systemctl restart hostapd
```

Et mettre à jour `/home/pi/neopro/club-config.json` en conséquence.

> ⚠️ **Ne pas faire ça en batch** — c'est uniquement pour un Pi où la nouvelle
> PSK a échoué et où le staff a besoin d'accès urgent. Documenter dans le ticket.

---

## 5. Suivi

### 5.1 Dashboard de progression

Requête à lancer régulièrement :

```sql
SELECT
  COUNT(*) FILTER (WHERE psk_rotated_at IS NOT NULL) AS migrated,
  COUNT(*) FILTER (WHERE psk_rotated_at IS NULL AND created_at < '2026-04-19') AS pending,
  COUNT(*) AS total_pi
FROM sites
WHERE site_type = 'pi';
```

### 5.2 Définition de terminé

- [ ] Tous les Pi P1 migrés avant le prochain weekend match
- [ ] Tous les Pi P2 migrés dans la semaine suivante
- [ ] Tous les Pi P3 migrés dans le mois
- [ ] Compteur `pending` = 0
- [ ] Document archivé dans `docs/modops/archives/` avec date de fin

---

## 6. Post-ADR-074 : Bootstrap cloud avant rotation

**Depuis le merge ADR-074 (PR #489, 2026-04-20)**, la rotation PSK passe **toujours** par le
cloud — `hotspotConfigService.encrypt()` + colonne `sites.wifi_psk_encrypted` chiffrée
AES-256-GCM. La rotation locale SSH directe (section 2.3) est conservée en **fallback uniquement**.

### Pré-requis avant toute rotation post-ADR-074

1. **Clé de chiffrement Railway** : `HOTSPOT_PSK_ENCRYPTION_KEY` (64 hex chars) doit être
   setée sur le service `central-server` — sauvegardée dans 1Password. Sans elle, toutes
   les routes `/hotspot-config*` retournent 500. Voir
   [RUNBOOK_HOTSPOT_PSK_INCIDENT.md](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md) branche A.
2. **Code ADR-074 déployé sur le Pi** : le sync-agent doit avoir la fonction
   `syncHotspotFromCloud()` dans `agent.js` et le handler `rotate_psk` dans `commands/`.
   OTA `build-and-deploy.sh` pousse ces fichiers depuis v3.197+.
3. **Pi bootstrappée** : `sites.wifi_psk_encrypted IS NOT NULL`. Vérifier via
   `npm run hotspot:status` (script `central-server/src/scripts/hotspot-bootstrap-status.ts`).

### Flow de rotation post-ADR-074

```
1. Dashboard admin → POST /api/sites/:id/hotspot-config/rotate { psk: "<NouveauPSK>" }
2. Cloud → chiffre PSK avec HOTSPOT_PSK_ENCRYPTION_KEY → UPDATE sites SET wifi_psk_encrypted=...
3. Cloud → commandQueueService.sendOrQueue(id, 'rotate_psk', {})
4. Pi → syncHotspotFromCloud() → GET /hotspot-config → réécrit hostapd.conf → restart hostapd
5. Cloud met psk_rotated_at = NOW()
```

### Troubleshooting rotation bloquée

| Symptôme                                                 | Probable cause                                   | Runbook                                                                         |
| -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `POST /rotate` → 500 muet                                | `HOTSPOT_PSK_ENCRYPTION_KEY` manquante           | [RUNBOOK_HOTSPOT_PSK_INCIDENT.md#branche-a](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md)  |
| `POST /rotate` → 200 mais Pi inchangé                    | Commande `rotate_psk` pas propagée               | [RUNBOOK_HOTSPOT_PSK_INCIDENT.md#branche-c](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md)  |
| `GET /hotspot-config` → 401 depuis le Pi                 | Route collision ADR-076 (regression possible)    | Vérifier `sites.routes.ts` ne remonte pas `/:id/hotspot-config`                 |
| Dashboard affiche "non bootstrappé" mais colonne remplie | Mauvaise clé de chiffrement (PSK indéchiffrable) | [RUNBOOK_HOTSPOT_PSK_INCIDENT.md#branche-a3](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md) |

---

## 7. Références

- ADR : [ADR-073](../adr/ADR-073-hotspot-security-hardening.md)
- ADR : [ADR-074](../adr/ADR-074-hotspot-psk-single-source-of-truth.md)
- Modop support : [MODOP_SUPPORT_PSK.md](../guides/MODOP_SUPPORT_PSK.md)
- Modop club : [MODOP_CLUB_PSK.md](../guides/MODOP_CLUB_PSK.md)
- Runbook hotspot incidents : [RUNBOOK_HOTSPOT_PSK_INCIDENT.md](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md)
- Runbook urgence : [RUNBOOK_URGENCE.md](RUNBOOK_URGENCE.md)
- Code service : [raspberry/admin/services/hotspot-dashboard.service.js](../../raspberry/admin/services/hotspot-dashboard.service.js)
