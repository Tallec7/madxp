/**
 * SAFe Dashboard Service
 *
 * Client HTTP pour l'API SAFe (portfolio, proposals, epics).
 */

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from './api.service';

// --- Types miroir du backend (central-server/src/types/safe.types.ts) ---

export type EpicStatus = 'funnel' | 'analysis' | 'backlog' | 'implementing' | 'done' | 'partial';
export type FeatureStatus = 'done' | 'in-progress' | 'backlog';
export type ProposalType = 'prop' | 'spike' | 'spec';
export type ProposalStatus = 'draft' | 'in-review' | 'approved' | 'implementing' | 'done';
export type RoamStatus = 'Resolved' | 'Owned' | 'Accepted' | 'Mitigated';
export type PiObjectiveType = 'committed' | 'stretch';

export interface SafeEpic {
  id: string;
  name: string;
  theme: string;
  valueStream: string;
  pi: string;
  status: EpicStatus;
  storyPoints: number;
  featuresCount: number;
  featuresDone: number;
}

export interface SafeFeature {
  id: string;
  name: string;
  epicId: string;
  status: FeatureStatus;
  files: string;
}

export interface SafeTheme {
  id: string;
  name: string;
  color: string;
  epicIds: string[];
  okr: string;
  impact: string;
}

export interface SafeValueStream {
  id: string;
  name: string;
  epicsCount: number;
  featuresCount: number;
  usCount: number;
  storyPoints: number;
}

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

export interface SafeRisk {
  id: string;
  title: string;
  category: string;
  roamStatus: RoamStatus;
  probability: string;
  impact: string;
  owner: string;
  description: string;
}

export interface SafeFlowMetric {
  name: string;
  definition: string;
  unit: string;
  targetPi1: string;
}

export interface SafeRoadmapItem {
  epicId: string;
  name: string;
  pi: string;
  startDate: string;
  durationDays: number;
}

export interface SafeKpis {
  totalEpics: number;
  epicsDone: number;
  totalFeatures: number;
  featuresDone: number;
  totalStoryPoints: number;
  currentPi: string;
  predictability: number | null;
}

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

export interface SafeProposal {
  id: string;
  title: string;
  type: ProposalType;
  relatedEpic: string | null;
  status: ProposalStatus;
  date: string;
  content: string;
  filePath: string;
}

export type SafeProposalSummary = Omit<SafeProposal, 'content'>;

// --- Sprint types ---

export type SprintStoryStatus = 'todo' | 'in-progress' | 'done' | 'removed';

export interface SafeSprintStory {
  id: string;
  name: string;
  epicId: string;
  featureId: string;
  storyPoints: number;
  priority: string;
  status: SprintStoryStatus;
}

export interface SafeSprint {
  id: string;
  name: string;
  piId: string;
  startDate: string;
  endDate: string;
  stories: SafeSprintStory[];
  velocity: number;
  capacity: number;
}

export interface SafeSprintTracker {
  sprints: SafeSprint[];
  currentSprintId: string | null;
  averageVelocity: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class SafeService {
  private readonly api = inject(ApiService);

  getPortfolio(): Observable<SafePortfolio> {
    return this.api.get<ApiResponse<SafePortfolio>>('/safe/portfolio').pipe(
      map(res => res.data)
    );
  }

  getProposals(): Observable<SafeProposalSummary[]> {
    return this.api.get<ApiResponse<SafeProposalSummary[]>>('/safe/proposals').pipe(
      map(res => res.data)
    );
  }

  getProposal(id: string): Observable<SafeProposal> {
    return this.api.get<ApiResponse<SafeProposal>>(`/safe/proposals/${id}`).pipe(
      map(res => res.data)
    );
  }

  createProposal(data: { title: string; type: ProposalType; relatedEpic: string | null; content: string }): Observable<SafeProposalSummary> {
    return this.api.post<ApiResponse<SafeProposalSummary>>('/safe/proposals', data).pipe(
      map(res => res.data)
    );
  }

  updateProposalStatus(id: string, status: ProposalStatus): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/proposals/${id}`, { status }).pipe(
      map(() => void 0)
    );
  }

  deleteProposal(id: string): Observable<void> {
    return this.api.delete<ApiResponse<void>>(`/safe/proposals/${id}`).pipe(
      map(() => void 0)
    );
  }

  updateEpic(id: string, data: { status?: EpicStatus; name?: string }): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/epics/${id}`, data).pipe(
      map(() => void 0)
    );
  }

  getSprints(): Observable<SafeSprintTracker> {
    return this.api.get<ApiResponse<SafeSprintTracker>>('/safe/sprints').pipe(
      map(res => res.data)
    );
  }

  updateStoryStatus(sprintId: string, storyId: string, status: SprintStoryStatus): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/sprints/${sprintId}/stories/${storyId}/status`, { status }).pipe(
      map(() => void 0)
    );
  }

  updateRiskRoamStatus(id: string, status: RoamStatus): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/risks/${id}/roam-status`, { status }).pipe(
      map(() => void 0)
    );
  }

  updateProposalContent(id: string, data: { title?: string; content?: string }): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/proposals/${id}/content`, data).pipe(
      map(() => void 0)
    );
  }

  updateStoryFields(sprintId: string, storyId: string, data: { storyPoints?: number; priority?: string }): Observable<void> {
    return this.api.put<ApiResponse<void>>(`/safe/sprints/${sprintId}/stories/${storyId}/fields`, data).pipe(
      map(() => void 0)
    );
  }
}
