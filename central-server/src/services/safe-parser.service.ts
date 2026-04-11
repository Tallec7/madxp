/**
 * SAFe Parser Service
 *
 * Parse les fichiers markdown SAFe (docs/safe/ et docs/proposals/)
 * comme source de vérité pour le dashboard de pilotage.
 * Cache en mémoire avec TTL de 5 minutes, invalidé sur écriture.
 */

import fs from 'fs';
import path from 'path';
import logger from '../config/logger';
import { safeRepository } from '../repositories/safe.repository';
import {
  SafePortfolio,
  SafeEpic,
  SafeFeature,
  SafeTheme,
  SafeValueStream,
  SafePiObjective,
  SafeRisk,
  SafeFlowMetric,
  SafeRoadmapItem,
  SafeKpis,
  SafeProposal,
  SafeProposalSummary,
  SafeSprintTracker,
  SafeSprint,
  SafeSprintStory,
  SprintStoryStatus,
  EpicStatus,
  FeatureStatus,
  RoamStatus,
  ProposalType,
  ProposalStatus,
} from '../types/safe.types';

// In dev: __dirname = central-server/src/services/ → ../../../docs/safe
// In prod (Docker): __dirname = /app/dist/services/ → /app/docs/safe (copied by Dockerfile)
const PROJECT_ROOT = process.env.NODE_ENV === 'production'
  ? path.resolve(__dirname, '../..')  // /app/dist/services → /app
  : path.resolve(__dirname, '../../..');  // central-server/src/services → project root
const SAFE_DIR = path.join(PROJECT_ROOT, 'docs/safe');
const PROPOSALS_DIR = path.join(PROJECT_ROOT, 'docs/proposals');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SafeParserService {
  private portfolioCache: CacheEntry<SafePortfolio> | null = null;
  private proposalsCache: CacheEntry<SafeProposalSummary[]> | null = null;
  private sprintsCache: CacheEntry<SafeSprintTracker> | null = null;

  // --- Public API ---

  getPortfolio(): SafePortfolio {
    if (this.portfolioCache && Date.now() - this.portfolioCache.timestamp < CACHE_TTL_MS) {
      return this.portfolioCache.data;
    }

    const portfolio = this.buildPortfolio();
    this.portfolioCache = { data: portfolio, timestamp: Date.now() };
    return portfolio;
  }

  getProposals(): SafeProposalSummary[] {
    if (this.proposalsCache && Date.now() - this.proposalsCache.timestamp < CACHE_TTL_MS) {
      return this.proposalsCache.data;
    }

    const proposals = this.parseProposals();
    this.proposalsCache = { data: proposals, timestamp: Date.now() };
    return proposals;
  }

  getProposal(id: string): SafeProposal | null {
    const proposals = this.getProposals();
    const summary = proposals.find(p => p.id === id);
    if (!summary) return null;

    const fullPath = path.resolve(PROPOSALS_DIR, summary.filePath);
    const content = this.readFileSafe(fullPath);
    return { ...summary, content };
  }

  async getSprints(): Promise<SafeSprintTracker> {
    if (this.sprintsCache && Date.now() - this.sprintsCache.timestamp < CACHE_TTL_MS) {
      return this.sprintsCache.data;
    }

    const tracker = this.buildSprintTracker();

    // Apply DB overrides (hybrid layer)
    try {
      const [velocities, storyOverrides] = await Promise.all([
        safeRepository.getVelocities(),
        safeRepository.getStoryOverrides(),
      ]);

      // Override velocities from DB
      for (const sprint of tracker.sprints) {
        const dbVelocity = velocities.get(sprint.id);
        if (dbVelocity !== undefined) {
          sprint.velocity = dbVelocity;
        }
      }

      // Override story statuses from DB
      for (const sprint of tracker.sprints) {
        for (const story of sprint.stories) {
          const override = storyOverrides.get(story.id);
          if (override) {
            story.status = override as SprintStoryStatus;
          }
        }
      }

      // Recalculate average velocity with DB overrides applied
      const today = new Date().toISOString().slice(0, 10);
      const completedSprints = tracker.sprints.filter(s => s.endDate < today && s.velocity > 0);
      tracker.averageVelocity = completedSprints.length > 0
        ? Math.round(completedSprints.reduce((sum, s) => sum + s.velocity, 0) / completedSprints.length)
        : 0;
    } catch (error) {
      logger.warn('SAFe: DB hybrid layer unavailable, using markdown-only data', { error });
    }

    this.sprintsCache = { data: tracker, timestamp: Date.now() };
    return tracker;
  }

  async updateStoryStatus(sprintId: string, storyId: string, newStatus: SprintStoryStatus): Promise<boolean> {
    const tracker = await this.getSprints();
    const sprint = tracker.sprints.find(s => s.id === sprintId);
    if (!sprint) return false;

    const story = sprint.stories.find(s => s.id === storyId);
    if (!story) return false;

    // Write-back to USER-STORIES.md
    const filePath = path.join(SAFE_DIR, 'USER-STORIES.md');
    const content = this.readFileSafe(filePath);
    if (!content) return false;

    const statusMap: Record<SprintStoryStatus, string> = {
      'todo': '⏳ Backlog',
      'in-progress': '🔄 En cours',
      'done': '✅ Livré',
      'removed': '❌ Retiré',
    };

    // Find the row with this story ID and replace status
    const storyEscaped = storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRegex = new RegExp(`(\\|\\s*${storyEscaped}\\s*\\|.+?\\|\\s*)(✅\\s*(?:Done|Livré)|⏳\\s*(?:Backlog|À détailler)|🔄\\s*En cours|⚠️\\s*Partiel|🔧\\s*Partiel[^|]*|❌\\s*Retiré)(\\s*\\|)`, 'g');
    const newContent = content.replace(rowRegex, `$1${statusMap[newStatus]}$3`);

    if (newContent === content) {
      logger.warn('SAFe: Story row not found for status update', { storyId });
      return false;
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');

    // Persist override to DB (hybrid layer)
    await safeRepository.upsertStoryStatus(storyId, newStatus);

    this.invalidateCache();
    logger.info('SAFe: Updated story status', { sprintId, storyId, newStatus });
    return true;
  }

  updateProposalStatus(id: string, newStatus: ProposalStatus): boolean {
    const proposals = this.getProposals();
    const proposal = proposals.find(p => p.id === id);
    if (!proposal) return false;

    const fullPath = path.resolve(PROPOSALS_DIR, proposal.filePath);
    let content = this.readFileSafe(fullPath);
    if (!content) return false;

    // Map status to display value
    const statusMap: Record<ProposalStatus, string> = {
      'draft': 'Proposé',
      'in-review': 'En revue',
      'approved': 'Approuvé',
      'implementing': 'En cours',
      'done': 'Terminé',
    };
    const displayStatus = statusMap[newStatus];

    // Replace status in the markdown — try multiple formats
    const originalContent = content;

    // Format 1: **Statut** : value (standard)
    const statusRegex = /(\*\*Statut\*\*\s*:\s*).+/i;
    // Format 2: > **Statut** : value (blockquote)
    const bqRegex = /(>\s*\*\*Statut\*\*\s*:\s*).+/i;
    // Format 3: **Statut :** value (colon inside bold)
    const altRegex = /(\*\*Statut\s*:\*\*\s*).+/i;
    // Format 4: > **Statut :** value (blockquote + colon inside bold)
    const bqAltRegex = /(>\s*\*\*Statut\s*:\*\*\s*).+/i;

    if (statusRegex.test(content)) {
      content = content.replace(statusRegex, `$1${displayStatus}`);
    } else if (bqRegex.test(content)) {
      content = content.replace(bqRegex, `$1${displayStatus}`);
    } else if (altRegex.test(content)) {
      content = content.replace(altRegex, `$1${displayStatus}`);
    } else if (bqAltRegex.test(content)) {
      content = content.replace(bqAltRegex, `$1${displayStatus}`);
    }

    if (content === originalContent) {
      logger.warn('SAFe: Status line not found in proposal file', { id, fullPath });
      return false;
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
    this.invalidateCache();
    logger.info('SAFe: Updated proposal status', { id, newStatus });
    return true;
  }

  createProposal(data: { title: string; type: ProposalType; relatedEpic: string | null; content: string }): SafeProposalSummary {
    if (!fs.existsSync(PROPOSALS_DIR)) {
      fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
    }

    // Determine next ID
    const existing = this.getProposals();
    const prefix = data.type === 'spike' ? 'SPIKE' : data.type === 'spec' ? 'SPEC' : 'PROP';
    const existingIds = existing
      .filter(p => p.id.startsWith(prefix))
      .map(p => {
        const numMatch = p.id.match(/(\d+)/);
        return numMatch ? parseInt(numMatch[1]) : 0;
      });
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const id = `${prefix}-${String(nextNum).padStart(3, '0')}`;

    // Build markdown content
    const today = new Date().toISOString().slice(0, 10);
    const epicLine = data.relatedEpic ? `\n> **Epic** : ${data.relatedEpic}` : '';
    const mdContent = `# ${id} — ${data.title}

> **Type** : ${prefix}
> **Statut** : Proposé
> **Date** : ${today}${epicLine}

${data.content}
`;

    const filename = `${id}-${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '')}.md`;
    fs.writeFileSync(path.join(PROPOSALS_DIR, filename), mdContent, 'utf-8');
    this.invalidateCache();

    logger.info('SAFe: Created proposal', { id, title: data.title, type: data.type });

    return {
      id,
      title: data.title,
      type: data.type,
      relatedEpic: data.relatedEpic,
      status: 'draft',
      date: today,
      filePath: filename,
    };
  }

  deleteProposal(id: string): boolean {
    const proposals = this.getProposals();
    const proposal = proposals.find(p => p.id === id);
    if (!proposal) return false;

    const fullPath = path.resolve(PROPOSALS_DIR, proposal.filePath);
    if (!fs.existsSync(fullPath)) return false;

    fs.unlinkSync(fullPath);
    this.invalidateCache();

    logger.info('SAFe: Deleted proposal', { id, filePath: proposal.filePath });
    return true;
  }

  updateRiskRoamStatus(riskId: string, newStatus: RoamStatus): boolean {
    const filePath = path.join(SAFE_DIR, 'ROAM.md');
    const content = this.readFileSafe(filePath);
    if (!content) return false;

    // Split by risk headers to find the right section
    const riskIdEscaped = riskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRegex = new RegExp(`(###\\s+${riskIdEscaped}\\s*:[\\s\\S]*?)(\\|\\s*\\*\\*Statut ROAM\\*\\*\\s*\\|\\s*)(.*?)(\\s*\\|)`, 'm');
    const newContent = content.replace(sectionRegex, `$1$2${newStatus}$4`);

    if (newContent === content) {
      logger.warn('SAFe: Risk ROAM status field not found', { riskId });
      return false;
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');
    this.invalidateCache();
    logger.info('SAFe: Updated risk ROAM status', { riskId, newStatus });
    return true;
  }

  updateEpic(epicId: string, data: { status?: EpicStatus; name?: string }): boolean {
    const filePath = path.join(SAFE_DIR, 'FEATURES.md');
    const content = this.readFileSafe(filePath);
    if (!content) return false;

    const epicIdEscaped = epicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match epic header: ### E-XX — Name [optional emoji suffix]
    const epicHeaderRegex = new RegExp(`(###?\\s+${epicIdEscaped}\\s*—\\s*)(.+)`, 'g');

    let found = false;
    const newContent = content.replace(epicHeaderRegex, (_match, prefix: string, rest: string) => {
      found = true;
      // Remove existing status emojis to get the clean name
      let epicName = rest.replace(/\s*✅\s*DONE\s*/g, '').replace(/\s*⚠️\s*(PARTIELLEMENT\s+DONE)?\s*/g, '').trim();

      // Replace name if provided
      if (data.name) {
        epicName = data.name;
      }

      // Add status emoji suffix if status provided
      if (data.status === 'done') {
        epicName = `${epicName} ✅ DONE`;
      } else if (data.status === 'partial') {
        epicName = `${epicName} ⚠️ PARTIELLEMENT DONE`;
      }
      // Other statuses (funnel, analysis, backlog, implementing) → no emoji

      return `${prefix}${epicName}`;
    });

    if (!found) {
      logger.warn('SAFe: Epic header not found for update', { epicId });
      return false;
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');
    this.invalidateCache();
    logger.info('SAFe: Updated epic in FEATURES.md', { epicId, ...data });
    return true;
  }

  updateProposalContent(id: string, data: { title?: string; content?: string }): boolean {
    const proposals = this.getProposals();
    const proposal = proposals.find(p => p.id === id);
    if (!proposal) return false;

    const fullPath = path.resolve(PROPOSALS_DIR, proposal.filePath);
    let fileContent = this.readFileSafe(fullPath);
    if (!fileContent) return false;

    // Update title in the markdown header: # PROP-XXX — Title
    if (data.title) {
      const idEscaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleRegex = new RegExp(`(#\\s+${idEscaped}\\s*—\\s*).+`);
      fileContent = fileContent.replace(titleRegex, `$1${data.title}`);
    }

    // Update content: everything after the metadata block (> **...**\n lines)
    if (data.content !== undefined) {
      // Find end of metadata block (lines starting with >)
      const lines = fileContent.split('\n');
      let metaEndIndex = -1;
      let inMeta = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#')) {
          inMeta = true;
          continue;
        }
        if (inMeta && lines[i].startsWith('>')) {
          metaEndIndex = i;
          continue;
        }
        if (inMeta && metaEndIndex >= 0 && lines[i].trim() === '') {
          metaEndIndex = i;
          break;
        }
      }

      if (metaEndIndex >= 0) {
        const metaPart = lines.slice(0, metaEndIndex + 1).join('\n');
        fileContent = `${metaPart}\n\n${data.content}\n`;
      }
    }

    fs.writeFileSync(fullPath, fileContent, 'utf-8');

    // Rename file if title changed (slug in filename)
    if (data.title) {
      const newSlug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '');
      const newFilename = `${id}-${newSlug}.md`;
      if (newFilename !== proposal.filePath) {
        const newPath = path.resolve(PROPOSALS_DIR, newFilename);
        fs.renameSync(fullPath, newPath);
      }
    }

    this.invalidateCache();
    logger.info('SAFe: Updated proposal content', { id, titleChanged: !!data.title, contentChanged: data.content !== undefined });
    return true;
  }

  updateStoryFields(storyId: string, data: { storyPoints?: number; priority?: string }): boolean {
    const filePath = path.join(SAFE_DIR, 'USER-STORIES.md');
    const content = this.readFileSafe(filePath);
    if (!content) return false;

    const storyEscaped = storyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Row format: | US-XX.X.X | F-XX.X | Description | SP | Sprint | Priorité | Statut |
    const rowRegex = new RegExp(`(\\|\\s*${storyEscaped}\\s*\\|\\s*F-[\\d.]+\\s*\\|[^|]+\\|\\s*)(\\d+)(\\s*\\|\\s*\\S+(?:\\s+\\S+)?\\s*\\|\\s*)(\\S+)(\\s*\\|[^|]+\\|)`, 'g');

    let found = false;
    const newContent = content.replace(rowRegex, (_match, pre: string, sp: string, mid: string, prio: string, post: string) => {
      found = true;
      const newSp = data.storyPoints !== undefined ? String(data.storyPoints) : sp;
      const newPrio = data.priority !== undefined ? data.priority : prio;
      return `${pre}${newSp}${mid}${newPrio}${post}`;
    });

    if (!found) {
      logger.warn('SAFe: Story row not found for fields update', { storyId });
      return false;
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');
    this.invalidateCache();
    logger.info('SAFe: Updated story fields', { storyId, ...data });
    return true;
  }

  invalidateCache(): void {
    this.portfolioCache = null;
    this.proposalsCache = null;
    this.sprintsCache = null;
  }

  // --- Portfolio builder ---

  private buildPortfolio(): SafePortfolio {
    const epics = this.parseEpics();
    const features = this.parseFeatures();
    const themes = this.parseThemes();
    const valueStreams = this.parseValueStreams();
    const piObjectives = this.parsePiObjectives();
    const risks = this.parseRisks();
    const flowMetrics = this.parseFlowMetrics();
    const roadmap = this.parseRoadmap();

    // Enrich epics with feature counts
    for (const epic of epics) {
      const epicFeatures = features.filter(f => f.epicId === epic.id);
      epic.featuresCount = epicFeatures.length;
      epic.featuresDone = epicFeatures.filter(f => f.status === 'done').length;
    }

    const kpis = this.computeKpis(epics, features, piObjectives);

    return { epics, themes, valueStreams, piObjectives, risks, flowMetrics, roadmap, kpis };
  }

  // --- Epics from FEATURES.md ---

  private parseEpics(): SafeEpic[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'FEATURES.md'));
    if (!content) return [];

    const epics: SafeEpic[] = [];
    // Match epic headers: ### E-XX — Name ✅ DONE or ### E-XX — Name ⚠️ PARTIELLEMENT DONE
    // or ## E-XX — Name (PI-2/PI-3 section headers)
    const epicRegex = /###?\s+(E-\d+)\s*—\s*(.+)/g;
    let match;

    // Build theme/VS mapping from PORTFOLIO.md themes table
    const themeMap = this.buildEpicThemeMap();
    const vsMap = this.buildEpicVsMap();
    const piMap = this.buildEpicPiMap();
    const spMap = this.buildEpicSpMap();

    while ((match = epicRegex.exec(content)) !== null) {
      const id = match[1];
      let name = match[2].trim();
      let status: EpicStatus = 'backlog';

      if (name.includes('✅ DONE')) {
        status = 'done';
        name = name.replace(/✅\s*DONE/g, '').trim();
      } else if (name.includes('⚠️ PARTIELLEMENT DONE') || name.includes('⚠️')) {
        status = 'partial';
        name = name.replace(/⚠️\s*(PARTIELLEMENT\s+DONE)?/g, '').trim();
      }

      // Skip duplicate entries (features section reuses epic headers)
      if (epics.some(e => e.id === id)) continue;

      epics.push({
        id,
        name: name.replace(/\s+$/, ''),
        theme: themeMap[id] || 'Transverse',
        valueStream: vsMap[id] || 'Transverse',
        pi: piMap[id] || 'PI-1',
        status: piMap[id] === 'Done' ? 'done' : status,
        storyPoints: spMap[id] || 0,
        featuresCount: 0,
        featuresDone: 0,
      });
    }

    return epics;
  }

  // --- Features from FEATURES.md ---

  private parseFeatures(): SafeFeature[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'FEATURES.md'));
    if (!content) return [];

    const features: SafeFeature[] = [];
    let currentEpicId = '';

    const lines = content.split('\n');
    for (const line of lines) {
      // Track current epic
      const epicMatch = line.match(/###?\s+(E-\d+)\s*—/);
      if (epicMatch) {
        currentEpicId = epicMatch[1];
        continue;
      }

      // Feature in tables: | F-XX.X Name | ✅ Done / ⏳ Backlog | files |
      const featureMatch = line.match(/\|\s*(F-[\d.]+)\s+(.+?)\s*\|\s*(✅\s*Done|⏳\s*Backlog|🔄\s*En cours|[^|]+)\s*\|\s*(.+?)\s*\|/);
      if (featureMatch && currentEpicId) {
        const statusRaw = featureMatch[3].trim();
        let status: FeatureStatus = 'backlog';
        if (statusRaw.includes('Done')) status = 'done';
        else if (statusRaw.includes('En cours')) status = 'in-progress';

        features.push({
          id: featureMatch[1],
          name: featureMatch[2].trim(),
          epicId: currentEpicId,
          status,
          files: featureMatch[4].trim(),
        });
        continue;
      }

      // Feature as sub-header: ### F-XX.X : Name
      const featureHeaderMatch = line.match(/###\s+(F-[\d.]+)\s*:\s*(.+)/);
      if (featureHeaderMatch && currentEpicId) {
        // Look ahead for status in the feature section — default to backlog
        if (!features.some(f => f.id === featureHeaderMatch[1])) {
          features.push({
            id: featureHeaderMatch[1],
            name: featureHeaderMatch[2].trim(),
            epicId: currentEpicId,
            status: 'backlog',
            files: '',
          });
        }
      }
    }

    return features;
  }

  // --- Themes from PORTFOLIO.md ---

  private parseThemes(): SafeTheme[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return [];

    const themes: SafeTheme[] = [];
    const colors: Record<string, string> = {
      'TS1': '#ffcdd2',
      'TS2': '#bbdefb',
      'TS3': '#c8e6c9',
      'TS4': '#e1bee7',
    };

    // Parse theme table: | 🟥 TS1 Monétisation | E-01, E-02... | O2 + O4 | ARR + revenus |
    // More general: match any theme row with emoji prefix
    const themeRowRegex = /\|\s*(?:🟥|🟦|🟩|🟪)\s*(TS\d)\s+(.+?)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/g;
    let m;
    while ((m = themeRowRegex.exec(content)) !== null) {
      const id = m[1];
      themes.push({
        id,
        name: m[2].trim(),
        color: colors[id] || '#f5f5f5',
        epicIds: m[3].trim().split(/,\s*/).map(e => e.trim()),
        okr: m[4].trim(),
        impact: m[5].trim(),
      });
    }

    return themes;
  }

  // --- Value Streams from PORTFOLIO.md ---

  private parseValueStreams(): SafeValueStream[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return [];

    const streams: SafeValueStream[] = [];
    // Parse VS table: | 🟢 VS1 Club to Screen | 10 | 23 | 55 | ~259 SP |
    const vsRegex = /\|\s*(?:🟢|🟠|⬜)\s*(VS\d|Transverse)\s+(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*~?(\d+)\s*SP\s*\|/g;
    let m;
    while ((m = vsRegex.exec(content)) !== null) {
      streams.push({
        id: m[1],
        name: m[2].trim(),
        epicsCount: parseInt(m[3]),
        featuresCount: parseInt(m[4]),
        usCount: parseInt(m[5]),
        storyPoints: parseInt(m[6]),
      });
    }

    return streams;
  }

  // --- PI Objectives from PI-OBJECTIVES.md ---

  private parsePiObjectives(): SafePiObjective[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PI-OBJECTIVES.md'));
    if (!content) return [];

    const objectives: SafePiObjective[] = [];

    // Committed objectives: after "### Objectifs Engagés"
    // Stretch objectives: after "### Objectifs Étendus"
    const sections = [
      { marker: 'Objectifs Engagés', type: 'committed' as const },
      { marker: 'Objectifs Étendus', type: 'stretch' as const },
    ];

    for (const section of sections) {
      const sectionStart = content.indexOf(section.marker);
      if (sectionStart === -1) continue;

      // Find next section boundary
      const nextSectionMatch = content.substring(sectionStart + section.marker.length).match(/\n###?\s/);
      const sectionEnd = nextSectionMatch
        ? sectionStart + section.marker.length + (nextSectionMatch.index || 0)
        : content.length;
      const sectionContent = content.substring(sectionStart, sectionEnd);

      // Parse table rows: | # | Objectif | VS | Thème | BV | Features | SP |
      const rowRegex = /\|\s*(\d+)\s*\|\s*\*\*(.+?)\*\*\s*(?:—\s*(.+?))?\s*\|\s*(VS\d|Transverse)\s*\|\s*(TS\d)\s*\|\s*\*\*(\d+)\*\*\s*\|\s*([^|]+)\|\s*(\d+)\s*\|/g;
      let m;
      while ((m = rowRegex.exec(sectionContent)) !== null) {
        objectives.push({
          number: parseInt(m[1]),
          description: `${m[2]}${m[3] ? ' — ' + m[3] : ''}`.trim(),
          valueStream: m[4],
          theme: m[5],
          businessValue: parseInt(m[6]),
          type: section.type,
          featuresLinked: m[7].trim(),
          storyPoints: parseInt(m[8]),
        });
      }
    }

    return objectives;
  }

  // --- Risks from ROAM.md ---

  private parseRisks(): SafeRisk[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'ROAM.md'));
    if (!content) return [];

    const risks: SafeRisk[] = [];
    // Split by risk headers: ### R-XX : Title
    const riskSections = content.split(/(?=###\s+R-\d+\s*:)/);

    for (const section of riskSections) {
      const headerMatch = section.match(/###\s+(R-\d+)\s*:\s*(.+)/);
      if (!headerMatch) continue;

      const id = headerMatch[1];
      const title = headerMatch[2].trim();

      const category = this.extractTableField(section, 'Catégorie') || '';
      const roamStatusRaw = this.extractTableField(section, 'Statut ROAM') || '';
      const probability = this.extractTableField(section, 'Probabilité') || '';
      const impact = this.extractTableField(section, 'Impact') || '';
      const owner = this.extractTableField(section, 'Owner') || '';

      // Extract description paragraph
      const descMatch = section.match(/\*\*Description\*\*\s*:\s*(.+?)(?:\n\n|\*\*)/s);
      const description = descMatch ? descMatch[1].trim() : '';

      // Parse ROAM status (remove bold markers)
      const cleanStatus = roamStatusRaw.replace(/\*\*/g, '').trim() as RoamStatus;
      const validStatuses: RoamStatus[] = ['Resolved', 'Owned', 'Accepted', 'Mitigated'];

      risks.push({
        id,
        title,
        category: category.replace(/\*\*/g, '').trim(),
        roamStatus: validStatuses.includes(cleanStatus) ? cleanStatus : 'Owned',
        probability: probability.replace(/\*\*/g, '').trim(),
        impact: impact.replace(/\*\*/g, '').trim(),
        owner: owner.replace(/\*\*/g, '').trim(),
        description,
      });
    }

    return risks;
  }

  // --- Flow Metrics from FLOW-METRICS.md ---

  private parseFlowMetrics(): SafeFlowMetric[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'FLOW-METRICS.md'));
    if (!content) return [];

    const metrics: SafeFlowMetric[] = [];
    // Parse metrics table: | **Flow Distribution** | definition | unit | target |
    const metricRegex = /\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
    let m;
    while ((m = metricRegex.exec(content)) !== null) {
      const name = m[1].trim();
      // Skip header row
      if (name === 'Métrique' || name.startsWith('-')) continue;

      metrics.push({
        name,
        definition: m[2].trim(),
        unit: m[3].trim(),
        targetPi1: m[4].trim(),
      });
    }

    return metrics;
  }

  // --- Roadmap from PORTFOLIO.md Gantt ---

  private parseRoadmap(): SafeRoadmapItem[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return [];

    const items: SafeRoadmapItem[] = [];
    // Parse gantt items: E-01 Portail Sponsor Self-Service   :e01, 2026-02-16, 42d
    // or                  E-11 Régie Publicitaire Régionale  :crit, e11, 2026-04-01, 42d
    const ganttRegex = /(E-\d+)\s+(.+?)\s+:(?:crit,\s*)?[a-z]\d+,\s*(\d{4}-\d{2}-\d{2}),\s*(\d+)d/g;
    let m;
    while ((m = ganttRegex.exec(content)) !== null) {
      // Determine PI from date
      const date = m[3];
      let pi = 'PI-1';
      if (date >= '2026-06-01') pi = 'PI-3';
      else if (date >= '2026-04-01') pi = 'PI-2';

      items.push({
        epicId: m[1],
        name: m[2].trim(),
        pi,
        startDate: date,
        durationDays: parseInt(m[4]),
      });
    }

    return items;
  }

  // --- Proposals from docs/proposals/*.md ---

  private parseProposals(): SafeProposalSummary[] {
    if (!fs.existsSync(PROPOSALS_DIR)) return [];

    const files = fs.readdirSync(PROPOSALS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort();

    return files.map(file => {
      const content = this.readFileSafe(path.join(PROPOSALS_DIR, file));
      if (!content) return null;

      return this.parseProposalHeader(file, content);
    }).filter((p): p is SafeProposalSummary => p !== null);
  }

  private parseProposalHeader(filename: string, content: string): SafeProposalSummary {
    // Determine type from filename
    let type: ProposalType = 'prop';
    if (filename.startsWith('SPIKE-')) type = 'spike';
    else if (filename.startsWith('SPEC-')) type = 'spec';

    // Extract ID from first heading
    const headingMatch = content.match(/^#\s+(.+)/m);
    const headingText = headingMatch ? headingMatch[1] : filename;

    let id: string;
    let title: string;

    if (type === 'prop') {
      // # PROP-001: Title or # PROP-001 — Title
      const propMatch = headingText.match(/(PROP-\d+)[:\s—]+\s*(.+)/);
      id = propMatch ? propMatch[1] : filename.replace('.md', '');
      title = propMatch ? propMatch[2].trim() : headingText;
    } else if (type === 'spike') {
      // # SPIKE-001 — Title
      const spikeMatch = headingText.match(/(SPIKE-\d+)\s*—\s*(.+)/);
      id = spikeMatch ? spikeMatch[1] : filename.replace('.md', '');
      title = spikeMatch ? spikeMatch[2].trim() : headingText;
    } else {
      // # SPEC US-22.2.2 — Title
      const specMatch = headingText.match(/(SPEC\s+US-[\d.]+)\s*—\s*(.+)/);
      id = specMatch ? specMatch[1].replace(/\s+/g, '-') : filename.replace('.md', '');
      title = specMatch ? specMatch[2].trim() : headingText;
    }

    // Extract status — handle both **Statut** : value and **Statut :** value formats
    const statusMatch = content.match(/\*\*Statut\*\*\s*:\s*(.+)/i)
      || content.match(/\*\*Statut\s*:\*\*\s*(.+)/i);
    const rawStatus = statusMatch ? statusMatch[1].trim() : 'Proposé';
    const status = this.mapProposalStatus(rawStatus);

    // Extract date
    const dateMatch = content.match(/\*\*Date\*\*\s*:\s*(.+)/i);
    const date = dateMatch ? dateMatch[1].trim() : '';

    // Extract related epic
    const epicMatch = content.match(/\*\*(?:Lié à|Epic)\*\*\s*:\s*(E-\d+)/i)
      || content.match(/>\s*\*\*Epic\*\*\s*:\s*(E-\d+)/i);
    const relatedEpic = epicMatch ? epicMatch[1] : null;

    return {
      id,
      title,
      type,
      relatedEpic,
      status,
      date,
      filePath: filename,
    };
  }

  // --- Helper methods ---

  private mapProposalStatus(raw: string): ProposalStatus {
    const lower = raw.toLowerCase();
    if (lower.includes('terminé') || lower.includes('done') || lower.includes('go')) return 'done';
    if (lower.includes('en cours') || lower.includes('implementing')) return 'implementing';
    if (lower.includes('approuv') || lower.includes('approved')) return 'approved';
    if (lower.includes('revue') || lower.includes('review')) return 'in-review';
    return 'draft';
  }

  private buildEpicThemeMap(): Record<string, string> {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return {};

    const map: Record<string, string> = {};
    // Parse theme table rows: | 🟥 TS1 ... | E-01, E-02, ... |
    const rowRegex = /\|\s*(?:🟥|🟦|🟩|🟪)\s*(TS\d)\s+.+?\s*\|\s*([^|]+)\|/g;
    let m;
    while ((m = rowRegex.exec(content)) !== null) {
      const theme = m[1];
      const epicIds = m[2].trim().split(/,\s*/);
      for (const epicId of epicIds) {
        const clean = epicId.trim();
        if (clean.match(/^E-\d+$/)) {
          map[clean] = theme;
        }
      }
    }
    return map;
  }

  private buildEpicVsMap(): Record<string, string> {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return {};

    const map: Record<string, string> = {};
    // Extract from theme table — Column "Thème" has epic lists and theme has associated VS
    // Simpler: map from the architecture diagram in PORTFOLIO
    // VS1 Epics: E-04, E-06, E-07, E-12, E-13, E-15, E-18, E-19, E-22, E-23
    // VS2 Epics: E-01, E-02, E-03, E-05, E-11, E-17
    // Transverse: E-08, E-09, E-10, E-14, E-16, E-20, E-21

    // Parse PI objective tables which have VS column
    const piContent = this.readFileSafe(path.join(SAFE_DIR, 'PI-OBJECTIVES.md'));
    if (piContent) {
      const objRegex = /\|\s*\d+\s*\|\s*\*\*.+?\*\*.*?\|\s*(VS\d|Transverse)\s*\|/g;
      let m2;
      while ((m2 = objRegex.exec(piContent)) !== null) {
        // Extract epic IDs from the same row's features column
        const lineStart = piContent.lastIndexOf('\n', m2.index);
        const lineEnd = piContent.indexOf('\n', m2.index + m2[0].length);
        const line = piContent.substring(lineStart, lineEnd);

        const epicRefs = line.match(/F-(\d+)\.\d+/g);
        if (epicRefs) {
          const vs = m2[1];
          for (const ref of epicRefs) {
            const epicNum = ref.match(/F-(\d+)/)?.[1];
            if (epicNum) {
              map[`E-${epicNum.padStart(2, '0')}`] = vs;
            }
          }
        }
      }
    }

    // Hardcoded fallbacks from PORTFOLIO.md architecture
    const vsMapping: Record<string, string[]> = {
      'VS1': ['E-04', 'E-06', 'E-07', 'E-12', 'E-13', 'E-15', 'E-18', 'E-19', 'E-22', 'E-23'],
      'VS2': ['E-01', 'E-02', 'E-03', 'E-05', 'E-11', 'E-17', 'E-21'],
      'Transverse': ['E-08', 'E-09', 'E-10', 'E-14', 'E-16', 'E-20'],
    };

    for (const [vs, epics] of Object.entries(vsMapping)) {
      for (const epic of epics) {
        if (!map[epic]) map[epic] = vs;
      }
    }

    return map;
  }

  private buildEpicPiMap(): Record<string, string> {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return {};

    const map: Record<string, string> = {};
    // Parse roadmap gantt dates
    const ganttRegex = /(E-\d+)\s+.+?\s+:(?:crit,\s*)?[a-z]\d+,\s*(\d{4}-\d{2}-\d{2})/g;
    let m;
    while ((m = ganttRegex.exec(content)) !== null) {
      const date = m[2];
      if (date >= '2026-06-01') map[m[1]] = 'PI-3';
      else if (date >= '2026-04-01') map[m[1]] = 'PI-2';
      else map[m[1]] = 'PI-1';
    }

    // Done epics from FEATURES.md
    const featContent = this.readFileSafe(path.join(SAFE_DIR, 'FEATURES.md'));
    if (featContent) {
      const doneSection = featContent.match(/## Epics Terminés.*?(?=## PI-1)/s);
      if (doneSection) {
        const doneEpicRegex = /###\s+(E-\d+)/g;
        let dm;
        while ((dm = doneEpicRegex.exec(doneSection[0])) !== null) {
          map[dm[1]] = 'Done';
        }
      }
    }

    return map;
  }

  private buildEpicSpMap(): Record<string, number> {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'PORTFOLIO.md'));
    if (!content) return {};

    const map: Record<string, number> = {};
    // PI-1 objectives table has SP per objective, not per epic
    // Use FEATURES.md US tables to sum SP per epic
    const featContent = this.readFileSafe(path.join(SAFE_DIR, 'FEATURES.md'));
    if (featContent) {
      let currentEpicId = '';
      for (const line of featContent.split('\n')) {
        const epicMatch = line.match(/###?\s+(E-\d+)\s*—/);
        if (epicMatch) {
          currentEpicId = epicMatch[1];
          if (!map[currentEpicId]) map[currentEpicId] = 0;
          continue;
        }

        // US table rows: | US-XX.X.X | desc | SP | Sprint | Priority |
        if (currentEpicId) {
          const usMatch = line.match(/\|\s*US-[\d.]+\s*\|[^|]+\|\s*(\d+)\s*\|/);
          if (usMatch) {
            map[currentEpicId] = (map[currentEpicId] || 0) + parseInt(usMatch[1]);
          }
        }

        // SP réel lines: **SP réel** : ~10 SP
        const spRealMatch = line.match(/\*\*SP réel\*\*\s*:\s*~?(\d+)/);
        if (spRealMatch && currentEpicId) {
          map[currentEpicId] = parseInt(spRealMatch[1]);
        }
      }
    }

    return map;
  }

  // --- Sprint Tracker builder ---

  private buildSprintTracker(): SafeSprintTracker {
    const sprints = this.parseSprints();

    // Determine current sprint based on today's date
    const today = new Date().toISOString().slice(0, 10);
    let currentSprintId: string | null = null;
    for (const sprint of sprints) {
      if (sprint.startDate <= today && sprint.endDate >= today) {
        currentSprintId = sprint.id;
        break;
      }
    }
    // If no current sprint found, pick the first future sprint
    if (!currentSprintId) {
      const future = sprints.find(s => s.startDate > today);
      if (future) currentSprintId = future.id;
    }

    const completedSprints = sprints.filter(s => s.endDate < today && s.velocity > 0);
    const averageVelocity = completedSprints.length > 0
      ? Math.round(completedSprints.reduce((sum, s) => sum + s.velocity, 0) / completedSprints.length)
      : 0;

    return { sprints, currentSprintId, averageVelocity };
  }

  private parseSprints(): SafeSprint[] {
    const content = this.readFileSafe(path.join(SAFE_DIR, 'USER-STORIES.md'));
    if (!content) return [];

    // Extract sprint date mapping from convention line
    // "S1 (Sem 8-9), S2 (Sem 10-11), S3 (Sem 12-13)"
    const sprintDateMap: Record<string, { start: string; end: string }> = {
      // PI-1 sprints (Feb-Mar 2026, 2-week sprints)
      'PI-1-S1': { start: '2026-02-16', end: '2026-02-27' },
      'PI-1-S2': { start: '2026-03-02', end: '2026-03-13' },
      'PI-1-S3': { start: '2026-03-16', end: '2026-03-27' },
      // PI-2 sprints (Apr-May 2026)
      'PI-2-S1': { start: '2026-04-01', end: '2026-04-14' },
      'PI-2-S2': { start: '2026-04-15', end: '2026-04-28' },
      'PI-2-S3': { start: '2026-04-29', end: '2026-05-12' },
      'PI-2-S4': { start: '2026-05-13', end: '2026-05-26' },
      'PI-2-S5': { start: '2026-05-27', end: '2026-06-09' },
      'PI-2-S6': { start: '2026-06-10', end: '2026-06-23' },
      // PI-3 sprints (Jun-Jul 2026)
      'PI-3-S1': { start: '2026-06-24', end: '2026-07-07' },
      'PI-3-S2': { start: '2026-07-08', end: '2026-07-21' },
      'PI-3-S3': { start: '2026-07-22', end: '2026-08-04' },
    };

    const sprintNames: Record<string, string> = {
      'PI-1-S1': 'Sprint 1 (Sem 8-9)',
      'PI-1-S2': 'Sprint 2 (Sem 10-11)',
      'PI-1-S3': 'Sprint 3 (Sem 12-13)',
      'PI-2-S1': 'PI-2 Sprint 1',
      'PI-2-S2': 'PI-2 Sprint 2',
      'PI-2-S3': 'PI-2 Sprint 3',
      'PI-2-S4': 'PI-2 Sprint 4',
      'PI-2-S5': 'PI-2 Sprint 5',
      'PI-2-S6': 'PI-2 Sprint 6',
      'PI-3-S1': 'PI-3 Sprint 1',
      'PI-3-S2': 'PI-3 Sprint 2',
      'PI-3-S3': 'PI-3 Sprint 3',
    };

    // Collect stories per sprint from "Partie 2 — User Stories Futures"
    const storiesBySprint: Record<string, SafeSprintStory[]> = {};

    // Track current PI and epic context
    let currentPi = 'PI-1';
    let currentEpicId = '';

    const lines = content.split('\n');
    const partie2Start = lines.findIndex(l => l.includes('Partie 2'));
    if (partie2Start === -1) return [];

    for (let i = partie2Start; i < lines.length; i++) {
      const line = lines[i];

      // Track PI sections
      const piMatch = line.match(/^###\s+(PI-\d+)/);
      if (piMatch) {
        currentPi = piMatch[1];
        continue;
      }

      // Track epic context
      const epicMatch = line.match(/^####\s+(E-\d+)\s*—/);
      if (epicMatch) {
        currentEpicId = epicMatch[1];
        continue;
      }

      // Parse story table rows
      // | US-XX.X.X | F-XX.X | Description | SP | Sprint | Priorité | Statut |
      const storyMatch = line.match(
        /\|\s*(US-[\d.]+)\s*\|\s*(F-[\d.]+)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\S+(?:\s+\S+)?)\s*\|\s*(\S+)\s*\|\s*(.+?)\s*\|/
      );
      if (storyMatch) {
        const storyId = storyMatch[1];
        const featureId = storyMatch[2];
        const name = storyMatch[3].trim();
        const sp = parseInt(storyMatch[4]);
        const sprintRaw = storyMatch[5].trim();
        const priority = storyMatch[6].trim();
        const statusRaw = storyMatch[7].trim();

        // Skip TBD sprints
        if (sprintRaw === 'TBD') continue;

        // Normalize sprint ID
        const sprintId = this.normalizeSprintId(sprintRaw, currentPi);
        if (!sprintId) continue;

        // Map status
        const status = this.mapStoryStatus(statusRaw);

        // Derive epicId from featureId if no context
        const epicId = currentEpicId || `E-${featureId.split('.')[0].replace('F-', '')}`;

        if (!storiesBySprint[sprintId]) {
          storiesBySprint[sprintId] = [];
        }

        storiesBySprint[sprintId].push({
          id: storyId,
          name,
          epicId,
          featureId,
          storyPoints: sp,
          priority,
          status,
        });
      }
    }

    // Build sprint objects
    const sprints: SafeSprint[] = [];
    for (const [sprintId, dates] of Object.entries(sprintDateMap)) {
      const stories = storiesBySprint[sprintId] || [];
      const velocity = stories.filter(s => s.status === 'done').reduce((sum, s) => sum + s.storyPoints, 0);
      const capacity = stories.reduce((sum, s) => sum + s.storyPoints, 0);

      // Only include sprints that have stories or are in current/past timeframe
      if (stories.length > 0 || dates.start <= new Date().toISOString().slice(0, 10)) {
        sprints.push({
          id: sprintId,
          name: sprintNames[sprintId] || sprintId,
          piId: sprintId.split('-S')[0],
          startDate: dates.start,
          endDate: dates.end,
          stories,
          velocity,
          capacity,
        });
      }
    }

    return sprints.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  private normalizeSprintId(raw: string, currentPi: string): string | null {
    // "S1" → "PI-1-S1" (using context)
    // "PI-2 S1" → "PI-2-S1"
    const directMatch = raw.match(/^(PI-\d+)\s+S(\d+)$/);
    if (directMatch) {
      return `${directMatch[1]}-S${directMatch[2]}`;
    }

    const simpleMatch = raw.match(/^S(\d+)$/);
    if (simpleMatch) {
      return `${currentPi}-S${simpleMatch[1]}`;
    }

    return null;
  }

  private mapStoryStatus(raw: string): SprintStoryStatus {
    if (raw.includes('Done') || raw.includes('Livré')) return 'done';
    if (raw.includes('En cours')) return 'in-progress';
    if (raw.includes('Retiré')) return 'removed';
    return 'todo';
  }

  private computeKpis(epics: SafeEpic[], features: SafeFeature[], objectives: SafePiObjective[]): SafeKpis {
    const totalEpics = epics.length;
    const epicsDone = epics.filter(e => e.status === 'done').length;
    const totalFeatures = features.length;
    const featuresDone = features.filter(f => f.status === 'done').length;
    const totalStoryPoints = epics.reduce((sum, e) => sum + e.storyPoints, 0);

    // Predictability: committed BV achieved / committed BV planned
    const committedObjs = objectives.filter(o => o.type === 'committed');
    const totalPlannedBV = committedObjs.reduce((sum, o) => sum + o.businessValue, 0);

    return {
      totalEpics,
      epicsDone,
      totalFeatures,
      featuresDone,
      totalStoryPoints,
      currentPi: 'PI-1',
      predictability: totalPlannedBV > 0 ? null : null, // Will be computed in I&A
    };
  }

  private extractTableField(section: string, fieldName: string): string | null {
    const regex = new RegExp(`\\|\\s*\\*\\*${fieldName}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`);
    const match = section.match(regex);
    return match ? match[1].trim() : null;
  }

  private readFileSafe(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      logger.warn('SAFe: Could not read file', { filePath });
      return '';
    }
  }
}

export const safeParserService = new SafeParserService();
