# Déploiement Rapide sur Render + Apache

## 📋 Checklist

### 1️⃣ Déployer sur Render (5 min)

- [ ] Aller sur https://render.com
- [ ] New + → Web Service
- [ ] Connecter votre dépôt Git
- [ ] Configuration :
  - Root Directory: `server-render`
  - Build: `npm install`
  - Start: `npm start`
- [ ] Déployer
- [ ] **Noter l'URL fournie** (ex: `https://neopro-socket.onrender.com`)

### 2️⃣ Configurer Angular (2 min)

- [ ] Ouvrir `src/environments/environment.prod.ts`
- [ ] Remplacer `socketUrl` par l'URL Render
- [ ] Lancer `npm run build`

### 3️⃣ Uploader sur Apache (3 min)

- [ ] Aller dans `dist/neopro/browser/`
- [ ] Vérifier que `.htaccess` est présent
- [ ] Uploader tout le contenu sur Apache via FTP

### 4️⃣ Tester (1 min)

- [ ] Ouvrir `/tv` et `/remote`
- [ ] Vérifier la console (F12) : pas d'erreur Socket.IO
- [ ] Cliquer sur une vidéo dans `/remote`
- [ ] Vérifier que la vidéo se lance sur `/tv`

---

## ✅ C'est prêt !

**Besoin d'aide ?** Consultez `GUIDE-DEPLOIEMENT-RENDER.md`

---

## ⚡ Commandes utiles

**Tester en local :**
```bash
cd server-render
./test-local.sh
```

**Rebuilder l'app :**
```bash
npm run build
```

**Voir les logs Render :**
Render Dashboard → Votre service → Logs
