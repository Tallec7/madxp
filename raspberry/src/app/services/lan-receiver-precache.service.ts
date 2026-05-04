import { Injectable } from '@angular/core';
import { Configuration } from '../interfaces/configuration.interface';
import { Category } from '../interfaces/category.interface';

const MAX_PARALLEL = 2;
const PRECACHE_PRIORITY: RequestPriority = 'low';

/**
 * Précharge les vidéos via fetch() pour remplir le cache HTTP du browser.
 *
 * Cible : receivers LAN (Fire Stick, smart TV browser) qui ouvrent le display
 * du Pi (`http://<pi-lan-ip>/tv`) — chaque play déclenche un fetch HTTP/WiFi
 * complet sans cette warmup, doublant la latence de cold-start sur Fire Stick HD.
 *
 * Le Pi local kiosk (`http://localhost/tv`) lit en FS direct → no-op, on skip.
 *
 * Repose sur les `Cache-Control: public, max-age=2592000, immutable` posés
 * par nginx (`raspberry/config/nginx/neopro-base.conf` et al). Sans ces
 * headers le browser revaliderait à chaque play et le precache ne servirait
 * à rien.
 */
@Injectable({ providedIn: 'root' })
export class LanReceiverPrecacheService {
  private readonly precachedPaths = new Set<string>();
  private precacheRunning = false;

  /**
   * Vrai si la page est servie par un Pi distant (browser receiver LAN),
   * faux si on est sur le kiosk local Pi (loopback). Heuristique
   * conservative : seuls localhost / 127.* / [::1] sont considérés locaux.
   */
  isLanReceiver(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
      return false;
    }
    if (host.startsWith('127.')) return false;
    return true;
  }

  /**
   * Lance le precache des vidéos référencées dans la configuration.
   * Idempotent : un path déjà préchargé n'est pas refetch.
   * Non-bloquant : retourne immédiatement, fetches en background.
   */
  precacheConfiguration(config: Configuration | null | undefined): void {
    if (!this.isLanReceiver()) {
      return;
    }
    if (this.precacheRunning) {
      console.log('[LAN-Precache] already running, skipping new trigger');
      return;
    }
    if (!config) return;

    const paths = this.collectVideoPaths(config);
    const fresh = paths.filter(p => !this.precachedPaths.has(p));
    if (fresh.length === 0) return;

    this.precacheRunning = true;
    console.log(`[LAN-Precache] starting precache: ${fresh.length} videos (${paths.length} total, ${paths.length - fresh.length} already cached)`);
    void this.runQueue(fresh).finally(() => {
      this.precacheRunning = false;
    });
  }

  /**
   * Collecte tous les paths vidéo uniques de la configuration :
   * - sponsors (boucle globale)
   * - timeCategories.sponsors (boucles par phase)
   * - categories[*].videos + subCategories récursif (vidéos manuelles)
   */
  private collectVideoPaths(config: Configuration): string[] {
    const paths = new Set<string>();

    const addPath = (p: string | null | undefined): void => {
      if (typeof p === 'string' && p.length > 0) paths.add(p);
    };

    (config.sponsors ?? []).forEach(v => addPath(v.path));

    (config.timeCategories ?? []).forEach(tc => {
      (tc.loopVideos ?? []).forEach(v => addPath(v.path));
    });

    const walkCategories = (cats: Category[] | undefined): void => {
      (cats ?? []).forEach(cat => {
        (cat.videos ?? []).forEach(v => addPath(v.path));
        walkCategories(cat.subCategories);
      });
    };
    walkCategories(config.categories);

    return Array.from(paths);
  }

  /** Fetch queue throttled (MAX_PARALLEL en vol). */
  private async runQueue(paths: string[]): Promise<void> {
    const queue = [...paths];
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, () =>
      this.worker(queue),
    );
    const start = Date.now();
    await Promise.all(workers);
    const ms = Date.now() - start;
    console.log(`[LAN-Precache] done: ${this.precachedPaths.size} videos in ${ms}ms`);
  }

  private async worker(queue: string[]): Promise<void> {
    while (queue.length > 0) {
      const path = queue.shift();
      if (!path) return;
      await this.fetchOne(path);
    }
  }

  private async fetchOne(path: string): Promise<void> {
    try {
      const url = new URL(path, document.baseURI).toString();
      // mode: 'no-cors' pour ne pas bloquer sur CORS (les videos sont same-origin
      // typiquement, mais on reste défensif). priority: 'low' pour ne pas
      // saturer la bande passante WiFi côté receiver.
      const res = await fetch(url, {
        mode: 'no-cors',
        credentials: 'omit',
        priority: PRECACHE_PRIORITY,
        cache: 'force-cache',
      } as RequestInit);
      // Drain le body pour s'assurer que le browser stocke en cache.
      // (no-cors response = opaque, pas de .body.getReader() utile, mais
      // arrayBuffer() force le download complet.)
      try {
        await res.arrayBuffer();
      } catch {
        // opaque response, ignorer
      }
      this.precachedPaths.add(path);
    } catch (err) {
      console.warn('[LAN-Precache] failed to precache', path, err);
    }
  }
}

type RequestPriority = 'high' | 'low' | 'auto';
