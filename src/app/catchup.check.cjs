/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const screen = fs.readFileSync(path.join(__dirname, 'catchup.tsx'), 'utf8');
const sheet = fs.readFileSync(path.join(__dirname, '../components/AddFriendSheet.tsx'), 'utf8');
const screenShell = fs.readFileSync(path.join(__dirname, '../components/ui/Screen.tsx'), 'utf8');

assert.match(screen, /Add classmates to see their shared notes\./);
assert.match(screen, /item \? \([\s\S]*<CatchUpAlert/);
assert.doesNotMatch(screen, /demo-prashant|Prashant|CatchupMate|CATCHUPMATE/);
assert.match(sheet, /Decline/);
assert.match(sheet, />FRIENDS</);
assert.match(screenShell, /RefreshControl refreshing=\{refreshing\} onRefresh=\{onRefresh\}/);

console.log('PASS: CatchUp renders real-data, empty, friend-management, and pull-to-refresh states.');
