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
 *    serveur-side et on retourne 200 au client. Sans ça, les health checks
 *    SPA (curl sans -L) reçoivent 308 au lieu de 200, et certains user-agents
 *    parent (iframe Angular Remote V2) cassent leur navigation au redirect.
 * 3. Si 404 (route SaaS non couverte par un stub) → fallback sur /saas/
 *    qui sert /saas/index.html (SaaS Angular router gère le routing
 *    client-side et affiche son propre 404 si nécessaire)
 */

const isTrailingSlashRedirect = (response) =>
  (response.status === 308 || response.status === 301) &&
  response.headers.has('Location');

export const onRequest = async (context) => {
  const { request, env } = context;

  let response = await env.ASSETS.fetch(request);

  // Suivre le 308 trailing-slash auto-généré par Cloudflare quand un stub
  // `/saas/<route>/index.html` existe et que la requête est sans slash final.
  // On préserve la query string parce que `URL` la conserve via le base + path.
  if (isTrailingSlashRedirect(response)) {
    const url = new URL(request.url);
    const targetUrl = new URL(response.headers.get('Location'), url);
    // Conserver la query string d'origine si la Location ne la contient pas
    if (!targetUrl.search && url.search) {
      targetUrl.search = url.search;
    }
    response = await env.ASSETS.fetch(new Request(targetUrl, request));
  }

  // 404 (route SaaS non couverte par un stub) → fallback SPA index.html
  if (response.status === 404) {
    const url = new URL(request.url);
    const fallbackUrl = new URL('/saas/', url);
    response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
  }

  return response;
};
