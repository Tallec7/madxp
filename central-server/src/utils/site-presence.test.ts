/**
 * Présence d'un site — Pi via l'agent, SaaS via les navigateurs.
 *
 * Régression gardée : un site SaaS n'entre jamais dans `connectedSites` (aucun
 * agent) et son `last_seen_at` n'est jamais rafraîchi. S'en tenir à la Map Pi
 * affichait « hors ligne » un club en pleine diffusion.
 */

import { resolveSitePresence } from './site-presence';

const noSaasClients = () => 0;

describe('resolveSitePresence — site Pi', () => {
  it('est présent quand son agent est dans la Map', () => {
    const r = resolveSitePresence({
      siteId: 'pi-1',
      siteType: 'pi',
      piConnectedSiteIds: new Set(['pi-1']),
      getSaasClientCount: noSaasClients,
    });
    expect(r).toEqual({ isSaas: false, saasClientCount: 0, isConnectedNow: true });
  });

  it('est absent quand son agent n’est pas dans la Map', () => {
    const r = resolveSitePresence({
      siteId: 'pi-1',
      siteType: 'pi',
      piConnectedSiteIds: new Set(),
      getSaasClientCount: noSaasClients,
    });
    expect(r.isConnectedNow).toBe(false);
  });

  it('ne consulte JAMAIS le comptage navigateurs pour un site Pi', () => {
    const spy = jest.fn(() => 5);
    resolveSitePresence({
      siteId: 'pi-1',
      siteType: 'pi',
      piConnectedSiteIds: new Set(['pi-1']),
      getSaasClientCount: spy,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('traite un site_type absent ou demo comme un Pi (rétro-compat)', () => {
    for (const siteType of [null, undefined, 'demo']) {
      const r = resolveSitePresence({
        siteId: 's',
        siteType,
        piConnectedSiteIds: new Set(['s']),
        getSaasClientCount: noSaasClients,
      });
      expect(r.isSaas).toBe(false);
      expect(r.isConnectedNow).toBe(true);
    }
  });
});

describe('resolveSitePresence — site SaaS', () => {
  it('est présent dès qu’un écran navigateur est connecté', () => {
    const r = resolveSitePresence({
      siteId: 'saas-1',
      siteType: 'saas',
      piConnectedSiteIds: new Set(),
      getSaasClientCount: () => 2,
    });
    expect(r).toEqual({ isSaas: true, saasClientCount: 2, isConnectedNow: true });
  });

  it('est absent quand aucun écran n’est connecté', () => {
    const r = resolveSitePresence({
      siteId: 'saas-1',
      siteType: 'saas',
      piConnectedSiteIds: new Set(),
      getSaasClientCount: () => 0,
    });
    expect(r.isConnectedNow).toBe(false);
    expect(r.saasClientCount).toBe(0);
  });

  it('ne dépend PAS de la Map Pi — c’est tout le bug corrigé', () => {
    // Un SaaS n'est jamais dans `connectedSites` : sans le comptage navigateurs,
    // il serait déclaré absent alors qu'il diffuse.
    const r = resolveSitePresence({
      siteId: 'saas-1',
      siteType: 'saas',
      piConnectedSiteIds: new Set(), // vide, comme toujours en SaaS
      getSaasClientCount: () => 1,
    });
    expect(r.isConnectedNow).toBe(true);
  });

  it('ignore une entrée parasite dans la Map Pi si aucun écran n’est là', () => {
    const r = resolveSitePresence({
      siteId: 'saas-1',
      siteType: 'saas',
      piConnectedSiteIds: new Set(['saas-1']),
      getSaasClientCount: () => 0,
    });
    expect(r.isConnectedNow).toBe(false);
  });

  it('dégrade en absent si le comptage lève, sans faire tomber la page flotte', () => {
    const r = resolveSitePresence({
      siteId: 'saas-1',
      siteType: 'saas',
      piConnectedSiteIds: new Set(),
      getSaasClientCount: () => {
        throw new Error('socket.io indisponible');
      },
    });
    expect(r).toEqual({ isSaas: true, saasClientCount: 0, isConnectedNow: false });
  });
});
