// test_all_endpoints.ts
async function runTests() {
  const endpoints = [
    { name: 'Job in Rwanda', url: 'http://127.0.0.1:3000/api/scrape/list' },
    { name: 'BrighterMonday', url: 'http://127.0.0.1:3000/api/scrape/brightermonday/list' },
    { name: 'Ndangira', url: 'http://127.0.0.1:3000/api/scrape/ndangira/list' },
    { name: 'Great Rwanda Jobs', url: 'http://127.0.0.1:3000/api/scrape/greatrwandajobs/list' },
    { name: 'JobWeb Rwanda', url: 'http://127.0.0.1:3000/api/scrape/jobwebrwanda/list' },
  ];

  console.log('=== 1. Testing Individual Scraper Endpoints ===');
  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await fetch(ep.url);
      const data: any = await res.json();
      const count = (data.jobs || data.results || (Array.isArray(data) ? data : [])).length;
      console.log(`[PASS] ${ep.name}: Status ${res.status}, retrieved ${count} jobs in ${Date.now() - start}ms`);
    } catch (err: any) {
      console.log(`[FAIL] ${ep.name}: ${err.message} (${Date.now() - start}ms)`);
    }
  }

  console.log('\n=== 2. Testing Unified Parallel Runner (POST /api/scrape/all) ===');
  const pStart = Date.now();
  try {
    const res = await fetch('http://127.0.0.1:3000/api/scrape/all', { method: 'POST' });
    const data: any = await res.json();
    console.log(`[PASS] Parallel Scrape: Status ${res.status}, Total Jobs: ${data.totalJobs} in ${Date.now() - pStart}ms`);
    console.log('Breakdown:', JSON.stringify(data.breakdown, null, 2));
  } catch (err: any) {
    console.log(`[FAIL] Parallel Scrape: ${err.message} (${Date.now() - pStart}ms)`);
  }
}

runTests();
