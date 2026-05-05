export interface SiteVersionContext {
  site_type?: 'pi' | 'saas' | 'demo';
  software_version?: string | null;
  last_seen_at?: Date | null;
}

export function formatVersion(site: SiteVersionContext): string {
  const { site_type, software_version, last_seen_at } = site;

  if (site_type === 'saas') {
    return 'SaaS';
  }

  if (site_type === 'demo') {
    return '—';
  }

  // Pi
  if (!software_version) {
    return last_seen_at ? 'Version inconnue' : '—';
  }

  const trimmed = software_version.trim();
  return trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed : `v${trimmed}`;
}
