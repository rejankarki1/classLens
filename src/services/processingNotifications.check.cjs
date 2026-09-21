const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'processingNotifications.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
let claims = 0;
let schedules = 0;
let permissionGranted = true;
const notifications = {
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: permissionGranted, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ granted: true }),
  scheduleNotificationAsync: async () => { schedules += 1; return 'notification-id'; },
};
vm.runInNewContext(code, {
  exports: exportsObject,
  require: (name) => {
    if (name === 'expo-notifications') return notifications;
    if (name === './processingJobs') return { claimProcessingNotification: async () => ++claims === 1 };
    if (name === '@/types') return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

const job = { id: 'job', lectureId: 'lecture', stage: 'completed' };
(async () => {
  await exportsObject.notifyProcessingJob(job, 'completed');
  await exportsObject.notifyProcessingJob(job, 'completed');
  assert.equal(claims, 2);
  assert.equal(schedules, 1, 'notification event claim must deduplicate scheduling');
  permissionGranted = false;
  await exportsObject.notifyProcessingJob({ ...job, id: 'denied-job' }, 'failure');
  assert.equal(schedules, 1, 'denied permission must leave Home as the only recovery path');
  console.log('PASS: processing notification event deduplication.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
