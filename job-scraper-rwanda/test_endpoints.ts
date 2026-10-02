// test_endpoints.ts
async function testAll() {
  console.log('--- Testing Parallel Scrape Endpoint (POST /api/scrape/all) ---');
  const tStart = Date.now();
  try {
    const res = await fetch('http://127.0.0.1:3000/api/scrape/all', { method: 'POST' });
    console.log(`HTTP Status: ${res.status}`);
    const text = await res.text();
    console.log(`Raw Response (${text.length} chars): ${text.slice(0, 300)}`);
    if (text) {
      const data = JSON.parse(text);
      console.log(`Total Duration: ${Date.now() - tStart}ms`);
      console.log(`Total Jobs Retrieved: ${data.totalJobs}`);
      console.log('Breakdown:', JSON.stringify(data.breakdown, null, 2));
    }
  } catch (err: any) {
    console.error('Failed test:', err.message);
  }
}

testAll();
