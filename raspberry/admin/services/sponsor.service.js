/**
 * SponsorService — Gestion des sponsors locaux dans configuration.json
 *
 * Permet au bénévole de club de créer/éditer/supprimer des sponsors locaux
 * depuis l'admin Pi. Les sponsors sont stockés dans config.localSponsors[]
 * et synchronisés vers le central via le sync-agent.
 *
 * Les sponsors NEOPRO (présents dans config.sponsors[] avec owner='neopro')
 * sont en lecture seule.
 */

const crypto = require('crypto');

const { NotFoundError, LockedError, ValidationError, DuplicateError } = require('./errors');

class SponsorService {
  /**
   * @param {Object} deps
   * @param {import('./configuration.service')} deps.configService
   */
  constructor({ configService }) {
    this._configService = configService;
  }

  // ===========================================================================
  // LIST / GET
  // ===========================================================================

  /**
   * Liste tous les sponsors : locaux (CRUD) + NEOPRO (lecture seule).
   * @returns {Promise<Array>}
   */
  async listSponsors() {
    const config = await this._configService.loadConfig();
    const localSponsors = (config.localSponsors || []).map(s => ({
      ...s,
      // Sponsors avec centralId et source 'neopro' = créés depuis le dashboard (lecture seule)
      source: (s.centralId && s.source === 'neopro') ? 'neopro' : 'local',
      inLoop: this._isSponsorInLoop(config, s),
    }));

    const neoProSponsors = this._extractNeoProSponsors(config);

    return [...localSponsors, ...neoProSponsors];
  }

  /**
   * Récupère un sponsor local par son localId.
   * @param {string} localId
   * @returns {Promise<Object>}
   * @throws {NotFoundError}
   */
  async getSponsor(localId) {
    const config = await this._configService.loadConfig();
    const sponsor = (config.localSponsors || []).find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }
    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
    };
  }

  // ===========================================================================
  // CREATE / UPDATE / DELETE
  // ===========================================================================

  /**
   * Crée un nouveau sponsor local.
   * @param {Object} params
   * @param {string} params.name - Nom du sponsor (requis)
   * @param {string} [params.contactEmail]
   * @param {string} [params.contactPhone]
   * @returns {Promise<Object>} le sponsor créé
   * @throws {ValidationError} si le nom est manquant
   * @throws {DuplicateError} si un sponsor local avec ce nom existe déjà
   */
  async createSponsor({ name, contactEmail, contactPhone }) {
    if (!name || !name.trim()) {
      throw new ValidationError('Le nom du sponsor est requis');
    }

    const trimmedName = name.trim();
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    // Vérifier l'unicité du nom (case-insensitive)
    const exists = config.localSponsors.some(
      s => s.name.toLowerCase().trim() === trimmedName.toLowerCase()
    );
    if (exists) {
      throw new DuplicateError('Un sponsor avec ce nom existe déjà');
    }

    const localId = `ls_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const newSponsor = {
      localId,
      centralId: null,
      name: trimmedName,
      contactEmail: (contactEmail || '').trim(),
      contactPhone: (contactPhone || '').trim(),
      videoFilenames: [],
      frequency: 2, // 1=Basse, 2=Normale, 3=Haute, 4=Maximum
      isActive: true,
      createdAt: new Date().toISOString(),
      syncedAt: null,
    };

    config.localSponsors.push(newSponsor);
    await this._configService.saveConfig(config);

    console.log('[admin] Sponsor local créé:', trimmedName, `(${localId})`);
    return { ...newSponsor, source: 'local', inLoop: false };
  }

  /**
   * Met à jour un sponsor local.
   * @param {string} localId
   * @param {Object} updates - { name, contactEmail, contactPhone, isActive }
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError}
   * @throws {ValidationError}
   * @throws {DuplicateError}
   */
  async updateSponsor(localId, updates) {
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsorIndex = config.localSponsors.findIndex(s => s.localId === localId);
    if (sponsorIndex === -1) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    const sponsor = config.localSponsors[sponsorIndex];

    // Protéger les sponsors NEOPRO (créés depuis le dashboard central)
    if (sponsor.centralId && sponsor.source === 'neopro') {
      throw new LockedError('Ce sponsor est géré depuis le dashboard NEOPRO et ne peut pas être modifié ici');
    }

    // Mise à jour du nom — vérifier unicité
    if (updates.name !== undefined) {
      const trimmedName = (updates.name || '').trim();
      if (!trimmedName) {
        throw new ValidationError('Le nom du sponsor est requis');
      }
      const duplicate = config.localSponsors.some(
        (s, i) => i !== sponsorIndex && s.name.toLowerCase().trim() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        throw new DuplicateError('Un sponsor avec ce nom existe déjà');
      }
      sponsor.name = trimmedName;
    }

    if (updates.contactEmail !== undefined) {
      sponsor.contactEmail = (updates.contactEmail || '').trim();
    }
    if (updates.contactPhone !== undefined) {
      sponsor.contactPhone = (updates.contactPhone || '').trim();
    }
    if (updates.isActive !== undefined) {
      sponsor.isActive = Boolean(updates.isActive);
    }
    if (updates.frequency !== undefined) {
      const freq = parseInt(updates.frequency, 10);
      if (freq >= 1 && freq <= 4) {
        const oldFreq = sponsor.frequency || 2;
        sponsor.frequency = freq;

        // Si le sponsor est dans la boucle, recalculer les entrées
        if (oldFreq !== freq && this._isSponsorInLoop(config, sponsor)) {
          this._rebuildLoopEntries(config, sponsor);
        }
      }
    }

    await this._configService.saveConfig(config);

    console.log('[admin] Sponsor local mis à jour:', sponsor.name, `(${localId})`);
    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
    };
  }

  /**
   * Supprime un sponsor local et retire ses entries de la boucle.
   * @param {string} localId
   * @throws {NotFoundError}
   */
  async deleteSponsor(localId) {
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsorIndex = config.localSponsors.findIndex(s => s.localId === localId);
    if (sponsorIndex === -1) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    const sponsor = config.localSponsors[sponsorIndex];

    // Protéger les sponsors NEOPRO (créés depuis le dashboard central)
    if (sponsor.centralId && sponsor.source === 'neopro') {
      throw new LockedError('Ce sponsor est géré depuis le dashboard NEOPRO et ne peut pas être supprimé ici');
    }

    // Retirer les entries de la boucle sponsors[]
    this._removeFromLoopInternal(config, sponsor);

    // Supprimer le sponsor
    config.localSponsors.splice(sponsorIndex, 1);
    await this._configService.saveConfig(config);

    console.log('[admin] Sponsor local supprimé:', sponsor.name, `(${localId})`);
  }

  // ===========================================================================
  // VIDEO LINKING
  // ===========================================================================

  /**
   * Lie une vidéo à un sponsor.
   * @param {string} localId
   * @param {string} filename
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError}
   * @throws {ValidationError}
   */
  async linkVideo(localId, filename) {
    if (!filename || !filename.trim()) {
      throw new ValidationError('Le nom de fichier est requis');
    }

    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    sponsor.videoFilenames = sponsor.videoFilenames || [];
    const trimmedFilename = filename.trim();

    if (!sponsor.videoFilenames.includes(trimmedFilename)) {
      sponsor.videoFilenames.push(trimmedFilename);
      await this._configService.saveConfig(config);
      console.log('[admin] Vidéo liée au sponsor:', trimmedFilename, '→', sponsor.name);
    }

    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
    };
  }

  /**
   * Délie une vidéo d'un sponsor. Retire aussi de la boucle si présent.
   * @param {string} localId
   * @param {string} filename
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError}
   */
  async unlinkVideo(localId, filename) {
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    sponsor.videoFilenames = (sponsor.videoFilenames || []).filter(f => f !== filename);

    // Retirer aussi de la boucle si cette vidéo y était
    config.sponsors = (config.sponsors || []).filter(
      s => !(s.path === filename && s.owner === 'club' && s._sponsorLocalId === localId)
    );

    await this._configService.saveConfig(config);
    console.log('[admin] Vidéo déliée du sponsor:', filename, '←', sponsor.name);

    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
    };
  }

  // ===========================================================================
  // LOOP MANAGEMENT
  // ===========================================================================

  /**
   * Ajoute les vidéos d'un sponsor à la boucle par défaut (sponsors[]).
   * @param {string} localId
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError}
   */
  async addToLoop(localId) {
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];
    config.sponsors = config.sponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    // Nettoyer les anciennes entrées et reconstruire selon la fréquence
    this._removeFromLoopInternal(config, sponsor);
    this._rebuildLoopEntries(config, sponsor);

    await this._configService.saveConfig(config);
    console.log('[admin] Sponsor ajouté à la boucle:', sponsor.name, `(freq=${sponsor.frequency || 2})`);

    return {
      ...sponsor,
      source: 'local',
      inLoop: true,
    };
  }

  /**
   * Retire les vidéos d'un sponsor de la boucle par défaut.
   * @param {string} localId
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError}
   */
  async removeFromLoop(localId) {
    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    this._removeFromLoopInternal(config, sponsor);
    await this._configService.saveConfig(config);

    console.log('[admin] Sponsor retiré de la boucle:', sponsor.name);

    return {
      ...sponsor,
      source: 'local',
      inLoop: false,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Vérifie si un sponsor a des vidéos dans la boucle.
   * @param {Object} config
   * @param {Object} sponsor
   * @returns {boolean}
   */
  _isSponsorInLoop(config, sponsor) {
    const sponsors = config.sponsors || [];
    return sponsors.some(s => s._sponsorLocalId === sponsor.localId);
  }

  /**
   * Reconstruit les entrées de boucle pour un sponsor selon sa fréquence.
   * frequency=1 → 1 entrée par vidéo (basse)
   * frequency=2 → 2 entrées par vidéo (normale)
   * frequency=3 → 3 entrées par vidéo (haute)
   * frequency=4 → 4 entrées par vidéo (maximum)
   *
   * Les entrées sont réparties de manière espacée dans la boucle existante
   * pour éviter que toutes les vidéos d'un même sponsor soient consécutives.
   *
   * @param {Object} config
   * @param {Object} sponsor
   */
  _rebuildLoopEntries(config, sponsor) {
    const freq = sponsor.frequency || 2;
    const filenames = sponsor.videoFilenames || [];

    if (filenames.length === 0) return;

    // Collecter les entrées qui ne sont PAS ce sponsor (pour intercaler)
    const otherEntries = (config.sponsors || []).filter(
      s => s._sponsorLocalId !== sponsor.localId
    );

    // Créer les nouvelles entrées pour ce sponsor
    const newEntries = [];
    for (let rep = 0; rep < freq; rep++) {
      for (const filename of filenames) {
        newEntries.push({
          name: sponsor.name,
          path: filename,
          type: 'video/mp4',
          owner: 'club',
          locked: false,
          analytics_category: 'sponsor',
          site_sponsor_id: sponsor.centralId || null,
          _sponsorLocalId: sponsor.localId,
          _frequency: freq,
        });
      }
    }

    // Intercaler les entrées du sponsor parmi les autres
    // pour éviter des blocs consécutifs du même sponsor
    const result = [...otherEntries];
    if (result.length === 0) {
      // Aucun autre sponsor — ajouter simplement
      result.push(...newEntries);
    } else {
      // Répartir uniformément
      const step = Math.max(1, Math.floor(result.length / newEntries.length));
      let insertPos = Math.min(step, result.length);
      for (const entry of newEntries) {
        result.splice(insertPos, 0, entry);
        insertPos += step + 1;
        if (insertPos > result.length) {
          insertPos = result.length;
        }
      }
    }

    config.sponsors = result;
  }

  /**
   * Retire les entries d'un sponsor de la boucle (mutate config).
   * @param {Object} config
   * @param {Object} sponsor
   */
  _removeFromLoopInternal(config, sponsor) {
    config.sponsors = (config.sponsors || []).filter(
      s => s._sponsorLocalId !== sponsor.localId
    );
  }

  /**
   * Extrait les sponsors NEOPRO depuis sponsors[] (lecture seule).
   * @param {Object} config
   * @returns {Array}
   */
  _extractNeoProSponsors(config) {
    const sponsors = config.sponsors || [];
    const localSponsors = config.localSponsors || [];
    const neoProMap = new Map();

    for (const s of sponsors) {
      if (s.locked || s.owner === 'neopro') {
        // Grouper par site_sponsor_id ou par path
        const key = s.site_sponsor_id || s.path;
        if (!neoProMap.has(key)) {
          // Résoudre le nom d'affichage : display_name → localSponsors[].name → path
          let displayName = s.display_name;
          if (!displayName && s.site_sponsor_id) {
            const match = localSponsors.find(ls => ls.centralId === s.site_sponsor_id);
            if (match) displayName = match.name;
          }
          neoProMap.set(key, {
            name: displayName || s.path,
            source: 'neopro',
            videoFilenames: [],
            isActive: true,
            inLoop: true,
          });
        }
        neoProMap.get(key).videoFilenames.push(s.path);
      }
    }

    return Array.from(neoProMap.values());
  }
}

module.exports = SponsorService;
