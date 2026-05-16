import { create_task, draft_message, search_patient } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleExistingPatient(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const intake = extraction.extracted_intake;
  const dob = intake.dob_or_age && /^\d{4}-\d{2}-\d{2}$/.test(intake.dob_or_age)
    ? intake.dob_or_age
    : undefined;

  await search_patient({
    name: intake.child_name || undefined,
    dob,
  });

  const task = await create_task({
    assignee: "front_desk",
    title: `Follow up with established family: ${childLabel(extraction)}`,
    due: dueIso(1),
    notes: `Existing family inquiry. Source item: ${item.id}.`,
  });

  const { recipient, channel } = resolveRecipient(item);
  const body =
    extraction.draft_reply_text ||
    `Thanks for reaching out. A team member will follow up on your request shortly.`;
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
      "Front desk should respond and route the request to the right team based on its content.",
    draft_reply: body,
  };
}
