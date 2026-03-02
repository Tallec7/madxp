/**
 * SAFe Dashboard Types
 *
 * Types pour le parsing des fichiers markdown SAFe et l'API dashboard.
 */

// --- Epic ---

export type EpicStatus = 'funnel' | 'analysis' | 'backlog' | 'implementing' | 'done' | 'partial';

export interface SafeEpic {
  id: string;           // "E-01"
  name: string;
  theme: string;        // "TS1" | "TS2" | "TS3" | "TS4"
  valueStream: string;  // "VS1" | "VS2" | "Transverse"
  pi: string;           // "PI-1" | "PI-2" | "PI-3" | "Done"
  status: EpicStatus;
  storyPoints: number;
  featuresCount: number;
  featuresDone: number;
}

// --- Feature ---

export type FeatureStatus = 'done' | 'in-progress' | 'backlog';

export interface SafeFeature {
  id: string;         // "F-01.1"
  name: string;
  epicId: string;     // "E-01"
  status: FeatureStatus;
  files: string;
}

// --- Theme ---

export interface SafeTheme {
  id: string;         // "TS1"
  name: string;
  color: string;      // hex color
  epicIds: string[];
  okr: string;
  impact: string;
}

// --- Value Stream ---

export interface SafeValueStream {
  id: string;         // "VS1" | "VS2" | "Transverse"
  name: string;
  epicsCount: number;
  featuresCount: number;
  usCount: number;
  storyPoints: number;
}

// --- PI Objective ---

export type PiObjectiveType = 'committed' | 'stretch';

export interface SafePiObjective {
  number: number;
  description: string;
  valueStream: string;
  theme: string;
  businessValue: number;
  type: PiObjectiveType;
  featuresLinked: string;
  storyPoints: number;
}

// --- Risk (ROAM) ---

export type RoamStatus = 'Resolved' | 'Owned' | 'Accepted' | 'Mitigated';

export interface SafeRisk {
  id: string;            // "R-01"
  title: string;
  category: string;
  roamStatus: RoamStatus;
  probability: string;   // "Haute" | "Moyenne" | "Faible"
  impact: string;        // "Faible" | "Moyen" | "Haut" | "Critique"
  owner: string;
  description: string;
}

// --- Flow Metric ---

export interface SafeFlowMetric {
  name: string;
  definition: string;
  unit: string;
  targetPi1: string;
}

// --- Proposal ---

export type ProposalType = 'prop' | 'spike' | 'spec';
export type ProposalStatus = 'draft' | 'in-review' | 'approved' | 'implementing' | 'done';

export interface SafeProposal {
  id: string;           // "PROP-001" | "SPIKE-001" | "SPEC-US-22.2.2"
  title: string;
  type: ProposalType;
  relatedEpic: string | null;
  status: ProposalStatus;
  date: string;
  content: string;      // Raw markdown (only in detail endpoint)
  filePath: string;
}

export type SafeProposalSummary = Omit<SafeProposal, 'content'>;

// --- Roadmap Item ---

export interface SafeRoadmapItem {
  epicId: string;
  name: string;
  pi: string;
  startDate: string;    // "2026-02-16"
  durationDays: number;
}

// --- KPIs ---

export interface SafeKpis {
  totalEpics: number;
  epicsDone: number;
  totalFeatures: number;
  featuresDone: number;
  totalStoryPoints: number;
  currentPi: string;
  predictability: number | null;
}

// --- Portfolio (agrégé) ---

export interface SafePortfolio {
  epics: SafeEpic[];
  themes: SafeTheme[];
  valueStreams: SafeValueStream[];
  piObjectives: SafePiObjective[];
  risks: SafeRisk[];
  flowMetrics: SafeFlowMetric[];
  roadmap: SafeRoadmapItem[];
  kpis: SafeKpis;
}
