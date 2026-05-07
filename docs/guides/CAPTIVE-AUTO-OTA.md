# Phase 10 — CAPTIVE-AUTO : Procédure de déploiement Pi

> Déploiement de la modification nginx (`wifistub.html` → 302 + nouveau `wifiredirect.html`) sur les Pi de la flotte.
> Source de vérité : `raspberry/config/nginx/neopro-base.conf`.

## Contexte

Phase 10 inverse le signal captif Fire OS : au lieu de répondre `200 Success` (qui dit à Fire OS "Internet OK, pas besoin de portail"), nginx répond désormais `302` vers `/kindle-wifi/wifiredirect.html`, qui redirige vers la racine Pi (`http://192.168.4.1/`).

Cela déclenche le `CaptivePortalLauncher` natif Fire OS → Silk Browser s'ouvre automatiquement sur la page Neopro sans intervention du bénévole (CAPTIVE-05 / CAPTIVE-06).

## Option A — OTA via re-run install.sh (recommandé pour la flotte)

Le mécanisme `install.sh` ligne 678 fait `cp config/nginx/neopro-base.conf /etc/nginx/sites-available/neopro` (Phase 6 plan-05). Il suffit donc de relancer install.sh sur chaque Pi pour propager la nouvelle config.

```bash
ssh pi@<pi-host>
cd /home/pi/neopro
git pull
sudo bash install.sh
sudo systemctl restart nginx
```

Vérifier post-install :

```bash
sudo nginx -t && grep -A 2 "location = /kindle-wifi/wifistub" /etc/nginx/sites-available/neopro
# Doit afficher : return 302 http://$host/kindle-wifi/wifiredirect.html;
```

## Option B — Hotfix scp direct (Pi RACC pour validation)

Pour le Pi RACC `neopro.local` (POC bénévole) :

```bash
# Depuis la worktree
scp raspberry/config/nginx/neopro-base.conf pi@neopro.local:/tmp/neopro-base.conf
ssh pi@neopro.local 'sudo cp /tmp/neopro-base.conf /etc/nginx/sites-available/neopro && sudo nginx -t && sudo systemctl restart nginx'
```

Vérifier la réponse 302 depuis un device sur le hotspot :

```bash
ssh pi@neopro.local 'curl -I -H "Host: spectrum.s3.amazonaws.com" http://192.168.4.1/kindle-wifi/wifistub.html'
# Doit afficher : HTTP/1.1 302 Moved Temporarily
# Location: http://spectrum.s3.amazonaws.com/kindle-wifi/wifiredirect.html
```

## Checklist validation Fire Stick AFTSS (`0c:43:f9:36:04:77`)

- [ ] Fire Stick éteint (débrancher alim 30s)
- [ ] Brancher Fire Stick sur HDMI Pi
- [ ] Au boot Fire OS, sélectionner le Wi-Fi `Neopro-<club>` et entrer le PSK
- [ ] **Observer dans les 10s** : Silk Browser doit s'ouvrir AUTOMATIQUEMENT sur la page Neopro (CAPTIVE-05 / CAPTIVE-06) — OU une notification système "Connectez-vous au réseau" doit apparaître (acceptable, 1 tap télécommande)
- [ ] Si rien ne se déclenche après 30s → fallback CAPTIVE-07 : ouvrir Silk manuellement, taper `firetvcaptiveportal.com` → la page d'attente Neopro doit s'afficher avec la MAC du Fire Stick

## Rollback

Si l'auto-launch casse l'UX d'autres devices (Android, iOS, laptop) :

```bash
ssh pi@<pi-host>
sudo cp /etc/nginx/sites-available/neopro.pre-phase6.bak /etc/nginx/sites-available/neopro
sudo systemctl restart nginx
```

## Métriques observabilité

- Vérifier les logs nginx : `sudo journalctl -u nginx -f` durant la connexion Fire Stick
- 3 requêtes attendues : `GET /kindle-wifi/wifistub.html` (302) puis `GET /kindle-wifi/wifiredirect.html` (302) puis `GET /` (200)
- Si les requêtes `wifistub.html` n'apparaissent pas → DNS hijack `spectrum.s3.amazonaws.com` cassé (vérifier dnsmasq)

## Séquence DNS → nginx → Angular

```
Fire OS boot → probe spectrum.s3.amazonaws.com/kindle-wifi/wifistub.html
    ↓ dnsmasq hijack : spectrum.s3.amazonaws.com → 192.168.4.1
    ↓ nginx : GET /kindle-wifi/wifistub.html → 302 http://$host/kindle-wifi/wifiredirect.html
    ↓ nginx : GET /kindle-wifi/wifiredirect.html → 302 http://192.168.4.1/
    ↓ nginx : GET / → Angular bootstrap
    ↓ Angular router → /api/captive/whoami (CAPTIVE-02)
    ↓ Si MAC assignée : page Neopro plein écran
    ↓ Si MAC inconnue : page d'attente firestick-wait.html (CAPTIVE-03/07)
```

## Référence

- Requirements : CAPTIVE-05 (auto-launch), CAPTIVE-06 (Silk auto-open), CAPTIVE-07 (fallback manuel préservé)
- Plan : `.planning/phases/10-captive-auto/10-01-nginx-wifistub-302-PLAN.md`
- Research : `.planning/phases/10-captive-auto/10-RESEARCH.md`
- Config nginx : `raspberry/config/nginx/neopro-base.conf`
