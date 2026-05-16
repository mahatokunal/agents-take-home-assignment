import {
  create_task,
  draft_message,
  getToolCallsForItem,
  lookup_policy,
  withItemContext,
} from "./tools.js";
import type { InboxItem, ItemOutput } from "./types.js";

export async function runAgent(inbox: InboxItem[]): Promise<ItemOutput[]> {
  return Promise.all(
    inbox.map((item) =>
      withItemContext(item.id, async () => processItemStub(item)),
    ),
  );
}

async function processItemStub(item: InboxItem): Promise<ItemOutput> {
  await lookup_policy({ topic: "service_lines" });
  const task = await create_task({
    assignee: "front_desk",
    title: `Review inbox item ${item.id}`,
    due: today(),
    notes: `Auto-stub: needs human triage. Subject: ${item.subject}`,
  });
  await draft_message({
    recipient: item.sender,
    channel: "email",
    body: "Thanks for your message. A team member will follow up shortly.",
    language: "en",
  });

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
    missing_info: ["stub — extraction not implemented yet"],
    tools_called: getToolCallsForItem(item.id),
    recommended_next_action: "Human review required (stub agent).",
    draft_reply:
      "Thanks for your message. A team member will follow up shortly.",
    task_ids: [task.data.task_id],
    escalation: null,
    decision_rationale: "Stub implementation: full triage logic not yet wired.",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
