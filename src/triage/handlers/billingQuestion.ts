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
