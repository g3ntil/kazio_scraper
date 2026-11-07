// Never turn incidental contact details or guessed qualifications into requirements.
export function normalizeLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean);
  return [...new Map(parts.map(x => [x.toLowerCase(), x])).values()].join(' | ') || null;
}

export function supportedDegree(value: unknown, description: string): string | null {
  const patterns: Record<string, RegExp> = {
    none: /no (?:formal )?(?:degree|education|qualification)(?: is)? required/i,
    certificate: /\bcertificate\b/i,
    diploma: /\bdiploma\b/i,
    bachelor: /\bbachelor|\bbaccalaur|\blicence\b|\bundergraduate degree\b/i,
    master: /\bmaster|\bma[iî]trise\b/i,
    phd: /\bph\.?d\b|\bdoctorat|\bdoctoral/i,
  };
  return typeof value === 'string' && patterns[value]?.test(description) ? value : null;
}

export function applicationDestination(candidate: unknown, description: string, sourceUrl: string) {
  const fallback = { apply_method: 'external_link', apply_contact: sourceUrl };
  if (typeof candidate !== 'string') return fallback;
  const email = candidate.trim().toLowerCase();
  if (!/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(email)) return fallback;
  if (/hotline|fraud|whistle|safeguard|privacy|abuse/i.test(email)) return fallback;
  const text = description.toLowerCase();
  let from = 0;
  let confirmed = false;
  while (true) {
    const index = text.indexOf(email, from);
    if (index < 0) break;
    const context = text.slice(Math.max(0, index - 220), index + email.length + 220);
    if (/do not send|don't send|not (?:for|accept)|fraud|suspicious|scam|reporting|complaint/i.test(context)) return fallback;
    if (/appl(?:y|ication)|submit|send.{0,60}(?:cv|resume|résumé)|recruitment/i.test(context)) confirmed = true;
    from = index + email.length;
  }
  return confirmed ? { apply_method: 'email', apply_contact: email } : fallback;
}
