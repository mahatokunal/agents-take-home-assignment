# Referral Inbox Triage Agent — Design

**Date:** 2026-05-15
**Author:** Kunal Mahato
**Status:** Approved (pending spec review)
**Time budget:** ~2 hours implementation

---

## 1. Goal

Implement `src/agent.ts::runAgent(inbox)` for the Cedar Kids Therapy Monday-morning inbox triage. For each `InboxItem`, produce one `ItemOutput` containing classification, urgency, extracted intake, missing info, recommended next action, draft reply, task IDs, escalation (if any), decision rationale, and the trace of tool calls actually made.

Output must:

- Pass `npm run validate` against `data/inbox.json` and similar hidden synthetic variants.
- Use ≥3 distinct tools from `src/tools.ts` across the batch.
- Have `requires_human_review === true` for every item (enforced by validator).
- Trace-match 1:1: every non-exempt tool call appears in exactly one item's `tools_called`, with matching `args` and `result_summary`.
- Not fabricate `call_id` values — they come from `getToolCallsForItem(item.id)`.
- Not auto-send messages and not schedule appointments.

---

## 2. Approach: Hybrid (LLM understanding + deterministic orchestration)

Pure-LLM is risky because the validator is strict about trace matching, and we have no time to debug LLM-produced JSON drift. Pure-rules generalize poorly on hidden variants and miss nuance (Spanish, safeguarding subtlety, free-text concern extraction).

**Hybrid split:**

- **LLM owns:** semantic understanding — intake field extraction, language detection, classification, urgency assignment, draft-reply text generation.
- **Code owns:** tool orchestration (which tools to call, with what args, in what order), trace assembly, output object construction, validation-shape conformance.

This isolates LLM failure modes to "text quality" and keeps everything the validator inspects under deterministic control.

---

## 3. Architecture

```
src/
  agent.ts          # runAgent() — orchestrates the batch (Promise.all over items)
  index.ts          # untouched (starter glue)
  tools.ts          # untouched (provided)
  types.ts          # untouched
  validate.ts       # untouched
  llm/
    client.ts       # Anthropic SDK wrapper; lazy init; returns null if no key
    extract.ts      # one structured-output call per item → ExtractionResult
    prompts.ts      # system + user prompt templates
  triage/
    classify.ts     # rules fallback when LLM is unavailable
    router.ts       # given an ExtractionResult, dispatch to a handler
    handlers/
      safeguarding.ts
      scheduling.ts        # same-day cancel / reschedule
      newReferral.ts       # the in-network vs OON branch
      clinicalQuestion.ts
      missingPaperwork.ts
      spamOrOther.ts
    buildItemOutput.ts     # assembles ItemOutput from extraction + handler result
  util/
    log.ts          # tiny console logger gated by DEBUG env var
```

**Data flow per item (inside `withItemContext(item.id, ...)`):**

```
InboxItem
  → extract.ts (LLM call OR rules fallback)
      → ExtractionResult { classification, urgency, extracted_intake,
                            missing_info, language, draft_reply_text,
                            decision_rationale, escalation_reason? }
  → router.ts (dispatch by classification)
      → handler runs tool calls via withItemContext-scoped tools
      → HandlerResult { task_ids, escalation, recommended_next_action,
                         draft_reply (possibly overridden), notes }
  → buildItemOutput.ts merges extraction + handler result + getToolCallsForItem(id)
  → ItemOutput
```

The whole batch is `await Promise.all(inbox.map(processItem))` — concurrency = 8 is safe for the Anthropic API and for `appendFileSync` (Node's sync fs ops serialize at the syscall level).

---

## 4. The LLM extraction call

**One structured call per item.** Model: `claude-haiku-4-5` (cheap, fast, sufficient for extraction). Override via `ANTHROPIC_MODEL` env var.

**Input to model:** the entire `InboxItem` plus a system prompt containing:

- Practice context (Cedar Kids Therapy, SLP/OT/PT, ages 0–18).
- The full classification enum + the urgency calibration rules from README.
- The safeguarding rule (any harm/abuse/neglect language → P0 safeguarding, never P2).
- "Do not provide clinical advice in draft_reply_text."
- "Draft replies must not imply they were sent."
- "If the family writes in Spanish or requests Spanish, set language='es' and draft in Spanish."
- "Return strictly the JSON schema below — no prose, no markdown."

**Output JSON schema (enforced via Anthropic tool-use forced-call pattern for guaranteed structure):**

```ts
{
  classification: Classification,          // enum from types.ts
  urgency: "P0" | "P1" | "P2" | "P3",
  extracted_intake: ExtractedIntake,       // exact schema match, nulls allowed
  missing_info: string[],                  // human-readable field names
  language: "en" | "es",
  draft_reply_text: string | null,         // null for spam/FYI only
  recommended_next_action: string,         // one sentence, operationally specific
  decision_rationale: string,              // 1–2 sentences citing the signal
  escalation_reason: string | null,        // present if classification=safeguarding
  is_existing_patient_signal: boolean,     // hint for router (mentions prior appt etc)
  is_new_referral: boolean,                // for router
  has_insurance_info: boolean              // for router
}
```

**Why structured output:** Anthropic tool-use with `tool_choice: { type: "tool", name: "submit_triage" }` forces the model to return valid JSON matching our `input_schema`. No regex parsing, no JSON repair.

**Prompt-cache:** the system prompt is the same across all 8 items — mark it `cache_control: { type: "ephemeral" }` to cut latency/cost after the first item.

---

## 5. Routing rules (deterministic, post-extraction)

| `classification` | Tools called (in order) | Notes |
|---|---|---|
| `safeguarding` | `lookup_policy(safeguarding)` → `escalate(P0, reason)` → `create_task(clinical_lead)` → `draft_message` (neutral acknowledgement only) | Urgency forced to P0 here regardless of LLM. |
| `scheduling` (same-day cancel/reschedule, existing patient implied) | `search_patient(name, dob?)` → `create_task(front_desk)` → `draft_message` | Urgency forced to P1 if the body mentions "today" / "this morning" / known same-day signal. |
| `new_referral` | `verify_insurance(payer, member_id)` → branch: <br>• **in_network/medicaid:** `find_slots(discipline, language)` → `hold_slot` (only if a slot exists and intake is complete) → `create_task(intake)` → `draft_message` <br>• **out_of_network / expired:** `lookup_policy(insurance)` → `create_task(billing)` → `draft_message` (no hold) <br>• **unknown payer / no payer:** skip `find_slots`/`hold_slot`, `create_task(intake)` to gather info, `draft_message` requesting payer | `verify_insurance` skipped if no payer field present. |
| `clinical_question` | `lookup_policy(clinical_advice)` → `create_task(intake)` → `draft_message` (acknowledge, offer screening; no clinical advice) | |
| `missing_paperwork` | `create_task(intake)` → `draft_message` (to referring provider/parent requesting the missing fields) | Skip `verify_insurance` even if a partial payer string exists — too thin. |
| `existing_patient_request` (non-scheduling) | `search_patient` → `create_task(front_desk)` → `draft_message` | |
| `provider_followup` / `complaint` | `create_task(clinical_lead or front_desk)` → `draft_message` | |
| `spam` / `other` (FYI) | `create_task(front_desk)` only (or none if truly trivial) | `draft_reply` can be `null`. |

**Cross-cutting rules:**

- **Language access:** if `language === "es"`, pass `language: "es"` to `draft_message` and call `find_slots({ language: "es" })`. If `classification` is `new_referral`, also call `lookup_policy("language_access")`.
- **`hold_slot` discipline:** only invoke when we have a clean in-network referral *and* `find_slots` returned ≥1 slot *and* discipline + age are confirmed. Otherwise skip — over-holding is a flagged anti-pattern.
- **`search_patient` discipline:** only when the item *implies* an existing patient (mentions prior appointment, "my child's therapist", reschedule of "today's", DOB+name pattern suggests existing). Not on every new referral.
- **Escalation:** populated **only** when `classification === "safeguarding"` (P0) or when the LLM/rules promote a true P1 incident requiring same-hour attention. Most P1 scheduling items do NOT need a separate escalation object — task + draft is enough.

---

## 6. Urgency reconciliation

After the LLM proposes `urgency`, code applies overrides:

1. If `classification === "safeguarding"` → force `P0`.
2. If body contains same-day signal regex (`/\btoday\b/i`, `/this (morning|afternoon)/i`) AND classification is `scheduling` → force `P1`.
3. Otherwise trust LLM but clamp to `P2` if it picked P0/P1 without a documented reason in `decision_rationale`.

This implements the README's "over-escalation is a production failure mode" guardrail.

---

## 7. Graceful degradation (no API key)

`llm/client.ts` checks `process.env.ANTHROPIC_API_KEY` once at module load. If absent:

- Log one warning line: `"ANTHROPIC_API_KEY not set — running rules-only fallback."`
- `extract()` calls a rules-based extractor instead:
  - Regex out child name, DOB, phone, email from body.
  - Detect payer by scanning for known names (Aetna, BCBS, Kaiser, Medicaid, etc.).
  - Detect discipline from keywords (SLP/speech, OT/occupational/sensory, PT/physical/walking).
  - Classify by keyword: abuse-words → safeguarding; "today" + "reschedule" → scheduling; "?" + ("normal" | "should I" | "is it") → clinical_question; "[blank]" / repeated empty fields → missing_paperwork; Spanish characters/keywords → flag language.
  - Default classification: `new_referral`.
  - Urgency: P0 for safeguarding, P1 for same-day, else P2.
  - `draft_reply_text`: short canned template per classification.

The output will be valid and pass the validator; quality will be lower but reviewers will see a working pipeline.

---

## 8. Trace + output assembly

After the handler finishes, `buildItemOutput(item, extraction, handlerResult)` does:

```ts
const tools_called = getToolCallsForItem(item.id);   // unchanged pass-through
return {
  item_id: item.id,
  classification: extraction.classification,
  urgency: reconcileUrgency(extraction, item),
  requires_human_review: true,                        // always true (validator demand)
  extracted_intake: extraction.extracted_intake,
  missing_info: extraction.missing_info,
  tools_called,
  recommended_next_action: handlerResult.recommended_next_action,
  draft_reply: handlerResult.draft_reply,             // null OK for spam
  task_ids: handlerResult.task_ids,
  escalation: handlerResult.escalation,               // null unless P0/P1 incident
  decision_rationale: extraction.decision_rationale,
};
```

Then `src/index.ts` (unchanged) calls `buildBatchOutput(items)` and writes `output.json`.

**Trace correctness invariants:**

- Every tool call is made inside `withItemContext(item.id, ...)`.
- No tool call is made outside an item context (would throw).
- No call is made twice "for retry" without using the `audit_exempt` mechanism — and we won't use retries in MVP, so no exempt entries appear.
- `tools_called` is taken from `getToolCallsForItem(item.id)` unmodified — no editing args or summaries.

---

## 9. Error handling

- LLM call fails (network, 5xx, JSON-parse despite forced tool use) → fall back to rules extractor for that item; log once.
- Item handler throws → catch, produce a minimal valid `ItemOutput` with `classification: "other"`, `urgency: "P2"`, `requires_human_review: true`, empty `tools_called`, `decision_rationale: "Internal error during processing — needs manual review."`, and a `create_task(front_desk)` call wrapping the failure note. Never let one bad item crash the batch.
- Anthropic SDK or `ulid` missing at import time → top-level catch in `index.ts` already surfaces it via `process.exitCode = 1`.

---

## 10. Concurrency

`Promise.all(inbox.map(item => withItemContext(item.id, () => processItem(item))))`.

- `AsyncLocalStorage` preserves per-item context through `await` boundaries → tool calls correctly tagged.
- `appendFileSync` to the trace file serializes via the OS — no torn lines.
- 8 concurrent Anthropic requests is well under rate limits.

---

## 11. Out of scope (cut from MVP)

| Cut | Reason |
|---|---|
| Unit tests | The validator IS the test. Time better spent on correctness. |
| Retry / backoff on LLM failures | Rules fallback covers it; one shot is enough. |
| Multi-turn LLM tool calling | Adds complexity; routing decisions are deterministic. |
| Per-item LLM-generated draft variants / tone tuning | One-shot prompt is enough for MVP draft quality. |
| Caching of identical items | n=8, no benefit. |
| Streaming output | Batch run, no UX benefit. |
| Provider preference matching beyond language | `find_slots` already filters; no ranking layer needed. |
| Detailed Spanish translation of policy snippets | Drafts are LLM-generated in target language; policy lookups stay English. |

---

## 12. README updates (15% of rubric)

Add sections per README requirement:

1. **How to run** — keep starter commands; note `ANTHROPIC_API_KEY` env var + graceful fallback.
2. **Stack and runtime** — Node LTS, TypeScript, `@anthropic-ai/sdk`, model `claude-haiku-4-5`, npm.
3. **Architecture** — copy a compact version of §3 diagram + §5 routing table.
4. **Failure modes and production eval** — list: LLM hallucination on extraction → mitigated by structured output + rules fallback; over-escalation → mitigated by urgency reconciliation; trace drift → impossible by construction (we never mutate trace entries); hidden-variant edge cases.
5. **What I chose not to build, and why** — copy §11.
6. **What I would do with another 4 hours** — proper test fixtures with golden outputs; LLM-judge eval harness; per-classification prompt regression tests; richer Spanish drafts with cultural context; provider-preference ranking; structured logging.

---

## 13. Files I will create / modify

**Modify:**

- `src/agent.ts` — implement `runAgent`.
- `README.md` — add the six required sections.
- `package.json` — add `@anthropic-ai/sdk` dep.

**Create:**

- `src/llm/client.ts`
- `src/llm/extract.ts`
- `src/llm/prompts.ts`
- `src/triage/classify.ts` (rules fallback)
- `src/triage/router.ts`
- `src/triage/handlers/*.ts` (one per classification family)
- `src/triage/buildItemOutput.ts`
- `src/util/log.ts`

**Do not touch:**

- `src/index.ts`, `src/tools.ts`, `src/types.ts`, `src/validate.ts`, `schema/`, `data/`.

---

## 14. Acceptance criteria

- `npm run triage` completes in under ~60s for 8 items (parallel + Haiku).
- `npm run validate` exits 0.
- Across the batch ≥3 distinct tool names appear; tools are used substantively (not just to clear the threshold).
- Item 2 (Leo / abuse signal) classified `safeguarding`, urgency `P0`, has an escalation object, draft reply is a neutral acknowledgement only.
- Item 5 (R sounds) classified `clinical_question`, draft does not give clinical advice.
- Item 7 (Ana / Spanish) draft reply is in Spanish, `find_slots` called with `language: "es"`.
- Item 8 (Anita Patel / same-day reschedule) classified `scheduling`, urgency `P1`, `search_patient` called.
- Item 3 (Kaiser / OON) does not hold a slot, routes to billing.
- Item 6 (blank fields) classified `missing_paperwork`, lists missing fields concretely.
- With `ANTHROPIC_API_KEY` unset, `npm run triage` still produces a valid (lower-quality) output.
