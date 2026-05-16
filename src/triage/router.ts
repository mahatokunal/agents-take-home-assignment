import type { InboxItem } from "../types.js";
import type { ExtractionResult } from "../llm/extract.js";
import type { HandlerResult } from "./buildItemOutput.js";
import { handleBillingQuestion } from "./handlers/billingQuestion.js";
import { handleClinicalQuestion } from "./handlers/clinicalQuestion.js";
import { handleComplaint } from "./handlers/complaint.js";
import { handleExistingPatient } from "./handlers/existingPatient.js";
import { handleMissingPaperwork } from "./handlers/missingPaperwork.js";
import { handleNewReferral } from "./handlers/newReferral.js";
import { handleProviderFollowup } from "./handlers/providerFollowup.js";
import { handleSafeguarding } from "./handlers/safeguarding.js";
import { handleScheduling } from "./handlers/scheduling.js";
import { handleSpamOrOther } from "./handlers/spamOrOther.js";

export async function routeAndHandle(
  item: InboxItem,
  extraction: ExtractionResult,
): Promise<HandlerResult> {
  switch (extraction.classification) {
    case "safeguarding":
      return handleSafeguarding(item, extraction);
    case "scheduling":
      return handleScheduling(item, extraction);
    case "new_referral":
      return handleNewReferral(item, extraction);
    case "existing_patient_request":
      return handleExistingPatient(item, extraction);
    case "clinical_question":
      return handleClinicalQuestion(item, extraction);
    case "missing_paperwork":
      return handleMissingPaperwork(item, extraction);
    case "billing_question":
      return handleBillingQuestion(item, extraction);
    case "provider_followup":
      return handleProviderFollowup(item, extraction);
    case "complaint":
      return handleComplaint(item, extraction);
    case "spam":
    case "other":
    default:
      return handleSpamOrOther(item, extraction);
  }
}
