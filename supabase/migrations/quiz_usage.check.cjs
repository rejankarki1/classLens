/* global __dirname */
// Integration check against a disposable local PostgreSQL cluster. Requires
// initdb, pg_ctl, and psql; never connects to the linked Supabase project.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const root = fs.mkdtempSync(path.join('/private/tmp', 'classlens-quota-'));
const data = path.join(root, 'data');
const owner = '11111111-1111-4111-8111-111111111111';
const psqlArgs = ['-h', root, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'];

function querySync(sql) {
  return execFileSync('psql', [...psqlArgs, '-c', sql], { encoding: 'utf8' }).trim();
}
async function query(sql) {
  const { stdout } = await exec('psql', [...psqlArgs, '-c', sql]);
  return stdout.trim();
}
const reserve = () => query(`select public.reserve_quiz_use('${owner}');`).then(JSON.parse);
const finish = (id, success) => query(`select public.finish_quiz_use('${id}', ${success});`).then(JSON.parse);
const counted = () => query("select count(*) from public.quiz_usage where owner_id = '" + owner + "' and ((status = 'completed' and completed_at > now() - interval '7 days') or (status = 'reserved' and created_at > now() - interval '2 minutes'));").then(Number);

(async () => {
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-A', 'trust', '--no-instructions'], { stdio: 'ignore' });
    execFileSync('pg_ctl', ['-D', data, '-o', `-c listen_addresses='' -k ${root}`, '-l', path.join(root, 'postgres.log'), 'start'], { stdio: 'ignore' });
    started = true;
    querySync(`create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create role anon; create role authenticated; create role service_role;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users(id) values ('${owner}');`);
    execFileSync('psql', [...psqlArgs, '-f', path.join(__dirname, '20260930040000_quiz_usage.sql')], { stdio: 'ignore' });

    assert.equal(querySync("select has_table_privilege('authenticated','public.quiz_usage','SELECT'), has_table_privilege('authenticated','public.quiz_usage','INSERT'), has_function_privilege('authenticated','public.reserve_quiz_use(uuid)','EXECUTE'), has_function_privilege('authenticated','public.finish_quiz_use(uuid,boolean)','EXECUTE'), has_function_privilege('service_role','public.reserve_quiz_use(uuid)','EXECUTE');"), 't|f|f|f|t');
    console.log('PASS: owner reads are granted; client writes and quota RPCs remain service-role-only.');

    const race = await Promise.all(Array.from({ length: 5 }, reserve));
    const granted = race.filter((item) => item.reservationId);
    assert.equal(granted.length, 3);
    assert.equal(race.filter((item) => !item.reservationId).length, 2);
    assert.equal(await counted(), 3);
    console.log('PASS: five concurrent reservations grant only three uses.');

    const first = granted[0].reservationId;
    assert.equal((await finish(first, true)).outcome, 'completed');
    assert.equal((await finish(first, true)).outcome, 'completed');
    assert.equal(await counted(), 3);
    assert.equal(querySync(`select count(*) from public.quiz_usage where id='${first}' and status='completed';`), '1');
    for (const item of granted.slice(1)) assert.equal((await finish(item.reservationId, false)).outcome, 'released');
    assert.equal((await finish(granted[1].reservationId, false)).outcome, 'released');
    assert.equal(await counted(), 1);
    console.log('PASS: duplicate completion and release return stored outcomes without another charge.');

    querySync('truncate public.quiz_usage;');
    const old = (await reserve()).reservationId;
    querySync(`update public.quiz_usage set created_at=now()-interval '3 minutes' where id='${old}';`);
    for (let index = 0; index < 3; index++) assert.ok((await reserve()).reservationId);
    assert.equal((await finish(old, true)).outcome, 'quota_reached');
    assert.equal((await finish(old, true)).outcome, 'released');
    assert.equal(await counted(), 3);
    console.log('PASS: an expired reservation cannot complete over three newer uses.');

    querySync('truncate public.quiz_usage;');
    assert.ok((await reserve()).reservationId);
    assert.ok((await reserve()).reservationId);
    const stale = (await reserve()).reservationId;
    querySync(`update public.quiz_usage set created_at=now()-interval '3 minutes' where id='${stale}';`);
    const [finishResult, reserveResult] = await Promise.all([finish(stale, true), reserve()]);
    assert.ok(finishResult.outcome === 'completed' || finishResult.outcome === 'quota_reached');
    assert.equal(Boolean(reserveResult.reservationId), finishResult.outcome === 'quota_reached');
    assert.equal(await counted(), 3);
    console.log('PASS: concurrent reserve and finish share the owner lock and preserve the limit.');
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, 'stop'], { stdio: 'ignore' });
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
