export async function checkRobotsTxt(domain: string = 'ndangira.com'): Promise<{ isAllowed: boolean; rawText: string }> {
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: {
        'User-Agent': 'KazioBot/1.0 (+https://kazio.rw)'
      }
    });

    if (!res.ok) {
      return { isAllowed: true, rawText: `HTTP ${res.status}` };
    }

    const text = await res.text();
    const disallowAll = text.includes('Disallow: /') && !text.includes('Allow: /');
    return {
      isAllowed: !disallowAll,
      rawText: text
    };
  } catch (error) {
    console.warn(`[robots.txt] Failed to fetch robots.txt for ${domain}, defaulting to ALLOWED`, error);
    return { isAllowed: true, rawText: '' };
  }
}
