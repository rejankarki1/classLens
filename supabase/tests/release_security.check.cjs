const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const migrations = path.resolve(__dirname, '../migrations');
const profile = fs.readFileSync(path.join(migrations, '20260930000000_harden_profile_writes.sql'), 'utf8');
const push = fs.readFileSync(path.join(migrations, '20260930010000_reassign_device_push_tokens.sql'), 'utf8');
const deletion = fs.readFileSync(path.join(migrations, '20260930020000_account_deletion.sql'), 'utf8');

assert.match(profile, /drop policy if exists "Demo clients can create a profile"/);
assert.match(profile, /drop policy if exists "Demo clients can update a profile"/);
assert.match(profile, /drop policy if exists "Demo clients can read profiles"/);
assert.match(profile, /revoke select on table public\.profiles from anon/);
assert.match(profile, /grant select on table public\.profiles to authenticated/);
assert.match(profile, /to authenticated\s+with check \(id = auth\.uid\(\)\)/);

assert.match(push, /security definer/);
assert.match(push, /caller uuid := auth\.uid\(\)/);
assert.match(push, /on conflict \(expo_push_token\) do update/);
assert.match(push, /grant execute.*to authenticated/);

assert.match(deletion, /security definer/);
assert.match(deletion, /revoke all.*authenticated/);
assert.match(deletion, /grant execute.*to service_role/);
assert.match(deletion, /delete from public\.quiz_missed_questions as missed[\s\S]*lecture\.owner_id = p_user_id/);
assert.match(deletion, /delete from public\.notebook_corrections as correction[\s\S]*lecture\.owner_id = p_user_id/);
assert.match(deletion, /delete from public\.quiz_attempts as attempt[\s\S]*lecture\.owner_id = p_user_id/);
assert.match(deletion, /delete from public\.materials as material[\s\S]*lecture\.owner_id = p_user_id/);
assert.match(deletion, /delete from public\.captures as capture[\s\S]*lecture\.owner_id = p_user_id/);
assert.match(deletion, /delete from public\.processing_jobs as job[\s\S]*lecture\.owner_id = p_user_id/);
assert.ok(deletion.indexOf('delete from public.captures') < deletion.indexOf('delete from public.processing_jobs'));
assert.ok(deletion.indexOf('delete from public.processing_jobs') < deletion.indexOf('delete from public.lectures'));

console.log('PASS: release security migrations authenticate profile reads, scope writes, constrain token reassignment, and delete cross-owner lecture references safely.');
