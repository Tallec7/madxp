/**
 * Cloudflare Pages Function — catch-all sous /saas/* (ADR-071 phase 3)
 *
 * Pourquoi : Cloudflare Pages n'honore PAS la règle wildcard `_redirects`
 * `/saas/* /saas/index.html 200` pour les sous-paths nested SPAs. Conséquence :
 * tout chemin `/saas/<route>` non couvert par un index.html stub statique
 * (cf. scripts/cloudflare-saas-route-stubs.sh) tombait sur le SPA fallback du
 * dashboard (qui sert `/index.html` avec `<base href="/">`), provoquant des
 * MIME errors sur les chunks (le browser résout les Link-header preloads
 * relativement à l'URL de réponse → `/saas/chunk-*.js` qui n'existent pas).
 *
 * Stratégie :
 * 1. Tente de servir le request comme asset statique (env.ASSETS.fetch)
 * 2. **Si Cloudflare répond 308 trailing-slash** (cas `/saas/tv` → `/saas/tv/`
 *    parce qu'un stub `/saas/tv/index.html` existe), on suit le redirect
 *    serveur-side et on retourne 200 au client.
 * 3. Si 404 ET path = route SPA (sans extension) → fallback sur /saas/
 *    qui sert /saas/index.html. Le router Angular gère ensuite côté client.
 *
 * **Garde-fou critique** : on N'INTERCEPTE PAS les requêtes d'assets
 * (`*.js`, `*.css`, `*.png`, etc.) en 404. Sans ce guard :
 *   - Asset 404 (chunk inexistant) → fallback sert HTML SPA en 200
 *   - `_headers` applique `Cache-Control: max-age=31536000, immutable` à `*.js`
 *   - Le HTML est cached comme JS chunk PENDANT 1 AN dans le CDN + browsers
 *   - Tous les visiteurs voient des MIME errors sur les chunks impactés
 * Avec le guard : asset 404 propage proprement, le browser émet une vraie
 * erreur de chargement (réparable par hard-refresh / bump de hash de chunk).
 *
 * Forçage `Cache-Control: no-store` sur le fallback HTML : double sécurité
 * pour empêcher tout cache (CDN + browser) de mémoriser une réponse
 * fallback potentiellement transitoire (déploiement en cours, propagation
 * partielle).
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
  // `/saas/<route>/index.html` existe et que la requête est sans slash final.
  if (isTrailingSlashRedirect(response)) {
    const targetUrl = new URL(response.headers.get('Location'), url);
    if (!targetUrl.search && url.search) {
      targetUrl.search = url.search;
    }
    response = await env.ASSETS.fetch(new Request(targetUrl, request));
  }

  // Asset 404 (chunk/CSS/image inexistant) → propager 404 tel quel.
  // Ne JAMAIS fallback vers HTML : `_headers` applique cache immutable 1 an
  // sur `*.js`, le HTML serait cached comme JS chunk pour 1 an (bug PR #743).
  if (response.status === 404 && isAssetRequest(url.pathname)) {
    return response;
  }

  // 404 sur route SPA (sans extension) → fallback /saas/index.html.
  // Le router Angular gère le routing client-side.
  if (response.status === 404) {
    const fallbackUrl = new URL('/saas/', url);
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
