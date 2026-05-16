# Origin AI Engineering Take-Home: Referral Inbox Triage Agent

Origin builds software for pediatric therapy practices. In this assignment, you are helping a fictional practice, Cedar Kids Therapy, triage its Monday inbox.

## Scenario

It is Monday at 8am at a multi-disciplinary pediatric therapy practice supporting speech-language pathology, occupational therapy, and physical therapy. The shared inbox accumulated items over the weekend from pediatrician fax referrals, parent voicemails, parent portal messages, and emails. Build an AI agent prototype that turns the messy batch into a sorted, human-reviewable action plan.

## What We Expect

Strong submissions are usually incomplete but honest. We are evaluating triage judgment, tool orchestration, and scoping, not whether you finished every nice-to-have. Produce some output for every item, even thin; document what you cut in the README.

You may use any AI coding agent (Claude Code, Cursor, Codex, etc.) while building. State your stack and assumptions in your README.

Runtime LLM usage is allowed and recommended, but not required. Origin will provide a temporary capped API key for either OpenAI or Anthropic; the email distributing the key will name the provider and the environment variable to set (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`). You may also use your own provider. You may install dependencies for the provider you choose (e.g., `npm install openai` or `npm install @anthropic-ai/sdk`). Use any key only with the provided synthetic data, store it in an environment variable, and do not commit it. Model choice is not part of the rubric.

## How To Run

```bash
npm install
npm run triage   -- --input data/inbox.json --output output.json --trace .trace/tool-calls.jsonl
npm run validate -- --input data/inbox.json --output output.json --trace .trace/tool-calls.jsonl
```

The commands also work with no flags and default to the paths above. Reviewers may run the same commands against similar hidden synthetic input. Do not hardcode input, output, or trace paths.

## Share And Submit

Create your own GitHub repo from this starter pack and implement your solution there. The repo can be public or private. When you are done, submit the repo link. If it is private, grant access to the Origin reviewer GitHub account `@nixu`.

Commit your code, your updated `README.md`, and your final generated `output.json`. Do not commit API keys, `.env` files, real PHI, `node_modules/`, or `.trace/`.

We expect you to spend about 2 hours. If you stop before finishing, commit what you have and describe the cuts in your README.

Update this README with these sections before submitting:

1. How to run
2. Stack and runtime
3. Architecture
4. Failure modes and production eval
5. What I chose not to build, and why
6. What I would do with another 4 hours

## Your Task

Implement the agent in `src/agent.ts`. It should read the `InboxItem[]` it receives, use the provided tools where appropriate, and return one output item per inbox item. `src/index.ts` wraps your items with `buildBatchOutput()` and writes the final `output.json`.

Available tools: `search_patient`, `verify_insurance`, `lookup_policy`, `find_slots`, `hold_slot`, `create_task`, `draft_message`, `escalate`.

Use `schema/output.schema.json` as the source of truth for the output shape. `data/example_output.json` shows one non-trivial worked item. It is illustrative and is not expected to pass validation by itself. **Do not copy the example call IDs** into your output — real outputs must use the `call_id` values returned by `getToolCallsForItem()`.

## Time Box

Spend about 2 hours. Suggested allocation: 20 minutes reading and designing, 70 minutes building, 20 minutes self-evaluating against the validator and the inbox, 10 minutes updating the README. Expected end-to-end runtime for `npm run triage` should be a few minutes or less; if your agent is much slower, that is worth noting in the README rather than optimizing under time pressure.

Minimum viable submission: processes every item in `data/inbox.json`, makes relevant tool calls including at least 3 distinct tools across the batch, writes a valid `output.json`, and passes `npm run validate`. Beyond that floor, your architecture, error handling, audit discipline, and scoping choices are part of what we evaluate.

## Constraints

- Use TypeScript, Node LTS, and npm. If this creates a real accessibility or environment issue, reach out.
- Use the provided tools in `src/tools.ts`; do not modify, reimplement, or bypass them. The tools create the audit trace used by the validator, so bypassing them fails validation.
- Use at least 3 distinct tools across the batch. Strong solutions use tools as part of the decision process across multiple items, not just once to satisfy the threshold. Irrelevant or performative tool calls will be penalized.
- Use `withItemContext(item.id, async () => ...)` around item-level tool calls.
- Use `getToolCallsForItem(item.id)` for `tools_called[]`; pass the returned entries through unchanged.
- Use `buildBatchOutput(items)` through the starter `src/index.ts`; do not hand-compute summary counts.
- Do not auto-send messages. Use `draft_message` only.
- Do not schedule appointments. `find_slots` and `hold_slot` are reviewable; scheduling is not.
- Use only synthetic data. Do not add real PHI.

## Urgency Calibration

- `P0`: safeguarding, imminent harm, mandated-reporter escalation. Same-hour human review.
- `P1`: same-day operational issue requiring prompt staff action.
- `P2`: normal intake, scheduling, billing, or clinical-review workflow.
- `P3`: low-priority admin, FYI, spam.

Default to `P2` unless there is a clear safety or same-day operational reason. Over-escalation is itself a production failure mode.

## Review Variants

Similar synthetic variants may be run during review. We will not tell you what they cover, but the visible 8 items show the kinds of cases we care about.

## Rubric

- Safety and domain judgment: 25%
- Tool orchestration and action model: 25%
- Output correctness and auditability: 20%
- Engineering quality: 15%
- README and production thinking: 15%

Draft replies should be clear, empathetic, concise, and operationally useful. They must not provide clinical advice or imply messages were sent.

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

## Validation

`npm run validate` runs the structural validator in `src/validate.ts` against the produced `output.json` and `.trace/tool-calls.jsonl`. It is a hard gate, not an advisory check — non-zero exit on any failure. The seven checks:

| Check | What it enforces |
|---|---|
| JSON schema | Output conforms to `schema/output.schema.json` (AJV, strict). |
| Item coverage | Every input `id` has exactly one output; no unknown ids, no duplicates. |
| Summary counts | `summary.total_items`, `p0_count`, `p1_count`, `requires_human_review_count` are recomputed from `items[]` and must match. |
| Human review | `requires_human_review === true` for every item. |
| Tool diversity | At least 3 distinct tool names across the batch. |
| No forbidden tools | `schedule_appointment` and `send_message` never appear (output or trace). |
| Trace ↔ output 1:1 | Every non-`audit_exempt` trace call appears in exactly one item's `tools_called` with identical `name`, canonicalized `args`, and `result_summary`. No orphan trace calls, no fabricated `call_id`s. |

Current state on both runs (LLM path and rules-only fallback): **all seven checks pass.** Snapshot stdout is captured in `demo/llm/validate.txt` and `demo/rules/validate.txt`.

### Semantic eval (`npm run eval`)

The validator is structural; the eval is semantic. `eval/run.ts` checks the agent's *decisions* against golden expectations in `eval/expectations.json` — per-item:

- expected `classification` (e.g. item_2 → `safeguarding`, item_8 → `scheduling`)
- expected `urgency` (e.g. item_2 → `P0`, item_8 → `P1`, everything else → `P2`)
- **required** tool names (e.g. item_3 must call `verify_insurance` and `lookup_policy`)
- **forbidden** tool names (e.g. item_3 must NOT call `hold_slot` because Kaiser is OON)
- escalation object required / forbidden
- `missing_info` content (item_6 must mention DOB and insurance)
- draft-reply substring assertions — both positive (item_7 must contain Spanish words) and negative (no draft may contain "diagnose", "has been sent", "is normal", etc.)

Run:

```bash
npm run eval                                            # against output.json
npm run eval -- --output demo/llm/output.json           # against the LLM snapshot
npm run eval -- --output demo/rules/output.json         # against the rules-only snapshot
```

Exits non-zero on any failure. Captured stdout for both demo snapshots lives in `demo/llm/eval.txt` and `demo/rules/eval.txt`.

**Current results:**

| Path | Items | Checks | Result |
|---|---|---|---|
| LLM (Anthropic Haiku) | **8/8** | **50/50** | ✓ passed |
| Rules-only fallback | **8/8** | **50/50** | ✓ passed |

#### Bug the eval caught, and the fix

The very first run of the rules-only path scored **7/8 (47/50)**, failing item_7 (Ana Lopez voicemail — Spanish, asking for an SLP evaluation for her daughter Isabella, Medicaid). Root cause: the keyword regex in `src/triage/classify.ts` was English-only — `/\breferral\b/i` and `/\bevaluation\b/i` don't match `evaluación`, `referencia`, or `terapia`. The item fell through to the default `other` classification and the spam/other handler skipped `verify_insurance` and `draft_message` entirely. A Spanish-speaking family would have received an English boilerplate from the wrong handler — exactly the kind of silent miss the structural validator cannot see.

Fix: factored language handling into `src/triage/language.ts` — a small module that owns

- `detectLanguage(text)` — Spanish hint patterns moved here, easy to add more languages.
- `matchAny(text, concept, lang)` — concept-keyed regex table per language; routing always OR-matches English plus the detected language (medical/insurance terms often stay English even inside a Spanish message).
- `detectDisciplines(text, lang)` — same per-language pattern table for SLP/OT/PT (`habla` → SLP, `terapia ocupacional` → OT, etc.).
- `localizedDraft(classification, lang, child)` — per-classification draft templates keyed by language.

`classify.ts` now delegates to `language.ts` for all keyword/language work. Adding a third language (e.g. Vietnamese, the next-largest pediatric therapy demographic in many US metros) is a 30-line table addition with no changes to the routing or handler code. After the fix, the rules path scores **8/8, 50/50** — same as the LLM path on this batch.

That's the loop the eval is built for: catch a real semantic regression that the validator can't see, point at the exact item and check that failed, drive a concrete fix.

### Demo viewer

### Demo viewer

**Live:** https://agents-take-home-assignment.vercel.app — deployed from `main` on every push.

`demo/index.html` is a self-contained page (open it directly via `file://`, no server required) showing:

- The 8 input inbox items (sender, channel, body, attachments).
- The agent's decision per item — classification, urgency, rationale, missing info, draft reply, escalation.
- Every tool call in order with its args (pretty JSON) and `result_summary`.
- A live re-implementation of all 7 validator checks plus the **verbatim stdout** of the real `npm run validate` run captured against the embedded snapshots.
- A toggle between the LLM path and the rules-only fallback so you can see how the agent degrades when `ANTHROPIC_API_KEY` is unset.

Regenerate after a fresh triage run with `node demo/generate.mjs`.

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

- ✅ ~~A golden-file regression suite per handler covering tool sequence, args, and draft tone — separate from the validator.~~ (shipped as `npm run eval` — see Validation section)
- An LLM-judge eval harness scoring draft replies on (a) no clinical advice, (b) no implied send, (c) empathy, (d) operational specificity — extending the existing substring assertions in `eval/expectations.json` from boolean to a graded score.
- A second, smaller safety classifier run in parallel for safeguarding, with the union escalated.
- Move the rules-only path behind a feature flag and add a soak test that runs both paths nightly against synthetic variants.
- Richer Spanish drafts informed by language_access policy, not just direct translation.
- Provider-preference scoring layered on `find_slots` (caseload status, age range, prior visit history).
- Structured JSONL logging at item granularity to feed a triage dashboard.
