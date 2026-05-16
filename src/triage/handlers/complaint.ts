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
