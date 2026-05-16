import { create_task } from "../../tools.js";
import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { dueIso } from "./shared.js";

export async function handleSpamOrOther(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const task = await create_task({
    assignee: "front_desk",
    title: `Review low-priority inbox item ${item.id}`,
    due: dueIso(3),
    notes: `Classification: ${extraction.classification}. Subject: ${item.subject}.`,
  });

  return {
    task_ids: [task.data.task_id],
    escalation: null,
    recommended_next_action:
      "Front desk can dispose of this item; no further action required.",
    draft_reply: extraction.classification === "spam" ? null : extraction.draft_reply_text,
  };
}
