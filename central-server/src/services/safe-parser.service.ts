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
import type {
  SafePortfolio,
  SafeEpic,
  SafeFeature,
  SafePiObjective,
  SafeKpis,
  SafeProposal,
  SafeProposalSummary,
  SafeSprintTracker,
  SprintStoryStatus,
  EpicStatus,
  ProposalType,
  ProposalStatus,
  RoamStatus,
} from '../types/safe.types';
import type { CacheEntry } from './safe-parser.types';
import {
  parseEpics,
  parseFeatures,
  parseThemes,
  parseValueStreams,
  parsePiObjectives,
  parseRisks,
  parseFlowMetrics,
  parseRoadmap,
  parseProposals,
} from './safe-parser-portfolio';
import { buildSprintTracker } from './safe-parser-sprints';

// In dev: __dirname = central-server/src/services/ → ../../../docs/safe
// In prod (Docker): __dirname = /app/dist/services/ → /app/docs/safe (copied by Dockerfile)
const PROJECT_ROOT = process.env.NODE_ENV === 'production'
  ? path.resolve(__dirname, '../..')  // /app/dist/services → /app
  : path.resolve(__dirname, '../../..');  // central-server/src/services → project root
const SAFE_DIR = path.join(PROJECT_ROOT, 'docs/safe');
const PROPOSALS_DIR = path.join(PROJECT_ROOT, 'docs/proposals');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  async getProposals(): Promise<SafeProposalSummary[]> {
    if (this.proposalsCache && Date.now() - this.proposalsCache.timestamp < CACHE_TTL_MS) {
      return this.proposalsCache.data;
    }

    const proposals = parseProposals(PROPOSALS_DIR, (p) => this.readFileSafe(p));

    // Apply DB overrides (hybrid layer — survives container restarts)
    try {
      const overrides = await safeRepository.getProposalOverrides();
      for (const proposal of proposals) {
        const override = overrides.get(proposal.id);
        if (override) {
          proposal.status = override as ProposalStatus;
        }
      }
    } catch (error) {
      logger.warn('SAFe: Failed to apply proposal status overrides', { error });
    }

    this.proposalsCache = { data: proposals, timestamp: Date.now() };
    return proposals;
  }

  async getProposal(id: string): Promise<SafeProposal | null> {
    const proposals = await this.getProposals();
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

    const tracker = buildSprintTracker(SAFE_DIR, (p) => this.readFileSafe(p));

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

  async updateProposalStatus(id: string, newStatus: ProposalStatus): Promise<boolean> {
    const proposals = await this.getProposals();
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

    const statusRegex = /(\*\*Statut\*\*\s*:\s*).+/i;
    const bqRegex = /(>\s*\*\*Statut\*\*\s*:\s*).+/i;
    const altRegex = /(\*\*Statut\s*:\*\*\s*).+/i;
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

    // Persist to DB (hybrid layer — survives container restarts)
    await safeRepository.upsertProposalStatus(id, newStatus);

    this.invalidateCache();
    logger.info('SAFe: Updated proposal status', { id, newStatus });
    return true;
  }

  async createProposal(data: { title: string; type: ProposalType; relatedEpic: string | null; content: string }): Promise<SafeProposalSummary> {
    if (!fs.existsSync(PROPOSALS_DIR)) {
      fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
    }

    // Determine next ID
    const existing = await this.getProposals();
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

  async deleteProposal(id: string): Promise<boolean> {
    const proposals = await this.getProposals();
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
    const epicHeaderRegex = new RegExp(`(###?\\s+${epicIdEscaped}\\s*—\\s*)(.+)`, 'g');

    let found = false;
    const newContent = content.replace(epicHeaderRegex, (_match, prefix: string, rest: string) => {
      found = true;
      let epicName = rest.replace(/\s*✅\s*DONE\s*/g, '').replace(/\s*⚠️\s*(PARTIELLEMENT\s+DONE)?\s*/g, '').trim();

      if (data.name) {
        epicName = data.name;
      }

      if (data.status === 'done') {
        epicName = `${epicName} ✅ DONE`;
      } else if (data.status === 'partial') {
        epicName = `${epicName} ⚠️ PARTIELLEMENT DONE`;
      }

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

  async updateProposalContent(id: string, data: { title?: string; content?: string }): Promise<boolean> {
    const proposals = await this.getProposals();
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
    const read = (p: string): string => this.readFileSafe(p);

    const epics = parseEpics(SAFE_DIR, read);
    const features = parseFeatures(SAFE_DIR, read);
    const themes = parseThemes(SAFE_DIR, read);
    const valueStreams = parseValueStreams(SAFE_DIR, read);
    const piObjectives = parsePiObjectives(SAFE_DIR, read);
    const risks = parseRisks(SAFE_DIR, read);
    const flowMetrics = parseFlowMetrics(SAFE_DIR, read);
    const roadmap = parseRoadmap(SAFE_DIR, read);

    // Enrich epics with feature counts
    for (const epic of epics) {
      const epicFeatures = features.filter(f => f.epicId === epic.id);
      epic.featuresCount = epicFeatures.length;
      epic.featuresDone = epicFeatures.filter(f => f.status === 'done').length;
    }

    const kpis = this.computeKpis(epics, features, piObjectives);

    return { epics, themes, valueStreams, piObjectives, risks, flowMetrics, roadmap, kpis };
  }

  // --- KPI computation ---

  private computeKpis(epics: SafeEpic[], features: SafeFeature[], objectives: SafePiObjective[]): SafeKpis {
    const totalEpics = epics.length;
    const epicsDone = epics.filter(e => e.status === 'done').length;
    const totalFeatures = features.length;
    const featuresDone = features.filter(f => f.status === 'done').length;
    const totalStoryPoints = epics.reduce((sum, e) => sum + e.storyPoints, 0);

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

  // --- Utilities ---

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
