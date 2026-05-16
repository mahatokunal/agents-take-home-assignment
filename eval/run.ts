import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BatchOutput, ItemOutput } from "../src/types.js";

interface Expectation {
  item_id: string;
  summary: string;
  classification: string;
  urgency_in: string[];
  required_tools?: string[];
  forbidden_tools?: string[];
  escalation_required?: boolean;
  missing_info_must_be_empty_or_minor?: boolean;
  missing_info_must_include_any_of?: string[][];
  draft_must_contain_any_of?: string[];
  draft_must_not_contain?: string[];
}

interface ExpectationsFile {
  items: Expectation[];
}

interface Failure {
  itemId: string;
  check: string;
  detail: string;
}

interface CheckResult {
  itemId: string;
  summary: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

const useColor =
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

function color(text: string, key: keyof typeof COLORS): string {
  if (!useColor) return text;
  return `${COLORS[key]}${text}${COLORS.reset}`;
}

function parseArgs(argv: string[]): { output: string; expectations: string } {
  const args = { output: "output.json", expectations: "eval/expectations.json" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--output") {
      args.output = value;
      i += 1;
    } else if (flag === "--expectations") {
      args.expectations = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function evalItem(item: ItemOutput, expect: Expectation): CheckResult {
  const checks: CheckResult["checks"] = [];
  const calledTools = new Set(item.tools_called.map((c) => c.name));
  const draft = (item.draft_reply || "").toLowerCase();

  // 1. classification
  checks.push({
    name: "classification",
    passed: item.classification === expect.classification,
    detail: `got "${item.classification}", expected "${expect.classification}"`,
  });

  // 2. urgency
  checks.push({
    name: "urgency",
    passed: expect.urgency_in.includes(item.urgency),
    detail: `got "${item.urgency}", expected one of [${expect.urgency_in.join(", ")}]`,
  });

  // 3. required tools
  if (expect.required_tools && expect.required_tools.length > 0) {
    const missing = expect.required_tools.filter((t) => !calledTools.has(t));
    checks.push({
      name: "required tools",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `all ${expect.required_tools.length} present`
          : `missing: ${missing.join(", ")}`,
    });
  }

  // 4. forbidden tools
  if (expect.forbidden_tools && expect.forbidden_tools.length > 0) {
    const found = expect.forbidden_tools.filter((t) => calledTools.has(t));
    checks.push({
      name: "forbidden tools",
      passed: found.length === 0,
      detail: found.length === 0 ? "none called" : `forbidden tool called: ${found.join(", ")}`,
    });
  }

  // 5. escalation
  if (expect.escalation_required !== undefined) {
    const hasEscalation = item.escalation !== null;
    checks.push({
      name: "escalation",
      passed: hasEscalation === expect.escalation_required,
      detail: expect.escalation_required
        ? hasEscalation
          ? `present (severity ${item.escalation?.severity})`
          : "expected escalation object, got null"
        : hasEscalation
          ? `unexpected escalation object (severity ${item.escalation?.severity})`
          : "absent as expected",
    });
  }

  // 6. missing_info content
  if (expect.missing_info_must_include_any_of) {
    const lowered = item.missing_info.map((m) => m.toLowerCase());
    const unmatchedGroups: string[] = [];
    for (const group of expect.missing_info_must_include_any_of) {
      const matched = group.some((needle) =>
        lowered.some((m) => m.includes(needle.toLowerCase())),
      );
      if (!matched) unmatchedGroups.push(`[${group.join("|")}]`);
    }
    checks.push({
      name: "missing_info",
      passed: unmatchedGroups.length === 0,
      detail:
        unmatchedGroups.length === 0
          ? `mentions all expected categories`
          : `missing references to: ${unmatchedGroups.join(", ")}`,
    });
  }
  if (expect.missing_info_must_be_empty_or_minor) {
    checks.push({
      name: "missing_info minimality",
      passed: item.missing_info.length <= 2,
      detail: `${item.missing_info.length} entries (allowed ≤2 for clean intake)`,
    });
  }

  // 7. draft contains
  if (expect.draft_must_contain_any_of && expect.draft_must_contain_any_of.length > 0) {
    const lower = expect.draft_must_contain_any_of.map((s) => s.toLowerCase());
    const matched = lower.some((needle) => draft.includes(needle));
    checks.push({
      name: "draft language",
      passed: matched,
      detail: matched
        ? `contains at least one of [${expect.draft_must_contain_any_of.slice(0, 3).join(", ")}...]`
        : `expected any of [${expect.draft_must_contain_any_of.join(", ")}] but draft has none`,
    });
  }

  // 8. draft does NOT contain
  if (expect.draft_must_not_contain && expect.draft_must_not_contain.length > 0) {
    const hits = expect.draft_must_not_contain.filter((needle) =>
      draft.includes(needle.toLowerCase()),
    );
    checks.push({
      name: "draft safety",
      passed: hits.length === 0,
      detail:
        hits.length === 0
          ? `none of the forbidden phrases appear`
          : `contains forbidden phrase(s): ${hits.join(", ")}`,
    });
  }

  return {
    itemId: item.item_id,
    summary: expect.summary,
    passed: checks.every((c) => c.passed),
    checks,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const expectations = JSON.parse(
    readFileSync(resolve(cwd, args.expectations), "utf8"),
  ) as ExpectationsFile;
  const output = JSON.parse(
    readFileSync(resolve(cwd, args.output), "utf8"),
  ) as BatchOutput;

  const outById = new Map(output.items.map((i) => [i.item_id, i]));
  const results: CheckResult[] = [];
  const failures: Failure[] = [];

  console.log(color("Semantic evaluation", "bold"));
  console.log(
    color(
      `  output:       ${args.output}\n  expectations: ${args.expectations}\n`,
      "dim",
    ),
  );

  for (const expect of expectations.items) {
    const item = outById.get(expect.item_id);
    if (!item) {
      console.log(
        color(`✗ ${expect.item_id}`, "red"),
        "—",
        `missing from output`,
      );
      failures.push({
        itemId: expect.item_id,
        check: "presence",
        detail: "no matching item in output",
      });
      continue;
    }

    const result = evalItem(item, expect);
    results.push(result);

    const mark = result.passed ? color("✓", "green") : color("✗", "red");
    const passCount = result.checks.filter((c) => c.passed).length;
    console.log(
      `${mark} ${color(expect.item_id, "bold")} ${color(`(${passCount}/${result.checks.length})`, "dim")} — ${expect.summary}`,
    );
    for (const check of result.checks) {
      const sub = check.passed ? color("  ✓", "green") : color("  ✗", "red");
      const detail = check.passed
        ? color(check.detail, "dim")
        : color(check.detail, "yellow");
      console.log(`${sub} ${color(check.name, "cyan")}: ${detail}`);
      if (!check.passed) {
        failures.push({
          itemId: expect.item_id,
          check: check.name,
          detail: check.detail,
        });
      }
    }
  }

  const totalChecks = results.reduce((acc, r) => acc + r.checks.length, 0);
  const passedChecks = results.reduce(
    (acc, r) => acc + r.checks.filter((c) => c.passed).length,
    0,
  );
  const passedItems = results.filter((r) => r.passed).length;

  console.log("");
  console.log(color("Summary", "bold"));
  console.log(
    `  items:  ${passedItems}/${results.length} passed`,
  );
  console.log(
    `  checks: ${passedChecks}/${totalChecks} passed`,
  );

  if (failures.length === 0) {
    console.log(color("\nSemantic eval passed.", "green"));
    process.exit(0);
  } else {
    console.log(color(`\nSemantic eval FAILED — ${failures.length} check(s) failed.`, "red"));
    process.exit(1);
  }
}

main();
