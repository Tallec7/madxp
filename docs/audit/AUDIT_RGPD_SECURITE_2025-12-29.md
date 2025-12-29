# AUDIT INDÉPENDANT NEOPRO
## Conformité RGPD, Sécurité & Architecture SaaS

**Date :** 29 décembre 2025
**Version :** 1.0
**Classification :** Confidentiel

---

# 🚨 RÉSUMÉ EXÉCUTIF SANS FILTRE

## Constat préliminaire CRITIQUE

> **Le projet audité ne correspond PAS à la description fournie.**

L'application NEOPRO n'est **pas** une application de suivi de joueurs sportifs avec données de santé. C'est un **système de gestion et diffusion de contenu vidéo** sur des écrans TV dans des clubs sportifs via des Raspberry Pi.

### Ce que le code révèle réellement :
- **Type d'application** : Système de digital signage / affichage dynamique
- **Utilisateurs réels** : Administrateurs, opérateurs, sponsors, agences (professionnels B2B)
- **Données collectées** : Métriques d'affichage, impressions publicitaires, métriques système
- **Aucune donnée de joueurs** : Pas de nom, prénom, âge, photo, blessures, taille, poids
- **Pas de mineurs comme utilisateurs** : Les spectateurs ne sont pas des utilisateurs de l'app

## Si l'app est lancée demain

| Aspect | Verdict | Détail |
|--------|---------|--------|
| **Légalité immédiate** | ✅ POSSIBLE | Le profil de risque est bien moindre que déclaré |
| **RGPD** | 🟠 AMÉLIORABLE | CGU/Politique confidentialité nécessaires mais risque modéré |
| **Mineurs** | ✅ NON CONCERNÉ | Pas d'utilisateurs mineurs dans le code |
| **Données sensibles** | ✅ NON CONCERNÉ | Pas de données de santé Art. 9 RGPD |
| **Sécurité** | 🟠 CORRECTE | Backups non chiffrés = point à corriger |

---

# 1. TABLEAU CONTRADICTOIRE

| Déclaration du porteur | Constat code | Impact légal/sécurité |
|------------------------|--------------|----------------------|
| "App de suivi de joueurs" | ❌ **FAUX** - Système d'affichage vidéo TV (digital signage) | 🟢 **Positif** : Réduit drastiquement le périmètre RGPD |
| "Joueurs dont mineurs" | ❌ **FAUX** - Utilisateurs = admins, opérateurs, sponsors (B2B) | 🟢 **Positif** : Pas de consentement parental requis |
| "Données sportives (stats, performance)" | ❌ **FAUX** - Données = métriques système (CPU, RAM) + analytics vidéo | 🟢 **Positif** : Pas de données personnelles sensibles |
| "Blessures" | ❌ **FAUX** - Aucune table, champ ou référence aux blessures | 🟢 **Positif** : Pas de données de santé Art. 9 |
| "Taille, poids" | ❌ **FAUX** - Aucun champ height/weight dans le code | 🟢 **Positif** : Pas de données biométriques |
| "Photo d'identité" | ❌ **FAUX** - Seuls logos sponsors/clubs stockés | 🟢 **Positif** : Pas de reconnaissance faciale |
| "Paiements via Stripe" | ❌ **NON IMPLÉMENTÉ** - Mentionné uniquement en roadmap future | 🟢 **Positif** : Pas de données bancaires |
| "Pas de suppression de compte" | 🟠 **PARTIELLEMENT VRAI** - Existe pour super_admin, pas en self-service | 🟠 **À améliorer** : Ajouter endpoint self-service |
| "Sauvegardes non chiffrées" | ✅ **CONFIRMÉ** - Backups JSON en clair `/home/pi/neopro/backups/` | 🔴 **À corriger** : Chiffrer avec AES-256 |
| "Pas de CGU/CGV/politique RGPD" | ⚠️ **NON VÉRIFIABLE** - Fichiers légaux non présents dans le code | 🟠 **À créer** : Documents obligatoires |
| "Géolocalisation temps réel" absente | ✅ **CONFIRMÉ** - Seules coordonnées fixes des clubs (ville/région) | 🟢 **Positif** : Pas de tracking GPS |
| "Accès clubs limité à leurs joueurs" | ❌ **NON APPLICABLE** - Pas de joueurs, isolation par site (RLS) | 🟢 **Positif** : Multi-tenant bien implémenté |

---

# 2. DONNÉES RÉELLEMENT COLLECTÉES

## 2.1 Cartographie des flux de données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUX DE DONNÉES NEOPRO                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│ Raspberry   │────▶│ Central      │────▶│ PostgreSQL   │────▶│ Supabase    │
│ Pi (site)   │     │ Server       │     │ (Supabase)   │     │ Storage     │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
      │                   │                     │                    │
      │ Heartbeat         │ JWT Auth            │ RLS Isolation      │ Videos
      │ Analytics         │ Rate Limit          │ Audit Log          │ Updates
      │ Socket.IO         │ Validation          │                    │
      ▼                   ▼                     ▼                    ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│ localStorage│     │ Redis        │     │ Logtail      │     │ Email SMTP  │
│ (buffer)    │     │ (cache/pub)  │     │ (logs)       │     │ (alertes)   │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
```

## 2.2 Tables de données et leur nature RGPD

### Données personnelles (Art. 4 RGPD)

| Table | Champs personnels | Base légale | Durée conservation |
|-------|-------------------|-------------|-------------------|
| `users` | email, full_name, password_hash | Exécution contrat | Durée du compte |
| `sponsors` | contact_email, contact_name, contact_phone | Intérêt légitime | Durée partenariat |
| `agencies` | contact_email, contact_name, contact_phone | Intérêt légitime | Durée partenariat |

### Données techniques (non personnelles)

| Table | Description | Nature |
|-------|-------------|--------|
| `sites` | Infos Raspberry Pi (IP, version, statut) | Données machine |
| `metrics` | CPU, RAM, température, disque | Télémétrie système |
| `videos` | Métadonnées fichiers vidéo | Contenu média |
| `video_plays` | Historique lectures vidéos | Analytics usage |
| `sponsor_impressions` | Impressions publicitaires | Analytics business |

## 2.3 Données sensibles Art. 9 RGPD

| Catégorie | Présence | Localisation |
|-----------|----------|--------------|
| Origine raciale/ethnique | ❌ ABSENT | - |
| Opinions politiques | ❌ ABSENT | - |
| Convictions religieuses | ❌ ABSENT | - |
| Données génétiques | ❌ ABSENT | - |
| Données biométriques | ❌ ABSENT | - |
| **Données de santé** | ❌ ABSENT | - |
| Vie sexuelle | ❌ ABSENT | - |
| Appartenance syndicale | ❌ ABSENT | - |

> **CONCLUSION** : Aucune donnée sensible Art. 9 RGPD n'est collectée par l'application.

## 2.4 Collectes implicites identifiées

| Type | Source | Données | Risque |
|------|--------|---------|--------|
| **Logs serveur** | Winston + Logtail | IP, user-agent, timestamps, actions | 🟠 Moyen |
| **Audit trail** | `audit_logs` table | user_id, IP, action, target | 🟢 Légal (intérêt légitime) |
| **RLS audit** | `rls_audit_log` table | Accès aux données sensibles | 🟢 Sécurité |
| **Métriques** | Prometheus | Performances serveur | 🟢 Non personnel |
| **localStorage** | Navigateur Pi | Buffer analytics, session | 🟢 Données techniques |
| **Cookies** | HttpOnly JWT | Session authentification | 🟢 Strictement nécessaires |

---

# 3. ANALYSE RGPD DÉTAILLÉE

## 3.1 Qualification du responsable de traitement

- **Responsable** : La société exploitant NEOPRO
- **Sous-traitants** :
  - Supabase (hébergement BDD + stockage)
  - Render (hébergement serveur)
  - Logtail/Better Stack (logs centralisés)
  - SMTP provider (emails alertes)

## 3.2 Bases légales applicables

| Traitement | Base légale | Article RGPD |
|------------|-------------|--------------|
| Gestion comptes utilisateurs | Exécution contrat | Art. 6.1.b |
| Analytics vidéo | Intérêt légitime | Art. 6.1.f |
| Impressions sponsors | Intérêt légitime | Art. 6.1.f |
| Logs sécurité | Intérêt légitime | Art. 6.1.f |
| Alertes email | Intérêt légitime | Art. 6.1.f |

## 3.3 Droits des personnes concernées

| Droit | Implémentation | Statut |
|-------|----------------|--------|
| **Accès** (Art. 15) | ❌ Non implémenté | 🟠 À créer |
| **Rectification** (Art. 16) | ✅ Via édition compte | 🟢 OK |
| **Effacement** (Art. 17) | 🟠 Super_admin only | 🟠 À améliorer |
| **Limitation** (Art. 18) | ❌ Non implémenté | 🟠 À créer |
| **Portabilité** (Art. 20) | ❌ Non implémenté | 🟠 À créer |
| **Opposition** (Art. 21) | ❌ Non implémenté | 🟠 À créer |

## 3.4 Évaluation des risques RGPD

### 🔴 Bloquants légaux (0 identifiés)

> Aucun bloquant légal identifié pour un lancement MVP.

### 🟠 Risques élevés

| Risque | Description | Article | Recommandation |
|--------|-------------|---------|----------------|
| **Absence CGU/Politique** | Documents légaux obligatoires absents | Art. 13-14 | Créer avant lancement |
| **Suppression self-service** | Utilisateurs ne peuvent pas supprimer leur compte | Art. 17 | Ajouter endpoint |
| **Backups non chiffrés** | Fuite potentielle si accès physique | Art. 32 | Chiffrer AES-256 |
| **Export données** | Pas de fonctionnalité portabilité | Art. 20 | Implémenter export JSON |

### 🟢 Acceptables en MVP

| Point | Justification |
|-------|---------------|
| Logs centralisés (Logtail) | Intérêt légitime sécurité, durée limitée |
| Analytics vidéo | Données anonymisées/agrégées, intérêt légitime |
| Pas de DPO désigné | Non obligatoire car pas de traitement grande échelle données sensibles |
| Pas de PIA/AIPD | Non obligatoire car pas de données sensibles Art. 9 |

---

# 4. ANALYSE SÉCURITÉ

## 4.1 Points forts identifiés

| Aspect | Implémentation | Fichier clé |
|--------|----------------|-------------|
| **Hachage mots de passe** | bcrypt (10 rounds) | `auth.controller.ts:61` |
| **JWT sécurisé** | HttpOnly cookies, expiration 8h | `auth.controller.ts:14-21` |
| **MFA/2FA** | TOTP + backup codes | `mfa.service.ts` |
| **Row Level Security** | Isolation multi-tenant PostgreSQL | `enable-row-level-security.sql` |
| **Validation entrées** | Joi schemas, requêtes paramétrées | `validation.ts` |
| **Rate limiting** | Par utilisateur/IP, configurable | `user-rate-limit.ts` |
| **Audit logging** | Actions utilisateurs tracées | `audit.service.ts` |
| **TLS/SSL** | Connexions BDD chiffrées | `database.ts` |

## 4.2 Points faibles identifiés

| Problème | Sévérité | Localisation | Recommandation |
|----------|----------|--------------|----------------|
| **Backups non chiffrés** | 🔴 Haute | `local-backup.js` | AES-256-GCM |
| **Socket.IO CORS '*'** | 🟠 Moyenne | `socket.service.ts:102` | Configurer origins |
| **Pas de protection XSS** | 🟠 Moyenne | Middleware absent | Ajouter helmet |
| **Pas de protection CSRF** | 🟠 Moyenne | Token absent | Implémenter csrf |

## 4.3 Conformité standards

| Standard | Conformité | Détail |
|----------|------------|--------|
| **OWASP Top 10 2021** | 🟠 Partielle | XSS/CSRF à renforcer |
| **ANSSI SecNumCloud** | ❌ Non applicable | Hébergement tiers |
| **ISO 27001** | 🟠 Partielle | Bonnes pratiques suivies |

---

# 5. PRIORISATION DES RISQUES

## Classification finale

### 🔴 Bloquants légaux (0)

*Aucun identifié* - L'application peut être lancée légalement.

### 🟠 Risques élevés (4)

| # | Risque | Délai correction | Effort |
|---|--------|------------------|--------|
| 1 | CGU/CGV/Politique confidentialité absentes | Avant lancement | 2-3 jours |
| 2 | Backups non chiffrés | 1 semaine | 1 jour |
| 3 | Suppression compte self-service | 2 semaines | 1 jour |
| 4 | Export données RGPD | 2 semaines | 1 jour |

### 🟢 Acceptables en MVP (6)

| # | Point | Justification |
|---|-------|---------------|
| 1 | Pas de DPO | < 250 employés, pas de données sensibles |
| 2 | Pas d'AIPD | Pas de traitement haute risque |
| 3 | Logs Logtail | Intérêt légitime, politique rétention claire |
| 4 | Analytics agrégés | Données non personnelles |
| 5 | Pas de consentement cookies | Cookies strictement nécessaires uniquement |
| 6 | Hébergement hors France | Hébergeurs EU-US Data Privacy Framework |

---

# 6. CHECKLIST MVP CONFORME MINIMALE

## ✅ Indispensable AVANT lancement

- [ ] **Politique de confidentialité** (voir structure §8.3)
- [ ] **CGU** (voir structure §8.1)
- [ ] **Mentions légales** dans l'application
- [ ] **Registre des traitements** (document interne)

## 🟠 À faire dans les 2 semaines post-lancement

- [ ] Chiffrement des backups
- [ ] Endpoint suppression compte self-service
- [ ] Endpoint export données utilisateur
- [ ] Configuration CORS Socket.IO production

## 🟢 Peut être différé (non bloquant légal)

- [ ] DPO externe (si évolution > données sensibles)
- [ ] AIPD formelle (si évolution périmètre)
- [ ] Certification ISO 27001
- [ ] Protection XSS/CSRF renforcée

---

# 7. PLAN D'ACTION 14 JOURS

## Semaine 1 : Actions juridiques prioritaires

| Jour | Action | Responsable | Livrable |
|------|--------|-------------|----------|
| J1 | Rédiger politique confidentialité | Juridique | `privacy-policy.md` |
| J2 | Rédiger CGU | Juridique | `terms-of-service.md` |
| J3 | Rédiger CGV clubs | Juridique | `general-sales-conditions.md` |
| J4 | Intégrer documents dans l'app | Dev | Pages légales |
| J5 | Créer registre des traitements | DPO/Juridique | Document interne |

## Semaine 2 : Actions techniques

| Jour | Action | Responsable | Livrable |
|------|--------|-------------|----------|
| J6 | Implémenter chiffrement backups | Dev Backend | `backup.service.ts` modifié |
| J7 | Endpoint DELETE /users/me | Dev Backend | API suppression compte |
| J8 | Endpoint GET /users/me/export | Dev Backend | API export données |
| J9 | Configurer CORS production | DevOps | `socket.service.ts` modifié |
| J10 | Tests et déploiement | QA | Validation production |

## Actions organisationnelles

| Action | Délai | Description |
|--------|-------|-------------|
| Désigner contact RGPD | J1 | Email contact@neopro.fr |
| Former équipe RGPD | J5 | Sensibilisation bonnes pratiques |
| Procédure violation données | J5 | Document interne 72h notification |
| Contrats sous-traitants | J14 | DPA avec Supabase, Render, Logtail |

---

# 8. STRUCTURES DOCUMENTS LÉGAUX

## 8.1 CGU (Conditions Générales d'Utilisation)

```markdown
# Conditions Générales d'Utilisation NEOPRO

## 1. Objet
Description du service de gestion d'affichage dynamique.

## 2. Accès au service
- Création de compte par administrateur
- Niveaux d'accès : super_admin, admin, operator, viewer, sponsor, agency

## 3. Obligations de l'utilisateur
- Confidentialité des identifiants
- Utilisation conforme
- Contenus autorisés

## 4. Propriété intellectuelle
- Contenus uploadés : licence non exclusive accordée
- Plateforme : propriété NEOPRO

## 5. Responsabilités
- Limitation de responsabilité
- Force majeure

## 6. Données personnelles
Renvoi vers politique de confidentialité.

## 7. Résiliation
Conditions de fermeture de compte.

## 8. Droit applicable
Droit français, tribunaux compétents.

## 9. Modification des CGU
Procédure de notification.
```

## 8.2 CGV Clubs (B2B)

```markdown
# Conditions Générales de Vente NEOPRO - Offre Clubs

## 1. Parties
[Société] ci-après "NEOPRO"
Le club souscripteur ci-après "le CLIENT"

## 2. Description du service
- Solution d'affichage dynamique
- Matériel Raspberry Pi (vente ou location)
- Accès plateforme centrale
- Support technique

## 3. Tarification
- Abonnement mensuel/annuel
- Frais de mise en service
- Options : support premium, personnalisation

## 4. Durée et renouvellement
- Engagement minimal
- Tacite reconduction
- Préavis résiliation

## 5. Obligations NEOPRO
- Disponibilité service (SLA)
- Maintenance
- Assistance

## 6. Obligations CLIENT
- Paiement
- Connexion internet
- Utilisation conforme

## 7. Propriété intellectuelle
- Licence d'utilisation
- Contenus clients

## 8. Données personnelles
Clauses sous-traitant RGPD (DPA).

## 9. Limitation de responsabilité
Plafonds, exclusions.

## 10. Droit applicable
Droit français.
```

## 8.3 Politique de Confidentialité

```markdown
# Politique de Confidentialité NEOPRO

Date de dernière mise à jour : [DATE]

## 1. Responsable du traitement
[Nom société]
[Adresse]
Contact : privacy@neopro.fr

## 2. Données collectées

### 2.1 Données de compte
- Email professionnel
- Nom complet
- Mot de passe (hashé)

### 2.2 Données techniques
- Adresses IP
- Logs de connexion
- Métriques d'utilisation

### 2.3 Données métier
- Statistiques d'affichage vidéo
- Impressions publicitaires

## 3. Finalités et bases légales

| Finalité | Base légale |
|----------|-------------|
| Gestion des comptes | Exécution du contrat |
| Analytics plateforme | Intérêt légitime |
| Sécurité et audit | Intérêt légitime |
| Support technique | Exécution du contrat |

## 4. Destinataires
- Personnel NEOPRO habilité
- Sous-traitants : Supabase (BDD), Render (hébergement)
- Pas de transfert hors UE non conforme

## 5. Durée de conservation
- Comptes actifs : durée du contrat
- Logs : 12 mois
- Backups : 7 jours

## 6. Vos droits
- Accès : privacy@neopro.fr
- Rectification : paramètres compte
- Effacement : demande par email
- Portabilité : export disponible
- Opposition : paramètres ou email
- Réclamation CNIL : www.cnil.fr

## 7. Sécurité
- Chiffrement des communications (TLS)
- Hachage des mots de passe
- Authentification multi-facteurs disponible

## 8. Cookies
Nous utilisons uniquement des cookies strictement nécessaires
(authentification). Pas de cookies publicitaires ou de tracking.

## 9. Modifications
Notification par email en cas de modification substantielle.

## 10. Contact DPO
Email : dpo@neopro.fr
```

## 8.4 Consentement Parental Mineurs

> **NON APPLICABLE** - L'application n'a pas d'utilisateurs mineurs.
> Les spectateurs devant les écrans TV ne sont pas des utilisateurs de l'application.

## 8.5 Politique de Conservation/Suppression

```markdown
# Politique de Conservation et Suppression des Données

## 1. Durées de conservation

| Type de données | Durée | Justification |
|-----------------|-------|---------------|
| Comptes utilisateurs | Durée du contrat + 3 ans | Prescription légale |
| Logs de connexion | 12 mois | Sécurité informatique |
| Analytics vidéo | 24 mois | Statistiques business |
| Backups | 7 jours glissants | Restauration système |
| Audit logs | 5 ans | Obligations légales |

## 2. Suppression automatique
- Logs > 12 mois : purge automatique
- Backups > 7 jours : suppression automatique

## 3. Suppression sur demande
- Demande via privacy@neopro.fr
- Traitement sous 30 jours
- Confirmation écrite

## 4. Exceptions à la suppression
- Obligations légales (comptabilité, fiscalité)
- Litiges en cours
- Données anonymisées (statistiques)
```

---

# 9. STRATÉGIE DE RÉDUCTION DE PÉRIMÈTRE

## 9.1 Analyse coût/bénéfice

| Donnée/Fonction | Supprimer ? | Gain légal | Coût produit |
|-----------------|-------------|------------|--------------|
| Analytics vidéo | Non | Faible | Perte insight |
| Logs détaillés | Réduire | Moyen | Acceptable |
| Impressions sponsors | Non | Faible | Core business |
| Coordonnées contacts sponsors | Non | Faible | Nécessaire B2B |
| MFA | Non | - | Renforce sécurité |

## 9.2 Recommandations

### À conserver (core business)
- Gestion utilisateurs
- Analytics vidéo
- Impressions sponsors
- Métriques système

### À optimiser
- **Logs** : Réduire verbosité, anonymiser IPs après 24h
- **Backups** : Chiffrer, réduire rétention à 3 jours

### Fonctions à différer
- Géolocalisation précise (si envisagée)
- Profilage utilisateurs (si envisagé)
- Marketing direct (si envisagé)

---

# 10. ANNEXES

## 10.1 Fichiers clés analysés

| Fichier | Description |
|---------|-------------|
| `/central-server/src/types/index.ts` | Modèles de données |
| `/central-server/src/scripts/init-db.sql` | Schéma BDD |
| `/central-server/src/scripts/migrations/enable-row-level-security.sql` | Politique RLS |
| `/central-server/src/middleware/auth.ts` | Authentification JWT |
| `/central-server/src/services/mfa.service.ts` | MFA TOTP |
| `/central-server/src/controllers/users.controller.ts` | Gestion utilisateurs |
| `/raspberry/sync-agent/src/tasks/local-backup.js` | Sauvegardes |
| `/central-server/src/config/logger.ts` | Configuration logs |

## 10.2 Méthodologie d'audit

1. **Exploration structurelle** : Analyse architecture monorepo
2. **Analyse modèles données** : Schémas SQL + interfaces TypeScript
3. **Vérification flux** : Traçage données front → back → stockage → tiers
4. **Contradiction systématique** : Vérification code vs déclarations
5. **Classification RGPD** : Qualification chaque donnée
6. **Évaluation sécurité** : Revue contrôles techniques

## 10.3 Limitations de l'audit

- **Code seulement** : Documents légaux non présents dans le repo
- **Configuration runtime** : Variables d'environnement non auditées
- **Infrastructure** : Configuration Render/Supabase non vérifiée
- **Tests pénétration** : Non réalisés (audit statique uniquement)

---

# CONCLUSION

## Verdict final

| Critère | Évaluation |
|---------|------------|
| **Peut-on lancer ?** | ✅ OUI, avec documents légaux |
| **Risque CNIL ?** | 🟢 Faible (pas de données sensibles) |
| **Risque utilisateur ?** | 🟢 Faible (B2B uniquement) |
| **Maturité sécurité ?** | 🟠 Correcte (backups à chiffrer) |

## Recommandation

> **Lancement possible** sous condition de créer les documents légaux (CGU, CGV, Politique confidentialité) et de planifier les corrections techniques (backups, suppression compte) dans les 2 semaines suivant le lancement.

Le profil de risque de cette application est **bien inférieur** à ce qui était déclaré. L'absence de données de joueurs, mineurs, et données de santé simplifie considérablement la conformité RGPD.

---

**Fin du rapport d'audit**

*Document généré le 29 décembre 2025*
*Équipe d'audit : Juriste RGPD, Expert Sécurité, Ingénieur Produit*
