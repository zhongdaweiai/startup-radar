const SIGNAL_TYPES = new Set(["company", "industry", "event"]);

const EVENT_RULES = [
  {
    label: "Funding",
    patterns: [
      /\braises?\b/i,
      /\braised\b/i,
      /\bfunding\b/i,
      /\bseries\s+[a-z]\b/i,
      /\bseed\b/i,
      /\bpre-seed\b/i,
      /\bround\b/i,
      /\blands?\s+\$?\d/i,
      /\bsecures?\s+\$?\d/i,
    ],
    confidence: 0.9,
  },
  {
    label: "Acquisition",
    patterns: [
      /\bacquires?\b/i,
      /\bacquired\b/i,
      /\bto\s+acquire\b/i,
      /\bbuyout\b/i,
      /\bbuys\s+[A-Z][A-Za-z0-9&.'-]*/i,
      /\bbuys\s+(?:a\s+)?(?:startup|company|rival|competitor|maker|app|platform|firm)\b/i,
      /\bsnaps?\s+up\b/i,
      /\bmerger\b/i,
      /\bmerges?\b/i,
    ],
    confidence: 0.92,
  },
  {
    label: "IPO",
    patterns: [
      /\bipo\b/i,
      /\bgo(?:es|ing)?\s+public\b/i,
      /\bfiles?\s+(?:confidentially\s+)?(?:for|to go public)\b/i,
    ],
    confidence: 0.86,
  },
  {
    label: "Product Launch",
    patterns: [
      /\blaunch(?:es|ed)?\b/i,
      /\bunveils?\b/i,
      /\bintroduces?\b/i,
      /\brolls?\s+out\b/i,
      /\bdebuts?\b/i,
      /\bcreates?\b/i,
      /\bcreated\b/i,
      /\bbuilds?\b/i,
      /\bannounces?\b/i,
    ],
    confidence: 0.78,
  },
  {
    label: "Partnership",
    patterns: [
      /\bpartners?\s+with\b/i,
      /\bteams?\s+up\b/i,
      /\bcollaborat(?:es|ion)\b/i,
    ],
    confidence: 0.78,
  },
  {
    label: "Layoffs",
    patterns: [
      /\blayoffs?\b/i,
      /\blays?\s+off\b/i,
      /\bcuts?\s+(?:jobs|staff|workforce)\b/i,
    ],
    confidence: 0.86,
  },
  {
    label: "Regulation",
    patterns: [
      /\bregulator(?:s|y)?\b/i,
      /\bantitrust\b/i,
      /\bFTC\b/,
      /\bFCC\b/,
      /\bSEC\b/,
      /\bEU\b/,
      /\bban(?:s|ned)?\b/i,
    ],
    confidence: 0.72,
  },
  {
    label: "Legal",
    patterns: [/\bsues?\b/i, /\blawsuit\b/i, /\bsettlement\b/i, /\bcourt\b/i],
    confidence: 0.78,
  },
  {
    label: "Security Incident",
    patterns: [
      /\bhack(?:ed|s)?\b/i,
      /\bbreach(?:ed|es)?\b/i,
      /\bvulnerability\b/i,
      /\bcyberattack\b/i,
      /\bleak(?:ed|s)?\b/i,
    ],
    confidence: 0.86,
  },
];

const INDUSTRY_RULES = [
  {
    label: "AI Agents",
    patterns: [/\bagents?\b/i, /\bagentic\b/i, /\bagent-on-agent\b/i],
    confidence: 0.82,
  },
  {
    label: "AI Infrastructure",
    patterns: [
      /\bAI infra(?:structure)?\b/i,
      /\binference\b/i,
      /\bGPU(?:s)?\b/i,
      /\bLLM(?:s)?\b/i,
      /\bfoundation model(?:s)?\b/i,
      /\bmodel serving\b/i,
    ],
    confidence: 0.82,
  },
  {
    label: "Database",
    patterns: [
      /\bdatabase(?:s)?\b/i,
      /\bdata warehouse\b/i,
      /\bSQL\b/,
      /\bPostgres(?:QL)?\b/i,
      /\bDuckDB\b/i,
      /\banalytics platform\b/i,
    ],
    confidence: 0.8,
  },
  {
    label: "Developer Tools",
    patterns: [
      /\bdeveloper tool(?:s)?\b/i,
      /\bdevtool(?:s)?\b/i,
      /\bAPI(?:s)?\b/,
      /\bSDK(?:s)?\b/,
      /\bopen source\b/i,
      /\bcoding\b/i,
    ],
    confidence: 0.72,
  },
  {
    label: "Fintech",
    patterns: [
      /\bfintech\b/i,
      /\bpayments?\b/i,
      /\bbanking\b/i,
      /\bcrypto\b/i,
      /\bstablecoin(?:s)?\b/i,
      /\bwallet(?:s)?\b/i,
    ],
    confidence: 0.76,
  },
  {
    label: "Cybersecurity",
    patterns: [/\bsecurity\b/i, /\bcybersecurity\b/i, /\bmalware\b/i, /\bidentity\b/i],
    confidence: 0.76,
  },
  {
    label: "Health Tech",
    patterns: [
      /\bhealth(?:care)?\b/i,
      /\bbiotech\b/i,
      /\bpharma\b/i,
      /\bmedical\b/i,
      /\bclinical\b/i,
    ],
    confidence: 0.74,
  },
  {
    label: "Robotics",
    patterns: [/\brobot(?:s|ics)?\b/i, /\bhumanoid(?:s)?\b/i, /\bautomation\b/i],
    confidence: 0.78,
  },
  {
    label: "Mobility",
    patterns: [
      /\bEV(?:s)?\b/,
      /\belectric vehicle(?:s)?\b/i,
      /\bautonomous vehicle(?:s)?\b/i,
      /\btransportation\b/i,
      /\bmobility\b/i,
    ],
    confidence: 0.74,
  },
  {
    label: "Climate Tech",
    patterns: [/\bclimate\b/i, /\bcarbon\b/i, /\benergy\b/i, /\bsolar\b/i, /\bbattery\b/i],
    confidence: 0.74,
  },
  {
    label: "Enterprise SaaS",
    patterns: [/\bSaaS\b/, /\benterprise\b/i, /\bworkflow(?:s)?\b/i, /\bCRM\b/],
    confidence: 0.68,
  },
  {
    label: "Chips",
    patterns: [/\bchip(?:s)?\b/i, /\bsemiconductor(?:s)?\b/i, /\bNvidia\b/i, /\bASIC(?:s)?\b/],
    confidence: 0.76,
  },
  {
    label: "Venture Capital",
    patterns: [
      /\bVC(?:s)?\b/,
      /\bventure capital\b/i,
      /\binvestor(?:s)?\b/i,
      /\bfund(?:s|ing)?\b/i,
    ],
    confidence: 0.62,
  },
  {
    label: "Consumer Social",
    patterns: [
      /\bsocial network(?:ing)?\b/i,
      /\bconsumer social\b/i,
      /\bcreator economy\b/i,
      /\bcommunity app\b/i,
    ],
    confidence: 0.76,
  },
];

const COMPANY_ACTION_PATTERN =
  /^(.{2,80}?)\s+(?:raises?|raised|lands?|secures?|gets|nabs?|launch(?:es|ed)?|unveils?|introduces?|rolls?\s+out|debuts?|acquires?|buys?|snaps?\s+up|merges?|partners?|teams?\s+up|sues?|cuts?|lays?\s+off|files?|announces?|announced)\b/i;

const COMPANY_OBJECT_PATTERN =
  /\b(?:acquires?|buys?|snaps?\s+up|merges?\s+with|partners?\s+with|teams?\s+up\s+with|sues?)\s+(?:(?:an|a|the)\b\s*)?(?:(?:AI|crypto|fintech|climate|database|data|robotics|software|security)\s+)?(?:(?:startup|company|firm|maker|app|platform|rival|competitor)\s+)?([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})\b/i;

const COMPANY_LEAD_PATTERNS = [
  /^([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,3}),\s+(?:an?|the)\s+[^.]{0,180}?\b(?:app|startup|company|platform|service|tool|firm|developer|maker|lab|network|marketplace|software|business)\b/i,
  /^([A-Z][A-Za-z0-9&.'’-]*(?:\s+[A-Z][A-Za-z0-9&.'’-]*){0,3})\s+(?:announced|raised|launch(?:es|ed)?|introduced|unveiled|acquired|bought)\b/i,
];

const COMPANY_STOP_WORDS = new Set([
  "A",
  "AI",
  "An",
  "And",
  "Android",
  "Apple",
  "As",
  "At",
  "Big",
  "But",
  "Can",
  "Congress",
  "EU",
  "For",
  "From",
  "Google",
  "How",
  "In",
  "Inside",
  "It",
  "Its",
  "New",
  "No",
  "On",
  "Open Source",
  "Researchers",
  "Series",
  "Startup",
  "Startups",
  "The",
  "These",
  "This",
  "To",
  "US",
  "VC",
  "What",
  "When",
  "Where",
  "Why",
  "With",
]);

const AMBIGUOUS_COMPANY_WORDS = new Set(["Series"]);

const COMPANY_PREFIX_STOP_WORDS = new Set([
  "A",
  "An",
  "And",
  "As",
  "At",
  "For",
  "From",
  "How",
  "In",
  "Inside",
  "Monitoring",
  "New",
  "On",
  "The",
  "These",
  "This",
  "To",
  "What",
  "When",
  "Where",
  "Why",
  "With",
]);

const NON_COMPANY_PHRASES = new Set([
  "Bay Area",
  "Silicon Valley",
  "TechCrunch Mobility",
  "TechCrunch Disrupt",
  "TechCrunch Startup Battlefield",
]);

const COMPANY_LIKE_TERMS =
  /\b(?:AI|Labs?|Robotics|Systems|Technologies|Software|Analytics|Health|Capital|Ventures|Fund|Cloud|Data|DB|API|Bank|Security|Networks?|Platform|Compute)\b/;

const HUMAN_GROUP_PATTERN =
  /^(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:college\s+kids|college\s+students|students|teens?|young\s+founders|founders|co-founders|engineers|researchers|scientists|workers|employees|users|creators)\b/i;

const KNOWN_COMPANIES = [
  "Anthropic",
  "OpenAI",
  "Google",
  "Microsoft",
  "Meta",
  "Amazon",
  "Apple",
  "Nvidia",
  "Tesla",
  "SpaceX",
  "xAI",
  "Databricks",
  "Snowflake",
  "MongoDB",
  "Salesforce",
  "Stripe",
  "Ramp",
  "Perplexity",
  "Mistral",
  "Hugging Face",
];

function clean(value) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function cleanArticleText(value) {
  return clean(
    value
      ?.replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#8217;|&rsquo;/gi, "'")
      .replace(/&quot;/gi, '"'),
  );
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function signal(type, label, confidence, evidence) {
  const normalizedLabel = clean(label).replace(/^["'“”‘’]+|["'“”‘’.,:;]+$/g, "");
  const slug = slugify(normalizedLabel);

  if (!SIGNAL_TYPES.has(type) || !normalizedLabel || !slug) {
    return null;
  }

  return {
    type,
    label: normalizedLabel,
    slug,
    confidence,
    evidence: clean(evidence) || null,
  };
}

function uniqueSignals(signals) {
  const byKey = new Map();

  for (const entry of signals) {
    if (!entry) {
      continue;
    }

    const key = `${entry.type}:${entry.slug}`;
    const existing = byKey.get(key);
    if (!existing || entry.confidence > existing.confidence) {
      byKey.set(key, entry);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const typeRank = { event: 0, company: 1, industry: 2 };
    const byType = typeRank[left.type] - typeRank[right.type];
    if (byType !== 0) {
      return byType;
    }

    return right.confidence - left.confidence || left.label.localeCompare(right.label);
  });
}

function normalizeCompanyCandidate(value) {
  let candidate = clean(value)
    .replace(/^["'“”‘’]+|["'“”‘’.,:;]+$/g, "")
    .replace(/\s+(?:reportedly|quietly|finally)$/i, "");

  candidate = candidate.replace(/^(?:the|a|an)\s+/i, "");
  candidate = candidate.replace(/^(?:AI|crypto|fintech|climate|robotics)\s+startup\s+/i, "");
  candidate = candidate.replace(/^startup\s+/i, "");

  return clean(candidate);
}

function isCompanyCandidate(value, options = {}) {
  const candidate = normalizeCompanyCandidate(value);
  const allowAmbiguous = Boolean(options.allowAmbiguous);

  if (!candidate || candidate.length < 2 || candidate.length > 64) {
    return false;
  }

  const isAmbiguousAllowed = allowAmbiguous && AMBIGUOUS_COMPANY_WORDS.has(candidate);
  if (
    (COMPANY_STOP_WORDS.has(candidate) && !isAmbiguousAllowed) ||
    NON_COMPANY_PHRASES.has(candidate)
  ) {
    return false;
  }

  if (/^\d/.test(candidate) || /\b(?:raises?|raised|launch(?:es|ed)?|acquires?)\b/i.test(candidate)) {
    return false;
  }

  const words = candidate.split(/\s+/);
  if (words.length > 5) {
    return false;
  }

  if (COMPANY_PREFIX_STOP_WORDS.has(words[0])) {
    return false;
  }

  if (HUMAN_GROUP_PATTERN.test(candidate) && !COMPANY_LIKE_TERMS.test(candidate)) {
    return false;
  }

  return /^[A-Z0-9]/.test(candidate);
}

function isKnownCompany(label) {
  return KNOWN_COMPANIES.some(
    (knownCompany) => knownCompany.toLowerCase() === label.toLowerCase(),
  );
}

function isLowConfidenceCompanyCandidate(value) {
  const candidate = normalizeCompanyCandidate(value);

  if (!isCompanyCandidate(candidate)) {
    return false;
  }

  if (isKnownCompany(candidate)) {
    return true;
  }

  return COMPANY_LIKE_TERMS.test(candidate);
}

function extractTrustedLeadCompanySignals(summary) {
  const signals = [];
  const normalizedSummary = cleanArticleText(summary);

  if (!normalizedSummary) {
    return signals;
  }

  for (const pattern of COMPANY_LEAD_PATTERNS) {
    const candidate = normalizeCompanyCandidate(normalizedSummary.match(pattern)?.[1]);
    if (isCompanyCandidate(candidate, { allowAmbiguous: true })) {
      signals.push(signal("company", candidate, 0.94, normalizedSummary.slice(0, 220)));
    }
  }

  return signals;
}

function extractCompanySignals(title, summary) {
  const signals = [];
  const normalizedTitle = clean(title);
  const normalizedSummary = cleanArticleText(summary);

  signals.push(...extractTrustedLeadCompanySignals(normalizedSummary));

  const direct = normalizedTitle.match(COMPANY_ACTION_PATTERN)?.[1];

  if (direct) {
    const candidate = normalizeCompanyCandidate(direct);
    if (isCompanyCandidate(candidate)) {
      signals.push(signal("company", candidate, 0.88, title));
    }
  }

  const object = normalizedTitle.match(COMPANY_OBJECT_PATTERN)?.[1];
  if (object) {
    const candidate = normalizeCompanyCandidate(object);
    if (isCompanyCandidate(candidate)) {
      signals.push(signal("company", candidate, 0.78, title));
    }
  }

  for (const knownCompany of KNOWN_COMPANIES) {
    const escaped = knownCompany.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(normalizedTitle)) {
      signals.push(signal("company", knownCompany, 0.84, title));
    }

    if (pattern.test(normalizedSummary)) {
      signals.push(signal("company", knownCompany, 0.8, normalizedSummary.slice(0, 220)));
    }
  }

  const phrasePattern =
    /\b([A-Z][A-Za-z0-9&.'-]*(?:\s+(?:[A-Z][A-Za-z0-9&.'-]*|AI|API|DB|Labs|Health|Robotics|Systems|Technologies|Software|Analytics)){0,3})\b/g;

  for (const match of normalizedTitle.matchAll(phrasePattern)) {
    const prefix = normalizedTitle.slice(0, match.index).trimEnd();
    if (prefix.endsWith(":") || prefix.endsWith("?") || prefix.endsWith("!")) {
      continue;
    }

    const candidate = normalizeCompanyCandidate(match[1]);
    if (isLowConfidenceCompanyCandidate(candidate)) {
      signals.push(signal("company", candidate, 0.62, title));
    }
  }

  return uniqueSignals(signals).filter((entry) => entry.type === "company").slice(0, 4);
}

function signalsFromRules(type, rules, haystack) {
  const signals = [];

  for (const rule of rules) {
    const matched = rule.patterns.some((pattern) => pattern.test(haystack));
    if (matched) {
      signals.push(signal(type, rule.label, rule.confidence, haystack.slice(0, 180)));
    }
  }

  return signals;
}

export function extractStorySignals({
  title,
  categories = [],
  summary,
  content,
  description,
}) {
  const normalizedTitle = clean(title);
  const categoryHaystack = categories.slice(0, 6).map(clean).filter(Boolean).join(" ");
  const normalizedSummary = cleanArticleText(summary ?? content ?? description);
  const haystack = [normalizedTitle, normalizedSummary, categoryHaystack]
    .filter(Boolean)
    .join(" ");

  if (!haystack) {
    return [];
  }

  return uniqueSignals([
    ...signalsFromRules("event", EVENT_RULES, normalizedTitle),
    ...extractCompanySignals(normalizedTitle, normalizedSummary),
    ...signalsFromRules("industry", INDUSTRY_RULES, haystack),
  ]);
}
