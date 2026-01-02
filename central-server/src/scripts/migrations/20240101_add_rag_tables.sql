-- Migration: Ajouter les tables pour le RAG (Retrieval Augmented Generation)
-- Date: 2024-01-01
-- Description: Créer les tables nécessaires pour stocker les embeddings et documents RAG

-- Activer l'extension pgvector pour les embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Table pour stocker les documents RAG
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source du document
  source_type VARCHAR(50) NOT NULL, -- 'site', 'video', 'config', 'analytics', 'deployment'
  source_id UUID NOT NULL,

  -- Contenu du document
  title VARCHAR(500),
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL, -- SHA256 pour détecter les changements

  -- Métadonnées
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index unique pour éviter les doublons
  UNIQUE (source_type, source_id, content_hash)
);

-- Table pour stocker les chunks de documents
CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,

  -- Contenu du chunk
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,

  -- Embedding vector (1536 dimensions pour OpenAI, 1024 pour Claude)
  -- Utiliser 1536 pour compatibilité maximale
  embedding vector(1536),

  -- Tokens count pour optimisation
  token_count INTEGER,

  -- Métadonnées
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index pour tri
  UNIQUE (document_id, chunk_index)
);

-- Table pour l'historique des conversations RAG
CREATE TABLE IF NOT EXISTS rag_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Contexte de la conversation
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  title VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour les messages des conversations RAG
CREATE TABLE IF NOT EXISTS rag_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES rag_conversations(id) ON DELETE CASCADE,

  -- Message
  role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,

  -- Chunks utilisés pour générer la réponse (pour l'assistant)
  source_chunks UUID[] DEFAULT '{}',

  -- Métadonnées (tokens, latence, modèle, etc.)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour la recherche vectorielle (IVFFlat - bon compromis performance/précision)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
ON rag_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index pour les recherches par source
CREATE INDEX IF NOT EXISTS idx_rag_documents_source
ON rag_documents (source_type, source_id);

-- Index pour les conversations
CREATE INDEX IF NOT EXISTS idx_rag_conversations_user
ON rag_conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_rag_conversations_site
ON rag_conversations (site_id);

CREATE INDEX IF NOT EXISTS idx_rag_messages_conversation
ON rag_messages (conversation_id, created_at);

-- Fonction pour mettre à jour le timestamp updated_at
CREATE OR REPLACE FUNCTION update_rag_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER trigger_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_updated_at();

CREATE TRIGGER trigger_rag_conversations_updated_at
  BEFORE UPDATE ON rag_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_updated_at();

-- Fonction de recherche vectorielle
CREATE OR REPLACE FUNCTION search_rag_chunks(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7,
  filter_source_type VARCHAR DEFAULT NULL,
  filter_source_id UUID DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT,
  source_type VARCHAR,
  source_id UUID,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity,
    d.source_type,
    d.source_id,
    d.metadata
  FROM rag_chunks c
  JOIN rag_documents d ON c.document_id = d.id
  WHERE
    (filter_source_type IS NULL OR d.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR d.source_id = filter_source_id)
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Commentaires pour documentation
COMMENT ON TABLE rag_documents IS 'Documents indexés pour le RAG - contient le contenu source';
COMMENT ON TABLE rag_chunks IS 'Chunks de documents avec embeddings pour la recherche vectorielle';
COMMENT ON TABLE rag_conversations IS 'Historique des conversations RAG par utilisateur';
COMMENT ON TABLE rag_messages IS 'Messages individuels dans les conversations RAG';
COMMENT ON FUNCTION search_rag_chunks IS 'Recherche vectorielle dans les chunks avec filtres optionnels';
