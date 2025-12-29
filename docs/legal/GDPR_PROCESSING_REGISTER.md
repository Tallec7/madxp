# Registre des Activités de Traitement
## NEOPRO - Conformité RGPD Article 30

**Responsable du traitement :** [NOM DE LA SOCIÉTÉ]
**Date de création :** [DATE]
**Dernière mise à jour :** [DATE]
**Contact DPO :** privacy@neopro.fr

---

## 1. Identification du responsable de traitement

| Information | Valeur |
|-------------|--------|
| Raison sociale | [NOM DE LA SOCIÉTÉ] |
| Forme juridique | [FORME] |
| SIRET | [NUMÉRO] |
| Adresse | [ADRESSE COMPLÈTE] |
| Représentant légal | [NOM ET FONCTION] |
| Contact DPO/RGPD | privacy@neopro.fr |

---

## 2. Registre des traitements

### Traitement n°1 : Gestion des comptes utilisateurs

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Gestion des comptes utilisateurs plateforme |
| **Finalité** | Création, authentification et gestion des comptes d'accès à la plateforme NEOPRO |
| **Base légale** | Article 6.1.b RGPD - Exécution du contrat |
| **Catégories de personnes** | Administrateurs, opérateurs, sponsors, agences (professionnels uniquement) |
| **Catégories de données** | Email professionnel, nom complet, mot de passe (hashé), rôle, statut, dates de connexion |
| **Source des données** | Collecte directe lors de la création de compte par un administrateur |
| **Destinataires internes** | Équipe technique, support client |
| **Sous-traitants** | Supabase (BDD), Render (hébergement) |
| **Transferts hors UE** | Oui - USA (Render) - EU-US Data Privacy Framework |
| **Durée de conservation** | Durée du contrat + 3 ans (prescription) |
| **Mesures de sécurité** | Hachage bcrypt, TLS, MFA disponible, RLS PostgreSQL |

---

### Traitement n°2 : Authentification et sécurité

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Journalisation des accès et sécurité |
| **Finalité** | Sécurité du système, détection des intrusions, traçabilité des actions |
| **Base légale** | Article 6.1.f RGPD - Intérêt légitime (sécurité) |
| **Catégories de personnes** | Tous les utilisateurs de la plateforme |
| **Catégories de données** | Adresse IP, user-agent, horodatage, actions effectuées |
| **Source des données** | Collecte automatique lors de l'utilisation |
| **Destinataires internes** | Équipe technique, RSSI |
| **Sous-traitants** | Better Stack/Logtail (logs centralisés) |
| **Transferts hors UE** | Non (Logtail EU) |
| **Durée de conservation** | 12 mois glissants |
| **Mesures de sécurité** | Chiffrement TLS, accès restreint, anonymisation après 12 mois |

---

### Traitement n°3 : Support technique

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Gestion des demandes de support |
| **Finalité** | Traitement des demandes d'assistance technique des clients |
| **Base légale** | Article 6.1.b RGPD - Exécution du contrat |
| **Catégories de personnes** | Utilisateurs ayant contacté le support |
| **Catégories de données** | Email, nom, historique des échanges, données techniques de diagnostic |
| **Source des données** | Demandes des utilisateurs |
| **Destinataires internes** | Équipe support, équipe technique |
| **Sous-traitants** | [Outil de ticketing si applicable] |
| **Transferts hors UE** | Non |
| **Durée de conservation** | 3 ans après clôture du ticket |
| **Mesures de sécurité** | Accès restreint, traçabilité des accès |

---

### Traitement n°4 : Monitoring des équipements

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Télémétrie et monitoring des boîtiers |
| **Finalité** | Surveillance de l'état des équipements, maintenance préventive |
| **Base légale** | Article 6.1.b RGPD - Exécution du contrat |
| **Catégories de personnes** | N/A (données techniques des machines) |
| **Catégories de données** | ID site, métriques CPU/RAM/température/disque, version logicielle, IP locale |
| **Source des données** | Collecte automatique par les boîtiers |
| **Destinataires internes** | Équipe technique |
| **Sous-traitants** | Supabase (stockage) |
| **Transferts hors UE** | Non |
| **Durée de conservation** | 30 jours (métriques temps réel), 12 mois (agrégats) |
| **Mesures de sécurité** | Authentification API key, TLS, RLS |

---

### Traitement n°5 : Analytics d'affichage

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Statistiques de diffusion vidéo |
| **Finalité** | Reporting d'usage, facturation sponsors, amélioration du service |
| **Base légale** | Article 6.1.f RGPD - Intérêt légitime |
| **Catégories de personnes** | N/A (données agrégées, pas de données personnelles directes) |
| **Catégories de données** | ID vidéo, ID site, horodatage lecture, durée, type de déclenchement |
| **Source des données** | Collecte automatique lors de la lecture |
| **Destinataires internes** | Équipe commerciale, sponsors (leurs propres vidéos) |
| **Sous-traitants** | Supabase (stockage) |
| **Transferts hors UE** | Non |
| **Durée de conservation** | 24 mois |
| **Mesures de sécurité** | Agrégation, RLS pour isolation sponsors |

---

### Traitement n°6 : Alertes et notifications

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Envoi d'alertes et notifications |
| **Finalité** | Information des utilisateurs sur les événements système |
| **Base légale** | Article 6.1.b RGPD - Exécution du contrat |
| **Catégories de personnes** | Administrateurs et opérateurs |
| **Catégories de données** | Email, préférences de notification |
| **Source des données** | Paramètres utilisateur |
| **Destinataires internes** | Système automatisé |
| **Sous-traitants** | [Prestataire SMTP] |
| **Transferts hors UE** | [Selon prestataire] |
| **Durée de conservation** | Durée du compte |
| **Mesures de sécurité** | TLS, authentification SMTP |

---

### Traitement n°7 : Facturation

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Gestion de la facturation clients |
| **Finalité** | Émission des factures, suivi des paiements |
| **Base légale** | Article 6.1.b RGPD - Exécution du contrat + Article 6.1.c - Obligation légale |
| **Catégories de personnes** | Clients (représentants légaux, contacts facturation) |
| **Catégories de données** | Raison sociale, adresse, SIRET, contact facturation, historique des factures |
| **Source des données** | Collecte lors de la souscription |
| **Destinataires internes** | Service comptabilité |
| **Sous-traitants** | [Outil comptable si applicable] |
| **Transferts hors UE** | Non |
| **Durée de conservation** | 10 ans (obligations comptables) |
| **Mesures de sécurité** | Accès restreint, chiffrement |

---

### Traitement n°8 : Gestion des demandes RGPD

| Rubrique | Description |
|----------|-------------|
| **Nom du traitement** | Traitement des demandes d'exercice de droits |
| **Finalité** | Répondre aux demandes d'accès, rectification, effacement, portabilité |
| **Base légale** | Article 6.1.c RGPD - Obligation légale |
| **Catégories de personnes** | Personnes exerçant leurs droits |
| **Catégories de données** | Email, nom, copie pièce d'identité (si vérification nécessaire) |
| **Source des données** | Demandes des personnes concernées |
| **Destinataires internes** | DPO / Responsable RGPD |
| **Sous-traitants** | Aucun |
| **Transferts hors UE** | Non |
| **Durée de conservation** | 5 ans (preuve du respect des obligations) |
| **Mesures de sécurité** | Accès restreint au DPO |

---

## 3. Sous-traitants

| Sous-traitant | Service | Localisation | Garanties | Contrat DPA |
|---------------|---------|--------------|-----------|-------------|
| Supabase Inc. | Base de données PostgreSQL, stockage fichiers | UE (Irlande) | CCT | ☐ À signer |
| Render Services Inc. | Hébergement serveur Node.js | USA | EU-US DPF | ☐ À signer |
| Better Stack (Logtail) | Centralisation des logs | UE | RGPD natif | ☐ À signer |
| [Prestataire SMTP] | Envoi d'emails transactionnels | [Lieu] | [À définir] | ☐ À signer |

---

## 4. Transferts hors UE

| Destinataire | Pays | Mécanisme de transfert | Évaluation du risque |
|--------------|------|------------------------|---------------------|
| Render Services Inc. | USA | EU-US Data Privacy Framework | Faible (serveurs UE disponibles) |

---

## 5. Analyse d'impact (AIPD)

### 5.1 Nécessité d'une AIPD

Selon les critères de la CNIL et du CEPD :

| Critère | Applicable | Commentaire |
|---------|------------|-------------|
| Évaluation/scoring automatisé | Non | Pas de profilage |
| Décision automatisée avec effet juridique | Non | Pas de décision auto |
| Surveillance systématique | Non | Pas de vidéosurveillance |
| Données sensibles Art. 9 | Non | Aucune donnée de santé |
| Données à grande échelle | Non | < 10 000 utilisateurs |
| Croisement de données | Non | Pas de croisement externe |
| Personnes vulnérables | Non | Utilisateurs professionnels uniquement |
| Usage innovant | Non | Technologies standards |
| Blocage d'un service | Non | Alternative possible |

**Conclusion : AIPD non obligatoire** (aucun critère de risque élevé rempli)

### 5.2 Recommandation
Une AIPD volontaire pourra être réalisée si :
- Le nombre d'utilisateurs dépasse 10 000
- Des fonctionnalités de profilage sont ajoutées
- Des données de mineurs sont collectées

---

## 6. Mesures de sécurité globales

### 6.1 Mesures techniques

| Mesure | Description | Statut |
|--------|-------------|--------|
| Chiffrement en transit | TLS 1.3 pour toutes les communications | ✅ Actif |
| Chiffrement au repos | Supabase encryption at rest | ✅ Actif |
| Hachage mots de passe | bcrypt avec 10 rounds de salage | ✅ Actif |
| MFA | TOTP disponible pour tous les utilisateurs | ✅ Actif |
| Isolation multi-tenant | Row-Level Security PostgreSQL | ✅ Actif |
| Backups chiffrés | AES-256-GCM | ✅ Actif |
| Rate limiting | Par utilisateur et par IP | ✅ Actif |
| WAF | Protection DDoS via Render | ✅ Actif |

### 6.2 Mesures organisationnelles

| Mesure | Description | Statut |
|--------|-------------|--------|
| Politique d'accès | Principe du moindre privilège | ✅ Actif |
| Formation RGPD | Sensibilisation annuelle de l'équipe | ☐ À planifier |
| Procédure de violation | Notification CNIL sous 72h | ☐ À documenter |
| Revue des accès | Audit trimestriel des droits | ☐ À planifier |
| Tests de sécurité | Pentest annuel | ☐ À planifier |

---

## 7. Procédure en cas de violation de données

### 7.1 Définition
Une violation de données personnelles est une faille de sécurité entraînant, de manière accidentelle ou illicite, la destruction, la perte, l'altération, la divulgation non autorisée de données personnelles.

### 7.2 Procédure

| Étape | Délai | Responsable | Action |
|-------|-------|-------------|--------|
| 1. Détection | Immédiat | Tout collaborateur | Signaler à privacy@neopro.fr |
| 2. Qualification | < 24h | DPO | Évaluer la gravité, documenter |
| 3. Notification CNIL | < 72h | DPO | Si risque pour les personnes |
| 4. Notification personnes | Sans délai | DPO | Si risque élevé |
| 5. Correction | ASAP | Équipe technique | Corriger la faille |
| 6. Post-mortem | < 7 jours | Équipe | Documenter et améliorer |

### 7.3 Registre des violations
Un registre des violations doit être tenu, même si non notifiées à la CNIL.

---

## 8. Historique des modifications

| Date | Version | Modification | Auteur |
|------|---------|--------------|--------|
| [DATE] | 1.0 | Création initiale | [NOM] |

---

## 9. Validation

| Rôle | Nom | Date | Signature |
|------|-----|------|-----------|
| Responsable de traitement | [NOM] | | |
| DPO (si désigné) | [NOM] | | |

---

*Document conforme à l'Article 30 du Règlement (UE) 2016/679 (RGPD)*
