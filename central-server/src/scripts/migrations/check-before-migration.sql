-- Script de vérification avant migration sponsor → advertiser
-- À exécuter avant la migration principale pour identifier les problèmes potentiels

-- 1. Vérifier les rôles existants
SELECT 'Rôles existants dans users:' as info;
SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY count DESC;

-- 2. Vérifier si la contrainte check_role existe
SELECT 'Contrainte check_role existante:' as info;
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conname = 'check_role';

-- 3. Vérifier les tables sponsor* existantes
SELECT 'Tables sponsor* existantes:' as info;
SELECT tablename FROM pg_tables WHERE tablename LIKE 'sponsor%' AND schemaname = 'public';

-- 4. Vérifier la colonne sponsor_id dans users
SELECT 'Colonne sponsor_id dans users:' as info;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('sponsor_id', 'advertiser_id');

-- 5. Compter les sponsors existants
SELECT 'Nombre de sponsors existants:' as info;
SELECT COUNT(*) as sponsors_count FROM sponsors;
