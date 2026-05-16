import {
  create_task,
  draft_message,
  find_slots,
  hold_slot,
  lookup_policy,
  verify_insurance,
} from "../../tools.js";
import type { Discipline, InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";
import type { HandlerResult } from "../buildItemOutput.js";
import { childLabel, dueIso, resolveRecipient } from "./shared.js";

export async function handleNewReferral(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  const intake = extraction.extracted_intake;
  const task_ids: string[] = [];
  let recommended_next_action = "";
  let draftBody =
    extraction.draft_reply_text ||
    `Thanks for sending ${childLabel(extraction)}'s referral. Our intake team will follow up shortly.`;

  if (extraction.language === "es") {
    await lookup_policy({ topic: "language_access" });
  }

  // 1. Insurance verification (only if we have something to verify).
  let insuranceStatus: "in_network" | "out_of_network" | "expired" | "unknown" | "skipped" =
    "skipped";
  if (intake.payer) {
    const verified = await verify_insurance({
      payer: intake.payer,
      member_id: intake.member_id || undefined,
    });
    insuranceStatus = verified.data.status;
  }

  // 2. Branch on insurance result.
  if (insuranceStatus === "out_of_network" || insuranceStatus === "expired") {
    await lookup_policy({ topic: "insurance" });
    const billingTask = await create_task({
      assignee: "billing",
      title: `Discuss ${insuranceStatus === "expired" ? "expired" : "out-of-network"} coverage for ${childLabel(extraction)}`,
      due: dueIso(2),
      notes: `Insurance verification returned ${insuranceStatus} for ${intake.payer}. Per policy, do not hold a slot before benefits conversation. Source item: ${item.id}.`,
    });
    task_ids.push(billingTask.data.task_id);
    recommended_next_action = `Billing should call the family to discuss ${insuranceStatus === "expired" ? "the expired coverage on file" : "out-of-network options"} before any scheduling step.`;
    draftBody = composeBenefitsDraft(extraction, insuranceStatus, intake.payer ?? "the payer on file");
  } else if (insuranceStatus === "in_network") {
    const discipline = intake.discipline?.[0] as Discipline | undefined;
    const slots = await find_slots({
      discipline,
      language: extraction.language,
    });
    const slotsArr = slots.data || [];
    const intakeTask = await create_task({
      assignee: "intake",
      title: `Schedule evaluation for ${childLabel(extraction)} (${discipline ?? "discipline TBD"})`,
      due: dueIso(2),
      notes: `In-network ${intake.payer}; ${slotsArr.length} matching slots available. Source item: ${item.id}.`,
    });
    task_ids.push(intakeTask.data.task_id);
    if (slotsArr.length > 0 && discipline) {
      const slot = slotsArr[0];
      await hold_slot({
        slot_id: slot.slot_id,
        patient_ref: `${childLabel(extraction)} (DOB ${intake.dob_or_age ?? "unknown"})`,
      });
      recommended_next_action = `Intake should confirm ${slot.start} with ${slot.provider_name} for ${childLabel(extraction)} before releasing the hold.`;
    } else {
      recommended_next_action = `Intake should reach the family to schedule and gather any missing details; no slot was held.`;
    }
  } else {
    // unknown / skipped
    const intakeTask = await create_task({
      assignee: "intake",
      title: `Gather insurance details for ${childLabel(extraction)}`,
      due: dueIso(2),
      notes: `Insurance ${insuranceStatus === "skipped" ? "was not provided" : "was unrecognized"}; intake needs to follow up before scheduling. Source item: ${item.id}.`,
    });
    task_ids.push(intakeTask.data.task_id);
    recommended_next_action =
      "Intake should call the family to confirm insurance information before slot review.";
  }

  // 3. Draft message to family/referring source.
  const { recipient, channel } = resolveRecipient(item);
  await draft_message({
    recipient,
    channel,
    body: draftBody,
    language: extraction.language,
  });

  return {
    task_ids,
    escalation: null,
    recommended_next_action,
    draft_reply: draftBody,
  };
}

function composeBenefitsDraft(
  extraction: ExtractionResult,
  status: "out_of_network" | "expired",
  payer: string,
): string {
  const child = extraction.extracted_intake.child_name || "your child";
  if (extraction.language === "es") {
    return status === "expired"
      ? `Gracias por enviar la referencia de ${child}. Nuestro sistema indica que la cobertura de ${payer} aparece como vencida. Un miembro del equipo de facturación se comunicará para revisar las opciones antes de programar una cita.`
      : `Gracias por enviar la referencia de ${child}. La cobertura de ${payer} aparece como fuera de la red de Cedar Kids Therapy. Un miembro del equipo de facturación se comunicará para revisar las opciones antes de programar una cita.`;
  }
  return status === "expired"
    ? `Thanks for sending ${child}'s referral. Our billing system shows the ${payer} coverage on file is currently expired. A member of our billing team will follow up to review options before we schedule.`
    : `Thanks for sending ${child}'s referral. The ${payer} plan appears to be out of network for Cedar Kids Therapy, so our billing team needs to review options with you before we hold a slot.`;
}
