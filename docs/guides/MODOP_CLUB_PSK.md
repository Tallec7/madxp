# MODOP Club — Votre WiFi MadXP

> Guide à destination du staff d'un club équipé d'un boîtier MadXP (Raspberry Pi).

## À quoi sert le WiFi MadXP ?

Votre boîtier MadXP diffuse un **réseau WiFi local** (hotspot) qui sert **uniquement** à connecter :

- La **télécommande** MadXP (le smartphone/tablette du staff qui pilote la TV)
- Éventuellement le smartphone d'un technicien MadXP lors d'une intervention

Ce WiFi **ne donne pas accès à Internet**. Il ne sert pas à connecter vos téléphones personnels ni ceux de vos membres.

## Comment se connecter à la télécommande MadXP

1. Sur le smartphone/tablette qui servira de télécommande, ouvrir les paramètres WiFi
2. Chercher le réseau nommé `MadXP-<NomDuClub>` (exemple : `MadXP-TVB-Rennes`)
3. Saisir la **PSK WiFi** (mot de passe) — consulter la feuille d'installation remise par MadXP, ou contacter le support
4. Une fois connecté, ouvrir l'URL de la télécommande dans le navigateur : `http://neopro.local`
5. Bookmarker la page

## Où est écrite ma PSK WiFi ?

Trois endroits :

1. **Feuille d'installation** remise par le technicien MadXP lors de l'installation initiale (conservée idéalement dans un classeur dédié)
2. **Sticker** collé sur le boîtier (si l'installation comprenait cette option)
3. **Support MadXP** — en cas de perte, contactez-nous (voir section suivante)

> ⚠️ **Chaque club a une PSK unique**. Ne communiquez pas votre PSK à un autre club ou à un tiers.

## J'ai perdu ma PSK / je veux la changer

Contactez le support MadXP :

- Email : `support@neopro.fr`
- Téléphone : (voir feuille d'installation)

Nous pourrons :

- Vous rappeler votre PSK actuelle (si vous êtes bien le contact référent du club)
- Générer une nouvelle PSK à distance (votre boîtier doit être allumé et connecté à internet)
- Planifier une intervention sur site si besoin

**Délai typique** : nouvelle PSK communiquée en moins de 2 h en semaine.

## Que se passe-t-il si ma PSK est changée ?

Dès que la PSK est rotée :

1. Tous les appareils actuellement connectés (télécommandes, smartphones staff) sont **déconnectés**
2. Il faut **oublier** l'ancien réseau sur chaque appareil :
   - **iOS** : Réglages → WiFi → appuyer sur le (i) à côté du réseau → "Oublier ce réseau"
   - **Android** : Paramètres → WiFi → appuyer longuement sur le réseau → "Oublier"
3. Se reconnecter avec la nouvelle PSK

## Problèmes courants

### Je n'arrive pas à me connecter au WiFi

- Vérifier que vous tapez la bonne PSK (attention aux majuscules/minuscules, caractères `0` vs `O`, `1` vs `l`)
- Vérifier que le boîtier MadXP est allumé (voyant rouge ou vert)
- Essayer d'**oublier** le réseau et vous reconnecter

### La télécommande ne pilote pas la TV

- Vérifier que vous êtes bien connecté au WiFi `MadXP-<NomDuClub>` (pas à un autre WiFi du club ou à vos données mobiles)
- Recharger la page `http://neopro.local`
- Si le problème persiste : redémarrer le boîtier MadXP (débrancher, attendre 10 s, rebrancher)

### Le WiFi MadXP ne donne pas Internet

C'est **normal**. Ce réseau sert uniquement à la télécommande. Pour vos usages internet, utilisez le WiFi habituel du club ou la 4G.

## Puis-je connecter d'autres appareils au WiFi MadXP ?

**Non, ce n'est pas prévu.** Le réseau est dimensionné pour la télécommande uniquement. Y connecter des téléphones personnels, tablettes de caisse, imprimantes, etc. peut :

- Saturer le hotspot et rendre la télécommande instable
- Exposer votre réseau local MadXP à des risques de sécurité

Si vous avez un besoin de connectivité supplémentaire, contactez le support.

## Références

- Modop support (interne MadXP) : [MODOP_SUPPORT_PSK.md](MODOP_SUPPORT_PSK.md)
- Guide utilisateur général : [GUIDE_UTILISATEUR.md](GUIDE_UTILISATEUR.md)
- Télécommande et QR code : [QR_CODE_REMOTE.md](QR_CODE_REMOTE.md)
