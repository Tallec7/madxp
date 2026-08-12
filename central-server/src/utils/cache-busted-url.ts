/**
 * Sonder l'ORIGINE d'un fichier, jamais le cache CDN qui est devant.
 *
 * ## Pourquoi ce module existe
 *
 * `getVideoUrl()` pointe un CDN Hostinger. Une requête sur l'URL nue interroge
 * l'edge le plus proche, pas le stockage — et un edge ment dans les deux sens :
 *
 * - **200 fantôme** : il continue de servir un fichier SUPPRIMÉ de l'origine, avec
 *   la bonne taille. Mesuré le 2026-08-11 sur `STRASOL_2025_08_1600x120px.mp4`
 *   (Piraths), 3 fois de suite : `200 / 8 638 728 o` sur l'URL nue, `404 / 4 511 o`
 *   avec cache-buster. Neuf vidéos du club étaient dans ce cas, dont ses deux
 *   sponsors ruban, et l'audit les déclarait saines.
 * - **404 fantôme** : à l'inverse, un négatif mis en cache survit à l'arrivée du
 *   fichier. C'est le risque des vérifications post-upload, aggravé par le retry :
 *   rejouer la même URL rejoue le cache, donc les trois tentatives voient le même
 *   404 périmé et l'upload est déclaré en échec alors qu'il a réussi.
 *
 * Les deux erreurs sont coûteuses et invisibles : dans un cas on croit un fichier
 * vivant, dans l'autre on croit un upload raté. Une URL jamais vue ne peut pas
 * être servie depuis un cache — c'est la seule garantie qui tienne.
 *
 * ## Ce que ce module N'EST PAS
 *
 * À réserver aux sondes d'EXISTENCE. Ne jamais l'appliquer aux URLs servies aux
 * clients (config Pi/SaaS, dashboard) : le cache CDN y est un allié, et une URL
 * unique par requête ferait tomber chaque lecture sur l'origine.
 */

import { randomUUID } from 'crypto';

/**
 * Rend l'URL unique, pour forcer l'origine.
 *
 * **Un UUID par appel, jamais réutilisé** : deux sondes successives (typiquement
 * un HEAD puis son repli en GET Range) doivent porter deux URLs distinctes, sinon
 * la seconde tape le cache que la première vient de remplir — un cache-buster
 * rejoué ne buste rien.
 *
 * Le nom `_audit` est volontairement reconnaissable dans les logs d'accès
 * Hostinger : ces requêtes sont les nôtres, pas du trafic client.
 */
export function withCacheBuster(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}_audit=${randomUUID()}`;
}

/**
 * En-têtes anti-cache, en complément du paramètre d'URL — jamais à sa place.
 * Ce sont des directives de requête qu'un edge est libre d'ignorer, là où une URL
 * inconnue ne peut structurellement pas venir d'un cache.
 */
export const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-cache, no-store',
  Pragma: 'no-cache',
};

export default withCacheBuster;
