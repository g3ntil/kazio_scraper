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

export interface ClassificationResult {
  content_type: ContentType;
  is_active: boolean;
  tender_fields?: ExtractedTenderFields;
}

// 1. Keyword list for tender/procurement (case-insensitive substring match)
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

// 2. Keyword list for paid_program title signal
const PAID_PROGRAM_TITLE_KEYWORDS = [
  "training programme",
  "training program",
  "cohort",
  "capacity building",
];

// Paid program description confirmation phrases (where applicant pays money)
const PAID_PROGRAM_FEE_PHRASES = [
  "training fee",
  "participation fee",
  "tuition",
  "installment payment",
  "the comprehensive fee for",
];

/**
 * Classifies a job listing content_type running BEFORE any structured field extraction.
 */
export function classifyContent(input: ClassificationInput): ContentType {
  const title = (input.title || "").toLowerCase().trim();
  const desc = (input.description || "").toLowerCase();

  // Signal 1: Title match against tender keywords (case-insensitive substring match)
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

  // Signal 4: Fallback -> job. If conflicting or ambiguous signals -> unclear
  if (titlePaidProgramSignal && !desc.includes("salary") && !desc.includes("responsibilit")) {
    return 'unclear';
  }

  return 'job';
}

/**
 * Extracts submission_deadline, contact_emails, and procuring_organization for tender/paid_program/unclear posts.
 */
export function extractTenderMetadata(
  title: string,
  descriptionText: string,
  companyName?: string | null
): ExtractedTenderFields {
  const text = `${title} ${descriptionText || ''}`;

  // Extract Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailsFound = text.match(emailRegex) || [];
  const contact_emails = Array.from(new Set(emailsFound.map((e) => e.toLowerCase())));

  // Extract Submission Deadline
  let submission_deadline: string | null = null;
  const deadlineRegexes = [
    /(?:closing date|submission deadline|deadline|due date|received no later than|applications close|submit(?:ted)? by)[:\s]*([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]\d{4})/i,
    /(?:closing date|submission deadline|deadline|due date|received no later than|applications close|submit(?:ted)? by)[:\s]*([0-3]?\d\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
    /(?:closing date|submission deadline|deadline|due date|received no later than|applications close|submit(?:ted)? by)[:\s]*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+[0-3]?\d,?\s+\d{4})/i,
  ];

  for (const reg of deadlineRegexes) {
    const match = descriptionText.match(reg);
    if (match && match[1]) {
      submission_deadline = match[1].trim();
      break;
    }
  }

  // Procuring Organization
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
