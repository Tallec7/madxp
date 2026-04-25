# Runbook incident — global (tous clients Pi + SaaS)

> Procédure step-by-step "site down un samedi 19h". Applicable à n'importe quel club (NLF, autres clients critiques, sites SaaS).

**Public** : on-call, dev de garde, support.
**Référence delivery** : [`docs/technical/ENVIRONMENTS.md`](../technical/ENVIRONMENTS.md).
**Sources** : `.claude/rules/hotspot-psk.md`, `.claude/rules/raspberry.md`, `.claude/rules/saas.md`, `docs/guides/TROUBLESHOOTING.md`, `docs/clients/*.md`.

---

## ⏱️ TL;DR — 30 secondes

```
1. Dashboard → site impacté → onglet État → connecté ? Hors ligne ? Type ? (pi/saas/demo)
2. Si site_type = saas    → §6 (pas de Pi, regarder cloud uniquement)
   Si site_type = pi      → §2 (identifier la couche cassée)
3. Identifier la couche selon symptôme :
     TV noire / pas de vidéos          → Couche 1 (kiosk + nginx Pi)
     TV OK mais télécommande HS         → Couche 2 (Socket.IO Pi:3000)
     Tout local OK mais cloud absent    → Couche 3 (sync-agent ↔ Railway)
     Cloud OK mais Pi pas joignable     → Couche 0 (réseau / WiFi)
4. Appliquer la procédure §3-§7 selon couche.
5. Si non résolu en 15 min → §8 escalade + capture debug bundle.
6. Cas client critique → §10 (NLF a des spécificités mesh WiFi).
```

---

## 1. Avant toute action

**Confirmer qu'il y a vraiment un incident** :

- [ ] Dashboard `https://neopro-admin.kalonpartners.bzh` → site → onglet État
- [ ] Vérifier `last_seen_at` (si < 2 min, le Pi est connecté, le problème est ailleurs)
- [ ] Ouvrir Slack `#neopro-alerts` — alertes Prometheus actives ? (Alertmanager y poste les criticals)
- [ ] Vérifier statut Railway côté API : `curl -s https://neopro-central-production.up.railway.app/live`

**Si un match est en cours sur la TV** :

- 🔴 **Priorité absolue** = restaurer la diffusion sponsors. Le score peut être figé manuellement après.
- Ne PAS redémarrer le Pi pendant le match si possible (interruption visible). Préférer fix par couche.
- Vérifier §10 si c'est un client critique avec spécificités (NLF…).

---

## 2. Identifier la couche cassée (sites Pi)

| Symptôme observé sur la TV / dashboard                         | Couche probable                 | Section |
| -------------------------------------------------------------- | ------------------------------- | ------- |
| Écran noir, pas de logo Neopro                                 | Couche 1 — kiosk Chromium       | §3.1    |
| Logo Neopro mais pas de vidéos                                 | Couche 1 — webapp / nginx local | §3.2    |
| Vidéos OK, télécommande pas de réponse                         | Couche 2 — Socket.IO local      | §4.1    |
| Télécommande OK mais le score ne remonte pas dans le dashboard | Couche 3 — sync-agent ↔ cloud   | §5.1    |
| Dashboard montre site Hors ligne mais Pi joignable en SSH      | Couche 3 — sync-agent crashé    | §5.2    |
| Pi pas joignable en SSH ni en `ping`                           | Couche 0 — réseau / WiFi        | §3.3    |
| Hotspot WiFi du Pi ne diffuse plus                             | Couche 0bis — hotspot AP        | §3.4    |

Pour les sites SaaS (`site_type = 'saas'`, navigateur uniquement, ADR-037), voir §6.
Pour la stack cloud (Railway down ou dégradé) voir §7.

---

## 3. Couche 1 — Kiosk / webapp local (Pi)

### 3.1 — Écran noir / kiosk crashé

```bash
ssh pi@<host-club>.local   # ex: ssh pi@neopro.local depuis LAN club
sudo systemctl status neopro-kiosk
# Si "failed" ou "inactive":
sudo systemctl restart neopro-kiosk
# Vérifier reprise (Chromium kiosk apparaît en ~5-10 s)
journalctl -u neopro-kiosk -n 50 --no-pager
```

**⚠️ Pi 5 : ne pas ajouter de flags GPU custom** (cf. `.claude/rules/raspberry.md`).

### 3.2 — Logo OK mais pas de vidéos

```bash
# Vidéos présentes ?
ls -lh /home/pi/neopro/videos/*/ | head
# nginx OK ?
sudo nginx -t && sudo systemctl status nginx
# webapp OK ?
curl -s http://localhost/ | head -5
```

**Si vidéos absentes** : sync-agent n'a pas téléchargé → §5.2.
**Si nginx KO** : `sudo systemctl restart nginx`.

### 3.3 — Pi pas joignable en SSH

1. **Test ping** depuis un poste sur le LAN club : `ping <host>.local` puis `ping <IP-fixe-Pi>` si connue.
2. **Si LAN OK mais Pi muet** :
   - Coupure secteur ? Demander au contact club.
   - WiFi décroché ? Le Pi peut être branché Ethernet (privilégier ce câble si présent).
3. **Si on peut accéder physiquement** : LED rouge alimentation ? LED verte activité disque ? Si pas de LED → alimentation HS, remplacement matériel.

### 3.4 — Hotspot WiFi du Pi muet (staff ne se connecte plus)

```bash
ssh pi@<host>.local
sudo systemctl status hostapd
sudo systemctl restart hostapd
# Vérifier conf
cat /etc/hostapd/hostapd.conf | grep -E "ssid|wpa_passphrase"
```

**⚠️ PSK source de vérité = DB cloud** (ADR-074). Ne jamais éditer manuellement le PSK dans `hostapd.conf` — passer par dashboard → "Rotation PSK" qui pousse via cloud → sync-agent.

---

## 4. Couche 2 — Socket.IO local Pi:3000

### 4.1 — Télécommande locale ne répond plus

```bash
ssh pi@<host>.local
sudo systemctl status neopro-server
journalctl -u neopro-server -n 100 --no-pager | tail -50
sudo systemctl restart neopro-server
```

**Test smoke** depuis un téléphone connecté au hotspot :

```
http://192.168.4.1/remote
```

La télécommande doit charger et se connecter (icône verte en haut).

---

## 5. Couche 3 — Sync-agent ↔ Cloud Railway

### 5.1 — Score ne remonte pas dans le dashboard

```bash
ssh pi@<host>.local
sudo systemctl status neopro-sync-agent
journalctl -u neopro-sync-agent -n 200 --no-pager | grep -iE "(error|disconnect|websocket)"
```

**Hypothèses** :

- Sync-agent connecté mais Socket.IO `score-update` cassé côté serveur → vérifier déploiement Railway récent
- Match session pas créée côté cloud → vérifier `match-config` handler (`central-server/src/socket/handlers/match-config.handler.ts`)

### 5.2 — Sync-agent crashé / boucle de redémarrage

```bash
ssh pi@<host>.local
# Le guardian script doit relancer après 3 crashs/5 min
sudo systemctl status sync-agent-guardian
# Force restore "golden" si fichiers corrompus
sudo /home/pi/neopro/scripts/sync-agent-guardian.sh --restore-golden
```

**Si crash en boucle** : capture le bundle de debug avant tout autre fix :

```bash
sudo /home/pi/neopro/scripts/debug-bundle.sh --output /tmp/debug-$(date +%s).tar.gz
scp pi@<host>.local:/tmp/debug-*.tar.gz ./
```

---

## 6. Sites SaaS (pas de Pi, navigateur uniquement)

Pour un site `site_type = 'saas'` (ADR-037), il n'y a pas de Pi. Tout passe par le navigateur du client → API Railway → DB.

**Symptômes possibles** :

- Page blanche / écran de chargement infini → vérifier `.htaccess` SaaS (`/saas/.htaccess` sur Hostinger), workflow `frontend-health.yml` doit l'avoir détecté
- Vidéos qui ne jouent pas → vérifier `resolveVideoUrls` (`saas.controller.ts`) + URLs FTP `kalonpartners.bzh/neopro-video/`
- Profil sponsor non mis à jour → vérifier émission `saas-config-updated` côté serveur (cf. `.claude/rules/saas.md`)

**Procédure** :

```bash
# Test endpoint public
curl -sI "https://neopro-admin.kalonpartners.bzh/api/saas/config?site=<UUID>" | head

# Logs Railway
# Railway dashboard → service neopro-central → Logs → filtrer par siteId
```

Si le SaaS est cassé pour TOUS les sites SaaS → probablement un déploiement Hostinger raté → §8 escalade + rollback.

---

## 7. Cloud côté Railway (API down ou dégradé)

### 7.1 — API down (`/live` ne répond plus)

1. **Status Railway** : https://status.railway.app
2. **Dashboard Railway** : service `neopro-central` → Logs → erreurs récentes
3. **Si crash répétitif** :
   - Vérifier mémoire (cf. `railway-restart.yml` dimanche 4h UTC = workaround memory leak en cours d'investigation)
   - Rollback dernier deploy : Railway → Deployments → "Redeploy" version précédente

### 7.2 — DB Pool saturé

Alerte `DbPoolSaturation` (Prometheus). Pool fixé à 5 (ADR-070). Si saturation :

- Identifier les requêtes lentes : `pg_stat_activity`
- Vérifier alerte `SlowDbQueries`
- Augmenter temporairement le pool en variable Railway si urgent (mais creuser la cause)

---

## 8. Escalade & post-incident

### Si non résolu en 15 min

1. **Capture debug bundle** (cf. §5.2 commande pour les Pi)
2. **Notifier l'équipe** via Slack `#neopro-alerts` (canal déjà câblé Alertmanager)
3. **Décider** :
   - Match en cours sur le site → solution dégradée (vidéos sponsors par défaut, score manuel)
   - Pas de match → fenêtre de maintenance pour fix de fond

### Après résolution

- [ ] Documenter dans `docs/clients/<CLIENT>.md` §"Historique des incidents" (créer le fichier si client critique sans doc)
- [ ] Si bug logiciel → ouvrir issue + ADR si décision architecturale
- [ ] **Postmortem blameless** si l'incident a duré > 30 min ou a impacté un match
  - Template : `docs/templates/POSTMORTEM.md` (à créer)
  - Action items trackés en backlog

---

## 9. Garde-fous (à NE JAMAIS faire pendant un incident)

- ❌ **Ne PAS verrouiller un BSSID** sur `wpa_supplicant-wlan1.conf` (réseaux mesh — casse le roaming)
- ❌ **Ne PAS pousser un déploiement OTA** pendant un match
- ❌ **Ne PAS modifier le PSK hotspot manuellement** dans `hostapd.conf` (passer par cloud, ADR-074)
- ❌ **Ne PAS reformater le Pi** sans avoir tenté §3-§5 (les vidéos peuvent prendre 1-2h à re-télécharger)
- ❌ **Ne PAS supprimer `__manual_deploy_only__/trigger.md`** ni toucher à `railway.json` watchPatterns en urgence (cassera la prochaine release prod — refonte Sprint 2 prévue)
- ❌ **Ne PAS rollback une migration DB** sans tester le down-script en staging

---

## 10. Cas particuliers — clients critiques

Certains clients ont des spécificités documentées. **Toujours consulter avant intervention** :

| Client                         | Doc                                        | Particularité                                                          |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------- |
| **NLF** (Nantes Loire Féminin) | [`docs/clients/NLF.md`](../clients/NLF.md) | Mesh WiFi 3+ APs, gros client — **interdit BSSID lock**, bgscan ajusté |
| _autres clients critiques_     | _(à compléter)_                            | _(à compléter)_                                                        |

### 10.1 — Spécificités NLF

- **Site ID** : `c994620c-2016-40f3-9399-2d0345f69274`
- **SSH** : `ssh pi@neopro.local` (LAN club). Le Pi `neopro.local` à domicile = **le Pi prod NLF** (cf. memory perso `project_nlf_pi_home_prep.md`)
- **WiFi** : SSID `NLFH`, mesh 3+ APs, `bgscan="simple:30:-70:300"` ajusté dynamiquement (v3.116.25+)
- **Avant tout déploiement OTA** :
  1. Vérifier qu'aucun BSSID n'est verrouillé (Dashboard → Debug → WiFi Client wlan1)
  2. Préférer heures creuses, prévenir contact NLF
  3. Avoir le plan B Ethernet + identifiants SSH prêts
  4. Surveiller 30 min après déploiement
- **Récupération réseau dédiée** :

  ```bash
  # Supprimer tout BSSID lock
  sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
  sudo wpa_cli -i wlan1 reconfigure
  # Forcer reconnexion
  sudo dhclient -r wlan1 && sudo dhclient wlan1
  iwconfig wlan1
  ping -c 3 8.8.8.8
  ```

Détails complets : [`docs/clients/NLF.md`](../clients/NLF.md).

---

## 11. Liens utiles

- [Troubleshooting général](TROUBLESHOOTING.md)
- [Architecture Pi](../technical/ARCHITECTURE.md)
- [Hotspot PSK ADR-074](../adr/ADR-074-hotspot-psk-cloud-source-of-truth.md)
- [Match sessions ADR-093](../adr/ADR-093-match-sessions-persistence-and-history.md)
- [Environnements & delivery](../technical/ENVIRONMENTS.md)
- [Profil client NLF](../clients/NLF.md)

---

**Dernière mise à jour** : 25 Avril 2026 (Sprint 2 — runbook rendu global, NLF en section dédiée §10, ajout §6 SaaS et §7 cloud Railway)
