import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ndjvazyeykrzkqlipwbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kanZhenlleWtyemtxbGlwd2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0OTAzMzAsImV4cCI6MjA4NzA2NjMzMH0.OXKzbKKc05qYmy9nCFNyA5JwJVXJYz8u8Y9eGHCSdxo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

/**
 * Extracts and standardizes deadline from URL slug or text string
 */
export function extractDeadlineToIso(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.toLowerCase().replace(/%20/g, '-');

  // Pattern 1: ISO YYYY-MM-DD e.g. deadline-2026-09-04-1082 or 2026-09-04
  const isoMatch = clean.match(/(?:deadline-)?(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Pattern 2: Day-Month-Year e.g. deadline-23-sep-2026-1233 or deadline-12-october-2027 or 17 September 2026
  const dmyMatch = clean.match(/(?:deadline-)?(\d{1,2})(?:st|nd|rd|th)?[-/\s.]([a-z]{3,9})[-/\s.](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const mon = dmyMatch[2];
    const year = dmyMatch[3];
    const monthNum = MONTH_MAP[mon] || MONTH_MAP[mon.slice(0, 3)];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  // Pattern 3: Month-Day-Year e.g. deadline-september-4th-2026-949 or deadline-sep-22-2026
  const mdyMatch = clean.match(/(?:deadline-)?([a-z]{3,9})[-/\s.](\d{1,2})(?:st|nd|rd|th)?[-/\s.](\d{4})/);
  if (mdyMatch) {
    const mon = mdyMatch[1];
    const day = mdyMatch[2].padStart(2, '0');
    const year = mdyMatch[3];
    const monthNum = MONTH_MAP[mon] || MONTH_MAP[mon.slice(0, 3)];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  // Pattern 4: DD-MM-YYYY or DD/MM/YYYY e.g. deadline-03-11-2026 or 25/09/2026
  const numMatch = clean.match(/(?:deadline-)?(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (numMatch) {
    const p1 = parseInt(numMatch[1], 10);
    const p2 = parseInt(numMatch[2], 10);
    const year = numMatch[3];

    // Standard Rwandan portal date format is DD-MM-YYYY
    const day = String(p1).padStart(2, '0');
    const month = String(p2).padStart(2, '0');
    if (p2 <= 12) {
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

/**
 * Extracts clean company name from job title
 * e.g. "Product Operations Lead at One Acre Fund" -> "One Acre Fund"
 */
export function extractCompanyFromTitle(title: string): string | null {
  if (!title) return null;
  const match = title.match(/\b(?:at|t)\s+([^(\n]+)(?:\(.*?\))?$/i);
  if (match) {
    const rawCompany = match[1].trim();
    if (rawCompany.length > 2 && rawCompany.toLowerCase() !== 'unknown') {
      return rawCompany;
    }
  }
  return null;
}

/**
 * Fetches and parses detail page from Ndangira
 */
export async function fetchNdangiraDetail(url: string): Promise<{
  description: string | null;
  company: string | null;
  location: string | null;
  deadline: string | null;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      return { description: null, company: null, location: null, deadline: null };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, ins, iframe, nav, header, footer, .sharedaddy, .ndangira-related').remove();

    let company: string | null = null;
    let location: string | null = null;
    let deadline: string | null = null;

    // Parse info-boxes
    $('.info-box, .job-overview, .job-details, .job-meta').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.includes('Organization / Company') || text.includes('Company:')) {
        company = text.replace(/Organization \/ Company|Company:/i, '').trim();
      }
      if (text.includes('Location:')) {
        location = text.replace(/Location:/i, '').trim();
      }
      if (text.includes('Deadline:')) {
        const dStr = text.replace(/Deadline:/i, '').trim();
        const parsed = extractDeadlineToIso(dStr);
        if (parsed) deadline = parsed;
      }
    });

    // Extract main description text
    const contentEl = $('.post-content, .entry-content, .single-post-content, article').first();
    let description: string | null = null;

    if (contentEl.length > 0) {
      // Check for deadline inside body text if not found yet
      if (!deadline) {
        const bodyText = contentEl.text();
        const deadlineMatch = bodyText.match(/(?:Deadline|DEADLINE|Deadline for submission)[:\s]*([^\n\r<]{5,50})/i);
        if (deadlineMatch) {
          const parsed = extractDeadlineToIso(deadlineMatch[1]);
          if (parsed) deadline = parsed;
        }
      }

      // Replace headings and paragraphs with clean line breaks
      contentEl.find('p, h1, h2, h3, h4, h5, h6, li, div').each((_, elem) => {
        $(elem).append('\n');
      });
      description = contentEl.text().trim().replace(/\n{3,}/g, '\n\n');
    }

    return { description, company, location, deadline };
  } catch (err) {
    return { description: null, company: null, location: null, deadline: null };
  }
}

/**
 * Main Execution: Scans public.jobs, enriches missing fields, and executes safe UPDATEs
 */
export async function runNdangiraEnrichment() {
  console.log('====================================================');
  console.log('🚀 Starting Ndangira Safe Job Enrichment Pipeline');
  console.log('====================================================');

  // Query incomplete rows from ndangira
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, job_url, deadline, description, location')
    .ilike('job_url', '%ndangira.com%')
    .or('deadline.is.null,description.is.null');

  if (error) {
    console.error('❌ Failed to query database:', error.message);
    return;
  }

  const targetJobs = (jobs || []).filter(j => !j.deadline || !j.description || j.description.length < 100);
  console.log(`📋 Found ${targetJobs.length} Ndangira rows requiring enrichment in public.jobs.\n`);

  let updatedCount = 0;
  let deadlineRecoveredCount = 0;
  let descriptionEnrichedCount = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < targetJobs.length; i++) {
    const job = targetJobs[i];
    console.log(`[${i + 1}/${targetJobs.length}] Processing Job ID: ${job.id}`);
    console.log(`  Title: "${job.title}"`);

    // 1. Recover deadline from slug
    let finalDeadline = job.deadline || extractDeadlineToIso(job.job_url);
    let finalCompany = (job.company && job.company !== 'Unknown') ? job.company : extractCompanyFromTitle(job.title);
    let finalLocation = job.location || null;
    let finalDescription = job.description || null;

    // 2. If description is missing/short or deadline is still missing, fetch detail page
    if (!finalDescription || finalDescription.length < 100 || !finalDeadline) {
      console.log(`  🌐 Fetching live details from: ${job.job_url}...`);
      const detail = await fetchNdangiraDetail(job.job_url);
      
      if (detail.description && detail.description.length > 50) {
        finalDescription = detail.description;
        descriptionEnrichedCount++;
      }
      if (!finalDeadline && detail.deadline) {
        finalDeadline = detail.deadline;
      }
      if ((!finalCompany || finalCompany === 'Unknown') && detail.company) {
        finalCompany = detail.company;
      }
      if (!finalLocation && detail.location) {
        finalLocation = detail.location;
      }
      
      // Polite rate limit delay
      await new Promise(r => setTimeout(r, 250));
    }

    if (finalDeadline && !job.deadline) {
      deadlineRecoveredCount++;
    }

    // Determine active status based on verified deadline
    const isActive = finalDeadline ? (finalDeadline >= todayStr) : true;

    // Prepare update payload
    const updatePayload: Record<string, any> = {
      is_active: isActive
    };

    if (finalDeadline) updatePayload.deadline = finalDeadline;
    if (finalDescription && finalDescription.length > (job.description?.length || 0)) {
      updatePayload.description = finalDescription;
    }
    if (finalCompany && finalCompany !== 'Unknown') {
      updatePayload.company = finalCompany;
    }
    if (finalLocation) {
      updatePayload.location = finalLocation;
    }

    // 3. Execute strict UPDATE ONLY on existing row
    const { error: updateErr } = await supabase
      .from('jobs')
      .update(updatePayload)
      .eq('id', job.id);

    if (updateErr) {
      console.error(`  ❌ Failed to update job #${job.id}: ${updateErr.message}`);
    } else {
      updatedCount++;
      console.log(`  ✅ Successfully updated! Deadline: ${finalDeadline || 'N/A'}, Company: ${finalCompany || 'N/A'}, Desc Len: ${finalDescription?.length || 0}`);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 Enrichment Run Completed');
  console.log(`Total rows processed: ${targetJobs.length}`);
  console.log(`Successfully updated: ${updatedCount}`);
  console.log(`Deadlines recovered: ${deadlineRecoveredCount}`);
  console.log(`Descriptions enriched: ${descriptionEnrichedCount}`);
  console.log('====================================================\n');
}

runNdangiraEnrichment();
