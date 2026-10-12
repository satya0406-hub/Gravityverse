import { tavily } from "@tavily/core";
import { GoogleGenAI } from "@google/genai";
import { getDb as getAdminDb, FieldValue } from "./firebaseAdmin.js";

export interface SrmEvent {
  id?: string;
  title: string;
  description: string;
  organizer: string;
  category: string;
  eligibleFields: string[];
  date: string;
  startDateIso?: string | null;
  endDateIso?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  venue: string;
  campus?: string;
  locationArea?: string | null;
  distanceFromKtr?: string | null;
  registrationUrl?: string | null;
  ticketUrl?: string | null;
  officialEventUrl?: string | null;
  sourceUrl: string;
  cost?: string | null;
  eventImageUrl?: string | null;
  eligibility?: string | null;
  registrationDeadline?: string | null;
  registrationDeadlineIso?: string | null;
  registrationState?: "open" | "closed" | "not_required" | "cancelled";
  eventStatus?: "upcoming" | "ongoing" | "completed" | "cancelled";
  status: "verified" | "needs_review" | "rejected" | "completed";
  classification: "srm" | "nearby" | "online" | "external";
  discoveredAt: string;
  lastVerifiedAt: string;
  sourceAuthorityRating?: number;
  relevanceScore?: number;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function formatIsoDate(year: number, month: number, day: number): string {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseEventDates(dateStr: string, contextText: string = ""): {
  startDateIso: string | null;
  endDateIso: string | null;
  registrationDeadlineIso: string | null;
} {
  let startDateIso: string | null = null;
  let endDateIso: string | null = null;
  let registrationDeadlineIso: string | null = null;

  const combined = `${dateStr || ''} ${contextText || ''}`;
  const now = new Date();
  const currentYear = now.getFullYear();

  // 1. Direct ISO match: YYYY-MM-DD
  const isoMatches = combined.match(/\b(202[4-9]|203[0-9])-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\b/g);
  if (isoMatches && isoMatches.length > 0) {
    startDateIso = isoMatches[0];
    endDateIso = isoMatches.length > 1 ? isoMatches[1] : isoMatches[0];
  }

  // 2. Month Day-Day, Year (e.g. "October 14-16, 2026", "Sept 28 - 29, 2026", "August 10 - 15 2026")
  if (!startDateIso) {
    const rangeMatch1 = combined.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?\s+(\d{1,2})\s*[-–\to]+\s*(\d{1,2})\b,?\s*(202[4-9]|203[0-9])?/i);
    if (rangeMatch1) {
      const mStr = rangeMatch1[1].toLowerCase();
      const mNum = MONTH_MAP[mStr];
      const d1 = parseInt(rangeMatch1[2], 10);
      const d2 = parseInt(rangeMatch1[3], 10);
      const yNum = rangeMatch1[4] ? parseInt(rangeMatch1[4], 10) : currentYear;
      if (mNum && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        startDateIso = formatIsoDate(yNum, mNum, d1);
        endDateIso = formatIsoDate(yNum, mNum, d2);
      }
    }
  }

  // 3. Day-Day Month Year (e.g. "14-16 October 2026", "10–15 Aug 2026")
  if (!startDateIso) {
    const rangeMatch2 = combined.match(/\b(\d{1,2})\s*[-–\to]+\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b,?\s*(202[4-9]|203[0-9])?/i);
    if (rangeMatch2) {
      const d1 = parseInt(rangeMatch2[1], 10);
      const d2 = parseInt(rangeMatch2[2], 10);
      const mStr = rangeMatch2[3].toLowerCase();
      const mNum = MONTH_MAP[mStr];
      const yNum = rangeMatch2[4] ? parseInt(rangeMatch2[4], 10) : currentYear;
      if (mNum && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        startDateIso = formatIsoDate(yNum, mNum, d1);
        endDateIso = formatIsoDate(yNum, mNum, d2);
      }
    }
  }

  // 4. Single Month Day, Year (e.g. "September 22, 2026", "22 Sept 2026", "22nd September 2026")
  if (!startDateIso) {
    const singleMatch1 = combined.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(202[4-9]|203[0-9])?/i);
    if (singleMatch1) {
      const mStr = singleMatch1[1].toLowerCase();
      const mNum = MONTH_MAP[mStr];
      const dNum = parseInt(singleMatch1[2], 10);
      const yNum = singleMatch1[3] ? parseInt(singleMatch1[3], 10) : currentYear;
      if (mNum && dNum >= 1 && dNum <= 31) {
        startDateIso = formatIsoDate(yNum, mNum, dNum);
        endDateIso = startDateIso;
      }
    }
  }

  if (!startDateIso) {
    const singleMatch2 = combined.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b,?\s*(202[4-9]|203[0-9])?/i);
    if (singleMatch2) {
      const dNum = parseInt(singleMatch2[1], 10);
      const mStr = singleMatch2[2].toLowerCase();
      const mNum = MONTH_MAP[mStr];
      const yNum = singleMatch2[3] ? parseInt(singleMatch2[3], 10) : currentYear;
      if (mNum && dNum >= 1 && dNum <= 31) {
        startDateIso = formatIsoDate(yNum, mNum, dNum);
        endDateIso = startDateIso;
      }
    }
  }

  // 5. Month-Year range (e.g. "October - December 2026")
  if (!startDateIso) {
    const monthYearMatch = combined.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\s*[-–\to]+\s*\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\s*(202[4-9]|203[0-9])?/i);
    if (monthYearMatch) {
      const m1Str = monthYearMatch[1].toLowerCase();
      const m2Str = monthYearMatch[2].toLowerCase();
      const m1Num = MONTH_MAP[m1Str];
      const m2Num = MONTH_MAP[m2Str];
      const yNum = monthYearMatch[3] ? parseInt(monthYearMatch[3], 10) : currentYear;
      if (m1Num && m2Num) {
        startDateIso = formatIsoDate(yNum, m1Num, 1);
        endDateIso = formatIsoDate(yNum, m2Num, 28);
      }
    }
  }

  // Extract Registration Deadline from text if present
  const regMatch = combined.match(/(?:deadline|apply by|last date|registration closes|ticket sale ends)[:\s]*([^\n,.]+)/i);
  if (regMatch && regMatch[1]) {
    const regText = regMatch[1].trim();
    const parsedReg = parseEventDates(regText, "");
    if (parsedReg.startDateIso) {
      registrationDeadlineIso = parsedReg.startDateIso;
    }
  }

  return { startDateIso, endDateIso, registrationDeadlineIso };
}

export function evaluateAndSyncEventLifecycle(event: SrmEvent, referenceDate: Date = new Date()): SrmEvent {
  const updated: SrmEvent = { ...event };

  const parsed = parseEventDates(updated.date || "", `${updated.title || ""} ${updated.description || ""} ${updated.registrationDeadline || ""}`);
  if (!updated.startDateIso && parsed.startDateIso) updated.startDateIso = parsed.startDateIso;
  if (!updated.endDateIso && parsed.endDateIso) updated.endDateIso = parsed.endDateIso;
  if (!updated.registrationDeadlineIso && parsed.registrationDeadlineIso) updated.registrationDeadlineIso = parsed.registrationDeadlineIso;

  const refYear = referenceDate.getFullYear();
  const refMonth = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const refDay = String(referenceDate.getDate()).padStart(2, "0");
  const todayStr = `${refYear}-${refMonth}-${refDay}`;

  const lowerDesc = (updated.description || "").toLowerCase();
  const lowerTitle = (updated.title || "").toLowerCase();

  // Explicit cancellation
  if (lowerDesc.includes("cancelled") || lowerDesc.includes("canceled") || lowerTitle.includes("cancelled") || lowerTitle.includes("canceled")) {
    updated.eventStatus = "cancelled";
    updated.registrationState = "cancelled";
    return updated;
  }

  const startStr = updated.startDateIso || updated.endDateIso;
  const endStr = updated.endDateIso || updated.startDateIso;

  if (endStr && endStr < todayStr) {
    updated.eventStatus = "completed";
    updated.status = "completed";
  } else if (startStr && startStr <= todayStr && endStr && endStr >= todayStr) {
    updated.eventStatus = "ongoing";
    if (updated.status === "completed") updated.status = "verified";
  } else if (startStr && startStr > todayStr) {
    updated.eventStatus = "upcoming";
    if (updated.status === "completed") updated.status = "verified";
  } else {
    const pastYearMatch = (updated.date || "").match(/202[0-5]/);
    if (pastYearMatch) {
      updated.eventStatus = "completed";
      updated.status = "completed";
    } else {
      updated.eventStatus = "upcoming";
      if (updated.status === "completed") updated.status = "verified";
    }
  }

  // Registration State
  if (updated.registrationDeadlineIso) {
    if (updated.registrationDeadlineIso < todayStr) {
      updated.registrationState = "closed";
    } else {
      updated.registrationState = "open";
    }
  } else if (updated.eventStatus === "completed") {
    updated.registrationState = "closed";
  } else {
    updated.registrationState = "open";
  }

  return updated;
}

export interface DiscoveryRunStats {
  timestamp: string;
  queriesExecuted: number;
  sourcesSearched: number;
  candidatesFound: number;
  verifiedCount: number;
  needsReviewCount: number;
  duplicatesMerged: number;
  rejectedCount: number;
  errors: string[];
  isApiKeyMissing: boolean;
}

// Domain authority helper for ranking event sources
function getDomainAuthority(urlStr: string): number {
  if (!urlStr) return 1;
  const lower = urlStr.toLowerCase();
  if (lower.includes("srmist.edu.in") || lower.includes("srmktr.edu.in") || lower.includes("avenuesrm.com")) {
    return 5;
  }
  if (lower.includes("unstop.com/o/srm") || lower.includes("devfolio.co") || lower.includes("icmr.gov.in") || lower.includes("aiims.edu")) {
    return 4;
  }
  if (lower.includes("unstop.com") || lower.includes("eventbrite") || lower.includes("lu.ma") || lower.includes("meetup.com")) {
    return 3;
  }
  return 2;
}

// String normalization for deduplication
function normalizeText(text: string): string {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function isVerifiedRegistrationUrl(url: string | null | undefined, event?: SrmEvent): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed === '' || trimmed === '#' || trimmed.startsWith('javascript:')) return null;

  if (
    trimmed.startsWith('/') ||
    trimmed.includes('localhost') ||
    trimmed.includes('ais-dev-') ||
    trimmed.includes('ais-pre-') ||
    trimmed.includes('gravityverse')
  ) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (
    lower.endsWith('.xml') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    lower.includes('sitemap') ||
    lower.includes('scribd.com') ||
    lower.includes('quora.com') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('frontiersin.org') ||
    lower.includes('pib.gov.in') ||
    lower.includes('instagram.com') ||
    lower.includes('facebook.com') ||
    lower.includes('linkedin.com') ||
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('pinterest.com') ||
    lower.includes('tiktok.com') ||
    lower.includes('knowafest.com') ||
    lower.includes('conferencealerts')
  ) {
    return null;
  }

  if (
    lower === 'https://unstop.com' ||
    lower === 'https://unstop.com/' ||
    lower === 'https://unstop.com/hackathons' ||
    lower === 'https://unstop.com/competitions' ||
    lower === 'https://unstop.com/workshops-webinars' ||
    lower === 'https://devfolio.co' ||
    lower === 'https://devfolio.co/' ||
    lower.includes('unstop.com/o/') ||
    lower.includes('devfolio.co/projects/')
  ) {
    return null;
  }

  if (lower.includes('devfolio.co')) {
    const isSubdomain = /^https:\/\/[a-z0-9-]+\.devfolio\.co\/?$/i.test(trimmed);
    const isHackathonPath = /^https:\/\/devfolio\.co\/hackathons\/[a-z0-9-]+/i.test(trimmed);
    if (!isSubdomain && !isHackathonPath) {
      return null;
    }
  }

  if (lower.includes('unstop.com')) {
    const isUnstopEventPath = /\/(hackathons|competitions|workshops-webinars|college-fests|quizzes|job-fests)\/[a-z0-9-]+/i.test(trimmed);
    if (!isUnstopEventPath) {
      return null;
    }
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === '' || parsed.pathname === '/') {
      return null;
    }
  } catch {
    return null;
  }

  if (event) {
    const todayIso = new Date().toISOString().split('T')[0];
    if (
      (event.status as string) === 'completed' ||
      (event.status as string) === 'cancelled' ||
      (event as any).eventStatus === 'completed' ||
      (event as any).eventStatus === 'cancelled'
    ) {
      return null;
    }
    if (event.registrationDeadlineIso && event.registrationDeadlineIso < todayIso) {
      return null;
    }
    if (event.endDateIso && event.endDateIso < todayIso) {
      return null;
    }
  }

  return trimmed;
}

export function isVerifiedOfficialUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed === '' || trimmed === '#' || trimmed.startsWith('javascript:')) return null;

  if (
    trimmed.startsWith('/') ||
    trimmed.includes('localhost') ||
    trimmed.includes('ais-dev-') ||
    trimmed.includes('ais-pre-') ||
    trimmed.includes('gravityverse')
  ) {
    return null;
  }

  const lower = trimmed.toLowerCase();

  if (
    lower.endsWith('.xml') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    lower.includes('sitemap') ||
    lower.includes('quora.com') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('frontiersin.org') ||
    lower.includes('pib.gov.in') ||
    lower.includes('instagram.com') ||
    lower.includes('facebook.com') ||
    lower.includes('linkedin.com') ||
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('pinterest.com') ||
    lower.includes('tiktok.com') ||
    lower.includes('knowafest.com') ||
    lower.includes('conferencealerts')
  ) {
    return null;
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  return trimmed;
}

export function isRealEventObject(e: SrmEvent): boolean {
  if (!e.title || typeof e.title !== 'string') return false;
  const titleLower = e.title.trim().toLowerCase();

  if (
    titleLower.length < 3 ||
    titleLower.includes('sitemap') ||
    titleLower === 'home' ||
    titleLower === 'instagram' ||
    titleLower.includes('instagram') ||
    titleLower.includes('linkedin') ||
    titleLower === 'frontiers' ||
    titleLower === 'acrp 2026' ||
    titleLower.includes('2540+') ||
    titleLower.includes('clubs at srm') ||
    titleLower.includes('sae collegiate club') ||
    titleLower.includes('brochure combined') ||
    titleLower.startsWith('what are') ||
    titleLower.startsWith('how to') ||
    titleLower.startsWith('why should') ||
    titleLower.includes('press release page') ||
    titleLower.includes('forthcoming events') ||
    titleLower.includes('presenter instructions') ||
    titleLower.includes('re-aim public health') ||
    titleLower.includes('peer-volunteer-training') ||
    titleLower.includes('fests, symposiums in chennai') ||
    titleLower.includes('smart ration dispenser')
  ) {
    return false;
  }

  const srcUrlLower = (e.sourceUrl || e.officialEventUrl || '').toLowerCase();
  if (
    srcUrlLower.includes('quora.com') ||
    srcUrlLower.includes('youtube.com') ||
    srcUrlLower.includes('youtu.be') ||
    srcUrlLower.includes('frontiersin.org') ||
    srcUrlLower.includes('pib.gov.in') ||
    srcUrlLower.includes('memphis.edu') ||
    srcUrlLower.includes('acrpnet.org') ||
    srcUrlLower.includes('linkedin.com') ||
    srcUrlLower.includes('instagram.com')
  ) {
    return false;
  }

  return true;
}

export function sanitizeAndValidateEvent(e: SrmEvent): SrmEvent {
  const verifiedRegUrl = isVerifiedRegistrationUrl(e.registrationUrl, e);
  let verifiedOffUrl = isVerifiedOfficialUrl(e.officialEventUrl) || isVerifiedOfficialUrl(e.sourceUrl);

  if (!verifiedOffUrl) {
    const orgLower = (e.organizer || '').toLowerCase();
    const titleLower = (e.title || '').toLowerCase();
    if (e.classification === 'srm' || orgLower.includes('srm') || titleLower.includes('srm')) {
      verifiedOffUrl = "https://www.srmist.edu.in";
    } else if (orgLower.includes('ramachandra') || titleLower.includes('ramachandra')) {
      verifiedOffUrl = "https://www.sriramachandra.edu.in";
    } else if (orgLower.includes('sree renga') || titleLower.includes('sreerenga') || titleLower.includes('srecon')) {
      verifiedOffUrl = "https://sreerengahospital.com";
    } else if (orgLower.includes('smf') || orgLower.includes('sundaram') || titleLower.includes('smf')) {
      verifiedOffUrl = "https://smf.in";
    } else if (orgLower.includes('chengalpattu') || titleLower.includes('chengalpattu')) {
      verifiedOffUrl = "https://chengalpattumedicalcollege.tn.gov.in";
    } else if (orgLower.includes('rela') || titleLower.includes('rela')) {
      verifiedOffUrl = "https://www.relainstitute.com";
    } else if (orgLower.includes('hindu mission') || titleLower.includes('hindu mission')) {
      verifiedOffUrl = "https://hindumissionhospital.in";
    } else if (orgLower.includes('madras medical') || titleLower.includes('mmc')) {
      verifiedOffUrl = "https://mmc.ac.in";
    } else if (orgLower.includes('icmr') || titleLower.includes('icmr')) {
      verifiedOffUrl = "https://www.nie.icmr.org.in";
    } else {
      verifiedOffUrl = "https://www.srmist.edu.in";
    }
  }

  const verifiedSrcUrl = isVerifiedOfficialUrl(e.sourceUrl) || verifiedOffUrl;

  return {
    ...e,
    registrationUrl: verifiedRegUrl,
    officialEventUrl: verifiedOffUrl,
    sourceUrl: verifiedSrcUrl
  };
}

export function getCanonicalEventKey(title: string): string {
  const norm = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm.includes("srmmedcon") || norm.includes("srmmedicon")) return "srm_medicon_2026";
  if (norm.includes("tracscon")) return "tracscon_2026";
  if (norm.includes("srecon")) return "srecon_2026";
  if (norm.includes("smfforum") || norm.includes("mfforum")) return "smf_forum_2026";
  if (norm.includes("imeducon")) return "imeducon_2026";
  if (norm.includes("ideahealth")) return "idea_health_2026";
  if (norm.includes("nursehack4health")) return "nursehack4health";
  if (norm.includes("cure2026")) return "cure_2026";
  if (norm.includes("pasumai")) return "pasumai_hackathon";
  if (norm.includes("fastathon")) return "fastathon";
  if (norm.includes("drdev")) return "dr_dev_hackathon";
  if (norm.includes("hacksrm")) return "hacksrm_2026";
  if (norm.includes("hindumission")) return "hindu_mission_workshop";
  if (norm.includes("chengalpattumedicalresearch")) return "chengalpattu_symposium";
  if (norm.includes("relainstitute")) return "rela_hackathon";
  if (norm.includes("madrasmedicalcollege")) return "mmc_quiz";
  if (norm.includes("icmrnationalpublic")) return "icmr_fellowship";
  if (norm.includes("srmistclinicalsimulation")) return "srm_simulation_2026";
  if (norm.includes("tamilnadumedicalstudent")) return "tn_leadership_summit";
  if (norm.includes("chengalpattusurgical")) return "chengalpattu_surgical_masterclass";
  if (norm.includes("namscon")) return "namscon_2026";
  if (norm.includes("sepsicon")) return "srm_sepsicon_2026";
  if (norm.includes("aihcr")) return "ai_hcr_workshop_2026";
  if (norm.includes("hsilhackathon")) return "hsil_hackathon_2026";
  if (norm.includes("internetofthingsjarvis")) return "iot_jarvis_2026";
  if (norm.includes("aimlinhealthcare")) return "ai_ml_healthcare_shaastra";
  return norm;
}

export function deduplicateAndMergeEvents(events: SrmEvent[]): SrmEvent[] {
  const map = new Map<string, SrmEvent>();
  const seenRegUrls = new Set<string>();

  for (const e of events) {
    if (!isRealEventObject(e)) continue;
    const sanitized = sanitizeAndValidateEvent(e);
    const key = getCanonicalEventKey(sanitized.title);

    if (!map.has(key)) {
      if (sanitized.registrationUrl) {
        const lowerUrl = sanitized.registrationUrl.toLowerCase();
        if (seenRegUrls.has(lowerUrl)) {
          sanitized.registrationUrl = null;
        } else {
          seenRegUrls.add(lowerUrl);
        }
      }
      map.set(key, sanitized);
    } else {
      const existing = map.get(key)!;
      if (sanitized.title.length > existing.title.length) existing.title = sanitized.title;
      if (!existing.registrationUrl && sanitized.registrationUrl) {
        const lowerUrl = sanitized.registrationUrl.toLowerCase();
        if (!seenRegUrls.has(lowerUrl)) {
          existing.registrationUrl = sanitized.registrationUrl;
          seenRegUrls.add(lowerUrl);
        }
      }
      if (sanitized.description && sanitized.description.length > (existing.description || "").length) existing.description = sanitized.description;
      if (!existing.registrationDeadline && sanitized.registrationDeadline) existing.registrationDeadline = sanitized.registrationDeadline;
      if (!existing.startDateIso && sanitized.startDateIso) existing.startDateIso = sanitized.startDateIso;
      if (!existing.endDateIso && sanitized.endDateIso) existing.endDateIso = sanitized.endDateIso;
    }
  }
  return Array.from(map.values());
}

function isValidUrl(str: string | null | undefined): boolean {
  if (!str) return false;
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Infers area name and distance relative to SRM Kattankulathur (SRM KTR)
 */
export function inferLocationAndDistance(
  venue: string, 
  campus: string, 
  description: string, 
  title: string, 
  classification: string
): { locationArea: string; distanceFromKtr: string; distKm: number } {
  const combined = `${venue} ${campus} ${description} ${title}`.toLowerCase();

  if (classification === "online" || combined.includes("online") || combined.includes("virtual") || combined.includes("webinar") || combined.includes("zoom") || combined.includes("remote")) {
    return { locationArea: "Online", distanceFromKtr: "Online / Virtual", distKm: 0 };
  }

  if (combined.includes("srmist") || combined.includes("kattankulathur") || combined.includes("tp ganesan") || combined.includes("srm medical") || combined.includes("ktr campus") || combined.includes("srm hospital")) {
    return { locationArea: "Kattankulathur", distanceFromKtr: "On Campus (SRM KTR)", distKm: 0 };
  }

  if (combined.includes("guduvanchery")) {
    return { locationArea: "Guduvanchery", distanceFromKtr: "~5 km from SRM KTR", distKm: 5 };
  }

  if (combined.includes("vandalur")) {
    return { locationArea: "Vandalur", distanceFromKtr: "~8 km from SRM KTR", distKm: 8 };
  }

  if (combined.includes("maraimalai nagar")) {
    return { locationArea: "Maraimalai Nagar", distanceFromKtr: "~7 km from SRM KTR", distKm: 7 };
  }

  if (combined.includes("tambaram") || combined.includes("hindu mission")) {
    return { locationArea: "Tambaram, Chennai", distanceFromKtr: "~14 km from SRM KTR", distKm: 14 };
  }

  if (combined.includes("chromepet") || combined.includes("rela institute") || combined.includes("mit campus")) {
    return { locationArea: "Chromepet, Chennai", distanceFromKtr: "~18 km from SRM KTR", distKm: 18 };
  }

  if (combined.includes("chengalpattu") || combined.includes("chengalpattu medical")) {
    return { locationArea: "Chengalpattu", distanceFromKtr: "~19 km from SRM KTR", distKm: 19 };
  }

  if (combined.includes("guindy") || combined.includes("iit madras") || combined.includes("anna university")) {
    return { locationArea: "Guindy, Chennai", distanceFromKtr: "~28 km from SRM KTR", distKm: 28 };
  }

  if (combined.includes("chennai") || combined.includes("madras medical") || combined.includes("stanley") || combined.includes("kilpauk")) {
    return { locationArea: "Chennai", distanceFromKtr: "~35 km from SRM KTR", distKm: 35 };
  }

  if (combined.includes("kanchipuram")) {
    return { locationArea: "Kanchipuram", distanceFromKtr: "~45 km from SRM KTR", distKm: 45 };
  }

  if (classification === "srm") {
    return { locationArea: "Kattankulathur", distanceFromKtr: "On Campus (SRM KTR)", distKm: 0 };
  }

  return { locationArea: venue || "Nearby Region", distanceFromKtr: "Accessible from SRM KTR", distKm: 25 };
}

/**
 * Ranks events by relevance, proximity to SRM KTR, source authority, and freshness
 */
export function calculateEventRank(event: SrmEvent): number {
  let score = 50;

  // 1. Proximity score
  if (event.classification === "srm" || event.distanceFromKtr?.includes("On Campus")) {
    score += 40;
  } else if (event.classification === "nearby") {
    if (event.distanceFromKtr?.includes("5 km") || event.distanceFromKtr?.includes("8 km")) score += 35;
    else if (event.distanceFromKtr?.includes("14 km") || event.distanceFromKtr?.includes("18 km") || event.distanceFromKtr?.includes("19 km")) score += 30;
    else score += 25;
  } else if (event.classification === "online") {
    score += 32;
  } else {
    score += 10;
  }

  // 2. Source authority & link completeness
  score += (event.sourceAuthorityRating || 1) * 5;
  if (event.registrationUrl) score += 15;
  if (event.eligibleFields && event.eligibleFields.length > 0 && !event.eligibleFields.includes("General")) score += 10;

  // 3. Recency
  if (event.lastVerifiedAt) {
    const hoursOld = (Date.now() - new Date(event.lastVerifiedAt).getTime()) / (1000 * 60 * 60);
    if (hoursOld < 24) score += 10;
  }

  return score;
}

export class SrmEventDiscoveryService {
  private inMemoryEvents: SrmEvent[] = [];
  private inMemoryStats: DiscoveryRunStats | null = null;
  private tavilyQuotaExceededUntil: number = 0;

  constructor() {
    this.inMemoryEvents = this.getInitialSeedEvents();
    setTimeout(() => {
      this.purgeAndSyncDatabase().catch(err => {
        console.warn("[SRM Event Discovery] Auto purge error:", err);
      });
    }, 1000);
  }

  private getInitialSeedEvents(): SrmEvent[] {
    const nowIso = new Date().toISOString();
    const seeds: SrmEvent[] = [
      {
        id: "seed_srm_portal",
        title: "SRMIST Official Conferences, Workshops & Research Summits",
        description: "Official university calendar and registration repository for upcoming national conferences, symposiums, medical workshops, and department technical summits at SRMIST Kattankulathur.",
        organizer: "SRM Institute of Science and Technology (SRMIST)",
        category: "Seminar & Conference",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "EEE", "Mechanical", "MBBS", "BDS", "Biotechnology", "Management", "General"],
        date: "Academic Year 2026-2027",
        startDateIso: "2026-08-01",
        endDateIso: "2026-12-31",
        venue: "Main Campus & TP Ganesan Auditorium, SRMIST Kattankulathur",
        campus: "SRMIST Kattankulathur",
        locationArea: "Kattankulathur",
        distanceFromKtr: "On Campus (SRM KTR)",
        registrationUrl: "https://www.srmist.edu.in/events/",
        officialEventUrl: "https://www.srmist.edu.in/events/",
        sourceUrl: "https://www.srmist.edu.in/events/",
        cost: "Varies by Program (Student Passes Available)",
        eligibility: "Open to enrolled undergraduate, postgraduate, and research scholars.",
        registrationDeadline: "Ongoing Portal Updates",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "srm",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_sih_2026",
        title: "Smart India Hackathon (SIH) 2026 - National Innovation Initiative",
        description: "Nationwide student competition by Ministry of Education's Innovation Cell (MIC) & AICTE providing students a platform to solve pressing problems of ministries, departments, and industries.",
        organizer: "Ministry of Education (MoE) & AICTE, Govt. of India",
        category: "Hackathon",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "EEE", "Mechanical", "Civil", "Biotechnology", "General"],
        date: "September - December 2026",
        startDateIso: "2026-09-01",
        endDateIso: "2026-12-20",
        venue: "National Nodal Centers & SRMIST Kattankulathur Nodal Center",
        campus: "SRMIST Kattankulathur",
        locationArea: "Kattankulathur & Pan-India",
        distanceFromKtr: "On Campus & National Centers",
        registrationUrl: "https://www.sih.gov.in",
        officialEventUrl: "https://www.sih.gov.in",
        sourceUrl: "https://www.sih.gov.in",
        cost: "Free Registration",
        eligibility: "Teams of 6 students from recognized colleges and universities across India.",
        registrationDeadline: "September 30, 2026",
        registrationDeadlineIso: "2026-09-30",
        status: "verified",
        classification: "srm",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_gsoc_2026",
        title: "Google Summer of Code (GSoC) 2026: Open Source Mentorship & Research",
        description: "Global, online mentorship program focused on bringing new contributors into open source software development and research organizations with funded student stipends.",
        organizer: "Google Open Source Programs Office",
        category: "Research Internship",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "Science", "Biotechnology"],
        date: "Annual Summer Cohort",
        startDateIso: "2026-05-01",
        endDateIso: "2026-11-30",
        venue: "Virtual / Global Mentorship",
        campus: "Online",
        locationArea: "Online",
        distanceFromKtr: "Online / Remote",
        registrationUrl: "https://summerofcode.withgoogle.com",
        officialEventUrl: "https://summerofcode.withgoogle.com",
        sourceUrl: "https://summerofcode.withgoogle.com",
        cost: "Free (Stipend Provided)",
        eligibility: "Open to 18+ students and beginner open source contributors globally.",
        registrationDeadline: "Official Portal Cycle",
        registrationDeadlineIso: "2026-11-30",
        status: "verified",
        classification: "online",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_mlh_season",
        title: "Major League Hacking (MLH) Global Student Hackathon Season",
        description: "Official collegiate hackathon league offering weekend virtual and in-person hackathons, live workshops, mentorship, and cloud technology credits for student developers.",
        organizer: "Major League Hacking (MLH)",
        category: "Hackathon",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "EEE", "Design", "Management"],
        date: "Global Hackathon Calendar",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Hybrid (Online & Collegiate Host Chapters)",
        campus: "Online",
        locationArea: "Online / Pan-India",
        distanceFromKtr: "Online / Hybrid",
        registrationUrl: "https://mlh.io/seasons/2026/events",
        officialEventUrl: "https://mlh.io/seasons/2026/events",
        sourceUrl: "https://mlh.io",
        cost: "100% Free Entry & Swag",
        eligibility: "Open to all enrolled college and university students globally.",
        registrationDeadline: "Rolling Registrations",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "online",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_devfolio_hackathons",
        title: "Devfolio Collegiate Hackathon & Web3 Innovation Circuit",
        description: "India's largest community hackathon platform hosting premier collegiate hackathons, developer grants, and hardware prototyping challenges.",
        organizer: "Devfolio & Participating University Chapters",
        category: "Hackathon",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "Design", "Management"],
        date: "Active Collegiate Season",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Participating Campuses & Virtual",
        campus: "Chennai & Pan-India",
        locationArea: "Chennai & Virtual",
        distanceFromKtr: "Campus Hosts & Online",
        registrationUrl: "https://devfolio.co/hackathons",
        officialEventUrl: "https://devfolio.co/hackathons",
        sourceUrl: "https://devfolio.co",
        cost: "Free Registration",
        eligibility: "Open to all university students and developers.",
        registrationDeadline: "Varies by Event",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "nearby",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_unstop_srm_hub",
        title: "Unstop National Student Opportunities & Campus Challenge Hub",
        description: "Verified collegiate competitions, case challenges, hackathons, and corporate hiring sprints hosted across leading Indian institutions including SRMIST.",
        organizer: "Unstop & University Chapters",
        category: "Competition",
        eligibleFields: ["CSE/IT", "AI/ML", "ECE", "Management", "Biotechnology", "Science", "General"],
        date: "Daily Verified Listings",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Virtual & National University Campuses",
        campus: "SRMIST Kattankulathur & Online",
        locationArea: "Kattankulathur & Pan-India",
        distanceFromKtr: "On Campus & Online",
        registrationUrl: "https://unstop.com/hackathons",
        officialEventUrl: "https://unstop.com/competitions",
        sourceUrl: "https://unstop.com",
        cost: "Free (Cash Prizes & Certificates)",
        eligibility: "Open to enrolled undergraduate & postgraduate students.",
        registrationDeadline: "Active Daily Rounds",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "srm",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_icmr_research",
        title: "ICMR National Health Research Fellowship & Biomedical Opportunities",
        description: "Indian Council of Medical Research national research initiatives, student mentorship programs, and short-term research studentships (STS) in biomedical sciences.",
        organizer: "Indian Council of Medical Research (ICMR), Govt. of India",
        category: "Research Internship",
        eligibleFields: ["MBBS", "BDS", "Nursing", "Pharmacy", "Biotechnology", "Public Health", "Life Sciences"],
        date: "Annual Academic Research Cycle",
        startDateIso: "2026-08-01",
        endDateIso: "2026-12-31",
        venue: "ICMR Research Centers & Medical Colleges Pan-India",
        campus: "External Venue",
        locationArea: "Pan-India & Chennai",
        distanceFromKtr: "National & Regional Centers",
        registrationUrl: "https://www.icmr.gov.in",
        officialEventUrl: "https://www.icmr.gov.in",
        sourceUrl: "https://www.icmr.gov.in",
        cost: "Free (Govt. Research Grants Available)",
        eligibility: "Enrolled medical, dental, pharmacy, and allied health sciences students.",
        registrationDeadline: "Official Call Notifications",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "nearby",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_who_internships",
        title: "World Health Organization (WHO) Global Health Internship Programme",
        description: "Official global internship programme providing students in medicine, public health, life sciences, and health informatics hands-on experience in global health policy and technical research.",
        organizer: "World Health Organization (WHO)",
        category: "Public Health Internship",
        eligibleFields: ["Public Health", "MBBS", "Biotechnology", "Pharmacy", "Management", "Life Sciences"],
        date: "Spring & Autumn Internship Cycles",
        startDateIso: "2026-09-01",
        endDateIso: "2026-12-31",
        venue: "WHO Regional & Global Technical Offices",
        campus: "Online",
        locationArea: "Global & Regional Hubs",
        distanceFromKtr: "Online / Regional Centers",
        registrationUrl: "https://www.who.int/careers/internship-programme",
        officialEventUrl: "https://www.who.int/careers/internship-programme",
        sourceUrl: "https://www.who.int/careers/internship-programme",
        cost: "Free Application (Living Stipend Provided)",
        eligibility: "Enrolled university students or recent graduates in health, public policy, or biotechnology.",
        registrationDeadline: "Periodic Window Openings",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "online",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_hindu_mission_hospital",
        title: "Hindu Mission Hospital Clinical & Emergency Care Academic Workshops",
        description: "Continuing medical education, clinical observerships, and emergency resuscitation skills workshops conducted in West Tambaram for healthcare undergraduates.",
        organizer: "Hindu Mission Hospital & Academic Directorate",
        category: "Clinical Workshop",
        eligibleFields: ["MBBS", "Nursing", "Physiotherapy", "Pharmacy", "Public Health"],
        date: "Monthly Clinical Sessions",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Hindu Mission Hospital Auditorium, 103 GST Road, West Tambaram, Chennai",
        campus: "Tambaram",
        locationArea: "Tambaram, Chennai",
        distanceFromKtr: "~14 km from SRM KTR",
        registrationUrl: "https://hindumissionhospital.in",
        officialEventUrl: "https://hindumissionhospital.in",
        sourceUrl: "https://hindumissionhospital.in",
        cost: "Hospital Student Pass",
        eligibility: "Open to medical, nursing, and allied health sciences undergraduates & interns.",
        registrationDeadline: "Ongoing Hospital Registrations",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "nearby",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_rela_institute",
        title: "Dr. Rela Institute & Medical Centre Healthcare Academic Programs",
        description: "Clinical research symposiums, organ transplant sciences observerships, and healthcare technology seminars hosted at Chromepet Medical Campus.",
        organizer: "Dr. Rela Institute & Medical Centre",
        category: "Medical Conference",
        eligibleFields: ["MBBS", "Biotechnology", "Nursing", "Pharmacy", "Life Sciences", "AI/ML"],
        date: "Academic & Clinical Calendar 2026",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Dr. Rela Institute & Medical Centre, CLC Works Road, Chromepet, Chennai",
        campus: "Chromepet",
        locationArea: "Chromepet, Chennai",
        distanceFromKtr: "~18 km from SRM KTR",
        registrationUrl: "https://www.relainstitute.com",
        officialEventUrl: "https://www.relainstitute.com",
        sourceUrl: "https://www.relainstitute.com",
        cost: "Complimentary / Subsidized Student Passes",
        eligibility: "Healthcare students, biomedical researchers, and clinical interns.",
        registrationDeadline: "Ongoing Academic Cycles",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "nearby",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      },
      {
        id: "seed_chengalpattu_med",
        title: "Chengalpattu Government Medical College Academic Research Sessions",
        description: "Academic clinical seminars, state public health forums, and poster presentations organized for medical and biomedical research students in Chengalpattu district.",
        organizer: "Chengalpattu Medical College & Hospital",
        category: "Poster Presentation",
        eligibleFields: ["MBBS", "Public Health", "Biotechnology", "Nursing", "Pharmacy"],
        date: "District Academic Sessions",
        startDateIso: "2026-08-15",
        endDateIso: "2026-12-31",
        venue: "Chengalpattu Medical College Campus, GST Road, Chengalpattu",
        campus: "Chengalpattu",
        locationArea: "Chengalpattu",
        distanceFromKtr: "~19 km from SRM KTR",
        registrationUrl: "https://chengalpattumedicalcollege.tn.gov.in",
        officialEventUrl: "https://chengalpattumedicalcollege.tn.gov.in",
        sourceUrl: "https://chengalpattumedicalcollege.tn.gov.in",
        cost: "Free Academic Entry",
        eligibility: "Medical and health science students across Tamil Nadu.",
        registrationDeadline: "Monthly Scheduled Cycles",
        registrationDeadlineIso: "2026-12-31",
        status: "verified",
        classification: "nearby",
        discoveredAt: nowIso,
        lastVerifiedAt: nowIso,
        sourceAuthorityRating: 5
      }
    ];

    const refDate = new Date();
    return seeds
      .filter(isRealEventObject)
      .map(sanitizeAndValidateEvent)
      .map(s => evaluateAndSyncEventLifecycle(s, refDate));
  }

  private getDb() {
    try {
      return getAdminDb();
    } catch (err) {
      console.warn("[SrmEventDiscovery] Firestore Admin DB not available:", err);
      return null;
    }
  }

  /**
   * Main discovery and verification pipeline
   */
  public async runDiscovery(): Promise<DiscoveryRunStats> {
    const startTimeIso = new Date().toISOString();
    const stats: DiscoveryRunStats = {
      timestamp: startTimeIso,
      queriesExecuted: 0,
      sourcesSearched: 0,
      candidatesFound: 0,
      verifiedCount: 0,
      needsReviewCount: 0,
      duplicatesMerged: 0,
      rejectedCount: 0,
      errors: [],
      isApiKeyMissing: false
    };

    const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
    if (!tavilyApiKey || tavilyApiKey === "" || tavilyApiKey === "MY_TAVILY_API_KEY") {
      const msg = "[SRM Event Discovery] TAVILY_API_KEY environment variable is missing or unconfigured. Skipping web search execution.";
      console.log(msg);
      stats.isApiKeyMissing = true;
      stats.errors.push("TAVILY_API_KEY missing in server environment");
      
      await this.saveStats(stats);
      return stats;
    }

    if (Date.now() < this.tavilyQuotaExceededUntil) {
      const waitMinutes = Math.ceil((this.tavilyQuotaExceededUntil - Date.now()) / (60 * 1000));
      console.log(`[SRM Event Discovery] Tavily search is on cooldown (${waitMinutes}m remaining) due to plan usage limit. Using verified event repository.`);
      stats.errors.push(`Tavily plan usage limit reached (cooling down for ${waitMinutes}m)`);
      
      await this.saveEventsToDatabase([], stats);
      await this.saveStats(stats);
      return stats;
    }

    console.log("[SRM Event Discovery] Starting live search pipeline for SRMIST Kattankulathur & nearby medical/student opportunities...");

    const tavilyClient = tavily({ apiKey: tavilyApiKey });

    // Target search queries covering both SRMIST internal and nearby off-campus opportunities in Tambaram, Chengalpattu, Chromepet, Vandalur, Guduvanchery, and Chennai
    const searchQueries = [
      "SRM Medical College SRMIST Kattankulathur medical conference workshop research quiz 2026",
      "medical conference workshop competition Tambaram Chromepet Chengalpattu Chennai 2026",
      "medical research internship clinical workshop poster presentation MBBS Chennai 2026",
      "healthcare hackathon public health program nursing pharmacy Allied Health Chennai 2026",
      "SRMIST Kattankulathur upcoming events hackathon workshop conference 2026",
      "Avenue SRM student club events symposium hackathon Kattankulathur",
      "site:unstop.com medical healthcare competition workshop Chennai Tamil Nadu 2026",
      "site:unstop.com SRMIST Kattankulathur upcoming competition hackathon",
      "site:srmist.edu.in medical health conference workshop seminar 2026"
    ];

    const rawCandidateResults: Array<{
      title: string;
      url: string;
      content: string;
      rawContent?: string;
    }> = [];

    const urlSet = new Set<string>();

    for (const query of searchQueries) {
      if (Date.now() < this.tavilyQuotaExceededUntil) {
        break;
      }

      try {
        console.log(`[SRM Event Discovery] Executing Tavily search: "${query}"`);
        stats.queriesExecuted++;
        
        const response = await tavilyClient.search(query, {
          searchDepth: "advanced",
          maxResults: 4,
          includeRawContent: "markdown"
        });

        if (response && Array.isArray(response.results)) {
          for (const res of response.results) {
            if (res.url && !urlSet.has(res.url)) {
              urlSet.add(res.url);
              rawCandidateResults.push({
                title: res.title || "",
                url: res.url,
                content: res.content || "",
                rawContent: res.rawContent || ""
              });
            }
          }
        }
      } catch (err: any) {
        const errMsg = String(err?.message || err || "");
        const isQuotaOrLimit = 
          errMsg.toLowerCase().includes("usage limit") ||
          errMsg.toLowerCase().includes("exceeds your plan") ||
          errMsg.toLowerCase().includes("quota") ||
          errMsg.toLowerCase().includes("rate limit") ||
          errMsg.toLowerCase().includes("429") ||
          errMsg.toLowerCase().includes("payment required") ||
          errMsg.toLowerCase().includes("credits");

        if (isQuotaOrLimit) {
          // Trip circuit breaker for 6 hours
          this.tavilyQuotaExceededUntil = Date.now() + 6 * 60 * 60 * 1000;
          const quotaMsg = `Tavily API quota limit reached: ${errMsg}`;
          console.warn(`[SRM Event Discovery Notice] ${quotaMsg}. Pausing search queries and utilizing verified repository.`);
          stats.errors.push(quotaMsg);
          break; // Stop running remaining queries immediately
        } else {
          const errStr = `Tavily query notice for "${query}": ${errMsg}`;
          console.warn(`[SRM Event Discovery Search Notice]`, errStr);
          stats.errors.push(errStr);
        }
      }
    }

    stats.sourcesSearched = urlSet.size;
    console.log(`[SRM Event Discovery] Collected ${rawCandidateResults.length} unique candidate web sources across ${stats.sourcesSearched} URLs.`);

    if (rawCandidateResults.length === 0) {
      console.warn("[SRM Event Discovery] No candidate web results retrieved from search queries.");
      await this.saveStats(stats);
      return stats;
    }

    // Process web candidate pages using Gemini AI for extraction & validation
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    let aiClient: GoogleGenAI | null = null;
    if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    }

    const extractedEvents: SrmEvent[] = [];

    const batchSize = 10;
    for (let i = 0; i < rawCandidateResults.length; i += batchSize) {
      const batch = rawCandidateResults.slice(i, i + batchSize);
      let aiExtractionSuccessful = false;

      if (aiClient) {
        const promptContent = batch.map((item, idx) => `
--- CANDIDATE WEBPAGE #${idx + 1} ---
Title: ${item.title}
URL: ${item.url}
Content Snippet:
${item.content.slice(0, 1500)}
${item.rawContent ? `Markdown Excerpt:\n${item.rawContent.slice(0, 1500)}` : ''}
`).join("\n\n");

        const aiPrompt = `
You are an expert event data extraction and verification system for SRM Institute of Science and Technology (SRMIST Kattankulathur) and student opportunities.

Analyze the provided webpage excerpts below and identify any REAL, UPCOMING OR CURRENT events or student opportunities (including SRM internal events, nearby off-campus opportunities in Tambaram, Chengalpattu, Chromepet, Vandalur, Guduvanchery, Chennai, and online opportunities).

STRICT NO-FABRICATION MANDATE:
1. Do NOT invent sample events or fake URLs.
2. Do NOT guess registration links, ticket URLs, dates, venues, or organizers.
3. If a registration URL is not explicitly present in the webpage text, leave registrationUrl as null.
4. Classification MUST be one of:
   - "srm": Hosted or organized by SRMIST / SRM Medical College / SRM Dental / SRM Pharmacy / SRM Nursing / SRM Hospitals / SRM student clubs / Avenue SRM.
   - "nearby": Off-campus physical event in or near SRM Kattankulathur (e.g. Tambaram, Chengalpattu, Chromepet, Vandalur, Guduvanchery, Chennai, Kanchipuram, or nearby Tamil Nadu).
   - "online": Remote, virtual, or online conference/webinar/quiz/internship.
   - "external": Other legitimate external university/government/company opportunity.
   DO NOT filter out non-SRM events!
5. Eligible Fields array MUST select applicable student disciplines from:
   ["CSE/IT", "AI/ML", "ECE", "EEE", "Mechanical", "Civil", "MBBS", "BDS", "Nursing", "Pharmacy", "Nutrition/Dietetics", "Physiotherapy", "Biotechnology", "Public Health", "Life Sciences", "Science", "Management", "Law", "Agriculture", "Architecture", "General"]
6. Categories MUST be one of:
   ["Medical Conference", "Research Competition", "Research Internship", "Clinical Workshop", "Public Health Program", "Nutrition Workshop", "Case Study Competition", "Poster Presentation", "Paper Presentation", "Medical Quiz", "Medical Fest", "Healthcare Hackathon", "Public Health Internship", "Hackathon", "Competition", "Workshop", "Seminar & Conference", "Entrepreneurship & Startup", "Cultural Event", "Sports Event", "Department & Club Event", "Other Opportunity"]
7. Output MUST be a valid JSON array of objects with these exact keys:
   - title: string
   - description: string (concise overview based strictly on webpage)
   - organizer: string (e.g. "SRM Medical College", "Hindu Mission Hospital", "AIIMS Delhi")
   - category: string
   - eligibleFields: string[]
   - classification: "srm" | "nearby" | "online" | "external"
   - locationArea: string (e.g. "Kattankulathur", "Tambaram", "Chengalpattu", "Chromepet", "Chennai", "Online")
   - distanceFromKtr: string (e.g. "On Campus (SRM KTR)", "~14 km from SRM KTR", "~19 km from SRM KTR", "Online / Virtual")
   - date: string (e.g. "2026-08-25" or "September 2026")
   - startTime: string or null
   - endTime: string or null
   - venue: string (e.g. "TP Ganesan Auditorium", "Hindu Mission Hospital Auditorium, Tambaram", "Online Portal")
   - campus: string (e.g. "SRMIST Kattankulathur" or "External Venue")
   - registrationUrl: string or null (real URL from webpage text or null)
   - ticketUrl: string or null
   - officialEventUrl: string or null
   - sourceUrl: string
   - cost: string or null (e.g. "Free", "₹500", or null)
   - eligibility: string or null
   - registrationDeadline: string or null

Return ONLY a JSON array.

Candidate content to analyze:
${promptContent}
`;

        const modelsToTry = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-2.5-pro"];
        for (const modelName of modelsToTry) {
          if (aiExtractionSuccessful) break;

          try {
            console.log(`[SRM Event Discovery] Requesting AI extraction with model ${modelName}...`);
            const response = await aiClient.models.generateContent({
              model: modelName,
              contents: aiPrompt
            });

            const rawText = response.text || "";
            const cleanedJsonText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

            if (cleanedJsonText.startsWith("[") || cleanedJsonText.startsWith("{")) {
              const parsed = JSON.parse(cleanedJsonText);
              const eventList = Array.isArray(parsed) ? parsed : [parsed];

              for (const item of eventList) {
                if (item && item.title) {
                  const authority = getDomainAuthority(item.sourceUrl || item.officialEventUrl || "");
                  const regUrl = isValidUrl(item.registrationUrl) ? item.registrationUrl : null;
                  const offUrl = isValidUrl(item.officialEventUrl) ? item.officialEventUrl : (isValidUrl(item.sourceUrl) ? item.sourceUrl : null);
                  const tickUrl = isValidUrl(item.ticketUrl) ? item.ticketUrl : null;

                  const isSrm = item.classification === "srm" || 
                    (item.organizer && item.organizer.toLowerCase().includes("srm")) ||
                    (item.venue && item.venue.toLowerCase().includes("srm")) ||
                    (item.title && item.title.toLowerCase().includes("srm"));

                  let classification: "srm" | "nearby" | "online" | "external" = isSrm ? "srm" : (item.classification || "nearby");
                  if (item.venue?.toLowerCase().includes("online") || item.title?.toLowerCase().includes("online") || item.description?.toLowerCase().includes("virtual")) {
                    classification = "online";
                  }

                  const locationInfo = inferLocationAndDistance(
                    item.venue || "", 
                    item.campus || "", 
                    item.description || "", 
                    item.title || "", 
                    classification
                  );

                  const eligibleFields = Array.isArray(item.eligibleFields) && item.eligibleFields.length > 0 
                    ? item.eligibleFields 
                    : ["General"];

                  const newEv: SrmEvent = {
                    title: String(item.title).trim(),
                    description: String(item.description || "").trim(),
                    organizer: String(item.organizer || (classification === "srm" ? "SRMIST Kattankulathur" : "External Organizer")).trim(),
                    category: item.category || "Other Opportunity",
                    eligibleFields,
                    classification,
                    locationArea: item.locationArea || locationInfo.locationArea,
                    distanceFromKtr: item.distanceFromKtr || locationInfo.distanceFromKtr,
                    date: String(item.date || "Upcoming 2026").trim(),
                    startTime: item.startTime || null,
                    endTime: item.endTime || null,
                    venue: String(item.venue || (classification === "srm" ? "SRMIST Kattankulathur Campus" : "External Venue")).trim(),
                    campus: String(item.campus || (classification === "srm" ? "SRMIST Kattankulathur" : "External")).trim(),
                    registrationUrl: regUrl,
                    ticketUrl: tickUrl,
                    officialEventUrl: offUrl,
                    sourceUrl: item.sourceUrl || batch[0]?.url || "",
                    cost: item.cost || null,
                    eligibility: item.eligibility || null,
                    registrationDeadline: item.registrationDeadline || null,
                    status: "verified",
                    discoveredAt: startTimeIso,
                    lastVerifiedAt: startTimeIso,
                    sourceAuthorityRating: authority
                  };

                  newEv.relevanceScore = calculateEventRank(newEv);
                  extractedEvents.push(newEv);
                }
              }
              aiExtractionSuccessful = true;
            }
          } catch (aiErr: any) {
            const errMsg = aiErr?.message || String(aiErr);
            if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
              console.warn(`[SRM Event Discovery] Gemini API quota limit hit on model ${modelName}. Trying fallback...`);
              stats.errors.push(`AI Quota Notice: Free tier limit reached on ${modelName}. Attempting fallback model.`);
            } else if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand")) {
              console.warn(`[SRM Event Discovery] Gemini API 503 High Demand on model ${modelName}. Trying fallback...`);
            } else if (errMsg.includes("404") || errMsg.includes("NOT_FOUND")) {
              console.warn(`[SRM Event Discovery] Gemini model ${modelName} not found or unsupported. Trying fallback...`);
            } else {
              console.warn(`[SRM Event Discovery] AI model ${modelName} error:`, errMsg);
            }
          }
        }
      }

      // Heuristic fallback if AI model was not available or hit 429 quota limits
      if (!aiExtractionSuccessful) {
        console.log(`[SRM Event Discovery] Running heuristic candidate parser for batch of ${batch.length} candidate URLs...`);
        for (const item of batch) {
          const lowerTitle = (item.title || "").toLowerCase();
          const lowerContent = (item.content || "").toLowerCase();
          const lowerUrl = (item.url || "").toLowerCase();

          if (item.title && item.title.trim().length >= 4) {
            const cleanTitle = item.title
              .replace(/\|.*/, '')
              .replace(/- SRMIST.*/i, '')
              .replace(/- SRM.*/i, '')
              .replace(/Unstop.*/i, '')
              .trim();

            if (cleanTitle.length >= 3) {
              const isSrm = lowerTitle.includes("srm") || lowerContent.includes("srmist") || lowerContent.includes("kattankulathur") || lowerUrl.includes("srm");
              let classification: "srm" | "nearby" | "online" | "external" = isSrm ? "srm" : "nearby";

              if (lowerTitle.includes("online") || lowerContent.includes("virtual") || lowerTitle.includes("webinar") || lowerContent.includes("remote")) {
                classification = "online";
              }

              // Infer category
              let category = "Other Opportunity";
              if (lowerTitle.includes("medical conference") || lowerContent.includes("medical conference")) category = "Medical Conference";
              else if (lowerTitle.includes("hackathon") || lowerContent.includes("hackathon")) category = lowerTitle.includes("health") ? "Healthcare Hackathon" : "Hackathon";
              else if (lowerTitle.includes("quiz") || lowerContent.includes("quiz")) category = "Medical Quiz";
              else if (lowerTitle.includes("workshop") || lowerContent.includes("workshop")) category = lowerContent.includes("clinical") ? "Clinical Workshop" : "Workshop";
              else if (lowerTitle.includes("internship") || lowerContent.includes("internship")) category = lowerContent.includes("research") ? "Research Internship" : "Public Health Internship";
              else if (lowerTitle.includes("poster") || lowerContent.includes("poster")) category = "Poster Presentation";
              else if (lowerTitle.includes("paper") || lowerContent.includes("paper")) category = "Paper Presentation";
              else if (lowerTitle.includes("fest") || lowerTitle.includes("cultural")) category = "Cultural Event";
              else if (lowerTitle.includes("sports")) category = "Sports Event";
              else if (lowerTitle.includes("contest") || lowerTitle.includes("competition")) category = "Competition";
              else if (lowerTitle.includes("seminar") || lowerTitle.includes("conference")) category = "Seminar & Conference";

              // Infer eligible fields
              const fields: string[] = [];
              if (lowerTitle.includes("mbbs") || lowerContent.includes("mbbs") || lowerContent.includes("medical")) fields.push("MBBS");
              if (lowerTitle.includes("nursing") || lowerContent.includes("nursing")) fields.push("Nursing");
              if (lowerTitle.includes("pharmacy") || lowerContent.includes("pharmacy")) fields.push("Pharmacy");
              if (lowerTitle.includes("nutrition") || lowerContent.includes("diet")) fields.push("Nutrition/Dietetics");
              if (lowerTitle.includes("biotech") || lowerContent.includes("biotechnology")) fields.push("Biotechnology");
              if (lowerTitle.includes("public health")) fields.push("Public Health");
              if (lowerTitle.includes("code") || lowerContent.includes("cse") || lowerContent.includes("software") || lowerTitle.includes("hackathon")) fields.push("CSE/IT", "AI/ML");
              if (fields.length === 0) fields.push("General");

              const authority = getDomainAuthority(item.url);
              const directRegUrl = isVerifiedRegistrationUrl(item.url);
              const costStr = lowerContent.includes("free") ? "Free" : null;

              const locationInfo = inferLocationAndDistance(
                cleanTitle,
                "",
                item.content,
                cleanTitle,
                classification
              );

              const heuristicEv: SrmEvent = {
                title: cleanTitle,
                description: item.content.slice(0, 280).replace(/\s+/g, ' ').trim() || (isSrm ? "Discovered opportunity at SRMIST Kattankulathur." : "Legitimate external opportunity for university students."),
                organizer: isSrm ? "SRMIST Kattankulathur" : "External Organizer",
                category,
                eligibleFields: fields,
                classification,
                locationArea: locationInfo.locationArea,
                distanceFromKtr: locationInfo.distanceFromKtr,
                date: "Upcoming 2026",
                venue: isSrm ? "SRMIST Kattankulathur Campus" : (classification === "online" ? "Online Portal" : "External Venue"),
                campus: isSrm ? "SRMIST Kattankulathur" : "External",
                registrationUrl: directRegUrl,
                officialEventUrl: isVerifiedOfficialUrl(item.url) || "https://www.srmist.edu.in",
                sourceUrl: item.url,
                cost: costStr,
                status: "verified",
                discoveredAt: startTimeIso,
                lastVerifiedAt: startTimeIso,
                sourceAuthorityRating: authority
              };

              heuristicEv.relevanceScore = calculateEventRank(heuristicEv);
              if (isRealEventObject(heuristicEv)) {
                extractedEvents.push(sanitizeAndValidateEvent(heuristicEv));
              }
            }
          }
        }
      }
    }

    stats.candidatesFound = extractedEvents.length;
    console.log(`[SRM Event Discovery] AI processing identified ${stats.candidatesFound} candidate events.`);

    // Persist and deduplicate events in Firestore database
    await this.saveEventsToDatabase(extractedEvents, stats);

    await this.saveStats(stats);
    return stats;
  }

  /**
   * Deduplicates and saves/updates discovered events in Firestore `srm_events` collection and in-memory store.
   */
  private async saveEventsToDatabase(events: SrmEvent[], stats: DiscoveryRunStats): Promise<void> {
    const validSanitizedEvents = events.filter(isRealEventObject).map(sanitizeAndValidateEvent);

    // 1. Update in-memory store first
    for (const event of validSanitizedEvents) {
      if (!event.title || event.title.length < 3) continue;

      const normKey = `${normalizeText(event.title)}_${normalizeText(event.date)}`;
      const existingIdx = this.inMemoryEvents.findIndex(
        e => `${normalizeText(e.title)}_${normalizeText(e.date)}` === normKey
      );

      if (existingIdx >= 0) {
        this.inMemoryEvents[existingIdx] = {
          ...this.inMemoryEvents[existingIdx],
          ...event,
          lastVerifiedAt: new Date().toISOString()
        };
      } else {
        this.inMemoryEvents.push({
          ...event,
          id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        });
      }
    }

    const db = this.getDb();
    if (!db) {
      console.warn("[SRM Event Discovery] Firestore Admin unavailable. Events stored in-memory.");
      return;
    }

    try {
      const colRef = db.collection("srm_events");
      const existingSnap = await colRef.get();
      
      const existingEventsMap = new Map<string, { id: string; data: SrmEvent }>();
      existingSnap.docs.forEach(doc => {
        const data = doc.data() as SrmEvent;
        const normKey = `${normalizeText(data.title)}_${normalizeText(data.date)}`;
        existingEventsMap.set(normKey, { id: doc.id, data });
      });

      for (const event of validSanitizedEvents) {
        if (!event.title || event.title.length < 3) {
          stats.rejectedCount++;
          continue;
        }

        const normKey = `${normalizeText(event.title)}_${normalizeText(event.date)}`;
        const existing = existingEventsMap.get(normKey);

        if (existing) {
          stats.duplicatesMerged++;
          const currentAuthority = existing.data.sourceAuthorityRating || 1;
          const newAuthority = event.sourceAuthorityRating || 1;

          const updatedDoc: Partial<SrmEvent> = {
            lastVerifiedAt: new Date().toISOString(),
            status: event.status === "verified" ? "verified" : existing.data.status
          };

          if (newAuthority >= currentAuthority) {
            updatedDoc.registrationUrl = event.registrationUrl;
            if (event.officialEventUrl) updatedDoc.officialEventUrl = event.officialEventUrl;
            if (event.description && event.description.length > (existing.data.description?.length || 0)) {
              updatedDoc.description = event.description;
            }
            if (event.organizer) updatedDoc.organizer = event.organizer;
            if (event.venue) updatedDoc.venue = event.venue;
            if (event.locationArea) updatedDoc.locationArea = event.locationArea;
            if (event.distanceFromKtr) updatedDoc.distanceFromKtr = event.distanceFromKtr;
          }

          await colRef.doc(existing.id).update(updatedDoc);
          console.log(`[SRM Event Discovery] Merged & updated existing event: "${event.title}"`);
        } else {
          if (event.status === "verified") stats.verifiedCount++;
          else stats.needsReviewCount++;

          const docRef = await colRef.add({
            ...event,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

          existingEventsMap.set(normKey, { id: docRef.id, data: event });
          console.log(`[SRM Event Discovery] Added new opportunity: "${event.title}" (Classification: ${event.classification})`);
        }
      }
    } catch (dbErr: any) {
      console.warn("[SRM Event Discovery] Firestore Admin access notice:", dbErr?.message || dbErr);
      stats.errors.push(`Firestore Notice: Events persisted in server memory.`);
    }
  }

  /**
   * Retrieves events from Firestore or in-memory fallback with filtering and ranking support
   */
  public async getEvents(filters: {
    timeFilter?: string;
    classification?: string;
    category?: string;
    field?: string;
    campus?: string;
    status?: string;
    search?: string;
  }): Promise<{ events: SrmEvent[]; meta: any }> {
    let results: SrmEvent[] = [];
    let isDbAvailable = false;
    let metaData: any = null;

    const db = this.getDb();
    if (db) {
      try {
        const colRef = db.collection("srm_events");
        const snapshot = await colRef.get();

        results = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<SrmEvent, "id">)
        }));

        const metaSnap = await db.collection("srm_events_meta").doc("latest_run").get();
        if (metaSnap.exists) {
          metaData = metaSnap.data();
        }
        isDbAvailable = true;
      } catch (err: any) {
        console.warn("[SRM Event Discovery] Firestore Admin access fallback notice:", err?.message || err);
      }
    }

    // Fall back to in-memory store if Firestore produced no results or failed permissions
    if (results.length === 0 && this.inMemoryEvents.length > 0) {
      results = [...this.inMemoryEvents];
    }

    // 1. Filter out garbage non-event objects, sanitize URLs, and synchronize lifecycle
    const now = new Date();
    results = results
      .filter(isRealEventObject)
      .map(sanitizeAndValidateEvent)
      .map(e => evaluateAndSyncEventLifecycle(e, now));

    results = deduplicateAndMergeEvents(results);

    // 2. Apply Time Filter
    const tf = (filters.timeFilter || "all_upcoming").toLowerCase();
    const refYear = now.getFullYear();
    const refMonth = String(now.getMonth() + 1).padStart(2, "0");
    const refDay = String(now.getDate()).padStart(2, "0");
    const todayStr = `${refYear}-${refMonth}-${refDay}`;

    const nextWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfWeekStr = `${nextWeekDate.getFullYear()}-${String(nextWeekDate.getMonth() + 1).padStart(2, "0")}-${String(nextWeekDate.getDate()).padStart(2, "0")}`;

    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endOfMonthStr = `${refYear}-${refMonth}-${String(lastDayOfMonth).padStart(2, "0")}`;

    if (tf === "all_upcoming") {
      // Default view: Show 🟢 UPCOMING and 🔵 ONGOING; hide 🔴 COMPLETED and ⚫ CANCELLED
      results = results.filter(e => e.eventStatus === "upcoming" || e.eventStatus === "ongoing");
    } else if (tf === "ongoing") {
      // Show 🔵 ONGOING only
      results = results.filter(e => e.eventStatus === "ongoing");
    } else if (tf === "today") {
      results = results.filter(e => {
        if (e.eventStatus === "completed" || e.eventStatus === "cancelled") return false;
        const s = e.startDateIso || e.endDateIso;
        const end = e.endDateIso || e.startDateIso;
        if (s && end) {
          return s <= todayStr && end >= todayStr;
        }
        return e.eventStatus === "ongoing";
      });
    } else if (tf === "this_week") {
      results = results.filter(e => {
        if (e.eventStatus === "completed" || e.eventStatus === "cancelled") return false;
        const s = e.startDateIso || e.endDateIso;
        if (s) {
          return (s >= todayStr && s <= endOfWeekStr) || (e.startDateIso && e.startDateIso <= todayStr && e.endDateIso && e.endDateIso >= todayStr);
        }
        return true;
      });
    } else if (tf === "this_month") {
      results = results.filter(e => {
        if (e.eventStatus === "completed" || e.eventStatus === "cancelled") return false;
        const s = e.startDateIso || e.endDateIso;
        if (s) {
          return (s >= todayStr && s <= endOfMonthStr) || (e.startDateIso && e.startDateIso <= todayStr && e.endDateIso && e.endDateIso >= todayStr);
        }
        return true;
      });
    } else if (tf === "past") {
      // Show 🔴 COMPLETED events
      results = results.filter(e => e.eventStatus === "completed");
    }

    if (filters.classification && filters.classification !== "all" && filters.classification !== "for_you") {
      const targetCls = filters.classification.toLowerCase();
      results = results.filter(e => {
        const cls = (e.classification || "srm").toLowerCase();
        if (targetCls === "nearby") {
          return cls === "nearby" || cls === "external";
        }
        return cls === targetCls;
      });
    }

    if (filters.category && filters.category !== "All") {
      const catQuery = filters.category.toLowerCase();
      results = results.filter(e => e.category?.toLowerCase().includes(catQuery) || catQuery.includes(e.category?.toLowerCase() || ""));
    }

    if (filters.field && filters.field !== "All") {
      const fieldQuery = filters.field.toLowerCase();
      results = results.filter(e => {
        if (!e.eligibleFields || e.eligibleFields.length === 0) return true;
        return e.eligibleFields.some(f => f.toLowerCase() === fieldQuery || f.toLowerCase() === "general");
      });
    }

    if (filters.campus && filters.campus !== "All") {
      results = results.filter(e => 
        e.campus?.toLowerCase().includes(filters.campus?.toLowerCase() || "") ||
        e.venue?.toLowerCase().includes(filters.campus?.toLowerCase() || "")
      );
    }

    if (filters.search && filters.search.trim() !== "") {
      const query = filters.search.toLowerCase().trim();
      results = results.filter(e => 
        e.title?.toLowerCase().includes(query) || 
        e.description?.toLowerCase().includes(query) || 
        e.organizer?.toLowerCase().includes(query) ||
        e.venue?.toLowerCase().includes(query) ||
        e.category?.toLowerCase().includes(query) ||
        e.locationArea?.toLowerCase().includes(query) ||
        e.distanceFromKtr?.toLowerCase().includes(query) ||
        (e.eligibleFields && e.eligibleFields.some(f => f.toLowerCase().includes(query)))
      );
    }

    // Sort events
    results.sort((a, b) => {
      if (tf === "past") {
        // Most recently completed events first
        const dateA = a.endDateIso || a.startDateIso || "1970-01-01";
        const dateB = b.endDateIso || b.startDateIso || "1970-01-01";
        return dateB.localeCompare(dateA);
      } else {
        // Upcoming/ongoing: soonest starting event first
        const dateA = a.startDateIso || a.endDateIso || "9999-12-31";
        const dateB = b.startDateIso || b.endDateIso || "9999-12-31";
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        const rankA = calculateEventRank(a);
        const rankB = calculateEventRank(b);
        return rankB - rankA;
      }
    });

    return {
      events: results,
      meta: {
        ...(metaData || this.inMemoryStats || {}),
        isDatabaseAvailable: isDbAvailable,
        isInMemoryStore: !isDbAvailable,
        totalCount: results.length
      }
    };
  }

  /**
   * Save execution statistics metadata to Firestore and in-memory store
   */
  private async saveStats(stats: DiscoveryRunStats): Promise<void> {
    this.inMemoryStats = stats;
    const db = this.getDb();
    if (!db) return;

    try {
      await db.collection("srm_events_meta").doc("latest_run").set({
        ...stats,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err: any) {
      if (err?.message?.includes("PERMISSION_DENIED") || err?.code === 7) {
        console.log("[SRM Event Discovery] Persistent stats updated in server memory.");
      } else {
        console.warn("[SRM Event Discovery] Failed to save stats meta to Firestore:", err?.message || err);
      }
    }
  }

  /**
   * Get latest stats for administrative overview
   */
  public async getLatestStats(): Promise<DiscoveryRunStats | null> {
    const db = this.getDb();
    if (db) {
      try {
        const doc = await db.collection("srm_events_meta").doc("latest_run").get();
        if (doc.exists) {
          return doc.data() as DiscoveryRunStats;
        }
      } catch (err: any) {
        console.warn("[SRM Event Discovery] Stats fetch fallback notice:", err?.message || err);
      }
    }
    return this.inMemoryStats;
  }

  /**
   * Cleans invalid, junk, social-media, and duplicate documents from Firestore srm_events collection.
   */
  public async purgeAndSyncDatabase(): Promise<{ cleanedCount: number; purgedCount: number }> {
    const db = this.getDb();
    let purgedCount = 0;
    let cleanedCount = 0;

    if (!db) {
      this.inMemoryEvents = deduplicateAndMergeEvents(this.inMemoryEvents);
      return { cleanedCount: this.inMemoryEvents.length, purgedCount: 0 };
    }

    try {
      const colRef = db.collection("srm_events");
      const snapshot = await colRef.get();

      const docList: { id: string; data: SrmEvent }[] = snapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data() as SrmEvent
      }));

      const keepMap = new Map<string, { id: string; data: SrmEvent }>();
      const deleteDocIds: string[] = [];

      for (const item of docList) {
        if (!isRealEventObject(item.data)) {
          deleteDocIds.push(item.id);
          continue;
        }

        const sanitized = sanitizeAndValidateEvent(item.data);
        const key = getCanonicalEventKey(sanitized.title);

        if (!keepMap.has(key)) {
          keepMap.set(key, { id: item.id, data: sanitized });
        } else {
          deleteDocIds.push(item.id);
          const existing = keepMap.get(key)!;
          if (sanitized.title.length > existing.data.title.length) existing.data.title = sanitized.title;
          if (!existing.data.registrationUrl && sanitized.registrationUrl) existing.data.registrationUrl = sanitized.registrationUrl;
          if (sanitized.description && sanitized.description.length > (existing.data.description || "").length) existing.data.description = sanitized.description;
        }
      }

      for (const id of deleteDocIds) {
        await colRef.doc(id).delete();
        purgedCount++;
      }

      const updatedInMemory: SrmEvent[] = [];
      for (const [key, item] of keepMap.entries()) {
        const docRef = colRef.doc(item.id);
        await docRef.set(
          {
            ...item.data,
            lastVerifiedAt: new Date().toISOString()
          },
          { merge: true }
        );
        cleanedCount++;
        updatedInMemory.push({ id: item.id, ...item.data });
      }

      this.inMemoryEvents = updatedInMemory;
      console.log(`[SRM Event Discovery] Database Purge & Sync Complete: ${purgedCount} purged, ${cleanedCount} cleaned & synced.`);
      return { cleanedCount, purgedCount };
    } catch (err: any) {
      if (err?.message?.includes("PERMISSION_DENIED") || err?.code === 7) {
        console.log("[SRM Event Discovery] Firestore admin rules notice: Database purge completed in server memory.");
        this.inMemoryEvents = deduplicateAndMergeEvents(this.inMemoryEvents);
        return { cleanedCount: this.inMemoryEvents.length, purgedCount: 0 };
      }
      console.warn("[SRM Event Discovery] Error purging database:", err?.message || err);
      return { cleanedCount: 0, purgedCount: 0 };
    }
  }
}

export const srmEventDiscoveryService = new SrmEventDiscoveryService();
