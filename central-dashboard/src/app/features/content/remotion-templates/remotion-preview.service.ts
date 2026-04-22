import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '@env/environment';

/**
 * Logique dédiée à l'iframe de preview Remotion.
 * - Construit l'URL absolue vers `/remotion-preview/` servi par le central-server.
 * - Proxy les URLs FTP (kalonpartners.bzh) via `/api/remotion-templates/asset-proxy`
 *   pour rendre les WebM seekables dans @remotion/player (CSP + CORS + Range).
 */
@Injectable({ providedIn: 'root' })
export class RemotionPreviewService {
  private sanitizer = inject(DomSanitizer);

  /** Base du central-server (sans `/api`) — utilisée pour l'iframe et le proxy. */
  get serverBase(): string {
    return environment.apiUrl.replace(/\/api$/, '');
  }

  /**
   * Construit l'URL de l'iframe de preview pour une composition donnée.
   * Les props sont injectées en query string pour le chargement initial ;
   * les mises à jour ultérieures passent par `postMessage` (plus rapide).
   */
  buildPreviewUrl(compositionId: string, props: Record<string, unknown>): SafeResourceUrl {
    const proxied = this.proxyFtpUrls(props);
    const params = new URLSearchParams({
      composition: compositionId,
      props: encodeURIComponent(JSON.stringify(proxied)),
    });
    const url = `${this.serverBase}/remotion-preview/?${params.toString()}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  /**
   * Remplace les URLs FTP par des URLs proxy same-origin.
   * Nécessaire pour que `<video>` dans @remotion/player reçoive les headers Range.
   */
  proxyFtpUrls(props: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      result[k] = typeof v === 'string' ? this.proxyUrl(v) : v;
    }
    return result;
  }

  /** Proxifie une URL FTP externe via same-origin pour éviter CORB dans le player React. */
  proxyUrl(url: string): string;
  proxyUrl(url: string | null | undefined): string | null | undefined;
  proxyUrl(url: string | null | undefined): string | null | undefined {
    if (!url || !url.includes('kalonpartners.bzh')) return url;
    return `${this.serverBase}/api/remotion-templates/asset-proxy?url=${encodeURIComponent(url)}`;
  }

  /**
   * Envoie les props courantes à l'iframe via `postMessage`.
   * Retourne `true` si le postMessage a été envoyé, `false` sinon (iframe non prête).
   */
  sendPropsUpdate(
    iframe: HTMLIFrameElement | undefined,
    compositionId: string,
    props: Record<string, unknown>,
  ): boolean {
    if (!iframe?.contentWindow) return false;
    iframe.contentWindow.postMessage(
      {
        type: 'remotion-props-update',
        compositionId,
        props: this.proxyFtpUrls(props),
      },
      '*',
    );
    return true;
  }
}
