export interface UnifiedVideoOption {
  path: string;
  filename: string;
  displayName: string;
  category: string | null;
  isOnPi: boolean;
  isForThisSite: boolean;
  isCloud: boolean;
  source: 'local' | 'cloud' | 'both';
  cloudId?: string;
  hasSecondaryVariant?: boolean;
}

export type VideoOptionGroup = 'forThisSite' | 'onPi' | 'cloud';

export interface VideoOptionGroupEntry {
  key: VideoOptionGroup;
  label: string;
  icon: string;
  videos: UnifiedVideoOption[];
}

export interface HumanReadableDiff {
  label: string;
  type: 'added' | 'removed' | 'changed';
  summary: string;
  oldValue?: unknown;
  newValue?: unknown;
  isInternal?: boolean;
}

export interface OrphanedVideoDetail {
  path: string;
  location: string;
  repairable: boolean;
  suggestedPath: string | null;
}
