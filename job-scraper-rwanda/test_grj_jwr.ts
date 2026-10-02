import * as cheerio from "cheerio";

async function testRetrieval() {
  console.log("=== TESTING GREAT RWANDA JOBS & JOBWEB RWANDA WITH SERVER LOGIC ===\n");

  // 1. Great Rwanda Jobs
  try {
    const url = "https://www.greatrwandajobs.com/jobs/index.php?option=com_jsjobs&task=job.getnextjobs&pagenum=1&jt=&cat=&cd=";
    console.log("Fetching Great Rwanda Jobs at:", url);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    console.log("GRJ Status:", res.status);
    const html = await res.text();
    const parts = html.split('<div id="js-jobs-wrapper">').slice(1);
    console.log("GRJ Jobs parsed on page 1:", parts.length);
    if (parts.length > 0) {
      const titleMatch = parts[0].match(/class="jobtitle" href="[^"]*">\s*([\s\S]*?)\s*<\/a>/);
      console.log("GRJ Sample title:", titleMatch ? titleMatch[1].trim() : "None");
    }
  } catch (err: any) {
    console.log("GRJ Failed:", err.message);
  }

  // 2. JobWeb Rwanda
  try {
    const url = "https://jobwebrwanda.com/page/1/?s&location&latitude&ptype=job_listing&longitude&full_address&north_east_lng&south_west_lng&north_east_lat&south_west_lat";
    console.log("\nFetching JobWeb Rwanda at:", url);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    console.log("JWR Status:", res.status);
    const html = await res.text();
    const jobBlocks = html.match(/<li class="job(?: job-alt)?">([\s\S]*?)<\/li>/g) || [];
    console.log("JWR Jobs parsed on page 1:", jobBlocks.length);
    if (jobBlocks.length > 0) {
      const $ = cheerio.load(jobBlocks[0]);
      console.log("JWR Sample title:", $('h2, h3, a').first().text().trim());
    }
  } catch (err: any) {
    console.log("JWR Failed:", err.message);
  }
}

testRetrieval();
