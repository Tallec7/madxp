/**
 * Présence d'un site — « est-il en train de diffuser, maintenant ? »
 *
 * Deux sources selon le type de site, et c'est toute la subtilité :
 *
 *  - **Pi** : la Map `connectedSites` du socket service, alimentée **uniquement**
 *    par `authenticateAgent` (chemin d'auth par clé API de l'agent).
 *  - **SaaS** : les navigateurs `saas-tv` présents dans la room du site
 *    (`socketService.getSaasClientCount`). Un site SaaS n'a pas d'agent, donc
 *    **n'entre jamais** dans `connectedSites`.
 *
 * Sans cette distinction, un site SaaS était toujours vu « non connecté », et son
 * statut retombait sur les seuils `last_seen_at` — or `last_seen_at` n'est posé
 * qu'à la connexion (`saas-register`) et **n'est jamais rafraîchi** : aucun
 * heartbeat SaaS n'existe côté central. Résultat : un club en pleine diffusion
 * était affiché **hors ligne** 3 minutes après avoir allumé son écran.
 *
 * Fonction pure : les deux sources sont injectées, rien n'est importé du socket.
 */

/** Entrée du calcul de présence. */
export interface SitePresenceInput {
  siteId: string;
  /** `sites.site_type` — `'saas'` bascule sur le comptage navigateurs. */
  siteType?: string | null;
  /** Sites avec un agent Pi actuellement connecté (`getConnectedSites()`). */
  piConnectedSiteIds: ReadonlySet<string>;
  /** Compte les écrans navigateur d'un site (`socketService.getSaasClientCount`). */
  getSaasClientCount: (siteId: string) => number;
}

/** Résultat du calcul de présence. */
export interface SitePresence {
  isSaas: boolean;
  /** Écrans navigateur connectés. `0` pour un site Pi (non pertinent). */
  saasClientCount: number;
  /** Le site est-il joignable maintenant, quelle que soit sa nature ? */
  isConnectedNow: boolean;
}

/**
 * Résout la présence d'un site en choisissant la bonne source selon son type.
 * Ne lève jamais : un `getSaasClientCount` défaillant dégrade en « absent »
 * plutôt que de faire tomber toute la page flotte.
 */
export function resolveSitePresence(input: SitePresenceInput): SitePresence {
  const isSaas = input.siteType === 'saas';

  if (!isSaas) {
    return {
      isSaas: false,
      saasClientCount: 0,
      isConnectedNow: input.piConnectedSiteIds.has(input.siteId),
    };
  }

  let saasClientCount = 0;
  try {
    saasClientCount = input.getSaasClientCount(input.siteId) || 0;
  } catch {
    saasClientCount = 0;
  }

  return { isSaas: true, saasClientCount, isConnectedNow: saasClientCount > 0 };
}
