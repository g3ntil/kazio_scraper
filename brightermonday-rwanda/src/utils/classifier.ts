export type ContentType = 'job' | 'tender' | 'paid_program' | 'unclear';

export interface ClassificationInput {
  title: string;
  description?: string | null;
  category?: string | null;
  work_type?: string | null;
  salary_raw?: string | null;
  company?: string | null;
}

export interface ExtractedTenderFields {
  submission_deadline: string | null;
  contact_emails: string[];
  procuring_organization: string | null;
}

const TENDER_KEYWORDS = [
  "terms of reference",
  "tender",
  "itangazo",
  "rfp",
  "request for proposal",
  "request for expression of interest",
  "eoi",
  "call for application",
  "request for quotation",
  "procurement of",
  "provision of",
  "supply of",
  "supply, installation",
  "gupiganira",
  "isoko",
  "gutanga isoko",
];

const PAID_PROGRAM_TITLE_KEYWORDS = [
  "training programme",
  "training program",
  "cohort",
  "capacity building",
];

const PAID_PROGRAM_FEE_PHRASES = [
  "training fee",
  "participation fee",
  "tuition",
  "installment payment",
  "the comprehensive fee for",
];

export function classifyContent(input: ClassificationInput): ContentType {
  const title = (input.title || "").toLowerCase().trim();
  const desc = (input.description || "").toLowerCase();

  // Signal 1: Title match against tender keywords
  for (const keyword of TENDER_KEYWORDS) {
    if (title.includes(keyword)) {
      return 'tender';
    }
  }

  // Signal 2: Title match against paid program keywords + description fee confirmation
  let titlePaidProgramSignal = false;
  for (const keyword of PAID_PROGRAM_TITLE_KEYWORDS) {
    if (title.includes(keyword)) {
      titlePaidProgramSignal = true;
      break;
    }
  }

  if (titlePaidProgramSignal) {
    for (const phrase of PAID_PROGRAM_FEE_PHRASES) {
      if (desc.includes(phrase)) {
        return 'paid_program';
      }
    }
  }

  // Signal 3: Secondary confirming signal if category, work_type, salary_raw are all null together
  const allRawNull = !input.category && !input.work_type && !input.salary_raw;
  if (allRawNull && titlePaidProgramSignal) {
    return 'paid_program';
  }

  // Signal 4: Fallback -> job or unclear
  if (titlePaidProgramSignal && !desc.includes("salary") && !desc.includes("responsibilit")) {
    return 'unclear';
  }

  return 'job';
}

export function formatDateToYYYYMMDD(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/i, '$1').replace(/\s+/g, ' ').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return null;
}

export function extractTenderMetadata(
  title: string,
  descriptionText: string,
  companyName?: string | null
): ExtractedTenderFields {
  const text = `${title} ${descriptionText || ''}`;

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailsFound = text.match(emailRegex) || [];
  const contact_emails = Array.from(new Set(emailsFound.map((e) => e.toLowerCase())));

  let rawDeadline: string | null = null;
  const deadlinePrefix = `(?:closing date|submission deadline|deadline(?:\\s+for\\s+submission\\s+(?:of\\s+(?:bids|proposals|tenders|applications))?)?|due date|received no later than|applications close|submit(?:ted)? by|itariki ntarengwa|clôture des offres)[:\\s]*(?:is|on|before|by|the)?(?:\\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?)?\\s*`;
  
  const deadlineRegexes = [
    new RegExp(`${deadlinePrefix}([0-3]?\\d[\\/\\-\\.\\s][0-1]?\\d[\\/\\-\\.\\s]\\d{4})`, 'i'),
    new RegExp(`${deadlinePrefix}([0-3]?\\d(?:st|nd|rd|th)?\\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\\s+\\d{4})`, 'i'),
    new RegExp(`${deadlinePrefix}((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+[0-3]?\\d(?:st|nd|rd|th)?,?\\s+\\d{4})`, 'i'),
  ];

  for (const reg of deadlineRegexes) {
    const match = descriptionText.match(reg);
    if (match && match[1]) {
      rawDeadline = match[1].trim();
      break;
    }
  }

  const submission_deadline = formatDateToYYYYMMDD(rawDeadline);

  let procuring_organization: string | null = companyName && companyName !== 'Company Name' && companyName !== 'Unknown'
    ? companyName.trim()
    : null;

  if (!procuring_organization) {
    const orgMatch = title.match(/(?:by|for|from|to)\s+([A-Z0-9\s\.\-]{3,40})(?:\s+for|\s+under|\s+project|$)/i);
    if (orgMatch && orgMatch[1]) {
      procuring_organization = orgMatch[1].trim();
    }
  }

  return {
    submission_deadline,
    contact_emails,
    procuring_organization,
  };
}
