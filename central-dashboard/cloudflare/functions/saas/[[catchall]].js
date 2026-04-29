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
 * Cette Function catch tout `/saas/<anything>` :
 * - Si path = asset statique (extension) → laisser Pages le servir normalement
 * - Sinon → servir `/saas/index.html` (le SaaS Angular router prend le relais)
 */

export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url);

  // Path se termine par une extension de fichier → asset statique, laisser passer
  if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    return next();
  }

  // Sinon, servir /saas/index.html (le SaaS Angular router gère le routing client-side)
  const indexUrl = new URL('/saas/index.html', url);
  return env.ASSETS.fetch(new Request(indexUrl, request));
};
