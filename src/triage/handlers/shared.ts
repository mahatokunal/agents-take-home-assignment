import type { InboxItem } from "../../types.js";
import type { ExtractionResult } from "../../llm/extract.js";

export function dueIso(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export function resolveRecipient(item: InboxItem): {
  recipient: string;
  channel: "portal" | "email" | "phone";
} {
  if (item.channel === "portal_message")
    return { recipient: item.sender, channel: "portal" };
  if (item.channel === "voicemail_transcript")
    return { recipient: extractPhone(item) || item.sender, channel: "phone" };
  if (item.channel === "fax_referral")
    return { recipient: item.sender, channel: "email" };
  return { recipient: extractEmail(item) || item.sender, channel: "email" };
}

export function extractPhone(item: InboxItem): string | null {
  const match = item.body.match(/\b(\d{3}[-.\s]\d{3,4}[-.\s]?\d{0,4})\b/);
  return match ? match[1] : null;
}

export function extractEmail(item: InboxItem): string | null {
  const match = item.body.match(/\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/);
  if (match) return match[1];
  const fromHeader = item.sender.match(/<([\w.+-]+@[\w-]+\.[\w.-]+)>/);
  return fromHeader ? fromHeader[1] : null;
}

export function childLabel(extraction: ExtractionResult): string {
  return extraction.extracted_intake.child_name || "the patient";
}
