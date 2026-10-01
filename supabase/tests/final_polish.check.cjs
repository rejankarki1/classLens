/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../migrations/20260930030000_discard_processing_job.sql'),
  'utf8',
);

assert.match(sql, /security definer/);
assert.match(sql, /caller uuid := auth\.uid\(\)/);
assert.match(sql, /owner_id = caller/);
assert.match(sql, /job\.stage = 'completed'/);
assert.match(sql, /stage = 'terminal_failed'/);
assert.match(sql, /last_error_code = 'USER_DISCARDED'/);
assert.match(sql, /runner_token = null/);
assert.match(sql, /lease_expires_at = null/);
assert.match(sql, /next_attempt_at = null/);
assert.match(sql, /delete from public\.inbox_events/);
assert.match(sql, /delete from public\.captures/);
assert.match(sql, /delete from public\.capture_analyses/);
assert.doesNotMatch(sql, /disable trigger/i);
assert.match(sql, /grant execute[\s\S]*to authenticated/);

console.log('PASS: discard RPC is owner-scoped, trigger-compatible, terminal, non-reclaimable, and cleans dependent data.');
