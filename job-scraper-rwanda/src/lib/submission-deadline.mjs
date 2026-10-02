// Read only explicit submission instructions; never substitute an issue date.
export function submissionDeadline(text) {
  const normalized = text.replace(/\s+/g, ' ').replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const date = `(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{4}|\\d{1,2}\\s+(?:of\\s+)?${month}\\s*,?\\s*\\d{4}|${month}\\s+\\d{1,2}\\s*,?\\s*\\d{4})`;
  const leads = /submission deadline|closing date|bids? must be submitted|proposals? (?:must be submitted|submission date)|submit(?:ted)? (?:no later than|by|before)|received no later than|applications? close/gi;
  for (const lead of normalized.matchAll(leads)) {
    const window = normalized.slice(lead.index + lead[0].length, lead.index + lead[0].length + 180);
    if (/^(?:\s*[:\[]?\s*)?(?:not specified|not stated|none)/i.test(window)) continue;
    const match = window.match(new RegExp(date, 'i'));
    if (!match) continue;
    let value = match[0].replace(/\bof\s+/i, '');
    let parts = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (parts) value = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : `${value} UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) && iso !== value) continue;
      return iso;
    }
  }
  return null;
}
