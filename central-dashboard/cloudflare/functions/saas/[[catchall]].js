/**
 * Cloudflare Pages Function — catch-all sous /saas/* (ADR-071 phase 3)
 *
 * Pourquoi : Cloudflare Pages applique un SPA fallback INTRINSÈQUE pour les
 * paths inconnus (sert `index.html` en 200, même sans `_redirects`). Combiné
 * avec `_headers` `*.js → max-age=31536000, immutable`, un asset 404 est
 * servi en HTML 200 puis cached comme JS chunk PENDANT 1 AN. Combiné aussi
 * avec les `Link: <chunk-X>; rel="modulepreload"` HTTP headers que CF Pages
 * auto-génère (qui se résolvent côté browser **relativement à l'URL de la
 * réponse**), tout iframe ou deep route préchargeait des chunks à des
 * chemins inexistants → MIME errors persistantes.
 *
 * Stratégie de défense en profondeur :
 *
 * 1. Tente env.ASSETS.fetch(request).
 * 2. Si 308 trailing-slash auto-généré → suivre le redirect serveur-side.
 * 3. **Détection content-type mismatch** : si le path est un asset
 *    (`*.js`/`*.css`/etc.) MAIS la réponse est HTML → c'est l'auto-fallback
 *    intrinsèque de CF Pages. Retourner un vrai 404 avec `Cache-Control: no-store`.
 *    Empêche le cache de mémoriser un HTML servi pour une URL `*.js` (ce qui
 *    serait alors cached comme `immutable` par `_headers`).
 * 4. **Strip des Link `rel="modulepreload"` headers** sur les responses HTML :
 *    CF Pages les auto-injecte avec des paths relatifs depuis le `<link>` du
 *    HTML. Ces paths ne se résolvent correctement côté browser que si l'URL
 *    de la réponse est exactement `/saas/`. Pour toute deep route
 *    (`/saas/display/0/`, etc.), la résolution échoue (cherche
 *    `/saas/display/0/chunk-X.js` qui n'existe pas → cache poison).
 *    Le strip force le browser à attendre le parsing du HTML (avec
 *    `<base href="/saas/">`) pour les `<link rel="modulepreload">` du body,
 *    qui résolvent correctement.
 * 5. Override `Cache-Control: no-store` sur les responses HTML servies en
 *    fallback (route SPA) — empêche tout cache transitoire.
 */

const ASSET_EXTENSION_RE = /\.[a-z0-9]+$/i;

const isTrailingSlashRedirect = (response) =>
  (response.status === 308 || response.status === 301) &&
  response.headers.has('Location');

const isAssetRequest = (pathname) => ASSET_EXTENSION_RE.test(pathname);

const isHtmlResponse = (response) => {
  const ct = response.headers.get('content-type') || '';
  return ct.includes('text/html');
};

const stripModulePreloadLinks = (response) => {
  const linkHeader = response.headers.get('link');
  if (!linkHeader || !linkHeader.includes('rel="modulepreload"')) {
    return response;
  }
  const filtered = linkHeader
    .split(',')
    .map((d) => d.trim())
    .filter((d) => !/rel="modulepreload"/.test(d))
    .join(', ');
  const headers = new Headers(response.headers);
  if (filtered) {
    headers.set('Link', filtered);
  } else {
    headers.delete('Link');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const notFoundResponse = () =>
  new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const overrideCacheNoStore = (response) => {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequest = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  let response = await env.ASSETS.fetch(request);

  if (isTrailingSlashRedirect(response)) {
    const targetUrl = new URL(response.headers.get('Location'), url);
    if (!targetUrl.search && url.search) {
      targetUrl.search = url.search;
    }
    response = await env.ASSETS.fetch(new Request(targetUrl, request));
  }

  // Asset request + HTML response = auto-fallback intrinsèque CF Pages.
  // Retourner 404 avec no-store pour empêcher pollution du cache 1 an.
  if (isAssetRequest(url.pathname) && isHtmlResponse(response)) {
    return notFoundResponse();
  }

  // HTML response → strip Link modulepreload + force no-store.
  // Empêche le préchargement chunk depuis un path résolu incorrectement
  // (deep routes) ET la mise en cache du shell SPA.
  if (isHtmlResponse(response)) {
    return overrideCacheNoStore(stripModulePreloadLinks(response));
  }

  return response;
};
