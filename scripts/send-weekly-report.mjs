#!/usr/bin/env node
/**
 * Envoi du rapport hebdomadaire par email via Resend API
 * Usage : node send-weekly-report.mjs --file REPORT.md
 * Env : RESEND_API_KEY, REPORT_EMAIL_TO, REPORT_EMAIL_FROM
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function mdToHtml(md) {
  // Conversion minimale Markdown → HTML pour email
  return md
    .replace(/^# (.*)/gm,  '<h1>$1</h1>')
    .replace(/^## (.*)/gm, '<h2 style="border-bottom:1px solid #eee;padding-bottom:4px">$1</h2>')
    .replace(/^### (.*)/gm,'<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:1px 4px;border-radius:3px">$1</code>')
    .replace(/^> (.*)/gm, '<blockquote style="border-left:3px solid #e00;margin:0;padding-left:12px;color:#555">$1</blockquote>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\| (.+) \|$/gm, row => {
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td style="padding:4px 8px;border:1px solid #ddd">${c}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, s => `<table style="border-collapse:collapse;width:100%">${s}</table>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hbtup])/gm, '')
    .replace(/<details>[\s\S]*?<\/details>/g, '<p><em>[Voir le fichier Markdown pour les diffs détaillés]</em></p>');
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
