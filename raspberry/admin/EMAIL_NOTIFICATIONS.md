# Système de Notifications Email

## 📋 Vue d'Ensemble

Système de notifications email pour alerter les administrateurs sur les événements critiques du Raspberry Pi Neopro.

---

## ✨ Fonctionnalités

### Types de Notifications

| Type | Priorité | Trigger |
|------|----------|---------|
| 🚨 **Erreur système critique** | Haute | Service crashé, erreur fatale |
| ⚠️ **Échec de backup** | Haute | Backup quotidien échoué |
| ⚠️ **Échec traitement vidéo** | Haute | Compression/miniature échouée |
| ⚠️ **Espace disque faible** | Haute | < 10% disponible |
| ✅ **Backup réussi** | Normale | Backup quotidien OK (optionnel) |
| ✅ **Test de configuration** | Normale | Validation config email |

### Contenu des Emails

- **Format HTML**: Emails stylisés avec CSS inline
- **Format texte**: Fallback pour clients email basiques
- **Informations détaillées**: Timestamp, hostname, erreur, actions recommandées
- **Liens utiles**: Commandes SSH pour diagnostiquer

---

## 🔧 Configuration

### Variables d'Environnement

```bash
# Activer/Désactiver les notifications
EMAIL_NOTIFICATIONS=true  # ou false

# Configuration SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false  # true pour port 465
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-app  # Voir ci-dessous

# Expéditeur et destinataires
EMAIL_FROM=neopro@votreclub.com  # Optionnel, défaut: SMTP_USER
EMAIL_TO=admin1@club.com,admin2@club.com  # Plusieurs destinataires séparés par virgule

# Informations club
CLUB_NAME=CESSON RENNES MÉTROPOLE HANDBALL
HOSTNAME=neopro.local
```

### Configuration Gmail

Gmail nécessite un "mot de passe d'application" :

1. Activer la validation en 2 étapes sur votre compte Google
2. Aller sur https://myaccount.google.com/apppasswords
3. Créer un mot de passe d'application pour "Mail"
4. Utiliser ce mot de passe dans `SMTP_PASS`

### Configuration Systemd

Éditer le fichier service :

```bash
ssh pi@neopro.local "sudo nano /etc/systemd/system/neopro-admin.service"
```

Ajouter les variables d'environnement :

```ini
[Service]
...
Environment="EMAIL_NOTIFICATIONS=true"
Environment="SMTP_HOST=smtp.gmail.com"
Environment="SMTP_PORT=587"
Environment="SMTP_USER=neopro@votreclub.com"
Environment="SMTP_PASS=xxxx-xxxx-xxxx-xxxx"
Environment="EMAIL_TO=admin@club.com"
Environment="CLUB_NAME=CESSON RENNES"
```

Puis recharger :

```bash
ssh pi@neopro.local "
  sudo systemctl daemon-reload
  sudo systemctl restart neopro-admin
"
```

---

## 🚀 Utilisation

### Test de Configuration

```bash
# Via SSH
ssh pi@neopro.local "cd /home/pi/neopro/admin && node email-notifier.js"

# Via API
curl -X POST http://neopro.local:8080/api/email/test
```

### Vérifier la Configuration

```bash
# Via API
curl http://neopro.local:8080/api/email/config
```

Réponse :

```json
{
  "enabled": true,
  "configured": true,
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "neo***@gmail.com"
  },
  "from": "neopro@votreclub.com",
  "to": ["admin@club.com"],
  "hostname": "neopro.local",
  "clubName": "CESSON RENNES"
}
```

### Envoyer une Notification Personnalisée

```javascript
// Via API
const response = await fetch('http://neopro.local:8080/api/email/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    subject: 'Test',
    text: 'Ceci est un test',
    html: '<h1>Test</h1><p>Ceci est un test</p>',
    priority: 'normal'  // ou 'high'
  })
});
```

### Intégration dans les Scripts

```javascript
// Dans un script Node.js
const emailNotifier = require('./email-notifier');

// Initialiser
await emailNotifier.init();

// Notifier un échec de backup
await emailNotifier.notifyBackupFailure('Erreur disque plein', {
  archive: 'backup-20241218.tar.gz',
  size: '10 MB'
});

// Notifier un échec de traitement vidéo
await emailNotifier.notifyVideoProcessingFailure({
  jobId: '12345',
  filename: 'video.mp4',
  category: 'ATTAQUE',
  size: '50 MB'
}, 'FFmpeg timeout');

// Notifier espace disque faible
await emailNotifier.notifyLowDiskSpace({
  used: '28 GB',
  available: '2 GB',
  percent: '93%'
});

// Notifier erreur système
await emailNotifier.notifySystemError('neopro-app', 'Service crashed', {
  exitCode: 1,
  signal: 'SIGTERM'
});
```

---

## 📊 API REST

### GET /api/email/config

Obtenir la configuration actuelle.

**Réponse** :

```json
{
  "enabled": true,
  "configured": true,
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "neo***@gmail.com"
  },
  "from": "neopro@votreclub.com",
  "to": ["admin@club.com", "tech@club.com"],
  "hostname": "neopro.local",
  "clubName": "CESSON RENNES"
}
```

### POST /api/email/test

Envoyer un email de test.

**Réponse (succès)** :

```json
{
  "success": true,
  "message": "Email de test envoyé avec succès"
}
```

**Réponse (échec)** :

```json
{
  "success": false,
  "error": "Échec de l'envoi de l'email de test"
}
```

### POST /api/email/send

Envoyer une notification personnalisée.

**Body** :

```json
{
  "subject": "Titre de l'email",
  "text": "Contenu texte brut",
  "html": "<h1>Contenu</h1><p>HTML optionnel</p>",
  "priority": "normal"
}
```

**Réponse** :

```json
{
  "success": true,
  "message": "Email envoyé avec succès"
}
```

---

## 📧 Templates d'Emails

### Échec de Backup

```
Sujet: [CESSON RENNES] ⚠️ Échec du Backup Automatique

Le backup automatique a échoué.

⚠️ Erreur: Disk full

Détails:
- Date: 18/12/2024 15:30:00
- Hôte: neopro.local
- Club: CESSON RENNES

Action requise:
Veuillez vérifier les logs:
ssh pi@neopro.local "journalctl -u neopro-backup.service -n 50"

---
Notification automatique Neopro
```

### Échec Traitement Vidéo

```
Sujet: [CESSON RENNES] ⚠️ Échec du Traitement Vidéo

Le traitement d'une vidéo a échoué.

⚠️ Erreur: FFmpeg timeout

Détails de la vidéo:
- Fichier: match-03122024.mp4
- Job ID: 1702916400000-abc123
- Catégorie: ATTAQUE
- Taille: 250 MB

La vidéo originale est conservée.

---
Notification automatique Neopro
```

### Espace Disque Faible

```
Sujet: [CESSON RENNES] ⚠️ Espace Disque Faible

L'espace disque disponible est faible.

⚠️ Attention: Risque de saturation du disque

État du disque:
- Utilisé: 28 GB
- Disponible: 2 GB
- Pourcentage: 93%

Actions recommandées:
1. Supprimer les anciennes vidéos
2. Supprimer les anciens backups
3. Nettoyer les fichiers temporaires

---
Notification automatique Neopro
```

---

## 🔒 Sécurité

### Mots de Passe

- **Ne jamais** commiter les mots de passe SMTP dans Git
- Utiliser des variables d'environnement
- Utiliser des mots de passe d'application (Gmail, Office 365)
- Rotation régulière des mots de passe

### Destinataires

- Limiter aux administrateurs autorisés
- Pas d'adresses publiques (@gmail.com, @hotmail.com, etc.)
- Utiliser des listes de diffusion internes si possible

### Contenu

- Ne pas inclure de mots de passe dans les emails
- Ne pas inclure de clés API
- Limiter les informations sensibles

---

## 🐛 Dépannage

### Les Emails ne Sont pas Envoyés

```bash
# Vérifier la configuration
curl http://neopro.local:8080/api/email/config

# Vérifier les logs
ssh pi@neopro.local "journalctl -u neopro-admin -f | grep email"

# Tester manuellement
ssh pi@neopro.local "cd /home/pi/neopro/admin && node email-notifier.js"
```

### Erreur "Invalid login"

- Vérifier `SMTP_USER` et `SMTP_PASS`
- Pour Gmail: utiliser un mot de passe d'application
- Vérifier que la validation en 2 étapes est activée

### Erreur "Connection timeout"

- Vérifier `SMTP_HOST` et `SMTP_PORT`
- Vérifier la connexion internet du Pi
- Essayer `SMTP_SECURE=true` avec port 465

### Gmail Bloque les Emails

- Activer "Accès aux applications moins sécurisées" (non recommandé)
- **Recommandé**: Utiliser un mot de passe d'application
- Vérifier les paramètres de sécurité Gmail

---

## 📈 Monitoring

### Logs des Envois

```bash
# Voir tous les logs email
ssh pi@neopro.local "journalctl -u neopro-admin | grep '\[email\]'"

# Voir les erreurs uniquement
ssh pi@neopro.local "journalctl -u neopro-admin | grep '\[email\].*error'"

# Compter les emails envoyés aujourd'hui
ssh pi@neopro.local "
  journalctl -u neopro-admin --since today | grep 'Email envoyé' | wc -l
"
```

### Statistiques

```bash
# Emails par type
ssh pi@neopro.local "
  journalctl -u neopro-admin | grep 'Email envoyé' | \
  awk '{print \$NF}' | sort | uniq -c
"
```

---

## 🔮 Améliorations Futures

### Court Terme
- [ ] Digest quotidien (résumé des événements)
- [ ] Filtres de notification (severity levels)
- [ ] Rate limiting (max X emails par heure)

### Moyen Terme
- [ ] Support Slack/Discord webhooks
- [ ] Dashboard des notifications
- [ ] Templates personnalisables

### Long Terme
- [ ] Machine learning pour détection anomalies
- [ ] Intégration monitoring externe (DataDog, etc.)
- [ ] SMS pour alertes critiques

---

## 📚 Ressources

- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [SMTP Configuration](https://www.siteground.com/kb/smtp-configuration/)

---

## 🧪 Exemples de Configuration

### Gmail

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=neopro@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # Mot de passe d'application
```

### Office 365

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=neopro@votreclub.onmicrosoft.com
SMTP_PASS=VotreMotDePasse
```

### OVH

```bash
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=neopro@votredomaine.com
SMTP_PASS=VotreMotDePasse
```

### SendGrid

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=VotreCléAPI
```

---

**Date de création** : 18 décembre 2025
**Version** : 1.0.0
**Auteur** : Claude (Anthropic)
**PR** : À créer
