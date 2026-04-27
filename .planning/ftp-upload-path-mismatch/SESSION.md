# Session : FTP upload path mismatch (Hostinger)

> Démarrée 2026-04-27 18:50 — **Résolue 2026-04-27** (commit `fe8608c5` + ADR-100).

## Résolution

**Cause racine** : `videoRepository.findVideoById` SELECT alias `storage_path AS url`.
`replaceVideo` lisait `String(existing.storage_path)` qui retournait `"undefined"`
(la string littérale, car `String(undefined) === "undefined"`). Le upload écrivait
donc `<chroot>/undefined` à chaque replace, le vrai `storage_path` n'était jamais
overwrite, HTTP 404 garanti.

**Preuves** (logs Railway prod 2026-04-27 18:24:44+) :

```
filename: "undefined"
url: "https://kalonpartners.bzh/neopro-video/undefined"
size: 12842590
```

**Fix** : commit `fe8608c5` lit `existing.url` au lieu de `existing.storage_path`,
ajoute un guard 500 si valeur manquante, smoke test PR3 inversé pour bloquer la
régression. ADR-100 documente le contrat de l'alias.

**Hypothèses initiales fausses** (dépréciées dans le diagnostic ci-dessous) :

- ❌ FTP_PUBLIC_URL serait tronqué — la valeur était correcte (troncature ASCII CLI)
- ❌ Mismatch chroot vs URL — chroot et URL publique étaient corrects
- ❌ Bug dans verify FTP — verify saine, c'est l'upload qui passait `"undefined"`

**Backfill nécessaire après deploy de la PR** :

- 12 vidéos zombies à re-uploader via le bouton Replace (liste plus bas)
- Cleanup `<chroot>/undefined` (~13 MiB) à supprimer en FileZilla manuellement

---

## Contexte (diagnostic original)

Pendant la session du 27/04 (cleanup vidéos orphelines), on a découvert que le bouton **"Remplacer le fichier"** du dashboard (PR #647) ne fonctionne plus correctement en prod. Symptômes :

- 12 replaces exécutés aujourd'hui via `POST /api/videos/:id/replace`
- Tous renvoient `upload_status: 'ready'` côté DB (FTP `SIZE` retourne une vraie taille post-upload)
- **Mais HTTP retourne 404 sur les URLs publiques** (testé sur 3+ paths)
- Les anciennes vidéos uploadées il y a >16 jours marchent toujours (200 OK via HCDN)
- WordPress catch-all sert le 404 (`x-powered-by: PHP/8.3.30`)

## Diagnostic à date

### Confirmé

- `FTP_PUBLIC_URL = https://kalonpartners.bzh/neopro-video` (Railway env, correct)
- `central-server/src/config/ftp-storage.ts` : pas de modif depuis 2 mois
- Le user FTP de Daisy (FileZilla) montre `public_html/neopro-video/videos/67/` avec :
  - `676dd0ee-...thumb.jpg` (16 jours, 9.25 KiB) — la thumbnail seulement
  - `67195013-...mp4` (16 jours, 9.5 MiB) — un autre fichier
  - **Pas de fichier `676dd0ee-...mp4`** — celui que le central-server prétend avoir uploadé
- Permissions des fichiers existants : `-rw-r--r--` (644, OK pour HTTP)
- Pas de `public_html/public_html/` orphelin (cleanup PR #606 fait)

### Hypothèse principale

**Le central-server (Railway) utilise un user FTP différent** de celui de Daisy en FileZilla, qui :

- A un home directory **autre** que `public_html/neopro-video/`
- Le `client.uploadFrom('videos/67/foo.mp4', ...)` écrit dans `<home_user_railway>/videos/67/foo.mp4`
- `client.size()` post-upload trouve le fichier (verify OK)
- Mais HTTP sert depuis `public_html/neopro-video/` qui n'a pas le fichier

### Saga FTP récente (contexte)

PR #597 → #599 → #601 → #602 → #604 → #606 (saga 22-25 avril) sur le sujet chroot Hostinger pour les uploads CI/db-backups. Le commit message de PR #606 mentionne explicitement :

> _"Le FTP user Hostinger EST chrooté sur `public_html/`"_

Possible que :

- La saga a corrigé les CI/backup mais pas le central-server FTP user
- Ou Hostinger a changé un home dir entre 11 avril (uploads qui marchent) et 22 avril

## Pistes à investiguer demain

1. **Récupérer le user FTP de Railway** :

   ```bash
   railway variables --service central-server | grep -E "^FTP_(HOST|USER|PASSWORD|SECURE)"
   ```

   Comparer avec ce que Daisy utilise en FileZilla.

2. **hPanel Hostinger → Avancé → Comptes FTP** : lister tous les users existants avec leur `Directory` (home dir). Identifier lequel correspond à Railway.

3. **Connexion FileZilla avec les credentials EXACTS de Railway** : naviguer dans la racine du user et chercher le fichier perdu (`676dd0ee-847e-4a2d-960c-b70cbdf2df04.mp4`). Trouver le vrai dossier de destination.

4. **Vérifier les logs Railway central-server** lors d'un upload :

   ```bash
   railway logs --service central-server | grep -i "ftp\|upload"
   ```

   Le log `'FTP connected, streaming file from disk'` + `'File streamed to FTP successfully'` montre le filename utilisé. Confirmer que c'est `videos/XX/foo.mp4` sans préfixe parasite.

5. **Si user FTP différent** : 2 options de fix :
   - **A.** Changer `FTP_USER` / `FTP_PASSWORD` de Railway pour utiliser le bon user (celui qui voit `public_html/neopro-video/`)
   - **B.** Ajouter un préfixe path dans `ftp-storage.ts` pour que les uploads aillent à `neopro-video/videos/XX/...` depuis le user Railway actuel

## Risques opérationnels

- **NE PAS faire de Replace en prod** tant que le bug n'est pas fixé : ça crée des rows DB qui pointent sur des fichiers FTP "orphelins" invisibles depuis HTTP. La prochaine cascade DELETE pourrait laisser ces fichiers en orphan.
- **Les uploads "neufs" (POST /api/content/upload)** ont peut-être le même bug. À tester demain. Si oui, **aucun upload vidéo n'a marché aujourd'hui via le dashboard**.
- 12 vidéos en DB sont actuellement dans cet état zombi (upload OK côté DB, fichier inaccessible HTTP). Liste auditée :
  - `2f951262-27aa-4098-8ed2-2e2f6e31112e` JOUEUR_44.mp4
  - `8f36926c-585a-41c0-9a18-967ced7b958c` JOUEUR_09_1.mp4 (×2 replace)
  - `26175251-5249-4ed5-b1e4-89f60b3607fb` JOUEUR_24.mp4
  - `94da7486-c535-45bd-919b-dc9bb1bc347c` JOUEUR_85.mp4
  - `b33bc3f7-ff17-494f-a635-47deb67368da` JOUEUR_90.mp4
  - `92d308f5-ad46-4ad7-9261-87f46876e7e7` JOUEUR_94.mp4
  - `0b757561-acbb-49f3-b96a-8b4ca512900c` JOUEUR_ELISA.mp4
  - `c5bfbdd5-6736-457c-aaa7-61d61c225671` JOUEUR_02.mp4
  - `30717b7d-9b2f-4dbe-b1f2-5823b3d67e0b` JOUEUR_52.mp4
  - `03daafac-0649-45ce-bafc-151a21442126` JOUEUR_28_1.mp4

## Liens utiles

- `central-server/src/services/storage.service.ts` — façade upload vidéos
- `central-server/src/config/ftp-storage.ts:127` — `uploadFileToFtpFromDisk` (vrai upload FTP)
- `central-server/src/config/ftp-storage.ts:425` — `verifyFtpFileExists` (size check post-upload)
- `central-server/src/controllers/content.controller.ts:734` — endpoint `replaceVideo`
- PR #606 (chroot saga finale) : https://github.com/Tallec7/neopro/pull/606
- ADR-098 (observabilité orphelines) : `docs/adr/ADR-098-...md`

## Si le diagnostic confirme un user FTP mauvais

**ADR léger à créer** (cf. `.claude/rules/adr.md`) car c'est un choix de chroot/path qui impacte tous les uploads. Documenter la décision (changer FTP_USER vs ajouter préfixe path) + la migration des 12 fichiers zombies.
