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
