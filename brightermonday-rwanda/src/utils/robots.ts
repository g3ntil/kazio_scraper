export async function checkRobotsTxt(domain: string): Promise<{ isAllowed: boolean; rawText: string | null }> {
  const robotsUrl = `https://${domain}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) {
      return { isAllowed: true, rawText: null };
    }
    const text = await res.text();
    const isDisallowed = text.toLowerCase().includes('disallow: /jobs') || text.toLowerCase().includes('disallow: /');
    return { isAllowed: !isDisallowed, rawText: text };
  } catch (error) {
    console.warn(`[Robots] Warning fetching ${robotsUrl}:`, error);
    return { isAllowed: true, rawText: null };
  }
}
