-- Script : Création de l'utilisateur claude_readonly pour MCP Postgres
-- Usage  : railway run psql < central-server/src/scripts/create-claude-readonly.sql
--          (ou psql $DATABASE_URL < ...)
-- Cible  : Railway PostgreSQL (neopro_central / railway)
-- Rôle   : SELECT-only sur toutes les tables — utilisé par Claude Code via MCP
--
-- AVANT de lancer : remplace <PASSWORD> par un mot de passe fort
-- (ex: openssl rand -base64 24)

-- 1. Créer l'utilisateur
CREATE USER claude_readonly WITH PASSWORD '<PASSWORD>';

-- 2. Autoriser la connexion à la base
GRANT CONNECT ON DATABASE railway TO claude_readonly;

-- 3. Autoriser l'usage du schema public
GRANT USAGE ON SCHEMA public TO claude_readonly;

-- 4. SELECT sur toutes les tables existantes
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_readonly;

-- 5. SELECT sur toutes les futures tables (migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO claude_readonly;

-- 6. SELECT sur les séquences (lecture de currval/nextval)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO claude_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO claude_readonly;

-- Vérification post-exec
SELECT usename, usecreatedb, usesuper FROM pg_user WHERE usename = 'claude_readonly';
