import type {
  Classification,
  ExtractedIntake,
  InboxItem,
  Urgency,
} from "../types.js";

export interface ExtractionResult {
  classification: Classification;
  urgency: Urgency;
  extracted_intake: ExtractedIntake;
  missing_info: string[];
  language: "en" | "es";
  draft_reply_text: string | null;
  recommended_next_action: string;
  decision_rationale: string;
  escalation_reason: string | null;
  is_existing_patient_signal: boolean;
  is_new_referral: boolean;
  has_insurance_info: boolean;
}

// JSON Schema for the forced tool-use call. Mirrors ExtractionResult.
export const EXTRACTION_TOOL_SCHEMA = {
  name: "submit_triage",
  description:
    "Submit the triage decision for the inbox item. You MUST call this exactly once.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "classification",
      "urgency",
      "extracted_intake",
      "missing_info",
      "language",
      "draft_reply_text",
      "recommended_next_action",
      "decision_rationale",
      "escalation_reason",
      "is_existing_patient_signal",
      "is_new_referral",
      "has_insurance_info",
    ],
    properties: {
      classification: {
        type: "string",
        enum: [
          "new_referral",
          "existing_patient_request",
          "scheduling",
          "clinical_question",
          "billing_question",
          "missing_paperwork",
          "provider_followup",
          "complaint",
          "safeguarding",
          "spam",
          "other",
        ],
      },
      urgency: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
      extracted_intake: {
        type: "object",
        additionalProperties: false,
        required: [
          "child_name",
          "dob_or_age",
          "parent_contact",
          "discipline",
          "diagnosis_or_concern",
          "payer",
          "member_id",
        ],
        properties: {
          child_name: { type: ["string", "null"] },
          dob_or_age: { type: ["string", "null"] },
          parent_contact: { type: ["string", "null"] },
          discipline: {
            oneOf: [
              { type: "null" },
              {
                type: "array",
                items: { type: "string", enum: ["SLP", "OT", "PT"] },
                minItems: 1,
                uniqueItems: true,
              },
            ],
          },
          diagnosis_or_concern: { type: ["string", "null"] },
          payer: { type: ["string", "null"] },
          member_id: { type: ["string", "null"] },
        },
      },
      missing_info: { type: "array", items: { type: "string" } },
      language: { type: "string", enum: ["en", "es"] },
      draft_reply_text: { type: ["string", "null"] },
      recommended_next_action: { type: "string", minLength: 1 },
      decision_rationale: { type: "string", minLength: 1 },
      escalation_reason: { type: ["string", "null"] },
      is_existing_patient_signal: { type: "boolean" },
      is_new_referral: { type: "boolean" },
      has_insurance_info: { type: "boolean" },
    },
  },
} as const;

// Stub — real implementation lands in Task 6.
export async function extractWithLLM(
  _item: InboxItem,
): Promise<ExtractionResult | null> {
  return null;
}
