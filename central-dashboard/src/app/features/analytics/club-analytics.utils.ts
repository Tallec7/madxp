const categoryColors: Record<string, string> = {
  sponsor: '#f59e0b',
  jingle: '#2563eb',
  ambiance: '#10b981',
  pub: '#ef4444',
  info: '#8b5cf6',
  animation: '#ec4899',
};

export function computePlaysTrend(
  currentPlays: number,
  extendedPlays: number
): number | null {
  const previousPlays = extendedPlays - currentPlays;

  if (previousPlays <= 0) {
    return currentPlays > 0 ? 100 : null;
  }

  return Math.round(((currentPlays - previousPlays) / previousPlays) * 100);
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0min';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}min`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getVideoName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
}

export function getCategoryPercent(
  playCount: number,
  categoriesBreakdown: Array<{ play_count: number }> | undefined
): number {
  if (!categoriesBreakdown?.length) return 0;
  const total = categoriesBreakdown.reduce((sum, c) => sum + c.play_count, 0);
  return total > 0 ? (playCount / total) * 100 : 0;
}

export function getCategoryColor(category: string): string {
  const key = (category || '').toLowerCase();
  return categoryColors[key] || '#94a3b8';
}

export function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = { critical: '🔴', warning: '🟠', info: '🔵' };
  return icons[severity] || '⚪';
}
