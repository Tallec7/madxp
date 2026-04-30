/**
 * Cloudflare Pages Function — catch-all racine `/*` (ADR-071 phase 3 + suite)
 *
 * Pourquoi : Cloudflare Pages applique la règle `_redirects` `/* /index.html 200`
 * pour TOUTES les requêtes 404, y compris les assets `.js`/`.css`/etc. Combiné
 * avec la règle `_headers` `*.js → Cache-Control: max-age=31536000, immutable`,
 * un asset 404 (chunk inexistant à un sous-path) est servi en `200 text/html`
 * puis cached PENDANT 1 AN comme JS chunk dans le CDN + browsers, provoquant
 * des MIME errors persistantes ("Failed to load module script: text/html").
 *
 * Cas concret observé :
 *   1. Le HTML retourne `Link: <chunk-EWCAUUAQ.js>; rel="modulepreload"`
 *      (auto-généré par CF Pages depuis les `<link>` du HTML).
 *   2. Le browser résout ce Link relativement à l'URL de la réponse
 *      (= la route SPA courante, ex `/sites/123`), AVANT de parser le HTML
 *      et voir `<base href="/">`.
 *   3. Le browser fetch `/sites/123/chunk-EWCAUUAQ.js` → 404 réel.
 *   4. Le `_redirects` SPA fallback retourne `/index.html` en 200 HTML.
 *   5. `_headers` applique `immutable 1 an` sur les `*.js` → cache pourri.
 *
 * Stratégie identique à la Function `/saas/[[catchall]].js` :
 * 1. Tente de servir le request comme asset statique (env.ASSETS.fetch)
 * 2. Si 308 trailing-slash auto-généré par Cloudflare → suivre le redirect
 *    serveur-side et retourner 200 au client.
 * 3. Si 404 ET path = asset (extension `.js`/`.css`/etc) → propager 404
 *    tel quel. Bloque la pollution du cache via fallback HTML.
 * 4. Si 404 ET path = route SPA (sans extension) → fallback sur /index.html
 *    avec `Cache-Control: no-store` pour empêcher la mise en cache du shell.
 *
 * NB : cette Function REMPLACE la règle `_redirects` `/* /index.html 200`,
 * qui doit être supprimée pour éviter les doubles fallbacks. Elle COEXISTE
 * avec `central-dashboard/cloudflare/functions/saas/[[catchall]].js` :
 * Cloudflare Pages route en priorité par spécificité, donc `/saas/*` est
 * intercepté par la Function SaaS, et `/<reste>` par celle-ci.
 */

const ASSET_EXTENSION_RE = /\.[a-z0-9]+$/i;

const isTrailingSlashRedirect = (response) =>
  (response.status === 308 || response.status === 301) &&
  response.headers.has('Location');

const isAssetRequest = (pathname) => ASSET_EXTENSION_RE.test(pathname);

export const onRequest = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  let response = await env.ASSETS.fetch(request);

  // Suivre le 308 trailing-slash auto-généré par Cloudflare quand un stub
  // `/<route>/index.html` existe et que la requête est sans slash final.
  if (isTrailingSlashRedirect(response)) {
    const targetUrl = new URL(response.headers.get('Location'), url);
    if (!targetUrl.search && url.search) {
      targetUrl.search = url.search;
    }
    response = await env.ASSETS.fetch(new Request(targetUrl, request));
  }

  // Asset 404 → propager. Ne JAMAIS fallback vers HTML pour empêcher la
  // pollution du cache 1 an via `_headers` `*.js → immutable`.
  if (response.status === 404 && isAssetRequest(url.pathname)) {
    return response;
  }

  // 404 sur route SPA (sans extension) → fallback /index.html.
  // Le router Angular gère le routing client-side.
  if (response.status === 404) {
    const fallbackUrl = new URL('/', url);
    const fallbackResponse = await env.ASSETS.fetch(
      new Request(fallbackUrl, request),
    );
    // Override Cache-Control : empêcher CDN/browser de mémoriser cette
    // réponse fallback. Le SPA shell doit toujours être réévalué.
    const headers = new Headers(fallbackResponse.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(fallbackResponse.body, {
      status: fallbackResponse.status,
      statusText: fallbackResponse.statusText,
      headers,
    });
  }

  return response;
};
