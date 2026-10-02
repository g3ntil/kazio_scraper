import * as cheerio from "cheerio";

async function testRetrieval() {
  console.log("=== STARTING LIVE RETRIEVAL TEST FOR ALL 5 RWANDAN PORTALS ===\n");

  const results: Record<string, { status: string; count?: number; error?: string; sampleTitle?: string }> = {};

  // 1. Job In Rwanda
  try {
    console.log("1. Testing Job In Rwanda (jobinrwanda.com)...");
    const res = await fetch("https://www.jobinrwanda.com/jobs/all", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const html = await res.text();
    const articles = html.match(/<article[\s\S]*?<\/article>/g) || [];
    const sample = articles[0] ? articles[0].match(/field--name-title[^>]*>([^<]+)<\/span>/)?.[1]?.trim() : "None";
    results["jobinrwanda"] = { status: "OK", count: articles.length, sampleTitle: sample };
    console.log(`   -> Found ${articles.length} job cards. Sample: "${sample}"`);
  } catch (err: any) {
    results["jobinrwanda"] = { status: "FAILED", error: err.message };
    console.log(`   -> FAILED: ${err.message}`);
  }

  // 2. BrighterMonday
  try {
    console.log("2. Testing BrighterMonday Rwanda (brightermonday.co.rw)...");
    const res = await fetch("https://www.brightermonday.co.rw/jobs", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const cards = $('div[data-cy="listing-cards-components"], .relative.group');
    let sample = "";
    $('h3, [data-cy="listing-title"], a[href*="/listings/"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t && !sample && t.length > 5) sample = t;
    });
    // Check if JSON-LD exists
    let jsonLdCount = 0;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const d = JSON.parse($(el).html() || "{}");
        if (d["@type"] === "ItemList" || d.itemListElement) {
          jsonLdCount = d.itemListElement?.length || 0;
        }
      } catch {}
    });
    results["brightermonday"] = { status: "OK", count: Math.max(cards.length, jsonLdCount), sampleTitle: sample };
    console.log(`   -> Found listings (Cards: ${cards.length}, JSON-LD items: ${jsonLdCount}). Sample: "${sample}"`);
  } catch (err: any) {
    results["brightermonday"] = { status: "FAILED", error: err.message };
    console.log(`   -> FAILED: ${err.message}`);
  }

  // 3. Ndangira Rwanda
  try {
    console.log("3. Testing Ndangira (ndangira.com)...");
    const res = await fetch("https://ndangira.com/jobs/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href*="ndangira.com"]').each((_, el) => {
      const h = $(el).attr("href");
      if (h && (h.includes("/job-") || h.includes("/jobs-") || h.match(/-\d+\/?$/))) {
        links.push(h);
      }
    });
    const unique = [...new Set(links)];
    const sample = $('h2.entry-title, h1.entry-title, article h2').first().text().trim() || "Sample found";
    results["ndangira"] = { status: "OK", count: unique.length, sampleTitle: sample };
    console.log(`   -> Found ${unique.length} links. Sample: "${sample}"`);
  } catch (err: any) {
    results["ndangira"] = { status: "FAILED", error: err.message };
    console.log(`   -> FAILED: ${err.message}`);
  }

  // 4. Great Rwanda Jobs
  try {
    console.log("4. Testing Great Rwanda Jobs (greatrwandajobs.com)...");
    const res = await fetch("https://greatrwandajobs.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const html = await res.text();
    const matches = html.match(/<h2[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>[\s\S]*?<\/h2>/gi) || [];
    const sampleMatch = matches[0]?.match(/<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() || "None";
    results["greatrwandajobs"] = { status: "OK", count: matches.length, sampleTitle: sampleMatch };
    console.log(`   -> Found ${matches.length} job cards. Sample: "${sampleMatch}"`);
  } catch (err: any) {
    results["greatrwandajobs"] = { status: "FAILED", error: err.message };
    console.log(`   -> FAILED: ${err.message}`);
  }

  // 5. JobWeb Rwanda
  try {
    console.log("5. Testing JobWeb Rwanda (jobwebrwanda.com)...");
    const res = await fetch("https://jobwebrwanda.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: string[] = [];
    $('a[href*="jobwebrwanda.com"]').each((_, el) => {
      const h = $(el).attr("href");
      if (h && (h.includes("/jobs/") || h.includes("/job/"))) {
        jobs.push(h);
      }
    });
    const unique = [...new Set(jobs)];
    const sample = $('h2, h3').filter((_, el) => $(el).text().length > 10).first().text().trim() || "Sample found";
    results["jobwebrwanda"] = { status: "OK", count: unique.length, sampleTitle: sample };
    console.log(`   -> Found ${unique.length} links. Sample: "${sample}"`);
  } catch (err: any) {
    results["jobwebrwanda"] = { status: "FAILED", error: err.message };
    console.log(`   -> FAILED: ${err.message}`);
  }

  console.log("\n=== SUMMARY OF LIVE RETRIEVAL ===");
  console.table(results);
}

testRetrieval();
