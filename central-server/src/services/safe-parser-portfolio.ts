/**
 * SAFe Parser — Portfolio parsing functions.
 *
 * Extracted from SafeParserService. All functions are standalone,
 * receiving docsDir and readFileSafe as parameters.
 */

import path from 'path';
import type { ReadFileSafeFn } from './safe-parser.types';
import type {
  SafeEpic,
  SafeFeature,
  SafeTheme,
  SafeValueStream,
  SafePiObjective,
  SafeRisk,
  SafeFlowMetric,
  SafeRoadmapItem,
  SafeProposalSummary,
  EpicStatus,
  FeatureStatus,
  RoamStatus,
  ProposalType,
  ProposalStatus,
} from '../types/safe.types';
import fs from 'fs';

// --- Epics from FEATURES.md ---

export function parseEpics(docsDir: string, readFileSafe: ReadFileSafeFn): SafeEpic[] {
  const content = readFileSafe(path.join(docsDir, 'FEATURES.md'));
  if (!content) return [];

  const epics: SafeEpic[] = [];
  const epicRegex = /###?\s+(E-\d+)\s*—\s*(.+)/g;
  let match;

  const themeMap = buildEpicThemeMap(docsDir, readFileSafe);
  const vsMap = buildEpicVsMap(docsDir, readFileSafe);
  const piMap = buildEpicPiMap(docsDir, readFileSafe);
  const spMap = buildEpicSpMap(docsDir, readFileSafe);

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

export function parseFeatures(docsDir: string, readFileSafe: ReadFileSafeFn): SafeFeature[] {
  const content = readFileSafe(path.join(docsDir, 'FEATURES.md'));
  if (!content) return [];

  const features: SafeFeature[] = [];
  let currentEpicId = '';

  const lines = content.split('\n');
  for (const line of lines) {
    const epicMatch = line.match(/###?\s+(E-\d+)\s*—/);
    if (epicMatch) {
      currentEpicId = epicMatch[1];
      continue;
    }

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

    const featureHeaderMatch = line.match(/###\s+(F-[\d.]+)\s*:\s*(.+)/);
    if (featureHeaderMatch && currentEpicId) {
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

export function parseThemes(docsDir: string, readFileSafe: ReadFileSafeFn): SafeTheme[] {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return [];

  const themes: SafeTheme[] = [];
  const colors: Record<string, string> = {
    'TS1': '#ffcdd2',
    'TS2': '#bbdefb',
    'TS3': '#c8e6c9',
    'TS4': '#e1bee7',
  };

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

export function parseValueStreams(docsDir: string, readFileSafe: ReadFileSafeFn): SafeValueStream[] {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return [];

  const streams: SafeValueStream[] = [];
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

export function parsePiObjectives(docsDir: string, readFileSafe: ReadFileSafeFn): SafePiObjective[] {
  const content = readFileSafe(path.join(docsDir, 'PI-OBJECTIVES.md'));
  if (!content) return [];

  const objectives: SafePiObjective[] = [];

  const sections = [
    { marker: 'Objectifs Engagés', type: 'committed' as const },
    { marker: 'Objectifs Étendus', type: 'stretch' as const },
  ];

  for (const section of sections) {
    const sectionStart = content.indexOf(section.marker);
    if (sectionStart === -1) continue;

    const nextSectionMatch = content.substring(sectionStart + section.marker.length).match(/\n###?\s/);
    const sectionEnd = nextSectionMatch
      ? sectionStart + section.marker.length + (nextSectionMatch.index || 0)
      : content.length;
    const sectionContent = content.substring(sectionStart, sectionEnd);

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

export function parseRisks(docsDir: string, readFileSafe: ReadFileSafeFn): SafeRisk[] {
  const content = readFileSafe(path.join(docsDir, 'ROAM.md'));
  if (!content) return [];

  const risks: SafeRisk[] = [];
  const riskSections = content.split(/(?=###\s+R-\d+\s*:)/);

  for (const section of riskSections) {
    const headerMatch = section.match(/###\s+(R-\d+)\s*:\s*(.+)/);
    if (!headerMatch) continue;

    const id = headerMatch[1];
    const title = headerMatch[2].trim();

    const category = extractTableField(section, 'Catégorie') || '';
    const roamStatusRaw = extractTableField(section, 'Statut ROAM') || '';
    const probability = extractTableField(section, 'Probabilité') || '';
    const impact = extractTableField(section, 'Impact') || '';
    const owner = extractTableField(section, 'Owner') || '';

    const descMatch = section.match(/\*\*Description\*\*\s*:\s*(.+?)(?:\n\n|\*\*)/s);
    const description = descMatch ? descMatch[1].trim() : '';

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

export function parseFlowMetrics(docsDir: string, readFileSafe: ReadFileSafeFn): SafeFlowMetric[] {
  const content = readFileSafe(path.join(docsDir, 'FLOW-METRICS.md'));
  if (!content) return [];

  const metrics: SafeFlowMetric[] = [];
  const metricRegex = /\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/g;
  let m;
  while ((m = metricRegex.exec(content)) !== null) {
    const name = m[1].trim();
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

export function parseRoadmap(docsDir: string, readFileSafe: ReadFileSafeFn): SafeRoadmapItem[] {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return [];

  const items: SafeRoadmapItem[] = [];
  const ganttRegex = /(E-\d+)\s+(.+?)\s+:(?:crit,\s*)?[a-z]\d+,\s*(\d{4}-\d{2}-\d{2}),\s*(\d+)d/g;
  let m;
  while ((m = ganttRegex.exec(content)) !== null) {
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

export function parseProposals(proposalsDir: string, readFileSafe: ReadFileSafeFn): SafeProposalSummary[] {
  if (!fs.existsSync(proposalsDir)) return [];

  const files = fs.readdirSync(proposalsDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  return files.map(file => {
    const content = readFileSafe(path.join(proposalsDir, file));
    if (!content) return null;

    return parseProposalHeader(file, content);
  }).filter((p): p is SafeProposalSummary => p !== null);
}

export function parseProposalHeader(filename: string, content: string): SafeProposalSummary {
  let type: ProposalType = 'prop';
  if (filename.startsWith('SPIKE-')) type = 'spike';
  else if (filename.startsWith('SPEC-')) type = 'spec';

  const headingMatch = content.match(/^#\s+(.+)/m);
  const headingText = headingMatch ? headingMatch[1] : filename;

  let id: string;
  let title: string;

  if (type === 'prop') {
    const propMatch = headingText.match(/(PROP-\d+)[:\s—]+\s*(.+)/);
    id = propMatch ? propMatch[1] : filename.replace('.md', '');
    title = propMatch ? propMatch[2].trim() : headingText;
  } else if (type === 'spike') {
    const spikeMatch = headingText.match(/(SPIKE-\d+)\s*—\s*(.+)/);
    id = spikeMatch ? spikeMatch[1] : filename.replace('.md', '');
    title = spikeMatch ? spikeMatch[2].trim() : headingText;
  } else {
    const specMatch = headingText.match(/(SPEC\s+US-[\d.]+)\s*—\s*(.+)/);
    id = specMatch ? specMatch[1].replace(/\s+/g, '-') : filename.replace('.md', '');
    title = specMatch ? specMatch[2].trim() : headingText;
  }

  const statusMatch = content.match(/\*\*Statut\*\*\s*:\s*(.+)/i)
    || content.match(/\*\*Statut\s*:\*\*\s*(.+)/i);
  const rawStatus = statusMatch ? statusMatch[1].trim() : 'Proposé';
  const status = mapProposalStatus(rawStatus);

  const dateMatch = content.match(/\*\*Date\*\*\s*:\s*(.+)/i);
  const date = dateMatch ? dateMatch[1].trim() : '';

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

export function mapProposalStatus(raw: string): ProposalStatus {
  const lower = raw.toLowerCase();
  if (lower.includes('terminé') || lower.includes('done') || lower.includes('go')) return 'done';
  if (lower.includes('en cours') || lower.includes('implementing')) return 'implementing';
  if (lower.includes('approuv') || lower.includes('approved')) return 'approved';
  if (lower.includes('revue') || lower.includes('review')) return 'in-review';
  return 'draft';
}

// --- Epic enrichment maps ---

export function buildEpicThemeMap(docsDir: string, readFileSafe: ReadFileSafeFn): Record<string, string> {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return {};

  const map: Record<string, string> = {};
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

export function buildEpicVsMap(docsDir: string, readFileSafe: ReadFileSafeFn): Record<string, string> {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return {};

  const map: Record<string, string> = {};

  const piContent = readFileSafe(path.join(docsDir, 'PI-OBJECTIVES.md'));
  if (piContent) {
    const objRegex = /\|\s*\d+\s*\|\s*\*\*.+?\*\*.*?\|\s*(VS\d|Transverse)\s*\|/g;
    let m2;
    while ((m2 = objRegex.exec(piContent)) !== null) {
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

export function buildEpicPiMap(docsDir: string, readFileSafe: ReadFileSafeFn): Record<string, string> {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return {};

  const map: Record<string, string> = {};
  const ganttRegex = /(E-\d+)\s+.+?\s+:(?:crit,\s*)?[a-z]\d+,\s*(\d{4}-\d{2}-\d{2})/g;
  let m;
  while ((m = ganttRegex.exec(content)) !== null) {
    const date = m[2];
    if (date >= '2026-06-01') map[m[1]] = 'PI-3';
    else if (date >= '2026-04-01') map[m[1]] = 'PI-2';
    else map[m[1]] = 'PI-1';
  }

  const featContent = readFileSafe(path.join(docsDir, 'FEATURES.md'));
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

export function buildEpicSpMap(docsDir: string, readFileSafe: ReadFileSafeFn): Record<string, number> {
  const content = readFileSafe(path.join(docsDir, 'PORTFOLIO.md'));
  if (!content) return {};

  const map: Record<string, number> = {};
  const featContent = readFileSafe(path.join(docsDir, 'FEATURES.md'));
  if (featContent) {
    let currentEpicId = '';
    for (const line of featContent.split('\n')) {
      const epicMatch = line.match(/###?\s+(E-\d+)\s*—/);
      if (epicMatch) {
        currentEpicId = epicMatch[1];
        if (!map[currentEpicId]) map[currentEpicId] = 0;
        continue;
      }

      if (currentEpicId) {
        const usMatch = line.match(/\|\s*US-[\d.]+\s*\|[^|]+\|\s*(\d+)\s*\|/);
        if (usMatch) {
          map[currentEpicId] = (map[currentEpicId] || 0) + parseInt(usMatch[1]);
        }
      }

      const spRealMatch = line.match(/\*\*SP réel\*\*\s*:\s*~?(\d+)/);
      if (spRealMatch && currentEpicId) {
        map[currentEpicId] = parseInt(spRealMatch[1]);
      }
    }
  }

  return map;
}

// --- Utility ---

export function extractTableField(section: string, fieldName: string): string | null {
  const regex = new RegExp(`\\|\\s*\\*\\*${fieldName}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`);
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}
