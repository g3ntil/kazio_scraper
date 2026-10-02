import { chromium, Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { DetailPageFields } from '../types.js';

let jsonLdLoggedCount = 0;

function cleanFieldValue(val: string | null): string | null {
  if (!val) return null;
  const labels = [
    'Minimum Qualification:',
    'Min Qualification:',
    'Experience Level:',
    'Experience Length:',
    'Language Requirement:',
    'Languages:',
    'Working Hours:',
    'Applicant Location:',
    'Location:',
  ];
  let cleaned = val;
  for (const label of labels) {
    const idx = cleaned.toLowerCase().indexOf(label.toLowerCase());
    if (idx > 0) {
      cleaned = cleaned.slice(0, idx).trim();
    }
  }
  return cleaned.trim() || null;
}

export function parseDetailPageHtml(html: string): DetailPageFields {
  const $ = cheerio.load(html);

  // 1. JSON-LD Extraction
  let posted_date_jsonld: string | null = null;
  let valid_through_jsonld: string | null = null;
  let base_salary_jsonld: Record<string, any> | null = null;
  let employment_type_jsonld: string | null = null;
  let industry_from_jsonld: string | null = null;
  let education_from_jsonld: string | null = null;
  let foundJsonLd = false;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html() || '';
      const parsed = JSON.parse(content);

      let items: any[] = [];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed['@graph'])) {
          items = parsed['@graph'];
        } else {
          items = [parsed];
        }
      }

      for (const item of items) {
        if (item && (item['@type'] === 'JobPosting' || item['@type']?.includes?.('JobPosting'))) {
          foundJsonLd = true;
          if (item.datePosted) {
            const d = new Date(item.datePosted);
            if (!isNaN(d.getTime())) posted_date_jsonld = d.toISOString();
          }
          if (item.validThrough) {
            const d = new Date(item.validThrough);
            if (!isNaN(d.getTime())) valid_through_jsonld = d.toISOString();
          }
          if (item.baseSalary) {
            base_salary_jsonld = typeof item.baseSalary === 'object' ? item.baseSalary : { value: item.baseSalary };
          }
          if (item.employmentType) {
            employment_type_jsonld = Array.isArray(item.employmentType) ? item.employmentType.join(', ') : String(item.employmentType);
          }
          if (item.industry) {
            industry_from_jsonld = String(item.industry).trim();
          }
          if (item.educationRequirements) {
            if (typeof item.educationRequirements === 'string') {
              education_from_jsonld = item.educationRequirements;
            } else if (item.educationRequirements.credentialCategory) {
              education_from_jsonld = String(item.educationRequirements.credentialCategory);
            } else if (item.educationRequirements.name) {
              education_from_jsonld = String(item.educationRequirements.name);
            } else if (item.educationRequirements['@id']) {
              const parts = String(item.educationRequirements['@id']).split('/');
              education_from_jsonld = parts[parts.length - 1];
            }
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  });

  if (jsonLdLoggedCount < 20) {
    jsonLdLoggedCount++;
    console.log(`[Detail Scraper] [Sample #${jsonLdLoggedCount}] JSON-LD ${foundJsonLd ? 'FOUND' : 'ABSENT'}`);
  }

  // 2. Industry tag
  let industry_tag: string | null = industry_from_jsonld;
  if (!industry_tag) {
    const tagText = $('.industry-tag, [data-cy="industry-tag"]').first().text().trim();
    if (tagText) {
      industry_tag = tagText;
    } else {
      const catLink = $('h1').closest('.flex-col, section, main, body').find('a[href*="/jobs/"]').filter((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim();
        return !href.includes('/post') && !text.toLowerCase().includes('post') && !text.toLowerCase().includes('view');
      }).first().text().trim();
      if (catLink) {
        industry_tag = catLink;
      }
    }
  }

  // 3. Job summary teaser text
  let job_summary_text: string | null = null;
  const summaryHeader = $('h3:contains("Job summary"), h2:contains("Job summary")').first();
  if (summaryHeader.length) {
    let pText = summaryHeader.next('p').text().trim();
    if (!pText) {
      pText = summaryHeader.parent().find('p').first().text().trim();
    }
    if (pText && !pText.toLowerCase().includes('minimum qualification')) {
      job_summary_text = pText;
    }
  }

  // 4. Structured fields from Summary block (Sibling span lookup + parent regex fallback)
  function getSiblingSpanValue(labelKeyword: string): string | null {
    let val: string | null = null;
    $('span').each((_, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes(labelKeyword.toLowerCase())) {
        const nextSpan = $(el).next('span').text().trim();
        if (nextSpan) {
          val = nextSpan;
        } else {
          const parentText = $(el).parent().text().replace(/\s+/g, ' ').trim();
          const match = parentText.match(new RegExp(`${labelKeyword}:?\\s*(.+)`, 'i'));
          if (match && match[1]) val = match[1].trim();
        }
      }
    });
    return cleanFieldValue(val);
  }

  const min_qualification = getSiblingSpanValue('Min Qualification') || getSiblingSpanValue('Minimum Qualification') || cleanFieldValue(education_from_jsonld);
  const experience_level = getSiblingSpanValue('Experience Level');
  const experience_length = getSiblingSpanValue('Experience Length');
  const language_requirement = getSiblingSpanValue('Language Requirement') || getSiblingSpanValue('Languages');
  const working_hours = getSiblingSpanValue('Working Hours') || (employment_type_jsonld ? employment_type_jsonld.replace('_', ' ') : null);
  const applicant_location = getSiblingSpanValue('Applicant Location') || getSiblingSpanValue('Location');

  // Salary raw extraction fallback from detail page
  let salary_raw: string | null = null;
  if (base_salary_jsonld && typeof base_salary_jsonld === 'object') {
    const salaryObj = base_salary_jsonld as Record<string, any>;
    if (salaryObj.currency) {
      const val = salaryObj.value;
      if (val && (val.minValue || val.maxValue || val.value)) {
        const min = val.minValue || val.value;
        const max = val.maxValue;
        salary_raw = max && max !== min ? `${salaryObj.currency} ${min} - ${max}` : `${salaryObj.currency} ${min}`;
      }
    }
  }
  if (!salary_raw) {
    $('span').each((_, el) => {
      const text = $(el).text().trim();
      if (!salary_raw && /^(?:USD|FRw|RWF|Negotiable|Confidential)\b/i.test(text) && text.length < 60) {
        salary_raw = text.replace(/\s+/g, ' ');
      }
    });
  }
  if (!salary_raw) {
    const salaryMatch = $('main, body').text().match(/(?:USD|FRw|RWF)\s*[\d,]+(?:\s*-\s*[\d,]+)?/i);
    if (salaryMatch) {
      salary_raw = salaryMatch[0].replace(/\s+/g, ' ').trim();
    }
  }

  // 5. Job description HTML & Plain Text
  // Remove UI boilerplate elements, similar jobs, one-trust modals, and share links
  $('#similar-jobs, .similar-jobs, [data-cy="similar-jobs"], nav, header, footer, #onetrust-banner-sdk, .onetrust-pc-dark-filter, button, script, style, iframe, svg, [data-cy="share"]').remove();

  let $descContainer: cheerio.Cheerio<cheerio.Element> | null = null;

  const prose = $('.prose');
  if (prose.length) {
    $descContainer = prose.first();
  } else {
    const h3Desc = $('h3, h2').filter((_, el) => /job description/i.test($(el).text()));
    if (h3Desc.length) {
      $descContainer = h3Desc.parent();
    }
  }

  let description_html = '';
  let description_text = '';

  if ($descContainer && $descContainer.length) {
    const $clean = cheerio.load($descContainer.html() || '');
    $clean('script, style, iframe, button, svg, [data-cy="share"]').remove();
    description_html = $clean.html() || '';
    description_text = $clean.text().replace(/\s+/g, ' ').trim();
  } else {
    const $main = $('main, article').first().clone();
    $main.find('header, footer, nav, button, form, .onetrust, svg, script, style, iframe').remove();
    description_html = $main.html() || '';
    description_text = $main.text().replace(/\s+/g, ' ').trim();
  }

  // 6. Strict Sanitation & Bounds Guards
  let clean_salary = salary_raw ? salary_raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : null;
  let clean_industry = industry_tag ? industry_tag.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() : null;

  // Enforce strict description size bounds (100 chars min, 15,000 chars max)
  let final_text = description_text || '';
  if (final_text.length > 15000) {
    console.warn(`[Strict Guard] Description text length (${final_text.length} chars) exceeded 15,000 max bound. Truncating.`);
    final_text = final_text.slice(0, 15000).trim() + '...';
  }

  let final_html = description_html || '';
  if (final_html.length > 25000) {
    final_html = final_html.slice(0, 25000).trim() + '...';
  }

  if (!final_text || final_text.length < 50) {
    final_html = '<p>No detailed description content retrieved.</p>';
    final_text = 'No detailed description content retrieved.';
  }

  return {
    industry_tag: clean_industry,
    posted_date_jsonld,
    valid_through_jsonld,
    base_salary_jsonld,
    employment_type_jsonld,
    job_summary_text,
    min_qualification,
    experience_level,
    experience_length,
    language_requirement,
    working_hours,
    applicant_location,
    salary_raw: clean_salary,
    description_html: final_html,
    description_text: final_text,
  };
}

export async function fetchDetailPage(source_url: string, existingPage?: Page): Promise<DetailPageFields> {
  let page = existingPage;
  let ownBrowser = false;

  try {
    if (!page) {
      const browser = await chromium.launch({ headless: true });
      page = await browser.newPage();
      ownBrowser = true;
    }

    await page.goto(source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for real hydrated content to render before extracting anything
    try {
      await page.waitForSelector('.prose, h3:has-text("Job descriptions"), h3:has-text("Job summary")', { timeout: 15000 });
    } catch (err) {
      console.warn(`[Detail Scraper] Timeout waiting for hydration selector on ${source_url}`);
    }

    // Small delay to ensure client JS hydration completes
    await page.waitForTimeout(1000);

    const html = await page.content();
    return parseDetailPageHtml(html);
  } catch (error) {
    console.error(`[Detail Scraper] Error fetching detail page ${source_url}:`, error);
    return getEmptyDetailPageFields();
  } finally {
    if (ownBrowser && page) {
      await page.context().browser()?.close();
    }
  }
}

function getEmptyDetailPageFields(): DetailPageFields {
  return {
    industry_tag: null,
    posted_date_jsonld: null,
    valid_through_jsonld: null,
    base_salary_jsonld: null,
    employment_type_jsonld: null,
    job_summary_text: null,
    min_qualification: null,
    experience_level: null,
    experience_length: null,
    language_requirement: null,
    working_hours: null,
    applicant_location: null,
    salary_raw: null,
    description_html: '<p>No description content retrieved.</p>',
    description_text: 'No description content retrieved.',
  };
}
