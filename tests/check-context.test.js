const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getContextTokens, getThreshold, decide, run } = require('../hooks/check-context.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
const asst = (i, c, r, extra = {}) => JSON.stringify({
  type: 'assistant',
  message: { usage: { input_tokens: i, cache_creation_input_tokens: c, cache_read_input_tokens: r } },
  ...extra,
});
const write = (lines) => {
  const f = path.join(tmp(), 't.jsonl');
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
};

test('sums three usage fields of last assistant message', () => {
  const f = write([asst(1, 1, 1), asst(10, 20, 30)]);
  assert.strictEqual(getContextTokens(f), 60);
});

test('skips sidechain messages', () => {
  const f = write([asst(10, 20, 30), asst(500, 500, 500, { isSidechain: true })]);
  assert.strictEqual(getContextTokens(f), 60);
});

test('skips assistant message with all-zero usage and uses previous', () => {
  const f = write([asst(10, 20, 30), asst(0, 0, 0)]);
  assert.strictEqual(getContextTokens(f), 60);
});

test('returns null for missing file', () => {
  assert.strictEqual(getContextTokens(path.join(tmp(), 'nope.jsonl')), null);
});

test('returns null for empty file', () => {
  assert.strictEqual(getContextTokens(write([''])), null);
});

test('reads only the tail of a large file', () => {
  const filler = JSON.stringify({ type: 'user', text: 'x'.repeat(1000) });
  const f = path.join(tmp(), 'big.jsonl');
  const fd = fs.openSync(f, 'w');
  for (let i = 0; i < 5000; i++) fs.writeSync(fd, filler + '\n');
  fs.writeSync(fd, asst(7, 8, 9) + '\n');
  fs.closeSync(fd);
  assert.ok(fs.statSync(f).size > 4 * 1024 * 1024);
  assert.strictEqual(getContextTokens(f), 24);
});

test('getThreshold falls back to 150000 on invalid values', () => {
  for (const v of ['abc', '-5', '0', '', undefined]) {
    assert.strictEqual(getThreshold({ CONTEXT_HANDOFF_THRESHOLD: v }), 150000);
  }
  assert.strictEqual(getThreshold({}), 150000);
});

test('getThreshold reads a valid integer', () => {
  assert.strictEqual(getThreshold({ CONTEXT_HANDOFF_THRESHOLD: '1000' }), 1000);
});

test('decide: below threshold stays silent', () => {
  assert.deepStrictEqual(decide({ tokens: 100000, threshold: 150000, stage: 0 }), { stage: 0, message: null });
});

test('decide: crossing threshold warns once at stage 1', () => {
  const r = decide({ tokens: 151000, threshold: 150000, stage: 0 });
  assert.strictEqual(r.stage, 1);
  assert.match(r.message, /context-handoff/);
});

test('decide: already warned and still above threshold is silent', () => {
  assert.deepStrictEqual(decide({ tokens: 160000, threshold: 150000, stage: 1 }), { stage: 1, message: null });
});

test('decide: threshold+50000 after stage 1 sends a reminder at stage 2', () => {
  const r = decide({ tokens: 200000, threshold: 150000, stage: 1 });
  assert.strictEqual(r.stage, 2);
  assert.match(r.message, /context-handoff/);
});

test('decide: first sight above threshold+50000 sends the full warning and jumps to stage 2', () => {
  const r = decide({ tokens: 210000, threshold: 150000, stage: 0 });
  assert.strictEqual(r.stage, 2);
  assert.match(r.message, /context-handoff/);
});

test('decide: tokens below half the threshold rearm to stage 0', () => {
  assert.deepStrictEqual(decide({ tokens: 40000, threshold: 150000, stage: 2 }), { stage: 0, message: null });
});

const ENV = { CONTEXT_HANDOFF_THRESHOLD: '100' };
const markers = (d) => fs.readdirSync(d).filter((n) => n.startsWith('context-handoff-'));

test('run: first call over threshold returns output and writes marker', () => {
  const dir = tmp();
  const out = run({ session_id: 's1', transcript_path: write([asst(100, 0, 0)]) }, ENV, dir);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(out.hookSpecificOutput.additionalContext, /context-handoff/);
  assert.strictEqual(markers(dir).length, 1);
});

test('run: second call returns null', () => {
  const dir = tmp();
  const input = { session_id: 's1', transcript_path: write([asst(100, 0, 0)]) };
  run(input, ENV, dir);
  assert.strictEqual(run(input, ENV, dir), null);
});

test('run: missing session_id returns null', () => {
  assert.strictEqual(run({ transcript_path: write([asst(100, 0, 0)]) }, ENV, tmp()), null);
});

test('run: broken transcript returns null', () => {
  const f = write(['not json', '{']);
  assert.strictEqual(run({ session_id: 's1', transcript_path: f }, ENV, tmp()), null);
});

test('run: two sessions keep independent markers', () => {
  const dir = tmp();
  const t = write([asst(100, 0, 0)]);
  assert.ok(run({ session_id: 'a', transcript_path: t }, ENV, dir));
  assert.ok(run({ session_id: 'b', transcript_path: t }, ENV, dir));
  assert.strictEqual(markers(dir).length, 2);
});

test('run: context drop below half threshold rearms the warning', () => {
  const dir = tmp();
  const hi = write([asst(100, 0, 0)]);
  const lo = write([asst(10, 0, 0)]);
  assert.ok(run({ session_id: 's1', transcript_path: hi }, ENV, dir));
  assert.strictEqual(run({ session_id: 's1', transcript_path: lo }, ENV, dir), null);
  assert.ok(run({ session_id: 's1', transcript_path: hi }, ENV, dir));
});

test('run: session_id with path separators cannot escape tmpDir', () => {
  const dir = tmp();
  run({ session_id: '../../evil', transcript_path: write([asst(100, 0, 0)]) }, ENV, dir);
  assert.strictEqual(markers(dir).length, 1);
  assert.ok(!fs.existsSync(path.join(dir, '..', '..', 'evil')));
});
