# Runbook incident NLF

> ⚠️ **CLIENT CRITIQUE** — gros client, mesh WiFi complexe. Procédure step-by-step "Pi NLF down un samedi 19h".

**Public** : on-call, dev de garde, support.
**Source** : consolidation [`docs/clients/NLF.md`](../clients/NLF.md), [`.claude/rules/hotspot-psk.md`](../../.claude/rules/hotspot-psk.md), `docs/guides/TROUBLESHOOTING.md`.

**Site ID** : `c994620c-2016-40f3-9399-2d0345f69274`
**SSH** : `ssh pi@neopro.local` (LAN club) — c'est le Pi prod NLF (cf. memory `project_nlf_pi_home_prep.md`)

---

## ⏱️ TL;DR — 30 secondes

```
1. Dashboard → site NLF → onglet État → connecté ? Hors ligne ?
2. Si Hors ligne : SSH Pi via réseau club OU contacter NLF (cf. §6 contacts)
3. Identifier la couche cassée selon symptôme :
     TV noire / pas de vidéos          → Couche 1 (kiosk + nginx Pi)
     TV OK mais télécommande HS         → Couche 2 (Socket.IO Pi:3000)
     Tout local OK mais cloud absent    → Couche 3 (sync-agent ↔ Railway)
     Cloud OK mais Pi pas joignable     → Couche 0 (réseau / WiFi mesh)
4. Appliquer la procédure §3-§5 selon couche.
5. Si non résolu en 15 min → §7 escalade + capture debug bundle.
```

---

## 1. Avant toute action

**Confirmer qu'il y a vraiment un incident** :

- [ ] Dashboard `https://neopro-admin.kalonpartners.bzh` → site NLF → État
- [ ] Vérifier `last_seen_at` (si < 2 min, le Pi est connecté, le problème est ailleurs)
- [ ] Ouvrir Grafana (si accessible) — alertes actives ?
- [ ] Vérifier statut Railway côté API : `curl -s https://neopro-central-production.up.railway.app/live`

**Si un match est en cours sur la TV NLF** :

- 🔴 **Priorité absolue** = restaurer la diffusion sponsors. Le score peut être figé manuellement après.
- Ne PAS redémarrer le Pi pendant le match si possible (interruption visible). Préférer fix par couche.

---

## 2. Identifier la couche cassée

| Symptôme observé sur la TV / dashboard                                    | Couche probable                 | Section |
| ------------------------------------------------------------------------- | ------------------------------- | ------- |
| Écran noir, pas de logo Neopro                                            | Couche 1 — kiosk Chromium       | §3.1    |
| Logo Neopro mais pas de vidéos                                            | Couche 1 — webapp / nginx local | §3.2    |
| Vidéos OK, télécommande pas de réponse                                    | Couche 2 — Socket.IO local      | §4.1    |
| Télécommande OK localement mais le score ne remonte pas dans le dashboard | Couche 3 — sync-agent ↔ cloud   | §5.1    |
| Dashboard montre site Hors ligne mais Pi joignable en SSH                 | Couche 3 — sync-agent crashé    | §5.2    |
| Pi pas joignable en SSH ni en `ping`                                      | Couche 0 — réseau / WiFi        | §3.3    |
| Hotspot WiFi du Pi ne diffuse plus                                        | Couche 0bis — hotspot AP        | §3.4    |

---

## 3. Couche 1 — Kiosk / webapp local

### 3.1 — Écran noir / kiosk crashé

```bash
ssh pi@neopro.local
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

1. **Test ping** depuis un poste sur le LAN club : `ping neopro.local` puis `ping <IP-fixe-Pi>` si connue.
2. **Si LAN OK mais Pi muet** :
   - Coupure secteur ? Demander à NLF (cf. §6 contacts).
   - WiFi mesh décroché ? Le Pi peut être branché Ethernet (privilégier ce câble si présent).
3. **Si on peut accéder physiquement** : LED rouge alimentation ? LED verte activité disque ? Si pas de LED → alimentation HS, remplacement matériel.

### 3.4 — Hotspot WiFi du Pi muet (staff ne se connecte plus)

```bash
ssh pi@neopro.local
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
ssh pi@neopro.local
sudo systemctl status neopro-server
# Logs récents
journalctl -u neopro-server -n 100 --no-pager | tail -50
# Restart si crashé
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
ssh pi@neopro.local
sudo systemctl status neopro-sync-agent
journalctl -u neopro-sync-agent -n 200 --no-pager | grep -iE "(error|disconnect|websocket)"
```

**Hypothèses** :

- Sync-agent connecté mais Socket.IO `score-update` cassé côté serveur → vérifier déploiement Railway récent
- Match session pas créée côté cloud → vérifier `match-config` handler (`central-server/src/socket/handlers/match-config.handler.ts`)

### 5.2 — Sync-agent crashé / boucle de redémarrage

```bash
ssh pi@neopro.local
# Le guardian script doit relancer après 3 crashs/5 min
sudo systemctl status sync-agent-guardian
# Force restore "golden" si fichiers corrompus
sudo /home/pi/neopro/scripts/sync-agent-guardian.sh --restore-golden
```

**Si crash en boucle** : capture le bundle de debug avant tout autre fix :

```bash
sudo /home/pi/neopro/scripts/debug-bundle.sh --output /tmp/nlf-debug-$(date +%s).tar.gz
# Puis scp -P 22 pi@neopro.local:/tmp/nlf-debug-*.tar.gz ./
```

---

## 6. Contacts NLF

| Rôle                    | Nom                                        | Contact | Disponibilité         |
| ----------------------- | ------------------------------------------ | ------- | --------------------- |
| Contact principal       | _(à compléter — voir docs/clients/NLF.md)_ |         |                       |
| Contact technique salle | _(à compléter)_                            |         | Accès salle technique |
| Backup club             | _(à compléter)_                            |         |                       |

**Accès physique** : voir `docs/clients/NLF.md` §"Accès physique".

---

## 7. Escalade & post-incident

### Si non résolu en 15 min

1. **Capture debug bundle** (cf. §5.2 commande)
2. **Notifier l'équipe** : Discord `#alerts-prod` + mention du ou des on-call
3. **Décider** :
   - Match en cours → solution dégradée (vidéos sponsors par défaut, score manuel)
   - Pas de match → fenêtre de maintenance pour fix de fond

### Après résolution

- [ ] Documenter dans `docs/clients/NLF.md` §"Historique des incidents"
- [ ] Si bug logiciel → ouvrir issue + ADR si décision architecturale
- [ ] **Postmortem blameless** si l'incident a duré > 30 min ou a impacté un match
  - Template : `docs/templates/POSTMORTEM.md` (à créer Sprint 2)
  - Action items trackés en backlog

---

## 8. Garde-fous (à NE JAMAIS faire pendant un incident NLF)

- ❌ **Ne PAS verrouiller un BSSID** sur `wpa_supplicant-wlan1.conf` (NLF = mesh, le BSSID lock casse le roaming — cf. `docs/clients/NLF.md`)
- ❌ **Ne PAS pousser un déploiement OTA** pendant un match
- ❌ **Ne PAS modifier le PSK hotspot manuellement** dans `hostapd.conf` (passer par cloud, ADR-074)
- ❌ **Ne PAS reformater le Pi** sans avoir tenté §3-§5 (les vidéos peuvent prendre 1-2h à re-télécharger)
- ❌ **Ne PAS supprimer `__manual_deploy_only__/trigger.md`** ni toucher à `railway.json` watchPatterns en urgence (cassera la prochaine release prod — utiliser GitHub Environment, Sprint 2 fix prévu)

---

## 9. Liens utiles

- [Profil client NLF](../clients/NLF.md)
- [Troubleshooting général](TROUBLESHOOTING.md)
- [Architecture Pi](../technical/ARCHITECTURE.md)
- [Hotspot PSK ADR-074](../adr/ADR-074-hotspot-psk-cloud-source-of-truth.md)
- [Match sessions ADR-093](../adr/ADR-093-match-sessions-persistence-and-history.md)
- [Environnements & delivery](../technical/ENVIRONMENTS.md)

---

**Dernière mise à jour** : 25 Avril 2026 (Sprint 1 — création runbook)
