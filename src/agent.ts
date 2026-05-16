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
