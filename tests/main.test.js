const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'check-context.js');
const call = (input, extraEnv = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chm-'));
  return {
    dir,
    ...spawnSync(process.execPath, [HOOK], {
      input,
      encoding: 'utf8',
      env: { ...process.env, TEMP: dir, TMP: dir, TMPDIR: dir, ...extraEnv },
    }),
  };
};

test('empty stdin exits 0 with empty stdout', () => {
  const r = call('');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('broken JSON exits 0 with empty stdout', () => {
  const r = call('{nope');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('transcript over threshold prints UserPromptSubmit additionalContext', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chm-t-'));
  const t = path.join(dir, 't.jsonl');
  fs.writeFileSync(t, JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 500 } } }) + '\n');
  const r = call(JSON.stringify({ session_id: 's', transcript_path: t }), { CONTEXT_HANDOFF_THRESHOLD: '100' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});
