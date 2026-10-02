import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { submissionDeadline } from './src/lib/submission-deadline.mjs';
import { nonJobReason } from './src/lib/job-batch-filter.mjs';

// Preparation is independent of the running watcher: never discard its cache.
const root = new URL('./output/extraction-readiness/', import.meta.url);
await fs.mkdir(root, { recursive: true });
const response = await fetch('http://127.0.0.1:3000/api/scrape/local');
if (!response.ok) throw new Error(`Cache HTTP ${response.status}`);
const cache = await response.json();
const logResponse = await fetch('http://127.0.0.1:3000/api/logs');
if (!logResponse.ok) throw new Error(`Logs HTTP ${logResponse.status}`);
const logs = (await logResponse.json()).logs;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await fs.writeFile(new URL(`raw-${stamp}.json`, root), JSON.stringify(cache, null, 2));
const today = new Date().toISOString().slice(0, 10);
const ready = {}, held = {}, summary = {};
for (const [source, items] of Object.entries(cache)) {
  ready[source] = []; held[source] = [];
  const seen = new Set();
  const sourceLogs = logs.filter(x => x.source === source);
  const lastStart = sourceLogs.find(x => /\[1\/2\] Connecting/.test(x.message));
  const lastComplete = sourceLogs.find(x => /complete: .*items cached/.test(x.message));
  const inProgress = lastStart && (!lastComplete || lastStart.timestamp > lastComplete.timestamp);
  for (const original of items) {
    const item = structuredClone(original);
    const $ = cheerio.load(item.description_html || item.description_text || item.description || '');
    $('script,style,svg,ins,.google-anno-skip,[data-cy="share"],#similar-jobs,.similar-jobs').remove();
    let main = $('[data-cy="job-description"], [data-cy="listing-description"], .job-description').first();
    if (source === 'brightermonday' && !main.length) {
      const sections = $('h2,h3').filter((_, e) => /^Job (summary|descriptions? & requirements)$/i.test($(e).text().trim())).parent();
      if (sections.length) { const wrap = $('<div></div>'); sections.each((_, e) => wrap.append($(e).clone())); main = wrap; }
    }
    const body = main.length ? main : $('body');
    body.find('br').replaceWith('\n');
    body.find('p,div,li,h1,h2,h3,h4').append('\n');
    let text = body.text().replace(/(^|\n)\s*\?\?(?=\S)/g, '$1').replace(/[\t ]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    item.description = text;
    item.description_text = text;
    item.description_html = body.html() || '';
    if (item.content_type && item.content_type !== 'job') item.submission_deadline ||= submissionDeadline(text);
    if (source === 'brightermonday' || source === 'ndangira') {
      item.external_id ||= item.job_url?.split('/').filter(Boolean).pop();
    }
    const reasons = [];
    if (inProgress) reasons.push('detail enrichment still running');
    if (!item.title?.trim() || /^(untitled|job)$/i.test(item.title.trim())) reasons.push('missing title');
    if (!item.company?.trim() || /^unknown$/i.test(item.company.trim())) reasons.push('missing company');
    try { const u = new URL(item.job_url); if (!['https:', 'http:'].includes(u.protocol)) throw 0; } catch { reasons.push('invalid URL'); }
    if (!inProgress && (text.length < 200 || /^No detailed description available\.?$/i.test(text))) reasons.push('missing or thin description');
    if (item.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline)) reasons.push('invalid deadline');
    if (item.deadline && item.deadline < today) reasons.push('expired');
    const excludedContent = nonJobReason(item);
    if (excludedContent) reasons.push(`non-job content: ${excludedContent}`);
    if (source === 'jobwebrwanda') reasons.push('AI source disabled; staging lacks extraction tracking');
    if (seen.has(item.job_url)) reasons.push('duplicate URL');
    seen.add(item.job_url);
    item.is_active = !item.deadline || item.deadline >= today;
    if (reasons.length) held[source].push({ reasons, item });
    else ready[source].push(item);
  }
  const reasons = {};
  for (const row of held[source]) for (const reason of row.reasons) reasons[reason] = (reasons[reason] || 0) + 1;
  summary[source] = { total: items.length, ready: ready[source].length, held: held[source].length, reasons,
    deadlineUnknown: ready[source].filter(x => !x.deadline).length };
}
await fs.writeFile(new URL('ready.json', root), JSON.stringify(ready, null, 2));
await fs.writeFile(new URL('held.json', root), JSON.stringify(held, null, 2));
await fs.writeFile(new URL('report.json', root), JSON.stringify({ checkedAt: new Date().toISOString(), summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));
