#!/usr/bin/env node
'use strict';

/**
 * End-to-end capture -> processing test, run from a machine, not the app.
 *
 * Exercises the exact same contract the phone uses -- same tables, same RLS
 * (signed in as a real user, never service-role), same Storage upload shape,
 * same Edge Function -- so it catches the kind of bug this session found
 * (wrong Content-Type on upload, worker queue starvation) without needing a
 * physical device.
 *
 * Usage:
 *   node scripts/e2e-capture-test.cjs [--image path/to/photo.jpg] [--timeout 180]
 *
 * Requires in .env.local (never printed by this script):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   TEST_USER_EMAIL
 *   TEST_USER_PASSWORD
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_IMAGE = path.join(REPO_ROOT, 'assets/demo/prashant-assembly-notes.jpeg');
const BUCKET = 'lecture-materials';

function loadEnvLocal() {
  const file = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function must(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return value.trim();
}

function parseArgs(argv) {
  const args = { image: DEFAULT_IMAGE, timeoutSec: 180 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--image' && argv[i + 1]) args.image = path.resolve(argv[++i]);
    else if (argv[i] === '--timeout' && argv[i + 1]) args.timeoutSec = Number(argv[++i]);
  }
  return args;
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Ported verbatim from src/services/materials.ts's uuidFromHash. */
function uuidFromHash(hash) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function elapsed(startMs) {
  return `${(Date.now() - startMs).toFixed(0)}ms`;
}

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = must('EXPO_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = must('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const testEmail = must('TEST_USER_EMAIL');
  const testPassword = must('TEST_USER_PASSWORD');

  if (!fs.existsSync(args.image)) throw new Error(`Test image not found: ${args.image}`);
  const imageBytes = fs.readFileSync(args.image);
  log(`test image: ${path.relative(REPO_ROOT, args.image)} (${imageBytes.length} bytes)`);

  const supabase = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });

  // --- Sign in -------------------------------------------------------------
  let t = Date.now();
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail, password: testPassword,
  });
  if (signInError || !signIn.session) {
    throw new Error(`Sign-in failed: ${signInError?.message ?? 'no session returned'}`);
  }
  const ownerId = signIn.session.user.id;
  const accessToken = signIn.session.access_token;
  log(`signed in as test user (${elapsed(t)})`);

  // --- Create the durable job, exactly like enqueuePhotoProcessingJob ------
  t = Date.now();
  const sessionId = `e2e-${Date.now()}`;
  const jobId = crypto.randomUUID();
  const { data: jobRow, error: jobError } = await supabase
    .from('processing_jobs')
    .insert({ id: jobId, capture_session_id: sessionId, media_type: 'photo', total_count: 1 })
    .select('id, stage')
    .single();
  if (jobError) throw new Error(`Job creation failed: ${jobError.message}`);
  log(`job created ${jobRow.id} stage=${jobRow.stage} (${elapsed(t)})`);

  // --- Claim it and move to 'uploading', exactly like runProcessingJob -----
  t = Date.now();
  const runnerToken = crypto.randomUUID();
  const { data: claimedRows, error: claimError } = await supabase.rpc('claim_processing_job', {
    p_job_id: jobId, p_runner_token: runnerToken,
  });
  if (claimError) throw new Error(`Claim failed: ${claimError.message}`);
  if (!claimedRows?.length) throw new Error('Claim returned no rows -- job was not claimable.');
  const { error: uploadingError } = await supabase
    .from('processing_jobs').update({ stage: 'uploading', updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('runner_token', runnerToken);
  if (uploadingError) throw new Error(`Could not move to uploading: ${uploadingError.message}`);
  log(`claimed and moved to uploading (${elapsed(t)})`);

  // --- Upload the photo, exactly like materials.ts's uploadCapture ---------
  t = Date.now();
  const clientPhotoId = crypto.randomUUID();
  const captureId = uuidFromHash(sha256Hex(`${ownerId}:${sessionId}:${clientPhotoId}`));
  const storagePath = `captures/${ownerId}/${captureId}/photo.jpg`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'x-upsert': 'false',
      'Content-Type': 'image/jpeg',
    },
    body: imageBytes,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(`Upload failed: HTTP ${uploadResponse.status} ${detail.slice(0, 300)}`);
  }
  log(`uploaded to Storage: ${storagePath} (${elapsed(t)})`);

  // --- Register the capture row, exactly like uploadCapture -----------------
  t = Date.now();
  const { error: captureError } = await supabase.from('captures').insert({
    id: captureId,
    capture_session_id: sessionId,
    client_photo_id: clientPhotoId,
    page_number: 1,
    storage_path: storagePath,
    mime_type: 'image/jpeg',
    captured_at: new Date().toISOString(),
    processing_job_id: jobId,
  });
  if (captureError) throw new Error(`Capture row insert failed: ${captureError.message}`);
  log(`capture row registered (${elapsed(t)})`);

  // --- Finish the upload phase, exactly like runProcessingJob's tail -------
  t = Date.now();
  const { error: uploadedError } = await supabase
    .from('processing_jobs')
    .update({ stage: 'uploaded', uploaded_count: 1, runner_token: null, lease_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('runner_token', runnerToken);
  if (uploadedError) throw new Error(`Could not move to uploaded: ${uploadedError.message}`);
  log(`job marked uploaded (${elapsed(t)})`);

  // --- Invoke and await this exact job ---------------------------------------
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutSec * 1000);
  let invokeResponse;
  try {
    invokeResponse = await fetch(`${supabaseUrl}/functions/v1/process-job`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const invokeBody = await invokeResponse.json().catch(() => null);
  log(`targeted worker returned HTTP ${invokeResponse.status} (${elapsed(start)})`);
  if (!invokeResponse.ok) {
    throw new Error(`Worker invocation failed: HTTP ${invokeResponse.status} ${JSON.stringify(invokeBody)}`);
  }
  if (invokeBody?.jobId !== jobId) {
    throw new Error(`Worker did not return the targeted job ${jobId}.`);
  }

  t = Date.now();
  const { data: finalJob, error: finalReadError } = await supabase
    .from('processing_jobs').select('*').eq('id', jobId).maybeSingle();
  if (finalReadError) throw new Error(`Final job read failed: ${finalReadError.message}`);
  if (!finalJob) throw new Error('Final job row disappeared.');
  log(`final job verified stage=${finalJob.stage} (${elapsed(t)})`);
  log(`worker + verification finished in ${elapsed(start)} total`);
  if (finalJob.stage === 'completed') {
    log(`RESULT: completed. lectureId=${finalJob.lecture_id}`);
  } else if (finalJob.stage === 'course_needed') {
    log(`RESULT: course_needed. suggestion=${finalJob.suggested_course_label} confidence=${finalJob.match_confidence} explanation=${finalJob.match_explanation}`);
  } else {
    log(`RESULT: ${finalJob.stage}. error_code=${finalJob.last_error_code} message=${finalJob.last_error_message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[e2e] FAILED: ${error.message}`);
  process.exitCode = 1;
});
