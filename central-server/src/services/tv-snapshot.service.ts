/**
 * TvSnapshotService — store la dernière frame TV par site (mémoire process).
 *
 * Architecture pull HTTP (alternative au relay Socket.IO `tv-preview:saas-frame`
 * qui s'est révélé fragile : race subscribe, kick serveur post-deploy, dépendance
 * Redis adapter cross-replica). Voir ADR-104.
 *
 * - La TV SaaS POST une frame data:image/jpeg toutes les ~250ms.
 * - L'admin SaaS GET la frame courante toutes les ~250ms.
 * - TTL 3s : si aucune frame n'arrive depuis 3s, le GET retourne 204 (vide).
 * - In-memory uniquement : pas de persistence, pas de Redis. Si le central
 *   redémarre, la prochaine frame TV reseed la Map.
 */

interface SnapshotEntry {
  frame: string;
  receivedAt: number;
}

const TTL_MS = 3000;

class TvSnapshotService {
  private snapshots = new Map<string, SnapshotEntry>();

  set(siteId: string, frame: string): void {
    this.snapshots.set(siteId, { frame, receivedAt: Date.now() });
  }

  get(siteId: string): SnapshotEntry | null {
    const entry = this.snapshots.get(siteId);
    if (!entry) return null;
    if (Date.now() - entry.receivedAt > TTL_MS) {
      this.snapshots.delete(siteId);
      return null;
    }
    return entry;
  }

  size(): number {
    return this.snapshots.size;
  }
}

export const tvSnapshotService = new TvSnapshotService();
export default tvSnapshotService;
