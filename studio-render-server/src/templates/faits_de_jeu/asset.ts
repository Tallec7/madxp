// Abstraction `asset()` pour résoudre les URLs des assets statiques.
// - En contexte Remotion (worker + Player Remotion natif) : staticFile()
// - En contexte Vite preview (studio POC) : URL absolue sous /
//
// Détection : `import.meta.env` n'existe que dans Vite ; dans Remotion bundle
// staticFile est dispo via l'import.

export function asset(name: string): string {
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: unknown }).env) {
    return `/${name}`;
  }
  // Worker Remotion : staticFile sera disponible via dépendance externalisée S1.
  return `/${name}`;
}
