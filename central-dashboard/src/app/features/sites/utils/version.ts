export function formatVersion(version: string | null | undefined): string {
  if (!version) {
    return 'N/A';
  }

  const trimmed = version.trim();
  if (!trimmed) {
    return 'N/A';
  }

  return trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed : `v${trimmed}`;
}
