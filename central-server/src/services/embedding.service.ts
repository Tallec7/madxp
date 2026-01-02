/**
 * Service d'Embeddings pour le RAG
 * Supporte OpenAI et Voyage AI (recommandé par Anthropic)
 */

import logger from '../config/logger';
import { EmbeddingConfig } from '../types/rag.types';

interface EmbeddingResponse {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

class EmbeddingService {
  private config: EmbeddingConfig;

  constructor() {
    this.config = {
      provider: (process.env.EMBEDDING_PROVIDER as 'openai' | 'anthropic' | 'local') || 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
      apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.EMBEDDING_BASE_URL,
    };

    if (!this.config.apiKey) {
      logger.warn('No embedding API key configured. Set EMBEDDING_API_KEY or OPENAI_API_KEY');
    }
  }

  /**
   * Génère des embeddings pour un ou plusieurs textes
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    if (texts.length === 0) {
      return { embeddings: [], usage: { promptTokens: 0, totalTokens: 0 } };
    }

    switch (this.config.provider) {
      case 'openai':
        return this.generateOpenAIEmbeddings(texts);
      case 'anthropic':
        return this.generateVoyageEmbeddings(texts);
      case 'local':
        return this.generateLocalEmbeddings(texts);
      default:
        throw new Error(`Unknown embedding provider: ${this.config.provider}`);
    }
  }

  /**
   * Génère un embedding pour un seul texte
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.generateEmbeddings([text]);
    return response.embeddings[0] || [];
  }

  /**
   * OpenAI Embeddings API
   */
  private async generateOpenAIEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
          dimensions: this.config.dimensions,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      // Trier par index pour garantir l'ordre
      const sortedEmbeddings = data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((item: { embedding: number[] }) => item.embedding);

      return {
        embeddings: sortedEmbeddings,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      logger.error('OpenAI embedding error:', error);
      throw error;
    }
  }

  /**
   * Voyage AI Embeddings (recommandé par Anthropic)
   * https://docs.voyageai.com/
   */
  private async generateVoyageEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.voyageai.com/v1';
    const model = this.config.model || 'voyage-2';

    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: texts,
          input_type: 'document',
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Voyage API error: ${response.status} - ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding);

      // Pad/truncate to target dimensions if needed
      const normalizedEmbeddings = embeddings.map((emb: number[]) =>
        this.normalizeEmbedding(emb, this.config.dimensions)
      );

      return {
        embeddings: normalizedEmbeddings,
        usage: {
          promptTokens: data.usage?.total_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      logger.error('Voyage embedding error:', error);
      throw error;
    }
  }

  /**
   * Embeddings locaux (fallback simple basé sur TF-IDF simplifié)
   * À remplacer par un modèle local réel en production
   */
  private async generateLocalEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    logger.warn('Using local embeddings - not recommended for production');

    const embeddings = texts.map(text => {
      // Hash-based pseudo-embedding (pour développement uniquement)
      const hash = this.simpleHash(text);
      const embedding = new Array(this.config.dimensions).fill(0);

      for (let i = 0; i < this.config.dimensions; i++) {
        embedding[i] = Math.sin(hash + i) * 0.5 + Math.cos(hash * (i + 1)) * 0.5;
      }

      // Normaliser
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
    });

    return {
      embeddings,
      usage: {
        promptTokens: texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
        totalTokens: texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0),
      },
    };
  }

  /**
   * Normalise un embedding à une taille cible
   */
  private normalizeEmbedding(embedding: number[], targetDimensions: number): number[] {
    if (embedding.length === targetDimensions) {
      return embedding;
    }

    if (embedding.length > targetDimensions) {
      // Truncate
      return embedding.slice(0, targetDimensions);
    }

    // Pad with zeros
    return [...embedding, ...new Array(targetDimensions - embedding.length).fill(0)];
  }

  /**
   * Hash simple pour les embeddings locaux
   */
  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Calcule la similarité cosinus entre deux embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Estime le nombre de tokens dans un texte
   */
  estimateTokenCount(text: string): number {
    // Approximation: ~4 caractères par token en moyenne
    return Math.ceil(text.length / 4);
  }

  /**
   * Récupère la configuration actuelle
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config, apiKey: '***' }; // Masquer la clé API
  }
}

export const embeddingService = new EmbeddingService();
export default embeddingService;
