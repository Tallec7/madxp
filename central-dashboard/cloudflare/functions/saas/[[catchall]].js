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
 * Stratégie "fallback-only" :
 * 1. Tente de servir le request comme asset statique (env.ASSETS.fetch)
 * 2. Si l'asset existe (statut < 400) → retourne tel quel (200, ou 308
 *    redirect géré par Cloudflare pour les paths sans slash final)
 * 3. Si 404 (route SaaS non couverte par un stub) → fallback sur /saas/
 *    qui sert /saas/index.html (SaaS Angular router gère le routing
 *    client-side et affiche son propre 404 si nécessaire)
 *
 * NB : on n'intercepte pas les requests qui réussissent pour ne pas casser
 * les comportements normaux (route stubs, chunks, assets, 308 redirects de
 * Cloudflare). Le fallback ne s'active QUE pour les vrais 404.
 */

export const onRequest = async (context) => {
  const { request, env } = context;

  // Try to serve the request as a static asset first
  const response = await env.ASSETS.fetch(request);

  // 404 only → fallback vers /saas/ (SPA index.html)
  if (response.status === 404) {
    const url = new URL(request.url);
    const fallbackUrl = new URL('/saas/', url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  }

  return response;
};
