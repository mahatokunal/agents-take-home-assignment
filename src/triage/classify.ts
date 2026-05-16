import type { InboxItem } from "../types.js";
import type { ExtractionResult } from "../llm/extract.js";
import {
  detectDisciplines as detectDisciplinesMulti,
  detectLanguage,
  localizedDraft,
  matchAny,
} from "./language.js";

const SAFEGUARDING_PATTERNS = [
  /\babuse\b/i,
  /\babusing\b/i,
  /\bhurt(ing|s)?\b/i,
  /\bharm(ed|ing|s)?\b/i,
  /\bneglect(ed|ing|s)?\b/i,
  /\brough\b/i,
  /\bhit(s|ting)?\b/i,
  /\bunsafe\b/i,
  /\bafraid\b/i,
  /\bscared\b.*\b(dad|mom|father|mother|parent|home)\b/i,
  /\bda(ñ|n)o\b/i,
  /\bmaltrato\b/i,
];

const KNOWN_PAYERS = [
  "Aetna",
  "Blue Cross Blue Shield",
  "BCBS",
  "UnitedHealthcare",
  "United Healthcare",
  "UHC",
  "Medicaid",
  "Kaiser",
  "Cigna Select",
  "Cigna",
  "Beacon",
  "Sunrise",
  "Pediatric Choice",
  "Community First",
];

export function extractWithRules(item: InboxItem): ExtractionResult {
  const body = item.body || "";
  const subject = item.subject || "";
  const haystack = `${subject}\n${body}`;

  const language = detectLanguage(haystack);

  const isSafeguarding = SAFEGUARDING_PATTERNS.some((p) => p.test(haystack));
  const isSameDay = matchAny(haystack, "sameDay", language);

  const child_name = extractChildName(body);
  const dob_or_age = extractDob(body) || extractAge(body);
  const parent_contact = extractParentContact(body);
  const discipline = detectDisciplinesMulti(haystack, language);
  const diagnosis_or_concern = extractConcern(body);
  const payer = extractPayer(body);
  const member_id = extractMemberId(body);

  const intake = {
    child_name,
    dob_or_age,
    parent_contact,
    discipline,
    diagnosis_or_concern,
    payer,
    member_id,
  };

  const missing_info: string[] = [];
  if (!child_name) missing_info.push("child name");
  if (!dob_or_age) missing_info.push("date of birth or age");
  if (!parent_contact) missing_info.push("parent contact");
  if (!discipline) missing_info.push("therapy discipline");
  if (!payer) missing_info.push("insurance payer");
  if (!member_id) missing_info.push("insurance member ID");

  const hasBlankMarkers = /\[blank\]/i.test(body) || /\[\s*\]/.test(body);
  const looksLikeReferral =
    item.channel === "fax_referral" ||
    matchAny(haystack, "referral", language);
  const isClinicalQuestion =
    /\?/.test(body) && matchAny(body, "clinicalQuestion", language);
  const isScheduling =
    matchAny(haystack, "scheduling", language) ||
    (isSameDay && matchAny(body, "cancel", language));

  let classification: ExtractionResult["classification"] = "other";
  let urgency: ExtractionResult["urgency"] = "P2";
  let escalation_reason: string | null = null;
  let recommended_next_action =
    "Front desk should review this item and decide on next steps.";
  let decision_rationale =
    "Rules-based fallback could not match a strong signal; defaulting to P2 other.";

  if (isSafeguarding) {
    classification = "safeguarding";
    urgency = "P0";
    escalation_reason =
      "Message contains language suggesting possible harm or unsafe caregiving; clinical lead must review immediately.";
    recommended_next_action =
      "Clinical lead should review within the hour and decide on safeguarding next steps.";
    decision_rationale =
      "Body contains safeguarding language (e.g. mention of harm or rough behavior toward the child). Per policy this is P0 and overrides other classification signals.";
  } else if (isScheduling && isSameDay) {
    classification = "scheduling";
    urgency = "P1";
    recommended_next_action =
      "Front desk should call the family to confirm the same-day change and offer next available slot.";
    decision_rationale =
      "Family indicates a same-day appointment change; per policy this is a P1 operational issue.";
  } else if (isClinicalQuestion) {
    classification = "clinical_question";
    recommended_next_action =
      "Intake should respond acknowledging the question and offering a screening or evaluation; no clinical advice in writing.";
    decision_rationale =
      "Body asks a clinical question. Front desk and automated systems must not give clinical advice; route to screening.";
  } else if (hasBlankMarkers) {
    classification = "missing_paperwork";
    recommended_next_action =
      "Intake should contact the referring provider to complete the missing fields before scheduling.";
    decision_rationale =
      "Referral contains blank required fields; cannot be processed until completed.";
  } else if (looksLikeReferral) {
    classification = "new_referral";
    recommended_next_action =
      "Intake should verify insurance and review available slots for the requested discipline.";
    decision_rationale =
      "Item is a referral with intake details; route through standard new-referral flow.";
  }

  const is_existing_patient_signal =
    /(my (child|son|daughter)'s (appointment|therapist))/i.test(body) ||
    /(today's \d)/i.test(body) ||
    /(reschedule|reschedu)/i.test(body);

  return {
    classification,
    urgency,
    extracted_intake: intake,
    missing_info,
    language,
    draft_reply_text: localizedDraft(classification, language, child_name),
    recommended_next_action,
    decision_rationale,
    escalation_reason,
    is_existing_patient_signal,
    is_new_referral: classification === "new_referral",
    has_insurance_info: Boolean(payer || member_id),
  };
}

function extractChildName(body: string): string | null {
  const patterns = [
    /Child:\s*([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,3})/,
    /(?:my son|my daughter|my child|for)\s+([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2})/,
    /Referral for\s+([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2})/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractDob(body: string): string | null {
  const match = body.match(/DOB[:\s]+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return match ? match[1] : null;
}

function extractAge(body: string): string | null {
  const match = body.match(/\b(?:he|she|they)\s+is\s+(\d{1,2})\b/i);
  if (match) return `${match[1]} years old`;
  const aged = body.match(/\b(\d{1,2})[- ]year[- ]old\b/i);
  if (aged) return `${aged[1]} years old`;
  return null;
}

function extractParentContact(body: string): string | null {
  const phone = body.match(/\b(\d{3}[-.\s]\d{3,4}[-.\s]?\d{0,4})\b/);
  const email = body.match(/\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/);
  const parent = body.match(/Parent(?:\/guardian)?:\s*([^\n,]+)/i);
  const parts = [
    parent ? parent[1].trim() : null,
    phone ? phone[1] : null,
    email ? email[1] : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : null;
}

function extractConcern(body: string): string | null {
  const patterns = [
    /Concern:\s*([^\n.]+)/i,
    /Diagnosis(?:\/concern)?:\s*([^\n.]+)/i,
    /\bfor\s+([a-z][^.\n]{5,80})/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractPayer(body: string): string | null {
  for (const payer of KNOWN_PAYERS) {
    const re = new RegExp(`\\b${payer.replace(/\s+/g, "\\s+")}(\\s+[A-Z]{2,4})?\\b`, "i");
    const match = body.match(re);
    if (match) return match[0].trim();
  }
  const labelled = body.match(/Insurance:\s*([^\n,]+)/i);
  if (labelled) {
    const value = labelled[1].trim();
    if (value && !/\[blank\]/i.test(value)) return value;
  }
  return null;
}

function extractMemberId(body: string): string | null {
  const labelled = body.match(/Member ID:\s*([A-Z]{2,5}-?\d+)/i);
  if (labelled) return labelled[1];
  const inline = body.match(/\b([A-Z]{2,5}-\d{3,8})\b/);
  return inline ? inline[1] : null;
}

