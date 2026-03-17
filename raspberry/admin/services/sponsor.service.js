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

    // Auto-reconcile orphaned loopVideos from central push
    if (this._reconcileOrphanedLoopVideos(config)) {
      await this._configService.saveConfig(config);
    }

    const localSponsors = (config.localSponsors || []).map(s => ({
      ...s,
      // Sponsors avec centralId et source 'neopro' = créés depuis le dashboard (lecture seule)
      source: (s.centralId && s.source === 'neopro') ? 'neopro' : 'local',
      inLoop: this._isSponsorInLoop(config, s),
      phases: this._getSponsorPhasesInternal(config, s),
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
      phases: this._getSponsorPhasesInternal(config, sponsor),
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
      frequency: 1,
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
    // Also clean timeCategories[].loopVideos[]
    for (const tc of config.timeCategories || []) {
      if (tc.loopVideos) {
        tc.loopVideos = tc.loopVideos.filter(
          v => !(v.path === filename && v._sponsorLocalId === localId)
        );
      }
    }

    await this._configService.saveConfig(config);
    console.log('[admin] Vidéo déliée du sponsor:', filename, '←', sponsor.name);

    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
    };
  }

  // ===========================================================================
  // PHASE MANAGEMENT (timeCategories[].loopVideos[])
  // ===========================================================================

  /**
   * Ajoute les vidéos d'un sponsor à une phase spécifique.
   * @param {string} localId
   * @param {string} phaseId - ex: 'avant-match', 'match', 'apres-match'
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError|ValidationError}
   */
  async addToPhase(localId, phaseId) {
    if (!phaseId) {
      throw new ValidationError('phaseId requis');
    }

    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    const tc = (config.timeCategories || []).find(t => t.id === phaseId);
    if (!tc) {
      throw new NotFoundError('Phase non trouvée: ' + phaseId);
    }

    // Clean old entries for this sponsor in this phase, then rebuild
    tc.loopVideos = (tc.loopVideos || []).filter(v => v._sponsorLocalId !== localId);
    this._rebuildPhaseEntries(tc, sponsor);

    await this._configService.saveConfig(config);
    console.log('[admin] Sponsor ajouté à la phase:', sponsor.name, phaseId);

    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
      phases: this._getSponsorPhasesInternal(config, sponsor),
    };
  }

  /**
   * Retire les vidéos d'un sponsor d'une phase spécifique.
   * @param {string} localId
   * @param {string} phaseId
   * @returns {Promise<Object>} le sponsor mis à jour
   * @throws {NotFoundError|ValidationError}
   */
  async removeFromPhase(localId, phaseId) {
    if (!phaseId) {
      throw new ValidationError('phaseId requis');
    }

    const config = await this._configService.loadConfig();
    config.localSponsors = config.localSponsors || [];

    const sponsor = config.localSponsors.find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }

    const tc = (config.timeCategories || []).find(t => t.id === phaseId);
    if (!tc) {
      throw new NotFoundError('Phase non trouvée: ' + phaseId);
    }

    tc.loopVideos = (tc.loopVideos || []).filter(v => v._sponsorLocalId !== localId);

    await this._configService.saveConfig(config);
    console.log('[admin] Sponsor retiré de la phase:', sponsor.name, phaseId);

    return {
      ...sponsor,
      source: 'local',
      inLoop: this._isSponsorInLoop(config, sponsor),
      phases: this._getSponsorPhasesInternal(config, sponsor),
    };
  }

  /**
   * Retourne les IDs de phases où un sponsor est présent.
   * @param {string} localId
   * @returns {Promise<string[]>} ex: ['avant-match', 'apres-match']
   * @throws {NotFoundError}
   */
  async getSponsorPhases(localId) {
    const config = await this._configService.loadConfig();
    const sponsor = (config.localSponsors || []).find(s => s.localId === localId);
    if (!sponsor) {
      throw new NotFoundError('Sponsor non trouvé');
    }
    return this._getSponsorPhasesInternal(config, sponsor);
  }

  // ===========================================================================
  // LOOP MANAGEMENT (legacy config.sponsors[])
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
    // Check legacy config.sponsors[]
    if ((config.sponsors || []).some(s => s._sponsorLocalId === sponsor.localId)) {
      return true;
    }
    // Check timeCategories[].loopVideos[]
    for (const tc of config.timeCategories || []) {
      if ((tc.loopVideos || []).some(v => v._sponsorLocalId === sponsor.localId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reconstruit les entrées de boucle pour un sponsor (1 entrée par vidéo).
   *
   * Les entrées sont réparties de manière espacée dans la boucle existante
   * pour éviter que toutes les vidéos d'un même sponsor soient consécutives.
   *
   * @param {Object} config
   * @param {Object} sponsor
   */
  _rebuildLoopEntries(config, sponsor) {
    const filenames = sponsor.videoFilenames || [];

    if (filenames.length === 0) return;

    // Collecter les entrées qui ne sont PAS ce sponsor (pour intercaler)
    const otherEntries = (config.sponsors || []).filter(
      s => s._sponsorLocalId !== sponsor.localId
    );

    // Créer une entrée par vidéo
    const newEntries = filenames.map(filename => ({
      name: sponsor.name,
      path: filename,
      type: 'video/mp4',
      owner: 'club',
      locked: false,
      analytics_category: 'sponsor_local',
      site_sponsor_id: sponsor.centralId || null,
      _sponsorLocalId: sponsor.localId,
    }));

    // Intercaler les entrées du sponsor parmi les autres
    // pour éviter des blocs consécutifs du même sponsor
    const result = [...otherEntries];
    if (result.length === 0) {
      result.push(...newEntries);
    } else {
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
    // Clean legacy config.sponsors[]
    config.sponsors = (config.sponsors || []).filter(
      s => s._sponsorLocalId !== sponsor.localId
    );
    // Clean timeCategories[].loopVideos[]
    for (const tc of config.timeCategories || []) {
      if (tc.loopVideos) {
        tc.loopVideos = tc.loopVideos.filter(v => v._sponsorLocalId !== sponsor.localId);
      }
    }
  }

  /**
   * Retourne les IDs de phases où un sponsor a des entrées loopVideos[].
   * @param {Object} config
   * @param {Object} sponsor
   * @returns {string[]}
   */
  _getSponsorPhasesInternal(config, sponsor) {
    const phases = [];
    for (const tc of config.timeCategories || []) {
      if ((tc.loopVideos || []).some(v => v._sponsorLocalId === sponsor.localId)) {
        phases.push(tc.id);
      }
    }
    return phases;
  }

  /**
   * Reconstruit les entrées loopVideos[] d'un sponsor dans une phase spécifique.
   * Même logique d'intercalage que _rebuildLoopEntries() mais
   * opère sur timeCategory.loopVideos[] au lieu de config.sponsors[].
   *
   * @param {Object} timeCategory - la timeCategory ciblée (mutée en place)
   * @param {Object} sponsor
   */
  _rebuildPhaseEntries(timeCategory, sponsor) {
    const filenames = sponsor.videoFilenames || [];

    if (filenames.length === 0) return;

    // Entrées qui ne sont PAS ce sponsor (pour intercaler)
    const otherEntries = (timeCategory.loopVideos || []).filter(
      v => v._sponsorLocalId !== sponsor.localId
    );

    // Une entrée par vidéo
    const newEntries = filenames.map(filename => ({
      name: sponsor.name,
      path: filename,
      type: 'video/mp4',
      owner: 'club',
      locked: false,
      analytics_category: 'sponsor_local',
      site_sponsor_id: sponsor.centralId || null,
      _sponsorLocalId: sponsor.localId,
    }));

    // Intercaler les entrées du sponsor parmi les autres
    const result = [...otherEntries];
    if (result.length === 0) {
      result.push(...newEntries);
    } else {
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

    timeCategory.loopVideos = result;
  }

  /**
   * Reconcile orphaned loopVideos entries that have no _sponsorLocalId.
   *
   * When the central pushes config, it writes sponsor videos directly into
   * timeCategories[].loopVideos[] but does NOT create localSponsors[] entries.
   * This method detects those orphaned entries, auto-creates localSponsors[],
   * and links them back via _sponsorLocalId so the Sponsors tab shows them.
   *
   * Also reconciles orphaned entries in legacy config.sponsors[].
   *
   * @param {Object} config - mutated in place
   * @returns {boolean} true if config was modified
   */
  _reconcileOrphanedLoopVideos(config) {
    config.localSponsors = config.localSponsors || [];

    // Collect all orphaned entries (no _sponsorLocalId) grouped by name.
    // ONLY reconcile entries that are actually sponsor videos:
    // - has site_sponsor_id (identified by central auto-resolution), OR
    // - has analytics_category === 'sponsor', OR
    // - has owner === 'club' (placed by club admin as sponsor entry)
    // Regular content videos (no markers) are NOT sponsors.
    const orphansByName = new Map();

    const _isSponsorEntry = (v) =>
      v.site_sponsor_id ||
      (v.analytics_category && v.analytics_category.startsWith('sponsor')) ||
      (v.owner === 'club' && !v.locked);

    for (const tc of config.timeCategories || []) {
      for (const v of tc.loopVideos || []) {
        if (v._sponsorLocalId) continue; // already linked
        if (!_isSponsorEntry(v)) continue; // skip non-sponsor videos
        const name = (v.name || v.sponsorName || '').trim();
        if (!name) continue;
        if (!orphansByName.has(name)) {
          orphansByName.set(name, { paths: new Set(), siteSponsorId: null });
        }
        const group = orphansByName.get(name);
        if (v.path) group.paths.add(v.path);
        if (v.site_sponsor_id) group.siteSponsorId = v.site_sponsor_id;
      }
    }

    // Also check legacy config.sponsors[]
    for (const s of config.sponsors || []) {
      if (s._sponsorLocalId) continue;
      if (s.locked || s.owner === 'neopro') continue; // skip Neopro entries
      if (!_isSponsorEntry(s)) continue; // skip non-sponsor videos
      const name = (s.name || s.display_name || '').trim();
      if (!name) continue;
      if (!orphansByName.has(name)) {
        orphansByName.set(name, { paths: new Set(), siteSponsorId: null });
      }
      const group = orphansByName.get(name);
      if (s.path) group.paths.add(s.path);
      if (s.site_sponsor_id) group.siteSponsorId = s.site_sponsor_id;
    }

    if (orphansByName.size === 0) return false;

    let modified = false;

    for (const [name, { paths, siteSponsorId }] of orphansByName) {
      // Check if a localSponsor already exists with this name (case-insensitive)
      let existing = config.localSponsors.find(
        s => s.name.toLowerCase().trim() === name.toLowerCase()
      );

      if (!existing) {
        // Auto-create a new localSponsor
        const localId = `ls_reconciled_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        existing = {
          localId,
          centralId: siteSponsorId || null,
          name,
          contactEmail: '',
          contactPhone: '',
          videoFilenames: [...paths],
          frequency: 1,
          isActive: true,
          source: siteSponsorId ? 'neopro' : 'local',
          createdAt: new Date().toISOString(),
          syncedAt: null,
          _reconciledAt: new Date().toISOString(),
        };
        config.localSponsors.push(existing);
        console.log('[admin] Sponsor auto-réconcilié:', name, `(${localId}, ${paths.size} vidéos)`);
      } else {
        // Merge any new paths into existing sponsor
        existing.videoFilenames = existing.videoFilenames || [];
        for (const p of paths) {
          if (!existing.videoFilenames.includes(p)) {
            existing.videoFilenames.push(p);
          }
        }
        if (siteSponsorId && !existing.centralId) {
          existing.centralId = siteSponsorId;
        }
      }

      // Link all orphaned loopVideos entries to this localSponsor
      for (const tc of config.timeCategories || []) {
        for (const v of tc.loopVideos || []) {
          if (v._sponsorLocalId) continue;
          const vName = (v.name || v.sponsorName || '').trim();
          if (vName.toLowerCase() === name.toLowerCase()) {
            v._sponsorLocalId = existing.localId;
          }
        }
      }

      // Link orphaned legacy sponsors[] entries too
      for (const s of config.sponsors || []) {
        if (s._sponsorLocalId) continue;
        if (s.locked || s.owner === 'neopro') continue;
        const sName = (s.name || s.display_name || '').trim();
        if (sName.toLowerCase() === name.toLowerCase()) {
          s._sponsorLocalId = existing.localId;
        }
      }

      modified = true;
    }

    return modified;
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
