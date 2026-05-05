/**
 * Rule `assets_resolve_http_200` — Every layer's `videoUrl` must answer to a
 * HEAD probe with a 2xx status. We use AbortSignal.timeout(3000) to keep the
 * checklist responsive (≤24s worst-case for 8 rules with 3s each). Severity:
 * error (a missing asset breaks the runtime).
 *
 * Implementation note: the rule treats network/timeout/non-2xx all as
 * `ok: false` — the message reports the count of failed assets, not the
 * specific upstream error (the dashboard "Corriger" button drops the user on
 * step 2 to inspect each layer).
 */
import type { ValidationRule } from '../types';

const HEAD_TIMEOUT_MS = 3000;

async function probe(url: string): Promise<boolean> {
  if (!url || typeof url !== 'string') return false;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

export const assetsResolveHttp200: ValidationRule = {
  id: 'assets_resolve_http_200',
  severity: 'error',
  async check(ctx) {
    const urls = ctx.template.layers.map((l) => l.videoUrl);
    if (urls.length === 0) {
      // Empty layers is covered by `at_least_one_layer`; we report ok here so
      // the user only sees the upstream criterion fail.
      return { ok: true, message: 'Aucun fond à vérifier (couvert par "Au moins un fond animé empilé").' };
    }
    const results = await Promise.all(urls.map(probe));
    const failed = results.filter((r) => !r).length;
    const ok = failed === 0;
    return {
      ok,
      message: ok
        ? 'Tous les fonds résolvent (accessibles en ligne)'
        : `${failed} fond(s) inaccessibles — vérifiez les URLs uploadées à l'étape 2.`,
      fixHint: ok ? undefined : { step: 2 },
    };
  },
};
