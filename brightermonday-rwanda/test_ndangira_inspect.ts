import * as cheerio from 'cheerio';

async function testNdangira() {
  console.log('Fetching https://ndangira.com/jobs ...');
  const res = await fetch('https://ndangira.com/jobs', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = await res.text();
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Content length: ${html.length} bytes`);

  const $ = cheerio.load(html);

  // Check pagination links
  const paginationLinks: string[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('page=') || href.includes('jobs.php?') || href.includes('/jobs?')) {
      paginationLinks.push(href);
    }
  });

  console.log('Pagination links found on listing:', paginationLinks);

  // Find job listing links/cards
  const jobLinks: { title: string; href: string }[] = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    // Detail links end with -{numericId}
    if (/\d+$/.test(href) || href.includes('deadline')) {
      jobLinks.push({ title: text, href });
    }
  });

  console.log(`Found ${jobLinks.length} potential job detail links.`);
  console.log('First 5 job links:', jobLinks.slice(0, 5));

  // Inspect sample detail page
  if (jobLinks.length > 0) {
    const sampleUrl = jobLinks[0].href.startsWith('http') 
      ? jobLinks[0].href 
      : `https://ndangira.com/${jobLinks[0].href.replace(/^\//, '')}`;
    
    console.log(`\nFetching sample detail page: ${sampleUrl}`);
    const detailRes = await fetch(sampleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const detailHtml = await detailRes.text();
    const $detail = cheerio.load(detailHtml);

    console.log('Detail Page Title:', $detail('title').text());
    console.log('Detail Page H1/H2:', $detail('h1, h2, h3').map((_, el) => $detail(el).text().trim()).get());

    // Extract all text lines or key-value pairs on detail page
    const textBlocks: string[] = [];
    $detail('p, div, span, td, th, li').each((_, el) => {
      const text = $detail(el).text().trim();
      if (text.includes('Organization') || text.includes('Company') || text.includes('Location') || text.includes('Deadline') || text.includes('Posted')) {
        textBlocks.push(text);
      }
    });
    console.log('Key metadata blocks found:', textBlocks.slice(0, 10));

    // Look for apply button / link
    const applyLinks: string[] = [];
    $detail('a').each((_, el) => {
      const href = $detail(el).attr('href') || '';
      const text = $detail(el).text().trim();
      if (text.toLowerCase().includes('apply') || href.includes('apply') || href.includes('http') && !href.includes('ndangira.com')) {
        applyLinks.push(`${text} -> ${href}`);
      }
    });
    console.log('Outbound/Apply links:', applyLinks);
  }
}

testNdangira().catch(console.error);
