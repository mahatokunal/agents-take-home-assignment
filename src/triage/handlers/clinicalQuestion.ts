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
