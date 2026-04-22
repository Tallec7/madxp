import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(md: string): string {
  if (!md) return '';
  return DOMPurify.sanitize(marked.parse(md) as string);
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
