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
