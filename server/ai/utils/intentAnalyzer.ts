export type IntentCategory = 
  | 'coding'
  | 'mathematics'
  | 'reasoning'
  | 'translation'
  | 'evergreen_knowledge'
  | 'current_events'
  | 'office_holder'
  | 'live_data'
  | 'explicit_search'
  | 'document_analysis'
  | 'general';

export interface IntentAnalysis {
  intentCategory: IntentCategory;
  needsWebSearch: boolean;
  freshSearchRequired: boolean;
  searchReason: string;
  cleanQuery?: string;
}

// 1. Office holder, political, institutional, and corporate leadership roles (inherently time-sensitive)
const OFFICE_HOLDER_REGEX = /\b(cm|chief minister|pm|prime minister|president|vice president|vp|governor|lieutenant governor|lt governor|deputy cm|deputy chief minister|deputy pm|deputy prime minister|cabinet minister|home minister|finance minister|defence minister|defense minister|railway minister|education minister|health minister|foreign minister|external affairs minister|aviation minister|transport minister|chief justice|cji|attorney general|solicitor general|speaker|mla|mp|member of parliament|senator|congressman|mayor|chancellor|vice chancellor|vc|ceo|chief executive officer|cto|cfo|coo|cio|cmo|cpo|chairman|chairwoman|chairperson|managing director|md|founder|director general|secretary general|commissioner|coach|head coach|captain|skipper)\b/i;

// 2. Temporal words & freshness indicators
const TEMPORAL_REGEX = /\b(current|currently|latest|today|today's|tonight|now|right now|recently|recent|this week|this month|this year|breaking|live|upcoming|newest|present|presently|as of now|at present|ongoing|just in|past few days|2025|2026|2027)\b/i;

// 3. Real-time news, political developments, elections, and dynamic events
const NEWS_EVENTS_REGEX = /\b(what happened in|what's happening in|what is happening in|news about|news in|updates on|latest on|situation in|election|elections|election results|assembly election|poll results|vote count|bypoll|who won the election|latest srm events|srm events|srmist events|upcoming srm events|events at srm|protests in|earthquake in|cyclone|flood in|summit|treaty|announcement|announcements|press release)\b/i;

// 4. Live market data, sports, weather, and real-time status
const LIVE_DATA_REGEX = /\b(weather|temperature|forecast|climate today|rain in|stock price|share price|crypto price|bitcoin price|gold rate|silver rate|petrol price|diesel price|dollar rate|exchange rate|repo rate|inflation rate|live score|ipl score|cricket score|football score|match score|who won the match|match today|game score|tournament results|medal tally|super bowl|world cup|champions league|olympics|fifa|championship|release date of|launch date of|is [a-z\s]+ (alive|dead)|did [a-z\s]+ die|net worth of)\b/i;

/**
 * Checks if a user prompt is inherently time-sensitive or asks for current information
 * (e.g. office holders, news, events, live scores, weather, market data).
 */
export function isFreshnessQuery(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase().trim();
  if (!lower) return false;

  // Direct temporal or explicit search markers
  if (TEMPORAL_REGEX.test(lower)) return true;

  // Office holders are always time-sensitive (e.g. "Who is the CM of Tamil Nadu?", "Who is the CEO of Google?")
  if (OFFICE_HOLDER_REGEX.test(lower)) return true;

  // Dynamic news, political developments, recent events
  if (NEWS_EVENTS_REGEX.test(lower)) return true;

  // Real-time market data, sports, weather
  if (LIVE_DATA_REGEX.test(lower)) return true;

  // Question patterns inquiring about state/country leadership or current status
  if (/^who (is|are|leads|heads|governs|runs)\b/i.test(lower) && !/\b(character|mythology|god|author of|wrote|invented|discovered|founded in)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Analyzes incoming user prompt and attachments to classify user intent
 * and determine whether fresh web search grounding is required.
 */
export function analyzeUserIntent(prompt: string, hasAttachments: boolean = false, forceWebSearch?: boolean): IntentAnalysis {
  if (forceWebSearch) {
    return {
      intentCategory: 'explicit_search',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'User explicitly enabled Web Search mode in interface'
    };
  }

  const text = (prompt || '').trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      intentCategory: 'general',
      needsWebSearch: false,
      freshSearchRequired: false,
      searchReason: 'Empty prompt'
    };
  }

  // Explicit web search action phrases
  if (/\b(search the web|search online|search google|web search|look up online|find online|browse the web|latest news on|current status of)\b/i.test(lower)) {
    return {
      intentCategory: 'explicit_search',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'Explicit web search action phrase detected'
    };
  }

  // Check freshness requirement FIRST before non-search exemptions
  const isTimeSensitive = isFreshnessQuery(text);

  // 1. Pure Math calculation / Logic puzzle -> NO SEARCH (unless asking for live rates/prices)
  const pureMathRegex = /^(\s*calculate|\s*solve|\s*integral|\s*derivative|\s*equation|\s*algebra|\s*calculus|\s*simplify|\s*factor|\s*gcd|\s*lcm|\s*probability|\s*matrix|\s*\d+\s*[\+\-\*\/\^]\s*\d+)/i;
  if (pureMathRegex.test(lower) && !/\b(price|cost|market|stock|rate|value of|inflation|gdp)\b/i.test(lower)) {
    return {
      intentCategory: 'mathematics',
      needsWebSearch: false,
      freshSearchRequired: false,
      searchReason: 'Pure mathematical or logical expression'
    };
  }

  // 2. Pure local code debugging / syntax help -> NO SEARCH (unless asking for new releases/updates)
  const pureCodingSyntaxRegex = /\b(fix this code|debug this|syntax error|stack trace|typeerror|undefined is not a function|null pointer|regex for|indentation error|refactor this function)\b/i;
  const releaseInfoRegex = /\b(latest|release|version|new in|2025|2026|npm|framework|api|package|library|update|changelog|docs)\b/i;
  if (pureCodingSyntaxRegex.test(lower) && !releaseInfoRegex.test(lower)) {
    return {
      intentCategory: 'coding',
      needsWebSearch: false,
      freshSearchRequired: false,
      searchReason: 'Local code debugging or syntax fix'
    };
  }

  // 3. Pure translation or text rephrasing -> NO SEARCH
  const pureTranslationRegex = /^\s*(translate|proofread|grammar check|rephrase|rewrite|paraphrase)\b/i;
  if (pureTranslationRegex.test(lower) && !isTimeSensitive) {
    return {
      intentCategory: 'translation',
      needsWebSearch: false,
      freshSearchRequired: false,
      searchReason: 'Text translation or rephrasing'
    };
  }

  // 4. Document analysis on attachments -> NO SEARCH unless time-sensitive
  if (hasAttachments && !isTimeSensitive) {
    return {
      intentCategory: 'document_analysis',
      needsWebSearch: false,
      freshSearchRequired: false,
      searchReason: 'User uploaded file attachment for analysis'
    };
  }

  // 5. Office holders (e.g. "Who is the CM of Tamil Nadu?", "Who is the CEO of Google?") -> FRESH SEARCH REQUIRED
  if (OFFICE_HOLDER_REGEX.test(lower)) {
    return {
      intentCategory: 'office_holder',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'Office holder / leadership query requires fresh verification'
    };
  }

  // 6. Real-time news, elections, events, and dynamic developments -> FRESH SEARCH REQUIRED
  if (NEWS_EVENTS_REGEX.test(lower) || TEMPORAL_REGEX.test(lower)) {
    return {
      intentCategory: 'current_events',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'Real-time temporal query or current events detected'
    };
  }

  // 7. Live data (weather, sports, market, prices) -> FRESH SEARCH REQUIRED
  if (LIVE_DATA_REGEX.test(lower)) {
    return {
      intentCategory: 'live_data',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'Live data or real-time metric requested'
    };
  }

  // 8. General fallback query
  if (isTimeSensitive) {
    return {
      intentCategory: 'current_events',
      needsWebSearch: true,
      freshSearchRequired: true,
      searchReason: 'Time-sensitive inquiry requires live web verification'
    };
  }

  // 9. Default for evergreen topics, general knowledge, conceptual explanations: FAST DIRECT MODEL GENERATION
  return {
    intentCategory: 'general',
    needsWebSearch: false,
    freshSearchRequired: false,
    searchReason: 'Standard conceptual knowledge query suitable for direct model parametric generation'
  };
}


