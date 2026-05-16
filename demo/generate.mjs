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
  return { output, trace };
}

const llm = loadRun("llm");
const rules = loadRun("rules");

const data = { inbox, runs: { llm, rules } };
const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cedar Kids Therapy — Triage Demo</title>
<style>
  :root {
    --bg: #0f1419;
    --panel: #1a1f29;
    --panel-2: #232a36;
    --border: #2c3441;
    --text: #d6dde8;
    --muted: #8a94a6;
    --accent: #6aa6ff;
    --p0: #ff5c6a;
    --p1: #ffa45c;
    --p2: #6aa6ff;
    --p3: #8a94a6;
    --green: #6dd897;
    --warn: #ffd166;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }
  header { background: var(--panel); border-bottom: 1px solid var(--border); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  header .sub { color: var(--muted); font-size: 13px; }
  .toggle { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .toggle button { background: transparent; border: none; color: var(--muted); padding: 7px 14px; cursor: pointer; font: inherit; }
  .toggle button.active { background: var(--accent); color: #061021; font-weight: 600; }
  .summary { display: flex; gap: 14px; padding: 12px 20px; background: var(--panel-2); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 8px 14px; min-width: 110px; }
  .stat .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat .value { font-size: 22px; font-weight: 600; margin-top: 2px; }
  .stat.p0 .value { color: var(--p0); }
  .stat.p1 .value { color: var(--p1); }
  .stat.review .value { color: var(--green); }
  main { display: grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 130px); }
  aside { background: var(--panel); border-right: 1px solid var(--border); overflow-y: auto; }
  aside h3 { margin: 0; padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); letter-spacing: 0.05em; }
  .item-row { padding: 11px 14px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 80ms; }
  .item-row:hover { background: var(--panel-2); }
  .item-row.active { background: var(--panel-2); border-left: 3px solid var(--accent); padding-left: 11px; }
  .item-row .row-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .item-row .row-id { font-family: ui-monospace, SF Mono, monospace; color: var(--muted); font-size: 12px; }
  .item-row .subj { margin-top: 4px; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item-row .meta { margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .chip.channel { background: var(--panel-2); color: var(--muted); border: 1px solid var(--border); }
  .chip.urg { color: #061021; font-weight: 600; }
  .chip.urg.P0 { background: var(--p0); }
  .chip.urg.P1 { background: var(--p1); }
  .chip.urg.P2 { background: var(--p2); }
  .chip.urg.P3 { background: var(--p3); }
  .chip.cls { background: var(--panel-2); color: var(--accent); border: 1px solid var(--border); }
  section.content { padding: 20px 24px; overflow-y: auto; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; margin-bottom: 16px; }
  .panel h2 { margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; font-weight: 600; }
  .kv { display: grid; grid-template-columns: 170px 1fr; gap: 4px 16px; font-size: 13px; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; }
  .kv dd.empty { color: var(--muted); font-style: italic; }
  .body-text { background: var(--bg); border-radius: 6px; padding: 12px 14px; font-family: ui-monospace, SF Mono, monospace; font-size: 12.5px; white-space: pre-wrap; word-wrap: break-word; color: #cfd6e2; border: 1px solid var(--border); }
  .draft { background: var(--bg); border-radius: 6px; padding: 12px 14px; border-left: 3px solid var(--green); font-size: 13.5px; white-space: pre-wrap; }
  .draft.null { border-left-color: var(--muted); color: var(--muted); font-style: italic; }
  .tool-call { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
  .tool-call .tc-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--panel-2); border-bottom: 1px solid var(--border); }
  .tool-call .tc-name { font-family: ui-monospace, SF Mono, monospace; font-weight: 600; color: var(--accent); }
  .tool-call .tc-id { font-family: ui-monospace, SF Mono, monospace; font-size: 11px; color: var(--muted); }
  .tool-call .tc-body { padding: 10px 14px; }
  .tool-call .tc-section { margin-bottom: 8px; }
  .tool-call .tc-section:last-child { margin-bottom: 0; }
  .tool-call .tc-section .lbl { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  pre { margin: 0; font-family: ui-monospace, SF Mono, monospace; font-size: 12.5px; color: #cfd6e2; white-space: pre-wrap; }
  .rationale { font-style: italic; color: #b8c2d2; padding: 10px 14px; background: var(--bg); border-radius: 6px; border-left: 3px solid var(--warn); }
  .escalation { background: rgba(255, 92, 106, 0.1); border: 1px solid var(--p0); border-radius: 6px; padding: 10px 14px; color: var(--text); }
  .escalation .label { color: var(--p0); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .next { color: var(--green); font-weight: 500; }
  .task-id { font-family: ui-monospace, SF Mono, monospace; background: var(--panel-2); padding: 2px 6px; border-radius: 4px; font-size: 12px; color: var(--text); }
  .missing { display: inline-block; background: rgba(255, 209, 102, 0.15); color: var(--warn); padding: 2px 8px; border-radius: 4px; margin: 2px 4px 2px 0; font-size: 12px; }
  .row-spread { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; margin-top: 4px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Cedar Kids Therapy — Inbox Triage Demo</h1>
    <div class="sub">8 weekend inbox items processed by the hybrid agent</div>
  </div>
  <div class="toggle">
    <button id="btn-llm" class="active">LLM path (Anthropic)</button>
    <button id="btn-rules">Rules-only fallback</button>
  </div>
</header>

<div class="summary" id="summary"></div>

<main>
  <aside>
    <h3>Inbox items</h3>
    <div id="item-list"></div>
  </aside>
  <section class="content" id="detail"></section>
</main>

<script id="payload" type="application/json">${json}</script>
<script>
  const data = JSON.parse(document.getElementById('payload').textContent);
  let currentRun = 'llm';
  let currentItem = data.inbox[0].id;

  const $ = (id) => document.getElementById(id);

  function getRun() { return data.runs[currentRun]; }

  function getItemOutput(itemId) {
    return getRun().output.items.find((i) => i.item_id === itemId);
  }

  function getInboxItem(itemId) {
    return data.inbox.find((i) => i.id === itemId);
  }

  function renderSummary() {
    const s = getRun().output.summary;
    $('summary').innerHTML = \`
      <div class="stat"><div class="label">Total items</div><div class="value">\${s.total_items}</div></div>
      <div class="stat p0"><div class="label">P0 (safeguarding)</div><div class="value">\${s.p0_count}</div></div>
      <div class="stat p1"><div class="label">P1 (same-day)</div><div class="value">\${s.p1_count}</div></div>
      <div class="stat review"><div class="label">Needs review</div><div class="value">\${s.requires_human_review_count}</div></div>
      <div class="stat"><div class="label">Generated</div><div class="value" style="font-size:13px;font-weight:400;color:var(--muted);padding-top:8px">\${new Date(getRun().output.generated_at).toLocaleString()}</div></div>
    \`;
  }

  function renderList() {
    $('item-list').innerHTML = data.inbox.map((inb) => {
      const out = getItemOutput(inb.id);
      const active = inb.id === currentItem ? 'active' : '';
      return \`
        <div class="item-row \${active}" data-id="\${inb.id}">
          <div class="row-top">
            <span class="row-id">\${inb.id}</span>
            <span class="chip urg \${out.urgency}">\${out.urgency}</span>
          </div>
          <div class="subj">\${escapeHtml(inb.subject)}</div>
          <div class="meta">
            <span class="chip channel">\${inb.channel}</span>
            <span class="chip cls">\${out.classification}</span>
          </div>
        </div>
      \`;
    }).join('');
    document.querySelectorAll('.item-row').forEach((el) => {
      el.addEventListener('click', () => {
        currentItem = el.dataset.id;
        renderList();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    const inb = getInboxItem(currentItem);
    const out = getItemOutput(currentItem);
    const intake = out.extracted_intake;

    const intakeHtml = Object.entries(intake).map(([k, v]) => {
      const display = v === null || (Array.isArray(v) && !v.length)
        ? '<dd class="empty">(none)</dd>'
        : \`<dd>\${escapeHtml(Array.isArray(v) ? v.join(', ') : String(v))}</dd>\`;
      return \`<dt>\${k.replace(/_/g, ' ')}</dt>\${display}\`;
    }).join('');

    const missingHtml = out.missing_info.length
      ? out.missing_info.map((m) => \`<span class="missing">\${escapeHtml(m)}</span>\`).join('')
      : '<span style="color:var(--muted);font-style:italic">(none)</span>';

    const toolsHtml = out.tools_called.length
      ? out.tools_called.map((tc) => \`
          <div class="tool-call">
            <div class="tc-head">
              <span class="tc-name">\${escapeHtml(tc.name)}</span>
              <span class="tc-id">\${escapeHtml(tc.call_id)}</span>
            </div>
            <div class="tc-body">
              <div class="tc-section">
                <div class="lbl">args</div>
                <pre>\${escapeHtml(JSON.stringify(tc.args, null, 2))}</pre>
              </div>
              <div class="tc-section">
                <div class="lbl">result</div>
                <pre>\${escapeHtml(tc.result_summary)}</pre>
              </div>
            </div>
          </div>
        \`).join('')
      : '<div style="color:var(--muted);font-style:italic">No tools were called for this item.</div>';

    const escalationHtml = out.escalation
      ? \`<div class="escalation"><div class="label">Escalation • \${out.escalation.severity}</div><div style="margin-top:4px">\${escapeHtml(out.escalation.reason)}</div></div>\`
      : '<span style="color:var(--muted);font-style:italic">(no escalation)</span>';

    const taskIds = out.task_ids.length
      ? out.task_ids.map((t) => \`<span class="task-id">\${escapeHtml(t)}</span>\`).join(' ')
      : '<span style="color:var(--muted);font-style:italic">(none)</span>';

    const draftHtml = out.draft_reply
      ? \`<div class="draft">\${escapeHtml(out.draft_reply)}</div>\`
      : '<div class="draft null">(no draft — appropriate for spam / FYI)</div>';

    $('detail').innerHTML = \`
      <div class="panel">
        <h2>Inbox item • \${inb.id}</h2>
        <dl class="kv">
          <dt>channel</dt><dd>\${inb.channel}</dd>
          <dt>received at</dt><dd>\${inb.received_at}</dd>
          <dt>sender</dt><dd>\${escapeHtml(inb.sender)}</dd>
          <dt>subject</dt><dd>\${escapeHtml(inb.subject)}</dd>
          <dt>attachments</dt><dd>\${inb.attachments.length ? inb.attachments.map(escapeHtml).join(', ') : '<span style="color:var(--muted)">(none)</span>'}</dd>
        </dl>
        <div style="margin-top:14px">
          <div class="lbl" style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">body</div>
          <div class="body-text">\${escapeHtml(inb.body)}</div>
        </div>
      </div>

      <div class="panel">
        <h2>Decision</h2>
        <div class="row-spread">
          <div><strong>Classification:</strong> <span class="chip cls">\${out.classification}</span></div>
          <div><strong>Urgency:</strong> <span class="chip urg \${out.urgency}">\${out.urgency}</span></div>
          <div><strong>Human review:</strong> \${out.requires_human_review ? 'required' : 'no'}</div>
        </div>
        <div style="margin-top:14px" class="rationale">\${escapeHtml(out.decision_rationale)}</div>
        <div style="margin-top:14px"><strong class="next">Next action:</strong> \${escapeHtml(out.recommended_next_action)}</div>
      </div>

      <div class="panel">
        <h2>Extracted intake</h2>
        <dl class="kv">\${intakeHtml}</dl>
        <div style="margin-top:14px">
          <div class="lbl" style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">missing info</div>
          \${missingHtml}
        </div>
      </div>

      <div class="panel">
        <h2>Tools called (\${out.tools_called.length})</h2>
        \${toolsHtml}
      </div>

      <div class="panel">
        <h2>Draft reply</h2>
        \${draftHtml}
      </div>

      <div class="panel">
        <h2>Tasks &amp; escalation</h2>
        <div><strong>Task IDs:</strong> \${taskIds}</div>
        <div style="margin-top:10px"><strong>Escalation:</strong> \${escalationHtml}</div>
      </div>
    \`;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setRun(name) {
    currentRun = name;
    document.getElementById('btn-llm').classList.toggle('active', name === 'llm');
    document.getElementById('btn-rules').classList.toggle('active', name === 'rules');
    renderSummary();
    renderList();
    renderDetail();
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
