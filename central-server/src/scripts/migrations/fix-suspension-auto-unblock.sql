-- Migration: fix-suspension-auto-unblock.sql
-- Date: 2026-02-05
-- Description: Corriger les valeurs auto_unblock des motifs de suspension
--
-- Problème: Le motif "maintenance" avait auto_unblock = true, ce qui causait
-- le déblocage automatique des sites suspendus pour maintenance dès le prochain heartbeat
-- si l'abonnement était encore valide.
--
-- Logique correcte:
-- - auto_unblock = true : motifs liés au paiement (si l'abonnement est renouvelé, on débloque)
-- - auto_unblock = false : motifs nécessitant une intervention manuelle

-- Motifs qui NE doivent PAS se débloquer automatiquement (intervention manuelle requise)
UPDATE subscription_suspension_reasons
SET auto_unblock = false
WHERE code IN ('maintenance', 'abuse', 'request', 'hardware', 'connection');

-- Motifs qui DOIVENT se débloquer automatiquement (si abonnement renouvelé)
UPDATE subscription_suspension_reasons
SET auto_unblock = true
WHERE code IN ('unpaid', 'expired', 'trial_ended');

-- Vérification
SELECT code, label, auto_unblock, message_tv
FROM subscription_suspension_reasons
ORDER BY auto_unblock DESC, code;
