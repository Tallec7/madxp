import { registerRoot } from 'remotion';
import { Root } from './Root';

/**
 * Entry point Remotion pour Templates Studio.
 *
 * Bundlé par `@remotion/bundler` au boot du `studio-render-worker.service.ts`.
 * Référencé via `entryPoint = path.resolve(__dirname, '../../templates-studio/index.ts')`
 * (résolu à `/app/templates-studio/index.ts` au runtime Docker).
 */
registerRoot(Root);
