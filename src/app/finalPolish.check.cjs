/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const inbox = fs.readFileSync(path.join(__dirname, 'inbox.tsx'), 'utf8');
const profile = fs.readFileSync(path.join(__dirname, 'profile.tsx'), 'utf8');
const home = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

assert.match(inbox, /Discard this capture\?/);
assert.match(inbox, /The photo and notes won't be saved\./);
assert.match(inbox, /discardProcessingJob\(job\.id\)/);
assert.doesNotMatch(inbox, /setDismissed/);

assert.match(profile, /getCurrentUserEmail/);
assert.match(profile, /Edit profile/);
assert.match(profile, /Notifications/);
assert.match(profile, /Help & feedback/);
assert.match(profile, /onRefresh/);
assert.doesNotMatch(profile, /UNIVERSITY|GRADUATION|Appearance/);
assert.match(home, /onProfileChange/);
assert.match(home, /profile\?\.year/);
assert.match(home, /profile\?\.major/);

console.log('PASS: Inbox confirms permanent discard and Profile exposes only working, refreshable actions.');
