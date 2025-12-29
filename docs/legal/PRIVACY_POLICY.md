# Politique de Confidentialité NEOPRO

**Date de dernière mise à jour :** [DATE À COMPLÉTER]
**Version :** 1.0

---

## 1. Responsable du traitement

**[NOM DE LA SOCIÉTÉ]**
[Forme juridique] au capital de [MONTANT] euros
Siège social : [ADRESSE COMPLÈTE]
RCS [VILLE] n° [NUMÉRO]
N° TVA : [NUMÉRO TVA]

**Contact Protection des Données :**
Email : privacy@neopro.fr
Adresse : [ADRESSE]

---

## 2. Objet de la présente politique

La présente politique de confidentialité a pour objet d'informer les utilisateurs de la plateforme NEOPRO sur :
- Les données personnelles collectées
- Les finalités de leur traitement
- Les destinataires de ces données
- Leurs droits et les moyens de les exercer

NEOPRO est une solution de gestion d'affichage dynamique (digital signage) destinée aux clubs sportifs, permettant la diffusion de contenus vidéo sur écrans via des boîtiers Raspberry Pi.

---

## 3. Données collectées

### 3.1 Données de compte utilisateur

| Donnée | Finalité | Base légale |
|--------|----------|-------------|
| Adresse email professionnelle | Identification, communication | Exécution du contrat |
| Nom complet | Identification | Exécution du contrat |
| Mot de passe (hashé) | Authentification sécurisée | Exécution du contrat |
| Rôle (admin, opérateur, etc.) | Gestion des accès | Exécution du contrat |

### 3.2 Données de connexion et sécurité

| Donnée | Finalité | Base légale | Durée |
|--------|----------|-------------|-------|
| Adresse IP | Sécurité, audit | Intérêt légitime | 12 mois |
| Horodatage des connexions | Sécurité, audit | Intérêt légitime | 12 mois |
| User-Agent navigateur | Diagnostic technique | Intérêt légitime | 12 mois |
| Actions effectuées | Traçabilité, audit | Intérêt légitime | 12 mois |

### 3.3 Données techniques des équipements

| Donnée | Finalité | Base légale |
|--------|----------|-------------|
| Identifiant du site/boîtier | Gestion du parc | Exécution du contrat |
| Métriques système (CPU, RAM, température) | Monitoring, maintenance | Exécution du contrat |
| Version logicielle | Gestion des mises à jour | Exécution du contrat |
| Adresse IP locale | Diagnostic réseau | Exécution du contrat |

### 3.4 Données d'usage et analytics

| Donnée | Finalité | Base légale |
|--------|----------|-------------|
| Statistiques de lecture vidéo | Reporting, facturation sponsors | Intérêt légitime |
| Impressions publicitaires | Reporting sponsors | Intérêt légitime |
| Temps d'affichage | Analyse d'usage | Intérêt légitime |

### 3.5 Données NON collectées

NEOPRO ne collecte **PAS** les données suivantes :
- Données de santé ou biométriques
- Données relatives aux mineurs
- Géolocalisation en temps réel
- Données bancaires (paiements gérés par prestataire tiers)
- Contenus des communications privées

---

## 4. Finalités du traitement

Les données personnelles sont traitées pour les finalités suivantes :

| Finalité | Base légale (Art. 6 RGPD) |
|----------|---------------------------|
| Gestion des comptes utilisateurs | 6.1.b - Exécution du contrat |
| Authentification et sécurité | 6.1.b - Exécution du contrat |
| Support technique | 6.1.b - Exécution du contrat |
| Monitoring des équipements | 6.1.b - Exécution du contrat |
| Statistiques d'affichage | 6.1.f - Intérêt légitime |
| Amélioration du service | 6.1.f - Intérêt légitime |
| Prévention de la fraude | 6.1.f - Intérêt légitime |
| Respect des obligations légales | 6.1.c - Obligation légale |

---

## 5. Destinataires des données

### 5.1 Accès interne
- Personnel technique habilité de NEOPRO
- Service client et support
- Direction (accès restreint)

### 5.2 Sous-traitants

| Prestataire | Service | Localisation | Garanties |
|-------------|---------|--------------|-----------|
| Supabase Inc. | Base de données, stockage | UE (Irlande) | Clauses contractuelles types |
| Render Services Inc. | Hébergement serveur | UE | EU-US Data Privacy Framework |
| Better Stack (Logtail) | Centralisation des logs | UE | RGPD compliant |
| [Prestataire SMTP] | Envoi d'emails | [Localisation] | [Garanties] |

### 5.3 Transferts hors UE
Certains sous-traitants peuvent être situés hors de l'Union Européenne. Dans ce cas, les transferts sont encadrés par :
- Des décisions d'adéquation de la Commission européenne
- Des clauses contractuelles types (CCT)
- Le EU-US Data Privacy Framework pour les prestataires américains certifiés

---

## 6. Durée de conservation

| Type de données | Durée de conservation |
|-----------------|----------------------|
| Compte utilisateur actif | Durée de la relation contractuelle |
| Compte utilisateur supprimé | Suppression immédiate (données personnelles) |
| Logs de connexion | 12 mois glissants |
| Logs d'audit | 5 ans (obligations légales) |
| Statistiques d'affichage | 24 mois |
| Sauvegardes | 7 jours glissants |
| Données de facturation | 10 ans (obligations comptables) |

---

## 7. Sécurité des données

NEOPRO met en œuvre les mesures techniques et organisationnelles suivantes :

### Mesures techniques
- Chiffrement des communications (TLS 1.3)
- Hachage des mots de passe (bcrypt, 10 rounds)
- Authentification multi-facteurs (MFA) disponible
- Chiffrement des sauvegardes (AES-256-GCM)
- Isolation des données par client (Row-Level Security)
- Pare-feu et protection DDoS
- Journalisation des accès

### Mesures organisationnelles
- Accès limité au personnel habilité
- Politique de mots de passe forts
- Sensibilisation du personnel
- Procédure de gestion des incidents

---

## 8. Vos droits

Conformément au RGPD, vous disposez des droits suivants :

| Droit | Description | Comment l'exercer |
|-------|-------------|-------------------|
| **Accès** (Art. 15) | Obtenir une copie de vos données | Email à privacy@neopro.fr |
| **Rectification** (Art. 16) | Corriger des données inexactes | Paramètres du compte ou email |
| **Effacement** (Art. 17) | Supprimer vos données | Fonction "Supprimer mon compte" ou email |
| **Limitation** (Art. 18) | Limiter le traitement | Email à privacy@neopro.fr |
| **Portabilité** (Art. 20) | Exporter vos données | Fonction "Exporter mes données" |
| **Opposition** (Art. 21) | S'opposer au traitement | Email à privacy@neopro.fr |

### Délai de réponse
Nous nous engageons à répondre à vos demandes dans un délai d'**un mois** à compter de la réception. Ce délai peut être prolongé de deux mois en cas de demande complexe.

### Réclamation
Vous pouvez introduire une réclamation auprès de la CNIL :
- Site web : www.cnil.fr
- Adresse : 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07

---

## 9. Cookies et technologies similaires

### 9.1 Cookies utilisés

NEOPRO utilise **uniquement** des cookies strictement nécessaires :

| Cookie | Finalité | Durée |
|--------|----------|-------|
| `neopro_token` | Authentification de session | 8 heures |

### 9.2 Cookies NON utilisés
- Cookies publicitaires
- Cookies de tracking tiers
- Cookies de réseaux sociaux
- Google Analytics ou équivalent

Aucun consentement n'est requis pour les cookies strictement nécessaires (Art. 82 de la loi Informatique et Libertés).

---

## 10. Modifications de la politique

Nous nous réservons le droit de modifier cette politique de confidentialité. En cas de modification substantielle :
- Vous serez informé par email au moins 30 jours avant l'entrée en vigueur
- La date de mise à jour sera modifiée en haut du document
- L'historique des versions sera conservé

---

## 11. Contact

Pour toute question relative à la protection de vos données personnelles :

**Email :** privacy@neopro.fr
**Adresse :** [ADRESSE COMPLÈTE]
**Formulaire :** [URL DU FORMULAIRE SI APPLICABLE]

---

*Cette politique de confidentialité est conforme au Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016 (RGPD) et à la loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés.*
