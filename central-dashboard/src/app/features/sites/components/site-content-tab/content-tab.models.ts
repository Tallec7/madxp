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
  // ADR-103 — Quand l'option correspond à une row `videos` avec
  // content_type ≠ 'video', on porte ces métadonnées jusqu'au consommateur
  // pour qu'il puisse fabriquer une entrée config bien formée (path = URL
  // externe, type = text/html, contentType + externalUrl renseignés) au
  // lieu d'un faux path FTP `videos/default/web_page-<ts>` qui finit en 404.
  contentType?: 'video' | 'web_page' | 'livestream';
  externalUrl?: string | null;
  durationSeconds?: number | null;
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
