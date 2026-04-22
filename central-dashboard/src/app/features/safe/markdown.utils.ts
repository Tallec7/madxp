import { marked } from 'marked';

export interface TocEntry {
  level: number;
  text: string;
  id: string;
}

export interface AdrRef {
  type: 'pr' | 'adr' | 'prop' | 'feature';
  label: string;
  external: boolean;
  href?: string;
  routerPath?: string;
  queryParams?: Record<string, string>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`[\]()]/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function addHeadingIds(html: string): string {
  return html.replace(/<(h[1-3])>([\s\S]*?)<\/h[1-3]>/g, (_, tag, inner) => {
    const id = slugify(inner);
    return `<${tag} id="${id}">${inner}</${tag}>`;
  });
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  return addHeadingIds(marked.parse(md) as string);
}

export function extractToc(md: string): TocEntry[] {
  return [...md.matchAll(/^(#{1,3})\s+(.+)$/gm)].map(m => {
    const raw = m[2]
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    return { level: m[1].length, text: raw, id: slugify(raw) };
  });
}

export function parseAdrRefs(content: string, currentId: string): AdrRef[] {
  const refs: AdrRef[] = [];
  const seen = new Set<string>();

  const add = (ref: AdrRef) => {
    if (!seen.has(ref.label)) { seen.add(ref.label); refs.push(ref); }
  };

  for (const m of content.matchAll(/PR #(\d+)/g)) {
    add({ type: 'pr', label: `PR #${m[1]}`, external: true, href: `https://github.com/Tallec7/neopro/pull/${m[1]}` });
  }

  for (const m of content.matchAll(/\bADR-(\d+)\b/g)) {
    const num = parseInt(m[1], 10);
    const id = `ADR-${String(num).padStart(3, '0')}`;
    if (id !== currentId) {
      add({ type: 'adr', label: id, external: false, routerPath: '/safe/adr', queryParams: { id } });
    }
  }

  for (const m of content.matchAll(/\bPROP-(\d+)\b/g)) {
    const label = `PROP-${String(parseInt(m[1], 10)).padStart(3, '0')}`;
    add({ type: 'prop', label, external: false, routerPath: `/safe/proposals/${label}` });
  }

  for (const m of content.matchAll(/\bF-(\d+)\.(\d+)\b/g)) {
    const label = `F-${m[1]}.${m[2]}`;
    add({ type: 'feature', label, external: false, routerPath: '/safe' });
  }

  return refs;
}

export const MARKDOWN_STYLES = `
  .markdown-content { font-size: 0.88rem; line-height: 1.7; }
  .markdown-content h1 { font-size: 1.15rem; font-weight: 700; margin: 20px 0 10px; border-bottom: 1px solid var(--color-border, #e5e7eb); padding-bottom: 6px; }
  .markdown-content h2 { font-size: 1rem; font-weight: 600; margin: 16px 0 8px; }
  .markdown-content h3 { font-size: 0.92rem; font-weight: 600; margin: 12px 0 6px; }
  .markdown-content p { margin: 8px 0; }
  .markdown-content code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; background: var(--color-surface-2, #f3f4f6); padding: 1px 5px; border-radius: 3px; }
  .markdown-content pre { background: var(--color-surface-2, #f3f4f6); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 10px 0; }
  .markdown-content pre code { background: transparent; padding: 0; }
  .markdown-content table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 0.82rem; }
  .markdown-content th { background: var(--color-surface-2, #f3f4f6); padding: 6px 10px; text-align: left; font-weight: 600; border: 1px solid var(--color-border, #e5e7eb); }
  .markdown-content td { padding: 5px 10px; border: 1px solid var(--color-border, #e5e7eb); vertical-align: top; }
  .markdown-content ul, .markdown-content ol { padding-left: 20px; margin: 8px 0; }
  .markdown-content li { margin: 3px 0; }
  .markdown-content blockquote { border-left: 3px solid var(--color-primary, #4f46e5); padding: 4px 12px; margin: 8px 0; color: var(--color-text-secondary, #666); background: var(--color-surface-2, #f9fafb); border-radius: 0 4px 4px 0; }
  .markdown-content a { color: var(--color-primary, #4f46e5); text-decoration: underline; }
  .markdown-content strong { font-weight: 600; }
  .markdown-content hr { border: none; border-top: 1px solid var(--color-border, #e5e7eb); margin: 14px 0; }
  .markdown-content img { max-width: 100%; border-radius: 6px; margin: 6px 0; }
`;
