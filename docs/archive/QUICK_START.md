# Quick Start - NEOPRO Fleet Management

Guide de démarrage rapide pour ajouter votre premier boîtier à la flotte.

---

## 1. Créer un site dans le dashboard (2 min)

1. Connectez-vous au dashboard : `https://neopro.onrender.com`
2. Allez dans **Sites** → **+ Nouveau site**
3. Remplissez :
   - Nom du site : `Site Rennes`
   - Nom du club : `Rennes FC`
   - Ville : `Rennes`
   - Région : `Bretagne`
4. Cliquez sur **Créer**
5. Ouvrez le site créé (icône 👁️)
6. **Notez** :
   - ✅ L'ID du site
   - ✅ La clé API (copiez-la avec l'icône 📋)

---

## 2. Installer l'agent sur le Raspberry Pi (5 min)

Connectez-vous au Raspberry Pi (SSH ou direct) :

```bash
# 1. Installer Node.js (si pas déjà fait)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Cloner le projet
cd /home/pi
git clone https://github.com/Tallec7/neopro.git
cd neopro/raspberry/sync-agent

# 3. Installer les dépendances
npm install

# 4. Enregistrer le site
sudo node scripts/register-site.js
```

Entrez les informations demandées :
- URL serveur : `https://neopro.onrender.com`
- ID du site : *[celui noté à l'étape 1]*
- Clé API : *[celle notée à l'étape 1]*

```bash
# 5. Installer le service
sudo node scripts/install-service.js

# 6. Démarrer l'agent
sudo systemctl start neopro-agent
sudo systemctl enable neopro-agent

# 7. Vérifier que ça tourne
sudo systemctl status neopro-agent
```

---

## 3. Vérifier la connexion (30 sec)

1. Retournez sur le dashboard
2. Allez dans **Sites**
3. Votre site devrait afficher **🟢 Online**
4. Cliquez dessus pour voir les métriques en temps réel

**C'est fait !** Votre premier boîtier est connecté. 🎉

---

## Prochaines étapes

### Organiser vos sites
- Créez des **groupes** pour organiser vos sites (Sport, Région, etc.)
- Exemple : "Clubs de football Bretagne"

### Déployer du contenu
1. Allez dans **Gestion du contenu**
2. Uploadez une vidéo
3. Déployez-la vers un site ou un groupe

### Déployer une mise à jour
1. Allez dans **Gestion des mises à jour**
2. Créez une nouvelle version
3. Déployez-la vers vos sites

---

## Commandes utiles (Raspberry Pi)

```bash
# Voir les logs de l'agent
sudo journalctl -u neopro-agent -f

# Redémarrer l'agent
sudo systemctl restart neopro-agent

# Arrêter l'agent
sudo systemctl stop neopro-agent

# Voir la configuration
sudo cat /etc/neopro/site.conf
```

---

## Problème ?

### Le site n'apparaît pas Online

```bash
# Vérifier que l'agent tourne
sudo systemctl status neopro-agent

# Vérifier les logs
sudo journalctl -u neopro-agent -n 50

# Tester la connexion au serveur
curl https://neopro.onrender.com/api/health
```

### Besoin d'aide ?

Consultez le [**Guide complet d'administration**](./ADMIN_GUIDE.md) pour plus de détails.

---

**Version** : 1.0
**Documentation complète** : [ADMIN_GUIDE.md](./ADMIN_GUIDE.md)
