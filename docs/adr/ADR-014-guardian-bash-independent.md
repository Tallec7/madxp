# ADR-014: Guardian Bash Indépendant du Sync-Agent

**Date** : Janvier 2026 (documenté rétroactivement)
**Statut** : Accepté
**Décideurs** : Équipe technique Neopro

---

## Contexte

Le sync-agent est le lien vital entre le Pi et le cloud. S'il crashe, le Pi devient inaccessible à distance. En production, plusieurs cas de crash en boucle ont été observés :

1. **Fichier JS corrompu** : Un `curl` interrompu remplace `agent.js` par du HTML (page d'erreur)
2. **Mise à jour partielle** : Une archive incomplète laisse des fichiers manquants
3. **Bug introduit** : Une mise à jour déploie du code qui crashe au boot
4. **Dépendance manquante** : `node_modules` corrompu après mise à jour

Dans tous ces cas, le sync-agent crashe → systemd le redémarre → il re-crashe → boucle infinie. Le Pi est "vivant" mais invisible pour le cloud.

## Décision

Créer un **watchdog bash ultra-minimal (~200 lignes)** en tant que service systemd séparé, indépendant de Node.js :

```
┌──────────────────┐    ┌──────────────────────┐
│  sync-agent      │    │  sync-agent-guardian  │
│  (Node.js)       │    │  (bash pur)           │
│  - Peut crasher  │◄───│  - Vérifie /30s       │
│  - Dépend de npm │    │  - 0 dépendance       │
│  - Code complexe │    │  - Restaure golden    │
└──────────────────┘    └──────────────────────┘
```

### Fonctionnement

1. Vérifie toutes les 30s si le sync-agent tourne (`systemctl is-active`)
2. Si arrêté → le redémarre
3. Si 3+ crashs en 5 minutes → restaure depuis la version "golden"
4. Détecte les fichiers corrompus (HTML au lieu de JS) → restaure
5. Garde les 5 derniers backups des versions crashées pour debug

### Golden image

```bash
# Créer un snapshot golden (quand le sync-agent est stable)
/home/pi/neopro/scripts/sync-agent-guardian.sh create-golden
# → Copie sync-agent/ vers sync-agent-golden/

# Restauration automatique (ou manuelle)
/home/pi/neopro/scripts/sync-agent-guardian.sh restore
# → Copie sync-agent-golden/ vers sync-agent/
```

## Alternatives Considérées

### 1. Watchdog intégré au sync-agent (Node.js)

**Avantages** :
- Code en un seul endroit
- Accès aux APIs Node.js

**Inconvénients** :
- **Si le sync-agent crashe, le watchdog crashe aussi**
- Un fichier JS corrompu empêche le démarrage du watchdog
- Dépend de Node.js et npm

**Verdict** : Rejeté - Le watchdog doit survivre à ce qu'il surveille.

### 2. Processus Node.js séparé (pm2, forever)

**Avantages** :
- Plus de fonctionnalités que bash

**Inconvénients** :
- Dépend de Node.js (peut aussi crasher si le runtime est corrompu)
- `pm2` ajoute une dépendance globale à maintenir
- Ne peut pas détecter un fichier JS corrompu sans l'exécuter

**Verdict** : Rejeté - Trop de dépendances partagées avec le sync-agent.

### 3. Script bash indépendant ✅

**Avantages** :
- **Zéro dépendance** : bash est toujours disponible sur le Pi
- **Indépendant de Node.js** : Fonctionne même si Node est cassé
- **Ultra simple** : ~200 lignes, facile à auditer
- **Détection corruption** : Peut vérifier si `agent.js` contient `<!DOCTYPE` (HTML)
- **Restauration fiable** : Simple `cp -r` depuis le golden

**Inconvénients** :
- Bash est limité (pas de parsing JSON, etc.)
- Logique de détection basique

**Verdict** : Accepté - La simplicité est une feature. Le guardian doit être le composant le plus fiable du Pi.

## Conséquences

### Positives

1. **Résilience** : Le Pi se répare automatiquement même avec un sync-agent cassé
2. **Indépendance** : Ne dépend d'aucun runtime ou package manager
3. **Debug** : Les 5 derniers backups permettent d'analyser les crashs
4. **Confiance** : On peut déployer des mises à jour plus souvent sachant que le guardian rattrape les erreurs

### Négatives

1. **Deux systèmes à maintenir** : guardian bash + sync-agent Node.js
2. **Golden manuelle** : La golden image doit être créée explicitement quand le sync-agent est stable
3. **Délai de détection** : Jusqu'à 30s avant que le guardian détecte un crash

## Références

- [sync-agent-guardian.sh](../../raspberry/scripts/sync-agent-guardian.sh)
- [neopro-sync-guardian.service](../../raspberry/config/systemd/neopro-sync-guardian.service)
- `/home/pi/neopro/sync-agent-golden/` - Copie de sauvegarde golden
- `/var/log/neopro-sync-guardian.log` - Logs du guardian

---

*Créé le 11 février 2026*
