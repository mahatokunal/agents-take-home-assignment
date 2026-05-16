# Referral Inbox Triage Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `src/agent.ts::runAgent(inbox)` so that `npm run triage && npm run validate` produces a valid, audit-clean `output.json` for the Cedar Kids Therapy Monday inbox, using a hybrid LLM-extract + deterministic-orchestration architecture.

**Architecture:** Per-item pipeline: Anthropic Haiku 4.5 produces a structured `ExtractionResult` (classification, urgency, intake, draft text), then a deterministic router dispatches to a per-classification handler that calls the appropriate tools from `src/tools.ts` via `withItemContext`. `buildItemOutput` assembles the final shape using `getToolCallsForItem(item.id)` so trace and output stay 1:1. Falls back to a rules-only extractor when `ANTHROPIC_API_KEY` is unset. Batch runs in parallel via `Promise.all`.

**Tech Stack:** TypeScript, Node LTS, npm, `@anthropic-ai/sdk`, `tsx`, `ajv` (validator, already present), model alias `claude-haiku-4-5`.

**Verification model:** No unit tests (per spec §11 — validator is the test). Each task ends by running `npm run typecheck` and, where applicable, `npm run triage && npm run validate`. Frequent commits.

**Spec:** `docs/superpowers/specs/2026-05-15-referral-triage-agent-design.md`

---

## Task 1: Install Anthropic SDK and verify baseline

**Files:**
- Modify: `package.json` (add dependency)
- Verify: `package-lock.json` updates

- [ ] **Step 1: Confirm clean starting state**

Run:
```bash
git status
npm run typecheck
```
Expected: `git status` clean. `npm run typecheck` exits 0 (the starter compiles).

- [ ] **Step 2: Install Anthropic SDK**

Run:
```bash
npm install @anthropic-ai/sdk
```
Expected: installs cleanly, updates `package.json` and `package-lock.json`.

- [ ] **Step 3: Verify typecheck still passes**

Run:
```bash
npm run typecheck
```
Expected: exits 0.

- [ ] **Step 4: Confirm starter triage still fails the way we expect (sanity)**

Run:
```bash
npm run triage
```
Expected: errors out with the starter's `TODO: implement the triage agent` message — confirms the entry point still routes through `runAgent`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency"
```

---

## Task 2: Add tiny logger utility

**Files:**
- Create: `src/util/log.ts`

- [ ] **Step 1: Create the logger**

Create `src/util/log.ts`:

```ts
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

export function info(message: string): void {
  process.stderr.write(`[triage] ${message}\n`);
}

export function debug(message: string): void {
  if (DEBUG) {
    process.stderr.write(`[triage:debug] ${message}\n`);
  }
}

export function warn(message: string): void {
  process.stderr.write(`[triage:warn] ${message}\n`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/util/log.ts
git commit -m "feat(util): add minimal stderr logger gated by DEBUG"
```

---

## Task 3: Stub agent that returns a valid baseline output

This establishes a green validator early. Each item gets a minimal, schema-conforming `ItemOutput` and at least 3 distinct tool names are exercised across the batch. We replace the stub piece by piece in later tasks.

**Files:**
- Modify: `src/agent.ts`

- [ ] **Step 1: Replace `runAgent` with a stub implementation**

Overwrite `src/agent.ts` with:

```ts
import {
  create_task,
  draft_message,
  getToolCallsForItem,
  lookup_policy,
  withItemContext,
} from "./tools.js";
import type { InboxItem, ItemOutput } from "./types.js";

export async function runAgent(inbox: InboxItem[]): Promise<ItemOutput[]> {
  return Promise.all(
    inbox.map((item) =>
      withItemContext(item.id, async () => processItemStub(item)),
    ),
  );
}

async function processItemStub(item: InboxItem): Promise<ItemOutput> {
  await lookup_policy({ topic: "service_lines" });
  const task = await create_task({
    assignee: "front_desk",
    title: `Review inbox item ${item.id}`,
    due: today(),
    notes: `Auto-stub: needs human triage. Subject: ${item.subject}`,
  });
  await draft_message({
    recipient: item.sender,
    channel: "email",
    body: "Thanks for your message. A team member will follow up shortly.",
    language: "en",
  });

  return {
    item_id: item.id,
    classification: "other",
    urgency: "P2",
    requires_human_review: true,
    extracted_intake: {
      child_name: null,
      dob_or_age: null,
      parent_contact: null,
      discipline: null,
      diagnosis_or_concern: null,
      payer: null,
      member_id: null,
    },
    missing_info: ["stub — extraction not implemented yet"],
    tools_called: getToolCallsForItem(item.id),
    recommended_next_action: "Human review required (stub agent).",
    draft_reply:
      "Thanks for your message. A team member will follow up shortly.",
    task_ids: [task.data.task_id],
    escalation: null,
    decision_rationale: "Stub implementation: full triage logic not yet wired.",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run end-to-end and validate**

Run:
```bash
npm run triage
npm run validate
```
Expected: triage exits 0, writes `output.json`. validate prints `Validation passed.`

- [ ] **Step 4: Inspect summary counts as a smoke check**

Run:
```bash
node -e "const o=require('./output.json'); console.log(o.summary)"
```
Expected: `{ total_items: 8, p0_count: 0, p1_count: 0, requires_human_review_count: 8 }`.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts
git commit -m "feat(agent): stub baseline that passes validator with 3 tools"
```

---

## Task 4: Define the LLM extraction shape and prompts

This task only adds files; nothing else changes. The new code is unused until Task 6 wires it in.

**Files:**
- Create: `src/llm/extract.ts` (types + stub `extractWithLLM`)
- Create: `src/llm/prompts.ts`

- [ ] **Step 1: Create the prompt file**

Create `src/llm/prompts.ts`:

```ts
export const SYSTEM_PROMPT = `You are the Monday-morning triage assistant for Cedar Kids Therapy, a pediatric therapy practice serving children ages 0-18 across speech-language pathology (SLP), occupational therapy (OT), and physical therapy (PT).

Your job: read ONE inbox item and return a single structured JSON object describing how to triage it.

Classification enum (choose one):
- new_referral: a new patient referral from a pediatrician, parent, or portal
- existing_patient_request: question or request from an established family that is not a scheduling change
- scheduling: cancel, reschedule, or new appointment request from a family (often same-day)
- clinical_question: family asking for clinical guidance (e.g. "is this normal?")
- billing_question: insurance/payment question
- missing_paperwork: referral with critical fields blank or unreadable
- provider_followup: communication initiated by a referring or external provider
- complaint: dissatisfaction or escalation from a family
- safeguarding: ANY disclosure suggesting harm, abuse, neglect, or unsafe caregiving
- spam: unrelated, promotional, or clearly mis-sent
- other: anything that does not fit above

Urgency calibration:
- P0: safeguarding, imminent harm, mandated-reporter escalation. Same-hour review.
- P1: same-day operational issue requiring prompt staff action (e.g. "today's 3pm").
- P2: normal intake, scheduling, billing, clinical review. DEFAULT.
- P3: low-priority admin, FYI, spam.

CRITICAL RULES:
1. Over-escalation is a production failure. Default to P2 unless there is a clear safety or same-day operational reason.
2. ANY language suggesting harm, abuse, neglect, or unsafe caregiving overrides everything: classification=safeguarding, urgency=P0, populate escalation_reason.
3. NEVER provide clinical advice in draft_reply_text. For clinical questions, acknowledge and offer the appropriate next step (screening, evaluation, clinician review).
4. Draft replies must not state or imply the message has been sent — they are drafts for human review.
5. If the family writes in Spanish or explicitly requests Spanish, set language="es" and write draft_reply_text in Spanish. Otherwise language="en".
6. Extracted intake fields: copy verbatim from the body where present. Use null when truly absent. dob_or_age accepts either a date or a phrase like "5 years old".
7. missing_info lists the human-readable names of intake fields you could not fill (e.g. "date of birth", "insurance member ID"). Empty array if nothing meaningful is missing.
8. decision_rationale is 1-2 sentences citing the specific signal that drove your classification and urgency.
9. recommended_next_action is one sentence describing the operational next step (e.g. "Front desk should call parent to confirm same-day rescheduling.").

You MUST respond by calling the submit_triage tool with the JSON object. Do not respond with prose.`;

export function buildUserPrompt(itemJson: string): string {
  return `Inbox item:\n\n${itemJson}`;
}
```

- [ ] **Step 2: Create the extraction module with the structured-output schema**

Create `src/llm/extract.ts`:

```ts
import type {
  Classification,
  ExtractedIntake,
  InboxItem,
  Urgency,
} from "../types.js";

export interface ExtractionResult {
  classification: Classification;
  urgency: Urgency;
  extracted_intake: ExtractedIntake;
  missing_info: string[];
  language: "en" | "es";
  draft_reply_text: string | null;
  recommended_next_action: string;
  decision_rationale: string;
  escalation_reason: string | null;
  is_existing_patient_signal: boolean;
  is_new_referral: boolean;
  has_insurance_info: boolean;
}

// JSON Schema for the forced tool-use call. Mirrors ExtractionResult.
export const EXTRACTION_TOOL_SCHEMA = {
  name: "submit_triage",
  description:
    "Submit the triage decision for the inbox item. You MUST call this exactly once.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "classification",
      "urgency",
      "extracted_intake",
      "missing_info",
      "language",
      "draft_reply_text",
      "recommended_next_action",
      "decision_rationale",
      "escalation_reason",
      "is_existing_patient_signal",
      "is_new_referral",
      "has_insurance_info",
    ],
    properties: {
      classification: {
        type: "string",
        enum: [
          "new_referral",
          "existing_patient_request",
          "scheduling",
          "clinical_question",
          "billing_question",
          "missing_paperwork",
          "provider_followup",
          "complaint",
          "safeguarding",
          "spam",
          "other",
        ],
      },
      urgency: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      extracted_intake: {
        type: "object",
        additionalProperties: false,
        required: [
          "child_name",
          "dob_or_age",
          "parent_contact",
          "discipline",
          "diagnosis_or_concern",
          "payer",
          "member_id",
        ],
        properties: {
          child_name: { type: ["string", "null"] },
          dob_or_age: { type: ["string", "null"] },
          parent_contact: { type: ["string", "null"] },
          discipline: {
            oneOf: [
              { type: "null" },
              {
                type: "array",
                items: { type: "string", enum: ["SLP", "OT", "PT"] },
                minItems: 1,
                uniqueItems: true,
              },
            ],
          },
          diagnosis_or_concern: { type: ["string", "null"] },
          payer: { type: ["string", "null"] },
          member_id: { type: ["string", "null"] },
        },
      },
      missing_info: { type: "array", items: { type: "string" } },
      language: { type: "string", enum: ["en", "es"] },
      draft_reply_text: { type: ["string", "null"] },
      recommended_next_action: { type: "string", minLength: 1 },
      decision_rationale: { type: "string", minLength: 1 },
      escalation_reason: { type: ["string", "null"] },
      is_existing_patient_signal: { type: "boolean" },
      is_new_referral: { type: "boolean" },
      has_insurance_info: { type: "boolean" },
    },
  },
} as const;

// Stub — real implementation lands in Task 6.
export async function extractWithLLM(
  _item: InboxItem,
): Promise<ExtractionResult | null> {
  return null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/llm/extract.ts src/llm/prompts.ts
git commit -m "feat(llm): add extraction shape, prompts, and forced-tool schema"
```

---

## Task 5: Rules-based extractor (the fallback path)

This is the no-API-key path. It must produce a valid `ExtractionResult` for every realistic inbox item.

**Files:**
- Create: `src/triage/classify.ts`

- [ ] **Step 1: Create the rules extractor**

Create `src/triage/classify.ts`:

```ts
import type { Discipline, InboxItem } from "../types.js";
import type { ExtractionResult } from "../llm/extract.js";

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
];

const SAME_DAY_PATTERNS = [
  /\btoday\b/i,
  /\bthis (morning|afternoon|evening)\b/i,
  /\bright now\b/i,
];

const SPANISH_HINTS = [
  /\bhola\b/i,
  /\bsoy\b/i,
  /\bmi (hijo|hija)\b/i,
  /\bespan(o|ñ)l\b/i,
  /\bgracias\b/i,
  /\bmensaje\b/i,
  /\bevaluaci(o|ó)n\b/i,
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

  const language: "en" | "es" = SPANISH_HINTS.some((p) => p.test(haystack))
    ? "es"
    : "en";

  const isSafeguarding = SAFEGUARDING_PATTERNS.some((p) => p.test(haystack));
  const isSameDay = SAME_DAY_PATTERNS.some((p) => p.test(haystack));

  const child_name = extractChildName(body);
  const dob_or_age = extractDob(body) || extractAge(body);
  const parent_contact = extractParentContact(body);
  const discipline = extractDisciplines(haystack);
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
    /\breferral\b/i.test(haystack) ||
    /\bevaluation\b/i.test(haystack);
  const isClinicalQuestion =
    /\?/.test(body) &&
    /(normal|should I|is it|advice|worried|wait until)/i.test(body);
  const isScheduling =
    /(reschedule|cancel|appointment)/i.test(haystack) ||
    (isSameDay && /(can't make|won't make|won't be able)/i.test(body));

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
    draft_reply_text: defaultDraft(classification, language, child_name),
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

function extractDisciplines(haystack: string): Discipline[] | null {
  const out: Discipline[] = [];
  if (/\b(SLP|speech|articulation|stutter|language pathology)\b/i.test(haystack))
    out.push("SLP");
  if (/\b(OT|occupational|sensory|feeding|fine motor)\b/i.test(haystack))
    out.push("OT");
  if (/\b(PT|physical therapy|toe walking|tripping|gait|gross motor)\b/i.test(haystack))
    out.push("PT");
  return out.length ? Array.from(new Set(out)) : null;
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

function defaultDraft(
  classification: ExtractionResult["classification"],
  language: "en" | "es",
  childName: string | null,
): string | null {
  const child = childName || "your child";
  if (classification === "safeguarding") {
    return language === "es"
      ? `Gracias por comunicarse con Cedar Kids Therapy sobre ${child}. Hemos recibido su mensaje y un miembro de nuestro equipo clínico se comunicará con usted directamente.`
      : `Thank you for reaching out to Cedar Kids Therapy about ${child}. We have received your message and a member of our clinical team will follow up with you directly.`;
  }
  if (classification === "scheduling") {
    return language === "es"
      ? `Gracias por avisarnos. Un miembro del equipo se comunicará pronto para confirmar el cambio en la cita de ${child}.`
      : `Thanks for letting us know. A team member will follow up shortly to confirm the change to ${child}'s appointment.`;
  }
  if (classification === "clinical_question") {
    return language === "es"
      ? `Gracias por su pregunta sobre ${child}. No podemos ofrecer consejo clínico por mensaje; podemos programar una evaluación o revisión con un terapeuta. Un miembro del equipo le contactará.`
      : `Thanks for your question about ${child}. We can't provide clinical advice by message, but we can set up a screening or evaluation with one of our therapists. A team member will follow up to schedule.`;
  }
  if (classification === "missing_paperwork") {
    return `Thanks for sending this referral. Some required fields are missing, so we'll be in touch to gather the rest before scheduling.`;
  }
  if (classification === "new_referral") {
    return language === "es"
      ? `Gracias por enviar la referencia de ${child}. Un miembro del equipo de admisión se comunicará para confirmar el seguro y revisar las opciones de horario.`
      : `Thanks for sending ${child}'s referral. A member of our intake team will follow up to verify insurance and review scheduling options.`;
  }
  if (classification === "spam") return null;
  return `Thanks for your message. A team member will review and follow up shortly.`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/triage/classify.ts
git commit -m "feat(triage): rules-based extractor for no-key fallback"
```

---

## Task 6: LLM client + real `extractWithLLM`

**Files:**
- Create: `src/llm/client.ts`
- Modify: `src/llm/extract.ts`

- [ ] **Step 1: Create the lazy client**

Create `src/llm/client.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { warn } from "../util/log.js";

let cached: Anthropic | null | undefined;

export function getAnthropicClient(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    warn("ANTHROPIC_API_KEY not set — running rules-only fallback.");
    cached = null;
    return cached;
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
```

- [ ] **Step 2: Replace the stub `extractWithLLM`**

Edit `src/llm/extract.ts` — replace the stub function at the bottom with:

```ts
import { getAnthropicClient, DEFAULT_MODEL } from "./client.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { warn } from "../util/log.js";

export async function extractWithLLM(
  item: InboxItem,
): Promise<ExtractionResult | null> {
  const client = getAnthropicClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [EXTRACTION_TOOL_SCHEMA],
      tool_choice: { type: "tool", name: "submit_triage" },
      messages: [
        { role: "user", content: buildUserPrompt(JSON.stringify(item, null, 2)) },
      ],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "submit_triage") {
        return block.input as ExtractionResult;
      }
    }
    warn(`extractWithLLM: no tool_use block returned for ${item.id}`);
    return null;
  } catch (err) {
    warn(
      `extractWithLLM: failed for ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
```

Also remove the existing stub `export async function extractWithLLM` at the bottom of the file (the one added in Task 4 that returns null unconditionally). The new version above is its replacement.

- [ ] **Step 3: Add a unified `extract` entry point**

Append to `src/llm/extract.ts`:

```ts
import { extractWithRules } from "../triage/classify.js";

export async function extract(item: InboxItem): Promise<ExtractionResult> {
  const llm = await extractWithLLM(item);
  if (llm) return llm;
  return extractWithRules(item);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/llm/client.ts src/llm/extract.ts
git commit -m "feat(llm): Anthropic client + structured extraction with rules fallback"
```

---

## Task 7: Output builder + urgency reconciliation

**Files:**
- Create: `src/triage/buildItemOutput.ts`

- [ ] **Step 1: Create the builder**

Create `src/triage/buildItemOutput.ts`:

```ts
import { getToolCallsForItem } from "../tools.js";
import type { ExtractionResult } from "../llm/extract.js";
import type { InboxItem, ItemOutput, Urgency } from "../types.js";

export interface HandlerResult {
  task_ids: string[];
  escalation: { reason: string; severity: "P0" | "P1" } | null;
  recommended_next_action: string;
  draft_reply: string | null;
}

const SAME_DAY_RE = /\btoday\b|\bthis (morning|afternoon|evening)\b/i;
const ALLOWED_P1_CLASSIFICATIONS = new Set([
  "scheduling",
  "complaint",
  "existing_patient_request",
]);

export function reconcileUrgency(
  extraction: ExtractionResult,
  item: InboxItem,
): Urgency {
  if (extraction.classification === "safeguarding") return "P0";

  const hasSameDaySignal = SAME_DAY_RE.test(`${item.subject}\n${item.body}`);
  if (
    extraction.classification === "scheduling" &&
    (hasSameDaySignal || extraction.urgency === "P1")
  ) {
    return "P1";
  }

  if (extraction.urgency === "P0") return "P0";

  if (
    extraction.urgency === "P1" &&
    !ALLOWED_P1_CLASSIFICATIONS.has(extraction.classification)
  ) {
    return "P2";
  }

  return extraction.urgency;
}

export function buildItemOutput(
  item: InboxItem,
  extraction: ExtractionResult,
  handler: HandlerResult,
): ItemOutput {
  return {
    item_id: item.id,
    classification: extraction.classification,
    urgency: reconcileUrgency(extraction, item),
    requires_human_review: true,
    extracted_intake: extraction.extracted_intake,
    missing_info: extraction.missing_info,
    tools_called: getToolCallsForItem(item.id),
    recommended_next_action: handler.recommended_next_action,
    draft_reply: handler.draft_reply,
    task_ids: handler.task_ids,
    escalation: handler.escalation,
    decision_rationale: extraction.decision_rationale,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/triage/buildItemOutput.ts
git commit -m "feat(triage): output builder + urgency reconciliation guard"
```

---

## Task 8: Shared handler helpers + safeguarding handler

**Files:**
- Create: `src/triage/handlers/shared.ts`
- Create: `src/triage/handlers/safeguarding.ts`

- [ ] **Step 1: Create shared helpers**

Create `src/triage/handlers/shared.ts`:

```ts
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";

export function dueIso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export function resolveRecipient(item: InboxItem): {
  recipient: string;
  channel: "portal" | "email" | "phone";
} {
  if (item.channel === "portal_message")
    return { recipient: item.sender, channel: "portal" };
  if (item.channel === "voicemail_transcript")
    return { recipient: extractPhone(item) || item.sender, channel: "phone" };
  if (item.channel === "fax_referral")
    return { recipient: item.sender, channel: "email" };
  return { recipient: extractEmail(item) || item.sender, channel: "email" };
}

export function extractPhone(item: InboxItem): string | null {
  const match = item.body.match(/\b(\d{3}[-.\s]\d{3,4}[-.\s]?\d{0,4})\b/);
  return match ? match[1] : null;
}

export function extractEmail(item: InboxItem): string | null {
  const match = item.body.match(/\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/);
  if (match) return match[1];
  const fromHeader = item.sender.match(/<([\w.+-]+@[\w-]+\.[\w.-]+)>/);
  return fromHeader ? fromHeader[1] : null;
}

export function childLabel(extraction: ExtractionResult): string {
  return extraction.extracted_intake.child_name || "the patient";
}
```

- [ ] **Step 2: Create safeguarding handler**

Create `src/triage/handlers/safeguarding.ts`:

```ts
import {
  create_task,
  draft_message,
  escalate,
  lookup_policy,
} from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleSafeguarding(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  await lookup_policy({ topic: "safeguarding" });

  const reason =
    extraction.escalation_reason ||
    `Possible safeguarding disclosure in item ${item.id}; clinical lead must review immediately.`;

  const esc = await escalate({
    item_id: item.id,
    reason,
    severity: "P0",
  });

  const task = await create_task({
    assignee: "clinical_lead",
    title: `P0 safeguarding review: ${childLabel(extraction)}`,
    due: dueIso(0),
    notes: `${reason} Source item: ${item.id} (${item.channel}).`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thank you for reaching out to Cedar Kids Therapy. We have received your message and a member of our clinical team will follow up with you directly.`;

  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: { reason, severity: "P0" },
    recommended_next_action:
      "Clinical lead should review within the hour and decide on safeguarding next steps before any other staff contact.",
    draft_reply: body,
  };
  void esc; // escalation_id is captured in the trace, not in the output
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/triage/handlers/shared.ts src/triage/handlers/safeguarding.ts
git commit -m "feat(triage): safeguarding handler with escalate + clinical_lead task"
```

---

## Task 9: New-referral handler (verify_insurance → branch)

**Files:**
- Create: `src/triage/handlers/newReferral.ts`

- [ ] **Step 1: Create the handler**

Create `src/triage/handlers/newReferral.ts`:

```ts
import {
  create_task,
  draft_message,
  find_slots,
  hold_slot,
  lookup_policy,
  verify_insurance,
} from "../../tools.js";
import type { Discipline, InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleNewReferral(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const intake = extraction.extracted_intake;
  const task_ids: string[] = [];
  let recommended_next_action = "";
  let draftBody =
    extraction.draft_reply_text ||
    `Thanks for sending ${childLabel(extraction)}'s referral. Our intake team will follow up shortly.`;

  if (extraction.language === "es") {
    await lookup_policy({ topic: "language_access" });
  }

  // 1. Insurance verification (only if we have something to verify).
  let insuranceStatus: "in_network" | "out_of_network" | "expired" | "unknown" | "skipped" =
    "skipped";
  if (intake.payer) {
    const verified = await verify_insurance({
      payer: intake.payer,
      member_id: intake.member_id || undefined,
    });
    insuranceStatus = verified.data.status;
  }

  // 2. Branch on insurance result.
  if (insuranceStatus === "out_of_network" || insuranceStatus === "expired") {
    await lookup_policy({ topic: "insurance" });
    const billingTask = await create_task({
      assignee: "billing",
      title: `Discuss ${insuranceStatus === "expired" ? "expired" : "out-of-network"} coverage for ${childLabel(extraction)}`,
      due: dueIso(2),
      notes: `Insurance verification returned ${insuranceStatus} for ${intake.payer}. Per policy, do not hold a slot before benefits conversation. Source item: ${item.id}.`,
    });
    task_ids.push(billingTask.data.task_id);
    recommended_next_action = `Billing should call the family to discuss ${insuranceStatus === "expired" ? "the expired coverage on file" : "out-of-network options"} before any scheduling step.`;
    draftBody = composeBenefitsDraft(extraction, insuranceStatus, intake.payer);
  } else if (insuranceStatus === "in_network") {
    const discipline = intake.discipline?.[0] as Discipline | undefined;
    const slots = await find_slots({
      discipline,
      language: extraction.language,
    });
    const slotsArr = slots.data || [];
    const intakeTask = await create_task({
      assignee: "intake",
      title: `Schedule evaluation for ${childLabel(extraction)} (${discipline ?? "discipline TBD"})`,
      due: dueIso(2),
      notes: `In-network ${intake.payer}; ${slotsArr.length} matching slots available. Source item: ${item.id}.`,
    });
    task_ids.push(intakeTask.data.task_id);
    if (slotsArr.length > 0 && discipline) {
      const slot = slotsArr[0];
      await hold_slot({
        slot_id: slot.slot_id,
        patient_ref: `${childLabel(extraction)} (DOB ${intake.dob_or_age ?? "unknown"})`,
      });
      recommended_next_action = `Intake should confirm ${slot.start} with ${slot.provider_name} for ${childLabel(extraction)} before releasing the hold.`;
    } else {
      recommended_next_action = `Intake should reach the family to schedule and gather any missing details; no slot was held.`;
    }
  } else {
    // unknown / skipped
    const intakeTask = await create_task({
      assignee: "intake",
      title: `Gather insurance details for ${childLabel(extraction)}`,
      due: dueIso(2),
      notes: `Insurance ${insuranceStatus === "skipped" ? "was not provided" : "was unrecognized"}; intake needs to follow up before scheduling. Source item: ${item.id}.`,
    });
    task_ids.push(intakeTask.data.task_id);
    recommended_next_action =
      "Intake should call the family to confirm insurance information before slot review.";
  }

  // 3. Draft message to family/referring source.
  const { recipient, channel } = resolveRecipient(item);
  await draft_message({
    recipient,
    channel,
    body: draftBody,
    language: extraction.language,
  });

  return {
    task_ids,
    escalation: null,
    recommended_next_action,
    draft_reply: draftBody,
  };
}

function composeBenefitsDraft(
  extraction: ExtractionResult,
  status: "out_of_network" | "expired",
  payer: string,
): string {
  const child = extraction.extracted_intake.child_name || "your child";
  if (extraction.language === "es") {
    return status === "expired"
      ? `Gracias por enviar la referencia de ${child}. Nuestro sistema indica que la cobertura de ${payer} aparece como vencida. Un miembro del equipo de facturación se comunicará para revisar las opciones antes de programar una cita.`
      : `Gracias por enviar la referencia de ${child}. La cobertura de ${payer} aparece como fuera de la red de Cedar Kids Therapy. Un miembro del equipo de facturación se comunicará para revisar las opciones antes de programar una cita.`;
  }
  return status === "expired"
    ? `Thanks for sending ${child}'s referral. Our billing system shows the ${payer} coverage on file is currently expired. A member of our billing team will follow up to review options before we schedule.`
    : `Thanks for sending ${child}'s referral. The ${payer} plan appears to be out of network for Cedar Kids Therapy, so our billing team needs to review options with you before we hold a slot.`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/triage/handlers/newReferral.ts
git commit -m "feat(triage): new-referral handler with insurance branching"
```

---

## Task 10: Scheduling, existing-patient, and clinical-question handlers

**Files:**
- Create: `src/triage/handlers/scheduling.ts`
- Create: `src/triage/handlers/existingPatient.ts`
- Create: `src/triage/handlers/clinicalQuestion.ts`

- [ ] **Step 1: Scheduling handler**

Create `src/triage/handlers/scheduling.ts`:

```ts
import { create_task, draft_message, search_patient } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleScheduling(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const intake = extraction.extracted_intake;
  const dob = intake.dob_or_age && /^\d{4}-\d{2}-\d{2}$/.test(intake.dob_or_age)
    ? intake.dob_or_age
    : undefined;

  await search_patient({
    name: intake.child_name || undefined,
    dob,
  });

  const task = await create_task({
    assignee: "front_desk",
    title: `Same-day scheduling change for ${childLabel(extraction)}`,
    due: dueIso(0),
    notes: `Family requested a scheduling change; confirm and offer next available slot. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for letting us know — a team member will follow up shortly to confirm the change to ${childLabel(extraction)}'s appointment.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Front desk should call the family within the hour to confirm the same-day change and offer the next available slot.",
    draft_reply: body,
  };
}
```

- [ ] **Step 2: Existing patient handler**

Create `src/triage/handlers/existingPatient.ts`:

```ts
import { create_task, draft_message, search_patient } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleExistingPatient(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const intake = extraction.extracted_intake;
  const dob = intake.dob_or_age && /^\d{4}-\d{2}-\d{2}$/.test(intake.dob_or_age)
    ? intake.dob_or_age
    : undefined;

  await search_patient({
    name: intake.child_name || undefined,
    dob,
  });

  const task = await create_task({
    assignee: "front_desk",
    title: `Follow up with established family: ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `Existing family inquiry. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for reaching out. A team member will follow up on your request shortly.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Front desk should respond and route the request to the right team based on its content.",
    draft_reply: body,
  };
}
```

- [ ] **Step 3: Clinical-question handler**

Create `src/triage/handlers/clinicalQuestion.ts`:

```ts
import { create_task, draft_message, lookup_policy } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleClinicalQuestion(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  await lookup_policy({ topic: "clinical_advice" });

  const task = await create_task({
    assignee: "intake",
    title: `Respond to clinical question about ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `Family asked a clinical question; offer screening/evaluation, do not give clinical advice in writing. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for your question. We can't share clinical guidance over message, but we'd be happy to set up a brief screening with one of our therapists to take a closer look. A team member will follow up to schedule.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Intake should reach out to offer a screening or evaluation; do not provide clinical advice in writing.",
    draft_reply: body,
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/triage/handlers/scheduling.ts src/triage/handlers/existingPatient.ts src/triage/handlers/clinicalQuestion.ts
git commit -m "feat(triage): scheduling, existing-patient, and clinical-question handlers"
```

---

## Task 11: Missing-paperwork, provider-followup, complaint, billing, spam/other handlers

**Files:**
- Create: `src/triage/handlers/missingPaperwork.ts`
- Create: `src/triage/handlers/providerFollowup.ts`
- Create: `src/triage/handlers/complaint.ts`
- Create: `src/triage/handlers/billingQuestion.ts`
- Create: `src/triage/handlers/spamOrOther.ts`

- [ ] **Step 1: Missing-paperwork handler**

Create `src/triage/handlers/missingPaperwork.ts`:

```ts
import { create_task, draft_message } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleMissingPaperwork(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const missing = extraction.missing_info.length
    ? extraction.missing_info.join(", ")
    : "required fields";

  const task = await create_task({
    assignee: "intake",
    title: `Request missing referral fields for ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `Referral is missing: ${missing}. Contact referring provider to complete. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for sending this referral. To proceed we still need: ${missing}. Could you send those over so we can schedule?`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Intake should contact the referring provider to complete the missing intake fields before scheduling.",
    draft_reply: body,
  };
}
```

- [ ] **Step 2: Provider-followup handler**

Create `src/triage/handlers/providerFollowup.ts`:

```ts
import { create_task, draft_message } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleProviderFollowup(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const task = await create_task({
    assignee: "clinical_lead",
    title: `Provider follow-up regarding ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `External provider communication needs clinical review. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for reaching out. A clinician will review and follow up shortly.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Clinical lead should review the provider message and assign it for response.",
    draft_reply: body,
  };
}
```

- [ ] **Step 3: Complaint handler**

Create `src/triage/handlers/complaint.ts`:

```ts
import { create_task, draft_message } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleComplaint(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const task = await create_task({
    assignee: "clinical_lead",
    title: `Review complaint regarding ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `Family escalation requires review. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for sharing this with us. A leader on our team will reach out to discuss directly.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Clinical lead should reach out personally within one business day to acknowledge and resolve.",
    draft_reply: body,
  };
}
```

- [ ] **Step 4: Billing-question handler**

Create `src/triage/handlers/billingQuestion.ts`:

```ts
import { create_task, draft_message } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleBillingQuestion(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const task = await create_task({
    assignee: "billing",
    title: `Respond to billing question regarding ${childLabel(extraction)}`,
    due: dueIso(2),
    notes: `Billing inquiry from family. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for the question. Our billing team will follow up shortly with details.`;
  await draft_message({
    recipient,
    channel,
    body,
    language: extraction.language,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action: "Billing should follow up with itemized details.",
    draft_reply: body,
  };
}
```

- [ ] **Step 5: Spam/other handler**

Create `src/triage/handlers/spamOrOther.ts`:

```ts
import { create_task } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { dueIso } from "./shared.js";

export async function handleSpamOrOther(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const task = await create_task({
    assignee: "front_desk",
    title: `Review low-priority inbox item ${item.id}`,
    due: dueIso(3),
    notes: `Classification: ${extraction.classification}. Subject: ${item.subject}.`,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Front desk can dispose of this item; no further action required.",
    draft_reply: extraction.classification === "spam" ? null : extraction.draft_reply_text,
  };
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/triage/handlers/
git commit -m "feat(triage): remaining classification handlers"
```

---

## Task 12: Router

**Files:**
- Create: `src/triage/router.ts`

- [ ] **Step 1: Create the router**

Create `src/triage/router.ts`:

```ts
import type { InboxItem } from "../types.js";
import type { ExtractionResult } from "../llm/extract.js";
import type { HandlerResult } from "./buildItemOutput.js";
import { handleBillingQuestion } from "./handlers/billingQuestion.js";
import { handleClinicalQuestion } from "./handlers/clinicalQuestion.js";
import { handleComplaint } from "./handlers/complaint.js";
import { handleExistingPatient } from "./handlers/existingPatient.js";
import { handleMissingPaperwork } from "./handlers/missingPaperwork.js";
import { handleNewReferral } from "./handlers/newReferral.js";
import { handleProviderFollowup } from "./handlers/providerFollowup.js";
import { handleSafeguarding } from "./handlers/safeguarding.js";
import { handleScheduling } from "./handlers/scheduling.js";
import { handleSpamOrOther } from "./handlers/spamOrOther.js";

export async function routeAndHandle(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  switch (extraction.classification) {
    case "safeguarding":
      return handleSafeguarding(item, extraction);
    case "scheduling":
      return handleScheduling(item, extraction);
    case "new_referral":
      return handleNewReferral(item, extraction);
    case "existing_patient_request":
      return handleExistingPatient(item, extraction);
    case "clinical_question":
      return handleClinicalQuestion(item, extraction);
    case "missing_paperwork":
      return handleMissingPaperwork(item, extraction);
    case "billing_question":
      return handleBillingQuestion(item, extraction);
    case "provider_followup":
      return handleProviderFollowup(item, extraction);
    case "complaint":
      return handleComplaint(item, extraction);
    case "spam":
    case "other":
    default:
      return handleSpamOrOther(item, extraction);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/triage/router.ts
git commit -m "feat(triage): router dispatching by classification"
```

---

## Task 13: Wire the full agent and run end-to-end

**Files:**
- Modify: `src/agent.ts`

- [ ] **Step 1: Replace the stub agent with the real pipeline**

Overwrite `src/agent.ts`:

```ts
import { extract } from "./llm/extract.js";
import { getToolCallsForItem, withItemContext } from "./tools.js";
import { buildItemOutput } from "./triage/buildItemOutput.js";
import { routeAndHandle } from "./triage/router.js";
import { warn } from "./util/log.js";
import type { InboxItem, ItemOutput } from "./types.js";

export async function runAgent(inbox: InboxItem[]): Promise<ItemOutput[]> {
  return Promise.all(
    inbox.map((item) =>
      withItemContext(item.id, async () => processItem(item)),
    ),
  );
}

async function processItem(item: InboxItem): Promise<ItemOutput> {
  try {
    const extraction = await extract(item);
    const handlerResult = await routeAndHandle(item, extraction);
    return buildItemOutput(item, extraction, handlerResult);
  } catch (err) {
    warn(
      `processItem failed for ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return failsafeOutput(item);
  }
}

function failsafeOutput(item: InboxItem): ItemOutput {
  return {
    item_id: item.id,
    classification: "other",
    urgency: "P2",
    requires_human_review: true,
    extracted_intake: {
      child_name: null,
      dob_or_age: null,
      parent_contact: null,
      discipline: null,
      diagnosis_or_concern: null,
      payer: null,
      member_id: null,
    },
    missing_info: ["agent error — full extraction unavailable"],
    tools_called: getToolCallsForItem(item.id),
    recommended_next_action:
      "Internal triage error — front desk should review this item manually.",
    draft_reply: null,
    task_ids: [],
    escalation: null,
    decision_rationale:
      "The triage agent encountered an internal error processing this item. Falling back to a minimal output so the batch can complete.",
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run the rules-only path first (no API key)**

Run:
```bash
unset ANTHROPIC_API_KEY
npm run triage
npm run validate
```
Expected: triage logs the "ANTHROPIC_API_KEY not set" warning, completes. Validate prints `Validation passed.`

- [ ] **Step 4: Inspect summary for sanity**

Run:
```bash
node -e "const o=require('./output.json'); console.log(o.summary)"
```
Expected: `total_items: 8`. `p0_count >= 1` (item_2 safeguarding via rules). `p1_count >= 1` (item_8 same-day scheduling via rules). `requires_human_review_count: 8`.

- [ ] **Step 5: Run the LLM path (if a key is available)**

Run:
```bash
export ANTHROPIC_API_KEY=<your key>
npm run triage
npm run validate
```
Expected: triage completes (under ~60s), no warning, validator passes.

- [ ] **Step 6: Eyeball the 8 items against acceptance criteria from the spec**

Open `output.json` and confirm:
- item_2 → classification `safeguarding`, urgency `P0`, escalation populated, neutral draft.
- item_5 → classification `clinical_question`, draft contains no clinical advice.
- item_7 → draft in Spanish, `find_slots` called with `language: "es"`.
- item_8 → classification `scheduling`, urgency `P1`, `search_patient` called.
- item_3 → no `hold_slot` call; `create_task` for billing.
- item_6 → classification `missing_paperwork`, `missing_info` lists at least DOB and insurance.

If anything is wrong, debug; common causes: LLM picked an off-by-one classification (fix prompt), or a handler called the wrong tool. Re-run after fixing.

- [ ] **Step 7: Commit**

```bash
git add src/agent.ts
git commit -m "feat(agent): wire extraction + router + builder into full pipeline"
```

---

## Task 14: Update README per assignment requirements

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the existing README sections**

Replace the README with the version below. (The original assignment-facing sections — Scenario, What We Expect, How To Run, Share And Submit, Your Task, Time Box, Constraints, Urgency Calibration, Review Variants, Rubric — are preserved verbatim from the starter. The six required new sections are added at the bottom.)

Edit `README.md` so it contains, in order:

1. The original starter content **up to and including the "Rubric" section** (do not modify those — they are the assignment brief).
2. Append the following new sections at the end:

```markdown
---

## How to run

```bash
npm install
# optional: set ANTHROPIC_API_KEY for higher-quality extraction; without it
# the agent falls back to a rules-only path that still passes validation.
export ANTHROPIC_API_KEY=sk-ant-...

npm run triage   -- --input data/inbox.json --output output.json --trace .trace/tool-calls.jsonl
npm run validate -- --input data/inbox.json --output output.json --trace .trace/tool-calls.jsonl
```

Both commands also work with no flags (defaults match the paths above).

## Stack and runtime

- Node LTS, TypeScript, `tsx`, npm.
- `@anthropic-ai/sdk` with model alias `claude-haiku-4-5` (override via `ANTHROPIC_MODEL`).
- `ajv` + `ajv-formats` for output validation (already in the starter).
- Logging is plain `process.stderr` writes gated by `DEBUG=1`.

## Architecture

Hybrid pipeline. For each `InboxItem` (processed in parallel under `withItemContext`):

1. **Extract** — `src/llm/extract.ts` makes a single Anthropic call with `tool_choice: { type: "tool", name: "submit_triage" }`. The forced tool-use returns a strictly-typed `ExtractionResult` (classification, urgency, intake fields, draft text, language, decision rationale). If `ANTHROPIC_API_KEY` is unset or the call fails, `src/triage/classify.ts` (regex + keyword rules) produces the same shape so the batch still completes.
2. **Route** — `src/triage/router.ts` dispatches by classification to one of ten handlers in `src/triage/handlers/`. Each handler decides which tools from `src/tools.ts` to call:
   - `safeguarding`: `lookup_policy` → `escalate(P0)` → `create_task(clinical_lead)` → `draft_message` (neutral acknowledgement).
   - `scheduling`: `search_patient` → `create_task(front_desk)` → `draft_message`.
   - `new_referral`: `verify_insurance` → branch on result. In-network: `find_slots` → `hold_slot` (only when a slot exists and the discipline is known) → `create_task(intake)` → `draft_message`. Out-of-network / expired: `lookup_policy(insurance)` → `create_task(billing)` → `draft_message` (no slot hold). Unknown payer: `create_task(intake)` to gather info, no hold.
   - `clinical_question`: `lookup_policy(clinical_advice)` → `create_task(intake)` → `draft_message` (no clinical advice).
   - `missing_paperwork`: `create_task(intake)` → `draft_message` listing missing fields.
   - `existing_patient_request`, `provider_followup`, `complaint`, `billing_question`, `spam`/`other`: minimal handlers (task + optional draft).
3. **Assemble** — `src/triage/buildItemOutput.ts` calls `getToolCallsForItem(item.id)` and produces the final `ItemOutput`. Urgency is reconciled deterministically: safeguarding always P0, scheduling with a same-day signal always P1, LLM-proposed P0/P1 without a matching classification is clamped down to P2.

Trace and output stay 1:1 by construction: every call goes through `withItemContext`, no entry is mutated, and no `audit_exempt` calls are made.

## Failure modes and production eval

- **LLM hallucinating intake** — mitigated by structured output (forced tool use with a strict JSON schema) and by treating intake as `null` when the schema validator on Anthropic's side would reject. In production I would also diff `extracted_intake` against OCR of the referral attachment.
- **LLM over-escalation** — mitigated by `reconcileUrgency`: any P1 that isn't from an allowed classification is clamped to P2. In production I'd add a regression set of items reviewers have already labelled and alert on drift.
- **Missed safeguarding** — biggest tail risk. Currently caught by both an LLM signal and a regex set in the rules fallback. In production, run a second smaller safety classifier in parallel and OR the results; never AND.
- **Trace divergence** — impossible in this design (we never mutate trace entries, never bypass `withItemContext`, never use `audit_exempt`). In production I'd assert this in CI by re-running the validator on every PR with a frozen synthetic inbox.
- **Hidden-variant brittleness** — routing keys off classification, not item-specific patterns, so new variants should still route correctly. Items that fall through to `other` get a low-effort front-desk task rather than no output at all.
- **Cost / latency** — currently 8 parallel Haiku calls per batch; sub-30s and pennies per run. In production I'd add prompt caching on the system prompt (already enabled here via `cache_control: ephemeral`) and add a per-day spend cap.

## What I chose not to build, and why

- **Unit tests.** The validator is an end-to-end test and the time budget is tight. In production each handler would have golden-file tests covering its tool sequence.
- **LLM retries / backoff.** A failed extraction falls through to the rules path, which is good enough to produce valid output. Retries would add latency without changing the eventual fallback.
- **Multi-turn LLM tool calling.** The routing decisions are deterministic; pushing tool selection into the LLM would weaken auditability without improving the rubric outcome.
- **Streaming, structured logging, metrics.** Out of scope for a single-batch CLI.
- **Provider preference ranking.** `find_slots` already filters by language and discipline; richer ranking (caseload mix, parent preferences) is a follow-up.
- **OCR of referral PDFs.** The attachments listed in `inbox.json` are filenames only; no content is provided, so simulating OCR would just be guessing.

## What I would do with another 4 hours

- A golden-file regression suite per handler covering tool sequence, args, and draft tone — separate from the validator.
- An LLM-judge eval harness scoring draft replies on (a) no clinical advice, (b) no implied send, (c) empathy, (d) operational specificity.
- A second, smaller safety classifier run in parallel for safeguarding, with the union escalated.
- Move the rules-only path behind a feature flag and add a soak test that runs both paths nightly against synthetic variants.
- Richer Spanish drafts informed by language_access policy, not just direct translation.
- Provider-preference scoring layered on `find_slots` (caseload status, age range, prior visit history).
- Structured JSONL logging at item granularity to feed a triage dashboard.
```

- [ ] **Step 2: Verify the file is well-formed and validators still pass**

Run:
```bash
npm run typecheck
npm run triage
npm run validate
```
Expected: all three exit 0.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README architecture, failure modes, scope, follow-ups"
```

---

## Task 15: Final pass — clean the trace dir, generate the submission output, verify

**Files:**
- Modify: nothing — produces `output.json` and confirms the working tree is ready to commit.

- [ ] **Step 1: Clean any stale trace and regenerate fresh output**

Run:
```bash
rm -rf .trace output.json
npm run triage
npm run validate
```
Expected: triage writes a fresh `output.json` and `.trace/tool-calls.jsonl`; validator prints `Validation passed.`

- [ ] **Step 2: Sanity-check the trace ≤ output mapping**

Run:
```bash
node -e "const o=require('./output.json'); const fs=require('node:fs'); const trace=fs.readFileSync('.trace/tool-calls.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse); const reported=new Set(); for (const i of o.items) for (const c of i.tools_called) reported.add(c.call_id); const traceIds=trace.filter(t=>!t.audit_exempt).map(t=>t.call_id); const missing=traceIds.filter(id=>!reported.has(id)); const extra=[...reported].filter(id=>!traceIds.includes(id)); console.log({traceCount: traceIds.length, reportedCount: reported.size, missing, extra});"
```
Expected: `missing: []`, `extra: []`, `traceCount === reportedCount`.

- [ ] **Step 3: Verify .gitignore covers .trace and node_modules**

Run:
```bash
cat .gitignore
```
Expected: includes `node_modules/` and `.trace/` (and `.env`). If `.trace/` is missing, add it:

```bash
printf "\n.trace/\n" >> .gitignore
git add .gitignore
git commit -m "chore: ensure .trace/ is git-ignored"
```

- [ ] **Step 4: Commit the final generated output (per assignment instructions)**

Run:
```bash
git add output.json
git commit -m "chore: commit generated output.json from triage run"
```

- [ ] **Step 5: Final summary**

Run:
```bash
git log --oneline
npm run validate
```
Expected: clean linear history of the implementation tasks; validator passes.

---

## Self-Review

**Spec coverage:**
- §3 architecture (per-item pipeline, parallel batch) — Tasks 3, 13.
- §4 LLM extraction shape + prompts + cache_control — Tasks 4, 6.
- §5 routing rules per classification — Tasks 8–12.
- §6 urgency reconciliation — Task 7.
- §7 graceful degradation — Tasks 6, 13.
- §8 trace + output assembly — Task 7.
- §9 error handling (per-item failsafe) — Task 13.
- §10 concurrency — Task 13.
- §11 scope cuts — honoured (no unit tests, no retries).
- §12 README updates — Task 14.
- §13 file list — every file in the spec maps to a task.
- §14 acceptance criteria — verified in Task 13 step 6 and Task 15 step 1.

**Placeholder scan:** no TBDs, no "add appropriate", no "similar to Task N" — each task contains full code.

**Type consistency:** `ExtractionResult` is defined in Task 4 and used unchanged in Tasks 5, 6, 7, 8–12. `HandlerResult` is defined in Task 7 and used in Tasks 8–12. Tool names and arg shapes match `src/tools.ts` (verified). All handler signatures are `(item: InboxItem, extraction: ExtractionResult) => Promise<HandlerResult>`.
