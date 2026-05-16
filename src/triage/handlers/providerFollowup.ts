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
