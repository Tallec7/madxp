#!/usr/bin/env node
/**
 * Envoi du rapport hebdomadaire par email via Resend API
 * Usage : node send-weekly-report.mjs --file REPORT.md
 * Env : RESEND_API_KEY, REPORT_EMAIL_TO, REPORT_EMAIL_FROM
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function mdToHtml(md) {
  const TD  = 'style="padding:6px 10px;border:1px solid #ddd;vertical-align:top"';
  const TDH = 'style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;font-weight:600"';

  return md
    // Unfold <details> blocks — email clients don't support the tag, render content inline
    .replace(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g, (_, summary, content) =>
      `<p><strong>${summary}</strong></p>${content}`
    )
    // Strip table separator lines (|---|---|)
    .replace(/^\|[\s|:-]+\|$/gm, '')
    // Headings
    .replace(/^# (.*)/gm,  '<h1 style="color:#0b1020;margin-bottom:4px">$1</h1>')
    .replace(/^## (.*)/gm, '<h2 style="color:#0b1020;border-bottom:2px solid #e00;padding-bottom:4px;margin-top:32px">$1</h2>')
    .replace(/^### (.*)/gm,'<h3 style="color:#333;margin-top:20px">$1</h3>')
    // Inline formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:1px 5px;border-radius:3px;font-size:13px">$1</code>')
    // Blockquotes
    .replace(/^> (.*)/gm, '<blockquote style="border-left:3px solid #e00;margin:8px 0;padding:4px 12px;color:#555;background:#fafafa">$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">')
    // Tables — header row (first <tr> in each table block gets TDH cells)
    .replace(/^\| (.+) \|$/gm, (row) => {
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      return `<tr-md>${cells.map(c => `<td ${TD}>${c}</td>`).join('')}</tr-md>`;
    })
    .replace(/(<tr-md>[\s\S]*?<\/tr-md>\n?)+/g, block => {
      const rows = block.trim().split('\n').filter(Boolean);
      const thead = rows[0].replace(/<tr-md>/, `<tr>`).replace(/<\/tr-md>/, '</tr>')
        .replace(/<td [^>]+>/g, `<td ${TDH}>`);
      const tbody = rows.slice(1).map(r =>
        r.replace(/<tr-md>/, '<tr>').replace(/<\/tr-md>/, '</tr>')
      ).join('\n');
      return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">\n${thead}\n${tbody}\n</table>`;
    })
    // Ordered lists
    .replace(/^\d+\. (.*)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => {
      // Detect if preceded by a number (ordered) — wrap in <ol>
      return `<ol style="padding-left:20px;margin:8px 0">${s}</ol>`;
    })
    // Unordered lists
    .replace(/^[-*] (.*)/gm, '<li-ul>$1</li-ul>')
    .replace(/(<li-ul>[\s\S]*?<\/li-ul>\n?)+/g, s =>
      `<ul style="padding-left:20px;margin:8px 0">${s.replace(/<li-ul>/g,'<li>').replace(/<\/li-ul>/g,'</li>')}</ul>`
    )
    // Paragraphs — blank lines become <p> breaks, but skip already-tagged lines
    .replace(/\n{2,}/g, '\n\n')
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|table|blockquote|hr|li)/.test(block)) return block;
      return `<p style="margin:8px 0;line-height:1.6">${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

async function send() {
  const args = process.argv.slice(2);
  const fileArg = args.find((_, i) => args[i - 1] === '--file');

  if (!fileArg) {
    console.error('Usage: node send-weekly-report.mjs --file REPORT.md');
    process.exit(1);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.REPORT_EMAIL_TO;
  const from   = process.env.REPORT_EMAIL_FROM ?? 'weekly@neopro.fr';

  if (!apiKey || !to) {
    console.error('Variables manquantes : RESEND_API_KEY, REPORT_EMAIL_TO');
    process.exit(1);
  }

  const md = readFileSync(fileArg, 'utf8');

  // Extraire le titre (ligne 1) pour le subject
  const titleMatch = md.match(/^# (.+)/m);
  const subject = titleMatch ? titleMatch[1] : 'Product Weekly — Neopro';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111; }
  h1 { color: #0b1020; }
  h2 { color: #0b1020; margin-top: 32px; }
  code { font-family: monospace; }
  table { font-size: 14px; }
  details { background: #f9f9f9; padding: 8px; border-radius: 4px; }
  footer { margin-top: 40px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 16px; }
</style></head>
<body>
${mdToHtml(md)}
<footer>Rapport généré automatiquement · <a href="https://github.com/Tallec7/neopro">GitHub</a></footer>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: to.split(','), subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Resend error ${res.status}: ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✅ Email envoyé (id: ${data.id}) → ${to}`);
}

send().catch(e => { console.error(e); process.exit(1); });
