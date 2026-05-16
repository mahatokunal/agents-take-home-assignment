import Anthropic from "@anthropic-ai/sdk";
import { warn } from "../util/log.js";

let cached: Anthropic | null | undefined;

export function getAnthropicClient(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    warn("ANTHROPIC_API_KEY not set — running rules-only fallback.");
    cached = null;
    return cached;
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
