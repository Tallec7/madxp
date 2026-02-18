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

    const existingPaths = new Set(
      config.sponsors
        .filter(s => s._sponsorLocalId === localId)
        .map(s => s.path)
    );

    for (const filename of (sponsor.videoFilenames || [])) {
      if (!existingPaths.has(filename)) {
        config.sponsors.push({
          path: filename,
          owner: 'club',
          locked: false,
          site_sponsor_id: sponsor.centralId || null,
          _sponsorLocalId: localId,
        });
      }
    }

    await this._configService.saveConfig(config);
    console.log('[admin] Sponsor ajouté à la boucle:', sponsor.name);

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
    const neoProMap = new Map();

    for (const s of sponsors) {
      if (s.locked || s.owner === 'neopro') {
        // Grouper par site_sponsor_id ou par path
        const key = s.site_sponsor_id || s.path;
        if (!neoProMap.has(key)) {
          neoProMap.set(key, {
            name: s.display_name || s.path,
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
