// Language detection + multilingual keyword routing for the rules-only fallback.
// The LLM path handles language natively via the system prompt; this module exists
// so the no-API-key fallback can still classify Spanish inbox items correctly.

export type Lang = "en" | "es";

const LANGUAGE_HINTS: Record<Exclude<Lang, "en">, RegExp[]> = {
  es: [
    /\bhola\b/i,
    /\bsoy\b/i,
    /\bmi (hijo|hija)\b/i,
    /\bespan(o|ñ)l\b/i,
    /\bgracias\b/i,
    /\bmensaje\b/i,
    /\bllamo\b/i,
    /\bnecesita\b/i,
    /\bprefiero\b/i,
    /\bevaluaci(o|ó)n\b/i,
    /\breferencia\b/i,
    /\bterapia\b/i,
    /\bcita\b/i,
    /\bmi (tel(e|é)fono|n(u|ú)mero)\b/i,
  ],
};

export function detectLanguage(text: string): Lang {
  for (const [lang, patterns] of Object.entries(LANGUAGE_HINTS) as [
    Exclude<Lang, "en">,
    RegExp[],
  ][]) {
    if (patterns.some((p) => p.test(text))) return lang;
  }
  return "en";
}

// Routing patterns. Each concept maps to per-language regex lists. To classify a
// body, OR the patterns for ALL relevant languages — never assume the writer
// stuck to one language in subject vs body.

export interface RoutingPatterns {
  referral: RegExp[];
  scheduling: RegExp[];
  cancel: RegExp[];
  clinicalQuestion: RegExp[];
  sameDay: RegExp[];
}

const PATTERNS: Record<Lang, RoutingPatterns> = {
  en: {
    referral: [/\breferral\b/i, /\bevaluation\b/i, /\bscreening\b/i],
    scheduling: [/\breschedule\b/i, /\bcancel\b/i, /\bappointment\b/i],
    cancel: [/\bcan'?t make\b/i, /\bwon'?t make\b/i, /\bcancel\b/i],
    clinicalQuestion: [
      /(is it (normal|abnormal))/i,
      /(should i (be|worry|wait))/i,
      /(should we wait)/i,
      /\badvice\b/i,
      /\bworried\b/i,
    ],
    sameDay: [
      /\btoday\b/i,
      /\bthis (morning|afternoon|evening)\b/i,
      /\bright now\b/i,
    ],
  },
  es: {
    referral: [
      /\bevaluaci(o|ó)n\b/i,
      /\breferencia\b/i,
      /\bterapia\b/i,
      /\bscreening\b/i,
    ],
    scheduling: [/\breprogramar\b/i, /\bcancelar\b/i, /\bcita\b/i],
    cancel: [/\bno puedo\b/i, /\bcancelar\b/i],
    clinicalQuestion: [
      /(es normal)/i,
      /(deber(í|i)a)/i,
      /\bconsejo\b/i,
      /\bpreocupad(o|a)\b/i,
    ],
    sameDay: [/\bhoy\b/i, /\besta (mañana|tarde|noche)\b/i, /\bahora mismo\b/i],
  },
};

// Test patterns against text using both English (always) AND the detected language.
// English is always included because medical/insurance terms ("BCBS", "Medicaid",
// "evaluation") often appear in English even inside a Spanish message.
export function matchAny(
  text: string,
  concept: keyof RoutingPatterns,
  detectedLang: Lang,
): boolean {
  const langsToCheck: Lang[] = detectedLang === "en" ? ["en"] : ["en", detectedLang];
  for (const lang of langsToCheck) {
    if (PATTERNS[lang][concept].some((p) => p.test(text))) return true;
  }
  return false;
}

// Discipline keywords are similarly multilingual.
export function detectDisciplines(
  text: string,
  detectedLang: Lang,
): Array<"SLP" | "OT" | "PT"> | null {
  const out: Array<"SLP" | "OT" | "PT"> = [];
  const langsToCheck: Lang[] = detectedLang === "en" ? ["en"] : ["en", detectedLang];

  const slp: Record<Lang, RegExp> = {
    en: /\b(SLP|speech|articulation|stutter|language pathology)\b/i,
    es: /\b(habla|lenguaje|articulaci(o|ó)n|terapia del habla)\b/i,
  };
  const ot: Record<Lang, RegExp> = {
    en: /\b(OT|occupational|sensory|feeding|fine motor)\b/i,
    es: /\b(terapia ocupacional|sensorial|alimentaci(o|ó)n|motora fina)\b/i,
  };
  const pt: Record<Lang, RegExp> = {
    en: /\b(PT|physical therapy|toe walking|tripping|gait|gross motor)\b/i,
    es: /\b(terapia f(i|í)sica|caminar en puntas|tropieza|marcha)\b/i,
  };

  for (const lang of langsToCheck) {
    if (slp[lang].test(text)) out.push("SLP");
    if (ot[lang].test(text)) out.push("OT");
    if (pt[lang].test(text)) out.push("PT");
  }
  return out.length ? Array.from(new Set(out)) : null;
}

// Localized default draft templates. The handler's English template is replaced
// when the rules path detects a non-English language and the per-handler prompt
// doesn't supply something better.

const CHILD_FALLBACK: Record<Lang, string> = {
  en: "your child",
  es: "su hijo/a",
};

export function localizedDraft(
  classification: string,
  language: Lang,
  childName: string | null,
): string | null {
  const child = childName || CHILD_FALLBACK[language];

  const drafts: Record<string, Record<Lang, string | null>> = {
    safeguarding: {
      en: `Thank you for reaching out to Cedar Kids Therapy about ${child}. We have received your message and a member of our clinical team will follow up with you directly.`,
      es: `Gracias por comunicarse con Cedar Kids Therapy sobre ${child}. Hemos recibido su mensaje y un miembro de nuestro equipo clínico se comunicará con usted directamente.`,
    },
    scheduling: {
      en: `Thanks for letting us know. A team member will follow up shortly to confirm the change to ${child}'s appointment.`,
      es: `Gracias por avisarnos. Un miembro del equipo se comunicará pronto para confirmar el cambio en la cita de ${child}.`,
    },
    clinical_question: {
      en: `Thanks for your question about ${child}. We can't provide clinical advice by message, but we can set up a screening or evaluation with one of our therapists. A team member will follow up to schedule.`,
      es: `Gracias por su pregunta sobre ${child}. No podemos ofrecer consejo clínico por mensaje; podemos programar una evaluación o revisión con un terapeuta. Un miembro del equipo le contactará.`,
    },
    missing_paperwork: {
      en: `Thanks for sending this referral. Some required fields are missing, so we'll be in touch to gather the rest before scheduling.`,
      es: `Gracias por enviar esta referencia. Faltan algunos campos requeridos, así que nos comunicaremos para completarlos antes de programar.`,
    },
    new_referral: {
      en: `Thanks for sending ${child}'s referral. A member of our intake team will follow up to verify insurance and review scheduling options.`,
      es: `Gracias por enviar la referencia de ${child}. Un miembro del equipo de admisión se comunicará para confirmar el seguro y revisar las opciones de horario.`,
    },
    spam: { en: null, es: null },
    other: {
      en: `Thanks for your message. A team member will review and follow up shortly.`,
      es: `Gracias por su mensaje. Un miembro del equipo revisará y se comunicará pronto.`,
    },
  };

  const byClass = drafts[classification];
  if (!byClass) return drafts.other[language];
  return byClass[language] ?? byClass.en;
}
