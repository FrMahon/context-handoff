const fs = require('node:fs');
const path = require('node:path');

// Read the end of the transcript; widen once if a huge pasted prompt hides the last assistant entry.
const WINDOWS = [256 * 1024, 8 * 1024 * 1024];

function lastUsage(fd, size, bytes) {
  const start = Math.max(0, size - bytes);
  const buf = Buffer.alloc(size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  const lines = buf.toString('utf8').split('\n');
  if (start > 0) lines.shift(); // first line is cut mid-way
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry.type !== 'assistant' || entry.isSidechain) continue;
    const u = entry.message && entry.message.usage;
    if (!u) continue;
    const total = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    if (total > 0) return total;
  }
  return null;
}

// Context size = tokens the model saw on its last turn, from the transcript's last assistant usage.
function getContextTokens(transcriptPath) {
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      for (const bytes of WINDOWS) {
        const found = lastUsage(fd, size, bytes);
        if (found !== null || bytes >= size) return found;
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

const DEFAULT_THRESHOLD = 150000;
const REMINDER_GAP = 50000;

function getThreshold(env) {
  const v = env && env.CONTEXT_HANDOFF_THRESHOLD;
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0; // "150k" or "1e5" must not parse as 150 or 1
  return n > 0 ? n : DEFAULT_THRESHOLD;
}

const ALERT = 'CONTEXT HANDOFF: the conversation context is large. Invoke the `context-handoff:context-handoff` skill NOW, before anything else. Tell the user in their own language that context is high and whether it is better to clear now or to finish what is in progress first.';
const REMINDER = 'CONTEXT HANDOFF REMINDER: context keeps growing. If the handoff was not done yet, invoke the `context-handoff:context-handoff` skill now; if it was done but the state changed since (work finished, new commits), refresh the memory and the resume prompt first; then remind the user briefly to run /clear.';

// stage: 0 = nothing sent, 1 = warned, 2 = reminded. Only a rise in stage produces a message.
function decide({ tokens, threshold, stage }) {
  if (tokens < threshold * 0.5) return { stage: 0, message: null };
  if (stage === 0 && tokens >= threshold) {
    return { stage: tokens >= threshold + REMINDER_GAP ? 2 : 1, message: ALERT };
  }
  if (stage === 1 && tokens >= threshold + REMINDER_GAP) return { stage: 2, message: REMINDER };
  return { stage, message: null };
}

function run(input, env, tmpDir) {
  try {
    if (!input || !input.session_id || !input.transcript_path) return null;
    const tokens = getContextTokens(input.transcript_path);
    if (tokens === null) return null;
    const marker = path.join(tmpDir, 'context-handoff-' + String(input.session_id).replace(/[^\w-]/g, '_'));
    let stage = 0;
    try { stage = Number.parseInt(fs.readFileSync(marker, 'utf8'), 10) || 0; } catch { /* no marker yet */ }
    const next = decide({ tokens, threshold: getThreshold(env), stage });
    if (next.stage !== stage) {
      if (next.stage === 0) fs.rmSync(marker, { force: true });
      else fs.writeFileSync(marker, String(next.stage));
    }
    if (!next.message) return null;
    return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: next.message } };
  } catch {
    return null;
  }
}

module.exports = { getContextTokens, getThreshold, decide, run };

function main() {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const out = run(input, process.env, require('node:os').tmpdir());
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* never break the session */ }
  process.exit(0);
}

if (require.main === module) main();
