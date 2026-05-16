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
