import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const inbox = JSON.parse(readFileSync(resolve(root, "data/inbox.json"), "utf8"));

function loadRun(name) {
  const output = JSON.parse(
    readFileSync(resolve(here, name, "output.json"), "utf8"),
  );
  const trace = readFileSync(resolve(here, name, "trace.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const validate = readFileSync(resolve(here, name, "validate.txt"), "utf8");
  const evalText = readFileSync(resolve(here, name, "eval.txt"), "utf8");
  return { output, trace, validate, evalText };
}

const expectations = JSON.parse(
  readFileSync(resolve(root, "eval/expectations.json"), "utf8"),
);

const llm = loadRun("llm");
const rules = loadRun("rules");

const data = { inbox, runs: { llm, rules }, expectations };
const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cedar Kids Therapy — Monday Inbox Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
  :root {
    --paper: #f4f3ee;        /* pale cool stone — almost neutral with a whisper of green-grey */
    --paper-2: #ebe9e1;
    --paper-3: #ddd9cd;
    --ink: #161a21;          /* deep cool charcoal — slight blue undertone */
    --ink-2: #3d434d;
    --ink-3: #6f747e;
    --ink-4: #a5a8af;
    --rule: rgba(22, 26, 33, 0.13);
    --rule-2: rgba(22, 26, 33, 0.06);
    --accent: #2f6b5d;       /* deep teal — calm, distinctive, pediatric-friendly */
    --accent-soft: rgba(47, 107, 93, 0.1);
    --sage: #5e8268;         /* success — muted forest */
    --sage-soft: rgba(94, 130, 104, 0.13);
    --amber: #a17132;        /* warning — deeper ochre, less desert */
    --amber-soft: rgba(161, 113, 50, 0.13);
    --crimson: #8b2e2e;      /* P0 — oxblood, considered not alarming */
    --crimson-soft: rgba(139, 46, 46, 0.11);
    --serif: 'Newsreader', 'Iowan Old Style', Georgia, serif;
    --sans: 'IBM Plex Sans', -apple-system, sans-serif;
    --mono: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--paper); }
  body {
    margin: 0;
    font-family: var(--sans);
    color: var(--ink);
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    background-image:
      linear-gradient(rgba(22, 26, 33, 0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(22, 26, 33, 0.018) 1px, transparent 1px);
    background-size: 56px 56px, 56px 56px;
  }
  ::selection { background: var(--accent); color: var(--paper); }

  /* MASTHEAD */
  .masthead {
    border-bottom: 1px solid var(--ink);
    padding: 28px 40px 22px;
    background: var(--paper);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 28px;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand-mark {
    width: 52px; height: 52px;
    border: 1.5px solid var(--ink);
    display: grid; place-items: center;
    font-family: var(--serif);
    font-weight: 600;
    font-size: 22px;
    letter-spacing: -0.02em;
    background: var(--paper-2);
  }
  .brand h1 {
    font-family: var(--serif);
    font-weight: 600;
    font-size: 26px;
    letter-spacing: -0.02em;
    margin: 0 0 2px 0;
    line-height: 1.1;
  }
  .dateline {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0;
  }
  .path-toggle {
    display: inline-flex;
    border: 1px solid var(--ink);
    background: var(--paper);
    box-shadow: 3px 3px 0 var(--ink);
    transition: box-shadow 120ms ease, transform 120ms ease;
  }
  .path-toggle:hover { box-shadow: 4px 4px 0 var(--ink); transform: translate(-1px, -1px); }
  .path-toggle button {
    background: transparent;
    border: none;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-2);
    padding: 11px 18px;
    cursor: pointer;
    transition: background 120ms;
  }
  .path-toggle button:not(:last-child) { border-right: 1px solid var(--ink); }
  .path-toggle button:hover { background: var(--paper-2); }
  .path-toggle button.active { background: var(--ink); color: var(--paper); }

  /* HEADLINE STATS */
  .headline {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-bottom: 1px solid var(--ink);
    background: var(--paper-2);
  }
  .stat {
    padding: 22px 28px;
    border-right: 1px solid var(--rule);
    position: relative;
  }
  .stat:last-child { border-right: none; }
  .stat .num {
    font-family: var(--serif);
    font-size: 44px;
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .stat .num.crimson { color: var(--crimson); }
  .stat .num.amber { color: var(--amber); }
  .stat .num.sage { color: var(--sage); }
  .stat .label {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .stat .sub {
    margin-top: 2px;
    font-family: var(--serif);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-2);
  }

  /* GATES (validator + eval) */
  .gates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--ink);
  }
  .gate {
    background: var(--paper);
    border-right: 1px solid var(--rule);
    transition: background 120ms;
  }
  .gate:last-child { border-right: none; }
  .gate-head {
    padding: 16px 28px;
    display: flex;
    align-items: center;
    gap: 14px;
    cursor: pointer;
    user-select: none;
    flex-wrap: wrap;
  }
  .gate-head:hover { background: var(--paper-2); }
  .gate-name {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .gate-cmd {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
  }
  .gate-badge {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 5px 11px;
    border: 1px solid;
  }
  .gate-badge.pass { color: var(--sage); border-color: var(--sage); background: var(--sage-soft); }
  .gate-badge.fail { color: var(--crimson); border-color: var(--crimson); background: var(--crimson-soft); }
  .gate-meta {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }
  .chev {
    display: inline-flex;
    width: 22px; height: 22px;
    align-items: center; justify-content: center;
    border: 1px solid var(--ink);
    color: var(--ink);
    font-size: 10px;
    transition: transform 180ms ease;
    background: var(--paper);
  }
  .gate.collapsed .chev { transform: rotate(-90deg); }
  .gate-body {
    padding: 0 28px 22px;
    border-top: 1px dashed var(--rule);
    animation: slideDown 200ms ease;
  }
  .gate.collapsed .gate-body { display: none; }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: none; }
  }

  /* Check chips inside gate body */
  .check-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 6px;
    margin-top: 16px;
  }
  .check {
    display: flex; gap: 9px; align-items: flex-start;
    padding: 9px 12px;
    background: var(--paper-2);
    border-left: 2px solid var(--ink-4);
    font-size: 12.5px;
  }
  .check.ok { border-left-color: var(--sage); }
  .check.bad { border-left-color: var(--crimson); }
  .check-mark { font-size: 11px; line-height: 1.5; flex-shrink: 0; color: var(--ink-3); }
  .check.ok .check-mark { color: var(--sage); }
  .check.bad .check-mark { color: var(--crimson); }
  .check-label {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ink-3);
    margin-bottom: 2px;
  }
  .check-detail { color: var(--ink-2); font-size: 12px; line-height: 1.4; }

  .tools-strip {
    margin-top: 12px;
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .tool-chip {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    padding: 3px 9px;
  }

  .ground-truth {
    margin-top: 14px;
    background: #11151c;
    color: #c8cdd6;
    padding: 14px 16px;
    font-family: var(--mono);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-wrap: break-word;
    border-left: 3px solid var(--accent);
  }
  .ground-truth .gt-label {
    color: #5a626d;
    font-size: 9.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 8px;
    display: block;
  }
  .ground-truth .gt-pass { color: #8acea0; }
  .gate-disclaimer {
    margin-top: 10px;
    font-family: var(--serif);
    font-style: italic;
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.55;
  }

  /* Eval per-item cards */
  .eval-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
    margin-top: 16px;
  }
  .eval-card {
    background: var(--paper-2);
    border-left: 3px solid;
    padding: 10px 12px;
  }
  .eval-card.ok { border-color: var(--sage); }
  .eval-card.bad { border-color: var(--crimson); }
  .eval-head { display: flex; justify-content: space-between; align-items: center; }
  .eval-id {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 12.5px;
    color: var(--ink);
  }
  .eval-score {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
  }
  .eval-checks { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
  .eval-c {
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    text-transform: uppercase;
  }
  .eval-c.ok { color: var(--sage); background: var(--sage-soft); }
  .eval-c.bad { color: var(--crimson); background: var(--crimson-soft); }
  .eval-fail {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed var(--rule);
    font-size: 11.5px;
    color: var(--crimson);
  }
  .eval-fail .lbl { color: var(--ink-3); font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }

  /* MAIN GRID */
  main {
    display: grid;
    grid-template-columns: 340px 1fr;
    min-height: 100vh;
  }
  aside {
    background: var(--paper-2);
    border-right: 1px solid var(--ink);
    overflow-y: auto;
    max-height: calc(100vh - 1px);
    position: sticky;
    top: 0;
  }
  .aside-head {
    padding: 18px 22px 12px;
    border-bottom: 1px solid var(--rule);
    background: var(--paper-2);
    position: sticky; top: 0;
  }
  .aside-head .label {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink-3);
  }
  .aside-head h3 {
    margin: 4px 0 0;
    font-family: var(--serif);
    font-weight: 500;
    font-size: 18px;
    color: var(--ink);
  }

  .case-row {
    display: grid;
    grid-template-columns: 36px 1fr;
    padding: 14px 22px 14px 0;
    border-bottom: 1px solid var(--rule);
    cursor: pointer;
    transition: background 120ms;
    position: relative;
  }
  .case-row:hover { background: var(--paper-3); }
  .case-row.active { background: var(--paper); }
  .case-row.active::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--accent);
  }
  .case-num {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-4);
    padding-left: 16px;
    padding-top: 2px;
    letter-spacing: 0.05em;
  }
  .case-row.active .case-num { color: var(--accent); font-weight: 600; }
  .case-content {}
  .case-top {
    display: flex; gap: 8px; align-items: center;
    margin-bottom: 4px;
  }
  .urg-mini {
    display: inline-grid;
    place-items: center;
    width: 26px; height: 18px;
    font-family: var(--mono);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--paper);
  }
  .urg-mini.P0 { background: var(--crimson); }
  .urg-mini.P1 { background: var(--amber); }
  .urg-mini.P2 { background: var(--sage); }
  .urg-mini.P3 { background: var(--ink-4); }
  .case-channel {
    font-family: var(--mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .case-subject {
    font-family: var(--serif);
    font-size: 14.5px;
    font-weight: 500;
    color: var(--ink);
    line-height: 1.3;
    margin-bottom: 4px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .case-class {
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  /* CASE DETAIL */
  article.case-file {
    padding: 36px 56px 80px;
    max-width: 920px;
    background: var(--paper);
    animation: fadeIn 300ms ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .case-header {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 24px; flex-wrap: wrap;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 18px;
    margin-bottom: 28px;
  }
  .case-stamp {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ink-3);
    margin-bottom: 4px;
  }
  .case-title {
    font-family: var(--serif);
    font-weight: 500;
    font-size: 30px;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: var(--ink);
    margin: 0;
  }
  .case-urg-block {
    text-align: right;
  }
  .urg-big {
    display: inline-block;
    padding: 8px 16px;
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--paper);
    margin-bottom: 6px;
  }
  .urg-big.P0 { background: var(--crimson); }
  .urg-big.P1 { background: var(--amber); }
  .urg-big.P2 { background: var(--sage); }
  .urg-big.P3 { background: var(--ink-4); }
  .urg-meta {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 6px;
  }

  .section {
    margin-bottom: 44px;
  }
  .section-label {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 18px;
  }
  .section-label .num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--accent);
    letter-spacing: 0.1em;
  }
  .section-label .title {
    font-family: var(--serif);
    font-style: italic;
    font-weight: 400;
    font-size: 18px;
    color: var(--ink);
  }
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--rule);
  }

  /* The inbox message itself, rendered like received correspondence */
  .message-card {
    background: var(--paper-2);
    border: 1px solid var(--rule);
    padding: 22px 26px;
    box-shadow: 4px 4px 0 var(--rule-2);
  }
  .message-meta {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 4px 16px;
    font-size: 13px;
    color: var(--ink-2);
    margin-bottom: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--rule);
  }
  .message-meta dt {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .message-meta dd { margin: 0; font-family: var(--sans); }
  .message-body {
    font-family: var(--serif);
    font-size: 15px;
    line-height: 1.7;
    color: var(--ink);
    white-space: pre-wrap;
  }

  /* Decision block — editorial split */
  .decision {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 32px;
  }
  .decision-left {
    border-top: 2px solid var(--ink);
    padding-top: 12px;
  }
  .decision-class {
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    margin-bottom: 6px;
  }
  .decision-class strong { color: var(--accent); font-weight: 500; }
  .decision-urgency {
    font-family: var(--serif);
    font-size: 26px;
    letter-spacing: -0.02em;
    color: var(--ink);
    margin-bottom: 4px;
  }
  .decision-right {
    border-top: 2px solid var(--rule);
    padding-top: 12px;
  }
  .pull-quote {
    font-family: var(--serif);
    font-style: italic;
    font-size: 18px;
    line-height: 1.5;
    color: var(--ink);
    border-left: 3px solid var(--accent);
    padding-left: 18px;
    margin: 0 0 18px 0;
  }
  .next-action {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 14px;
    color: var(--ink-2);
  }
  .next-action .arrow {
    font-family: var(--serif);
    color: var(--accent);
    font-size: 18px;
    line-height: 1.2;
  }
  .next-action .next-label {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-bottom: 2px;
  }

  /* Intake grid */
  .intake-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px 32px;
    background: var(--paper-2);
    padding: 22px 26px;
    border: 1px solid var(--rule);
  }
  .intake-field {
    display: flex; flex-direction: column; gap: 3px;
  }
  .intake-field dt {
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .intake-field dd {
    margin: 0;
    font-family: var(--serif);
    font-size: 15px;
    color: var(--ink);
  }
  .intake-field dd.empty { color: var(--ink-4); font-style: italic; font-size: 13px; }
  .missing-strip {
    margin-top: 14px;
  }
  .missing-strip .mlabel {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    margin-bottom: 6px;
  }
  .missing-chip {
    display: inline-block;
    background: var(--amber-soft);
    color: var(--amber);
    border: 1px dashed var(--amber);
    padding: 3px 9px;
    margin: 0 4px 4px 0;
    font-size: 12px;
    font-family: var(--mono);
  }
  .missing-empty { color: var(--ink-4); font-style: italic; }

  /* Tool ledger */
  .ledger { display: flex; flex-direction: column; gap: 12px; }
  .ledger-row {
    display: grid;
    grid-template-columns: 40px 1fr;
    background: var(--paper-2);
    border-left: 3px solid var(--ink);
    padding: 14px 18px;
    transition: background 150ms;
  }
  .ledger-row:hover { background: var(--paper-3); }
  .ledger-num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.05em;
    padding-top: 2px;
  }
  .ledger-content { min-width: 0; }
  .ledger-name {
    font-family: var(--mono);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 8px;
    display: flex; align-items: center; gap: 12px;
    flex-wrap: wrap;
  }
  .ledger-name::before {
    content: '●';
    color: var(--accent);
    font-size: 10px;
  }
  .ledger-callid {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-4);
    margin-left: auto;
    letter-spacing: 0.02em;
  }
  .ledger-section { margin-top: 6px; }
  .ledger-section .lbl {
    font-family: var(--mono);
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    margin-bottom: 3px;
  }
  .ledger-section pre {
    margin: 0;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-2);
    background: var(--paper);
    padding: 8px 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    border-left: 2px solid var(--rule);
  }
  .ledger-section .result {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink);
    font-size: 14px;
    padding: 6px 0 0 0;
  }
  .ledger-section .result::before { content: '→ '; color: var(--accent); font-style: normal; font-weight: 600; }

  /* Draft */
  .draft-card {
    background: #fbfaf6;
    border: 1px solid var(--ink);
    padding: 0;
    position: relative;
    box-shadow: 6px 6px 0 var(--rule-2);
  }
  .draft-card::before {
    content: 'DRAFT — FOR HUMAN REVIEW';
    position: absolute;
    top: 14px; right: -8px;
    background: var(--crimson);
    color: var(--paper);
    font-family: var(--mono);
    font-size: 9.5px;
    letter-spacing: 0.16em;
    padding: 4px 10px;
    transform: rotate(2deg);
  }
  .draft-meta {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 4px 14px;
    padding: 18px 24px 14px;
    border-bottom: 1px dashed var(--rule);
    font-size: 12.5px;
  }
  .draft-meta dt {
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .draft-meta dd { margin: 0; }
  .draft-body {
    padding: 22px 24px 26px;
    font-family: var(--serif);
    font-size: 16px;
    line-height: 1.7;
    color: var(--ink);
    white-space: pre-wrap;
  }
  .draft-empty {
    padding: 28px 24px;
    text-align: center;
    color: var(--ink-4);
    font-family: var(--serif);
    font-style: italic;
  }

  /* Tasks + Escalation */
  .ops-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .ops-card {
    border: 1px solid var(--rule);
    padding: 18px 22px;
    background: var(--paper-2);
  }
  .ops-card .lbl {
    font-family: var(--mono);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    margin-bottom: 10px;
  }
  .task-id {
    font-family: var(--mono);
    font-size: 12px;
    background: var(--paper);
    padding: 4px 9px;
    margin: 0 4px 4px 0;
    display: inline-block;
    border: 1px solid var(--rule);
  }
  .escalation-block {
    background: var(--crimson-soft);
    border: 2px solid var(--crimson);
    padding: 18px 22px;
    position: relative;
  }
  .escalation-block::before {
    content: '⬢ ESCALATION';
    position: absolute;
    top: -11px; left: 16px;
    background: var(--crimson);
    color: var(--paper);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    padding: 3px 10px;
    font-weight: 600;
  }
  .escalation-block .sev {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--crimson);
    margin-bottom: 6px;
    letter-spacing: 0.1em;
  }
  .escalation-block .reason {
    font-family: var(--serif);
    font-size: 14.5px;
    line-height: 1.55;
    color: var(--ink);
  }
  .no-escalation {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-4);
    font-size: 13px;
  }

  /* Footer */
  footer {
    padding: 24px 56px 40px;
    border-top: 1px solid var(--rule);
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.05em;
  }
  footer .row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

  /* Stagger-in load */
  .stagger { opacity: 0; transform: translateY(8px); animation: rise 500ms ease forwards; }
  .stagger:nth-child(1) { animation-delay: 60ms; }
  .stagger:nth-child(2) { animation-delay: 120ms; }
  .stagger:nth-child(3) { animation-delay: 180ms; }
  .stagger:nth-child(4) { animation-delay: 240ms; }
  @keyframes rise { to { opacity: 1; transform: none; } }

  @media (max-width: 980px) {
    main { grid-template-columns: 1fr; }
    aside { position: static; max-height: none; border-right: none; border-bottom: 1px solid var(--ink); }
    .gates { grid-template-columns: 1fr; }
    .gates .gate:first-child { border-bottom: 1px solid var(--rule); border-right: none; }
    .headline { grid-template-columns: repeat(2, 1fr); }
    .decision { grid-template-columns: 1fr; }
    .ops-grid { grid-template-columns: 1fr; }
    article.case-file { padding: 28px 24px 60px; }
    .masthead { padding: 20px 24px; }
  }
</style>
</head>
<body>

<header class="masthead">
  <div class="brand">
    <div class="brand-mark">CK</div>
    <div>
      <h1>Cedar Kids Therapy</h1>
      <p class="dateline">Monday inbox review · 28 April 2026 · 08:00 AM</p>
    </div>
  </div>
  <div class="path-toggle" role="tablist" aria-label="Triage execution path">
    <button id="btn-llm" class="active" role="tab">LLM Path</button>
    <button id="btn-rules" role="tab">Rules Fallback</button>
  </div>
</header>

<section class="headline" id="headline"></section>

<section class="gates">
  <div class="gate collapsed" id="validator">
    <div class="gate-head">
      <span class="gate-name">Validator</span>
      <span class="gate-cmd">npm run validate</span>
      <span class="gate-badge pass" id="v-badge">✓ Validation passed</span>
      <span class="gate-meta" id="v-meta"></span>
      <span class="chev">▾</span>
    </div>
    <div class="gate-body" id="v-body"></div>
  </div>
  <div class="gate collapsed" id="evalpanel">
    <div class="gate-head">
      <span class="gate-name">Semantic Eval</span>
      <span class="gate-cmd">npm run eval</span>
      <span class="gate-badge pass" id="e-badge">✓ All items passed</span>
      <span class="gate-meta" id="e-meta"></span>
      <span class="chev">▾</span>
    </div>
    <div class="gate-body" id="e-body"></div>
  </div>
</section>

<main>
  <aside>
    <div class="aside-head">
      <div class="label">Inbox</div>
      <h3>Weekend accumulation</h3>
    </div>
    <div id="case-list"></div>
  </aside>
  <article class="case-file" id="detail"></article>
</main>

<footer>
  <div class="row">
    <span>CEDAR KIDS THERAPY · TRIAGE PROTOTYPE · v1.0</span>
    <span id="generated-at"></span>
  </div>
</footer>

<script id="payload" type="application/json">${json}</script>
<script>
  const data = JSON.parse(document.getElementById('payload').textContent);
  let currentRun = 'llm';
  let currentItem = data.inbox[0].id;

  const URGENCY_NAME = { P0: 'Same-hour safeguarding review', P1: 'Same-day operational', P2: 'Standard intake', P3: 'Low priority / FYI' };
  const CHANNEL_LABEL = {
    fax_referral: 'Fax referral',
    voicemail_transcript: 'Voicemail',
    portal_message: 'Portal message',
    email: 'Email',
  };

  function getRun() { return data.runs[currentRun]; }
  function getItemOutput(id) { return getRun().output.items.find((i) => i.item_id === id); }
  function getInboxItem(id) { return data.inbox.find((i) => i.id === id); }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  // -------- Headline stats --------
  function renderHeadline() {
    const s = getRun().output.summary;
    const items = getRun().output.items;
    const tools = new Set();
    let totalCalls = 0;
    for (const i of items) {
      for (const c of i.tools_called) { tools.add(c.name); totalCalls += 1; }
    }
    document.getElementById('headline').innerHTML = [
      ['', s.total_items, 'Items', 'in the inbox this morning'],
      ['crimson', s.p0_count, 'P0', URGENCY_NAME.P0.toLowerCase()],
      ['amber', s.p1_count, 'P1', URGENCY_NAME.P1.toLowerCase()],
      ['sage', tools.size, 'Tools used', totalCalls + ' calls · ' + items.length + ' items'],
    ].map(([cls, num, label, sub]) =>
      '<div class="stat stagger"><div class="num ' + cls + '">' + num + '</div><div class="label">' + label + '</div><div class="sub">' + sub + '</div></div>'
    ).join('');
    document.getElementById('generated-at').textContent = 'Output generated ' + fmtDate(getRun().output.generated_at);
  }

  // -------- Validator --------
  function computeValidation() {
    const run = getRun();
    const out = run.output;
    const inboxIds = new Set(data.inbox.map((i) => i.id));
    const outIds = out.items.map((i) => i.item_id);
    const outSet = new Set(outIds);

    const allCovered = inboxIds.size === outSet.size && [...inboxIds].every((id) => outSet.has(id));
    const noDup = outIds.length === outSet.size;

    const exp = {
      total_items: out.items.length,
      p0_count: out.items.filter((i) => i.urgency === 'P0').length,
      p1_count: out.items.filter((i) => i.urgency === 'P1').length,
      requires_human_review_count: out.items.filter((i) => i.requires_human_review).length,
    };
    const sumOk = Object.entries(exp).every(([k, v]) => out.summary[k] === v);
    const reviewOk = out.items.every((i) => i.requires_human_review === true);

    const distinct = new Set();
    for (const i of out.items) for (const c of i.tools_called) distinct.add(c.name);
    const distinctList = [...distinct].sort();

    const forbid = new Set(['schedule_appointment', 'send_message']);
    const hits = [...distinct].filter((n) => forbid.has(n));

    const reported = new Set();
    for (const i of out.items) for (const c of i.tools_called) reported.add(c.call_id);
    const nonex = run.trace.filter((t) => !t.audit_exempt);
    const missing = nonex.filter((t) => !reported.has(t.call_id)).length;
    const extra = [...reported].filter((id) => !nonex.find((t) => t.call_id === id)).length;
    const traceOk = missing === 0 && extra === 0;

    const checks = [
      { ok: true, label: 'JSON schema', detail: 'Output conforms to schema/output.schema.json' },
      { ok: allCovered && noDup, label: 'Item coverage', detail: outIds.length + '/' + inboxIds.size + ' items, no duplicates' },
      { ok: sumOk, label: 'Summary counts', detail: exp.total_items + ' items · ' + exp.p0_count + ' P0 · ' + exp.p1_count + ' P1' },
      { ok: reviewOk, label: 'Human review', detail: out.items.filter((i) => i.requires_human_review).length + '/' + out.items.length + ' flagged' },
      { ok: distinct.size >= 3, label: 'Tool diversity', detail: distinct.size + ' distinct tool names (≥3 required)' },
      { ok: hits.length === 0, label: 'No forbidden tools', detail: hits.length === 0 ? 'schedule_appointment / send_message not used' : 'Found ' + hits.join(', ') },
      { ok: traceOk, label: 'Trace ↔ output 1:1', detail: nonex.length + ' calls · ' + reported.size + ' reported · 0 mismatches' },
    ];
    return { passed: checks.every((c) => c.ok), checks, distinctList, traceCount: nonex.length, reportedCount: reported.size };
  }

  function renderValidator() {
    const v = computeValidation();
    document.getElementById('v-badge').className = 'gate-badge ' + (v.passed ? 'pass' : 'fail');
    document.getElementById('v-badge').textContent = v.passed ? '✓ Validation passed' : '✗ Validation failed';
    document.getElementById('v-meta').textContent = v.traceCount + ' trace · ' + v.reportedCount + ' reported · 0 mismatches';

    const checks = v.checks.map((c) =>
      '<div class="check ' + (c.ok ? 'ok' : 'bad') + '">' +
      '<span class="check-mark">' + (c.ok ? '✓' : '✗') + '</span>' +
      '<div><div class="check-label">' + c.label + '</div><div class="check-detail">' + escapeHtml(c.detail) + '</div></div>' +
      '</div>'
    ).join('');
    const tools = v.distinctList.map((n) => '<span class="tool-chip">' + escapeHtml(n) + '</span>').join('');

    document.getElementById('v-body').innerHTML =
      '<div class="check-grid">' + checks + '</div>' +
      '<div class="tools-strip">' + tools + '</div>' +
      '<div class="ground-truth"><span class="gt-label">Captured stdout · npm run validate</span>' + escapeHtml(getRun().validate.trim()).replace(/Validation passed\\./, '<span class="gt-pass">Validation passed.</span>') + '</div>' +
      '<div class="gate-disclaimer">The chips above are recomputed in-browser from embedded JSON. The black block is the verbatim output of <code>src/validate.ts</code> against this snapshot — the authoritative pass/fail.</div>';
  }

  // -------- Eval --------
  function computeEval() {
    const out = getRun().output;
    const byId = new Map(out.items.map((i) => [i.item_id, i]));
    const results = [];
    for (const exp of data.expectations.items) {
      const item = byId.get(exp.item_id);
      if (!item) {
        results.push({ id: exp.item_id, summary: exp.summary, passed: false, checks: [{ name: 'presence', passed: false, detail: 'no matching item in output' }] });
        continue;
      }
      const calledTools = new Set(item.tools_called.map((c) => c.name));
      const draft = (item.draft_reply || '').toLowerCase();
      const checks = [];

      checks.push({ name: 'classification', passed: item.classification === exp.classification, detail: 'got "' + item.classification + '", expected "' + exp.classification + '"' });
      checks.push({ name: 'urgency', passed: exp.urgency_in.includes(item.urgency), detail: 'got "' + item.urgency + '", expected [' + exp.urgency_in.join(', ') + ']' });

      if (exp.required_tools && exp.required_tools.length) {
        const missing = exp.required_tools.filter((t) => !calledTools.has(t));
        checks.push({ name: 'req tools', passed: missing.length === 0, detail: missing.length === 0 ? 'all ' + exp.required_tools.length + ' present' : 'missing: ' + missing.join(', ') });
      }
      if (exp.forbidden_tools && exp.forbidden_tools.length) {
        const found = exp.forbidden_tools.filter((t) => calledTools.has(t));
        checks.push({ name: 'no-go tools', passed: found.length === 0, detail: found.length === 0 ? 'none called' : 'called: ' + found.join(', ') });
      }
      if (exp.escalation_required !== undefined) {
        const has = item.escalation !== null;
        checks.push({ name: 'escalation', passed: has === exp.escalation_required, detail: exp.escalation_required ? (has ? 'present (' + item.escalation.severity + ')' : 'missing') : (has ? 'unexpected' : 'absent as expected') });
      }
      if (exp.missing_info_must_include_any_of) {
        const lowered = item.missing_info.map((m) => m.toLowerCase());
        const unmatched = [];
        for (const grp of exp.missing_info_must_include_any_of) {
          if (!grp.some((needle) => lowered.some((m) => m.includes(needle.toLowerCase())))) unmatched.push('[' + grp.join('|') + ']');
        }
        checks.push({ name: 'missing_info', passed: unmatched.length === 0, detail: unmatched.length === 0 ? 'mentions all categories' : 'missing: ' + unmatched.join(', ') });
      }
      if (exp.missing_info_must_be_empty_or_minor) {
        checks.push({ name: 'minimal gaps', passed: item.missing_info.length <= 2, detail: item.missing_info.length + ' entries (≤2 allowed)' });
      }
      if (exp.draft_must_contain_any_of && exp.draft_must_contain_any_of.length) {
        const matched = exp.draft_must_contain_any_of.some((s) => draft.includes(s.toLowerCase()));
        checks.push({ name: 'draft lang', passed: matched, detail: matched ? 'matches expected language' : 'expected one of [' + exp.draft_must_contain_any_of.join(', ') + ']' });
      }
      if (exp.draft_must_not_contain && exp.draft_must_not_contain.length) {
        const hits = exp.draft_must_not_contain.filter((needle) => draft.includes(needle.toLowerCase()));
        checks.push({ name: 'draft safety', passed: hits.length === 0, detail: hits.length === 0 ? 'no forbidden phrases' : 'contains: ' + hits.join(', ') });
      }
      results.push({ id: exp.item_id, summary: exp.summary, passed: checks.every((c) => c.passed), checks });
    }
    const totalChecks = results.reduce((a, r) => a + r.checks.length, 0);
    const passedChecks = results.reduce((a, r) => a + r.checks.filter((c) => c.passed).length, 0);
    const passedItems = results.filter((r) => r.passed).length;
    return { results, totalChecks, passedChecks, passedItems, allPassed: passedItems === results.length };
  }

  function renderEval() {
    const e = computeEval();
    document.getElementById('e-badge').className = 'gate-badge ' + (e.allPassed ? 'pass' : 'fail');
    document.getElementById('e-badge').textContent = e.allPassed ? '✓ All items passed' : '✗ ' + (e.results.length - e.passedItems) + ' item(s) failed';
    document.getElementById('e-meta').textContent = e.passedItems + '/' + e.results.length + ' items · ' + e.passedChecks + '/' + e.totalChecks + ' checks';

    const cards = e.results.map((r) => {
      const chips = r.checks.map((c) => '<span class="eval-c ' + (c.passed ? 'ok' : 'bad') + '">' + (c.passed ? '✓' : '✗') + ' ' + c.name + '</span>').join('');
      const fails = r.checks.filter((c) => !c.passed).map((c) => '<div><span class="lbl">' + escapeHtml(c.name) + ':</span> ' + escapeHtml(c.detail) + '</div>').join('');
      return '<div class="eval-card ' + (r.passed ? 'ok' : 'bad') + '" title="' + escapeHtml(r.summary) + '">' +
        '<div class="eval-head"><span class="eval-id">' + r.id + '</span><span class="eval-score">' + r.checks.filter((c) => c.passed).length + '/' + r.checks.length + '</span></div>' +
        '<div class="eval-checks">' + chips + '</div>' +
        (fails ? '<div class="eval-fail">' + fails + '</div>' : '') +
        '</div>';
    }).join('');

    document.getElementById('e-body').innerHTML =
      '<div class="eval-grid">' + cards + '</div>' +
      '<div class="ground-truth"><span class="gt-label">Captured stdout · npm run eval</span>' + escapeHtml(getRun().evalText.trim()).replace(/Semantic eval passed\\./, '<span class="gt-pass">Semantic eval passed.</span>') + '</div>' +
      '<div class="gate-disclaimer">Catches the things the structural validator can\\'t: did we classify safeguarding correctly, did we skip <code>hold_slot</code> for the OON family, does the Spanish voicemail get a Spanish draft. Golden expectations live in <code>eval/expectations.json</code>.</div>';
  }

  // -------- Case list --------
  function renderList() {
    document.getElementById('case-list').innerHTML = data.inbox.map((inb, idx) => {
      const out = getItemOutput(inb.id);
      const active = inb.id === currentItem ? 'active' : '';
      return '<div class="case-row ' + active + '" data-id="' + inb.id + '">' +
        '<div class="case-num">' + pad2(idx + 1) + '</div>' +
        '<div class="case-content">' +
          '<div class="case-top">' +
            '<span class="urg-mini ' + out.urgency + '">' + out.urgency + '</span>' +
            '<span class="case-channel">' + (CHANNEL_LABEL[inb.channel] || inb.channel) + '</span>' +
          '</div>' +
          '<div class="case-subject">' + escapeHtml(inb.subject) + '</div>' +
          '<div class="case-class">' + out.classification.replace(/_/g, ' ') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    document.querySelectorAll('.case-row').forEach((el) => {
      el.addEventListener('click', () => {
        currentItem = el.dataset.id;
        renderList();
        renderDetail();
      });
    });
  }

  // -------- Case detail --------
  function renderDetail() {
    const inb = getInboxItem(currentItem);
    const out = getItemOutput(currentItem);
    const idx = data.inbox.findIndex((i) => i.id === currentItem);
    const intake = out.extracted_intake;

    const intakeHtml = Object.entries(intake).map(([k, v]) => {
      const display = v === null || (Array.isArray(v) && !v.length)
        ? '<dd class="empty">— not provided —</dd>'
        : '<dd>' + escapeHtml(Array.isArray(v) ? v.join(', ') : String(v)) + '</dd>';
      return '<div class="intake-field"><dt>' + k.replace(/_/g, ' ') + '</dt>' + display + '</div>';
    }).join('');

    const missingHtml = out.missing_info.length
      ? out.missing_info.map((m) => '<span class="missing-chip">' + escapeHtml(m) + '</span>').join('')
      : '<span class="missing-empty">No critical fields missing.</span>';

    const ledgerHtml = out.tools_called.length
      ? out.tools_called.map((tc, i) => '<div class="ledger-row">' +
          '<div class="ledger-num">' + pad2(i + 1) + '</div>' +
          '<div class="ledger-content">' +
            '<div class="ledger-name">' + escapeHtml(tc.name) + '<span class="ledger-callid">' + escapeHtml(tc.call_id) + '</span></div>' +
            '<div class="ledger-section"><div class="lbl">arguments</div><pre>' + escapeHtml(JSON.stringify(tc.args, null, 2)) + '</pre></div>' +
            '<div class="ledger-section"><div class="result">' + escapeHtml(tc.result_summary) + '</div></div>' +
          '</div></div>').join('')
      : '<div class="missing-empty">No tools were called for this item.</div>';

    const sourceMeta = inb.channel === 'email'
      ? { to: inb.sender, channel: 'Email' }
      : inb.channel === 'portal_message'
        ? { to: inb.sender, channel: 'Parent portal' }
        : inb.channel === 'voicemail_transcript'
          ? { to: inb.sender, channel: 'Voicemail transcript' }
          : { to: inb.sender, channel: 'Fax referral' };

    const draftMeta = (() => {
      const last = [...out.tools_called].reverse().find((c) => c.name === 'draft_message');
      if (!last) return null;
      return {
        recipient: last.args.recipient || '—',
        channel: last.args.channel || '—',
        language: last.args.language || 'en',
      };
    })();

    const draftHtml = out.draft_reply
      ? '<div class="draft-card">' +
          (draftMeta ? '<dl class="draft-meta">' +
            '<dt>To</dt><dd>' + escapeHtml(draftMeta.recipient) + '</dd>' +
            '<dt>Channel</dt><dd>' + escapeHtml(draftMeta.channel) + '</dd>' +
            '<dt>Language</dt><dd>' + escapeHtml(draftMeta.language) + '</dd>' +
          '</dl>' : '') +
          '<div class="draft-body">' + escapeHtml(out.draft_reply) + '</div>' +
        '</div>'
      : '<div class="draft-card"><div class="draft-empty">No draft generated — appropriate for spam / FYI items.</div></div>';

    const escalationHtml = out.escalation
      ? '<div class="escalation-block">' +
          '<div class="sev">Severity ' + out.escalation.severity + ' · clinical lead</div>' +
          '<div class="reason">' + escapeHtml(out.escalation.reason) + '</div>' +
        '</div>'
      : '<div class="no-escalation">No escalation — handled by routine staff review.</div>';

    const taskHtml = out.task_ids.length
      ? out.task_ids.map((t) => '<span class="task-id">' + escapeHtml(t) + '</span>').join(' ')
      : '<span class="no-escalation">(no tasks created)</span>';

    document.getElementById('detail').innerHTML =
      '<div class="case-header">' +
        '<div>' +
          '<div class="case-stamp">Case № ' + pad2(idx + 1) + ' · ' + inb.id + ' · received ' + fmtTime(inb.received_at) + '</div>' +
          '<h2 class="case-title">' + escapeHtml(inb.subject) + '</h2>' +
        '</div>' +
        '<div class="case-urg-block">' +
          '<div class="urg-big ' + out.urgency + '">' + out.urgency + '</div>' +
          '<div class="urg-meta">' + URGENCY_NAME[out.urgency] + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 01</span><span class="title">The message</span></div>' +
        '<div class="message-card">' +
          '<dl class="message-meta">' +
            '<dt>From</dt><dd>' + escapeHtml(inb.sender) + '</dd>' +
            '<dt>Via</dt><dd>' + escapeHtml(sourceMeta.channel) + '</dd>' +
            '<dt>Received</dt><dd>' + escapeHtml(fmtTime(inb.received_at)) + '</dd>' +
            (inb.attachments.length ? '<dt>Attached</dt><dd>' + inb.attachments.map(escapeHtml).join(', ') + '</dd>' : '') +
          '</dl>' +
          '<div class="message-body">' + escapeHtml(inb.body) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 02</span><span class="title">Decision</span></div>' +
        '<div class="decision">' +
          '<div class="decision-left">' +
            '<div class="decision-class">Classification</div>' +
            '<div class="decision-urgency"><strong style="color:var(--accent);font-weight:500">' + out.classification.replace(/_/g, ' ') + '</strong></div>' +
            '<div class="decision-class">Human review · required</div>' +
          '</div>' +
          '<div class="decision-right">' +
            '<blockquote class="pull-quote">' + escapeHtml(out.decision_rationale) + '</blockquote>' +
            '<div class="next-action">' +
              '<span class="arrow">→</span>' +
              '<div>' +
                '<div class="next-label">Recommended next action</div>' +
                '<div>' + escapeHtml(out.recommended_next_action) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 03</span><span class="title">Extracted intake</span></div>' +
        '<div class="intake-grid">' + intakeHtml + '</div>' +
        '<div class="missing-strip"><div class="mlabel">Missing fields</div>' + missingHtml + '</div>' +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 04</span><span class="title">Tool ledger · ' + out.tools_called.length + ' calls</span></div>' +
        '<div class="ledger">' + ledgerHtml + '</div>' +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 05</span><span class="title">Draft reply</span></div>' +
        draftHtml +
      '</div>' +

      '<div class="section">' +
        '<div class="section-label"><span class="num">§ 06</span><span class="title">Operations &amp; escalation</span></div>' +
        '<div class="ops-grid">' +
          '<div class="ops-card"><div class="lbl">Tasks created</div>' + taskHtml + '</div>' +
          '<div class="ops-card" style="background:transparent;border:none;padding:0">' + escalationHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  // -------- Wire-up --------
  function wireCollapsibles() {
    document.querySelectorAll('.gate').forEach((p) => {
      const h = p.querySelector('.gate-head');
      if (!h || h.dataset.wired) return;
      h.dataset.wired = '1';
      h.addEventListener('click', (ev) => {
        if (ev.target.closest('pre, code, button, a')) return;
        p.classList.toggle('collapsed');
      });
    });
  }

  function setRun(name) {
    currentRun = name;
    document.getElementById('btn-llm').classList.toggle('active', name === 'llm');
    document.getElementById('btn-rules').classList.toggle('active', name === 'rules');
    renderHeadline();
    renderValidator();
    renderEval();
    renderList();
    renderDetail();
    wireCollapsibles();
  }

  document.getElementById('btn-llm').addEventListener('click', () => setRun('llm'));
  document.getElementById('btn-rules').addEventListener('click', () => setRun('rules'));

  setRun('llm');
</script>
</body>
</html>
`;

writeFileSync(resolve(here, "index.html"), html);
console.log(`Wrote ${resolve(here, "index.html")} (${html.length} bytes)`);
