/**
 * Types pour le système RAG (Retrieval Augmented Generation)
 */

// Types de sources pour les documents RAG
export type RagSourceType = 'site' | 'video' | 'config' | 'analytics' | 'deployment';

// Document RAG
export interface RagDocument {
  id: string;
  source_type: RagSourceType;
  source_id: string;
  title: string | null;
  content: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// Chunk de document avec embedding
export interface RagChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// Résultat de recherche vectorielle
export interface RagSearchResult {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  source_type: RagSourceType;
  source_id: string;
  metadata: Record<string, unknown>;
}

// Conversation RAG
export interface RagConversation {
  id: string;
  user_id: string;
  site_id: string | null;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

// Message dans une conversation RAG
export type RagMessageRole = 'user' | 'assistant' | 'system';

export interface RagMessage {
  id: string;
  conversation_id: string;
  role: RagMessageRole;
  content: string;
  source_chunks: string[];
  metadata: RagMessageMetadata;
  created_at: Date;
}

export interface RagMessageMetadata {
  tokens_prompt?: number;
  tokens_completion?: number;
  latency_ms?: number;
  model?: string;
  temperature?: number;
}

// Configuration du service d'embeddings
export interface EmbeddingConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  dimensions: number;
  apiKey: string;
  baseUrl?: string;
}

// Configuration du service LLM
export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  baseUrl?: string;
}

// Options de chunking
export interface ChunkingOptions {
  chunkSize: number;       // Taille cible du chunk en tokens
  chunkOverlap: number;    // Chevauchement entre chunks
  minChunkSize: number;    // Taille minimum d'un chunk
  separators: string[];    // Séparateurs pour le découpage
}

// Options de recherche RAG
export interface RagSearchOptions {
  matchCount: number;          // Nombre de résultats à retourner
  matchThreshold: number;      // Seuil de similarité (0-1)
  sourceTypes?: RagSourceType[]; // Filtrer par types de sources
  sourceId?: string;           // Filtrer par source spécifique
  includeMetadata?: boolean;   // Inclure les métadonnées
}

// Requête RAG
export interface RagQueryRequest {
  query: string;
  conversationId?: string;
  siteId?: string;
  searchOptions?: Partial<RagSearchOptions>;
  systemPrompt?: string;
  includeHistory?: boolean;
  historyLimit?: number;
}

// Réponse RAG
export interface RagQueryResponse {
  answer: string;
  conversationId: string;
  messageId: string;
  sources: RagSearchResult[];
  metadata: {
    tokensPrompt: number;
    tokensCompletion: number;
    latencyMs: number;
    model: string;
    chunksUsed: number;
  };
}

// Indexation de document
export interface IndexDocumentRequest {
  sourceType: RagSourceType;
  sourceId: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IndexDocumentResponse {
  documentId: string;
  chunksCreated: number;
  tokensIndexed: number;
}

// Statistiques RAG
export interface RagStats {
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
  documentsBySource: Record<RagSourceType, number>;
  averageChunkSize: number;
  lastIndexedAt: Date | null;
}

// Prompts système
export interface RagSystemPrompts {
  default: string;
  siteAnalysis: string;
  videoRecommendation: string;
  troubleshooting: string;
  analytics: string;
}

// Context pour la génération
export interface RagContext {
  relevantChunks: RagSearchResult[];
  conversationHistory: RagMessage[];
  systemPrompt: string;
  userQuery: string;
}
